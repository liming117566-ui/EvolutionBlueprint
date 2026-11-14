# 管理后台初始化与部署

## 本地启动

需要 Node.js 26，运行 `npm install`。复制 `.env.example` 为 `.env`，本地配置示例：

```dotenv
HOST=127.0.0.1
PORT=3002
PUBLIC_ORIGIN=http://localhost:3002
DATA_DIR=./server/data
DEV_AUTH=1
WX_APPID=你的小程序AppID
WX_APPSECRET=
```

明确设置临时环境变量 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 后创建管理员；账号为 3–60 位字母、数字、点、下划线或短横线，密码 12–128 位。不提供默认账号密码。不要把实际密码发到聊天或写入源码。

```bash
node scripts/manage.cjs init-admin
```

初始化后移除两个管理员环境变量。启动：

```bash
npm run dev
```

后台入口为 `http://localhost:3002/admin/`。PUBLIC_ORIGIN 必须和浏览器实际使用的来源一致，包括 localhost/127.0.0.1 和端口；否则写请求将被拒绝。

## 管理流程

- 内容与发布：品牌、名称、Logo、头像、欢迎/帮助文案、三项导航名图；主题、课程、章节、小节正文和练习、增删排序、归档。先保存草稿，再发布内容。微信官方小程序名称和头像仍须在公众平台修改。
- 资源库：上传 PNG/JPEG/WebP（最大 5 MiB）和 PDF/DOC/DOCX（最大 20 MiB）。图片解码后转为 WebP，不接受 SVG 上传。DOCX 检查 ZIP/OOXML 结构和宏文件，但文档校验不等于杀毒。
- 课程资料：选择已上传文档，关联课程、章节或小节，设置标题/顺序/上架。资料关联独立生效；所属内容未发布时不能访问。
- 用户与权益：用户登录后才出现在列表。查看学习记录、改应用昵称与管理员备注、禁用/启用、授予或撤销权益。
- 卡密与核销：生成 1–500 张单次卡密，可限制课程、兑换截止和访问天数。全部课程包含后续课程。完整卡密只生成时显示一次，立即保存；数据库只保存摘要和掩码。停用批次不自动撤销已兑换权益。
- 操作审计：查看关键登录、内容编辑、发布、上传、发卡、核销与权益管理记录。

## 微信接入

开发工具默认访问 `http://127.0.0.1:3002`。只有 develop + devtools 会显示明确的本地测试身份入口；服务端还必须显式开启 DEV_AUTH，且请求来源必须为回环。它不是微信身份，不能用于生产。

真实微信登录需要 WX_APPID/WX_APPSECRET；无 AppSecret 返回 503，绝不自动转成测试身份。小程序 `utils/config.js` 的正式 HTTPS 地址尚待填写。真机局域网调试还需 HOST 允许局域网监听、电脑防火墙和微信调试域名设置；默认 127.0.0.1 仅本机可达。

生产必须使用 `NODE_ENV=production`、HTTPS PUBLIC_ORIGIN、真实 AppSecret、DEV_AUTH=0；微信公众平台配置 request/downloadFile 及图片合法域名。反向代理转发到本机 Node 服务，保留原 Origin，生产 Cookie 使用 Secure。正式管理员登录限流会按实际连接来源计数，默认不盲目信任代理头。

## 数据与迁移

数据库为 DATA_DIR/blueprint.sqlite，文件为 DATA_DIR/uploads。不要静态公开此目录。初始内容来自 server/seed.json，仅空数据库导入一次。稳定 ID 与排序分离。旧本地 blueprintLearning/blueprintReading 在确认属于当前账号后可导入，旧完成章节不冒充全部小节完成，也不授予课程权限。

旧固定演示码 EVOLVE2026/BLUEPRINT01 不再兑换。旧 3000 进程内存兑换记录不能自动证明账号权益；须核验后在后台补授。实施未停止旧进程。

## 密码重置

本机临时设置 ADMIN_USERNAME 和新的 ADMIN_PASSWORD 后运行：

```bash
node scripts/manage.cjs reset-password
```

重置会撤销该管理员所有旧会话，完成后移除两个环境变量。

## 备份与恢复

备份目录必须不存在且位于 DATA_DIR 外；为保证数据库与文件一致，备份期间不要删除资源。

```bash
node scripts/manage.cjs backup C:/EvolutionBlueprint/artifacts/backups/manual-backup
```

恢复到新的空目录，核对后再在维护窗口把 DATA_DIR 指向恢复目录，不直接覆盖原数据库：

```bash
node scripts/manage.cjs restore C:/EvolutionBlueprint/artifacts/backups/manual-backup C:/EvolutionBlueprint/artifacts/restored-data
```

备份包括一致性 SQLite 快照、引用的上传文件和 SHA-256 manifest；不包括环境密钥，密钥应单独安全保管。已执行本地备份与恢复冒烟验证。测试数据已清理，源代码备份仍在 artifacts/source-backups/。

## 验证状态

`npm test` 已通过 82 项；`npm audit --omit=dev` 当前为 0 漏洞。管理端模块通过语法检查；本次管理端真实浏览器操作及新版微信模拟器联调尚因预览工具故障未完成，不应把 artifacts/ui 旧截图当作新后端验收证据。上线前必须补实际操作和真机微信登录验证。
