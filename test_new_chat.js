/**
 * 🧪 新聊天消息发送测试脚本
 * 
 * 使用方法：
 * 1. 在新创建的聊天页面控制台执行：
 *    getCurrentPages()[getCurrentPages().length - 1].testNewChatMessageSending();
 * 
 * 2. 或者直接复制粘贴这个脚本到控制台执行
 */

// 获取当前聊天页面实例
const currentPage = getCurrentPages()[getCurrentPages().length - 1];

if (!currentPage || !currentPage.testNewChatMessageSending) {
  console.error('❌ 当前页面不是聊天页面或缺少测试函数');
} else {
  console.log('🧪 开始测试新聊天消息发送...');
  
  // 显示当前状态
  console.log('📊 当前状态:');
  console.log('- 参与者数量:', currentPage.data.participants.length);
  console.log('- 消息数量:', currentPage.data.messages.length);
  console.log('- 当前用户:', currentPage.data.currentUser.nickName);
  console.log('- 聊天ID:', currentPage.data.contactId);
  console.log('- 标题:', currentPage.data.dynamicTitle);
  
  // 检查是否是新聊天
  const messages = currentPage.data.messages || [];
  const participants = currentPage.data.participants || [];
  const hasUserMessages = messages.some(msg => msg.senderId !== 'system');
  const isNewChat = !hasUserMessages && participants.length === 1;
  
  console.log('🔍 聊天状态分析:');
  console.log('- 有用户消息:', hasUserMessages);
  console.log('- 是新聊天:', isNewChat);
  
  if (isNewChat) {
    console.log('✅ 确认这是新聊天，开始测试消息发送功能');
    
    // 执行新聊天测试
    currentPage.testNewChatMessageSending();
    
  } else {
    console.log('ℹ️ 这不是新聊天，建议使用完整测试');
    console.log('💡 请执行: getCurrentPages()[getCurrentPages().length - 1].testConnectionFix();');
    
    // 询问是否继续测试
    setTimeout(() => {
      console.log('🤔 是否仍要测试消息发送？如果是，请手动执行测试函数');
    }, 1000);
  }
} 