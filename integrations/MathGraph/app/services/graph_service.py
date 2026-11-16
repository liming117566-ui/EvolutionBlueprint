"""知识图谱数据加载服务

从JSON文件加载知识点、依赖关系、聚类等数据，
提供统一的查询接口。
"""
import json
import os
from functools import lru_cache


GRADE_INFO = {
    '7-up':   {'name': '七年级上册', 'short': '7上'},
    '7-down': {'name': '七年级下册', 'short': '7下'},
    '8-up':   {'name': '八年级上册', 'short': '8上'},
    '8-down': {'name': '八年级下册', 'short': '8下'},
    '9-up':   {'name': '九年级上册', 'short': '9上'},
    '9-down': {'name': '九年级下册', 'short': '9下'},
}

ALL_GRADES = list(GRADE_INFO.keys())

TYPE_LABELS = {
    'CONCEPTUAL': '概念理解',
    'PROCEDURAL': '程序性计算',
    'REPRESENTATIONAL': '表征图示',
}


class GraphService:
    """知识图谱数据服务（单例）"""

    def __init__(self, data_dir):
        self.data_dir = data_dir
        self._topics_by_grade = {}      # {grade: [topic, ...]}
        self._topics_by_id = {}          # {topic_id: (topic, grade)}
        self._deps_by_grade = {}         # {grade: [dep, ...]}
        self._clusters_by_grade = {}     # {grade: [cluster, ...]}
        self._standards_by_grade = {}    # {grade: {...}}
        self._loaded = False

    def _load_all(self):
        """一次性加载所有年级数据"""
        if self._loaded:
            return

        for grade in ALL_GRADES:
            grade_dir = os.path.join(self.data_dir, grade)

            # 7-up 数据在 data/ 根目录（原始文件布局）
            if not os.path.isdir(grade_dir):
                if grade == '7-up':
                    grade_dir = self.data_dir
                else:
                    continue

            self._load_grade(grade, grade_dir)

        self._loaded = True

    def _load_grade(self, grade, grade_dir):
        """加载单个年级的数据文件"""
        # topics.json
        topics_path = os.path.join(grade_dir, 'topics.json')
        if os.path.exists(topics_path):
            with open(topics_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            topics = data.get('topics', [])
            self._topics_by_grade[grade] = topics
            for t in topics:
                self._topics_by_id[t['id']] = (t, grade)

        # dependencies.json
        deps_path = os.path.join(grade_dir, 'dependencies.json')
        if os.path.exists(deps_path):
            with open(deps_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self._deps_by_grade[grade] = data.get('dependencies', [])

        # clusters.json
        clusters_path = os.path.join(grade_dir, 'clusters.json')
        if os.path.exists(clusters_path):
            with open(clusters_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self._clusters_by_grade[grade] = data.get('clusters', [])

        # curriculum-standards.json
        std_path = os.path.join(grade_dir, 'curriculum-standards.json')
        if os.path.exists(std_path):
            with open(std_path, 'r', encoding='utf-8') as f:
                self._standards_by_grade[grade] = json.load(f)

    # ── 查询接口 ──

    def get_grades(self):
        """获取所有年级列表"""
        self._load_all()
        return ALL_GRADES

    def get_grade_name(self, grade):
        return GRADE_INFO.get(grade, {}).get('name', grade)

    def get_topics(self, grade):
        """获取某年级所有知识点"""
        self._load_all()
        return self._topics_by_grade.get(grade, [])

    def get_all_topics(self):
        """获取所有年级的所有知识点"""
        self._load_all()
        result = []
        for grade in ALL_GRADES:
            result.extend(self.get_topics(grade))
        return result

    def get_topic(self, topic_id):
        """按ID获取知识点"""
        self._load_all()
        entry = self._topics_by_id.get(topic_id)
        if entry:
            return entry[0]
        return None

    def get_topic_with_grade(self, topic_id):
        """按ID获取知识点及其年级"""
        self._load_all()
        return self._topics_by_id.get(topic_id)

    def get_dependencies(self, grade):
        """获取某年级的依赖关系"""
        self._load_all()
        return self._deps_by_grade.get(grade, [])

    def get_all_dependencies(self):
        """获取所有年级的依赖关系"""
        self._load_all()
        result = []
        for grade in ALL_GRADES:
            result.extend(self._deps_by_grade.get(grade, []))
        return result

    def get_clusters(self, grade):
        """获取某年级的领域聚类"""
        self._load_all()
        return self._clusters_by_grade.get(grade, [])

    def get_prerequisites(self, topic_id):
        """获取某知识点的直接前置依赖"""
        self._load_all()
        result = []
        for dep in self.get_all_dependencies():
            if dep['topicId'] == topic_id:
                prereq = self.get_topic(dep['prerequisiteId'])
                result.append({
                    'topic': prereq,
                    'strength': dep.get('strength', 'hard'),
                    'reason': dep.get('reason', ''),
                    'prerequisiteId': dep['prerequisiteId'],
                })
        return result

    def get_unlocks(self, topic_id):
        """获取某知识点解锁的后续知识点"""
        self._load_all()
        result = []
        for dep in self.get_all_dependencies():
            if dep['prerequisiteId'] == topic_id:
                unlocked = self.get_topic(dep['topicId'])
                if unlocked:
                    result.append({
                        'topic': unlocked,
                        'strength': dep.get('strength', 'hard'),
                        'reason': dep.get('reason', ''),
                        'topicId': dep['topicId'],
                    })
        return result

    def get_all_prerequisites_recursive(self, topic_id, visited=None):
        """递归获取所有前置依赖（含跨年级）"""
        if visited is None:
            visited = set()
        if topic_id in visited:
            return []
        visited.add(topic_id)

        result = []
        for dep in self.get_all_dependencies():
            if dep['topicId'] == topic_id and dep['prerequisiteId'] not in visited:
                prereq_id = dep['prerequisiteId']
                prereq = self.get_topic(prereq_id)
                if prereq:
                    result.append({
                        'topic': prereq,
                        'strength': dep.get('strength', 'hard'),
                        'reason': dep.get('reason', ''),
                    })
                    result.extend(self.get_all_prerequisites_recursive(prereq_id, visited))
        return result

    def get_domains(self, grade):
        """获取某年级按领域分组的知识点"""
        self._load_all()
        domains = {}
        for t in self.get_topics(grade):
            domain = t.get('domain', '其他')
            if domain not in domains:
                domains[domain] = []
            domains[domain].append(t)
        return domains

    def get_stats(self):
        """获取总体统计"""
        self._load_all()
        stats = {}
        total_topics = 0
        total_deps = 0
        for grade in ALL_GRADES:
            topics = self.get_topics(grade)
            deps = self.get_dependencies(grade)
            count = len(topics)
            total_topics += count
            total_deps += len(deps)
            stats[grade] = {
                'name': self.get_grade_name(grade),
                'topic_count': count,
                'dep_count': len(deps),
                'cluster_count': len(self._clusters_by_grade.get(grade, [])),
            }
        stats['total'] = {'topics': total_topics, 'deps': total_deps}
        return stats

    def search_topics(self, keyword, grade=None):
        """搜索知识点"""
        self._load_all()
        results = []
        grades = [grade] if grade else ALL_GRADES
        for g in grades:
            for t in self.get_topics(g):
                haystack = ' '.join([
                    t.get('name', ''),
                    t.get('description', ''),
                    t.get('domain', ''),
                    t.get('id', ''),
                ])
                if keyword.lower() in haystack.lower():
                    results.append((t, g))
        return results


# ── 全局单例 ──

_gs = None


def get_graph_service():
    """获取GraphService单例"""
    global _gs
    if _gs is None:
        from flask import current_app
        data_dir = current_app.config.get('GRAPH_DATA_DIR')
        _gs = GraphService(data_dir)
    return _gs
