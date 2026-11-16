"""学习路径蓝图"""
import json
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, abort
from flask_login import login_required, current_user
from app import db
from app.models import StudentMastery, LearningPath, StudyLog
from app.services.path_generator import PathGenerator
from app.services.graph_service import get_graph_service, GRADE_INFO

learn_bp = Blueprint('learn', __name__)


@learn_bp.route('/')
@login_required
def index():
    """学习路径列表"""
    paths = LearningPath.query.filter_by(user_id=current_user.id) \
        .order_by(LearningPath.updated_at.desc()).all()
    gs = get_graph_service()
    return render_template('learn/index.html', paths=paths, gs=gs)


@learn_bp.route('/create/<topic_id>', methods=['GET', 'POST'])
@login_required
def create(topic_id):
    """为目标知识点创建学习路径"""
    gs = get_graph_service()
    entry = gs.get_topic_with_grade(topic_id)
    if not entry:
        abort(404)
    topic, grade = entry

    # 获取学生已掌握的知识点
    mastered_records = StudentMastery.query.filter_by(
        user_id=current_user.id,
        status='mastered'
    ).all()
    mastered_ids = {r.topic_id for r in mastered_records}

    generator = PathGenerator()
    path_result = generator.generate_path(topic_id, mastered_ids)

    if request.method == 'POST':
        # 持久化保存学习路径
        lp = LearningPath(
            user_id=current_user.id,
            target_topic_id=topic_id,
            target_topic_name=topic.get('name', ''),
            path_data=json.dumps(path_result, ensure_ascii=False),
            total_steps=path_result['total_steps'],
        )
        db.session.add(lp)

        log = StudyLog(
            user_id=current_user.id,
            activity_type='learn',
            topic_id=topic_id,
            topic_name=topic.get('name', ''),
            detail=json.dumps({'action': 'create_path', 'steps': path_result['total_steps']}, ensure_ascii=False),
        )
        db.session.add(log)
        db.session.commit()
        flash(f'已生成「{topic.get("name", "")}」的学习路径', 'success')
        return redirect(url_for('learn.detail', path_id=lp.id))

    return render_template(
        'learn/create.html',
        topic=topic,
        grade=grade,
        grade_name=gs.get_grade_name(grade),
        path=path_result,
    )


@learn_bp.route('/detail/<int:path_id>')
@login_required
def detail(path_id):
    """学习路径详情"""
    lp = LearningPath.query.get_or_404(path_id)
    if lp.user_id != current_user.id and not current_user.is_teacher:
        flash('无权查看', 'danger')
        return redirect(url_for('learn.index'))

    path_data = json.loads(lp.path_data) if lp.path_data else {}
    gs = get_graph_service()

    # 获取每个知识点的最新掌握状态
    steps = path_data.get('steps', [])
    for step in steps:
        mastery = StudentMastery.query.filter_by(
            user_id=current_user.id,
            topic_id=step['topic_id'],
        ).first()
        step['current_status'] = mastery.status if mastery else 'unseen'
        step['accuracy'] = mastery.accuracy if mastery else 0

    progress = lp.current_position / lp.total_steps * 100 if lp.total_steps > 0 else 0

    return render_template(
        'learn/detail.html',
        lp=lp,
        path_data=path_data,
        steps=steps,
        progress=progress,
    )


@learn_bp.route('/progress/<int:path_id>/<int:step_index>', methods=['POST'])
@login_required
def update_progress(path_id, step_index):
    """更新路径进度"""
    lp = LearningPath.query.get_or_404(path_id)
    if lp.user_id != current_user.id:
        return jsonify({'error': 'Forbidden'}), 403

    action = request.form.get('action', 'mark_done')
    path_data = json.loads(lp.path_data) if lp.path_data else {}
    steps = path_data.get('steps', [])

    if step_index < 1 or step_index > len(steps):
        return jsonify({'error': 'Invalid step'}), 400

    step = steps[step_index - 1]
    topic_id = step['topic_id']

    if action == 'mark_done':
        mastery = StudentMastery.query.filter_by(
            user_id=current_user.id,
            topic_id=topic_id,
        ).first()
        if not mastery:
            mastery = StudentMastery(
                user_id=current_user.id,
                topic_id=topic_id,
                grade=step.get('grade', ''),
            )
            db.session.add(mastery)
        mastery.status = 'mastered'
        mastery.mastery_level = max(mastery.mastery_level or 0, 80)
        lp.current_position = max(lp.current_position, step_index)

        if lp.current_position >= lp.total_steps:
            lp.status = 'completed'

        log = StudyLog(
            user_id=current_user.id,
            activity_type='learn',
            topic_id=topic_id,
            topic_name=step.get('topic', {}).get('name', ''),
            detail=json.dumps({'action': 'mark_done', 'path_id': lp.id, 'step': step_index}, ensure_ascii=False),
        )
        db.session.add(log)
        db.session.commit()

        flash(f'已完成「{step.get("topic", {}).get("name", "")}」', 'success')

    return redirect(url_for('learn.detail', path_id=lp.id))
