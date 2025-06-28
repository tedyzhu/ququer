/**
 * 🔧 消息发送修复测试脚本
 * 
 * 使用方法：
 * 1. 在聊天页面控制台执行：
 *    getCurrentPages()[getCurrentPages().length - 1].testMessageSending();
 * 
 * 2. 或者直接复制粘贴这个脚本到控制台执行
 */

// 获取当前聊天页面实例
const currentPage = getCurrentPages()[getCurrentPages().length - 1];

if (!currentPage || !currentPage.fixMessageSending) {
  console.error('❌ 当前页面不是聊天页面或缺少修复函数');
} else {
  console.log('🔧 开始测试消息发送修复...');
  
  // 显示当前状态
  console.log('📊 当前状态:');
  console.log('- 参与者数量:', currentPage.data.participants.length);
  console.log('- 当前用户:', currentPage.data.currentUser.nickName);
  console.log('- 聊天ID:', currentPage.data.contactId);
  
  // 执行修复
  currentPage.fixMessageSending();
  
  // 延迟验证结果
  setTimeout(() => {
    console.log('🔍 修复后状态验证:');
    console.log('- 参与者数量:', currentPage.data.participants.length);
    console.log('- 参与者详情:', currentPage.data.participants);
    
    // 尝试发送测试消息
    console.log('📤 尝试发送测试消息...');
    
    const testContent = `[测试消息] ${new Date().toLocaleTimeString()}`;
    
    // 模拟用户输入
    currentPage.setData({
      inputValue: testContent
    });
    
    // 触发发送
    setTimeout(() => {
      currentPage.sendMessage();
      
      console.log('✅ 测试消息已发送，请检查是否成功显示');
    }, 1000);
    
  }, 3000);
} 