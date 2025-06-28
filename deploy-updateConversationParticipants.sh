#!/bin/bash

# 部署 updateConversationParticipants 云函数
# 使用方法：在微信开发者工具中执行或手动部署

echo "🚀 开始部署 updateConversationParticipants 云函数"

# 检查云函数是否存在
if [ ! -d "cloudfunctions/updateConversationParticipants" ]; then
    echo "❌ 云函数目录不存在"
    exit 1
fi

echo "📁 云函数目录已找到"

# 检查package.json是否存在
if [ ! -f "cloudfunctions/updateConversationParticipants/package.json" ]; then
    echo "❌ package.json不存在"
    exit 1
fi

echo "📦 package.json已找到"

# 切换到云函数目录
cd cloudfunctions/updateConversationParticipants

# 安装依赖
echo "📥 安装云函数依赖..."
npm install

# 检查node_modules是否存在
if [ ! -d "node_modules" ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo "✅ 依赖安装完成"

cd ../..

echo "📋 部署说明："
echo "1. 打开微信开发者工具"
echo "2. 进入云开发控制台"
echo "3. 选择函数管理"
echo "4. 找到 updateConversationParticipants 函数"
echo "5. 点击部署，选择云端安装依赖"
echo "6. 等待部署完成"

echo ""
echo "🔧 或者在微信开发者工具控制台执行："
echo "wx.cloud.getFunctionManager().deploy('updateConversationParticipants')"

echo ""
echo "📝 云函数功能："
echo "- 更新会话参与者信息"
echo "- 修复参与者重复问题"
echo "- 确保数据库一致性"

echo ""
echo "✅ 准备工作完成，请手动部署云函数" 