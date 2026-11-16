"""认证蓝图"""
from urllib.parse import urlsplit
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from app import db
from app.models import User
from app.services.graph_service import GRADE_INFO

auth_bp = Blueprint('auth', __name__)

# 自助注册允许的角色（教师/管理员等高权限角色由管理员另行创建）
SELF_REGISTER_ROLES = {'student'}
MIN_PASSWORD_LENGTH = 6


def is_safe_redirect_target(target):
    """判断跳转目标是否为安全的同站相对地址。

    仅允许以单个 ``/`` 开头的站内路径，拒绝：
    - 绝对 URL（含 scheme，如 https://evil.com、javascript:...）
    - 协议相对 URL（如 //evil.com）
    - 反斜杠变体（如 \\evil.com，部分浏览器会规范化为 //）
    - 相对路径片段（如 foo/bar）
    """
    if not target:
        return False
    if target.startswith('\\'):
        return False
    parsed = urlsplit(target)
    if parsed.scheme or parsed.netloc:
        return False
    return target.startswith('/') and not target.startswith('//')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            user.last_login = db.func.now()
            db.session.commit()
            flash(f'欢迎回来，{user.display_name}！', 'success')
            # 仅允许跳转到同站相对地址，防止开放重定向
            next_page = request.args.get('next')
            if next_page and is_safe_redirect_target(next_page):
                return redirect(next_page)
            return redirect(url_for('main.index'))
        flash('用户名或密码错误', 'danger')
    return render_template('auth/login.html')


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        nickname = request.form.get('nickname', '').strip()
        role = request.form.get('role', 'student')
        grade = request.form.get('grade', '7-up')

        # 安全：自助注册强制只能创建学生账号，忽略客户端提交的 teacher/admin 等高权限角色
        if role not in SELF_REGISTER_ROLES:
            role = 'student'

        # 服务端密码强度校验（不能仅依赖前端 minlength）
        if len(password) < MIN_PASSWORD_LENGTH:
            flash(f'密码至少 {MIN_PASSWORD_LENGTH} 个字符', 'danger')
            return render_template('auth/register.html', grades=GRADE_INFO)

        if User.query.filter_by(username=username).first():
            flash('用户名已存在', 'danger')
            return render_template('auth/register.html', grades=GRADE_INFO)
        user = User(
            username=username,
            role=role,
            nickname=nickname or username,
            grade=grade,
        )
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        login_user(user)
        flash(f'注册成功，欢迎加入数学图谱！', 'success')
        return redirect(url_for('main.index'))
    return render_template('auth/register.html', grades=GRADE_INFO)


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('已退出登录', 'info')
    return redirect(url_for('main.index'))
