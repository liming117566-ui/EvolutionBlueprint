# 新博途横版课程配图

为新 UI 重新生成的 14 张课程封面，按当前 14 个学习板块逐一对应。使用用户先前指定的 `https://auroraq.top/v1` 接口与 `gpt-image-2.6` 模型，通过 imagegen 技能自带的 `image_gen.py generate-batch` 生成，未修改技能脚本，也未创建自定义 API 调用器。

配图采用明黄、炭黑、淡薄荷绿和淡蓝色，横向组织书籍、纸张、文具和学科图形。图片不预置卡片圆角、不含平台品牌或水印；课程标题与板块名称由程序文本层显示。它们是新的横版画面，未拉伸旧版方形封面。

- `*.png`：1536×1024 生成原图。
- `prompts.json`：每个板块的提示词、模型与输出文件记录，不包含 API 密钥。
- `verification.json`：尺寸、散列与打包文件大小验证。
- `contact-sheet.webp`：14 个横版封面的预览。
- 运行资源：`miniprogram/assets/generated/<board-id小写>-landscape.webp`，768×432，每张不超过 50 KiB。

运行 `node scripts/prepare-landscape-images.cjs` 可从本目录的原图重新生成 WebP 资源。此脚本保留旧版图片，且不会改动现有新博途黄黑应用图标。
