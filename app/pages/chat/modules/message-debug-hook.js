/**
 * 消息 setData Diff 调试钩子
 *
 * 在 chat.js 上"猴补"setData,当 patch 包含 messages 字段时:
 * - BEFORE: 比较 page.data.messages 与本次 patch.messages 的 ID 差异
 * - AFTER:  patch 提交后再比较 patch.messages 与 page.data.messages,确认实际生效
 *
 * 使用方式:
 *   const debugHook = require('./modules/message-debug-hook.js');
 *   debugHook.install(this);
 *   ... // 业务运行
 *   debugHook.uninstall(this);
 *
 * 是否启用由 page._messageDiffDebugEnabled 控制(默认关闭),通过 shouldEnable(options) 决定。
 */

const ChatHelpers = require('./chat-helpers.js');
const { DEBUG_FLAGS, parseDebugBoolean, extractMessageIdsForDebug, summarizeMessageIdDiff } = ChatHelpers;

const STORAGE_KEY = 'chat_debug_message_diff';

/**
 * 根据 onLoad options 与本地缓存决定是否启用消息 Diff 日志
 *
 * 优先级:
 *   1. URL 参数 debugMsgDiff / debugMessages / msgDebug(任一存在)
 *   2. 本地缓存(上一次决策结果)
 *   3. DEBUG_FLAGS.ENABLE_MESSAGE_DIFF_LOGS 或 devtools 平台
 *
 * @param {Object} [options] - onLoad 参数
 * @returns {boolean}
 */
function shouldEnable(options) {
  try {
    const query = options || {};
    const queryValue = query.debugMsgDiff !== undefined
      ? query.debugMsgDiff
      : (query.debugMessages !== undefined ? query.debugMessages : query.msgDebug);

    if (queryValue !== undefined) {
      const parsed = parseDebugBoolean(queryValue);
      wx.setStorageSync(STORAGE_KEY, parsed);
      return parsed;
    }

    const stored = wx.getStorageSync(STORAGE_KEY);
    if (stored !== '' && stored !== null && stored !== undefined) {
      return parseDebugBoolean(stored);
    }
  } catch (error) {
    try { console.warn('⚠️ [消息Diff调试] 读取开关失败,使用默认策略:', error); } catch (_) {}
  }

  try {
    if (DEBUG_FLAGS.ENABLE_MESSAGE_DIFF_LOGS) return true;
    return wx.getAppBaseInfo && wx.getAppBaseInfo().platform === 'devtools';
  } catch (error) {
    return !!DEBUG_FLAGS.ENABLE_MESSAGE_DIFF_LOGS;
  }
}

/**
 * 安装 setData 调试钩子。重复安装会被忽略。
 *
 * @param {Object} page - Page 实例
 */
function install(page) {
  if (!page || page._messageSetDataHookInstalled) return;
  if (typeof page.setData !== 'function') return;

  const rawSetData = page.setData;
  page._rawSetDataWithMessageDebug = rawSetData;

  page.setData = function(dataPatch, callback) {
    const hasMessagesPatch = !!(dataPatch && Object.prototype.hasOwnProperty.call(dataPatch, 'messages'));
    if (!page._messageDiffDebugEnabled || !hasMessagesPatch) {
      return rawSetData.call(this, dataPatch, callback);
    }

    const beforeMessages = Array.isArray(page.data?.messages) ? page.data.messages : [];
    const patchMessages = Array.isArray(dataPatch.messages) ? dataPatch.messages : [];
    const beforeIds = extractMessageIdsForDebug(beforeMessages);
    const patchIds = extractMessageIdsForDebug(patchMessages);
    const beforeDiff = summarizeMessageIdDiff(beforeIds, patchIds);

    const tag = dataPatch._debugTag || dataPatch.debugTag || 'setData(messages)';
    console.log('🧪 [消息Diff-BEFORE]', {
      tag,
      beforeCount: beforeIds.length,
      patchCount: patchIds.length,
      addedCount: beforeDiff.added.length,
      removedCount: beforeDiff.removed.length,
      movedCount: beforeDiff.movedCount,
      duplicateCount: beforeDiff.duplicateIds.length,
      addedPreview: beforeDiff.added.slice(0, 8),
      removedPreview: beforeDiff.removed.slice(0, 8),
      duplicatePreview: beforeDiff.duplicateIds.slice(0, 8)
    });

    const wrappedCallback = function() {
      try {
        const committedMessages = Array.isArray(page.data?.messages) ? page.data.messages : [];
        const committedIds = extractMessageIdsForDebug(committedMessages);
        const afterDiff = summarizeMessageIdDiff(patchIds, committedIds);
        console.log('🧪 [消息Diff-AFTER]', {
          tag,
          patchCount: patchIds.length,
          committedCount: committedIds.length,
          addedCount: afterDiff.added.length,
          removedCount: afterDiff.removed.length,
          movedCount: afterDiff.movedCount,
          duplicateCount: afterDiff.duplicateIds.length,
          addedPreview: afterDiff.added.slice(0, 8),
          removedPreview: afterDiff.removed.slice(0, 8),
          duplicatePreview: afterDiff.duplicateIds.slice(0, 8)
        });
      } catch (error) {
        try { console.warn('⚠️ [消息Diff调试] AFTER日志输出失败:', error); } catch (_) {}
      }

      if (typeof callback === 'function') {
        callback.call(this);
      }
    };

    return rawSetData.call(this, dataPatch, wrappedCallback);
  };

  page._messageSetDataHookInstalled = true;
  console.log('🧪 [消息Diff调试] 已安装 setData(messages) 调试钩子');
}

/**
 * 卸载 setData 调试钩子。未安装时无副作用。
 *
 * @param {Object} page - Page 实例
 */
function uninstall(page) {
  if (!page || !page._messageSetDataHookInstalled) return;
  if (typeof page._rawSetDataWithMessageDebug === 'function') {
    page.setData = page._rawSetDataWithMessageDebug;
  }
  page._rawSetDataWithMessageDebug = null;
  page._messageSetDataHookInstalled = false;
  console.log('🧪 [消息Diff调试] 已卸载 setData(messages) 调试钩子');
}

module.exports = {
  shouldEnable,
  install,
  uninstall
};
