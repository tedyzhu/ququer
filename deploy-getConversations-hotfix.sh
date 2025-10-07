#!/bin/bash

# 🚀 getConversations云函数紧急修复部署脚本

echo "🔥 开始部署getConversations云函数 - HOTFIX修复"

# 云环境ID
CLOUD_ENV="ququer-env-6g35f0nv28c446e7"

echo "📦 正在部署到环境: $CLOUD_ENV"

# 检查是否安装了cloudbase CLI
if ! command -v cloudbase &> /dev/null; then
    echo "❌ cloudbase CLI未安装，正在安装..."
    npm install -g @cloudbase/cli
    
    if [ $? -ne 0 ]; then
        echo "❌ 安装cloudbase CLI失败，请手动安装: npm install -g @cloudbase/cli"
        exit 1
    fi
    
    echo "✅ cloudbase CLI安装成功"
fi

# 检查是否已登录
echo "🔐 检查登录状态..."
if ! cloudbase auth:list &> /dev/null; then
    echo "⚠️ 请先登录cloudbase CLI（需要微信扫码）"
    cloudbase login
    
    if [ $? -ne 0 ]; then
        echo "❌ 登录失败，请重试"
        exit 1
    fi
fi

echo "✅ 已登录cloudbase CLI"

# 进入getConversations目录
echo "📁 进入getConversations目录..."
cd cloudfunctions/getConversations

# 确认依赖已安装
echo "📥 确认依赖安装..."
if [ ! -d "node_modules" ] || [ ! -d "node_modules/wx-server-sdk" ]; then
    echo "🔧 重新安装依赖..."
    rm -rf node_modules
    rm -f package-lock.json
    npm install --production
    
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
else
    echo "✅ 依赖已存在"
fi

# 显示当前wx-server-sdk版本
if [ -f "node_modules/wx-server-sdk/package.json" ]; then
    SDK_VERSION=$(node -p "require('./node_modules/wx-server-sdk/package.json').version")
    echo "📋 wx-server-sdk版本: $SDK_VERSION"
fi

# 部署云函数
echo "🚀 开始部署getConversations云函数..."
cloudbase functions:deploy getConversations -e $CLOUD_ENV --force

if [ $? -eq 0 ]; then
    echo "✅ getConversations部署成功！"
    echo ""
    echo "🎉 修复完成！智能检测功能应该可以正常工作了"
    echo ""
    echo "📋 请在小程序中重新测试："
    echo "1. 重新启动小程序"
    echo "2. 登录用户账号" 
    echo "3. 观察智能检测是否正常工作"
else
    echo "❌ getConversations部署失败"
    echo ""
    echo "🛠️ 可能的解决方案:"
    echo "1. 检查网络连接"
    echo "2. 确认云环境权限"
    echo "3. 手动在微信开发者工具中部署"
    
    exit 1
fi

# 返回项目根目录
cd ../..

echo ""
echo "✨ HOTFIX部署脚本执行完成！"
