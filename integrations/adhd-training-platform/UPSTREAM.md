# 来源与适配记录

- 来源：https://github.com/Austin-Wang-1993/adhd-training-platform
- 固定版本：`3df47d812a3a72df4dfd15a47acd7e5237df9b5a`
- 原项目 package.json 声明 `MIT`，作者 `ADHD Team`；仓库未附独立 LICENSE 文件，原声明予以保留。
- 本地板块名称：ADHD儿童注意力训练平台。
- 本地适配在 `integration/`：保留数字顺序游戏的 Fisher–Yates 洗牌、简单/中等/困难三种规则、用时与错误反馈，改用独立命名的本机存储保存成绩。没有接入上游独立注册登录、数据库及跨用户排行榜；界面明确标为本机记录。
- 构建：在主项目执行 `node scripts/build-attention-tcm.cjs`，输出 `server/modules-web/adhd-training-platform/`。
- 界面品牌和组件与进化蓝图统一，原始服务端/前端源码保留供核对。
