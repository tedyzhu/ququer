/**
 * ⚡ 性能监控器 - 监控和优化应用性能
 * 系统性修复方案的一部分
 */

const Logger = require('./logger.js');

class PerformanceMonitor {
  static timers = new Map();
  static metrics = new Map();
  static thresholds = {
    slow: 100,        // 慢操作阈值(ms)
    verySlow: 500,    // 非常慢操作阈值(ms)
    memoryWarning: 50, // 内存警告阈值(MB)
    maxMetrics: 100   // 最大指标数量
  };

  /**
   * 开始性能计时
   * @param {string} name - 操作名称
   * @returns {string} 计时器ID
   */
  static startTimer(name) {
    const timerId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.timers.set(timerId, {
      name,
      startTime: performance.now(),
      timestamp: Date.now()
    });
    
    Logger.debug(`⚡ [性能] 开始计时: ${name} [${timerId}]`);
    return timerId;
  }

  /**
   * 结束性能计时
   * @param {string} timerId - 计时器ID
   * @returns {number} 耗时(ms)
   */
  static endTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) {
      Logger.warn(`⚡ [性能] 计时器不存在: ${timerId}`);
      return 0;
    }
    
    const endTime = performance.now();
    const duration = endTime - timer.startTime;
    
    // 记录性能指标
    this.recordMetric(timer.name, duration);
    
    // 清理计时器
    this.timers.delete(timerId);
    
    // 根据耗时输出不同级别的日志
    if (duration > this.thresholds.verySlow) {
      Logger.error(`⚡ [性能] 极慢操作: ${timer.name} 耗时 ${duration.toFixed(2)}ms`);
    } else if (duration > this.thresholds.slow) {
      Logger.warn(`⚡ [性能] 慢操作: ${timer.name} 耗时 ${duration.toFixed(2)}ms`);
    } else {
      Logger.debug(`⚡ [性能] ${timer.name} 耗时 ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  }

  /**
   * 简单的性能测量装饰器
   * @param {string} name - 操作名称
   * @param {Function} func - 要测量的函数
   * @returns {Function} 包装后的函数
   */
  static measure(name, func) {
    return function(...args) {
      const timerId = PerformanceMonitor.startTimer(name);
      try {
        const result = func.apply(this, args);
        
        // 处理异步函数
        if (result && typeof result.then === 'function') {
          return result.finally(() => {
            PerformanceMonitor.endTimer(timerId);
          });
        }
        
        PerformanceMonitor.endTimer(timerId);
        return result;
      } catch (error) {
        PerformanceMonitor.endTimer(timerId);
        throw error;
      }
    };
  }

  /**
   * 记录性能指标
   * @param {string} name - 指标名称
   * @param {number} value - 指标值
   */
  static recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity,
        average: 0,
        recent: []
      });
    }
    
    const metric = this.metrics.get(name);
    metric.count++;
    metric.total += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.average = metric.total / metric.count;
    
    // 保存最近的10个值
    metric.recent.unshift(value);
    if (metric.recent.length > 10) {
      metric.recent.pop();
    }
    
    // 限制指标数量
    if (this.metrics.size > this.thresholds.maxMetrics) {
      const oldestKey = this.metrics.keys().next().value;
      this.metrics.delete(oldestKey);
    }
  }

  /**
   * 监控内存使用
   * @returns {Object} 内存信息
   */
  static checkMemory() {
    if (typeof wx !== 'undefined' && wx.getPerformance) {
      try {
        const memory = wx.getPerformance().getEntries();
        Logger.debug('⚡ [性能] 内存信息:', memory);
        return memory;
      } catch (error) {
        Logger.warn('⚡ [性能] 无法获取内存信息:', error);
      }
    }
    
    // 简单的内存使用估算
    const estimatedMemory = this.estimateMemoryUsage();
    if (estimatedMemory > this.thresholds.memoryWarning) {
      Logger.warn(`⚡ [性能] 内存使用较高: 约 ${estimatedMemory}MB`);
    }
    
    return { estimated: estimatedMemory };
  }

  /**
   * 估算内存使用
   * @private
   */
  static estimateMemoryUsage() {
    // 基于对象数量的简单估算
    let objectCount = 0;
    
    try {
      // 统计全局对象
      if (typeof getCurrentPages === 'function') {
        const pages = getCurrentPages();
        objectCount += pages.length * 100; // 每个页面估算100个对象
        
        // 统计页面数据
        pages.forEach(page => {
          if (page.data) {
            objectCount += this.countObjects(page.data);
          }
        });
      }
      
      // 简单转换为MB估算
      return Math.round(objectCount / 1000);
    } catch (error) {
      Logger.warn('⚡ [性能] 内存估算失败:', error);
      return 0;
    }
  }

  /**
   * 递归统计对象数量
   * @private
   */
  static countObjects(obj, depth = 0) {
    if (depth > 5 || !obj || typeof obj !== 'object') {
      return 0;
    }
    
    let count = 1;
    try {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          count += this.countObjects(obj[key], depth + 1);
        }
      }
    } catch (error) {
      // 忽略计数错误
    }
    
    return count;
  }

  /**
   * 获取性能报告
   * @returns {Object} 性能报告
   */
  static getReport() {
    const report = {
      timestamp: new Date().toISOString(),
      activeTimers: this.timers.size,
      metrics: {},
      memory: this.checkMemory(),
      summary: {
        totalOperations: 0,
        slowOperations: 0,
        averageTime: 0
      }
    };
    
    // 处理性能指标
    for (const [name, metric] of this.metrics.entries()) {
      report.metrics[name] = {
        count: metric.count,
        average: Math.round(metric.average * 100) / 100,
        min: Math.round(metric.min * 100) / 100,
        max: Math.round(metric.max * 100) / 100,
        recent: metric.recent.slice(0, 5)
      };
      
      report.summary.totalOperations += metric.count;
      if (metric.average > this.thresholds.slow) {
        report.summary.slowOperations++;
      }
    }
    
    // 计算总体平均时间
    if (this.metrics.size > 0) {
      const totalTime = Array.from(this.metrics.values())
        .reduce((sum, metric) => sum + metric.total, 0);
      report.summary.averageTime = Math.round((totalTime / report.summary.totalOperations) * 100) / 100;
    }
    
    return report;
  }

  /**
   * 清理性能数据
   */
  static clear() {
    this.timers.clear();
    this.metrics.clear();
    Logger.info('⚡ [性能] 性能数据已清理');
  }

  /**
   * 设置性能阈值
   * @param {Object} newThresholds - 新的阈值配置
   */
  static setThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    Logger.info('⚡ [性能] 性能阈值已更新:', this.thresholds);
  }

  /**
   * 监控页面性能
   * @param {Object} page - 页面实例
   */
  static monitorPage(page) {
    if (!page || typeof page !== 'object') {
      return;
    }
    
    // 包装页面方法
    const methodsToMonitor = ['onLoad', 'onShow', 'onHide', 'onUnload'];
    
    methodsToMonitor.forEach(methodName => {
      const originalMethod = page[methodName];
      if (typeof originalMethod === 'function') {
        page[methodName] = this.measure(`页面${methodName}`, originalMethod);
      }
    });
    
    Logger.info(`⚡ [性能] 已启用页面性能监控`);
  }
}

module.exports = PerformanceMonitor;