# 复习队列

## 今日及逾期待复习
```dataview
TABLE next_review as 下次复习, review_stage as 轮次, knowledge as 知识点, area as 模块, error_type as 错因, mastery as 掌握度, status as 状态
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE next_review <= date(today) AND status != "已掌握"
SORT next_review ASC
```

## 未来 7 天复习安排
```dataview
TABLE next_review as 下次复习, review_stage as 轮次, knowledge as 知识点, area as 模块, error_type as 错因, status as 状态
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE next_review > date(today) AND next_review <= date(today) + dur(7 days) AND status != "已掌握"
SORT next_review ASC
```

## 已掌握错题
```dataview
TABLE knowledge as 知识点, area as 模块, error_type as 错因, last_review as 上次复习, review_result as 最近复习结果
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE status = "已掌握"
SORT updated DESC
```
