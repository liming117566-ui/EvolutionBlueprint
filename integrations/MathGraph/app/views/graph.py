"""知识图谱蓝图"""
import json
from flask import Blueprint, render_template, request, jsonify, abort
from app.services.graph_service import (
    get_graph_service, GRADE_INFO, TYPE_LABELS
)

graph_bp = Blueprint('graph', __name__)


@graph_bp.route('/')
def index():
    """知识图谱总览 — 选择年级"""
    gs = get_graph_service()
    grades = gs.get_grades()
    grade_list = []
    for g in grades:
        topics = gs.get_topics(g)
        domains = gs.get_domains(g)
        grade_list.append({
            'key': g,
            'name': gs.get_grade_name(g),
            'topic_count': len(topics),
            'domain_count': len(domains),
        })
    return render_template('graph/index.html', grades=grade_list)


@graph_bp.route('/view/<grade>')
def view_grade(grade):
    """某年级知识图谱可视化"""
    if grade not in GRADE_INFO:
        abort(404)
    gs = get_graph_service()
    topics = gs.get_topics(grade)
    deps = gs.get_dependencies(grade)
    clusters = gs.get_clusters(grade)
    return render_template(
        'graph/view.html',
        grade=grade,
        grade_name=gs.get_grade_name(grade),
        topics=topics,
        deps=deps,
        clusters=clusters,
    )


@graph_bp.route('/topic/<topic_id>')
def topic_detail(topic_id):
    """知识点详情页"""
    gs = get_graph_service()
    entry = gs.get_topic_with_grade(topic_id)
    if not entry:
        abort(404)
    topic, grade = entry
    prereqs = gs.get_prerequisites(topic_id)
    unlocks = gs.get_unlocks(topic_id)

    # 按领域分组的同级知识点
    domains = gs.get_domains(grade)

    return render_template(
        'graph/topic_detail.html',
        topic=topic,
        grade=grade,
        grade_name=gs.get_grade_name(grade),
        type_label=TYPE_LABELS.get(topic.get('type', ''), ''),
        prereqs=prereqs,
        unlocks=unlocks,
        domains=domains,
    )


@graph_bp.route('/search')
def search():
    """知识点搜索"""
    keyword = request.args.get('q', '').strip()
    grade = request.args.get('grade', '').strip() or None
    gs = get_graph_service()
    results = []
    if keyword:
        results = gs.search_topics(keyword, grade)
    return render_template(
        'graph/search.html',
        keyword=keyword,
        results=results,
    )


# ── API 端点（供前端JS调用） ──

@graph_bp.route('/api/<grade>/data')
def api_grade_data(grade):
    """返回某年级的图谱JSON数据（节点+边）"""
    if grade not in GRADE_INFO:
        return jsonify({'error': 'Unknown grade'}), 404
    gs = get_graph_service()
    topics = gs.get_topics(grade)
    deps = gs.get_dependencies(grade)

    nodes = []
    for t in topics:
        nodes.append({
            'id': t['id'],
            'label': t.get('name', t['id']),
            'domain': t.get('domain', ''),
            'type': t.get('type', ''),
            'centrality': t.get('centrality', 0),
            'group': t.get('domain', '其他'),
        })

    edges = []
    for dep in deps:
        edges.append({
            'from': dep['prerequisiteId'],
            'to': dep['topicId'],
            'strength': dep.get('strength', 'hard'),
        })

    return jsonify({
        'grade': grade,
        'grade_name': gs.get_grade_name(grade),
        'nodes': nodes,
        'edges': edges,
    })


@graph_bp.route('/api/topic/<topic_id>')
def api_topic_info(topic_id):
    """返回知识点详细信息"""
    gs = get_graph_service()
    topic = gs.get_topic(topic_id)
    if not topic:
        return jsonify({'error': 'Not found'}), 404
    entry = gs.get_topic_with_grade(topic_id)
    grade = entry[1] if entry else ''
    prereqs = gs.get_prerequisites(topic_id)
    unlocks = gs.get_unlocks(topic_id)

    return jsonify({
        'topic': topic,
        'grade': grade,
        'grade_name': gs.get_grade_name(grade) if grade else '',
        'type_label': TYPE_LABELS.get(topic.get('type', ''), ''),
        'prerequisites': [
            {
                'id': p['prerequisiteId'],
                'name': p['topic'].get('name', '') if p.get('topic') else '',
                'strength': p['strength'],
                'reason': p.get('reason', ''),
            }
            for p in prereqs
        ],
        'unlocks': [
            {
                'id': u['topicId'],
                'name': u['topic'].get('name', '') if u.get('topic') else '',
                'strength': u['strength'],
                'reason': u.get('reason', ''),
            }
            for u in unlocks
        ],
    })
