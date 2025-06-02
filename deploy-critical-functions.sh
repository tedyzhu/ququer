#!/bin/bash

# 🚀 关键云函数快速部署脚本
# 优先部署消息同步必需的云函数

echo "🔥 开始部署关键云函数到环境: ququer-env-6g35f0nv28c446e7"

# 云环境ID
CLOUD_ENV="ququer-env-6g35f0nv28c446e7"

# 关键云函数列表（按优先级排序）
CRITICAL_FUNCTIONS=(
  "createChat"
  "getMessages" 
  "sendMessage"
  "checkChatStatus"
  "createInvite"
  "joinByInvite"
  "startConversation"
  "login"
)

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

# 部署关键云函数
echo "🚀 开始部署关键云函数..."

SUCCESS_COUNT=0
TOTAL_COUNT=${#CRITICAL_FUNCTIONS[@]}

for func in "${CRITICAL_FUNCTIONS[@]}"
do
  echo ""
  echo "📦 正在部署 $func..."
  
  # 检查函数目录是否存在
  if [ ! -d "cloudfunctions/$func" ]; then
    echo "⚠️ 跳过 $func - 目录不存在"
    continue
  fi
  
  # 进入函数目录
  cd "cloudfunctions/$func"
  
  # 检查package.json是否存在
  if [ ! -f "package.json" ]; then
    echo "⚠️ $func 缺少 package.json，创建默认配置..."
    cat > package.json << EOF
{
  "name": "$func",
  "version": "1.0.0",
  "description": "$func cloud function",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
EOF
  fi
  
  # 安装依赖（如果需要）
  if [ ! -d "node_modules" ]; then
    echo "📥 安装 $func 的依赖..."
    npm install --production
  fi
  
  # 部署云函数
  cloudbase functions:deploy $func --env $CLOUD_ENV --force
  
  if [ $? -eq 0 ]; then
    echo "✅ $func 部署成功"
    ((SUCCESS_COUNT++))
  else
    echo "❌ $func 部署失败"
  fi
  
  # 返回项目根目录
  cd ../..
done

echo ""
echo "📊 部署完成统计:"
echo "✅ 成功: $SUCCESS_COUNT/$TOTAL_COUNT"
echo "❌ 失败: $((TOTAL_COUNT - SUCCESS_COUNT))/$TOTAL_COUNT"

if [ $SUCCESS_COUNT -eq $TOTAL_COUNT ]; then
    echo ""
    echo "🎉 所有关键云函数部署成功！"
    echo ""
    echo "🔍 请验证部署结果:"
    echo "1. 打开微信开发者工具"
    echo "2. 点击「云开发」按钮"
    echo "3. 进入「云函数」页面"
    echo "4. 确认所有函数状态为「正常」"
else
    echo ""
    echo "⚠️ 部分云函数部署失败，请检查错误信息并重试"
    echo ""
    echo "🛠️ 可能的解决方案:"
    echo "1. 检查网络连接"
    echo "2. 确认云环境权限"
    echo "3. 手动在微信开发者工具中部署失败的函数"
fi

echo ""
echo "📚 更多帮助请查看: 云函数部署修复指南.md" 