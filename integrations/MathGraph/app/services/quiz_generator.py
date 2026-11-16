"""出题引擎

根据知识点类型和难度梯度生成练习题。
"""
import json
import re
from app.services.graph_service import get_graph_service, TYPE_LABELS


# 难度等级
DIFFICULTY_LEVELS = ['夯基', '目标', '综合', '挑战']

DIFFICULTY_DESC = {
    '夯基': '考查前置基础知识，确认基础是否牢固',
    '目标': '考查目标知识点本身，验证当前掌握',
    '综合': '跨知识点综合应用，检验综合能力',
    '挑战': '考查下游知识点，拓展提升',
}


class QuizGenerator:
    """出题引擎"""

    def __init__(self, graph_service=None):
        self.gs = graph_service or get_graph_service()

    def generate_quiz(self, topic_id, num_questions=4):
        """为一个知识点生成一组练习题

        Args:
            topic_id: 目标知识点ID
            num_questions: 题目数量

        Returns:
            dict: 练习题组
        """
        topic = self.gs.get_topic(topic_id)
        if not topic:
            return {'success': False, 'message': '知识点不存在'}

        entry = self.gs.get_topic_with_grade(topic_id)
        grade = entry[1] if entry else '7-up'

        # 获取前置和后续
        prereqs = self.gs.get_prerequisites(topic_id)
        unlocks = self.gs.get_unlocks(topic_id)

        # 按难度生成题目
        questions = []

        # 夯基题：考查前置
        if prereqs:
            prereq = prereqs[0]
            q = self._make_question(
                difficulty='夯基',
                topic=topic,
                related_topic=prereq.get('topic'),
                related_name=prereq.get('topic', {}).get('name', '') if prereq.get('topic') else '',
                index=1,
            )
        else:
            q = self._make_question(
                difficulty='夯基',
                topic=topic,
                related_topic=None,
                related_name='',
                index=1,
            )
        if q:
            questions.append(q)

        # 目标题×2：考查目标知识点
        for i in range(2):
            q = self._make_question(
                difficulty='目标',
                topic=topic,
                related_topic=None,
                related_name='',
                index=len(questions) + 1,
            )
            if q:
                questions.append(q)

        # 综合题：跨知识点
        if prereqs:
            related = prereqs[min(1, len(prereqs) - 1)] if len(prereqs) > 1 else prereqs[0]
            related_topic = related.get('topic')
        else:
            related_topic = None

        q = self._make_question(
            difficulty='综合',
            topic=topic,
            related_topic=related_topic,
            related_name=related_topic.get('name', '') if related_topic else '',
            index=len(questions) + 1,
        )
        if q:
            questions.append(q)

        # 挑战题：下游知识点
        if len(questions) < num_questions and unlocks:
            unlock = unlocks[0]
            q = self._make_question(
                difficulty='挑战',
                topic=topic,
                related_topic=unlock.get('topic'),
                related_name=unlock.get('topic', {}).get('name', '') if unlock.get('topic') else '',
                index=len(questions) + 1,
            )
            if q:
                questions.append(q)

        # 截断到指定数量
        questions = questions[:num_questions]

        return {
            'success': True,
            'topic_id': topic_id,
            'topic_name': topic.get('name', ''),
            'topic_type': topic.get('type', ''),
            'topic_type_label': TYPE_LABELS.get(topic.get('type', ''), ''),
            'grade': grade,
            'questions': questions,
            'total': len(questions),
        }

    def _make_question(self, difficulty, topic, related_topic, related_name, index):
        """生成单道题目

        基于知识点的 assessmentPrompt 和 evidence 构造题目
        """
        name = topic.get('name', '')
        desc = topic.get('description', '')
        prompt = topic.get('assessmentPrompt', '')
        evidence = topic.get('evidence', [])
        t_type = topic.get('type', '')

        # 清理 prompt 中的 {{name}} 占位符
        clean_prompt = re.sub(r'\{\{name\}\}', '', prompt).strip()
        if clean_prompt.startswith('能否'):
            clean_prompt = clean_prompt[2:]

        # 根据难度和类型构造题目
        if difficulty == '夯基':
            if related_topic:
                related_prompt = related_topic.get('assessmentPrompt', '')
                related_name = related_topic.get('name', '')
                related_desc = related_topic.get('description', '')
                clean_related = re.sub(r'\{\{name\}\}', '', related_prompt).strip()
                if clean_related.startswith('能否'):
                    clean_related = clean_related[2:]

                question_text = f'【夯基题·前置知识】{related_name}\n'
                question_text += f'根据下列描述回答问题：\n{related_desc}\n\n'
                question_text += f'问题：{clean_related}' if clean_related else f'请简述「{related_name}」的核心内容。'
                answer = f'参考「{related_name}」的定义和性质作答。关键要点：{related_desc}'
                hint = f'这是「{name}」的前置知识，掌握它才能更好地学习目标知识点'
            else:
                # 没有前置，出基础概念题
                question_text = f'【夯基题·基础概念】\n根据描述：{desc}\n\n请回答：简述「{name}」的含义。'
                answer = desc
                hint = '回看概念定义'

        elif difficulty == '目标':
            if t_type == 'CONCEPTUAL':
                if clean_prompt:
                    question_text = f'【目标题·概念理解】\n{clean_prompt}'
                else:
                    question_text = f'【目标题·概念理解】\n请说明「{name}」的含义及其关键要素。'
                answer = desc

            elif t_type == 'PROCEDURAL':
                question_text = f'【目标题·计算应用】\n基于「{name}」的知识：\n{desc}\n\n'
                if clean_prompt:
                    question_text += f'请解答：{clean_prompt}'
                else:
                    question_text += f'请完成一道关于「{name}」的计算题，并写出关键步骤。'
                answer = f'参考解题方法：{desc}'

            elif t_type == 'REPRESENTATIONAL':
                question_text = f'【目标题·图表运用】\n基于「{name}」：\n{desc}\n\n'
                if clean_prompt:
                    question_text += f'请画图/读图并回答：{clean_prompt}'
                else:
                    question_text += f'请画出与「{name}」相关的图示，并标注关键要素。'
                answer = f'图示应体现：{desc}'

            else:
                question_text = f'请回答：{clean_prompt}' if clean_prompt else f'请简述「{name}」。'
                answer = desc

            hint = f'本题考查「{name}」本身，确保理解核心内容'

        elif difficulty == '综合':
            if related_name and related_topic:
                related_desc = related_topic.get('description', '')
                question_text = f'【综合题·跨知识点】\n'
                question_text += f'本题综合考查「{name}」与「{related_name}」。\n\n'
                question_text += f'背景知识：\n· {name}：{desc[:60]}...\n' if len(desc) > 60 else f'背景知识：\n· {name}：{desc}\n'
                question_text += f'· {related_name}：{related_desc[:60]}...\n\n' if len(related_desc) > 60 else f'· {related_name}：{related_desc}\n\n'
                question_text += '请综合运用以上知识解决：\n'
                if clean_prompt:
                    question_text += clean_prompt
                else:
                    question_text += f'请分析「{name}」和「{related_name}」之间的联系，并举一个综合应用例子。'
                answer = f'需综合运用「{name}」（{desc}）和「{related_name}」（{related_desc}）'
            else:
                question_text = f'【综合题】\n请综合运用「{name}」的知识解决以下问题：\n{clean_prompt or desc}'
                answer = desc

            hint = f'需要同时用到「{name}」和其他相关知识'

        elif difficulty == '挑战':
            if related_topic:
                related_name2 = related_topic.get('name', '')
                related_desc2 = related_topic.get('description', '')
                related_prompt2 = related_topic.get('assessmentPrompt', '')
                clean_r2 = re.sub(r'\{\{name\}\}', '', related_prompt2).strip()
                if clean_r2.startswith('能否'):
                    clean_r2 = clean_r2[2:]

                question_text = f'【挑战题·拓展提升】\n'
                question_text += f'「{name}」是学习「{related_name2}」的基础。\n\n'
                question_text += f'请回答关于「{related_name2}」的问题：\n'
                question_text += clean_r2 or f'请简述「{related_name2}」与「{name}」的关系。'
                answer = f'参考「{related_name2}」：{related_desc2}'
                hint = f'这是「{name}」的后续知识点，答对说明你已经融会贯通'
            else:
                question_text = f'【挑战题】\n请深入思考「{name}」的应用：\n{clean_prompt or desc}'
                answer = desc
                hint = '挑战自我！'

        else:
            return None

        # 易错点
        common_mistake = self._get_common_mistake(topic, difficulty)

        return {
            'index': index,
            'difficulty': difficulty,
            'difficulty_desc': DIFFICULTY_DESC.get(difficulty, ''),
            'type': t_type,
            'type_label': TYPE_LABELS.get(t_type, t_type),
            'question_text': question_text,
            'reference_answer': answer,
            'hint': hint,
            'common_mistake': common_mistake,
            'topic_id': topic.get('id', ''),
            'topic_name': name,
            'related_name': related_name,
        }

    def _get_common_mistake(self, topic, difficulty):
        """根据知识点生成易错点提示"""
        name = topic.get('name', '')
        t_type = topic.get('type', '')
        desc = topic.get('description', '')

        mistakes = {
            'CONCEPTUAL': f'注意理解「{name}」的核心定义，不要混淆相近概念',
            'PROCEDURAL': f'计算时注意每一步的符号和运算顺序',
            'REPRESENTATIONAL': f'画图时注意关键要素的准确性',
        }

        return mistakes.get(t_type, f'注意「{name}」中的关键细节')

    def check_answer(self, question, user_answer):
        """判题（关键词匹配 + 长度判断）

        对于数学概念题，通过关键词重合度判断正确性；
        对于计算题，尝试提取数字进行比对。
        """
        if not user_answer or not user_answer.strip():
            return {
                'correct': False,
                'feedback': '答案为空，请尝试作答',
                'need_manual_check': False,
            }

        ref_answer = question.get('reference_answer', '')
        user_clean = user_answer.strip()

        # 提取数字进行比对（适用于计算题）
        numbers_in_ref = re.findall(r'-?\d+\.?\d*', ref_answer)
        numbers_in_user = re.findall(r'-?\d+\.?\d*', user_clean)

        if numbers_in_ref and numbers_in_user:
            # 计算题：检查最后一个数字是否匹配（通常是最终答案）
            ref_num = numbers_in_ref[-1]
            user_num = numbers_in_user[-1]
            if ref_num == user_num:
                return {
                    'correct': True,
                    'feedback': '答案中的数字与参考答案一致，请核对解题过程',
                    'need_manual_check': True,
                }

        # 概念题：关键词匹配（按词分割）
        ref_words = set()
        for word in re.findall(r'[\u4e00-\u9fff]+|[a-zA-Z]+', ref_answer):
            if len(word) >= 2:
                ref_words.add(word.lower())

        user_words = set()
        for word in re.findall(r'[\u4e00-\u9fff]+|[a-zA-Z]+', user_clean):
            if len(word) >= 2:
                user_words.add(word.lower())

        if ref_words:
            overlap = ref_words & user_words
            ratio = len(overlap) / len(ref_words)

            if ratio >= 0.5:
                return {
                    'correct': True,
                    'feedback': f'答案包含 {len(overlap)}/{len(ref_words)} 个关键要素，基本正确',
                    'need_manual_check': True,
                }
            elif ratio >= 0.3:
                return {
                    'correct': True,
                    'feedback': f'部分正确（{len(overlap)}/{len(ref_words)} 关键要素），请对照参考答案完善',
                    'need_manual_check': True,
                }

        return {
            'correct': False,
            'feedback': '与参考答案差异较大，请对照参考答案检查',
            'need_manual_check': True,
        }
