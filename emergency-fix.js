/**
 * 秘信小程序无限循环紧急修复脚本
 * 在微信开发者工具控制台中执行此代码
 */

console.log('🚨 开始执行紧急修复...');

// 获取当前页面
const pages = getCurrentPages();
const currentPage = pages[pages.length - 1];

if (currentPage && currentPage.route.includes('chat')) {
  console.log('✅ 检测到聊天页面，正在停止循环...');
  
  // 强制重置所有加载标志
  currentPage._isLoading = false;
  currentPage._isFetchingMessages = false;
  currentPage._lastFetchTime = 0;
  
  console.log('🔄 已重置页面加载标志');
  
  // 清理定时器
  if (currentPage.chatCreationTimer) {
    clearInterval(currentPage.chatCreationTimer);
    currentPage.chatCreationTimer = null;
    console.log('⏱️ 已清理聊天创建定时器');
  }
  
  // 清理其他可能的定时器
  if (currentPage.refreshTimer) {
    clearInterval(currentPage.refreshTimer);
    currentPage.refreshTimer = null;
    console.log('⏱️ 已清理刷新定时器');
  }
  
  // 清理全局数据中可能导致循环的数据
  const app = getApp();
  if (app.globalData.currentChatInfo) {
    console.log('🗑️ 正在清理全局聊天数据...');
    console.log('删除前:', app.globalData.currentChatInfo._id);
    delete app.globalData.currentChatInfo;
    console.log('✅ 全局聊天数据已清理');
  } else {
    console.log('ℹ️ 没有发现全局聊天数据');
  }
  
  // 清理本地存储中的聊天缓存
  try {
    const storage = wx.getStorageInfoSync();
    let clearedCount = 0;
    
    storage.keys.forEach(key => {
      if (key.startsWith('chat_info_')) {
        wx.removeStorageSync(key);
        clearedCount++;
        console.log(`🗑️ 已删除: ${key}`);
      }
    });
    
    console.log(`✅ 已清理 ${clearedCount} 个本地聊天缓存`);
  } catch (e) {
    console.log('⚠️ 清理本地缓存时出错:', e.message);
  }
  
  // 更新页面状态
  currentPage.setData({
    isCreatingChat: false,
    chatCreationStatus: '',
    isLoading: false
  });
  
  console.log('📱 已更新页面状态');
  
  // 显示模拟消息，停止进一步的网络请求
  if (currentPage.showMockMessages) {
    currentPage.showMockMessages();
    console.log('💬 已显示模拟消息');
  }
  
  // 强制刷新页面（可选）
  // currentPage.onLoad(currentPage.options);
  
  console.log('🎉 紧急修复完成！无限循环已停止');
  console.log('📝 建议重新进入聊天页面以验证修复效果');
  
} else {
  console.log('❌ 当前不在聊天页面，无法执行修复');
  console.log('当前页面:', currentPage ? currentPage.route : '无页面');
}

console.log('🔚 紧急修复脚本执行完毕'); 