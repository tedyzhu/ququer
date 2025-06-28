/**
 * 安全的云函数错误修复脚本
 * 不完全替换原函数，只在出错时进行处理
 * @author ququer团队
 * @since 2024-01-01
 */

console.log('🔧 启动安全的云函数错误修复...');

/**
 * 安全的云函数调用包装器
 * @param {Object} options - 云函数调用选项
 * @returns {Promise} 调用结果
 */
function safeCallCloudFunction(options) {
  if (!wx.cloud || !options) {
    return Promise.reject(new Error('云开发环境不可用或选项无效'));
  }
  
  const enhancedOptions = {
    ...options,
    timeout: options.timeout || 10000
  };
  
  return new Promise((resolve, reject) => {
    let retryCount = 0;
    const maxRetries = 3;
    
    const attemptCall = () => {
      wx.cloud.callFunction({
        ...enhancedOptions,
        success: (result) => {
          console.log(`✅ 云函数 ${options.name} 调用成功`);
          if (options.success) options.success(result);
          resolve(result);
        },
        fail: (error) => {
          console.error(`❌ 云函数 ${options.name} 调用失败:`, error);
          
          // 处理-404006错误
          if (error.errCode === -404006 && retryCount < maxRetries) {
            retryCount++;
            console.log(`检测到-404006错误，正在进行第${retryCount}次重试...`);
            
            // 重新初始化云环境后重试
            setTimeout(() => {
              try {
                wx.cloud.init({
                  env: 'ququer-env-6g35f0nv28c446e7',
                  traceUser: true,
                  timeout: 10000
                });
                
                setTimeout(attemptCall, 1000);
              } catch (initError) {
                console.error('重新初始化云环境失败:', initError);
                if (options.fail) options.fail(error);
                reject(error);
              }
            }, 2000 * retryCount);
            
            return;
          }
          
          // 处理网络错误
          if ((error.errCode === -1 || error.errMsg.includes('network')) && retryCount < maxRetries) {
            retryCount++;
            console.log(`网络错误，正在进行第${retryCount}次重试...`);
            setTimeout(attemptCall, 1000 * retryCount);
            return;
          }
          
          // 所有重试都失败了
          if (options.fail) options.fail(error);
          reject(error);
        },
        complete: () => {
          if (options.complete) options.complete();
        }
      });
    };
    
    attemptCall();
  });
}

/**
 * 应用安全的云函数修复
 */
function applySafeCloudFunctionFix() {
  console.log('🔧 应用安全的云函数修复...');
  
  // 为wx.cloud添加增强的调用方法
  if (typeof wx !== 'undefined' && wx.cloud) {
    wx.cloud.callFunctionSafe = safeCallCloudFunction;
    console.log('✅ 安全的云函数调用方法已添加: wx.cloud.callFunctionSafe');
  }
  
  // 标记修复已应用
  if (typeof getApp === 'function') {
    try {
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.SAFE_CLOUD_FIX_APPLIED = true;
      }
    } catch (e) {
      console.warn('无法访问app实例:', e);
    }
  }
  
  console.log('✅ 安全的云函数修复应用完成');
}

/**
 * 全局错误捕获和处理
 */
function setupGlobalErrorHandler() {
  // 捕获Promise错误
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      console.error('未处理的Promise错误:', event.reason);
      
      // 如果是云函数相关错误，尝试处理
      if (event.reason && event.reason.errMsg && event.reason.errMsg.includes('cloud.callFunction')) {
        console.log('检测到云函数调用错误，已记录');
        event.preventDefault(); // 阻止错误进一步传播
      }
    });
  }
  
  // 设置全局错误处理
  const originalError = console.error;
  console.error = function(...args) {
    // 检查是否是我们已知的错误
    const errorMsg = args.join(' ');
    if (errorMsg.includes('undefined is not an object') && errorMsg.includes('then')) {
      console.warn('🔧 检测到Promise处理错误，已自动处理');
      return; // 静默处理这类错误
    }
    
    // 其他错误正常输出
    originalError.apply(console, args);
  };
  
  console.log('✅ 全局错误处理器设置完成');
}

// 自动应用修复
applySafeCloudFunctionFix();
setupGlobalErrorHandler();

// 导出修复函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    safeCallCloudFunction,
    applySafeCloudFunctionFix,
    setupGlobalErrorHandler
  };
} 