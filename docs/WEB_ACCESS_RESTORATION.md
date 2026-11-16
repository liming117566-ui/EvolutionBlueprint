# 学习网页恢复修复

问题：小程序的 `web-view` 保留了 `/web-access/:ticket` 入口，但该入口票据只允许交换一次。开发者工具恢复页面、重建 web-view 或刷新原入口时，票据已被消费，页面因此提示“网页访问已失效”。初中数学中已复现该过程。

修复：首次交换后保留票据的消费记录，同时签发只发送到 `/web-access` 的 HttpOnly 恢复 Cookie。重新载入原入口只返回验证壳页；恢复接口还必须检查恢复 Cookie、同一用户、同一登录会话、同一板块及当前兑换权益，才会重新进入课程。原票据本身仍不能重复交换或授权其他浏览器。

小程序从其他页面返回网页板块时，会重新申请入口。网页加载失败时自动重新申请一次；连续失败则保留手动重试按钮，避免循环刷新。

验证：

- 自动检查覆盖单次交换、票据过期、恢复 Cookie 缺失、非法来源、其他账号、兑换权益撤销、登录注销和跨板块访问。
- 浏览器逐个验证 14 个板块的首次进入、重新载入原票据入口及刷新课程页面。报告：`artifacts/devtools/web-access-restoration-browser.json`。
- 微信开发者工具逐个验证首次进入和重建 web-view，并检查隐藏/显示页面后重新签发入口。报告：`artifacts/devtools/web-access-restoration-native.json`；截图：`artifacts/devtools/restored-<board-id>.png`。

测试方式：`node --test scripts/test.cjs scripts/documents.test.cjs scripts/learning-flow.test.cjs scripts/backend.test.cjs scripts/web-packages.test.cjs scripts/website-entitlements.test.cjs scripts/brand-migration.test.cjs`。
