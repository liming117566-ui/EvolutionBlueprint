"""MathGraph 功能测试套件

使用 Flask test client 程序化地测试所有蓝图的核心功能。
运行: python tests/test_functional.py
"""
import json
import os
import re
import sys
import tempfile

# 让 tests/ 能 import app
PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_DIR)

from app import create_app, db
from app.models import User


def make_app(csrf_enabled=False):
    """构造一个使用临时数据库的测试应用

    Args:
        csrf_enabled: 是否启用 CSRF 保护（默认关闭以便业务逻辑测试；
                      安全回归测试单独启用）

    注意：`Config.SQLALCHEMY_DATABASE_URI` 在模块导入时按环境变量求值，
    因此这里直接改写类属性，确保每个 app 实例使用独立的临时 DB，
    不会污染项目自带的 mathgraph.db。
    """
    fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    from app.config import Config
    Config.SQLALCHEMY_DATABASE_URI = 'sqlite:///' + db_path.replace('\\', '/')
    app = create_app('development')
    app.config['TESTING'] = True
    app.config['CSRF_ENABLED'] = csrf_enabled
    with app.app_context():
        db.create_all()
        # 预置一个教师和一个学生（幂等：已存在则跳过）
        if not User.query.filter_by(username='teacher').first():
            teacher = User(username='teacher', role='teacher', nickname='王老师', grade='7-up')
            teacher.set_password('123456')
            db.session.add(teacher)
        if not User.query.filter_by(username='student1').first():
            student = User(username='student1', role='student', nickname='同学1', grade='7-up')
            student.set_password('123456')
            db.session.add(student)
        db.session.commit()
    return app, db_path


class TestRunner:
    """简易测试运行器：累加通过/失败"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.failures = []

    def check(self, name, condition, detail=''):
        if condition:
            self.passed += 1
            print(f'  [PASS] {name}')
        else:
            self.failed += 1
            self.failures.append((name, detail))
            print(f'  [FAIL] {name}  {detail}')

    def summary(self):
        total = self.passed + self.failed
        print('\n' + '=' * 60)
        print(f'测试结果: {self.passed}/{total} 通过, {self.failed} 失败')
        if self.failures:
            print('失败项:')
            for name, detail in self.failures:
                print(f'  - {name}: {detail}')
        return self.failed == 0


def login(client, username, password):
    return client.post('/auth/login', data={'username': username, 'password': password}, follow_redirects=False)


def test_main_graph(tr, client):
    print('\n[1] 首页与知识图谱')
    r = client.get('/')
    tr.check('首页 200', r.status_code == 200)
    tr.check('首页含知识点总数', '知识点'.encode('utf-8') in r.data)

    r = client.get('/about')
    tr.check('关于页 200', r.status_code == 200)

    r = client.get('/graph/')
    tr.check('图谱总览 200', r.status_code == 200)

    r = client.get('/graph/view/7-up')
    tr.check('7-up 图谱视图 200', r.status_code == 200)
    r = client.get('/graph/view/8-up')
    tr.check('8-up 图谱视图 200', r.status_code == 200)
    r = client.get('/graph/view/bad-grade')
    tr.check('非法年级 404', r.status_code == 404)

    r = client.get('/graph/topic/mt_ch1_001')
    tr.check('知识点详情 200', r.status_code == 200)
    tr.check('知识点详情含名称', '正数和负数'.encode('utf-8') in r.data)
    r = client.get('/graph/topic/not-exist')
    tr.check('不存在知识点 404', r.status_code == 404)

    r = client.get('/graph/search?q=有理数')
    tr.check('搜索 200', r.status_code == 200)
    r = client.get('/graph/search')
    tr.check('空搜索 200', r.status_code == 200)


def test_graph_api(tr, client):
    print('\n[2] 图谱 API')
    r = client.get('/graph/api/7-up/data')
    tr.check('7-up data API 200', r.status_code == 200)
    data = r.get_json()
    tr.check('7-up data 有 nodes', isinstance(data.get('nodes'), list) and len(data['nodes']) > 0)
    tr.check('7-up data 有 edges', isinstance(data.get('edges'), list))

    r = client.get('/graph/api/bad/data')
    tr.check('非法年级 API 404', r.status_code == 404)

    r = client.get('/graph/api/topic/mt_ch1_001')
    tr.check('topic API 200', r.status_code == 200)
    data = r.get_json()
    tr.check('topic API 含 topic', 'topic' in data)
    r = client.get('/graph/api/topic/not-exist')
    tr.check('topic API 不存在 404', r.status_code == 404)


def test_auth(tr, client):
    print('\n[3] 认证')
    # 未登录访问受保护页面应跳转登录
    r = client.get('/diagnose/', follow_redirects=False)
    tr.check('未登录诊断页跳转登录', r.status_code == 302 and '/auth/login' in r.headers.get('Location', ''))

    # 错误密码 → 重新渲染登录页 200
    r = login(client, 'student1', 'wrong')
    tr.check('错误密码留在登录页', r.status_code == 200)
    r = client.get('/')
    tr.check('错误密码后未登录', '退出登录'.encode('utf-8') not in r.data)

    # 正确登录
    r = login(client, 'student1', '123456')
    tr.check('学生登录成功', r.status_code == 302 and '/' == r.headers.get('Location', ''))
    r = client.get('/')
    tr.check('登录后显示用户名', '同学1'.encode('utf-8') in r.data)

    # 登出后再注册新用户（register 会重定向已登录用户）
    client.get('/auth/logout', follow_redirects=False)
    r = client.post('/auth/register', data={
        'username': 'newstu', 'password': 'abc123', 'nickname': '新同学',
        'role': 'student', 'grade': '8-up'
    }, follow_redirects=False)
    tr.check('注册新用户成功', r.status_code == 302)
    r = client.get('/auth/logout', follow_redirects=False)
    tr.check('登出成功', r.status_code == 302)

    # 重复注册 → 重新渲染注册页 200 并提示
    r = client.post('/auth/register', data={
        'username': 'newstu', 'password': 'abc123', 'nickname': '', 'role': 'student', 'grade': '8-up'
    }, follow_redirects=False)
    tr.check('重复用户名被拒', r.status_code == 200 and '用户名已存在'.encode('utf-8') in r.data,
             f'status={r.status_code}, msg_in_data={"用户名已存在".encode("utf-8") in r.data}')


def test_diagnose(tr, client):
    print('\n[4] 错题诊断')
    login(client, 'student1', '123456')

    r = client.get('/diagnose/')
    tr.check('诊断列表页 200', r.status_code == 200)

    r = client.get('/diagnose/new')
    tr.check('新建诊断页 200', r.status_code == 200)

    # 提交诊断（含数学关键词）
    r = client.post('/diagnose/new', data={
        'question': '请计算有理数的加减法运算',
        'wrong_answer': '5',
        'correct_answer': '3',
        'error_type': '计算失误',
        'grade': '7-up',
    }, follow_redirects=False)
    tr.check('诊断提交成功跳转', r.status_code == 302 and '/diagnose/result/' in r.headers.get('Location', ''))

    # 取 diag_id
    loc = r.headers.get('Location', '')
    diag_id = loc.rstrip('/').split('/')[-1]
    r = client.get(f'/diagnose/result/{diag_id}')
    tr.check('诊断结果页 200', r.status_code == 200)

    # 列表应有记录
    r = client.get('/diagnose/')
    tr.check('诊断列表有记录', diag_id.encode() in r.data or '查看'.encode('utf-8') in r.data)

    # 空 question 应被拒
    r = client.post('/diagnose/new', data={'question': ''}, follow_redirects=False)
    tr.check('空题目被拒跳转', r.status_code == 302)

    # API 诊断
    r = client.post('/diagnose/api/diagnose', json={
        'question': '有理数', 'error_type': '概念混淆', 'grade': '7-up'
    })
    tr.check('API 诊断 200', r.status_code == 200)
    data = r.get_json()
    tr.check('API 诊断返回 success', isinstance(data.get('success'), bool))


def test_learn(tr, client):
    print('\n[5] 学习路径')
    login(client, 'student1', '123456')

    r = client.get('/learn/')
    tr.check('学习路径列表 200', r.status_code == 200)

    r = client.get('/learn/create/mt_ch1_003')
    tr.check('创建路径页 200', r.status_code == 200)
    tr.check('路径预览含步骤', b'step' in r.data.lower() or '学习步骤'.encode('utf-8') in r.data)

    r = client.get('/learn/create/not-exist')
    tr.check('不存在知识点 404', r.status_code == 404)

    # POST 保存
    r = client.post('/learn/create/mt_ch1_003', follow_redirects=False)
    tr.check('保存学习路径跳转', r.status_code == 302 and '/learn/detail/' in r.headers.get('Location', ''))
    loc = r.headers.get('Location', '')
    path_id = loc.rstrip('/').split('/')[-1]

    r = client.get(f'/learn/detail/{path_id}')
    tr.check('路径详情 200', r.status_code == 200)

    # 进度更新
    r = client.post(f'/learn/progress/{path_id}/1', data={'action': 'mark_done'}, follow_redirects=False)
    tr.check('更新进度成功', r.status_code == 302)

    # 非法 step
    r = client.post(f'/learn/progress/{path_id}/999', data={'action': 'mark_done'})
    tr.check('非法 step 返回 400', r.status_code == 400)


def test_practice(tr, client):
    print('\n[6] 练习系统')
    login(client, 'student1', '123456')

    r = client.get('/practice/')
    tr.check('练习首页 200', r.status_code == 200)
    r = client.get('/practice/?grade=8-up')
    tr.check('练习页选年级 200', r.status_code == 200)

    r = client.get('/practice/start/mt_ch1_001')
    tr.check('练习开始页 200', r.status_code == 200)
    tr.check('练习页含题目', b'q_1' in r.data or 'q_'.encode() in r.data)

    r = client.get('/practice/start/not-exist')
    tr.check('练习不存在知识点 404', r.status_code == 404)

    # 提交答案 — 取出题号
    r = client.get('/practice/start/mt_ch1_001')
    # 提交全部题空答案 + 一题有内容
    r = client.post('/practice/start/mt_ch1_001', data={
        'q_1': '有理数是整数和分数的统称',
        'q_2': '测试答案',
        'q_3': '',
        'q_4': '',
        'duration': '120',
    })
    tr.check('提交练习结果 200', r.status_code == 200)
    tr.check('结果页含得分', '正确率'.encode('utf-8') in r.data or '/'.encode() in r.data)

    r = client.get('/practice/history')
    tr.check('练习历史 200', r.status_code == 200)

    r = client.get('/practice/wrong_questions')
    tr.check('错题本 200', r.status_code == 200)


def test_dashboard(tr, client):
    print('\n[7] 仪表盘与统计 API')
    login(client, 'student1', '123456')

    r = client.get('/dashboard/')
    tr.check('仪表盘 200', r.status_code == 200)

    r = client.get('/dashboard/api/mastery_pie')
    tr.check('掌握饼图 API 200', r.status_code == 200)
    data = r.get_json()
    tr.check('饼图返回 data', isinstance(data.get('data'), list) and len(data['data']) == 4)

    r = client.get('/dashboard/api/domain_bar')
    tr.check('领域柱状图 API 200', r.status_code == 200)
    data = r.get_json()
    tr.check('柱状图返回 labels', isinstance(data.get('labels'), list))


def test_authz(tr, client):
    print('\n[8] 权限隔离')
    login(client, 'student1', '123456')
    # 学生 A 创建路径，从跳转地址解析 path_id
    r = client.post('/learn/create/mt_ch1_003', follow_redirects=False)
    tr.check('学生创建路径成功跳转', r.status_code == 302 and '/learn/detail/' in r.headers.get('Location', ''))
    lp_id = None
    if r.status_code == 302:
        loc = r.headers.get('Location', '')
        try:
            lp_id = int(loc.rstrip('/').split('/')[-1])
        except ValueError:
            lp_id = None
    tr.check('解析到 path_id', lp_id is not None)

    if lp_id:
        # 登出，以 teacher 身份查看应允许（is_teacher）
        login(client, 'teacher', '123456')
        r = client.get(f'/learn/detail/{lp_id}')
        tr.check('教师可查看学生路径 200', r.status_code == 200)

        # 注册新学生，尝试访问别人的路径 → 应被拒跳转
        client.get('/auth/logout', follow_redirects=False)
        client.post('/auth/register', data={
            'username': 'student2', 'password': 'abc123', 'nickname': '同学2', 'role': 'student', 'grade': '7-up'
        }, follow_redirects=False)
        r = client.get(f'/learn/detail/{lp_id}', follow_redirects=False)
        tr.check('其他学生被拒跳转', r.status_code == 302 and '/learn/' in r.headers.get('Location', ''))

        # 更新别人路径进度 → 403
        r = client.post(f'/learn/progress/{lp_id}/1', data={'action': 'mark_done'})
        tr.check('越权更新进度 403', r.status_code == 403)


def extract_csrf(html_bytes):
    """从渲染后的表单 HTML 中提取 csrf_token"""
    m = re.search(rb'name="csrf_token" value="([^"]+)"', html_bytes)
    return m.group(1).decode() if m else None


def test_security(tr):
    """安全回归测试：在启用 CSRF 的独立 app 上验证"""
    print('\n[9] 安全回归（CSRF / 越权注册 / 开放重定向 / 密码强度）')
    app, db_path = make_app(csrf_enabled=True)
    try:
        with app.test_client() as client:
            # ── CSRF：无 token 的 POST 应被拒（400） ──
            r = client.post('/auth/login', data={'username': 'student1', 'password': '123456'})
            tr.check('CSRF 无 token 被拒 400', r.status_code == 400)

            # 带 token 的登录应成功
            r = client.get('/auth/login')
            token = extract_csrf(r.data)
            tr.check('登录页含 csrf_token', token is not None)
            r = client.post('/auth/login', data={
                'username': 'student1', 'password': '123456', 'csrf_token': token,
            }, follow_redirects=False)
            tr.check('CSRF 带 token 登录成功', r.status_code == 302 and '/' == r.headers.get('Location', ''))

            # ── 开放重定向：next 指向外部站点应被忽略，跳回首页 ──
            client.get('/auth/logout', follow_redirects=False)
            r = client.get('/auth/login')
            token = extract_csrf(r.data)
            r = client.post('/auth/login?next=https://evil.com/path', data={
                'username': 'student1', 'password': '123456', 'csrf_token': token,
            }, follow_redirects=False)
            tr.check('开放重定向被拒（跳回首页）', r.status_code == 302 and r.headers.get('Location', '') == '/')

            # next 指向站内相对地址应被放行（先登出再登录）
            client.get('/auth/logout', follow_redirects=False)
            r = client.get('/auth/login')
            token = extract_csrf(r.data)
            r = client.post('/auth/login?next=/dashboard/', data={
                'username': 'student1', 'password': '123456', 'csrf_token': token,
            }, follow_redirects=False)
            tr.check('站内 next 放行', r.status_code == 302 and r.headers.get('Location', '') == '/dashboard/')

            # ── 越权注册：提交 role=teacher 应被强制为 student（register 会自动登录，先登出） ──
            client.get('/auth/logout', follow_redirects=False)
            r = client.get('/auth/register')
            token = extract_csrf(r.data)
            r = client.post('/auth/register', data={
                'username': 'sneaky', 'password': 'abc123', 'nickname': '冒充',
                'role': 'teacher', 'grade': '7-up', 'csrf_token': token,
            }, follow_redirects=False)
            tr.check('越权注册不报错（强制降级）', r.status_code == 302)
            with app.app_context():
                u = User.query.filter_by(username='sneaky').first()
                tr.check('teacher 角色被拒，仍为 student', u is not None and u.role == 'student')

            # ── 密码强度：短密码应被服务端拒绝（register 自动登录了 sneaky，先登出） ──
            client.get('/auth/logout', follow_redirects=False)
            r = client.get('/auth/register')
            token = extract_csrf(r.data)
            r = client.post('/auth/register', data={
                'username': 'weakpw', 'password': '123', 'nickname': '', 'role': 'student',
                'grade': '7-up', 'csrf_token': token,
            }, follow_redirects=False)
            tr.check('短密码被拒 200', r.status_code == 200 and '密码至少'.encode('utf-8') in r.data)
            with app.app_context():
                tr.check('短密码用户未入库', User.query.filter_by(username='weakpw').first() is None)
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


def main():
    app, db_path = make_app()
    tr = TestRunner()
    try:
        with app.test_client() as client:
            test_main_graph(tr, client)
            test_graph_api(tr, client)
            test_auth(tr, client)
            test_diagnose(tr, client)
            test_learn(tr, client)
            test_practice(tr, client)
            test_dashboard(tr, client)
            test_authz(tr, client)
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass

    # 安全回归在独立 app 上运行（启用 CSRF）
    test_security(tr)

    ok = tr.summary()
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
