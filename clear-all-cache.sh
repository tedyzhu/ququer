#!/bin/bash
echo "🧹 开始清理所有缓存..."

# 清理项目本地缓存
echo "📁 清理项目缓存..."
rm -rf .wxcache 2>/dev/null
rm -rf node_modules/.cache 2>/dev/null
rm -rf .cache 2>/dev/null

# 清理微信开发者工具缓存 (Mac)
echo "📱 清理微信开发者工具缓存..."
rm -rf ~/Library/Application\ Support/微信开发者工具 2>/dev/null
rm -rf ~/Library/Caches/微信开发者工具 2>/dev/null

echo "✅ 缓存清理完成！"
echo "⚠️  请重启微信开发者工具以应用更改" 