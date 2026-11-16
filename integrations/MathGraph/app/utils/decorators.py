"""权限装饰器"""
from functools import wraps
from flask import abort, flash, redirect, url_for
from flask_login import current_user


def role_required(*roles):
    """要求用户具有指定角色之一"""
    def decorator(f):
        @wraps(f)
        @login_required_wrapper
        def decorated_function(*args, **kwargs):
            if current_user.role not in roles:
                flash('权限不足', 'danger')
                return redirect(url_for('main.index'))
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def teacher_required(f):
    """要求教师角色"""
    return role_required('teacher', 'admin')(f)


def login_required_wrapper(f):
    """包装 flask-login 的 login_required，避免循环导入"""
    from flask_login import login_required
    return login_required(f)
