"""MathGraph Flask 应用工厂"""
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

db = SQLAlchemy()
login_manager = LoginManager()


def create_app(config_name='default'):
    """创建Flask应用实例"""
    app = Flask(__name__)

    # 加载配置
    from app.config import config
    app.config.from_object(config[config_name])

    # 生产环境必须显式提供 SECRET_KEY，否则拒绝启动（防止使用可预测密钥导致会话伪造）
    if config_name == 'production' and not app.config.get('SECRET_KEY'):
        raise RuntimeError('生产环境必须通过环境变量 SECRET_KEY 提供密钥')

    # 初始化扩展
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = '请先登录'
    login_manager.login_message_category = 'warning'

    # CSRF 保护
    from app.utils.csrf import init_csrf
    init_csrf(app)

    # 用户加载
    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # 注册蓝图
    from app.views.auth import auth_bp
    from app.views.graph import graph_bp
    from app.views.diagnose import diagnose_bp
    from app.views.learn import learn_bp
    from app.views.practice import practice_bp
    from app.views.dashboard import dashboard_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(graph_bp, url_prefix='/graph')
    app.register_blueprint(diagnose_bp, url_prefix='/diagnose')
    app.register_blueprint(learn_bp, url_prefix='/learn')
    app.register_blueprint(practice_bp, url_prefix='/practice')
    app.register_blueprint(dashboard_bp, url_prefix='/dashboard')

    # 首页路由
    from app.views.main import main_bp
    app.register_blueprint(main_bp)

    # 创建数据库表
    with app.app_context():
        db.create_all()

    return app
