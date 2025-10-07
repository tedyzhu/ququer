/**
 * 🔥 真机调试启动修复脚本
 * 专门解决真机调试环境下的启动问题
 */

console.log('🔥 开始应用真机调试修复...');

/**
 * 真机环境云函数调用包装器
 * 针对真机网络环境的特殊处理
 */
function realDeviceCloudFunctionWrapper() {
  if (!wx.cloud) {
    console.error('云开发不可用');
    return;
  }
  
  // 🚨 防止死循环：检查是否已经包装过
  if (wx.cloud._realDeviceWrapped) {
    console.log('🔥 [真机修复] 云函数已被包装，跳过重复包装');
    return;
  }
  
  // 🚨 检查紧急停止标志
  const app = getApp();
  if (app && app.globalData && app.globalData.STOP_ALL_RETRIES) {
    console.log('🚨 [真机修复] 检测到紧急停止标志，跳过包装');
    return;
  }

  // 保存原始的 callFunction 方法
  const originalCallFunction = wx.cloud.callFunction;
  
  // 🚨 备份原始方法供紧急修复使用
  wx.cloud._originalCallFunction = originalCallFunction;
  
  // 增强的云函数调用方法
  wx.cloud.callFunction = function(options) {
    // 🚨 死循环防护：检查紧急停止标志
    const app = getApp();
    if (app && app.globalData && app.globalData.STOP_ALL_RETRIES) {
      console.log('🚨 [真机修复] 检测到紧急停止，直接调用原始方法');
      return originalCallFunction.call(wx.cloud, options);
    }
    
    console.log('🔥 [真机修复] 调用云函数:', options.name);
    
    // 真机环境增强配置
    const enhancedOptions = {
      ...options,
      timeout: options.timeout || 20000, // 真机网络可能较慢，增加超时时间
      complete: (res) => {
        console.log('🔥 [真机修复] 云函数调用完成:', options.name, res);
        if (options.complete) options.complete(res);
      }
    };
    
    // 🚨 添加重试限制：每个函数最多重试指定次数
    const maxRetries = 3; // 🚨 减少重试次数防止死循环
    let retryCount = 0;
    
    // 🚨 添加全局重试计数器防止过度重试
    if (!wx._retryCounters) wx._retryCounters = {};
    const counterKey = `${options.name}_${Date.now()}`;
    wx._retryCounters[counterKey] = 0;
    
    const attemptCall = () => {
      // 🚨 死循环防护：检查全局计数器
      if (wx._retryCounters[counterKey] >= maxRetries) {
        console.warn('🚨 [真机修复] 达到最大重试次数，停止重试');
        if (options.fail) {
          options.fail({ errMsg: '重试次数过多，停止重试' });
        }
        return;
      }
      
      // 🚨 再次检查紧急停止标志
      const currentApp = getApp();
      if (currentApp && currentApp.globalData && currentApp.globalData.STOP_ALL_RETRIES) {
        console.log('🚨 [真机修复] 检测到紧急停止，终止重试');
        return originalCallFunction.call(wx.cloud, options);
      }
      
      originalCallFunction.call(wx.cloud, {
        ...enhancedOptions,
        success: (res) => {
          console.log('✅ [真机修复] 云函数调用成功:', options.name);
          // 🚨 成功后清理计数器
          delete wx._retryCounters[counterKey];
          if (options.success) options.success(res);
        },
        fail: (err) => {
          console.error('❌ [真机修复] 云函数调用失败:', options.name, err);
          
          // 🚨 增加全局重试计数
          wx._retryCounters[counterKey]++;
          
          // 真机环境常见错误处理 - 限制重试条件
          if (err.errCode === -404006 && retryCount < maxRetries) {
            retryCount++;
            console.log(`🔄 [真机修复] -404006错误重试第${retryCount}次...`);
            
            // 🚨 简化重试逻辑，避免无限递归
            setTimeout(() => {
              // 不重新初始化云环境，直接重试
              attemptCall();
            }, 2000 * retryCount); // 递增延迟
            
            return; // 不执行原始fail回调
          }
          
          // 网络错误重试（真机网络更不稳定）
          if ((err.errCode === -1 || err.errMsg.includes('network') || err.errMsg.includes('timeout')) 
              && retryCount < maxRetries) {
            retryCount++;
            console.log(`🔄 [真机修复] 网络错误重试第${retryCount}次...`);
            setTimeout(attemptCall, 2000 * retryCount); // 🚨 减少延迟时间
            return;
          }
          
          // 所有重试都失败了，清理计数器
          delete wx._retryCounters[counterKey];
          if (options.fail) options.fail(err);
        }
      });
    };
    
    // 🚨 设置包装标志，防止重复包装
    wx.cloud._realDeviceWrapped = true;
    
    attemptCall();
  };
  
  console.log('✅ [真机修复] 云函数包装器已安全应用');
}

/**
 * 真机环境系统信息兼容性修复
 */
function fixSystemInfoForRealDevice() {
  console.log('🔥 [真机修复] 应用系统信息兼容性修复');
  
  // 检查并修复可能导致真机崩溃的API调用
  if (typeof wx.getSystemInfoSync === 'undefined') {
    console.warn('🔥 [真机修复] getSystemInfoSync不可用，提供降级方案');
    wx.getSystemInfoSync = function() {
      return {
        model: 'Unknown Device',
        platform: 'unknown',
        system: 'Unknown OS',
        version: '1.0.0',
        SDKVersion: '1.0.0'
      };
    };
  }
  
  // 修复可能的API兼容性问题
  const originalGetSystemInfo = wx.getSystemInfo;
  wx.getSystemInfo = function(options) {
    const wrappedOptions = {
      ...options,
      success: (res) => {
        console.log('🔥 [真机修复] 系统信息获取成功');
        if (options.success) options.success(res);
      },
      fail: (err) => {
        console.error('🔥 [真机修复] 系统信息获取失败，使用降级方案:', err);
        // 提供默认值
        if (options.success) {
          options.success({
            model: 'Unknown Device',
            platform: 'unknown',
            system: 'Unknown OS',
            version: '1.0.0',
            SDKVersion: '1.0.0'
          });
        }
      }
    };
    
    originalGetSystemInfo.call(wx, wrappedOptions);
  };
}

/**
 * 真机环境网络状态监控
 */
function setupRealDeviceNetworkMonitoring() {
  console.log('🔥 [真机修复] 设置真机网络监控');
  
  // 监听网络状态变化
  wx.onNetworkStatusChange((res) => {
    console.log('🔥 [真机修复] 网络状态变化:', res);
    
    if (!res.isConnected) {
      console.warn('🔥 [真机修复] 网络断开，暂停云函数调用');
      // 可以在这里设置一个全局标志，暂停云函数调用
      getApp().globalData.networkAvailable = false;
    } else {
      console.log('🔥 [真机修复] 网络恢复，重新初始化云环境');
      getApp().globalData.networkAvailable = true;
      
      // 网络恢复时重新初始化云环境
      const app = getApp();
      if (app && app.initCloud) {
        app.globalData.cloudInitialized = false;
        setTimeout(() => {
          app.initCloud();
        }, 2000);
      }
    }
  });
  
  // 获取当前网络状态
  wx.getNetworkType({
    success: (res) => {
      console.log('🔥 [真机修复] 当前网络类型:', res.networkType);
      if (res.networkType === 'none') {
        console.warn('🔥 [真机修复] 当前无网络连接');
        getApp().globalData.networkAvailable = false;
      } else {
        getApp().globalData.networkAvailable = true;
      }
    },
    fail: (err) => {
      console.error('🔥 [真机修复] 获取网络状态失败:', err);
      // 假设有网络
      getApp().globalData.networkAvailable = true;
    }
  });
}

/**
 * 真机环境启动错误处理
 */
function setupRealDeviceErrorHandling() {
  console.log('🔥 [真机修复] 设置真机错误处理');
  
  // 捕获全局错误
  wx.onError((error) => {
    console.error('🔥 [真机修复] 捕获到全局错误:', error);
    
    // 特殊错误处理
    if (error.includes('btoa') || error.includes('atob')) {
      console.log('🔥 [真机修复] 检测到编码相关错误，应用编码修复');
      try {
        require('./fix-encoding-error.js');
      } catch (e) {
        console.error('🔥 [真机修复] 编码修复加载失败:', e);
      }
    }
    
    if (error.includes('cloud') || error.includes('404006')) {
      console.log('🔥 [真机修复] 检测到云环境相关错误');
      const app = getApp();
      if (app && app.initCloud) {
        app.globalData.cloudInitialized = false;
        setTimeout(() => {
          app.initCloud();
        }, 3000);
      }
    }
  });

  // 页面不存在错误处理（真机环境可能更严格）
  wx.onPageNotFound((res) => {
    console.error('🔥 [真机修复] 页面不存在:', res.path);
    
    // 真机环境下更积极的重定向策略
    if (res.path.includes('login') || res.path.includes('Login')) {
      wx.reLaunch({
        url: '/app/pages/login/login',
        fail: () => {
          wx.reLaunch({ url: '/pages/login/login' });
        }
      });
    } else if (res.path.includes('chat')) {
      // 如果聊天页面不存在，跳转到登录页
      wx.reLaunch({
        url: '/app/pages/login/login',
        fail: () => {
          wx.reLaunch({ url: '/pages/login/login' });
        }
      });
    } else {
      // 默认跳转到登录页
      wx.reLaunch({
        url: '/app/pages/login/login',
        fail: () => {
          wx.showModal({
            title: '启动失败',
            content: '小程序启动异常，请重新扫码打开',
            showCancel: false
          });
        }
      });
    }
  });
}

/**
 * 应用所有真机修复
 */
function applyRealDeviceFixes() {
  console.log('🔥 [真机修复] 应用所有真机调试修复...');
  
  try {
    // 1. 云函数调用修复
    realDeviceCloudFunctionWrapper();
    console.log('✅ [真机修复] 云函数调用修复已应用');
    
    // 2. 系统信息兼容性修复
    fixSystemInfoForRealDevice();
    console.log('✅ [真机修复] 系统信息兼容性修复已应用');
    
    // 3. 网络监控
    setupRealDeviceNetworkMonitoring();
    console.log('✅ [真机修复] 网络监控已设置');
    
    // 4. 错误处理
    setupRealDeviceErrorHandling();
    console.log('✅ [真机修复] 错误处理已设置');
    
    // 5. 设置全局标志
    if (getApp() && getApp().globalData) {
      getApp().globalData.REAL_DEVICE_FIX_APPLIED = true;
      getApp().globalData.networkAvailable = true;
    }
    
    console.log('✅ [真机修复] 所有修复已成功应用');
    
  } catch (error) {
    console.error('❌ [真机修复] 修复应用失败:', error);
  }
}

// 导出修复函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyRealDeviceFixes,
    realDeviceCloudFunctionWrapper,
    fixSystemInfoForRealDevice,
    setupRealDeviceNetworkMonitoring,
    setupRealDeviceErrorHandling
  };
} else {
  // 如果在小程序环境中直接执行
  applyRealDeviceFixes();
}

console.log('🔥 [真机修复] 真机调试修复脚本加载完成');
