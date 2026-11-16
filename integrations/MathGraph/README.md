# 数学图谱 MathGraph

**初中数学自适应学习平台** — 基于人教版知识图谱，精准诊断薄弱根因，智能生成学习路径。

---

## 功能简介

| 模块 | 说明 |
|------|------|
| 知识图谱 | 可视化浏览 169 个知识点及 237 条依赖关系，按年级、领域展开 |
| 错题诊断 | 录入错题，支持拍照/上传图片，自动映射知识点并沿依赖链回溯定位根因 |
| 学习路径 | 基于拓扑排序生成个性化学习路径，跳过已掌握，逐级推进 |
| 练习闯关 | 四档难度（夯基→目标→综合→挑战），自动判题 + 错题收录 |

---

## 快速开始（一键部署）

### 准备工作

- 电脑上安装 **Python 3.9 或更高版本**
  - 下载地址：https://www.python.org/downloads/
  - 安装时勾选"Add Python to PATH"

### 部署步骤

打开终端（Mac 按 `Cmd+空格` 搜索"终端"；Windows 搜索"命令提示符"），进入项目目录后执行：

```bash
# 1. 赋予脚本执行权限
chmod +x setup.sh start.sh

# 2. 一键部署
bash setup.sh
```

部署完成后，脚本会询问是否立即启动。启动后浏览器访问：

```
http://127.0.0.1:5555
```

### 后续启动

```bash
bash start.sh
```

### 停止应用

在终端中按 `Ctrl+C` 即可停止。

---

## 演示账号

部署完成后，系统会自动创建演示账号：

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 教师 | teacher | 123456 |
| 学生 | student1 ~ student3 | 123456 |

---

## 手动部署（可选）

如果一键部署脚本无法使用，可以手动执行以下步骤：

```bash
# 1. 创建虚拟环境
python3 -m venv venv

# 2. 激活虚拟环境
# Mac / Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 3. 安装依赖
pip install Flask==3.1.0 Flask-Login==0.6.3 Flask-SQLAlchemy==3.1.1 Werkzeug==3.1.8

# 4. 启动应用
python -c "from run import app, init_demo_data; init_demo_data(); app.run(host='0.0.0.0', port=5555, debug=True)"
```

---

## 技术栈

- **后端**：Python + Flask + SQLAlchemy + SQLite
- **前端**：Bootstrap 5 + Chart.js + vis-network + KaTeX + Alpine.js

---

## 项目结构

```
mathgraph/
├── setup.sh              # 一键部署脚本
├── start.sh              # 启动脚本
├── run.py                # 应用入口
├── app/
│   ├── __init__.py       # 应用工厂
│   ├── config.py         # 配置文件
│   ├── models/           # 数据模型
│   ├── views/            # 视图蓝图
│   ├── services/         # 业务逻辑
│   ├── utils/            # 工具函数
│   ├── templates/        # HTML 模板
│   ├── static/           # 静态资源
│   └── data/             # 知识图谱数据
└── uploads/              # 错题图片上传目录
```

---

## 常见问题

**Q: 启动时提示端口被占用？**
A: 修改启动命令中的端口号，例如 `port=5556`。

**Q: 如何重置数据？**
A: 删除 `instance/` 目录下的 `.db` 文件，重新启动即可自动重建。

**Q: 如何修改密码？**
A: 登录后通过"个人设置"修改，或联系管理员。

**Q: 支持 Windows 吗？**
A: 支持。在 Windows 命令提示符中运行 `bash setup.sh`（需要 Git Bash），或参考手动部署步骤。