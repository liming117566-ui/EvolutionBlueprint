# 初中数学学习仪表盘

欢迎回来！今天的学习任务围绕“复习错题、巩固薄弱点、补充练习”展开。

## 📅 今日待复习
```dataview
TABLE knowledge as 知识点, area as 模块, error_type as 错因, review_stage as 轮次, status as 状态, mastery as 掌握度
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE next_review <= date(today) AND status != "已掌握"
SORT next_review ASC
```

## 🔁 需要重做
```dataview
TABLE knowledge as 知识点, area as 模块, error_type as 错因, attempt_count as 重做次数, next_review as 下次复习
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE status = "需重做"
SORT next_review ASC
```

## 📊 本周新增错题
```dataview
TABLE date as 日期, area as 模块, knowledge as 知识点, error_type as 错因, difficulty as 难度
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE date >= date(today) - dur(7 days)
SORT date DESC
```

## 🔗 快速入口

- [[人教版初中数学AI学习库/04_Dashboard/ReviewQueue|复习队列]]
- [[人教版初中数学AI学习库/04_Dashboard/WeakPoints|薄弱点报告]]
- [[人教版初中数学AI学习库/04_Dashboard/ReviewPlan|本周复习计划]]
- [[人教版初中数学AI学习库/04_Dashboard/LearningProgress|学习进度]]
- [[人教版初中数学AI学习库/04_Dashboard/DataHealth|数据健康检查]]
- [[人教版初中数学AI学习库/00_Inbox/错题照片|录入新错题]]
