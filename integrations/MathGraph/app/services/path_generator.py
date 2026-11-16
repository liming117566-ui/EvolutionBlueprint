"""学习路径生成器

基于DAG拓扑排序，生成个性化学习路径。
"""
from app.services.graph_service import get_graph_service, TYPE_LABELS, GRADE_INFO
from app.utils.dag import topological_sort, get_ancestors


class PathGenerator:
    """学习路径生成器"""

    def __init__(self, graph_service=None):
        self.gs = graph_service or get_graph_service()

    def generate_path(self, target_topic_id, mastered_ids=None):
        """生成学习路径

        Args:
            target_topic_id: 目标知识点ID
            mastered_ids: 已掌握的知识点ID集合

        Returns:
            dict: 学习路径信息
        """
        if mastered_ids is None:
            mastered_ids = set()

        # 获取所有前置（递归）
        all_deps = self.gs.get_all_dependencies()
        ancestors = get_ancestors(target_topic_id, all_deps)

        # 待学习列表 = 所有前置 + 目标本身
        to_learn_ids = set(ancestors) | {target_topic_id}

        # 过滤已掌握的
        actually_learn = to_learn_ids - mastered_ids

        if not actually_learn:
            # 所有前置已掌握，只需学目标
            actually_learn = {target_topic_id}

        # 拓扑排序
        ordered = topological_sort(list(actually_learn), all_deps)

        # 构建路径详情
        path_steps = []
        for i, tid in enumerate(ordered):
            entry = self.gs.get_topic_with_grade(tid)
            if not entry:
                continue
            topic, grade = entry
            is_mastered = tid in mastered_ids and tid != target_topic_id
            is_target = tid == target_topic_id

            centrality = topic.get('centrality', 0)
            time_min = 30
            if centrality >= 0.9:
                time_min = 45
            elif centrality >= 0.8:
                time_min = 35

            path_steps.append({
                'step': i + 1,
                'topic_id': tid,
                'topic': topic,
                'grade': grade,
                'grade_name': GRADE_INFO.get(grade, {}).get('name', grade),
                'type_label': TYPE_LABELS.get(topic.get('type', ''), topic.get('type', '')),
                'centrality': centrality,
                'estimated_minutes': time_min,
                'is_target': is_target,
                'is_mastered': is_mastered,
                'status': 'mastered' if is_mastered else ('target' if is_target else 'pending'),
            })

        total_time = sum(s['estimated_minutes'] for s in path_steps if not s['is_mastered'])
        mastered_count = sum(1 for s in path_steps if s['is_mastered'])
        pending_count = len(path_steps) - mastered_count

        target_entry = self.gs.get_topic_with_grade(target_topic_id)
        target_name = target_entry[0].get('name', '') if target_entry else target_topic_id
        target_grade = target_entry[1] if target_entry else ''

        return {
            'target_topic_id': target_topic_id,
            'target_topic_name': target_name,
            'target_grade': target_grade,
            'steps': path_steps,
            'total_steps': len(path_steps),
            'mastered_count': mastered_count,
            'pending_count': pending_count,
            'total_time_minutes': total_time,
            'total_time_display': self._format_time(total_time),
        }

    def _format_time(self, minutes):
        """格式化时间显示"""
        if minutes < 60:
            return f'约{minutes}分钟'
        h = minutes // 60
        m = minutes % 60
        if m == 0:
            return f'约{h}小时'
        return f'约{h}小时{m}分钟'
