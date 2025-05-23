#!/bin/bash

echo "🚀 设置 ETH Swap Analyzer 项目..."

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，需要 18+，当前版本: $(node -v)"
    exit 1
fi

echo "✅ Node.js 版本检查通过: $(node -v)"

# 安装依赖
echo "📦 安装项目依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo "✅ 依赖安装完成"

# 创建环境变量文件
if [ ! -f ".env.local" ]; then
    echo "📝 创建环境变量文件..."
    cp env.example .env.local
    echo "✅ 已创建 .env.local 文件，请编辑配置你的 RPC 节点"
else
    echo "ℹ️  .env.local 文件已存在"
fi

# 类型检查
echo "🔍 运行类型检查..."
npm run type-check

if [ $? -ne 0 ]; then
    echo "⚠️  类型检查发现问题，但项目仍可运行"
fi

echo ""
echo "🎉 项目设置完成！"
echo ""
echo "📋 下一步操作："
echo "1. 编辑 .env.local 文件，配置你的以太坊 RPC 节点"
echo "2. 运行 'npm run dev' 启动开发服务器"
echo "3. 访问 http://localhost:3000"
echo ""
echo "💡 推荐使用 Alchemy 或 Infura 作为 RPC 提供商以获得更好的性能" 