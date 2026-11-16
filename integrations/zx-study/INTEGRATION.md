# 小学 1-6 年级各学科学习

Source: https://github.com/132465798a/zx-study
Revision: 50d9fc646da4289d3a92342d6d8c561d24e1761d
License: MIT; the original LICENSE is retained.

The upstream Electron desktop application depends on native SQLite and local speech models. The `blueprint-web` adapter extracts all 74,115 actual questions from the original `build/bank.db` into 18 subject/grade JSON chunks at build time, using Node's built-in SQLite reader. The web adapter supports random exercises, original answers/explanations, subject/grade/knowledge filters, wrong-answer review, local statistics, original poems and English vocabulary. Choice, multiple-choice, matching, fill, sorting, pinyin and calculation tasks are judged against the original answers; short answers use explicit learner self-assessment against the original reference, rather than a false AI score.

Desktop login, printer control, handwriting animation, local speech-recognition models and server synchronization are not included in the static adapter. Browser records remain on the current device. Original source and copyright are retained.

Build with Node 22.13+ (Node SQLite support): `node scripts/build-math-primary.cjs`. Output: `server/modules-web/zx-study`.
