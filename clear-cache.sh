#!/bin/bash

echo "🧹 开始清理微信小程序缓存..."

# 清理项目缓存
echo "清理项目缓存文件..."
find . -name ".DS_Store" -delete
find . -name "*.cache" -delete
find . -name "*.log" -delete
find . -name "*.tmp" -delete

# 清理微信开发者工具可能的缓存目录
echo "清理微信开发者工具缓存..."
rm -rf ~/Library/Application\ Support/微信开发者工具/Cache
rm -rf ~/Library/Application\ Support/微信开发者工具/logs
rm -rf ~/Library/Caches/微信开发者工具

echo "✅ 缓存清理完成！"
echo ""
echo "📋 下一步操作："
echo "1. 重新打开微信开发者工具"
echo "2. 重新打开项目"
echo "3. 点击'编译'按钮"
echo "4. 确认看到'安全聊天页面加载'日志" 