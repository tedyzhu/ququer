/**
 * 🚨 统一错误处理器 - 标准化错误处理和日志记录
 * 系统性修复方案的一部分
 */

class ErrorHandler {
  static errorCounts = new Map();
  static lastErrors = [];
  static maxErrorHistory = 50;

  /**
   * 主要错误处理方法
   * @param {Error|Object} error - 错误对象
   * @param {string} context - 错误上下文
   * @param {Object} additionalData - 附加数据
   * @returns {string} 错误ID
   */
  static handle(error, context = '', additionalData = {}) {
    const timestamp = new Date().toISOString();
    const errorId = this.generateErrorId();
    
    // 创建标准化错误对象
    const standardError = this.standardizeError(error, context, errorId, additionalData);
    
    // 记录错误
    this.recordError(standardError);
    
    // 根据错误类型进行分类处理
    this.processErrorByType(standardError);
    
    // 输出格式化错误日志
    this.logError(standardError);
    
    return errorId;
  }

  /**
   * 云函数错误专用处理
   * @param {Object} error - 云函数错误
   * @param {string} functionName - 云函数名称
   * @param {Object} callData - 调用数据
   */
  static handleCloudFunction(error, functionName, callData = {}) {
    const context = `云函数调用[${functionName}]`;
    const additionalData = {
      functionName,
      callData,
      errorType: 'cloud_function'
    };
    
    const errorId = this.handle(error, context, additionalData);
    
    // 云函数特殊错误处理
    if (error.errCode === -404006) {
      this.handleCloudConnectionError(error, functionName, errorId);
    } else if (error.errCode === -404007) {
      this.handleCloudTimeoutError(error, functionName, errorId);
    }
    
    return errorId;
  }

  /**
   * 页面导航错误处理
   * @param {Object} error - 导航错误
   * @param {string} targetUrl - 目标URL
   */
  static handleNavigation(error, targetUrl) {
    const context = `页面导航[${targetUrl}]`;
    const additionalData = {
      targetUrl,
      errorType: 'navigation'
    };
    
    return this.handle(error, context, additionalData);
  }

  /**
   * 数据处理错误
   * @param {Object} error - 数据错误
   * @param {string} operation - 操作类型
   * @param {Object} data - 相关数据
   */
  static handleDataError(error, operation, data = {}) {
    const context = `数据处理[${operation}]`;
    const additionalData = {
      operation,
      data: this.sanitizeData(data),
      errorType: 'data_processing'
    };
    
    return this.handle(error, context, additionalData);
  }

  /**
   * 标准化错误对象
   * @private
   */
  static standardizeError(error, context, errorId, additionalData) {
    return {
      id: errorId,
      timestamp: new Date().toISOString(),
      context,
      message: error.message || error.errMsg || String(error),
      code: error.errCode || error.code || 'UNKNOWN',
      stack: error.stack || null,
      type: additionalData.errorType || 'general',
      severity: this.determineSeverity(error),
      additionalData
    };
  }

  /**
   * 记录错误到历史
   * @private
   */
  static recordError(standardError) {
    // 添加到错误历史
    this.lastErrors.unshift(standardError);
    if (this.lastErrors.length > this.maxErrorHistory) {
      this.lastErrors.pop();
    }
    
    // 统计错误频率
    const errorKey = `${standardError.type}:${standardError.code}`;
    const count = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, count + 1);
  }

  /**
   * 根据错误类型进行处理
   * @private
   */
  static processErrorByType(standardError) {
    switch (standardError.type) {
      case 'cloud_function':
        this.processCloudFunctionError(standardError);
        break;
      case 'navigation':
        this.processNavigationError(standardError);
        break;
      case 'data_processing':
        this.processDataError(standardError);
        break;
      default:
        this.processGeneralError(standardError);
    }
  }

  /**
   * 云函数连接错误处理
   * @private
   */
  static handleCloudConnectionError(error, functionName, errorId) {
    console.warn(`🌩️ [云函数连接] ${functionName} 连接失败，错误ID: ${errorId}`);
    
    // 可以在这里添加重试逻辑
    // this.scheduleRetry(functionName, errorId);
  }

  /**
   * 云函数超时错误处理
   * @private
   */
  static handleCloudTimeoutError(error, functionName, errorId) {
    console.warn(`⏱️ [云函数超时] ${functionName} 执行超时，错误ID: ${errorId}`);
    
    // 可以在这里添加超时处理逻辑
  }

  /**
   * 生成错误ID
   * @private
   */
  static generateErrorId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `err_${timestamp}_${random}`;
  }

  /**
   * 确定错误严重程度
   * @private
   */
  static determineSeverity(error) {
    if (error.errCode === -404006 || error.errCode === -404007) {
      return 'medium'; // 云函数错误通常是网络问题
    }
    
    if (error.message && error.message.includes('Cannot read property')) {
      return 'high'; // 空指针错误比较严重
    }
    
    return 'low';
  }

  /**
   * 清理敏感数据
   * @private
   */
  static sanitizeData(data) {
    const sanitized = { ...data };
    
    // 移除敏感字段
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.openId;
    
    // 限制数据大小
    const jsonStr = JSON.stringify(sanitized);
    if (jsonStr.length > 1000) {
      return { ...sanitized, _truncated: true, _originalSize: jsonStr.length };
    }
    
    return sanitized;
  }

  /**
   * 输出格式化错误日志
   * @private
   */
  static logError(standardError) {
    const severityEmoji = {
      low: '🟡',
      medium: '🟠', 
      high: '🔴'
    };
    
    const emoji = severityEmoji[standardError.severity] || '⚪';
    
    console.error(
      `${emoji} [${standardError.id}] ${standardError.context}:`,
      standardError.message,
      {
        code: standardError.code,
        type: standardError.type,
        timestamp: standardError.timestamp,
        additionalData: standardError.additionalData
      }
    );
  }

  /**
   * 处理云函数错误
   * @private
   */
  static processCloudFunctionError(standardError) {
    // 可以添加特殊的云函数错误处理逻辑
  }

  /**
   * 处理导航错误
   * @private
   */
  static processNavigationError(standardError) {
    // 可以添加导航错误的恢复逻辑
  }

  /**
   * 处理数据错误
   * @private
   */
  static processDataError(standardError) {
    // 可以添加数据错误的修复逻辑
  }

  /**
   * 处理一般错误
   * @private
   */
  static processGeneralError(standardError) {
    // 一般错误的处理逻辑
  }

  /**
   * 获取错误统计
   * @returns {Object} 错误统计信息
   */
  static getStats() {
    const errorTypes = {};
    const errorCodes = {};
    
    this.lastErrors.forEach(error => {
      errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
      errorCodes[error.code] = (errorCodes[error.code] || 0) + 1;
    });
    
    return {
      totalErrors: this.lastErrors.length,
      errorTypes,
      errorCodes,
      recentErrors: this.lastErrors.slice(0, 5),
      frequentErrors: Array.from(this.errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };
  }

  /**
   * 清理错误历史
   */
  static clearHistory() {
    this.lastErrors = [];
    this.errorCounts.clear();
    console.log('🚨 [错误处理器] 错误历史已清理');
  }
}

module.exports = ErrorHandler;