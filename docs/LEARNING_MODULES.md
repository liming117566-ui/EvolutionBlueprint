# 新增学习板块与本地验收

当前品牌为“新博途”，共有 17 个板块：3 个已有学科板块、11 个仓库接入板块，以及最新的 3 个用户提供源码包板块。已按要求移除“专注与习惯”“思维训练”“身心成长”三个旧板块。首页、学习空间、后台板块配置使用同一份注册表，标题按提供的文字设置。现有目录分别迁移草稿和发布版本；迁移只运行一次，后台后续修改、隐藏和删除会保留。

| 板块名 | 本地网页路径 | 本地接入内容 |
| --- | --- | --- |
| 英语单词 | `/modules/english-chinese-words/` | 80 册、149341 个词条，搜索、释义音标、例句、生词、拼写练习 |
| 浙教版初中科学学习 | `/modules/youwei-junior-science/` | 140 单元、783 道练习、课程、笔记、自评订正及 32 套打印资料 |
| 上海初高语法填空 | `/modules/english-grammar-lab/` | 专题、真题、错题、间隔复习、薄弱点、组卷、打印、本地备份 |
| 人教版初中数学 AI 学习库 | `/modules/MathKnowledgeAI/` | 228 个真实知识点、教材筛选、全文搜索、公式阅读、学习状态与笔记 |
| 初中数学图谱 | `/modules/MathGraph/` | 六册 169 个知识点、237 条先修关系、交互图谱、学习顺序与掌握标记 |
| 小升初 40 天在线作业 | `/modules/summer-camp-grade7/` | 原 40 天闯关、题目、本地录音、奖励、报告与存档 |
| 小学英语知识图谱（小升初方向） | `/modules/primary-english-knowledge-graph/` | 原图谱、522 道题、组卷、作答、诊断、训练及题库导入 |
| 小学 1-6 年级各学科学习 | `/modules/zx-study/` | 原题库 74115 道题、学科年级筛选、10 类题型、错题、109 首古诗与 1116 个英语词汇 |
| ADHD儿童注意力训练平台 | `/modules/adhd-training-platform/` | 三档数字顺序训练、计时、错误反馈、本机成绩 |
| 倪师中医经方学习 | `/modules/nihaixia-app/` | 2095 篇资料，含 314 条经方、466 条本草与课程讲稿，检索、收藏及已读 |
| 倪海厦中医 | `/modules/nihaisha-nishi-tcm/` | 44 篇主学习模块、2986 张真实板书，检索、阅读、收藏及已读 |
| 几何之间 | `/modules/geometry-between/` | 原始 UI、110 个数学专题、交互练习及 296 页原书图片 |
| 地生会考学习空间 | `/modules/geo-bio-exam/` | 原始 UI、66 个生物知识点、535 页笔记、自测、冲刺及出卷；地理待完善 |
| 数学之间·七年级上册 | `/modules/math-between-grade7/` | 原始 UI、六章 29 个专题、14 种交互模型、348 份资料及组卷 |

## 界面与品牌

原生页面按新提供的 UI 统一为浅灰背景 `#f8f9fa`、白色圆角卡片、深灰正文 `#242823` 与黄色重点色 `#f8d849`，支持手机尺寸。17 个板块均从互动学习页进入；原有 14 个网页内页通过授权后加载共同主题，保留原图谱和练习的必要操作结构。最新三个源码包按用户要求保留原始 UI，不加载共同主题。见 [UI 改版验收](UI_REDESIGN_2026_11_16.md)和[新增源码包记录](supplied-courses-2026-11-16.md)。

已清理部署页面的原平台品牌、GitHub 图标和跳转、About/关于导航。已有英语模块的欢迎页、分享、网页标题及安装名称也统一为“初中英语”；已有知识图谱的上游 Issue 和推广入口已移除。

版权文件、素材署名与来源记录保留。语法项目的作者条、水印及完整性校验由其许可证明确要求保留，因此没有删除。该项目仅允许个人非商业使用及完整原样转发；当前适配供本机测试，未经额外许可不能公开分发或商用。部分其他上游未提供独立 LICENSE，不能据此推定拥有商用或再分发授权。各源目录的 `UPSTREAM.md` 或 `INTEGRATION.md` 记录了来源、固定提交及具体限制。

## 适配范围

知识库、Flutter 和 Electron 项目使用其真实资料、题库适配浏览器界面。未连接的 AI、OCR、桌面语音模型、原独立云账号服务没有显示为已可用。小学英语提供可用的提示词生成与题目质检导入，未自动调用模型。单词设备朗读取决于浏览器支持和设备已安装语音。

这些独立模块的练习、收藏、笔记与进度保存在当前浏览器，尚未合并到小程序账号的云端学习记录。原课程系统继续使用原有鉴权与云端进度。中医模块保留原学习用途及使用边界说明。

## 构建和验证

根目录执行 `node scripts/build-modules.cjs` 可重建上表全部 14 个模块，无需另外安装上游应用的运行依赖。输出位于忽略目录 `server/modules-web/`。上表为受保护的资源路径；启动主服务后，须登录并兑换相应板块或全部权限，从小程序入口进入。

现有模块构建仍分别使用 `node scripts/build-english.cjs`、`node scripts/build-math.cjs` 和 `node scripts/build-junior-math.cjs`。

验证命令：

```text
node --test scripts/test.cjs scripts/documents.test.cjs scripts/learning-flow.test.cjs scripts/backend.test.cjs scripts/web-packages.test.cjs scripts/website-entitlements.test.cjs
node scripts/verify-modules.cjs
node scripts/verify-module-entries.cjs
```

浏览器脚本需要可用的 Playwright 与 Edge，支持通过环境变量配置路径。`verify-modules.cjs` 另需环境变量 `MODULE_TEST_TOKEN`，对应已获全部板块权限的本地测试账号。微信入口验证需要开发者工具开启自动化端口 9420，并登录已兑换的本地测试账号。

本次验收记录：

- 当前根项目自动检查：153 项通过，涵盖新入口、单板块和全部兑换范围、网页资源鉴权、资料和网页上传、品牌与图片迁移、随机用户名持久化、草稿/发布隔离、迁移幂等及原课程回归。结果：`artifacts/devtools/xinbotu-tests.log`。
- 11 个模块的手机浏览器首屏、标题、资源、CSP、运行异常、导航清理及横向布局检查：`artifacts/ui/modules/verification.json`，截图在同目录。
- 各组真实交互检查：`artifacts/devtools/language-science-browser.json`、`artifacts/math-primary/interaction-check.json`、`artifacts/attention-tcm/verification.json`。
- 微信开发者工具 AppID `wx08fe2b1891297fce`：当前首页、学习页、随机用户名检查在 `artifacts/devtools/xinbotu-ui-verification.json`；14 个板块的新封面、图标和首页主图均已接入。此前 11 个新入口的加载检查在 `artifacts/ui/module-entries/verification.json`。

当前测试服务地址为 `http://127.0.0.1:3002`，数据使用 `artifacts/devtools/test-data/` 隔离目录。真机访问仍需要可访问的 HTTPS 服务地址、微信业务域名配置和相应账号配置；本次结果不等同于真机上线验收。代码保留在本地工作区，未推送或发布。

兑换范围、网页上传操作和本轮兑换实测见 [兑换码与网页上传](REDEMPTION_AND_WEB_UPLOAD.md)。

当前品牌、生成图片与应用图标文件说明见 [新博途品牌资源](XINBOTU_BRAND_ASSETS.md)。
