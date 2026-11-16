"""轻量级 CSRF 保护（基于 session，无外部依赖）

设计要点：
- 每个会话持有一个不可预测的 token（secrets.token_hex）。
- 对所有不安全方法（POST/PUT/PATCH/DELETE）校验 token；
  通过表单字段 `csrf_token` 或请求头 `X-CSRFToken` 提交。
- application/json 请求跳过校验：跨域 JSON 请求会触发 CORS 预检，
  服务端未配置 CORS，预检失败即阻止了跨站 JSON 提交，因此天然免受 CSRF。
- GET/HEAD/OPTIONS/TRACE 不改变状态，跳过校验。
- 使用 secrets.compare_digest 做常量时间比较，避免时序侧信道。
"""
import secrets
from flask import session, request, g, abort

SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS', 'TRACE'}


def generate_token():
    """生成一个不可预测的 CSRF token"""
    return secrets.token_hex(32)


def get_csrf_token():
    """读取或生成当前会话的 CSRF token（供模板与请求共用）"""
    token = session.get('csrf_token')
    if not token:
        token = generate_token()
        session['csrf_token'] = token
    return token


def init_csrf(app):
    """在应用上注册 CSRF 保护"""
    @app.before_request
    def _csrf_protect():
        # 确保每个请求都能取到 token（也供模板渲染使用）
        g.csrf_token = get_csrf_token()

        if not app.config.get('CSRF_ENABLED', True):
            return
        if request.method in SAFE_METHODS:
            return
        # application/json 跨站受 CORS 预检保护，跳过
        content_type = request.content_type or ''
        if content_type.startswith('application/json'):
            return

        sent = request.form.get('csrf_token') or request.headers.get('X-CSRFToken')
        expected = session.get('csrf_token')
        if not sent or not expected or not secrets.compare_digest(str(sent), str(expected)):
            abort(400, 'CSRF token missing or invalid')

    @app.context_processor
    def _inject_csrf():
        # 模板中通过 {{ csrf_token() }} 获取 token
        return {'csrf_token': get_csrf_token}
