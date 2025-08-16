/**
 * 🛠️ 资源管理器 - 统一管理定时器和监听器，防止内存泄漏
 * 系统性修复方案的一部分
 */

class ResourceManager {
  constructor(pageContext) {
    this.pageContext = pageContext;
    this.timers = new Map();
    this.watchers = new Map();
    this.intervals = new Map();
    this.timeouts = new Map();
    this.isDestroyed = false;
    
    console.log('🛠️ [资源管理器] 初始化完成');
  }

  /**
   * 添加定时器 (setTimeout)
   * @param {string} name - 定时器名称
   * @param {Function} callback - 回调函数
   * @param {number} delay - 延迟时间
   * @returns {number} 定时器ID
   */
  addTimeout(name, callback, delay) {
    if (this.isDestroyed) {
      console.warn(`🛠️ [资源管理器] 页面已销毁，跳过创建定时器: ${name}`);
      return null;
    }

    // 清理同名的旧定时器
    this.removeTimeout(name);
    
    const timerId = setTimeout(() => {
      try {
        callback();
      } catch (error) {
        console.error(`🛠️ [资源管理器] 定时器 ${name} 执行错误:`, error);
      } finally {
        // 执行完成后自动清理
        this.timeouts.delete(name);
      }
    }, delay);
    
    this.timeouts.set(name, timerId);
    console.log(`🛠️ [资源管理器] 添加定时器: ${name} (${delay}ms)`);
    
    return timerId;
  }

  /**
   * 添加间隔定时器 (setInterval)
   * @param {string} name - 定时器名称
   * @param {Function} callback - 回调函数
   * @param {number} interval - 间隔时间
   * @returns {number} 定时器ID
   */
  addInterval(name, callback, interval) {
    if (this.isDestroyed) {
      console.warn(`🛠️ [资源管理器] 页面已销毁，跳过创建间隔定时器: ${name}`);
      return null;
    }

    // 清理同名的旧定时器
    this.removeInterval(name);
    
    const timerId = setInterval(() => {
      try {
        callback();
      } catch (error) {
        console.error(`🛠️ [资源管理器] 间隔定时器 ${name} 执行错误:`, error);
        // 出错时自动清理，防止错误累积
        this.removeInterval(name);
      }
    }, interval);
    
    this.intervals.set(name, timerId);
    console.log(`🛠️ [资源管理器] 添加间隔定时器: ${name} (${interval}ms)`);
    
    return timerId;
  }

  /**
   * 添加数据库监听器
   * @param {string} name - 监听器名称
   * @param {Object} watcher - 监听器对象
   */
  addWatcher(name, watcher) {
    if (this.isDestroyed) {
      console.warn(`🛠️ [资源管理器] 页面已销毁，跳过创建监听器: ${name}`);
      return;
    }

    // 清理同名的旧监听器
    this.removeWatcher(name);
    
    this.watchers.set(name, watcher);
    console.log(`🛠️ [资源管理器] 添加监听器: ${name}`);
  }

  /**
   * 移除指定的定时器
   * @param {string} name - 定时器名称
   */
  removeTimeout(name) {
    const timerId = this.timeouts.get(name);
    if (timerId) {
      clearTimeout(timerId);
      this.timeouts.delete(name);
      console.log(`🛠️ [资源管理器] 移除定时器: ${name}`);
    }
  }

  /**
   * 移除指定的间隔定时器
   * @param {string} name - 定时器名称
   */
  removeInterval(name) {
    const timerId = this.intervals.get(name);
    if (timerId) {
      clearInterval(timerId);
      this.intervals.delete(name);
      console.log(`🛠️ [资源管理器] 移除间隔定时器: ${name}`);
    }
  }

  /**
   * 移除指定的监听器
   * @param {string} name - 监听器名称
   */
  removeWatcher(name) {
    const watcher = this.watchers.get(name);
    if (watcher) {
      try {
        if (typeof watcher.close === 'function') {
          watcher.close();
        }
      } catch (error) {
        console.error(`🛠️ [资源管理器] 关闭监听器 ${name} 时出错:`, error);
      }
      this.watchers.delete(name);
      console.log(`🛠️ [资源管理器] 移除监听器: ${name}`);
    }
  }

  /**
   * 清理所有资源
   */
  cleanup() {
    if (this.isDestroyed) {
      console.warn('🛠️ [资源管理器] 已经执行过清理，跳过重复清理');
      return;
    }

    console.log('🛠️ [资源管理器] 开始清理所有资源...');
    
    // 清理所有定时器
    this.timeouts.forEach((timerId, name) => {
      clearTimeout(timerId);
      console.log(`🛠️ [资源管理器] 清理定时器: ${name}`);
    });
    this.timeouts.clear();
    
    // 清理所有间隔定时器
    this.intervals.forEach((timerId, name) => {
      clearInterval(timerId);
      console.log(`🛠️ [资源管理器] 清理间隔定时器: ${name}`);
    });
    this.intervals.clear();
    
    // 清理所有监听器
    this.watchers.forEach((watcher, name) => {
      try {
        if (watcher && typeof watcher.close === 'function') {
          watcher.close();
        }
      } catch (error) {
        console.error(`🛠️ [资源管理器] 清理监听器 ${name} 时出错:`, error);
      }
      console.log(`🛠️ [资源管理器] 清理监听器: ${name}`);
    });
    this.watchers.clear();
    
    // 标记为已销毁
    this.isDestroyed = true;
    
    console.log('🛠️ [资源管理器] ✅ 所有资源清理完成');
  }

  /**
   * 获取资源使用统计
   * @returns {Object} 资源统计信息
   */
  getStats() {
    return {
      timeouts: this.timeouts.size,
      intervals: this.intervals.size,
      watchers: this.watchers.size,
      isDestroyed: this.isDestroyed,
      total: this.timeouts.size + this.intervals.size + this.watchers.size
    };
  }

  /**
   * 检查资源泄漏
   */
  checkLeaks() {
    const stats = this.getStats();
    
    if (stats.total > 10) {
      console.warn('🛠️ [资源管理器] ⚠️ 检测到可能的资源泄漏:', stats);
    } else {
      console.log('🛠️ [资源管理器] ✅ 资源使用正常:', stats);
    }
    
    return stats;
  }
}

module.exports = ResourceManager;