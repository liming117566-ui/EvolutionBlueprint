"""DAG算法工具

提供拓扑排序、环检测、依赖链回溯等功能。
"""
from collections import defaultdict, deque


def topological_sort(node_ids, dependencies):
    """Kahn算法拓扑排序

    Args:
        node_ids: 需要排序的节点ID列表
        dependencies: 依赖边列表 [{'topicId':..., 'prerequisiteId':...}, ...]
                        只排序 node_ids 中存在的边

    Returns:
        list: 拓扑排序后的节点ID列表
    """
    node_set = set(node_ids)
    in_degree = {nid: 0 for nid in node_ids}
    graph = defaultdict(list)

    for dep in dependencies:
        tid = dep['topicId']
        pid = dep['prerequisiteId']
        if tid in node_set and pid in node_set:
            graph[pid].append(tid)
            in_degree[tid] += 1

    queue = deque([nid for nid in node_ids if in_degree[nid] == 0])
    result = []

    while queue:
        node = queue.popleft()
        result.append(node)
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # 检测环
    if len(result) != len(node_ids):
        # 有环，把剩余节点追加（不应发生在已校验的数据中）
        remaining = set(node_ids) - set(result)
        result.extend(remaining)

    return result


def detect_cycle(node_ids, dependencies):
    """检测DAG中是否有环

    Returns:
        bool: True表示有环
    """
    node_set = set(node_ids)
    in_degree = {nid: 0 for nid in node_ids}
    graph = defaultdict(list)

    for dep in dependencies:
        tid = dep['topicId']
        pid = dep['prerequisiteId']
        if tid in node_set and pid in node_set:
            graph[pid].append(tid)
            in_degree[tid] += 1

    queue = deque([nid for nid in node_ids if in_degree[nid] == 0])
    visited = 0

    while queue:
        node = queue.popleft()
        visited += 1
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return visited != len(node_ids)


def get_ancestors(topic_id, all_deps, visited=None):
    """获取某节点的所有祖先（前置的前置的前置...）

    Args:
        topic_id: 起始节点ID
        all_deps: 所有依赖边

    Returns:
        list: 所有祖先节点ID（不含自身）
    """
    if visited is None:
        visited = set()

    parents = []
    for dep in all_deps:
        if dep['topicId'] == topic_id and dep['prerequisiteId'] not in visited:
            parents.append(dep['prerequisiteId'])
            visited.add(dep['prerequisiteId'])

    result = list(parents)
    for p in parents:
        result.extend(get_ancestors(p, all_deps, visited))

    return result


def get_descendants(topic_id, all_deps, visited=None):
    """获取某节点的所有后代（后续的后续的后续...）"""
    if visited is None:
        visited = set()

    children = []
    for dep in all_deps:
        if dep['prerequisiteId'] == topic_id and dep['topicId'] not in visited:
            children.append(dep['topicId'])
            visited.add(dep['topicId'])

    result = list(children)
    for c in children:
        result.extend(get_descendants(c, all_deps, visited))

    return result
