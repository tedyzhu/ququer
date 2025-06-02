#!/bin/bash

# 🚀 部署缺失的关键云函数
# 专门部署createChat、getMessages、sendMessage

echo "🔥 部署缺失的关键云函数..."

# 云环境ID
CLOUD_ENV="ququer-env-6g35f0nv28c446e7"

# 缺失的关键函数
MISSING_FUNCTIONS=(
  "createChat"
  "getMessages"
  "sendMessage"
)

# 检查cloudbase CLI
if ! command -v cloudbase &> /dev/null; then
    echo "❌ 请先安装cloudbase CLI: npm install -g @cloudbase/cli"
    exit 1
fi

# 检查登录状态
if ! cloudbase auth:list &> /dev/null; then
    echo "🔐 请先登录cloudbase CLI..."
    cloudbase login
fi

echo "🚀 开始部署缺失的函数..."

SUCCESS_COUNT=0
TOTAL_COUNT=${#MISSING_FUNCTIONS[@]}

# 回到项目根目录
cd /Users/tedsmini/Desktop/app\ design/ququer

for func in "${MISSING_FUNCTIONS[@]}"
do
  echo ""
  echo "📦 正在部署 $func..."
  
  # 检查函数目录
  if [ ! -d "cloudfunctions/$func" ]; then
    echo "❌ 函数目录不存在: cloudfunctions/$func"
    continue
  fi
  
  # 部署函数
  cloudbase functions:deploy $func --env $CLOUD_ENV --force
  
  if [ $? -eq 0 ]; then
    echo "✅ $func 部署成功"
    ((SUCCESS_COUNT++))
  else
    echo "❌ $func 部署失败"
  fi
done

echo ""
echo "📊 部署结果:"
echo "✅ 成功: $SUCCESS_COUNT/$TOTAL_COUNT"
echo "❌ 失败: $((TOTAL_COUNT - SUCCESS_COUNT))/$TOTAL_COUNT"

if [ $SUCCESS_COUNT -eq $TOTAL_COUNT ]; then
    echo ""
    echo "🎉 所有缺失的函数部署成功！"
    echo ""
    echo "🔍 请在云开发控制台验证:"
    echo "应该看到8个云函数，状态都为「正常」"
    echo ""
    echo "🧪 现在可以测试消息功能:"
    echo "1. 重启小程序"
    echo "2. 尝试发送消息"
    echo "3. 检查是否还有501000错误"
else
    echo ""
    echo "⚠️ 部分函数部署失败"
    echo "请在微信开发者工具中手动部署失败的函数"
fi 