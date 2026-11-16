"""练习系统蓝图"""
import json
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, abort
from flask_login import login_required, current_user
from app import db
from app.models import PracticeSession, StudentMastery, WrongQuestion, StudyLog
from app.services.quiz_generator import QuizGenerator
from app.services.graph_service import get_graph_service

practice_bp = Blueprint('practice', __name__)


@practice_bp.route('/')
@login_required
def index():
    """练习入口 — 选择知识点开始练习"""
    gs = get_graph_service()
    grade = request.args.get('grade', current_user.grade or '7-up')
    topics = gs.get_topics(grade)
    domains = gs.get_domains(grade)

    # 获取各知识点掌握状态
    mastery_map = {}
    records = StudentMastery.query.filter_by(user_id=current_user.id).all()
    for r in records:
        mastery_map[r.topic_id] = r

    return render_template(
        'practice/index.html',
        grade=grade,
        grade_name=gs.get_grade_name(grade),
        topics=topics,
        domains=domains,
        mastery_map=mastery_map,
    )


@practice_bp.route('/start/<topic_id>', methods=['GET', 'POST'])
@login_required
def start(topic_id):
    """开始练习"""
    gs = get_graph_service()
    entry = gs.get_topic_with_grade(topic_id)
    if not entry:
        abort(404)
    topic, grade = entry

    # 生成题目
    gen = QuizGenerator()
    quiz = gen.generate_quiz(topic_id, num_questions=4)

    if not quiz.get('success'):
        flash('生成题目失败', 'danger')
        return redirect(url_for('practice.index'))

    if request.method == 'POST':
        # 提交答案 → 判题
        answers = {}
        for q in quiz['questions']:
            qid = f'q_{q["index"]}'
            answer = request.form.get(qid, '').strip()
            answers[q['index']] = answer

        results = []
        correct_count = 0
        difficulty_reached = '夯基'

        for q in quiz['questions']:
            user_ans = answers.get(q['index'], '')
            result = gen.check_answer(q, user_ans)
            results.append({
                'index': q['index'],
                'difficulty': q['difficulty'],
                'question_text': q['question_text'],
                'reference_answer': q['reference_answer'],
                'user_answer': user_ans,
                'correct': result['correct'],
                'feedback': result['feedback'],
                'need_manual_check': result.get('need_manual_check', False),
                'hint': q.get('hint', ''),
                'common_mistake': q.get('common_mistake', ''),
            })
            if result['correct']:
                correct_count += 1
                if q['difficulty'] == '目标':
                    difficulty_reached = '目标'
                elif q['difficulty'] == '综合':
                    difficulty_reached = '综合'
                elif q['difficulty'] == '挑战':
                    difficulty_reached = '挑战'

        # 保存练习会话
        session = PracticeSession(
            user_id=current_user.id,
            topic_id=topic_id,
            topic_name=topic.get('name', ''),
            questions=json.dumps(quiz['questions'], ensure_ascii=False),
            answers=json.dumps(answers, ensure_ascii=False),
            results=json.dumps(results, ensure_ascii=False),
            score=correct_count,
            total=quiz['total'],
            difficulty_reached=difficulty_reached,
            completed_at=db.func.now(),
        )
        db.session.add(session)

        # 更新掌握状态
        mastery = StudentMastery.query.filter_by(
            user_id=current_user.id,
            topic_id=topic_id,
        ).first()
        if not mastery:
            mastery = StudentMastery(
                user_id=current_user.id,
                topic_id=topic_id,
                grade=grade,
            )
            db.session.add(mastery)
        mastery.total_count = (mastery.total_count or 0) + 1
        mastery.correct_count = (mastery.correct_count or 0) + correct_count
        mastery.last_practice_at = db.func.now()

        # 根据正确率升级状态
        accuracy = mastery.accuracy
        cur_status = mastery.status or 'unseen'
        if accuracy >= 80 and cur_status != 'weak':
            mastery.status = 'mastered'
            mastery.mastery_level = accuracy
        elif cur_status == 'unseen':
            mastery.status = 'learning'
            mastery.mastery_level = max(mastery.mastery_level or 0, accuracy // 2)
        elif mastery.mastery_level is None:
            mastery.mastery_level = accuracy // 2

        # 错题记录
        for r in results:
            if not r['correct'] and r['user_answer']:
                wq = WrongQuestion(
                    user_id=current_user.id,
                    topic_id=topic_id,
                    grade=grade,
                    question_text=r['question_text'],
                    wrong_answer=r['user_answer'],
                    correct_answer=r['reference_answer'],
                    error_type='方法不熟',
                )
                db.session.add(wq)

        # 学习日志
        log = StudyLog(
            user_id=current_user.id,
            activity_type='practice',
            topic_id=topic_id,
            topic_name=topic.get('name', ''),
            detail=json.dumps({
                'score': correct_count,
                'total': quiz['total'],
                'difficulty': difficulty_reached,
            }, ensure_ascii=False),
            duration=int(request.form.get('duration', 0)),
        )
        db.session.add(log)
        db.session.commit()

        return render_template(
            'practice/result.html',
            topic=topic,
            quiz=quiz,
            results=results,
            correct_count=correct_count,
            total=quiz['total'],
            session_id=session.id,
        )

    return render_template(
        'practice/start.html',
        topic=topic,
        grade=grade,
        grade_name=gs.get_grade_name(grade),
        quiz=quiz,
    )


@practice_bp.route('/history')
@login_required
def history():
    """练习历史"""
    sessions = PracticeSession.query.filter_by(user_id=current_user.id) \
        .order_by(PracticeSession.created_at.desc()).limit(50).all()
    return render_template('practice/history.html', sessions=sessions)


@practice_bp.route('/wrong_questions')
@login_required
def wrong_questions():
    """错题本"""
    page = request.args.get('page', 1, type=int)
    per_page = 10
    pagination = WrongQuestion.query.filter_by(user_id=current_user.id) \
        .order_by(WrongQuestion.created_at.desc()) \
        .paginate(page=page, per_page=per_page, error_out=False)
    wqs = pagination.items
    gs = get_graph_service()
    return render_template(
        'practice/wrong_questions.html',
        wqs=wqs,
        pagination=pagination,
        gs=gs,
    )


@practice_bp.route('/wrong_question/<int:wq_id>/conquer', methods=['POST'])
@login_required
def conquer_wrong_question(wq_id):
    """标记错题为已攻克"""
    wq = WrongQuestion.query.get_or_404(wq_id)
    if wq.user_id != current_user.id:
        return jsonify({'error': 'Forbidden'}), 403
    wq.status = 'conquered'
    wq.conquered_at = db.func.now()
    db.session.commit()
    flash('已标记为已攻克', 'success')
    return redirect(url_for('practice.wrong_questions'))
