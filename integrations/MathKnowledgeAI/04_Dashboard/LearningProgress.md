# 学习进度

> 说明：掌握度来自错题状态和复习结果；没有错题不代表完全掌握，只表示暂无暴露问题。

## 按模块统计错题
```dataview
TABLE length(rows) as 错题数量, rows.mastery as 掌握度分布, rows.error_type as 错因分布
FROM "人教版初中数学AI学习库/02_ErrorBank"
GROUP BY area as 模块
SORT length(rows) DESC
```

## 按模块与掌握度统计
```dataview
TABLE length(rows) as 数量
FROM "人教版初中数学AI学习库/02_ErrorBank"
GROUP BY area + " / " + mastery as 模块掌握度
SORT length(rows) DESC
```

## 各年级错题分布
```dataview
TABLE length(rows) as 错题数量, rows.status as 状态分布
FROM "人教版初中数学AI学习库/02_ErrorBank"
GROUP BY grade as 年级
SORT 年级 ASC
```

## 各章节错题分布
```dataview
TABLE length(rows) as 错题数量, rows.error_type as 错因分布
FROM "人教版初中数学AI学习库/02_ErrorBank"
GROUP BY chapter as 章节
SORT length(rows) DESC
```

## 复习轮次分布
```dataview
TABLE length(rows) as 数量
FROM "人教版初中数学AI学习库/02_ErrorBank"
GROUP BY review_stage as 复习轮次
SORT 复习轮次 ASC
```

## 掌握度统计
```dataview
TABLE length(rows) as 数量
FROM "人教版初中数学AI学习库/02_ErrorBank"
GROUP BY mastery as 掌握度
SORT length(rows) DESC
```
