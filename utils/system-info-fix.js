/**
 * 系统信息获取修复工具
 * 替换过时的wx.getSystemInfoSync API
 * @author ququer团队
 * @since 2024-01-01
 */

/**
 * 获取系统信息（修复版本）
 * 替换过时的wx.getSystemInfoSync
 * @returns {Promise<Object>} 系统信息对象
 */
function getSystemInfo() {
  return new Promise((resolve, reject) => {
    try {
      // 使用新的API组合获取完整系统信息
      const promises = [];
      
      // 获取设备信息
      promises.push(new Promise((res) => {
        if (wx.getDeviceInfo) {
          wx.getDeviceInfo({
            success: res,
            fail: () => res({})
          });
        } else {
          res({});
        }
      }));
      
      // 获取窗口信息
      promises.push(new Promise((res) => {
        if (wx.getWindowInfo) {
          wx.getWindowInfo({
            success: res,
            fail: () => res({})
          });
        } else {
          res({});
        }
      }));
      
      // 获取应用基础信息
      promises.push(new Promise((res) => {
        if (wx.getAppBaseInfo) {
          wx.getAppBaseInfo({
            success: res,
            fail: () => res({})
          });
        } else {
          res({});
        }
      }));
      
      // 获取系统设置
      promises.push(new Promise((res) => {
        if (wx.getSystemSetting) {
          wx.getSystemSetting({
            success: res,
            fail: () => res({})
          });
        } else {
          res({});
        }
      }));
      
      // 获取应用授权设置
      promises.push(new Promise((res) => {
        if (wx.getAppAuthorizeSetting) {
          wx.getAppAuthorizeSetting({
            success: res,
            fail: () => res({})
          });
        } else {
          res({});
        }
      }));
      
      Promise.all(promises).then(results => {
        const [deviceInfo, windowInfo, appBaseInfo, systemSetting, appAuthSetting] = results;
        
        // 合并所有信息
        const systemInfo = {
          ...deviceInfo,
          ...windowInfo,
          ...appBaseInfo,
          ...systemSetting,
          ...appAuthSetting,
          // 添加兼容性字段
          model: deviceInfo.model || '未知设备',
          pixelRatio: windowInfo.pixelRatio || 1,
          windowWidth: windowInfo.windowWidth || 375,
          windowHeight: windowInfo.windowHeight || 667,
          platform: deviceInfo.platform || 'unknown',
          system: deviceInfo.system || '未知系统',
          version: appBaseInfo.version || '1.0.0',
          SDKVersion: appBaseInfo.SDKVersion || '1.0.0'
        };
        
        resolve(systemInfo);
      }).catch(reject);
      
    } catch (error) {
      console.warn('获取系统信息失败，使用降级方案:', error);
      
      // 降级方案：使用原始API（但会有警告）
      try {
        const info = wx.getSystemInfoSync();
        resolve(info);
      } catch (fallbackError) {
        console.error('降级方案也失败了:', fallbackError);
        // 返回最基本的默认值
        resolve({
          model: '未知设备',
          pixelRatio: 1,
          windowWidth: 375,
          windowHeight: 667,
          platform: 'unknown',
          system: '未知系统',
          version: '1.0.0',
          SDKVersion: '1.0.0'
        });
      }
    }
  });
}

/**
 * 同步获取系统信息（兼容性方法）
 * 注意：这是为了兼容旧代码，建议使用异步版本
 * @returns {Object} 系统信息对象
 */
function getSystemInfoSync() {
  console.warn('建议使用异步版本的getSystemInfo()方法');
  
  try {
    // 尝试使用新API的同步版本
    const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
    const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
    
    return {
      ...deviceInfo,
      ...windowInfo,
      ...appBaseInfo,
      // 添加兼容性字段
      model: deviceInfo.model || '未知设备',
      pixelRatio: windowInfo.pixelRatio || 1,
      windowWidth: windowInfo.windowWidth || 375,
      windowHeight: windowInfo.windowHeight || 667,
      platform: deviceInfo.platform || 'unknown',
      system: deviceInfo.system || '未知系统',
      version: appBaseInfo.version || '1.0.0',
      SDKVersion: appBaseInfo.SDKVersion || '1.0.0'
    };
  } catch (error) {
    console.warn('新API获取失败，使用原始API:', error);
    try {
      return wx.getSystemInfoSync();
    } catch (fallbackError) {
      console.error('所有获取方式都失败了:', fallbackError);
      return {
        model: '未知设备',
        pixelRatio: 1,
        windowWidth: 375,
        windowHeight: 667,
        platform: 'unknown',
        system: '未知系统',
        version: '1.0.0',
        SDKVersion: '1.0.0'
      };
    }
  }
}

/**
 * 应用系统信息修复
 * 替换全局的wx.getSystemInfoSync
 */
function applySystemInfoFix() {
  if (typeof wx !== 'undefined') {
    console.log('🔧 应用系统信息API修复...');
    
    // 保存原始方法
    const originalGetSystemInfoSync = wx.getSystemInfoSync;
    const originalGetSystemInfo = wx.getSystemInfo;
    
    // 替换同步方法
    wx.getSystemInfoSync = function() {
      console.warn('[已弃用] wx.getSystemInfoSync，建议使用wx.getDeviceInfo等新API');
      return getSystemInfoSync();
    };
    
    // 增强异步方法
    wx.getSystemInfo = function(options = {}) {
      getSystemInfo().then(info => {
        if (options.success) options.success(info);
        if (options.complete) options.complete(info);
      }).catch(error => {
        console.error('获取系统信息失败:', error);
        if (options.fail) options.fail(error);
        if (options.complete) options.complete({ error });
      });
    };
    
    console.log('✅ 系统信息API修复完成');
  }
}

// 导出方法
module.exports = {
  getSystemInfo,
  getSystemInfoSync,
  applySystemInfoFix
}; 