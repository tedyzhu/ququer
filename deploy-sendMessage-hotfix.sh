#!/bin/bash

# HOTFIX-v1.3.27 sendMessage云函数participants自动更新修复部署脚本

echo "🔧 开始部署sendMessage云函数热修复..."

# 检查是否在项目根目录
if [ ! -f "project.config.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查云函数目录是否存在
if [ ! -d "cloudfunctions/sendMessage" ]; then
    echo "❌ 错误：找不到sendMessage云函数目录"
    exit 1
fi

echo "📁 进入sendMessage云函数目录..."
cd cloudfunctions/sendMessage

echo "📦 安装依赖..."
npm install

echo "🚀 部署sendMessage云函数..."
# 尝试多种部署命令格式
echo "尝试方式1: tcb fn deploy"
npx tcb fn deploy sendMessage || {
    echo "方式1失败，尝试方式2: cloudbase functions:deploy"
    npx @cloudbase/cli functions:deploy sendMessage || {
        echo "方式2失败，尝试方式3: 使用微信开发者工具命令"
        echo "请使用微信开发者工具手动上传云函数"
        exit 1
    }
}

if [ $? -eq 0 ]; then
    echo "✅ sendMessage云函数部署成功！"
    echo ""
    echo "🎯 修复内容："
    echo "- 自动将发送者添加到participants列表"
    echo "- 确保发送消息时participants正确更新"
    echo "- 触发参与者监听器检测新参与者"
    echo ""
    echo "📋 测试步骤："
    echo "1. a创建聊天并分享邀请"
    echo "2. b加入聊天并发送消息"
    echo "3. 验证a的标题更新为'我和xx(2)'"
    echo "4. 验证双向消息传递正常"
    echo ""
    echo "🎉 HOTFIX-v1.3.27 部署完成！"
else
    echo "❌ sendMessage云函数部署失败"
    exit 1
fi

cd ../..
echo "🏁 返回项目根目录" 