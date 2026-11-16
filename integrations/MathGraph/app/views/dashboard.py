"""仪表盘蓝图"""
import json
from collections import defaultdict
from flask import Blueprint, render_template, jsonify, request
from flask_login import login_required, current_user
from app.models import StudentMastery, WrongQuestion, PracticeSession, StudyLog, DiagnosisRecord
from app.services.graph_service import get_graph_service, GRADE_INFO

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/')
@login_required
def index():
    """学习仪表盘"""
    gs = get_graph_service()
    grade = request.args.get('grade', current_user.grade or '7-up')
    if grade not in GRADE_INFO:
        grade = current_user.grade or '7-up'
    topics = gs.get_topics(grade)
    total_topics_count = len(topics)

    # 掌握状态统计
    mastery_records = StudentMastery.query.filter_by(user_id=current_user.id).all()
    status_counts = {'mastered': 0, 'learning': 0, 'weak': 0, 'unseen': 0}
    for r in mastery_records:
        status_counts[r.status] = status_counts.get(r.status, 0) + 1
    status_counts['unseen'] = max(0, total_topics_count - sum(
        v for k, v in status_counts.items() if k != 'unseen'
    ))

    # 按领域统计掌握情况
    domain_stats = defaultdict(lambda: {'total': 0, 'mastered': 0, 'learning': 0, 'weak': 0})
    for t in topics:
        domain = t.get('domain', '其他')
        domain_stats[domain]['total'] += 1
    for r in mastery_records:
        topic = gs.get_topic(r.topic_id)
        if topic:
            domain = topic.get('domain', '其他')
            if domain in domain_stats:
                domain_stats[domain][r.status] = domain_stats[domain].get(r.status, 0) + 1

    domain_data = [
        {'domain': d, **stats}
        for d, stats in sorted(domain_stats.items())
    ]

    # 练习统计
    sessions = PracticeSession.query.filter_by(user_id=current_user.id).all()
    total_practice = len(sessions)
    total_correct = sum(s.score or 0 for s in sessions)
    total_questions = sum(s.total or 0 for s in sessions)
    avg_score = round(total_correct / total_questions * 100, 1) if total_questions > 0 else 0

    # 错题统计
    wrong_total = WrongQuestion.query.filter_by(user_id=current_user.id).count()
    wrong_conquered = WrongQuestion.query.filter_by(user_id=current_user.id, status='conquered').count()
    wrong_pending = wrong_total - wrong_conquered

    # 诊断统计
    diag_total = DiagnosisRecord.query.filter_by(user_id=current_user.id).count()

    # 最近学习活动
    recent_logs = StudyLog.query.filter_by(user_id=current_user.id) \
        .order_by(StudyLog.created_at.desc()).limit(15).all()

    # 所有年级列表（用于切换）
    all_grades = [
        {'key': g, 'name': info['name'], 'short': info['short']}
        for g, info in GRADE_INFO.items()
    ]

    return render_template(
        'dashboard/index.html',
        grade=grade,
        grade_name=gs.get_grade_name(grade),
        total_topics_count=total_topics_count,
        status_counts=status_counts,
        domain_data=domain_data,
        total_practice=total_practice,
        avg_score=avg_score,
        total_correct=total_correct,
        total_questions=total_questions,
        wrong_total=wrong_total,
        wrong_conquered=wrong_conquered,
        wrong_pending=wrong_pending,
        diag_total=diag_total,
        recent_logs=recent_logs,
        all_grades=all_grades,
    )


@dashboard_bp.route('/api/mastery_pie')
@login_required
def api_mastery_pie():
    """掌握状态饼图数据"""
    gs = get_graph_service()
    grade = current_user.grade or '7-up'
    topics = gs.get_topics(grade)
    total = len(topics)

    mastery_records = StudentMastery.query.filter_by(user_id=current_user.id).all()
    counts = {'mastered': 0, 'learning': 0, 'weak': 0}
    for r in mastery_records:
        counts[r.status] = counts.get(r.status, 0) + 1
    unseen = max(0, total - sum(counts.values()))

    return jsonify({
        'labels': ['已掌握', '学习中', '薄弱', '未开始'],
        'data': [counts['mastered'], counts['learning'], counts['weak'], unseen],
        'colors': ['#28a745', '#ffc107', '#dc3545', '#e9ecef'],
    })


@dashboard_bp.route('/api/domain_bar')
@login_required
def api_domain_bar():
    """领域掌握柱状图数据"""
    gs = get_graph_service()
    grade = current_user.grade or '7-up'
    topics = gs.get_topics(grade)

    domain_stats = defaultdict(lambda: {'total': 0, 'mastered': 0, 'learning': 0, 'weak': 0})
    for t in topics:
        domain = t.get('domain', '其他')
        domain_stats[domain]['total'] += 1

    mastery_records = StudentMastery.query.filter_by(user_id=current_user.id).all()
    for r in mastery_records:
        topic = gs.get_topic(r.topic_id)
        if topic:
            domain = topic.get('domain', '其他')
            if domain in domain_stats:
                domain_stats[domain][r.status] = domain_stats[domain].get(r.status, 0) + 1

    domains = sorted(domain_stats.keys())
    return jsonify({
        'labels': domains,
        'mastered': [domain_stats[d]['mastered'] for d in domains],
        'learning': [domain_stats[d]['learning'] for d in domains],
        'weak': [domain_stats[d]['weak'] for d in domains],
        'total': [domain_stats[d]['total'] for d in domains],
    })
