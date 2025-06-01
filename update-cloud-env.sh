#!/bin/bash

# 批量更新云环境ID脚本
# 使用方法: ./update-cloud-env.sh OLD_ENV_ID NEW_ENV_ID

OLD_ENV="$1"
NEW_ENV="$2"

if [ -z "$OLD_ENV" ] || [ -z "$NEW_ENV" ]; then
    echo "使用方法: ./update-cloud-env.sh OLD_ENV_ID NEW_ENV_ID"
    echo "例如: ./update-cloud-env.sh cloud1-9gmp8bcn2dc3576a cloud1-newenvid123"
    exit 1
fi

echo "🔄 开始批量更新云环境ID..."
echo "旧环境ID: $OLD_ENV"
echo "新环境ID: $NEW_ENV"
echo ""

# 需要更新的文件列表
files=(
    "app.js"
    "app/service/api.js"
    "app/app.js"
    "cloudfunctions/joinByInvite/index.js"
    "cloudfunctions/sendMessage/index.js"
    "cloudfunctions/notifyCreator/index.js"
    "cloudfunctions/destroyMessage/index.js"
    "cloudfunctions/testJoin/index.js"
    "cloudfunctions/checkChatStatus/index.js"
    "cloudfunctions/login/index.js"
    "cloudfunctions/config.json"
    "cloudfunctions/updateChatStatus/index.js"
    "cloudfunctions/notifyJoined/index.js"
    "cloudfunctions/startConversation/index.js"
    "cloudfunctions/getChatInfo/index.js"
    "cloudfunctions/notifyInviter/index.js"
    "cloudfunctions/createInvite/index.js"
    "cloudfunctions/createChat/index.js"
    "cloudfunctions/getMessages/index.js"
    "readme.md"
    "deploy-functions.md"
    "真机调试准备清单.md"
    ".plans/CLOUD-SETUP-GUIDE.md"
    "deploy-cloud.sh"
    "setup-cloud-functions.sh"
)

# 备份计数器
updated_count=0
failed_count=0

# 遍历文件并更新
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "📝 更新文件: $file"
        
        # 使用sed进行替换（macOS兼容）
        if sed -i '' "s/$OLD_ENV/$NEW_ENV/g" "$file" 2>/dev/null; then
            echo "  ✅ 成功"
            ((updated_count++))
        else
            echo "  ❌ 失败"
            ((failed_count++))
        fi
    else
        echo "  ⚠️  文件不存在: $file"
        ((failed_count++))
    fi
done

echo ""
echo "🎉 更新完成！"
echo "成功更新: $updated_count 个文件"
echo "失败/跳过: $failed_count 个文件"
echo ""
echo "📋 接下来请执行："
echo "1. 重新部署所有云函数"
echo "2. 在云开发控制台重新创建数据库集合"
echo "3. 测试小程序功能" 