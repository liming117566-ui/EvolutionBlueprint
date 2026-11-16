"""错题诊断蓝图"""
import json
import os
import uuid
from flask import Blueprint, render_template, request, redirect, url_for, flash, current_app, send_from_directory, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import WrongQuestion, DiagnosisRecord, StudentMastery
from app.services.diagnosis_engine import DiagnosisEngine
from app.services.graph_service import get_graph_service, GRADE_INFO

diagnose_bp = Blueprint('diagnose', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@diagnose_bp.route('/uploads/<path:filename>')
@login_required
def uploaded_file(filename):
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)


@diagnose_bp.route('/')
@login_required
def index():
    """诊断首页 — 展示历史诊断记录 + 录入表单"""
    diagnoses = DiagnosisRecord.query.filter_by(user_id=current_user.id) \
        .order_by(DiagnosisRecord.created_at.desc()).limit(20).all()
    return render_template('diagnose/index.html', diagnoses=diagnoses)


@diagnose_bp.route('/new', methods=['GET', 'POST'])
@login_required
def new():
    """新建诊断"""
    gs = get_graph_service()
    grades = gs.get_grades()

    if request.method == 'POST':
        question = request.form.get('question', '').strip()
        wrong_answer = request.form.get('wrong_answer', '').strip()
        correct_answer = request.form.get('correct_answer', '').strip()
        error_type = request.form.get('error_type', '')
        grade = request.form.get('grade', '')

        if not question:
            flash('请输入题目内容', 'danger')
            return redirect(url_for('diagnose.new'))

        # 处理图片上传
        image_path = None
        image_file = request.files.get('image')
        if image_file and image_file.filename != '':
            if allowed_file(image_file.filename):
                ext = image_file.filename.rsplit('.', 1)[1].lower()
                filename = f"{uuid.uuid4().hex}.{ext}"
                upload_folder = current_app.config['UPLOAD_FOLDER']
                os.makedirs(upload_folder, exist_ok=True)
                filepath = os.path.join(upload_folder, filename)
                image_file.save(filepath)
                image_path = filename
            else:
                flash('图片格式不支持，请上传 PNG/JPG/GIF/WebP/BMP 格式', 'warning')

        # 获取学生掌握状态
        mastery_records = StudentMastery.query.filter_by(user_id=current_user.id).all()
        mastery_map = {r.topic_id: r.status for r in mastery_records}

        engine = DiagnosisEngine()
        result = engine.diagnose(
            question=question,
            wrong_answer=wrong_answer,
            correct_answer=correct_answer,
            error_type=error_type,
            grade=grade or None,
            user_mastery_map=mastery_map,
        )

        if not result.get('success'):
            flash('未能匹配到知识点，请尝试添加更多题目细节或选择年级', 'warning')
            return render_template('diagnose/new.html', grades=grades, result=result)

        # 保存错题
        wq = WrongQuestion(
            user_id=current_user.id,
            topic_id=result['target_topic']['id'],
            grade=result.get('target_grade', ''),
            question_text=question,
            wrong_answer=wrong_answer,
            correct_answer=correct_answer,
            error_type=error_type,
            error_analysis=result.get('error_analysis', ''),
            image_path=image_path,
        )
        db.session.add(wq)
        db.session.flush()

        # 保存诊断记录
        weak_chain = result.get('weak_chain', {})
        diag = DiagnosisRecord(
            user_id=current_user.id,
            wrong_question_id=wq.id,
            target_topic_id=result['target_topic']['id'],
            target_topic_name=result['target_topic'].get('name', ''),
            root_cause_id=weak_chain.get('root_cause_id', ''),
            root_cause_name=weak_chain.get('root_cause_name', ''),
            weak_chain=json.dumps(weak_chain.get('chain', []), ensure_ascii=False),
            suggestion=json.dumps(weak_chain.get('suggestion', []), ensure_ascii=False),
            estimated_time=weak_chain.get('estimated_time', ''),
        )
        db.session.add(diag)

        # 更新目标知识点状态为 weak
        mastery = StudentMastery.query.filter_by(
            user_id=current_user.id,
            topic_id=result['target_topic']['id'],
        ).first()
        if not mastery:
            mastery = StudentMastery(
                user_id=current_user.id,
                topic_id=result['target_topic']['id'],
                grade=result.get('target_grade', ''),
            )
            db.session.add(mastery)
        if mastery.status not in ('weak',):
            mastery.status = 'weak'
        mastery.total_count = (mastery.total_count or 0) + 1
        db.session.commit()

        return redirect(url_for('diagnose.result', diag_id=diag.id))

    return render_template('diagnose/new.html', grades=grades, grade_info=GRADE_INFO)


@diagnose_bp.route('/result/<int:diag_id>')
@login_required
def result(diag_id):
    """诊断结果详情"""
    diag = DiagnosisRecord.query.get_or_404(diag_id)
    if diag.user_id != current_user.id and not current_user.is_teacher:
        flash('无权查看', 'danger')
        return redirect(url_for('diagnose.index'))

    chain = json.loads(diag.weak_chain) if diag.weak_chain else []
    suggestion = json.loads(diag.suggestion) if diag.suggestion else []
    wq = diag.wrong_question  # 关联的错题记录
    gs = get_graph_service()

    return render_template(
        'diagnose/result.html',
        diag=diag,
        wq=wq,
        chain=chain,
        suggestion=suggestion,
    )


@diagnose_bp.route('/api/diagnose', methods=['POST'])
@login_required
def api_diagnose():
    """API 端点 — 实时诊断"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400

    mastery_records = StudentMastery.query.filter_by(user_id=current_user.id).all()
    mastery_map = {r.topic_id: r.status for r in mastery_records}

    engine = DiagnosisEngine()
    result = engine.diagnose(
        question=data.get('question', ''),
        wrong_answer=data.get('wrong_answer', ''),
        correct_answer=data.get('correct_answer', ''),
        error_type=data.get('error_type', ''),
        grade=data.get('grade'),
        user_mastery_map=mastery_map,
    )
    return jsonify(result)
