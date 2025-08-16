/**
 * 📝 日志管理器 - 配置化的日志输出控制
 * 系统性修复方案的一部分，解决日志过量问题
 */

class Logger {
  static config = {
    // 环境配置
    environment: 'development', // 'development' | 'production'
    
    // 日志级别配置
    levels: {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    },
    
    // 当前日志级别
    currentLevel: 'debug',
    
    // 日志输出配置
    output: {
      console: true,
      storage: false,
      remote: false
    },
    
    // 性能配置
    maxLogs: 100,          // 最大日志数量
    logBuffer: [],         // 日志缓冲区
    enableThrottling: true, // 启用日志节流
    throttleInterval: 1000, // 节流间隔(ms)
    
    // 过滤配置
    filters: {
      exclude: [
        '监听到消息变化',
        '轮询检查新消息',
        '在线状态变化'
      ],
      include: [
        '系统修复',
        'HOTFIX',
        '错误',
        '失败'
      ]
    }
  };

  static throttleTimers = new Map();
  static logCounts = new Map();

  /**
   * 初始化日志器
   * @param {Object} config - 配置选项
   */
  static init(config = {}) {
    this.config = { ...this.config, ...config };
    
    // 根据环境自动调整配置
    if (this.config.environment === 'production') {
      this.config.currentLevel = 'error';
      this.config.maxLogs = 50;
      this.config.enableThrottling = true;
    }
    
    console.log('📝 [日志管理器] 初始化完成，当前级别:', this.config.currentLevel);
  }

  /**
   * 调试日志
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  static debug(message, data = null) {
    this._log('debug', message, data);
  }

  /**
   * 信息日志
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  static info(message, data = null) {
    this._log('info', message, data);
  }

  /**
   * 警告日志
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  static warn(message, data = null) {
    this._log('warn', message, data);
  }

  /**
   * 错误日志
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  static error(message, data = null) {
    this._log('error', message, data);
  }

  /**
   * 性能日志
   * @param {string} operation - 操作名称
   * @param {number} duration - 耗时(ms)
   */
  static perf(operation, duration) {
    if (duration > 100) {
      this.warn(`⚡ [性能] ${operation} 耗时较长: ${duration}ms`);
    } else {
      this.debug(`⚡ [性能] ${operation} 耗时: ${duration}ms`);
    }
  }

  /**
   * 核心日志处理方法
   * @private
   */
  static _log(level, message, data) {
    // 检查日志级别
    if (!this._shouldLog(level)) {
      return;
    }
    
    // 检查过滤规则
    if (!this._passesFilter(message)) {
      return;
    }
    
    // 节流检查
    if (this.config.enableThrottling && this._isThrottled(message)) {
      return;
    }
    
    // 创建日志对象
    const logEntry = this._createLogEntry(level, message, data);
    
    // 输出日志
    this._outputLog(logEntry);
    
    // 添加到缓冲区
    this._addToBuffer(logEntry);
  }

  /**
   * 检查是否应该记录日志
   * @private
   */
  static _shouldLog(level) {
    const levelValue = this.config.levels[level];
    const currentLevelValue = this.config.levels[this.config.currentLevel];
    return levelValue >= currentLevelValue;
  }

  /**
   * 检查日志过滤规则
   * @private
   */
  static _passesFilter(message) {
    const { exclude, include } = this.config.filters;
    
    // 检查排除规则
    for (const excludePattern of exclude) {
      if (message.includes(excludePattern)) {
        return false;
      }
    }
    
    // 如果有包含规则，检查是否匹配
    if (include.length > 0) {
      for (const includePattern of include) {
        if (message.includes(includePattern)) {
          return true;
        }
      }
      return false; // 没有匹配任何包含规则
    }
    
    return true; // 没有包含规则，默认通过
  }

  /**
   * 检查日志节流
   * @private
   */
  static _isThrottled(message) {
    const key = this._getThrottleKey(message);
    const now = Date.now();
    const lastTime = this.throttleTimers.get(key) || 0;
    
    if (now - lastTime < this.config.throttleInterval) {
      // 更新计数
      const count = this.logCounts.get(key) || 0;
      this.logCounts.set(key, count + 1);
      return true;
    }
    
    // 输出节流统计
    const count = this.logCounts.get(key);
    if (count > 0) {
      console.log(`📝 [日志节流] "${key}" 被节流 ${count} 次`);
      this.logCounts.delete(key);
    }
    
    this.throttleTimers.set(key, now);
    return false;
  }

  /**
   * 获取节流键
   * @private
   */
  static _getThrottleKey(message) {
    // 提取日志的关键部分作为节流键
    const match = message.match(/\[(.*?)\]/);
    return match ? match[1] : message.substring(0, 20);
  }

  /**
   * 创建日志条目
   * @private
   */
  static _createLogEntry(level, message, data) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      id: Math.random().toString(36).substr(2, 8)
    };
  }

  /**
   * 输出日志
   * @private
   */
  static _outputLog(logEntry) {
    if (!this.config.output.console) {
      return;
    }
    
    const { level, message, data } = logEntry;
    const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
    
    // 根据级别选择输出方法
    const consoleMethods = {
      debug: console.log,
      info: console.log,
      warn: console.warn,
      error: console.error
    };
    
    const consoleMethod = consoleMethods[level] || console.log;
    
    if (data !== null && data !== undefined) {
      consoleMethod(`[${timestamp}] ${message}`, data);
    } else {
      consoleMethod(`[${timestamp}] ${message}`);
    }
  }

  /**
   * 添加到日志缓冲区
   * @private
   */
  static _addToBuffer(logEntry) {
    this.config.logBuffer.unshift(logEntry);
    
    // 保持缓冲区大小
    if (this.config.logBuffer.length > this.config.maxLogs) {
      this.config.logBuffer.pop();
    }
  }

  /**
   * 获取日志统计
   * @returns {Object} 统计信息
   */
  static getStats() {
    const stats = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0
    };
    
    this.config.logBuffer.forEach(entry => {
      stats[entry.level]++;
    });
    
    return {
      totalLogs: this.config.logBuffer.length,
      levelStats: stats,
      throttledLogs: Array.from(this.logCounts.entries()),
      currentLevel: this.config.currentLevel,
      environment: this.config.environment
    };
  }

  /**
   * 清理日志缓冲区
   */
  static clearBuffer() {
    this.config.logBuffer = [];
    this.throttleTimers.clear();
    this.logCounts.clear();
    console.log('📝 [日志管理器] 缓冲区已清理');
  }

  /**
   * 导出日志
   * @returns {Array} 日志数组
   */
  static exportLogs() {
    return [...this.config.logBuffer];
  }

  /**
   * 设置日志级别
   * @param {string} level - 日志级别
   */
  static setLevel(level) {
    if (this.config.levels[level] !== undefined) {
      this.config.currentLevel = level;
      console.log(`📝 [日志管理器] 日志级别已设置为: ${level}`);
    } else {
      console.error(`📝 [日志管理器] 无效的日志级别: ${level}`);
    }
  }

  /**
   * 启用/禁用日志输出
   * @param {boolean} enabled - 是否启用
   */
  static setEnabled(enabled) {
    this.config.output.console = enabled;
    console.log(`📝 [日志管理器] 日志输出已${enabled ? '启用' : '禁用'}`);
  }
}

// 自动初始化
Logger.init();

module.exports = Logger;