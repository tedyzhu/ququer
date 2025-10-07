/**
 * 🔍 修复状态检查脚本
 * 在小程序正确的调试控制台中使用
 */

console.log('🔍 开始检查修复状态...');

/**
 * 安全检查修复状态
 */
function safeCheckFixStatus() {
  console.log('=== 🔍 修复状态检查 ===');
  
  try {
    // 1. 检查是否在小程序环境中
    if (typeof wx === 'undefined') {
      console.error('❌ 错误：当前不在小程序环境中');
      console.log('💡 请在微信开发者工具的【调试器】→【Console】中运行此代码');
      return;
    }
    
    console.log('✅ 确认在小程序环境中');
    
    // 2. 检查App实例
    let app = null;
    try {
      app = getApp();
      if (!app) {
        console.warn('⚠️ App实例未找到，可能小程序还未完全启动');
        return;
      }
      console.log('✅ App实例已找到');
    } catch (e) {
      console.error('❌ 获取App实例失败:', e.message);
      console.log('💡 请等待小程序完全加载后再运行此代码');
      return;
    }
    
    // 3. 检查全局数据
    if (!app.globalData) {
      console.warn('⚠️ globalData未初始化');
      return;
    }
    
    // 4. 输出修复状态
    const status = {
      '🚨 紧急停止标志': app.globalData.STOP_ALL_RETRIES || false,
      '☁️ 云环境初始化': app.globalData.cloudInitialized || false,
      '🔄 云环境重试次数': app.globalData.cloudInitRetryCount || 0,
      '🔥 真机修复已应用': app.globalData.REAL_DEVICE_FIX_APPLIED || false,
      '🛡️ 编码修复已应用': app.globalData.ENCODING_FIX_APPLIED || false,
      '🔧 云函数修复已应用': app.globalData.CLOUD_FIX_APPLIED || false,
      '🛡️ 安全修复已应用': app.globalData.SAFE_CLOUD_FIX_APPLIED || false
    };
    
    console.table(status);
    
    // 5. 检查云函数包装状态
    if (typeof wx.cloud !== 'undefined' && wx.cloud) {
      const cloudStatus = {
        '📦 云函数已包装': !!wx.cloud._realDeviceWrapped,
        '🔄 重试计数器': wx._retryCounters ? Object.keys(wx._retryCounters).length : 0,
        '🔧 原始方法备份': !!wx.cloud._originalCallFunction
      };
      
      console.log('\n=== ☁️ 云函数状态 ===');
      console.table(cloudStatus);
    }
    
    // 6. 综合评估
    console.log('\n=== 🎯 综合评估 ===');
    
    if (app.globalData.STOP_ALL_RETRIES) {
      console.log('🚨 紧急停止模式已激活 - 系统运行在安全模式下');
    } else if (app.globalData.cloudInitialized) {
      console.log('✅ 系统运行正常 - 云环境已成功初始化');
    } else {
      console.log('⚠️ 云环境可能未正确初始化 - 建议检查网络连接');
    }
    
    // 7. 死循环检测
    const retryCount = wx._retryCounters ? Object.keys(wx._retryCounters).length : 0;
    if (retryCount > 0) {
      console.warn(`⚠️ 检测到 ${retryCount} 个活跃的重试计数器 - 请注意监控`);
    } else {
      console.log('✅ 无活跃的重试计数器 - 死循环风险低');
    }
    
  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error);
    console.log('💡 建议：');
    console.log('1. 确保在微信开发者工具的调试控制台中运行');
    console.log('2. 等待小程序完全加载后再试');
    console.log('3. 检查是否在正确的页面中');
  }
}

/**
 * 简单状态检查（备用方案）
 */
function simpleStatusCheck() {
  console.log('=== 🔍 简单状态检查 ===');
  
  // 检查基础环境
  console.log('微信API可用:', typeof wx !== 'undefined');
  console.log('云开发可用:', typeof wx !== 'undefined' && !!wx.cloud);
  
  // 检查修复脚本标记
  if (typeof wx !== 'undefined') {
    console.log('云函数包装状态:', !!wx.cloud?._realDeviceWrapped);
    console.log('原始方法备份:', !!wx.cloud?._originalCallFunction);
    console.log('活跃重试计数:', wx._retryCounters ? Object.keys(wx._retryCounters).length : 0);
  }
}

// 执行检查
console.log('🎯 使用方法:');
console.log('在微信开发者工具的【调试器】→【Console】中运行:');
console.log('safeCheckFixStatus()  // 完整检查');
console.log('simpleStatusCheck()   // 简单检查');

// 导出函数到全局
if (typeof global !== 'undefined') {
  global.safeCheckFixStatus = safeCheckFixStatus;
  global.simpleStatusCheck = simpleStatusCheck;
} else if (typeof window !== 'undefined') {
  window.safeCheckFixStatus = safeCheckFixStatus;
  window.simpleStatusCheck = simpleStatusCheck;
}
