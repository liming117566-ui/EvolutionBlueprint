"""诊断引擎

将错题映射到知识点，沿依赖链回溯找到根因。
"""
import json
from app.services.graph_service import get_graph_service, TYPE_LABELS


# 错误类型→知识点类型加权
ERROR_TYPE_WEIGHTS = {
    '概念混淆': {'CONCEPTUAL': 3, 'PROCEDURAL': 1, 'REPRESENTATIONAL': 1},
    '计算失误': {'CONCEPTUAL': 0, 'PROCEDURAL': 3, 'REPRESENTATIONAL': 1},
    '方法不熟': {'CONCEPTUAL': 1, 'PROCEDURAL': 2, 'REPRESENTATIONAL': 1},
    '审题偏差': {'CONCEPTUAL': 2, 'PROCEDURAL': 1, 'REPRESENTATIONAL': 2},
}


class DiagnosisEngine:
    """诊断引擎"""

    def __init__(self, graph_service=None):
        self.gs = graph_service or get_graph_service()

    def map_question_to_topics(self, question, grade=None, error_type=None):
        """将错题映射到最可能的知识点

        Args:
            question: 错题文本
            grade: 年级（可选，用于缩小范围）
            error_type: 错误类型

        Returns:
            list: 匹配的知识点列表（按匹配分降序）
        """
        # 确定搜索范围
        if grade:
            topics = self.gs.get_topics(grade)
        else:
            topics = self.gs.get_all_topics()

        weights = ERROR_TYPE_WEIGHTS.get(error_type or '', {})

        scored = []
        keyword = question.lower() if question else ''

        for t in topics:
            score = 0
            name = t.get('name', '').lower()
            desc = t.get('description', '').lower()
            domain = t.get('domain', '').lower()
            evidence = ' '.join(t.get('evidence', [])).lower()

            # 名称精确匹配 → 高分
            if name and name in keyword:
                score += 5
            # 名称关键词匹配
            for word in name.split():
                if len(word) > 1 and word in keyword:
                    score += 2

            # 领域匹配
            if domain and domain in keyword:
                score += 3

            # 描述关键词匹配
            for word in keyword.split():
                if len(word) > 1 and word in desc:
                    score += 1
                if len(word) > 1 and word in evidence:
                    score += 1

            # 错误类型加权
            t_type = t.get('type', '')
            score += weights.get(t_type, 0)

            if score > 0:
                entry = self.gs.get_topic_with_grade(t['id'])
                g = entry[1] if entry else '7-up'
                scored.append({
                    'topic': t,
                    'grade': g,
                    'score': score,
                })

        scored.sort(key=lambda x: -x['score'])
        return scored[:3]

    def trace_weak_chain(self, target_topic_id, user_mastery_map):
        """沿依赖链回溯，找到根因

        Args:
            target_topic_id: 直接出错的知识点ID
            user_mastery_map: {topic_id: status} 学生的掌握状态

        Returns:
            dict: 薄弱链信息
        """
        chain = []
        visited = set()
        root_cause = None

        # 从目标知识点出发，逐层向上追溯
        current = target_topic_id
        max_depth = 20  # 防止无限循环

        for _ in range(max_depth):
            if current in visited:
                break
            visited.add(current)

            topic_entry = self.gs.get_topic_with_grade(current)
            if not topic_entry:
                break

            topic, grade = topic_entry
            prereqs = self.gs.get_prerequisites(current)

            # 找到未掌握的hard依赖
            weak_prereq = None
            for prereq in prereqs:
                pid = prereq['prerequisiteId']
                status = user_mastery_map.get(pid, 'unseen')
                if prereq['strength'] == 'hard' and status in ('weak', 'unseen', 'learning'):
                    weak_prereq = prereq
                    break

            status = user_mastery_map.get(current, 'unseen')
            chain.append({
                'topic_id': current,
                'topic': topic,
                'grade': grade,
                'status': status,
                'is_target': current == target_topic_id,
                'weak_prereq': weak_prereq,
            })

            if weak_prereq:
                root_cause = weak_prereq['prerequisiteId']
                current = weak_prereq['prerequisiteId']
            else:
                # 该节点没有未掌握的hard前置 → 根因就是当前节点
                root_cause = current
                break

        if not root_cause:
            root_cause = target_topic_id

        # 构建有序薄弱链（根因→目标）
        chain.reverse()

        # 补充补强建议
        suggestion = self._build_suggestion(chain)

        root_topic = self.gs.get_topic(root_cause) or {}
        target_topic_obj = self.gs.get_topic(target_topic_id) or {}

        return {
            'chain': chain,
            'root_cause_id': root_cause,
            'root_cause_name': root_topic.get('name', root_cause),
            'target_topic_id': target_topic_id,
            'target_topic_name': target_topic_obj.get('name', ''),
            'suggestion': suggestion,
            'estimated_time': self._estimate_time(chain),
        }

    def _build_suggestion(self, chain):
        """构建补强建议"""
        suggestions = []
        for i, item in enumerate(chain, 1):
            topic = item['topic']
            name = topic.get('name', '')
            t_type = topic.get('type', '')
            type_label = TYPE_LABELS.get(t_type, t_type)
            centrality = topic.get('centrality', 0)

            time_min = 30
            if centrality >= 0.9:
                time_min = 45
            elif centrality >= 0.8:
                time_min = 35

            suggestions.append({
                'step': i,
                'topic_id': item['topic_id'],
                'name': name,
                'type_label': type_label,
                'estimated_minutes': time_min,
                'is_root': i == 1,
            })
        return suggestions

    def _estimate_time(self, chain):
        """预估总补强时间"""
        total = sum(s['estimated_minutes'] for s in self._build_suggestion(chain))
        hours = total // 60
        mins = total % 60
        if hours > 0:
            return f'约{hours}小时{mins}分钟'
        return f'约{mins}分钟'

    def diagnose(self, question, wrong_answer, correct_answer,
                 error_type, grade=None, user_mastery_map=None):
        """完整诊断流程

        Args:
            question: 题目内容
            wrong_answer: 学生错误答案
            correct_answer: 正确答案
            error_type: 错误类型
            grade: 年级
            user_mastery_map: 学生掌握状态 {topic_id: status}

        Returns:
            dict: 完整诊断结果
        """
        if user_mastery_map is None:
            user_mastery_map = {}

        # Step 1: 映射知识点
        matched = self.map_question_to_topics(question, grade, error_type)

        if not matched:
            return {
                'success': False,
                'message': '未能匹配到知识点，请尝试指定年级或更详细的题目描述',
            }

        target = matched[0]  # 取最佳匹配
        target_topic = target['topic']
        target_topic_id = target_topic['id']

        # Step 2: 依赖链回溯
        weak_chain_result = self.trace_weak_chain(target_topic_id, user_mastery_map)

        # Step 3: 生错误分析
        error_analysis = self._generate_error_analysis(
            question, wrong_answer, correct_answer, error_type, target_topic
        )

        return {
            'success': True,
            'matched_topics': matched,
            'target_topic': target_topic,
            'target_grade': target['grade'],
            'weak_chain': weak_chain_result,
            'error_analysis': error_analysis,
        }

    def _generate_error_analysis(self, question, wrong_answer, correct_answer,
                                  error_type, target_topic):
        """生成错因分析文本"""
        analysis_parts = []

        if error_type:
            error_desc = {
                '概念混淆': '该题反映出对核心概念的理解存在偏差',
                '计算失误': '解题思路可能正确，但在计算过程中出错',
                '方法不熟': '知道要用什么知识，但解题方法不熟练',
                '审题偏差': '没有正确理解题意，导致解题方向错误',
            }
            analysis_parts.append(error_desc.get(error_type, '存在知识薄弱点'))

        name = target_topic.get('name', '')
        desc = target_topic.get('description', '')

        analysis_parts.append(f'本题涉及「{name}」：{desc[:80]}...' if len(desc) > 80 else f'本题涉及「{name}」：{desc}')

        if wrong_answer and correct_answer and wrong_answer != correct_answer:
            analysis_parts.append(f'你的答案「{wrong_answer}」与正确答案「{correct_answer}」不符')

        return '。'.join(analysis_parts)
