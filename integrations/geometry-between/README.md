# 几何之间 · 网站源码

原生 HTML、CSS、JavaScript 编写，无构建步骤，无需安装第三方依赖。保留可编辑源码、站内阅读页图、PDF 阅读器和开发者资料发布工具。

## 启动

解压完整代码包后，在项目根目录运行：

```sh
node web/server.js
```

打开 http://localhost:4173 。已安装 npm 时也可以运行 `npm start`，无需先运行 `npm install`。Windows 用户可运行 `启动网站.ps1`。

## 主要文件

| 路径 | 用途 |
| --- | --- |
| `web/index.html` | 网站入口和导航 |
| `web/app.js` | 页面、路由、搜索与学习记录 |
| `web/data.js` | 110 个数学专题与学习内容 |
| `web/scenes.js` | 图形参数演示与数学计算 |
| `web/styles.css`、`web/typography.css` | 页面布局与醒目字体 |
| `web/materials.js`、`web/materials.css` | 使用者资料预览与打印 |
| `web/materials-catalog.js`、`web/materials/` | 开发者发布的资料清单与文件 |
| `web/pages/` | 296 页原书正文页图 |
| `web/vendor/` | PDF.js、字库及其许可证 |
| `web/server.js` | 仅监听本机的静态服务 |
| `tools/publish-material.cjs` | 开发者本地资料发布工具 |
| `tests/` | 数学计算、资料范围与发布流程校验 |

## 发布开发者资料

```sh
node tools/publish-material.cjs "资料路径.pdf" "讲义名称"
```

工具将文件复制到 `web/materials/`，并更新资料清单。刷新网站即可查看。使用者页面提供查看和打印，没有资料上传、修改、删除或独立下载入口。公开服务仅支持 GET / HEAD，资料发布需要访问项目文件。

## 校验

```sh
node tests/verify.cjs
node tests/materials.cjs
```

也可运行 `npm test`。

## 代码包内容

包含完整网站源码、296 张阅读页图和本地 PDF 阅读依赖，可直接运行。原始 406 MB 扫描 PDF 不在包内；站内页图阅读和专题打印可正常使用。若需要“打开完整 PDF”，将原 PDF 放在项目根目录。

详细功能、打印限制及资料维护方式见 `网站使用说明.md`。部署静态网站时使用 `web/` 文件夹；本地开发工具与脚本保留在项目根目录。
