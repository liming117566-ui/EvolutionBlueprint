# 本周复习计划

AI 根据薄弱点和复习队列生成本周复习计划。

## 自动候选：本周需要复习
```dataview
TABLE next_review as 日期, review_stage as 轮次, area as 模块, knowledge as 知识点, error_type as 错因, status as 状态
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE next_review <= date(today) + dur(7 days) AND status != "已掌握"
SORT next_review ASC
```

## 周一
- 复习：
- 练习：

## 周二
- 复习：
- 练习：

## 周三
- 复习：
- 练习：

## 周四
- 复习：
- 练习：

## 周五
- 复习：
- 练习：

## 周六
- 综合练习：

## 周日
- 复盘：
- 下周计划：
