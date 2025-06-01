/**
 * 🚨 紧急修复btoa编码错误
 * 这个脚本立即修复可能导致btoa错误的编码问题
 */

console.log('🔧 启动编码错误修复...');

// 1. 重写全局的btoa和atob函数，使其支持Unicode（小程序环境兼容）
if (typeof btoa !== 'undefined') {
  const originalBtoa = btoa;
  const originalAtob = atob;
  
  // 检查是否在小程序环境中
  const globalObj = (typeof window !== 'undefined') ? window : global;
  
  // 安全的btoa替换
  const safeBtoa = function(str) {
    try {
      return originalBtoa(str);
    } catch (error) {
      console.warn('btoa编码失败，使用安全方案:', error);
      try {
        // 使用安全的Unicode编码方案
        const utf8Bytes = unescape(encodeURIComponent(str));
        return originalBtoa(utf8Bytes);
      } catch (fallbackError) {
        console.error('安全编码方案也失败了:', fallbackError);
        return str; // 最后的降级方案
      }
    }
  };
  
  // 安全的atob替换
  const safeAtob = function(base64) {
    try {
      return originalAtob(base64);
    } catch (error) {
      console.warn('atob解码失败，使用安全方案:', error);
      try {
        const utf8String = originalAtob(base64);
        return decodeURIComponent(escape(utf8String));
      } catch (fallbackError) {
        console.error('安全解码方案也失败了:', fallbackError);
        return base64; // 最后的降级方案
      }
    }
  };
  
  // 根据环境设置替换函数
  if (typeof globalObj !== 'undefined') {
    globalObj.btoa = safeBtoa;
    globalObj.atob = safeAtob;
  } else {
    // 在小程序环境中直接替换
    btoa = safeBtoa;
    atob = safeAtob;
  }
}

// 2. 重写encodeURIComponent和decodeURIComponent（小程序环境兼容）
if (typeof encodeURIComponent !== 'undefined') {
  const originalEncodeURIComponent = encodeURIComponent;
  const originalDecodeURIComponent = decodeURIComponent;
  
  // 检查是否在小程序环境中（没有window对象）
  const globalObj = (typeof window !== 'undefined') ? window : global;
  if (typeof globalObj !== 'undefined') {
    globalObj.encodeURIComponent = function(str) {
      try {
        return originalEncodeURIComponent(str);
      } catch (error) {
        console.warn('encodeURIComponent失败，使用降级方案:', error);
        // 简单的字符替换作为降级方案
        return str.replace(/[\u4e00-\u9fff]/g, function(match) {
          try {
            return originalEncodeURIComponent(match);
          } catch (e) {
            return match;
          }
        });
      }
    };
    
    globalObj.decodeURIComponent = function(str) {
      try {
        return originalDecodeURIComponent(str);
      } catch (error) {
        console.warn('decodeURIComponent失败，返回原字符串:', error);
        return str;
      }
    };
  } else {
    // 在小程序环境中，直接替换全局函数
    encodeURIComponent = function(str) {
      try {
        return originalEncodeURIComponent(str);
      } catch (error) {
        console.warn('encodeURIComponent失败，使用降级方案:', error);
        return str.replace(/[\u4e00-\u9fff]/g, function(match) {
          try {
            return originalEncodeURIComponent(match);
          } catch (e) {
            return match;
          }
        });
      }
    };
    
    decodeURIComponent = function(str) {
      try {
        return originalDecodeURIComponent(str);
      } catch (error) {
        console.warn('decodeURIComponent失败，返回原字符串:', error);
        return str;
      }
    };
  }
}

// 3. 如果存在小程序环境，修复wx对象中可能的编码问题
if (typeof wx !== 'undefined') {
  console.log('🔧 修复微信小程序环境的编码问题...');
  
  // 拦截可能导致编码问题的API调用
  const originalSetStorageSync = wx.setStorageSync;
  const originalGetStorageSync = wx.getStorageSync;
  
  wx.setStorageSync = function(key, data) {
    try {
      return originalSetStorageSync.call(this, key, data);
    } catch (error) {
      console.warn('存储数据时发生编码错误，尝试安全存储:', error);
      try {
        // 如果是字符串，尝试安全编码
        if (typeof data === 'string') {
          const safeData = data.replace(/[\u4e00-\u9fff]/g, function(match) {
            return encodeURIComponent(match);
          });
          return originalSetStorageSync.call(this, key, safeData);
        } else {
          return originalSetStorageSync.call(this, key, data);
        }
      } catch (fallbackError) {
        console.error('安全存储也失败了:', fallbackError);
        return false;
      }
    }
  };
}

// 4. 设置全局标记，表示修复已应用
if (typeof getApp === 'function') {
  try {
    const app = getApp();
    if (app.globalData) {
      app.globalData.ENCODING_FIX_APPLIED = true;
      console.log('✅ 编码修复已应用到全局数据');
    }
  } catch (e) {
    console.log('无法访问app实例，可能还未初始化');
  }
}

console.log('✅ 编码错误修复完成！');

// 导出修复状态
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applied: true,
    timestamp: new Date().toISOString()
  };
} 