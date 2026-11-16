# 数据集与本机集成

来源：https://github.com/mikigo/english-chinese-words

上游提交：`1dc3ea383c11f8d2862233a745ba48018c65f573`。原始 Apache-2.0 LICENSE 保留。

本地板块：英语单词。构建：在主仓库运行 `node scripts/build-language-science.cjs`。

`data/*.json.gz` 是从该提交的 80 个 `books/**/*.json` JSONL 词库规范化得到的可复建源数据，共 149341 个词条。保留单词、英美音标、全部释义、例句、短语、记忆提示；省去未使用的同义词/同根词元数据和重复生成的文档。`prepare-data.cjs` 是一次性导入脚本，重新导入时需从上述上游提交恢复 books/ 目录；正常构建只需压缩源数据，无 npm 依赖、无网络请求。

页面重写为手机适用的学习界面，支持分册搜索、分页、收藏生词、随机拼写练习和本机语音朗读；GitHub、关于、原站品牌入口未引入。词库按册请求，避免一次加载全部词条。

记录使用独立的浏览器存储键 `blueprint-vocabulary-v1`。本地学习界面维护与改动：进化蓝图项目，2026。发音调用设备语音能力，部分微信或设备环境不支持时页面显示说明。
