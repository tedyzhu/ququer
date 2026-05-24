/**
 * 已销毁消息记录的"全局存储"管理
 *
 * 用途:
 * - 跨会话保留某条消息已被销毁的事实(用 openId + chatId 隔离命名空间)
 * - 启动时从本地存储恢复,运行期内同时保持内存(Set)与本地两份副本
 *
 * 存储位置:
 * - 内存:`app.globalDestroyedMessageStore[storageKey]` (Set)
 * - 持久:`wx.getStorageSync(storageKey)` (Array)
 *
 * 命名空间 storageKey:`destroyedMessageIds_<openId>_<chatId>`
 *
 * 使用方式(由 page 调用):
 *   const store = require('./modules/destroyed-store.js');
 *   const key = store.getStorageKey(page);                  // 取 key
 *   store.initialize(page, chatId, userOpenId);             // 启动时初始化
 *   store.ensure(page);                                     // 业务路径里防御性确保已初始化
 *
 * 初始化后,以下两个属性挂在 page 实例上:
 *   - page.globalDestroyedMessageIds: Set<string>
 *   - page.destroyedStoreKey: string
 */

const TAG = '🔥 [销毁消息保护]';

/**
 * 计算当前会话的 storage key
 * @param {Object} page - Page 实例
 * @param {string} [chatIdOverride] - 优先使用的 chatId
 * @param {string} [userOpenIdOverride] - 优先使用的 openId
 * @returns {string}
 */
function getStorageKey(page, chatIdOverride, userOpenIdOverride) {
  const app = getApp();
  const resolvedChatId = chatIdOverride
    || page.data?.contactId
    || page.options?.id
    || 'unknownChat';
  const resolvedUserId = userOpenIdOverride
    || page.data?.currentUser?.openId
    || page.actualCurrentUser?.openId
    || app?.globalData?.openId
    || 'anonymous';
  return `destroyedMessageIds_${resolvedUserId}_${resolvedChatId}`;
}

/**
 * 初始化销毁记录存储(全局 Map + 本地存储恢复)
 *
 * 同一 storageKey 已存在时不重复创建,只把 Set 引用挂到 page 上。
 *
 * @param {Object} page - Page 实例
 * @param {string} [chatId]
 * @param {string} [userOpenId]
 */
function initialize(page, chatId, userOpenId) {
  const app = getApp();
  if (!app.globalDestroyedMessageStore) {
    app.globalDestroyedMessageStore = {};
  }

  const storageKey = getStorageKey(page, chatId, userOpenId);

  if (!app.globalDestroyedMessageStore[storageKey]) {
    app.globalDestroyedMessageStore[storageKey] = new Set();
    console.log(TAG, '创建新的全局销毁消息记录:', storageKey);

    try {
      const savedDestroyedIds = wx.getStorageSync(storageKey);
      if (savedDestroyedIds && Array.isArray(savedDestroyedIds)) {
        savedDestroyedIds.forEach(id => app.globalDestroyedMessageStore[storageKey].add(id));
        console.log(TAG, '从本地存储恢复销毁记录:', savedDestroyedIds.length, '条');
      }
    } catch (e) {
      console.log(TAG, '本地存储恢复失败:', e);
    }
  } else {
    console.log(
      TAG,
      '使用现有的全局销毁消息记录:', storageKey,
      '数量:', app.globalDestroyedMessageStore[storageKey].size
    );
  }

  page.globalDestroyedMessageIds = app.globalDestroyedMessageStore[storageKey];
  page.destroyedStoreKey = storageKey;
}

/**
 * 防御性确保 page 上的销毁记录存储已初始化。
 * 业务路径中如果不确定 onLoad 是否已经走过 initialize,可调用此函数兜底。
 *
 * @param {Object} page - Page 实例
 */
function ensure(page) {
  if (!page.globalDestroyedMessageIds) {
    initialize(page, page.data?.contactId, page.data?.currentUser?.openId);
  }
}

module.exports = {
  getStorageKey,
  initialize,
  ensure
};
