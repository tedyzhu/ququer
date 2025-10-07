/**
 * 🚨 紧急修复：停止死循环脚本
 * 立即停止所有可能导致死循环的重试逻辑
 */

console.log('🚨 [紧急修复] 启动死循环停止脚本...');

/**
 * 清理所有定时器和重试逻辑
 */
function emergencyStopInfiniteLoop() {
  console.log('🚨 [紧急修复] 开始清理死循环...');
  
  // 1. 停止所有可能的定时器
  try {
    // 清理所有setTimeout
    for (let i = 1; i < 10000; i++) {
      clearTimeout(i);
    }
    
    // 清理所有setInterval  
    for (let i = 1; i < 10000; i++) {
      clearInterval(i);
    }
    
    console.log('✅ [紧急修复] 已清理定时器');
  } catch (e) {
    console.warn('⚠️ [紧急修复] 清理定时器时出错:', e);
  }
  
  // 2. 重置云环境状态
  try {
    const app = getApp();
    if (app && app.globalData) {
      // 停止所有重试逻辑
      app.globalData.STOP_ALL_RETRIES = true;
      app.globalData.cloudInitialized = false; // 重置状态
      console.log('✅ [紧急修复] 已重置云环境状态');
    }
  } catch (e) {
    console.warn('⚠️ [紧急修复] 重置状态时出错:', e);
  }
  
  // 3. 恢复原始的云函数调用方法
  try {
    if (wx.cloud && wx.cloud._originalCallFunction) {
      wx.cloud.callFunction = wx.cloud._originalCallFunction;
      console.log('✅ [紧急修复] 已恢复原始云函数调用方法');
    }
  } catch (e) {
    console.warn('⚠️ [紧急修复] 恢复云函数方法时出错:', e);
  }
  
  // 4. 禁用错误的修复脚本
  try {
    if (typeof global !== 'undefined') {
      global.DISABLE_FIX_SCRIPTS = true;
    }
    if (typeof window !== 'undefined') {
      window.DISABLE_FIX_SCRIPTS = true;
    }
    console.log('✅ [紧急修复] 已禁用冲突的修复脚本');
  } catch (e) {
    console.warn('⚠️ [紧急修复] 禁用脚本时出错:', e);
  }
  
  console.log('🚨 [紧急修复] 死循环清理完成');
}

/**
 * 简化的云环境初始化（无重试）
 */
function simpleCloudInit() {
  console.log('🚨 [紧急修复] 使用简化的云环境初始化');
  
  if (!wx.cloud) {
    console.error('🚨 [紧急修复] 云开发不可用');
    return false;
  }
  
  try {
    wx.cloud.init({
      env: 'ququer-env-6g35f0nv28c446e7',
      traceUser: true,
      timeout: 5000 // 减少超时时间
    });
    
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.cloudInitialized = true;
    }
    
    console.log('✅ [紧急修复] 简化云环境初始化成功');
    return true;
  } catch (e) {
    console.error('🚨 [紧急修复] 简化云环境初始化失败:', e);
    return false;
  }
}

/**
 * 安全的页面重启
 */
function safeRestart() {
  console.log('🚨 [紧急修复] 执行安全重启');
  
  // 清理后重启到登录页
  setTimeout(() => {
    wx.reLaunch({
      url: '/app/pages/login/login',
      success: () => {
        console.log('✅ [紧急修复] 安全重启成功');
      },
      fail: () => {
        console.log('🚨 [紧急修复] 重启失败，尝试备用方案');
        wx.navigateTo({
          url: '/pages/login/login',
          fail: () => {
            console.log('🚨 [紧急修复] 所有重启方案都失败');
          }
        });
      }
    });
  }, 1000);
}

// 立即执行紧急修复
emergencyStopInfiniteLoop();

// 简化云环境初始化
setTimeout(() => {
  simpleCloudInit();
}, 2000);

// 显示用户提示
setTimeout(() => {
  wx.showModal({
    title: '系统修复',
    content: '检测到系统异常，已自动修复并重启，请重新操作',
    showCancel: false,
    confirmText: '确定',
    success: () => {
      safeRestart();
    }
  });
}, 3000);

console.log('🚨 [紧急修复] 紧急修复脚本加载完成');

// 导出紧急修复函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    emergencyStopInfiniteLoop,
    simpleCloudInit,
    safeRestart
  };
}
