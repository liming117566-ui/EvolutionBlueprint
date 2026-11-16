---
title: AI 学习助手 Skill
aliases: [rj-junior-math-ai-learning, AI Skill, 数学学习Skill]
tags: [skill, AI命令, 初中数学]
created: 2026-05-01
---

# 人教版初中数学 AI 学习助手

> 适用范围：[[人教版初中数学AI学习库]] 及其子目录。
> 核心规则文件：[[人教版初中数学AI学习库/RULES]]
> 本文件是 AI Skill 的**唯一权威副本**。所有 Agent（Claude Code、Codex 等）统一以本文件为准。

## 场景总览

| 触发词 | 场景 | 参考规则 |
|--------|------|----------|
| 处理错题图片 / 处理Inbox / 生成错题页 | Inbox 图片处理 & 错题录入 | §7 §13 |
| 每日复习 / 查看复习队列 | 每日复习 | §10 |
| 每周复盘 / 薄弱点分析 | 每周复盘 | §11 |
| 数据健康检查 | 数据健康检查 | §15.3 |
| 错题录入 / 新建错题 | 错题录入 | §6 §7 §8 |
| 数学问题提问 | 提问答疑 | §9 |

## 场景一：Inbox 图片处理 & 错题录入

触发后按以下流程执行（详见 RULES.md §7、§13）：

1. **扫描来源**：`00_Inbox/错题照片/` 和 `05_Assets/01_RawImages/`
2. **识别题目**：OCR 或人工阅读，提取题干、图形、用户原答案。不确定时先询问用户
3. **定位知识点**：从 `01_Knowledge/` 查找，不随意新建
4. **分析错因**：从 5 类中选择（概念不清 / 方法不会 / 计算错误 / 审题失误 / 书写不规范）
5. **生成错题页**：写入 `02_ErrorBank/`，使用统一 frontmatter 模板（字段规范见 RULES.md §6）
6. **生成变式题**：2–3 道同类型变式题，写入错题页正文或 `03_Practice/`
7. **设置复习日期**：按 1/3/7/14 天生成 `review_dates`，`review_stage: 1`
8. **归档图片**：原图移动到 `05_Assets/02_ProcessedImages/`，OCR 保存到 `05_Assets/03_OCR/`，批注图保存到 `05_Assets/04_Annotated/`（命名规范见 RULES.md §13.3）
9. **处理原始材料**：移动到 `00_Inbox/已处理/`，不删除

### 错题文件命名

```
YYYY-MM-DD_知识点名_简短题型.md
```

### 错题页 frontmatter 必填字段

参考 RULES.md §6 完整字段表。关键字段：
- `knowledge`：知识点双链（优先完整路径）
- `error_type` + `secondary_error_type`
- `area`：数与代数 / 图形与几何 / 统计与概率 / 综合与实践
- `difficulty`、`mastery`、`status`、`review_stage`、`next_review`
- `source_image`、`ocr_text`、`annotated_image`

### 错题页正文结构

参考 RULES.md §8 完整模板：原题 → 错误答案 → 正确解答 → 错因分析 → 关联知识点 → 变式题 → 复习记录。

## 场景二：每日复习

1. 读取 [[人教版初中数学AI学习库/04_Dashboard/ReviewQueue]] 和 [[人教版初中数学AI学习库/04_Dashboard/Home]]
2. 列出今日及逾期待复习错题
3. 按优先级排序：逾期 > 需重做 > 第 1 轮 > 第 3/7/14 天
4. 每题给出关联知识点、错因、建议复习方式
5. 复习后更新字段（规则见 RULES.md §6 字段更新规则）：
   - `last_review` → 当天日期
   - `attempt_count` → +1
   - `review_stage`：通过 +1（最多 4），错误 → 1，犹豫 → 不变（追加次日复习）
   - `status`：第 4 轮通过 → `已掌握`，错误 → `需重做`
6. 如有字段缺失，参考 [[人教版初中数学AI学习库/04_Dashboard/DataHealth]] 提醒修复

## 场景三：每周复盘

按 RULES.md §11 执行：

1. 统计本周新增错题数量
2. 按知识点汇总，生成薄弱点 Top 3
3. 按错因分类统计
4. 检查孤儿错题（无 `knowledge`）并补链
5. 为每个薄弱点生成复习建议（复习 1 个知识点页 + 重做 2 道错题 + 新做 3 道变式题）
6. 更新 `04_Dashboard/WeakPoints.md`、`04_Dashboard/ReviewPlan.md`、`04_Dashboard/LearningProgress.md`

## 场景四：数据健康检查

按 RULES.md §15.3 检查以下异常：

1. 缺少 `knowledge` 的孤儿错题
2. 缺少 `error_type` 的错题
3. 缺少 `next_review` 且 `status != 已掌握` 的错题
4. `status` 不在允许值中的错题
5. `mastery` 不在允许值中的错题
6. 缺少 `area` 的错题
7. 缺少 `review_stage` 的错题

修复原则：可安全推断的自动修复；不确定的列出人工确认清单。批量修改前先备份到 `99_Backups/`。

## 场景五：错题录入（手动触发）

直接录入已知错题（不涉及图片处理），执行 RULES.md §7 的步骤 3–9（定位知识点 → 分析错因 → 生成错题页 → 变式题 → 复习日期 → 验证 Dashboard）。

## 场景六：数学问题提问答疑

按 RULES.md §9 执行：

1. 判断对应知识点，读取相关错题记录
2. 如有历史错题，先提醒薄弱点
3. 讲"为什么"再讲"怎么算"
4. 给出规范解题步骤
5. 如暴露新薄弱点，生成 1 道巩固题
6. 普通问答不写入 `01_Knowledge/`；如需保存写入 `03_Practice/` 或 `04_Dashboard/学习问答记录.md`

## 关键约束速查

- **知识点库保护**：`01_Knowledge/` 默认只读（RULES.md §4）
- **error_type 仅 5 类**：概念不清 / 方法不会 / 计算错误 / 审题失误 / 书写不规范（RULES.md §5）
- **复习间隔**：1/3/7/14 天（RULES.md §10）
- **area 仅 4 类**：数与代数 / 图形与几何 / 统计与概率 / 综合与实践（RULES.md §6）
- **图片不删除**：处理后的原图移动到 `00_Inbox/已处理/` 或 `05_Assets/`（RULES.md §13）
- **Dashboard 查询字段**：统一使用英文 frontmatter key（RULES.md §14）
- **批量修改前备份**：到 `99_Backups/`（RULES.md §16）
- **不确定时先确认**：题意、图形、答案不明确时不强行归档（RULES.md §1）
