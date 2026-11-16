# 来源与适配记录

- 来源：https://github.com/JuneYaooo/nihaisha-nishi-tcm
- 固定版本：`881c05b23ed7ca8b7b26a2c0e98943d8012bda30`
- 原仓库没有公开开源 LICENSE，README 与 `docs/USE_AND_RISK_NOTICE.md` 明确限定个人学习、资料整理与技术交流，不作商业用途；课程材料版权归原权利人。本地保留完整原说明，并部署为可查阅的资料使用说明，不能据此声称取得商业分发授权。
- 本地板块名称：倪海厦中医。
- 上游是 Agent Skill 资料库，未提供现成网站。本地适配复用本组 `nihaixia-app/integration/` 的阅读器，真实接入 44 篇主模块资料与 2986 张板书证据图片，支持全文搜索、分类、收藏与已读记录，板书按需展开。
- 未启用上游明确下架的 RAG 模式，也未虚构 AI 问答、下载语料或把学习资料当作诊断处方。
- 构建：在主项目执行 `node scripts/build-attention-tcm.cjs`，输出 `server/modules-web/nihaisha-nishi-tcm/`。
