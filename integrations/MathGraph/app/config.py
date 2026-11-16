"""MathGraph 配置文件"""
import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)


class Config:
    """基础配置"""
    # SECRET_KEY 必须由环境变量提供；开发环境在 DevelopmentConfig 中给出仅用于本地的回退值。
    # 生产环境若未设置将在 create_app 中直接报错，避免使用可预测密钥导致会话伪造。
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        'sqlite:///' + os.path.join(PROJECT_DIR, 'mathgraph.db')
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # 知识图谱数据目录（项目根目录下的 data/）
    GRAPH_DATA_DIR = os.path.join(PROJECT_DIR, 'data')

    # 错题图片上传目录
    UPLOAD_FOLDER = os.path.join(PROJECT_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB

    # 分页
    PER_PAGE = 20

    # CSRF 保护开关（轻量级自实现，见 app/utils/csrf.py）
    CSRF_ENABLED = True

    # 会话 Cookie 安全设置（HTTPOnly 默认即为 True，显式声明更清晰）
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_ECHO = False
    # 开发环境允许回退到一个固定的本地密钥，避免每次启动都要设置环境变量；
    # 该值绝不可用于生产。
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-insecure-secret-CHANGE-ME'


class ProductionConfig(Config):
    DEBUG = False
    # 生产环境强制安全 Cookie（仅 HTTPS 传输）
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig,
}
