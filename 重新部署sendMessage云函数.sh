#!/bin/bash

echo "🚀 开始重新部署sendMessage云函数..."

# 进入sendMessage云函数目录
cd cloudfunctions/sendMessage

# 确保依赖已安装
echo "📦 检查并安装依赖..."
npm install

# 返回项目根目录
cd ../../

echo "⚡ 重新部署sendMessage云函数..."

# 使用微信开发者工具命令行工具部署（如果可用）
# 如果没有命令行工具，需要手动在微信开发者工具中部署

echo "✅ 部署准备完成！"
echo ""
echo "📋 接下来的步骤："
echo "1. 在微信开发者工具中打开项目"
echo "2. 点击 '云开发' 控制台"
echo "3. 进入 '云函数' 页面"
echo "4. 找到 'sendMessage' 云函数"
echo "5. 点击 '部署' 按钮"
echo "6. 等待部署完成"
echo ""
echo "🔍 验证方法："
echo "- 部署完成后，在聊天页面发送消息"
echo "- 检查控制台是否还有 errCode: -504002 错误"
echo "- 如果没有错误，说明云函数修复成功" 