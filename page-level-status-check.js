/**
 * 🔍 页面级修复状态检查脚本
 * 直接在小程序页面的onLoad或onReady中调用
 */

/**
 * 检查修复状态的页面方法
 * 可以直接在任何页面的onLoad中调用
 */
function pageCheckFixStatus() {
  console.log('=== 🔍 页面级修复状态检查 ===');
  console.log('执行时间:', new Date().toLocaleTimeString());
  
  try {
    // 1. 检查基础环境
    console.log('\n1️⃣ 基础环境检查:');
    console.log('- wx对象:', typeof wx !== 'undefined' ? '✅ 可用' : '❌ 不可用');
    console.log('- wx.cloud:', (typeof wx !== 'undefined' && wx.cloud) ? '✅ 可用' : '❌ 不可用');
    console.log('- getApp函数:', typeof getApp === 'function' ? '✅ 可用' : '❌ 不可用');
    
    // 2. 获取App实例
    if (typeof getApp !== 'function') {
      console.error('❌ getApp函数不存在，可能小程序未正确启动');
      return false;
    }
    
    const app = getApp();
    if (!app) {
      console.error('❌ App实例不存在');
      return false;
    }
    
    if (!app.globalData) {
      console.error('❌ globalData不存在');
      return false;
    }
    
    console.log('✅ App实例检查通过');
    
    // 3. 修复状态检查
    console.log('\n2️⃣ 修复脚本状态:');
    const fixStatus = {
      '紧急停止模式': app.globalData.STOP_ALL_RETRIES || false,
      '编码修复': app.globalData.ENCODING_FIX_APPLIED || false,
      '云函数修复': app.globalData.CLOUD_FIX_APPLIED || false,
      '安全修复': app.globalData.SAFE_CLOUD_FIX_APPLIED || false,
      '真机修复': app.globalData.REAL_DEVICE_FIX_APPLIED || false
    };
    
    Object.entries(fixStatus).forEach(([key, value]) => {
      console.log(`- ${key}: ${value ? '✅ 已应用' : '❌ 未应用'}`);
    });
    
    // 4. 云环境状态
    console.log('\n3️⃣ 云环境状态:');
    console.log('- 云环境初始化:', app.globalData.cloudInitialized ? '✅ 已初始化' : '❌ 未初始化');
    console.log('- 重试次数:', app.globalData.cloudInitRetryCount || 0);
    console.log('- 网络可用:', app.globalData.networkAvailable !== false ? '✅ 可用' : '❌ 不可用');
    
    // 5. 云函数包装状态
    if (wx.cloud) {
      console.log('\n4️⃣ 云函数包装状态:');
      console.log('- 真机包装已应用:', !!wx.cloud._realDeviceWrapped);
      console.log('- 原始方法已备份:', !!wx.cloud._originalCallFunction);
      console.log('- 活跃重试计数器:', wx._retryCounters ? Object.keys(wx._retryCounters).length : 0);
      
      if (wx._retryCounters && Object.keys(wx._retryCounters).length > 0) {
        console.log('- 重试计数器详情:', wx._retryCounters);
      }
    }
    
    // 6. 综合评估
    console.log('\n5️⃣ 综合评估:');
    
    if (app.globalData.STOP_ALL_RETRIES) {
      console.log('🚨 系统运行在紧急安全模式 - 所有重试已禁用');
      console.log('💡 这是正常的安全机制，防止死循环');
    } else if (app.globalData.cloudInitialized) {
      console.log('✅ 系统运行正常');
      console.log('✅ 死循环修复已生效');
      console.log('✅ 云环境连接正常');
    } else {
      console.log('⚠️ 云环境可能未正确初始化');
      console.log('💡 建议检查网络连接或手动部署云函数');
    }
    
    // 7. 死循环风险评估
    const retryCounters = wx._retryCounters ? Object.keys(wx._retryCounters).length : 0;
    if (retryCounters > 10) {
      console.warn('🚨 高风险：活跃重试计数器过多，可能存在死循环风险');
    } else if (retryCounters > 5) {
      console.warn('⚠️ 中风险：重试计数器较多，请监控');
    } else {
      console.log('✅ 低风险：重试计数器正常');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ 状态检查失败:', error);
    console.log('错误详情:', error.message);
    console.log('错误堆栈:', error.stack);
    return false;
  }
}

/**
 * 简化版检查（用于快速诊断）
 */
function quickStatusCheck() {
  try {
    const app = getApp();
    const status = {
      云环境: app.globalData.cloudInitialized,
      紧急停止: app.globalData.STOP_ALL_RETRIES,
      修复应用: app.globalData.REAL_DEVICE_FIX_APPLIED
    };
    
    console.log('🔍 快速状态:', status);
    return status;
  } catch (e) {
    console.log('❌ 快速检查失败:', e.message);
    return null;
  }
}

// 如果在支持模块的环境中，导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pageCheckFixStatus,
    quickStatusCheck
  };
}

console.log('🔍 页面级状态检查脚本已加载');
console.log('💡 使用方法：在任何页面的 onLoad 方法中调用 pageCheckFixStatus()');
