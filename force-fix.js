/**
 * 强制修复无限循环 - 立即执行版本
 * 直接在控制台粘贴执行
 */

// 🚨 立即停止无限循环
(function() {
  console.log('🚨🚨🚨 强制停止循环！🚨🚨🚨');
  
  // 获取当前页面
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  
  if (!currentPage) {
    console.log('❌ 无法获取当前页面');
    return;
  }
  
  console.log('当前页面路径:', currentPage.route);
  
  // 强制重写 fetchMessages 方法，防止继续调用
  if (currentPage.fetchMessages) {
    console.log('🔒 锁定 fetchMessages 方法...');
    
    const originalFetchMessages = currentPage.fetchMessages;
    currentPage.fetchMessages = function() {
      console.log('🛑 fetchMessages 被阻止调用');
      
      // 如果还没有消息，显示模拟消息
      if (!this.data.messages || this.data.messages.length === 0) {
        this.showMockMessages();
      }
      
      return false; // 阻止执行
    };
    
    console.log('✅ fetchMessages 已被锁定');
  }
  
  // 强制重置所有标志
  currentPage._isLoading = false;
  currentPage._isFetchingMessages = false;
  currentPage._lastFetchTime = Date.now() + 300000; // 5分钟内禁止调用
  
  console.log('🔄 重置所有加载标志');
  
  // 清理定时器
  const timers = ['chatCreationTimer', 'refreshTimer'];
  timers.forEach(timer => {
    if (currentPage[timer]) {
      clearInterval(currentPage[timer]);
      currentPage[timer] = null;
      console.log(`⏱️ 清理定时器: ${timer}`);
    }
  });
  
  // 清理全局数据
  const app = getApp();
  if (app.globalData && app.globalData.currentChatInfo) {
    console.log('🗑️ 删除全局聊天数据:', app.globalData.currentChatInfo._id);
    delete app.globalData.currentChatInfo;
    console.log('✅ 全局数据已清理');
  }
  
  // 更新页面状态
  currentPage.setData({
    isCreatingChat: false,
    isLoading: false,
    chatCreationStatus: '',
    messages: currentPage.data.messages || []
  });
  
  // 强制显示模拟消息
  if (currentPage.showMockMessages && (!currentPage.data.messages || currentPage.data.messages.length === 0)) {
    console.log('💬 显示模拟消息...');
    currentPage.showMockMessages();
  }
  
  // 清理本地存储
  try {
    const storage = wx.getStorageInfoSync();
    let clearedCount = 0;
    
    storage.keys.forEach(key => {
      if (key.startsWith('chat_info_')) {
        wx.removeStorageSync(key);
        clearedCount++;
      }
    });
    
    console.log(`🗑️ 清理了 ${clearedCount} 个本地缓存`);
  } catch (e) {
    console.log('⚠️ 清理缓存失败:', e);
  }
  
  // 30秒后恢复 fetchMessages 方法
  setTimeout(() => {
    if (currentPage.fetchMessages && originalFetchMessages) {
      console.log('🔓 30秒后恢复 fetchMessages 方法');
      currentPage.fetchMessages = originalFetchMessages;
    }
  }, 30000);
  
  console.log('🎉 强制修复完成！无限循环已停止');
  console.log('📱 建议：关闭聊天页面，重新进入测试');
  
})(); 