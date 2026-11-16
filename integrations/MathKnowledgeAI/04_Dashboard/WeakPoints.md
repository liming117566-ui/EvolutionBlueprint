# 薄弱点报告

自动统计错题，找出最需要巩固的知识点、模块和错因。

## 本周薄弱知识点
```dataview
TABLE rows.file.link as 错题, length(rows) as 错题数量
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE date >= date(today) - dur(7 days)
FLATTEN knowledge as k
GROUP BY k as 知识点
SORT length(rows) DESC
LIMIT 10
```

## 历史薄弱知识点
```dataview
TABLE length(rows) as 错题数量, rows.error_type as 错因分布, rows.area as 模块分布
FROM "人教版初中数学AI学习库/02_ErrorBank"
FLATTEN knowledge as k
GROUP BY k as 知识点
SORT length(rows) DESC
LIMIT 20
```

## 薄弱模块
```dataview
TABLE length(rows) as 错题数量, rows.error_type as 错因分布, rows.mastery as 掌握度分布
FROM "人教版初中数学AI学习库/02_ErrorBank"
GROUP BY area as 模块
SORT length(rows) DESC
```

## 错因分布
```dataview
TABLE length(rows) as 数量
FROM "人教版初中数学AI学习库/02_ErrorBank"
GROUP BY error_type as 错因
SORT length(rows) DESC
```

## 需重做清单
```dataview
TABLE knowledge as 知识点, area as 模块, error_type as 错因, attempt_count as 重做次数, next_review as 下次复习
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE status = "需重做"
SORT next_review ASC
```
