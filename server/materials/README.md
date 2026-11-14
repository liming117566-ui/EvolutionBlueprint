# 学习资料（PDF / Word）

后台资料库初始为空；未上传任何真实学习文件，不会显示虚构附件。课程内容种子位于 `server/seed.json`，由 SQLite 首次初始化导入。

## 接入（已完成）

资料路由和章节阅读组件已经由 `server/app.js` 与 `pages/lesson/lesson.json` 接入。后台可上传资源并关联到课程、章节或小章节；小程序请求会携带当前用户 Bearer 会话。

`scope` 支持 `course`、`chapter`、`section`，`ownerId` 必须是当前已发布内容中的稳定 ID。资料列表和下载都重新检查课程权益，未登录、无权限、下架内容均不会返回文件。组件从 `miniprogram/utils/config.js` 读取环境配置，不使用模拟附件或静默离线回退。

## 添加自己的文件

后台上传是推荐方式，文件会保存到受控数据目录并写入 SQLite。若需要兼容旧的本地目录，仍可在本目录的 `files` 文件夹中放入获得授权的 `.pdf`、`.doc` 或 `.docx`，单个文件大于 0 且不超过 **20 MiB（20 × 1024 × 1024 字节）**，再维护 `catalog.json` 条目。后台上传文件不要复制到公开静态目录。

将条目加入本目录的 `catalog.json` 数组。例如，以下仅是兼容配置格式，必须先自行提供对应文件，不代表项目已包含该资料：

   ```json
   [
     {
       "id": "your-material-id",
       "scope": "course",
       "ownerId": "your-course-id",
       "title": "你的学习资料标题",
       "file": "your-material.pdf"
     }
   ]
   ```

3. 保存后重新加载小程序页面或点击“重新加载”。旧目录与文件每次请求都会检查；后台 SQLite 资料关联保存后立即生效，首次改动服务端代码需重启 `npm run dev`。

`id` 必须唯一，且仅含英文字母、数字、下划线、短横线，长度 1–100。文件名只允许单层本地文件名（支持中文和空格），不允许路径、`..`、URL、符号链接、Windows 保留设备名或特殊路径字符；不支持子目录。扩展名不区分大小写。文件需具有对应格式的基础签名字节，空文件、丢失文件、超限文件、格式签名不符、非法目录条目及重复 ID 不会公开。基础签名校验不等于完整文档验证或杀毒，管理员仍须检查文件来源；受密码保护、损坏或客户端不支持的文档可能无法打开。

## API

- `GET /api/materials?scope=course|chapter|section&ownerId=...` 返回：
  ```json
  { "materials": [{ "id": "your-material-id", "title": "你的学习资料标题", "fileType": "pdf", "url": "/api/materials/your-material-id/file", "sizeBytes": 12345 }] }
  ```
- `GET /api/materials/:id/file` 仅流式发送检查通过的本地文件，不代理外部地址。文件在列出后被移除时返回 404。
- 查询参数错误返回 400；合法但无资料返回 `{ "materials": [] }`；目录损坏或读取错误返回 500，不伪装成空列表。
- 管理上传接口为 `POST /api/admin/assets`（管理员 Cookie + CSRF），资料关联接口为 `/api/admin/materials`；不要通过 `express.static` 公开数据库、上传目录、`materials` 或 `files` 目录。

## 微信下载域名与临时文件

- 开发版：使用配置中的局域网 HTTP 地址，手机与电脑须在同一局域网，电脑端口可访问。开发者工具的“不校验合法域名…”仅适合本地开发，真机调试也需匹配调试环境；关闭校验不能解决防火墙或网络不可达。工具不接受公网 HTTP、带凭据的 URL、任意路径或非 HTTP(S) 协议。
- 体验版 / 正式版：配置 HTTPS API 地址，并在微信公众平台同时配置 **request 合法域名**和 **downloadFile 合法域名**，使用有效证书。开发用 HTTP 和 localhost 不可作为正式方案；缺少环境信息时不放行 HTTP。
- 组件先检查下载状态为 200，再调用 `wx.openDocument`，传入 `fileType` 和 `showMenu: true`。下载/打开失败可重试，不做 `saveFile` 持久保存。
- 原生阅读器打开成功的 `success/complete` 仅表示交接成功，不代表用户已关闭阅读器。为避免正在阅读的文件被删除，临时文件在下次应用/页面显示（从阅读器返回）时清理。组件销毁时会中止未完成的下载；正在原生阅读的文件继续由应用显示监听器负责清理，不因页面销毁提前删除。异常退出未能触发返回时，文件仍只是微信管理的临时文件，不是应用持久缓存。
- 需要支持 `wx.onAppShow`、`wx.offAppShow` 与文件系统 API 的微信基础库；不支持时提示升级，不创建无法管理的下载。

## 安全边界与测试

资料服务现在要求小程序用户 Bearer 会话和课程权益；列表与文件下载都会重新鉴权，撤权或下架后后续请求失败。原生阅读器已经接收的临时文件无法由服务端远程收回。正式上线仍需 HTTPS、微信合法域名、真实 AppSecret、内容审计和部署级备份。

在项目根目录运行 `npm test`，或单独运行 `node --test scripts/documents.test.cjs`。测试通过微信 API mock 验证下载/打开/清理与组件竞态，并使用只监听 `127.0.0.1` 的临时 HTTP 服务和临时目录验证路由，不会绑定公网，也不会修改实际目录或添加真实学习文件。
