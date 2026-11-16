#!/bin/bash
# ============================================
# 数学图谱 启动脚本
# ============================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$PROJECT_DIR/venv"
PORT="${PORT:-5555}"

# 激活虚拟环境
if [ -f "$VENV_DIR/bin/activate" ]; then
    source "$VENV_DIR/bin/activate"
else
    echo "错误：未找到虚拟环境，请先运行 setup.sh"
    exit 1
fi

# 检查端口是否被占用
if lsof -i ":$PORT" &>/dev/null 2>&1; then
    echo "端口 $PORT 已被占用，尝试使用 5556..."
    PORT=5556
fi

echo "正在启动数学图谱..."
echo "访问地址：http://127.0.0.1:$PORT"
echo "按 Ctrl+C 停止应用"
echo ""

cd "$PROJECT_DIR"
export PORT
python run.py