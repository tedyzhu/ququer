/**
 * 🛠️ 系统修复入口 - 统一的系统修复初始化和管理
 * 集成所有系统性修复工具
 */

const ResourceManager = require('./resource-manager.js');
const ErrorHandler = require('./error-handler.js');
const Logger = require('./logger.js');
const PerformanceMonitor = require('./performance-monitor.js');

class SystemFix {
  static isInitialized = false;
  static version = 'v1.3.45-system-fix';
  static activePages = new Map();

  /**
   * 初始化系统修复
   * @param {Object} config - 配置选项
   */
  static init(config = {}) {
    if (this.isInitialized) {
      Logger.warn('🛠️ [系统修复] 已经初始化过，跳过重复初始化');
      return;
    }

    console.log(`🛠️ [系统修复] 开始初始化 ${this.version}...`);

    // 初始化日志管理器
    Logger.init({
      environment: config.environment || 'development',
      currentLevel: config.logLevel || 'debug',
      enableThrottling: config.enableLogThrottling !== false,
      ...config.logger
    });

    // 设置性能监控阈值
    if (config.performance) {
      PerformanceMonitor.setThresholds(config.performance);
    }

    // 应用全局错误处理
    this.setupGlobalErrorHandling();

    // 监控系统资源
    this.startSystemMonitoring();

    this.isInitialized = true;
    Logger.info(`🛠️ [系统修复] ✅ 初始化完成 ${this.version}`);
  }

  /**
   * 为页面启用系统修复
   * @param {Object} page - 页面实例
   * @param {Object} options - 选项
   */
  static enableForPage(page, options = {}) {
    if (!this.isInitialized) {
      this.init();
    }

    const pageId = this.getPageId(page);
    
    if (this.activePages.has(pageId)) {
      Logger.warn(`🛠️ [系统修复] 页面 ${pageId} 已启用修复，跳过重复启用`);
      return this.activePages.get(pageId);
    }

    Logger.info(`🛠️ [系统修复] 为页面启用系统修复: ${pageId}`);

    // 创建页面专用的资源管理器
    const resourceManager = new ResourceManager(page);
    
    // 启用性能监控
    if (options.enablePerformanceMonitoring !== false) {
      PerformanceMonitor.monitorPage(page);
    }

    // 增强页面的错误处理
    this.enhancePageErrorHandling(page);

    // 包装页面方法
    this.wrapPageMethods(page, resourceManager);

    const pageFixInfo = {
      pageId,
      resourceManager,
      startTime: Date.now(),
      options
    };

    this.activePages.set(pageId, pageFixInfo);
    
    Logger.info(`🛠️ [系统修复] ✅ 页面修复启用完成: ${pageId}`);
    return pageFixInfo;
  }

  /**
   * 为页面禁用系统修复
   * @param {Object} page - 页面实例
   */
  static disableForPage(page) {
    const pageId = this.getPageId(page);
    const pageFixInfo = this.activePages.get(pageId);
    
    if (!pageFixInfo) {
      Logger.warn(`🛠️ [系统修复] 页面 ${pageId} 未启用修复，跳过禁用`);
      return;
    }

    Logger.info(`🛠️ [系统修复] 禁用页面修复: ${pageId}`);

    // 清理资源管理器
    if (pageFixInfo.resourceManager) {
      pageFixInfo.resourceManager.cleanup();
    }

    // 移除页面记录
    this.activePages.delete(pageId);
    
    Logger.info(`🛠️ [系统修复] ✅ 页面修复禁用完成: ${pageId}`);
  }

  /**
   * 设置全局错误处理
   * @private
   */
  static setupGlobalErrorHandling() {
    // 小程序全局错误处理
    if (typeof App !== 'undefined') {
      const originalApp = App;
      
      // 包装App函数以添加错误处理
      App = function(appConfig) {
        const originalOnError = appConfig.onError;
        
        appConfig.onError = function(error) {
          ErrorHandler.handle(error, '全局App错误');
          
          if (originalOnError) {
            originalOnError.call(this, error);
          }
        };
        
        return originalApp(appConfig);
      };
    }

    // Promise错误处理
    if (typeof wx !== 'undefined' && wx.onUnhandledRejection) {
      wx.onUnhandledRejection((res) => {
        ErrorHandler.handle(res.reason, 'Promise未处理错误');
      });
    }

    Logger.debug('🛠️ [系统修复] 全局错误处理已设置');
  }

  /**
   * 开始系统监控
   * @private
   */
  static startSystemMonitoring() {
    // 定期检查系统状态
    setInterval(() => {
      this.performSystemCheck();
    }, 30000); // 30秒检查一次

    Logger.debug('🛠️ [系统修复] 系统监控已启动');
  }

  /**
   * 执行系统检查
   * @private
   */
  static performSystemCheck() {
    try {
      const activePageCount = this.activePages.size;
      const memoryInfo = PerformanceMonitor.checkMemory();
      const errorStats = ErrorHandler.getStats();
      const logStats = Logger.getStats();

      // 检查异常情况
      if (activePageCount > 5) {
        Logger.warn(`🛠️ [系统检查] 活跃页面过多: ${activePageCount}`);
      }

      if (errorStats.totalErrors > 20) {
        Logger.warn(`🛠️ [系统检查] 错误数量较多: ${errorStats.totalErrors}`);
      }

      // 定期清理
      if (Date.now() % (5 * 60 * 1000) < 30000) { // 每5分钟
        this.performCleanup();
      }

      Logger.debug(`🛠️ [系统检查] 页面:${activePageCount} 错误:${errorStats.totalErrors} 日志:${logStats.totalLogs}`);
    } catch (error) {
      ErrorHandler.handle(error, '系统检查');
    }
  }

  /**
   * 执行系统清理
   * @private
   */
  static performCleanup() {
    try {
      // 清理过期的页面修复信息
      const now = Date.now();
      const maxAge = 10 * 60 * 1000; // 10分钟

      for (const [pageId, pageFixInfo] of this.activePages.entries()) {
        if (now - pageFixInfo.startTime > maxAge) {
          Logger.warn(`🛠️ [系统清理] 清理过期页面修复: ${pageId}`);
          this.activePages.delete(pageId);
        }
      }

      // 清理日志缓冲区
      if (Logger.getStats().totalLogs > 200) {
        Logger.clearBuffer();
      }

      Logger.debug('🛠️ [系统清理] 定期清理完成');
    } catch (error) {
      ErrorHandler.handle(error, '系统清理');
    }
  }

  /**
   * 获取页面ID
   * @private
   */
  static getPageId(page) {
    try {
      if (page.route) {
        return page.route;
      } else if (page.__route__) {
        return page.__route__;
      } else {
        return `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      }
    } catch (error) {
      return `unknown_page_${Date.now()}`;
    }
  }

  /**
   * 增强页面错误处理
   * @private
   */
  static enhancePageErrorHandling(page) {
    // 包装页面方法以添加错误处理
    const methodsToWrap = ['onLoad', 'onShow', 'onHide', 'onUnload', 'onError'];
    
    methodsToWrap.forEach(methodName => {
      const originalMethod = page[methodName];
      if (typeof originalMethod === 'function') {
        page[methodName] = function(...args) {
          try {
            return originalMethod.apply(this, args);
          } catch (error) {
            ErrorHandler.handle(error, `页面方法[${methodName}]`);
            throw error;
          }
        };
      }
    });
  }

  /**
   * 包装页面方法
   * @private
   */
  static wrapPageMethods(page, resourceManager) {
    // 为页面添加便捷的资源管理方法
    page.addTimeout = function(name, callback, delay) {
      return resourceManager.addTimeout(name, callback, delay);
    };

    page.addInterval = function(name, callback, interval) {
      return resourceManager.addInterval(name, callback, interval);
    };

    page.addWatcher = function(name, watcher) {
      return resourceManager.addWatcher(name, watcher);
    };

    page.removeTimeout = function(name) {
      return resourceManager.removeTimeout(name);
    };

    page.removeInterval = function(name) {
      return resourceManager.removeInterval(name);
    };

    page.removeWatcher = function(name) {
      return resourceManager.removeWatcher(name);
    };

    // 添加性能测量方法
    page.measurePerformance = function(name, func) {
      return PerformanceMonitor.measure(name, func);
    };

    // 添加错误处理方法
    page.handleError = function(error, context) {
      return ErrorHandler.handle(error, context);
    };
  }

  /**
   * 获取系统状态报告
   * @returns {Object} 状态报告
   */
  static getSystemReport() {
    return {
      version: this.version,
      isInitialized: this.isInitialized,
      activePages: this.activePages.size,
      performance: PerformanceMonitor.getReport(),
      errors: ErrorHandler.getStats(),
      logs: Logger.getStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 重置系统修复
   */
  static reset() {
    Logger.info('🛠️ [系统修复] 开始重置系统修复...');

    // 清理所有页面
    for (const [pageId, pageFixInfo] of this.activePages.entries()) {
      if (pageFixInfo.resourceManager) {
        pageFixInfo.resourceManager.cleanup();
      }
    }
    this.activePages.clear();

    // 清理各个组件
    PerformanceMonitor.clear();
    ErrorHandler.clearHistory();
    Logger.clearBuffer();

    this.isInitialized = false;
    
    Logger.info('🛠️ [系统修复] ✅ 系统修复重置完成');
  }
}

module.exports = SystemFix;