#!/bin/bash

# 🔥 手动云函数部署脚本
# 解决CloudBase CLI版本兼容性问题

echo "🚀 开始手动部署云函数..."
echo "==============================================="

# 检查是否在正确的目录
if [ ! -d "cloudfunctions" ]; then
    echo "❌ 错误：未找到cloudfunctions目录"
    echo "请在项目根目录执行此脚本"
    exit 1
fi

# 云环境ID
ENV_ID="ququer-env-6g35f0nv28c446e7"
echo "🎯 目标云环境: $ENV_ID"

# 关键云函数列表
CRITICAL_FUNCTIONS=("login" "sendMessage" "getConversations" "createChat" "checkChatStatus")

echo ""
echo "📦 准备部署以下关键云函数:"
for func in "${CRITICAL_FUNCTIONS[@]}"; do
    echo "  - $func"
done

echo ""
echo "⚠️  由于CloudBase CLI兼容性问题，需要使用微信开发者工具手动部署"
echo ""
echo "📋 手动部署步骤："
echo "==============================================="
echo "1. 📱 打开微信开发者工具"
echo "2. 🔄 确保项目已正确打开"
echo "3. ☁️ 点击工具栏的「云开发」按钮"
echo "4. 🎯 确认选择环境: $ENV_ID"
echo "5. 📂 进入「云函数」标签页"
echo ""

# 为每个云函数创建详细的部署指导
for func in "${CRITICAL_FUNCTIONS[@]}"; do
    if [ -d "cloudfunctions/$func" ]; then
        echo "📦 部署 $func:"
        echo "   - 在云函数列表中找到 $func"
        echo "   - 右键点击该函数"
        echo "   - 选择「云端安装依赖」(如果有package.json)"
        echo "   - 选择「上传并部署」"
        echo "   - 等待部署完成"
        echo ""
    else
        echo "❌ 警告: cloudfunctions/$func 目录不存在"
    fi
done

echo "🔍 部署验证:"
echo "==============================================="
echo "部署完成后，请在云开发控制台验证："
echo "1. 📊 检查所有云函数状态为「正常」"
echo "2. 📝 查看云函数日志确认无错误"
echo "3. 🧪 可以在控制台测试调用云函数"
echo ""

echo "🎯 或者使用在线云开发控制台："
echo "https://console.cloud.tencent.com/tcb"
echo "选择环境: $ENV_ID"
echo ""

# 创建部署检查脚本
cat > "check-cloud-functions.js" << EOF
/**
 * 云函数部署检查脚本
 * 在小程序中运行此代码检查云函数是否正常
 */

const functions = ['login', 'sendMessage', 'getConversations', 'createChat'];

async function checkCloudFunctions() {
  console.log('🔍 开始检查云函数状态...');
  
  for (const funcName of functions) {
    try {
      console.log(\`📞 测试云函数: \${funcName}\`);
      
      const res = await wx.cloud.callFunction({
        name: funcName,
        data: { test: true, timestamp: Date.now() }
      });
      
      console.log(\`✅ \${funcName} 测试成功\`, res);
      
    } catch (error) {
      console.error(\`❌ \${funcName} 测试失败\`, error);
    }
  }
  
  console.log('🔍 云函数检查完成');
}

// 在小程序控制台中运行: checkCloudFunctions()
checkCloudFunctions();
EOF

echo "📝 已创建云函数检查脚本: check-cloud-functions.js"
echo "   在小程序调试控制台中运行该脚本可检查云函数状态"
echo ""

echo "✅ 手动部署指导完成！"
echo "==============================================="
echo ""
echo "🔥 快速解决方案（如果手动部署仍有问题）："
echo "1. 📱 完全关闭微信开发者工具"
echo "2. 🗑️  清除工具缓存（工具 > 清缓存）"
echo "3. 🔄 重新打开项目"
echo "4. ☁️ 重新选择云环境"
echo "5. 🚀 重新部署云函数"
