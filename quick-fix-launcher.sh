#!/bin/bash

# 🚨 小程序启动和发送失败快速修复脚本
# 使用方法：bash quick-fix-launcher.sh

echo "🔧 开始执行小程序启动和发送失败修复..."
echo "==============================================="

# 检查是否在正确的目录
if [ ! -f "app.json" ] || [ ! -d "cloudfunctions" ]; then
    echo "❌ 错误：请在项目根目录执行此脚本"
    echo "当前目录：$(pwd)"
    echo "请切换到包含 app.json 和 cloudfunctions 目录的项目根目录"
    exit 1
fi

echo "✅ 检测到项目文件，开始执行修复..."

# 1. 清除缓存
echo ""
echo "📋 步骤 1: 清除缓存..."
if [ -f "clear-all-cache.sh" ]; then
    bash clear-all-cache.sh
    echo "✅ 缓存清除完成"
else
    echo "⚠️ 未找到缓存清除脚本，手动清除..."
    rm -rf node_modules/.cache 2>/dev/null
    rm -rf .cache 2>/dev/null
    echo "✅ 手动缓存清除完成"
fi

# 2. 检查云环境配置
echo ""
echo "📋 步骤 2: 检查云环境配置..."
if [ -f "cloudfunctions/config.json" ]; then
    ENV_ID=$(cat cloudfunctions/config.json | grep -o '"env"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    echo "✅ 云环境ID: $ENV_ID"
    
    if [ "$ENV_ID" = "ququer-env-6g35f0nv28c446e7" ]; then
        echo "✅ 云环境配置正确"
    else
        echo "⚠️ 云环境配置可能有问题"
    fi
else
    echo "❌ 未找到云函数配置文件"
fi

# 3. 检查关键云函数
echo ""
echo "📋 步骤 3: 检查关键云函数..."
CRITICAL_FUNCTIONS=("login" "sendMessage" "getConversations" "createChat")

for func in "${CRITICAL_FUNCTIONS[@]}"; do
    if [ -d "cloudfunctions/$func" ]; then
        if [ -f "cloudfunctions/$func/index.js" ]; then
            echo "✅ $func - 文件存在"
        else
            echo "❌ $func - 缺少 index.js"
        fi
    else
        echo "❌ $func - 目录不存在"
    fi
done

# 4. 部署关键云函数
echo ""
echo "📋 步骤 4: 尝试部署云函数..."
if [ -f "deploy-critical-functions.sh" ]; then
    echo "🚀 执行关键云函数部署脚本..."
    bash deploy-critical-functions.sh
elif [ -f "deploy-cloud.sh" ]; then
    echo "🚀 执行云函数部署脚本..."
    bash deploy-cloud.sh
else
    echo "⚠️ 未找到部署脚本，请手动在微信开发者工具中部署以下云函数："
    echo "   - login"
    echo "   - sendMessage" 
    echo "   - getConversations"
    echo "   - createChat"
fi

# 5. 生成诊断报告
echo ""
echo "📋 步骤 5: 生成诊断报告..."
REPORT_FILE="diagnostic-report-$(date +%Y%m%d_%H%M%S).txt"

cat > "$REPORT_FILE" << EOF
# 小程序诊断报告
生成时间: $(date)

## 项目配置
- 项目路径: $(pwd)
- 云环境ID: $(cat cloudfunctions/config.json 2>/dev/null | grep -o '"env"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

## 文件检查
- app.json: $([ -f "app.json" ] && echo "✅" || echo "❌")
- project.config.json: $([ -f "project.config.json" ] && echo "✅" || echo "❌")
- cloudfunctions/config.json: $([ -f "cloudfunctions/config.json" ] && echo "✅" || echo "❌")

## 云函数状态
EOF

for func in "${CRITICAL_FUNCTIONS[@]}"; do
    if [ -d "cloudfunctions/$func" ] && [ -f "cloudfunctions/$func/index.js" ]; then
        echo "- $func: ✅" >> "$REPORT_FILE"
    else
        echo "- $func: ❌" >> "$REPORT_FILE"
    fi
done

cat >> "$REPORT_FILE" << EOF

## 修复建议
1. 如果云函数显示❌，请在微信开发者工具中重新上传对应的云函数
2. 如果仍有问题，请完全关闭微信开发者工具后重新打开
3. 检查网络连接是否稳定
4. 确认微信账号有云环境管理权限

## 应急处理
如果问题持续存在，请联系技术支持并提供此诊断报告。
EOF

echo "✅ 诊断报告已生成: $REPORT_FILE"

# 6. 显示后续操作指导
echo ""
echo "🎯 修复完成！后续操作："
echo "==============================================="
echo "1. 📱 完全关闭微信开发者工具"
echo "2. 🔄 重新打开微信开发者工具"
echo "3. 📂 重新打开项目：$(pwd)"
echo "4. ☁️ 确认云环境选择：ququer-env-6g35f0nv28c446e7"
echo "5. 🚀 尝试运行小程序"
echo ""
echo "如果问题仍然存在，请查看："
echo "- 📋 诊断报告：$REPORT_FILE"
echo "- 📘 详细修复指南：小程序启动和发送失败修复指南.md"
echo ""
echo "✅ 修复脚本执行完成！"
echo "==============================================="
