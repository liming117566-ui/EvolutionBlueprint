# 服务器预览环境

服务器：`ubuntu@43.143.68.123:22`。后台：`http://43.143.68.123/admin/`。

此环境用于微信备案完成前的 IP 预览，`NODE_ENV=preview`，微信 AppSecret 留空，正式微信登录与测试身份登录均不启用。管理员仍需账号密码登录。小程序源码在发布目录的 `miniprogram/` 中，需要以后由微信开发者工具编译上传，复制到服务器不会自动发布为微信小程序。

- 代码：`/srv/evolution-blueprint/releases/<release>`，`current` 指向启用版本。
- 课程、账号和上传文件：`/var/lib/evolution-blueprint`，与代码独立。
- 环境配置：`/etc/evolution-blueprint/preview.env`。
- 服务：`evolution-blueprint.service`；使用 `sudo systemctl status evolution-blueprint` 和 `sudo journalctl -u evolution-blueprint` 查看状态与日志。
- Nginx 配置：`/etc/nginx/sites-available/evolution-blueprint`；HTTP 80 转发本机 3002，允许上传最大 500 MiB 的视频。
- 完整源码包及数据初始快照保留在 `/home/ubuntu/evolution-upload/`，均不由网站公开。

以后配置正式 HTTPS 域名、微信 AppSecret，并设置 `NODE_ENV=production`、HTTPS `PUBLIC_ORIGIN`；同步修改小程序 `utils/config.js` 的正式接口地址及微信合法域名。

更新时先备份数据库和上传资源，上传到新的 release，安装 Linux 依赖后切换 `current`，再重启服务。旧 release 可用于回退；数据库升级另行核对，不能用旧数据库快照覆盖后续新增的课程和用户。
