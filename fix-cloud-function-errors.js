/**
 * 云函数错误修复脚本
 * 解决-404006等云函数调用错误
 * @author ququer团队
 * @since 2024-01-01
 */

console.log('🔧 启动云函数错误修复...');

/**
 * 检查云环境状态
 * @returns {Promise<boolean>} 云环境是否正常
 */
async function checkCloudStatus() {
  try {
    if (!wx.cloud) {
      console.error('❌ 云开发未初始化');
      return false;
    }
    
    // 尝试调用一个简单的云函数来检查连接
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: { test: true },
      timeout: 5000
    });
    
    console.log('✅ 云环境连接正常');
    return true;
  } catch (error) {
    console.error('❌ 云环境连接异常:', error);
    return false;
  }
}

/**
 * 修复云函数调用方法
 * 添加重试机制和错误处理
 */
function fixCloudFunctionCalls() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    console.warn('云开发环境不可用');
    return;
  }
  
  const originalCallFunction = wx.cloud.callFunction;
  
  /**
   * 增强的云函数调用方法
   * @param {Object} options - 云函数调用选项
   * @returns {Promise} 调用结果
   */
  wx.cloud.callFunction = function(options) {
    // 如果传入的options不是有效的对象，直接使用原函数
    if (!options || typeof options !== 'object') {
      return originalCallFunction.call(this, options);
    }
    
    const enhancedOptions = {
      ...options,
      timeout: options.timeout || 10000, // 默认10秒超时
    };
    
    // 保存原始回调函数
    const originalSuccess = options.success;
    const originalFail = options.fail;
    const originalComplete = options.complete;
    
    // 清除增强选项中的回调，避免重复调用
    delete enhancedOptions.success;
    delete enhancedOptions.fail;
    delete enhancedOptions.complete;
    
    // 添加重试逻辑
    const callWithRetry = (retryCount = 0) => {
      try {
        const callResult = originalCallFunction.call(this, enhancedOptions);
        
        // 确保返回值是Promise
        const resultPromise = Promise.resolve(callResult);
        
        return resultPromise
          .then(result => {
            console.log(`✅ 云函数 ${options.name} 调用成功`);
            if (originalSuccess) {
              try {
                originalSuccess(result);
              } catch (e) {
                console.warn('success回调执行错误:', e);
              }
            }
            return result;
          })
          .catch(error => {
            console.error(`❌ 云函数 ${options.name} 调用失败:`, error);
            
            // 处理特定错误码
            if (error.errCode === -404006) {
              console.log('检测到-404006错误，可能是云环境未初始化');
              
              // 如果还有重试次数，尝试重新初始化云环境后重试
              if (retryCount < 2) {
                console.log(`正在进行第 ${retryCount + 1} 次重试...`);
                
                return new Promise((resolve, reject) => {
                  setTimeout(() => {
                    // 重新初始化云环境
                    try {
                      wx.cloud.init({
                        env: 'ququer-env-6g35f0nv28c446e7',
                        traceUser: true,
                        timeout: 10000
                      });
                      
                      // 等待一段时间后重试
                      setTimeout(() => {
                        callWithRetry(retryCount + 1).then(resolve).catch(reject);
                      }, 1000);
                      
                    } catch (initError) {
                      console.error('重新初始化云环境失败:', initError);
                      reject(error);
                    }
                  }, 2000 * (retryCount + 1)); // 递增延迟
                });
              }
            }
            
            // 网络错误重试
            if (error.errCode === -1 || error.errMsg.includes('network')) {
              if (retryCount < 3) {
                console.log(`网络错误，正在进行第 ${retryCount + 1} 次重试...`);
                return new Promise((resolve, reject) => {
                  setTimeout(() => {
                    callWithRetry(retryCount + 1).then(resolve).catch(reject);
                  }, 1000 * (retryCount + 1));
                });
              }
            }
            
            // 所有重试都失败了，调用原始fail回调
            if (originalFail) {
              try {
                originalFail(error);
              } catch (e) {
                console.warn('fail回调执行错误:', e);
              }
            }
            throw error;
          })
          .finally(() => {
            if (originalComplete) {
              try {
                originalComplete();
              } catch (e) {
                console.warn('complete回调执行错误:', e);
              }
            }
          });
          
      } catch (syncError) {
        console.error('云函数调用同步错误:', syncError);
        
        // 同步错误也要调用fail回调
        if (originalFail) {
          try {
            originalFail(syncError);
          } catch (e) {
            console.warn('fail回调执行错误:', e);
          }
        }
        
        if (originalComplete) {
          try {
            originalComplete();
          } catch (e) {
            console.warn('complete回调执行错误:', e);
          }
        }
        
        return Promise.reject(syncError);
      }
    };
    
    return callWithRetry();
  };
  
  console.log('✅ 云函数调用增强完成');
}

/**
 * 应用云函数修复
 */
function applyCloudFunctionFix() {
  console.log('🔧 应用云函数修复...');
  
  // 修复云函数调用
  fixCloudFunctionCalls();
  
  // 如果有app实例，检查云环境状态
  if (typeof getApp === 'function') {
    try {
      const app = getApp();
      if (app && app.globalData) {
        // 标记修复已应用
        app.globalData.CLOUD_FIX_APPLIED = true;
        
        // 检查云环境状态
        setTimeout(() => {
          checkCloudStatus().then(isOk => {
            if (!isOk) {
              console.warn('云环境状态异常，建议检查网络连接和云环境配置');
            }
          });
        }, 2000);
      }
    } catch (e) {
      console.warn('无法访问app实例:', e);
    }
  }
  
  console.log('✅ 云函数修复应用完成');
}

/**
 * 检查并修复云数据库权限
 */
function checkDatabasePermissions() {
  if (!wx.cloud || !wx.cloud.database) {
    console.warn('云数据库不可用');
    return;
  }
  
  console.log('🔧 检查云数据库权限...');
  
  const db = wx.cloud.database();
  
  // 测试读取权限
  db.collection('users').limit(1).get()
    .then(result => {
      console.log('✅ 云数据库读取权限正常');
    })
    .catch(error => {
      console.error('❌ 云数据库权限异常:', error);
      console.warn('请检查云数据库集合权限设置');
    });
}

// 自动应用修复
applyCloudFunctionFix();

// 延迟检查数据库权限
setTimeout(() => {
  checkDatabasePermissions();
}, 3000);

// 导出修复函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyCloudFunctionFix,
    checkCloudStatus,
    checkDatabasePermissions
  };
} 