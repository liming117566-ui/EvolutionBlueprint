# 数据健康检查

用于保证错题库长期稳定、可统计、可自动化。

## 1. 孤儿错题：缺少知识点链接
```dataview
TABLE error_type as 错因, status as 状态, next_review as 下次复习
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE !knowledge OR length(knowledge) = 0
SORT file.name ASC
```

## 2. 缺少主要错因
```dataview
TABLE knowledge as 知识点, status as 状态
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE !error_type
SORT file.name ASC
```

## 3. 缺少下一次复习日期
```dataview
TABLE knowledge as 知识点, status as 状态, review_stage as 轮次
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE !next_review AND status != "已掌握"
SORT file.name ASC
```

## 4. 缺少模块 area
```dataview
TABLE knowledge as 知识点, error_type as 错因
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE !area
SORT file.name ASC
```

## 5. 缺少复习轮次 review_stage
```dataview
TABLE knowledge as 知识点, next_review as 下次复习, status as 状态
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE !review_stage AND status != "已掌握"
SORT file.name ASC
```

## 6. 状态字段异常
```dataview
TABLE knowledge as 知识点, status as 状态
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE status AND !contains(list("待复习", "复习中", "已掌握", "需重做"), status)
SORT file.name ASC
```

## 7. 掌握度字段异常
```dataview
TABLE knowledge as 知识点, mastery as 掌握度
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE mastery AND !contains(list("未掌握", "基本掌握", "已掌握"), mastery)
SORT file.name ASC
```

## 8. 模块字段异常
```dataview
TABLE knowledge as 知识点, area as 模块
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE area AND !contains(list("数与代数", "图形与几何", "统计与概率", "综合与实践"), area)
SORT file.name ASC
```

## 9. 缺少 source_image 的错题
```dataview
TABLE knowledge as 知识点, error_type as 错因, status as 状态
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE !source_image
SORT file.name ASC
```

## 10. 有 source_image 但缺少 OCR 文本的错题
```dataview
TABLE knowledge as 知识点, source_image as 原图
FROM "人教版初中数学AI学习库/02_ErrorBank"
WHERE source_image AND !ocr_text
SORT file.name ASC
```

## 11. Inbox 中待处理图片

以下目录需要定期清空或处理：

- [[人教版初中数学AI学习库/00_Inbox/错题照片]]
- [[人教版初中数学AI学习库/05_Assets/01_RawImages]]

> Dataview 无法可靠统计非 Markdown 图片文件；请用文件浏览器或 AI 文件扫描辅助检查。
