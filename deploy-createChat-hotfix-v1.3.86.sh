#!/bin/bash
# 🔥 【HOTFIX-v1.3.86】部署createChat云函数修复
# 修复问题：A端和B端系统消息重复显示3次，其中1个常驻不消失
# 根本原因：云函数createChat会添加系统消息到数据库，前端又本地添加系统消息，导致重复

echo "========================================="
echo "🔥 HOTFIX v1.3.86 - 修复系统消息重复"
echo "========================================="
echo ""
echo "问题: A端和B端系统消息重复3次，1个常驻"
echo "原因: 云函数添加系统消息 + 前端本地添加系统消息"
echo "修复: 取消云函数添加系统消息，由前端完全控制"
echo ""
echo "========================================="
echo "开始部署 createChat 云函数..."
echo "========================================="
echo ""

cd "$(dirname "$0")"

# 检查云函数目录是否存在
if [ ! -d "cloudfunctions/createChat" ]; then
  echo "❌ 错误: cloudfunctions/createChat 目录不存在"
  exit 1
fi

# 进入云函数目录
cd cloudfunctions/createChat

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖包..."
  npm install
  if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
  fi
else
  echo "✅ 依赖已安装，跳过"
fi

# 返回根目录
cd ../..

echo ""
echo "🚀 开始上传 createChat 云函数..."
echo ""

# 使用微信开发者工具命令行上传
# 注意：需要在微信开发者工具中开启命令行工具
wxdev upload --type cloudfunction --name createChat

if [ $? -eq 0 ]; then
  echo ""
  echo "========================================="
  echo "✅ createChat 云函数部署成功!"
  echo "========================================="
  echo ""
  echo "📋 修复内容:"
  echo "  1. 取消云端自动添加系统消息"
  echo "  2. 由前端完全控制系统消息的添加和淡出"
  echo "  3. 避免云端消息与本地消息重复"
  echo ""
  echo "🔍 预期效果:"
  echo "  - A端只显示1个系统消息: \"您创建了私密聊天...\""
  echo "  - B端只显示1个系统消息: \"加入XX的聊天\""
  echo "  - 系统消息8秒后自动淡出消失"
  echo "  - 不再出现重复的系统消息"
  echo ""
  echo "========================================="
  echo "⚠️  请测试以下场景:"
  echo "========================================="
  echo "  1. A端创建新聊天 → 应只显示1个创建消息"
  echo "  2. B端通过链接加入 → 应只显示1个加入消息"
  echo "  3. 等待8秒 → 系统消息应完全消失"
  echo "  4. A端应看到\"XX加入聊天\" → 替换创建消息"
  echo ""
else
  echo ""
  echo "========================================="
  echo "❌ createChat 云函数部署失败"
  echo "========================================="
  echo ""
  echo "请手动部署："
  echo "  1. 打开微信开发者工具"
  echo "  2. 右键点击 cloudfunctions/createChat"
  echo "  3. 选择\"上传并部署：云端安装依赖\""
  echo ""
  exit 1
fi

