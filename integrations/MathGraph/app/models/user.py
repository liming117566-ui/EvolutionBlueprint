"""用户模型"""
from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from app import db


class User(UserMixin, db.Model):
    """用户表"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='student')  # student/teacher/parent/admin
    nickname = db.Column(db.String(64))
    grade = db.Column(db.String(20))  # 7-up, 7-down, 8-up等
    school = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)

    # 关系
    mastery_records = db.relationship('StudentMastery', backref='student', lazy='dynamic')
    wrong_questions = db.relationship('WrongQuestion', backref='student', lazy='dynamic')
    diagnoses = db.relationship('DiagnosisRecord', backref='student', lazy='dynamic')
    practice_sessions = db.relationship('PracticeSession', backref='student', lazy='dynamic')
    learning_paths = db.relationship('LearningPath', backref='student', lazy='dynamic')
    study_logs = db.relationship('StudyLog', backref='student', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_teacher(self):
        return self.role == 'teacher'

    @property
    def is_student(self):
        return self.role == 'student'

    @property
    def display_name(self):
        return self.nickname or self.username

    def __repr__(self):
        return f'<User {self.username}>'


class Class(db.Model):
    """班级表"""
    __tablename__ = 'classes'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    invite_code = db.Column(db.String(10), unique=True, nullable=False)
    grade = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    teacher = db.relationship('User', backref='classes')
    students = db.relationship('ClassMembership', backref='class_info')


class ClassMembership(db.Model):
    """班级成员关联表"""
    __tablename__ = 'class_memberships'

    id = db.Column(db.Integer, primary_key=True)
    class_id = db.Column(db.Integer, db.ForeignKey('classes.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    __table_args__ = (db.UniqueConstraint('class_id', 'student_id'),)
