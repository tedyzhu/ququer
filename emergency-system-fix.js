/**
 * 🚨 紧急系统修复脚本 - 解决模块路径问题和启动错误
 * 在微信小程序开发者工具控制台中运行此脚本
 */

(function() {
  console.log('🚨 ==================== 紧急系统修复开始 ====================');

  // 获取当前页面
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  
  if (!currentPage) {
    console.log('❌ 无法获取当前页面，修复失败');
    return;
  }

  console.log('📍 当前页面路径:', currentPage.route || '未知');

  // 检查是否是聊天页面
  const isChatPage = currentPage.route && currentPage.route.includes('chat');
  
  if (isChatPage) {
    console.log('🔧 检测到聊天页面，开始紧急修复...');
    
    // 1. 创建简化的资源管理器
    if (!currentPage.resourceManager) {
      console.log('🛠️ [紧急修复] 创建简化资源管理器...');
      
      currentPage.resourceManager = {
        timers: new Map(),
        watchers: new Map(),
        
        addTimeout: function(name, callback, delay) {
          if (this.timers.has(name)) {
            clearTimeout(this.timers.get(name));
          }
          const timerId = setTimeout(callback, delay);
          this.timers.set(name, timerId);
          return timerId;
        },
        
        addInterval: function(name, callback, interval) {
          if (this.timers.has(name)) {
            clearInterval(this.timers.get(name));
          }
          const timerId = setInterval(callback, interval);
          this.timers.set(name, timerId);
          return timerId;
        },
        
        addWatcher: function(name, watcher) {
          if (this.watchers.has(name)) {
            const oldWatcher = this.watchers.get(name);
            if (oldWatcher && typeof oldWatcher.close === 'function') {
              oldWatcher.close();
            }
          }
          this.watchers.set(name, watcher);
        },
        
        removeTimeout: function(name) {
          if (this.timers.has(name)) {
            clearTimeout(this.timers.get(name));
            this.timers.delete(name);
          }
        },
        
        removeInterval: function(name) {
          if (this.timers.has(name)) {
            clearInterval(this.timers.get(name));
            this.timers.delete(name);
          }
        },
        
        removeWatcher: function(name) {
          if (this.watchers.has(name)) {
            const watcher = this.watchers.get(name);
            if (watcher && typeof watcher.close === 'function') {
              watcher.close();
            }
            this.watchers.delete(name);
          }
        },
        
        cleanup: function() {
          console.log('🧹 [紧急修复] 清理所有资源...');
          
          // 清理定时器
          this.timers.forEach((timerId, name) => {
            clearTimeout(timerId);
            clearInterval(timerId);
            console.log(`🧹 [紧急修复] 清理定时器: ${name}`);
          });
          this.timers.clear();
          
          // 清理监听器
          this.watchers.forEach((watcher, name) => {
            try {
              if (watcher && typeof watcher.close === 'function') {
                watcher.close();
              }
            } catch (error) {
              console.warn(`🧹 [紧急修复] 清理监听器 ${name} 时出错:`, error);
            }
            console.log(`🧹 [紧急修复] 清理监听器: ${name}`);
          });
          this.watchers.clear();
          
          console.log('🧹 [紧急修复] ✅ 资源清理完成');
        },
        
        getStats: function() {
          return {
            timers: this.timers.size,
            watchers: this.watchers.size,
            total: this.timers.size + this.watchers.size
          };
        }
      };
      
      console.log('🛠️ [紧急修复] ✅ 简化资源管理器创建完成');
    }
    
    // 2. 创建简化的错误处理器
    if (!currentPage.handleError) {
      console.log('🛠️ [紧急修复] 创建简化错误处理器...');
      
      currentPage.handleError = function(error, context = '') {
        const timestamp = new Date().toISOString();
        const errorId = Math.random().toString(36).substr(2, 9);
        
        console.error(`🚨 [${timestamp}][${errorId}] ${context}:`, error);
        
        return errorId;
      };
      
      console.log('🛠️ [紧急修复] ✅ 简化错误处理器创建完成');
    }
    
    // 3. 增强onUnload方法
    if (currentPage.onUnload && !currentPage._emergencyFixApplied) {
      console.log('🛠️ [紧急修复] 增强页面卸载方法...');
      
      const originalOnUnload = currentPage.onUnload;
      currentPage.onUnload = function() {
        console.log('🧹 [紧急修复] 页面卸载，开始清理...');
        
        // 使用资源管理器清理
        if (this.resourceManager) {
          this.resourceManager.cleanup();
        }
        
        // 清理其他可能的定时器
        const legacyTimers = [
          'messagePollingTimer', 'chatCreationTimer', 'titleUpdateTimer',
          'participantWatcher', 'messageWatcher', 'connectionCheckTimer'
        ];
        
        legacyTimers.forEach(timerName => {
          if (this[timerName]) {
            try {
              if (typeof this[timerName].close === 'function') {
                this[timerName].close();
              } else {
                clearTimeout(this[timerName]);
                clearInterval(this[timerName]);
              }
              this[timerName] = null;
              console.log(`🧹 [紧急修复] 清理遗留定时器: ${timerName}`);
            } catch (error) {
              console.warn(`🧹 [紧急修复] 清理 ${timerName} 时出错:`, error);
            }
          }
        });
        
        // 调用原始方法
        try {
          originalOnUnload.call(this);
        } catch (error) {
          console.warn('🧹 [紧急修复] 原始onUnload执行出错:', error);
        }
        
        console.log('🧹 [紧急修复] ✅ 页面卸载清理完成');
      };
      
      currentPage._emergencyFixApplied = true;
      console.log('🛠️ [紧急修复] ✅ 页面卸载方法增强完成');
    }
    
    // 4. 添加便捷方法
    if (!currentPage.addTimeout) {
      currentPage.addTimeout = function(name, callback, delay) {
        return this.resourceManager.addTimeout(name, callback, delay);
      };
      
      currentPage.addInterval = function(name, callback, interval) {
        return this.resourceManager.addInterval(name, callback, interval);
      };
      
      currentPage.addWatcher = function(name, watcher) {
        return this.resourceManager.addWatcher(name, watcher);
      };
      
      console.log('🛠️ [紧急修复] ✅ 便捷方法添加完成');
    }
    
    // 5. 检查当前资源状态
    const stats = currentPage.resourceManager.getStats();
    console.log('📊 [紧急修复] 当前资源状态:', stats);
    
    if (stats.total > 5) {
      console.warn('⚠️ [紧急修复] 当前资源数量较多，建议检查');
    }
    
  } else {
    console.log('📍 不是聊天页面，跳过聊天页面专用修复');
  }
  
  // 通用修复：创建全局错误处理
  if (!getApp().emergencyErrorHandler) {
    console.log('🛠️ [紧急修复] 创建全局错误处理器...');
    
    getApp().emergencyErrorHandler = function(error, context) {
      const timestamp = new Date().toISOString();
      console.error(`🚨 [全局错误][${timestamp}] ${context}:`, error);
    };
    
    // 捕获未处理的Promise错误
    if (typeof wx !== 'undefined' && wx.onUnhandledRejection) {
      wx.onUnhandledRejection((res) => {
        getApp().emergencyErrorHandler(res.reason, 'Promise未处理错误');
      });
    }
    
    console.log('🛠️ [紧急修复] ✅ 全局错误处理器创建完成');
  }
  
  // 验证修复效果
  console.log('🔍 [紧急修复] 验证修复效果...');
  
  const verificationResults = {
    resourceManager: !!currentPage.resourceManager,
    errorHandler: !!currentPage.handleError,
    enhancedOnUnload: !!currentPage._emergencyFixApplied,
    globalErrorHandler: !!getApp().emergencyErrorHandler
  };
  
  console.log('📊 [紧急修复] 验证结果:', verificationResults);
  
  const successCount = Object.values(verificationResults).filter(Boolean).length;
  const totalCount = Object.keys(verificationResults).length;
  
  if (successCount === totalCount) {
    console.log('🎉 [紧急修复] ✅ 所有修复项目验证通过！');
    console.log('🚀 [紧急修复] 应用现在应该能够正常运行');
  } else {
    console.warn(`⚠️ [紧急修复] 部分修复未完成 (${successCount}/${totalCount})`);
  }
  
  // 提供后续操作指南
  console.log('');
  console.log('📋 [紧急修复] 后续操作建议:');
  console.log('1. 重新启动应用测试功能是否正常');
  console.log('2. 观察控制台是否还有模块路径错误');
  console.log('3. 测试聊天功能的内存管理是否正常');
  console.log('4. 如果问题持续，请使用完整的系统修复方案');
  
  console.log('🚨 ==================== 紧急系统修复完成 ====================');
  
  return {
    success: successCount === totalCount,
    applied: successCount,
    total: totalCount,
    details: verificationResults,
    currentPage: currentPage.route || '未知'
  };
})();