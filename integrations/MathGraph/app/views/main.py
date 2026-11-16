"""首页蓝图"""
from flask import Blueprint, render_template
from app.services.graph_service import get_graph_service

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
def index():
    """首页 — 展示平台概览和知识图谱统计"""
    gs = get_graph_service()
    stats = gs.get_stats()
    grades = gs.get_grades()
    grade_info = []
    for g in grades:
        grade_info.append({
            'key': g,
            'name': gs.get_grade_name(g),
            'stat': stats.get(g, {}),
        })
    return render_template('main/index.html', stats=stats, grades=grade_info)


@main_bp.route('/about')
def about():
    """关于页面"""
    return render_template('main/about.html')
