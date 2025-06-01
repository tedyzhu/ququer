#!/bin/bash

# 设置云环境ID
CLOUD_ENV="ququer-env-6g35f0nv28c446e7"

# 安装全局依赖
npm install -g @cloudbase/cli

# 登录云开发CLI (需要微信扫码)
cloudbase login

# 函数列表
FUNCTIONS=(
  "createChat"
  "checkChatStatus"
  "joinByInvite"
  "startConversation"
  "createInvite"
  "notifyJoined"
  "login"
  "sendMessage"
  "destroyMessage"
  "getMessages"
  "getConversations"
)

# 遍历部署所有云函数
for func in "${FUNCTIONS[@]}"
do
  echo "Deploying $func..."
  cd "cloudfunctions/$func"
  
  # 安装依赖
  if [ ! -d "node_modules" ]; then
    echo "Installing dependencies for $func..."
    npm install
  fi
  
  # 部署云函数
  cloudbase functions:deploy $func --env $CLOUD_ENV --force
  
  cd ../..
done

echo "All functions deployed successfully!" 