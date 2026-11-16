# 人教版初中数学 AI 学习库

Source: https://github.com/evaacme/MathKnowledgeAI
Revision: 426828320d473794bd0913400e957fbb7e423451

The upstream is an Obsidian knowledge vault, not a web application. The `blueprint-web` adapter publishes the actual `01_Knowledge` Markdown files as a searchable textbook reader, with local learning progress, review flags and personal error notes. Dataview scripts are omitted from the reader because they require Obsidian. There is no model connection, OCR or automatic AI answer generation in this web adapter.

No repository-level license was present in the inspected upstream revision. Original materials and provenance remain in this source directory. Third-party Marked and KaTeX copyright/license notices are retained with the local browser libraries.

Build from the repository root with `node scripts/build-math-primary.cjs`. Output: `server/modules-web/MathKnowledgeAI`.
