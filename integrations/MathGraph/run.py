"""MathGraph 启动入口"""
from app import create_app, db
from app.models import User

app = create_app('development')


@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'User': User}


def init_demo_data():
    """初始化演示数据（开发环境用）"""
    with app.app_context():
        if User.query.filter_by(username='teacher').first():
            return
        teacher = User(username='teacher', role='teacher', nickname='王老师', grade='7-up')
        teacher.set_password('123456')
        db.session.add(teacher)

        for i in range(1, 4):
            s = User(
                username=f'student{i}',
                role='student',
                nickname=f'同学{i}',
                grade='7-up'
            )
            s.set_password('123456')
            db.session.add(s)

        db.session.commit()
        print('演示数据已创建：teacher/123456, student1-3/123456')


if __name__ == '__main__':
    import os
    init_demo_data()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=app.config.get('DEBUG', False))
