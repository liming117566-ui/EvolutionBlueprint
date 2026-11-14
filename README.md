# 进化蓝图 · 微信小程序

一个可运行的原生微信小程序前端 + Node.js/Express 持久化课程服务。当前包含主题课程目录、章节与小章节阅读、PDF / Word 原生阅读、微信用户会话、课程权益、学习进度同步，以及独立中文管理后台。

## 设计系统

采用白色主导的蓝紫轻玻璃风格，基础色限制为白、雾白、深蓝、蓝色、淡紫五种。卡片、弹层和胶囊导航统一使用 `rgba(255,255,255,0.15)`、`blur(16px)` 与 1px 半透明白色描边。课程为本地原创 SVG 封面，封面上置、标题下置，系统中文字体不依赖网络字体加载。

Button、Card、Modal 与导航统一尺寸和状态；用原生 WXML/WXSS 实现 shadcn/ui 的组件原则，不引入 React。完整规范见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)。

## 目录

- `miniprogram/`：微信原生小程序前端
- `server/`：Express API、SQLite 数据库、上传文件服务和中文管理后台
- `BACKEND_CONTRACT.md`：管理端与小程序 API 契约

## 本地预览

1. 安装 Node.js 26 LTS 与微信开发者工具，执行 `npm install`。
2. 复制 `.env.example` 为 `.env`，仅本地调试可使用 `DEV_AUTH=1`；生产环境必须配置 HTTPS `PUBLIC_ORIGIN`、`WX_APPSECRET`，并关闭 `DEV_AUTH`。
3. 初始化第一个管理员：临时设置 `ADMIN_USERNAME` 和至少 12 位 `ADMIN_PASSWORD`，运行 `node scripts/manage.cjs init-admin`，然后移除这两个环境变量。管理后台地址为 `http://localhost:3002/admin/`。
4. 启动后端：运行 `npm run dev`。数据默认写入 `server/data/`；数据库、上传文件和密钥不要放入公开静态目录。
5. 在开发者工具中导入 `miniprogram`。开发工具会访问 `http://127.0.0.1:3002`，真机开发访问 `miniprogram/utils/config.js` 中配置的局域网地址（手机和电脑须在同一局域网）。正式版需填写 HTTPS `productionApiBaseUrl`，并在公众平台配置 request、downloadFile 和图片合法域名。

如果电脑为远程主机、手机不在该内网，或 Wi-Fi 有终端隔离，手机无法通过此 IP 访问；应使用有授权的 HTTPS 测试服务，不要直接开放当前未鉴权的演示后端到公网。

### 手机能访问健康检查，但微信拦截接口域名

开发工具 `urlCheck:false` 只满足开发调试配置，不代表手机端已打开调试。开发版启动时现在会调用 `wx.setEnableDebug({ enableDebug: true })`；仅对 `envVersion === 'develop'` 生效，体验版和正式版不自动开启。改动后请结束旧调试会话、重新编译并扫码进入；如果微信提示重启才能生效，需退出当前小程序后再进入。

若自动开启不成功，在手机小程序右上角菜单中找到“开发调试 / 打开调试”，开启后退出并重新进入；并确认开发者工具“详情 → 本地设置”中的“不校验合法域名、TLS 版本及 HTTPS 证书”已勾选。不同微信版本菜单名称可能不同。

该方式仅供同局域网的开发调试。正式连接方式仍为部署 HTTPS API，并在公众平台配置 request 合法域名。参考：[微信网络能力说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。

## 课程阅读层级

- 学习页沿用现有主题分类和独立章节入口；点击任一章节目录后，直接显示该章对应的小章节，无需选择思维模式。
- 当前每章包含问题导入、重点阅读、随堂练习，复用原章节问题、正文和练习，不替换已有课程。小章节内容在 `miniprogram/utils/lesson-sections.js` 配置。
- 小章节完成记录按课程、章节隔离，保存在 `blueprintReading`；原来的 `blueprintLearning` 与已完成章节记录保留，旧版小章节记录兼容读取。完成该章全部小章节后记录章节完成，再直接显示下一章的小章节；只打开或跳读最后一个小章节不会误记整章完成。
- 章节页已挂载 PDF / Word 资料组件，后端已注册资料路由。当前 `server/materials/catalog.json` 为空，尚无真实附件；按 [资料说明](server/materials/README.md) 添加授权的 PDF / DOC / DOCX，即可在对应课程阅读。正式版还需配置 HTTPS、request/downloadFile 合法域名及后端鉴权。

完整的初始化、部署、密码重置与备份恢复步骤见 [ADMIN_SETUP.md](ADMIN_SETUP.md)。

## 管理后台与 API

管理后台入口：`/admin/`。首次使用前请通过 `scripts/manage.cjs init-admin` 创建管理员，不提供公开注册和通用默认密码。后台支持：

- 应用内品牌名称、Logo、默认头像、欢迎/帮助文案和三个固定导航的名称与图标；微信公众平台显示的官方名称、头像不由本后台修改。
- 主题、课程封面与标题、章节、小章节正文、练习、排序、归档、草稿保存与原子发布。
- PNG/JPEG/WebP 图片和 PDF/DOC/DOCX 文档上传、资源管理、资料关联到课程/章节/小章节及上下架。
- 用户搜索、禁用/启用、应用内备注、课程权益授予/撤销、学习记录查看。
- 批量卡密、课程范围、兑换截止时间、访问时长、一次性明文导出、批次停用、掩码卡密和核销审计。

主要公共接口：`GET /api/bootstrap`、`POST /api/auth/wechat`、`POST /api/auth/dev`（仅显式本地测试）、`GET /api/courses`、`GET /api/courses/:id`、`POST /api/redeem`、`GET/PUT /api/me/learning`、`GET /api/materials?scope=course|chapter|section&ownerId=...`、`GET /api/materials/:id/file`。完整字段和管理员接口见 [BACKEND_CONTRACT.md](BACKEND_CONTRACT.md)。

微信 AppSecret 未配置时，正式微信登录会明确返回服务未配置，不会伪造正式用户。`DEV_AUTH=1` 只允许开发工具通过回环地址使用本地测试身份；不能用于生产。用户权益、正文和每次文档下载均由服务端校验，重启后数据库、卡密、用户和学习进度仍保留。

## 验证

- `npm test`：JS / JSON、五色与玻璃材质约束、组件完整性、章节内容、本地学习记录、主题 → 章节目录 → 小章节流程，以及 PDF / Word 组件与 API 测试。
- `scripts/verify-ui.cjs`：使用可选的微信 `miniprogram-automator` SDK，连接开发者工具自动化端口 9420，在真实模拟器中检查并截图。新版流程需在本地服务以 `DEV_AUTH=1` 启动后，使用隔离测试账号并先授予测试课程权益；脚本不应连接旧 3000 端口。运行前需准备 SDK（或通过 `MINIPROGRAM_AUTOMATOR_PATH` 指定独立安装位置）。
- `artifacts/ui/`：实测截图与 `verification.json`。自动化测试必须使用隔离测试账号和卡密，结束后恢复设备缓存，不要使用真实用户或生产卡密。
