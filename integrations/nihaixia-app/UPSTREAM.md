# 来源与适配记录

- 来源：https://github.com/jangviktor-web/nihaixia-app
- 固定版本：`4c66bd3af3c45523033ebcb68e1afba45f429351`
- 软件许可：Apache License 2.0，完整原文保留于 `LICENSE`。课程材料、古籍与讲授内容的原作者归属不因软件许可改变。
- 本地板块名称：倪师中医经方学习。
- Flutter 原应用需 Flutter SDK 和相应运行服务；本地适配在 `integration/`，将真实资料构建为同源网页阅读库，包含 314 条方剂、466 条本草和 1315 篇医学课程/古籍资料，共 2095 篇。支持全文检索、分类、收藏与已读记录，按篇按需加载。
- 保留经方组成与课程方证学习内容，不将资料渲染成个人处方，不提供未经配置的 AI 问诊输出；未移植原 Flutter 的命理、传感器、Android 分享及 SQLite 专有功能。
- 构建：在主项目执行 `node scripts/build-attention-tcm.cjs`，输出 `server/modules-web/nihaixia-app/`。
- 原应用 `docs/web` 中有少量重复文件在 Windows 长路径限制下未检出，适配构建使用完整的 `assets` 原始资料，不依赖这些重复构建文件。
