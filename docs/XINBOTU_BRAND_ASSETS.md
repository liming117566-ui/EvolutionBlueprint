# 新博途品牌资源

小程序内品牌、导航栏标题、本地工程名称和后台已改为“新博途”。三个旧板块“专注与习惯”“思维训练”“身心成长”从草稿和发布配置移除，剩余 14 个板块。旧课程正文、兑换记录和学习历史保留，不进行破坏性删除。

账号默认用户名改为随机中文名称与数字组合，例如“好奇白鹭2062”。名称保存于服务端，重复登录和重启保持一致；旧默认昵称会迁移，已自定义的昵称会保留。“我的”页面直接显示当前账号的名称。

## 图片与图标

首页原主图、板块插画及图标方案由用户指定的 `https://auroraq.top/v1` 图片接口、`gpt-image-2.6` 模型生成。2026-11-16，用户从五款新图标中选定第 4 款“拾级而上”，应用品牌图标统一使用琥珀黄与炭黑配色。本轮按新 UI 重新生成全部 14 张横向课程封面，使用薄荷绿、浅蓝、米白和黄色点缀，保留已选应用图标。

- 应用图标原图：`output/imagegen/xinbotu-app-icon.png`，1024×1024 PNG，完整正方形，未预先裁圆角，可作为微信头像上传文件。
- 应用内图标：`miniprogram/assets/generated/app-icon.webp`，256×256。
- 首页主图：`output/imagegen/home-hero.png`；小程序内压缩版为 `miniprogram/assets/generated/home-hero.webp`。
- 各板块原图：`output/imagegen/<board-id小写>.png`。
- 各板块运行资源：`miniprogram/assets/generated/<board-id小写>-cover.webp` 与 `-icon.webp`，分别 576×576、192×192。
- 当前课程横向封面：`miniprogram/assets/generated/<board-id小写>-landscape.webp`，768×432；原图 `output/imagegen/ui-v2/<board-id小写>.png`，1536×1024。旧正方形封面保留以兼容历史配置。
- 当前首页主横幅使用参考 UI 的黄色书本构图，由原生样式实现；旧首页图片保留供历史配置使用。
- 图标设计：琥珀黄背景、炭黑圆角路径与上升阶梯，融入向前上方的箭头，寓意拾级而上。
- 选定方案原图：`output/imagegen/icon-explorations/04-amber-upward-route.png`，已同步到应用图标原图；首页、兑换页及后台品牌图标和网站图标共用上述 WebP 资源。
- 旧版书本路径图标存档：`output/imagegen/xinbotu-app-icon-book-path.png`。
- 完整提示词、模型和选用记录：`output/imagegen/prompts.json`；五款备选的记录为 `output/imagegen/icon-explorations/prompts.json`。不包含 API 密钥。

14 张新横向封面合计约 211 KiB。生成图片资源共约 485 KiB，小程序源文件总计约 669 KiB。使用 `node scripts/prepare-brand-images.cjs` 可打包原图片，`node scripts/prepare-landscape-images.cjs` 打包当前横向封面。`server/catalog.js` 迁移 6、7、8、9 分别处理品牌/板块、原主题图片、应用图标及横向封面；各迁移只执行一次，后续后台图片修改会保留。

用户提供的 API 密钥仅在本机忽略目录 `artifacts/imagegen/` 的私有配置中使用，没有放入小程序、公开图片或提交跟踪的代码。生成动作发生在本地，不需要把密钥交给客户端。

## 验证

153 项自动检查通过。品牌、板块删除、图片引用、用户名称持久化及旧数据兼容均有覆盖；当前 11 个新增网页的浏览器检查通过。微信开发者工具实际检查了首页品牌图标、14 个板块、各自图片、原有全通权限和随机用户名，无运行异常。

报告与截图：`artifacts/devtools/xinbotu-ui-verification.json`、`xinbotu-home.png`、`xinbotu-learn.png`、`xinbotu-profile.png`。本次未上传或修改微信公众平台的正式头像与注册名称；本地工程、小程序页面和后台已接入。
