"""学习数据模型"""
from datetime import datetime
from app import db


class StudentMastery(db.Model):
    """学生知识点掌握状态"""
    __tablename__ = 'student_masteries'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    topic_id = db.Column(db.String(40), nullable=False, index=True)  # 如 mt_ch1_001
    grade = db.Column(db.String(10))  # 7-up等
    status = db.Column(db.String(20), default='unseen')  # unseen/learning/mastered/weak
    mastery_level = db.Column(db.Integer, default=0)  # 0-100
    correct_count = db.Column(db.Integer, default=0)
    total_count = db.Column(db.Integer, default=0)
    last_practice_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint('user_id', 'topic_id'),)

    @property
    def accuracy(self):
        if self.total_count == 0:
            return 0
        return round(self.correct_count / self.total_count * 100)

    def __repr__(self):
        return f'<Mastery {self.user_id}:{self.topic_id} {self.status}>'


class WrongQuestion(db.Model):
    """错题记录"""
    __tablename__ = 'wrong_questions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    topic_id = db.Column(db.String(40), nullable=False)
    grade = db.Column(db.String(10))
    question_text = db.Column(db.Text, nullable=False)
    wrong_answer = db.Column(db.Text)
    correct_answer = db.Column(db.Text)
    error_type = db.Column(db.String(30))  # 概念混淆/计算失误/方法不熟/审题偏差
    error_analysis = db.Column(db.Text)
    image_path = db.Column(db.String(255))  # 错题图片路径
    status = db.Column(db.String(20), default='learning')  # learning/conquered
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    conquered_at = db.Column(db.DateTime)


class DiagnosisRecord(db.Model):
    """诊断记录"""
    __tablename__ = 'diagnosis_records'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    wrong_question_id = db.Column(db.Integer, db.ForeignKey('wrong_questions.id'))
    target_topic_id = db.Column(db.String(40), nullable=False)  # 直接出错的知识点
    target_topic_name = db.Column(db.String(120))
    root_cause_id = db.Column(db.String(40))  # 根因知识点ID
    root_cause_name = db.Column(db.String(120))
    weak_chain = db.Column(db.Text)  # JSON格式的薄弱链
    suggestion = db.Column(db.Text)  # 建议补强顺序
    estimated_time = db.Column(db.String(60))  # 预估时间
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    wrong_question = db.relationship('WrongQuestion', backref='diagnoses')


class PracticeSession(db.Model):
    """练习会话"""
    __tablename__ = 'practice_sessions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    topic_id = db.Column(db.String(40), nullable=False)
    topic_name = db.Column(db.String(120))
    questions = db.Column(db.Text)  # JSON格式的题目列表
    answers = db.Column(db.Text)  # JSON格式的学生答案
    results = db.Column(db.Text)  # JSON格式的判题结果
    score = db.Column(db.Integer, default=0)  # 正确题数
    total = db.Column(db.Integer, default=0)
    difficulty_reached = db.Column(db.String(20))  # 达到的最高难度
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)


class LearningPath(db.Model):
    """学习路径"""
    __tablename__ = 'learning_paths'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    target_topic_id = db.Column(db.String(40), nullable=False)
    target_topic_name = db.Column(db.String(120))
    path_data = db.Column(db.Text)  # JSON格式的路径
    current_position = db.Column(db.Integer, default=0)  # 当前进度索引
    total_steps = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='active')  # active/completed/abandoned
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StudyLog(db.Model):
    """学习活动日志"""
    __tablename__ = 'study_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    activity_type = db.Column(db.String(30), nullable=False)  # learn/practice/diagnose/review
    topic_id = db.Column(db.String(40))
    topic_name = db.Column(db.String(120))
    detail = db.Column(db.Text)  # 详情JSON
    duration = db.Column(db.Integer, default=0)  # 时长(秒)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
