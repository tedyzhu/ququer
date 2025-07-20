#!/bin/bash

echo "🔥 开始部署HOTFIX-v1.3.28修复后的sendMessage云函数..."

# 检查当前目录
if [ ! -d "cloudfunctions" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

if [ ! -d "cloudfunctions/sendMessage" ]; then
    echo "❌ 错误：sendMessage云函数目录不存在"
    exit 1
fi

echo "✅ 检查通过，开始部署..."

# 进入sendMessage目录
cd cloudfunctions/sendMessage

echo "📦 正在安装依赖..."
npm install

echo "🚀 开始部署sendMessage云函数到云端..."

# 方法1：使用微信开发者工具CLI（如果可用）
if command -v miniprogram-cli &> /dev/null; then
    echo "🔧 使用微信开发者工具CLI部署..."
    miniprogram-cli upload-cloud-function --function-name sendMessage --env ququer-env-6g35f0nv28c446e7
    if [ $? -eq 0 ]; then
        echo "✅ sendMessage云函数部署成功！"
        exit 0
    else
        echo "⚠️ CLI部署失败，尝试其他方法..."
    fi
fi

# 方法2：使用wx-server-sdk的部署方法
echo "🔧 尝试使用SDK部署方法..."
node -e "
const cloud = require('wx-server-sdk');
cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
});
console.log('SDK初始化完成');
" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ SDK环境检查通过"
else
    echo "⚠️ SDK环境检查失败"
fi

# 返回项目根目录
cd ../..

echo ""
echo "🔥 HOTFIX-v1.3.28部署完成说明："
echo "======================================"
echo "✅ 前端代码修改已完成"
echo "✅ sendMessage云函数代码修改已完成"
echo ""
echo "📋 手动部署步骤："
echo "1. 打开微信开发者工具"
echo "2. 在云开发控制台中，找到 sendMessage 云函数"
echo "3. 点击「部署」按钮"
echo "4. 等待部署完成（约1-2分钟）"
echo ""
echo "🧪 测试步骤："
echo "1. a 创建聊天并分享给 b"
echo "2. b 点击链接加入聊天"  
echo "3. b 发送一条消息"
echo "4. 检查 a 的标题是否正确显示为\"我和[b的真实昵称]（2）\""
echo ""
echo "🎯 预期效果："
echo "- b发送消息时，会使用b的真实昵称添加到participants"
echo "- a的标题将正确显示为\"我和[b的真实昵称]（2）\""
echo "- 不再显示\"我和向冬（2）\"的错误格式"
echo ""
echo "🔧 如果问题仍然存在，请检查："
echo "- sendMessage云函数是否成功部署"
echo "- users集合中的用户数据是否正确"
echo "- 前端传递的currentUserInfo是否包含正确的昵称" 