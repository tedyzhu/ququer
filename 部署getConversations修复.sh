#!/bin/bash

# ========================================
# 部署 getConversations 云函数修复
# 版本: v1.3.55
# 日期: 2025-09-30
# ========================================

echo "🚀 开始部署 getConversations 云函数修复..."
echo "==============================================="

# 进入云函数目录
cd cloudfunctions/getConversations

echo "📂 当前目录: $(pwd)"
echo ""

# 检查 index.js 是否存在
if [ ! -f "index.js" ]; then
  echo "❌ 错误: index.js 文件不存在"
  exit 1
fi

echo "✅ index.js 文件存在"
echo ""

# 显示文件信息
echo "📊 文件信息:"
echo "  - 文件大小: $(wc -c < index.js) 字节"
echo "  - 代码行数: $(wc -l < index.js) 行"
echo ""

# 检查是否包含关键函数
if grep -q "getParticipantsWithRealNames" index.js; then
  echo "✅ 包含 getParticipantsWithRealNames 函数"
else
  echo "❌ 警告: 未找到 getParticipantsWithRealNames 函数"
fi

if grep -q "获取参与者的真实信息" index.js; then
  echo "✅ 包含完整的 JSDoc 注释"
else
  echo "⚠️  提示: JSDoc 注释可能不完整"
fi

echo ""
echo "==============================================="
echo "📝 部署说明:"
echo ""
echo "请在微信开发者工具中执行以下步骤："
echo ""
echo "1. 打开微信开发者工具"
echo "2. 在左侧找到 'cloudfunctions' 文件夹"
echo "3. 展开找到 'getConversations' 文件夹"
echo "4. 右键点击 'getConversations'"
echo "5. 选择 '上传并部署：云端安装依赖'"
echo "6. 等待部署完成（约30-60秒）"
echo ""
echo "==============================================="
echo "🧪 部署后测试命令:"
echo ""
echo "在微信开发者工具控制台运行以下代码："
echo ""
cat << 'EOF'
wx.cloud.callFunction({
  name: 'getConversations',
  data: { limit: 5 },
  success: res => {
    console.log('✅ 会话列表:', res.result);
    if (res.result.conversations && res.result.conversations.length > 0) {
      const firstConv = res.result.conversations[0];
      console.log('✅ 参与者昵称:', firstConv.participantNames);
      console.log('✅ 对方信息:', firstConv.contactInfo);
      
      // 检查是否还是占位符
      if (firstConv.participantNames.some(n => n.includes('用户'))) {
        console.warn('⚠️  仍可能显示占位符');
      } else {
        console.log('✅ 显示真实昵称');
      }
    }
  },
  fail: err => console.error('❌ 调用失败:', err)
});
EOF

echo ""
echo "==============================================="
echo "📄 相关文档:"
echo ""
echo "  - 系统排查报告: .plans/系统排查报告-2025-09-30.md"
echo "  - 修复总结: .plans/HOTFIX-v1.3.55-系统优化完成总结.md"
echo "  - 更新日志: readme.md"
echo ""
echo "==============================================="
echo "✨ 准备就绪！请在微信开发者工具中手动部署。"
echo ""

