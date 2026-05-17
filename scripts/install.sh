#!/bin/bash
#
# MixIQ - Claude Code MCP 服务器一键安装脚本
#
# 使用方法:
#   curl -fsSL https://raw.githubusercontent.com/5shunchen/mixiq/main/scripts/install.sh | bash
#   或者在项目目录运行: bash scripts/install.sh
#

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}
╔═══════════════════════════════════════════════════╗
║     🚀 MixIQ - Claude Code MCP 服务器              ║
║         一键安装程序 v1.0.0                        ║
╚═══════════════════════════════════════════════════╝
${NC}"

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装，请先安装 Node.js 18+${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 版本过低: v${NODE_VERSION}，需要 v18+${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js v${NODE_VERSION} 已安装${NC}"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm 已安装${NC}"

# 确定安装目录
INSTALL_DIR="$HOME/.mixiq/mcp-server"
echo -e "\n📂 安装目录: ${YELLOW}${INSTALL_DIR}${NC}"

# 克隆或更新代码
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "\n🔄 更新现有代码..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo -e "\n📥 克隆代码库..."
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone https://github.com/5shunchen/mixiq.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 安装依赖
echo -e "\n📦 安装依赖..."
npm install --production

# 构建项目
echo -e "\n🔨 构建项目..."
npm run build

# 安装到 Claude Code
echo -e "\n⚙️  配置到 Claude Code..."
node scripts/install-mcp.js

echo -e "\n${GREEN}═══════════════════════════════════════════════════"
echo -e "🎉 MixIQ MCP 服务器安装成功！"
echo -e "═══════════════════════════════════════════════════${NC}"
echo -e ""
echo -e "📖 快速开始:"
echo -e "   1. 重启 Claude Code"
echo -e "   2. 输入 /mcp 验证服务器连接"
echo -e "   3. 开始使用 MixIQ 的 37 个开发运维工具！"
echo -e ""
echo -e "🔗 GitHub: https://github.com/5shunchen/mixiq"
echo -e ""
