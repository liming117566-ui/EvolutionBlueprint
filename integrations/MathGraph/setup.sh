#!/bin/bash
# ============================================
# 数学图谱 一键部署脚本
# 适用于 macOS / Linux
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$PROJECT_DIR/venv"
PORT="${PORT:-5555}"

echo -e "${BLUE}"
echo "  ╔══════════════════════════════╗"
echo "  ║     数学图谱 MathGraph       ║"
echo "  ║   初中数学自适应学习平台      ║"
echo "  ╚══════════════════════════════╝"
echo -e "${NC}"

# ---------- 1. 检查 Python ----------
echo -e "${YELLOW}[1/6] 检查 Python 环境...${NC}"
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo -e "${RED}错误：未找到 Python，请先安装 Python 3.9+${NC}"
    echo "  下载地址：https://www.python.org/downloads/"
    exit 1
fi

PY_VER=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo -e "  找到 Python ${GREEN}$PY_VER${NC}"

# 版本检查
MAJOR=$($PYTHON -c "import sys; print(sys.version_info.major)")
MINOR=$($PYTHON -c "import sys; print(sys.version_info.minor)")
if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 9 ]); then
    echo -e "${RED}错误：需要 Python 3.9 或更高版本${NC}"
    exit 1
fi
echo -e "${GREEN}  Python 版本符合要求${NC}"

# ---------- 2. 创建虚拟环境 ----------
echo -e "${YELLOW}[2/6] 创建虚拟环境...${NC}"
if [ ! -d "$VENV_DIR" ]; then
    $PYTHON -m venv "$VENV_DIR"
    echo -e "${GREEN}  虚拟环境创建完成${NC}"
else
    echo -e "  虚拟环境已存在，跳过"
fi

# 激活虚拟环境
source "$VENV_DIR/bin/activate"

# ---------- 3. 安装依赖 ----------
echo -e "${YELLOW}[3/6] 安装 Python 依赖...${NC}"
pip install --quiet --upgrade pip
pip install --quiet Flask==3.1.0 Flask-Login==0.6.3 Flask-SQLAlchemy==3.1.1 Werkzeug==3.1.8
echo -e "${GREEN}  依赖安装完成${NC}"

# ---------- 4. 创建必要目录 ----------
echo -e "${YELLOW}[4/6] 创建必要目录...${NC}"
mkdir -p "$PROJECT_DIR/uploads"
mkdir -p "$PROJECT_DIR/instance"
echo -e "${GREEN}  目录创建完成${NC}"

# ---------- 5. 初始化数据库 ----------
echo -e "${YELLOW}[5/6] 初始化数据库...${NC}"
cd "$PROJECT_DIR"
$PYTHON -c "
from app import create_app, db
app = create_app()
with app.app_context():
    db.create_all()
print('数据库初始化完成')
"
echo -e "${GREEN}  数据库初始化完成${NC}"

# ---------- 6. 完成提示 ----------
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       部署成功！数学图谱已就绪       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  启动方式："
echo -e "  ${BLUE}方式一（开发模式）${NC}"
echo -e "    source venv/bin/activate"
echo -e "    python -c \"from run import app; app.run(host='0.0.0.0', port=$PORT, debug=True)\""
echo ""
echo -e "  ${BLUE}方式二（一键启动）${NC}"
echo -e "    bash start.sh"
echo ""

# 询问是否立即启动
read -p "  是否立即启动应用？[Y/n] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]?$|^$ ]]; then
    echo -e "${BLUE}正在启动应用，访问 http://127.0.0.1:$PORT${NC}"
    echo -e "${YELLOW}按 Ctrl+C 停止应用${NC}"
    echo ""
    $PYTHON -c "
from run import app, init_demo_data
init_demo_data()
app.run(host='0.0.0.0', port=$PORT, debug=True)
"
fi