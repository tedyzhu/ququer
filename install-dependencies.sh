#!/bin/bash

echo "🔧 开始为蛐曲儿小程序云函数安装依赖..."

# 核心云函数列表
functions=("createInvite" "joinByInvite" "checkChatStatus" "startConversation" "login")

# 检查cloudfunctions目录是否存在
if [ ! -d "cloudfunctions" ]; then
    echo "❌ 错误: cloudfunctions目录不存在"
    exit 1
fi

cd cloudfunctions

for func in "${functions[@]}"; do
    echo ""
    echo "📦 处理云函数: $func"
    
    if [ ! -d "$func" ]; then
        echo "⚠️  警告: $func 目录不存在，跳过"
        continue
    fi
    
    cd "$func"
    
    # 检查package.json是否存在
    if [ ! -f "package.json" ]; then
        echo "⚠️  警告: $func/package.json 不存在，跳过"
        cd ..
        continue
    fi
    
    echo "   安装依赖中..."
    npm install
    
    if [ $? -eq 0 ]; then
        echo "   ✅ $func 依赖安装成功"
    else
        echo "   ❌ $func 依赖安装失败"
    fi
    
    cd ..
done

echo ""
echo "🎉 云函数依赖安装脚本执行完成！"
echo ""
echo "📋 下一步操作："
echo "1. 打开微信开发者工具"
echo "2. 右键点击每个云函数文件夹"
echo "3. 选择 '上传并部署：云端安装依赖'"
echo "4. 等待部署完成"
echo ""
echo "🔍 验证部署："
echo "在小程序中运行测试页面 pages/test-share/test-share" 