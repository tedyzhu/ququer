/**
 * 聊天页阅后即焚子系统
 *
 * 职责:
 * - 消息销毁倒计时与定时器管理 (startDestroyCountdown / clearAllDestroyTimers)
 * - 透明度渐变销毁 (startFadingDestroy)
 * - 离线消息处理 (processOfflineMessages)
 * - 彻底删除 (permanentlyDeleteMessage / destroyMessage)
 * - 标记已读并销毁 (markMessageAsReadAndDestroy)
 *
 * 设计原则(详见 .kiro/specs/chat-burn-after-read-module/design.md):
 * - 这些函数在 attach() 时绑定到 page,运行时 `this === page`
 * - 不引入新的状态容器,继续使用 page.destroyTimers Map
 * - 跨模块依赖通过 page 上的方法/属性调用
 */

const ChatHelpers = require('./chat-helpers.js');
const { SYSTEM_MESSAGE_DEFAULTS } = ChatHelpers;

/**
 * 销毁消息 — 入口薄壳,统一委托给 permanentlyDeleteMessage
 * @param {string} msgId - 消息 ID
 */
function destroyMessage(msgId) {
  // 统一走彻底删除,避免二义性残留
  try { this.permanentlyDeleteMessage(msgId); } catch (e) {}
}

/**
 * 🔥 标记消息为已读并开始销毁倒计时
 * @param {string} messageId - 消息 ID
 * @param {number} messageIndex - 消息在数组中的索引
 */
function markMessageAsReadAndDestroy(messageId, messageIndex) {
  console.log('🔥 [标记销毁] 标记消息为已读并开始销毁:', messageId);

  // 更新消息状态为正在销毁
  const updateData = {};
  updateData[`messages[${messageIndex}].isDestroying`] = true;
  updateData[`messages[${messageIndex}].remainTime`] = this.data.destroyTimeout;

  this.setData(updateData);

  // 开始销毁倒计时
  this.startDestroyCountdown(messageId);
}

/**
 * 🔥 处理离线期间的消息(重新进入应用时)
 *
 * 比较消息 sendTime 与 backgroundTime,把离线期间收到的非自己/非系统消息全部启动销毁。
 */
function processOfflineMessages() {
  console.log('📱 [离线消息] 处理离线期间的消息');

  const { backgroundTime, messages } = this.data;
  const currentUserOpenId = this.data.currentUser?.openId;

  if (!backgroundTime) {
    console.log('📱 [离线消息] 没有后台时间记录,跳过处理');
    return;
  }

  // 查找离线期间收到的新消息
  const offlineMessages = messages.filter(msg => {
    try {
      if (msg.senderId === currentUserOpenId || msg.senderId === 'system') return false;
      if (msg.isDestroyed || msg.isDestroying) return false;
      if (!msg.sendTime) return false;

      let messageTime;
      if (typeof msg.sendTime === 'string') {
        messageTime = new Date(msg.sendTime).getTime();
      } else if (msg.sendTime.getTime) {
        messageTime = msg.sendTime.getTime();
      } else if (msg.sendTime._date) {
        messageTime = new Date(msg.sendTime._date).getTime();
      } else {
        messageTime = new Date(msg.sendTime).getTime();
      }

      return messageTime > backgroundTime;
    } catch (e) {
      console.warn('🔥 [离线消息] sendTime处理失败:', e, msg);
      return false;
    }
  });

  console.log('📱 [离线消息] 离线期间收到的消息数量:', offlineMessages.length);

  if (offlineMessages.length > 0) {
    // 🔥 静默处理新消息
    offlineMessages.forEach((msg, index) => {
      const messageIndex = messages.findIndex(m => m.id === msg.id);
      if (messageIndex !== -1) {
        console.log('📱 [离线消息] 开始处理离线消息:', msg.content);
        this.markMessageAsReadAndDestroy(msg.id, messageIndex);
      }
    });
  }
}

/**
 * 🔥 彻底删除已销毁的消息(不保留任何痕迹)
 *
 * 流程:
 * 1. 清理对应定时器
 * 2. 写入 globalDestroyedMessageIds 全局集合 + 持久化到 wx storage
 * 3. 设置 collapsing → 350ms 后从 messages 数组移除
 * 4. 60s 后云端删除(给对方轮询留窗口)
 *
 * @param {string} messageId - 消息 ID
 */
function permanentlyDeleteMessage(messageId) {
  console.log('🗑️ [彻底删除] 永久删除消息:', messageId);

  if (this.destroyTimers && this.destroyTimers.has(messageId)) {
    const staleTimer = this.destroyTimers.get(messageId);
    clearInterval(staleTimer);
    clearTimeout(staleTimer);
    this.destroyTimers.delete(messageId);
  }

  // 🔥 确保存储键已初始化
  this.ensureDestroyedMessageStore();

  // 🔥 【URGENT-FIX】确保销毁记录被持久化保存
  const globalSet = this.globalDestroyedMessageIds || new Set();
  globalSet.add(messageId);
  this.globalDestroyedMessageIds = globalSet;

  // 🔥 【关键修复】同步保存到本地存储,确保持久化
  try {
    let destroyedIds = Array.from(globalSet);
    if (destroyedIds.length > SYSTEM_MESSAGE_DEFAULTS.MAX_DESTROY_RECORDS) {
      const trimmed = destroyedIds.slice(destroyedIds.length - SYSTEM_MESSAGE_DEFAULTS.MAX_DESTROY_RECORDS);
      globalSet.clear();
      trimmed.forEach(id => globalSet.add(id));
      destroyedIds = trimmed;
    }
    const storageKey = this.destroyedStoreKey || 'destroyedMessageIds';
    wx.setStorageSync(storageKey, destroyedIds);
    console.log('🗑️ [彻底删除] 已保存到本地存储,总计:', destroyedIds.length, '条销毁记录');
  } catch (e) {
    console.error('🗑️ [彻底删除] 本地存储保存失败:', e);
  }

  console.log('🗑️ [彻底删除] 已添加到全局销毁记录:', messageId);

  /**
   * fadingCollapse 已在淡出阶段同步收缩高度,此处只需短暂 collapsing 收缩残余间距后移除 DOM。
   */
  const messages = this.data.messages || [];
  const collapseIdx = messages.findIndex(m => m && m.id === messageId);
  if (collapseIdx !== -1) {
    const collapseData = {};
    collapseData[`messages[${collapseIdx}].collapsing`] = true;
    this.setData(collapseData);
    var _cCache = this._localMessageCache;
    if (_cCache) {
      var _cci = _cCache.findIndex(function(m) { return m && m.id === messageId; });
      if (_cci !== -1) { _cCache[_cci] = Object.assign({}, _cCache[_cci], { collapsing: true }); }
    }

    setTimeout(() => {
      const current = (this._localMessageCache || this.data.messages).filter(msg => msg.id !== messageId);
      this._localMessageCache = current;
      this.setData({ messages: current });
      console.log('🗑️ [彻底删除] 本地删除完成,剩余消息数量:', current.length);
    }, 350);
  } else {
    const remaining = messages.filter(msg => msg.id !== messageId);
    this._localMessageCache = remaining;
    this.setData({ messages: remaining });
    console.log('🗑️ [彻底删除] 本地删除完成,剩余消息数量:', remaining.length);
  }

  /**
   * 延迟云端删除:给对方的轮询留出足够时间窗口获取消息。
   * 本地已标记为已销毁,fetchMessages 会通过 destroyedMessageIds 过滤,
   * 因此本端不会因延迟删除而重新显示该消息。
   */
  const CLOUD_DELETE_DELAY = 60000;
  console.log('🗑️ [彻底删除] 云端删除将延迟', CLOUD_DELETE_DELAY / 1000, '秒执行,确保对方有机会获取');

  if (this._resourceManager) {
    const timerId = this._resourceManager.addTimer(
      setTimeout(() => {
        this._doCloudDelete(messageId);
      }, CLOUD_DELETE_DELAY),
      'cloudDelete_' + messageId
    );
  } else {
    setTimeout(() => {
      this._doCloudDelete(messageId);
    }, CLOUD_DELETE_DELAY);
  }
}

/**
 * 🔥 增强的消息销毁功能 — 基于字数计算停留时长
 *
 * 流程:
 * 1. 启动 setInterval 倒计时(秒数 = 消息字数)
 * 2. 每秒更新 messages[i].remainTime
 * 3. remainTime <= 0 时调用 startFadingDestroy 进入透明度渐变阶段
 *
 * @param {string} messageId - 消息 ID
 */
function startDestroyCountdown(messageId) {
  console.log('🔥 [销毁倒计时] 开始销毁倒计时:', messageId);
  if (!this.destroyTimers) {
    this.destroyTimers = new Map();
  }
  if (this.destroyTimers.has(messageId)) {
    console.log('⚠️ [销毁倒计时] 已存在定时器,跳过重复启动:', messageId);
    return;
  }

  var idx = this.data.messages.findIndex(function(msg) { return msg.id === messageId; });
  if (idx === -1) {
    console.log('🔥 [销毁倒计时] 未找到消息,取消销毁:', messageId);
    return;
  }

  var message = this.data.messages[idx];
  if (message.destroyed || message.destroying || message.fading) {
    console.log('⚠️ [销毁倒计时] 消息已在销毁流程中,跳过:', messageId);
    return;
  }

  var messageContent = message.content || '';
  var stayDuration = messageContent.length || 1;
  var fadeDuration = 5;

  console.log('🔥 [销毁倒计时] 消息内容:', messageContent);
  console.log('🔥 [销毁倒计时] 字符数:', messageContent.length);
  console.log('🔥 [销毁倒计时] 停留时长:', stayDuration, '秒');
  console.log('🔥 [销毁倒计时] 透明度变化时长:', fadeDuration, '秒');

  var remainTime = stayDuration;

  /** @private 按 ID 查找最新索引,避免数组变动导致更新错位 */
  var that = this;
  var findIdx = function() {
    return that.data.messages.findIndex(function(m) { return m.id === messageId; });
  };
  /** @private 同步更新 _localMessageCache,防止轮询合并丢失销毁状态 */
  var syncCache = function(props) {
    var cache = that._localMessageCache;
    if (!cache) return;
    var ci = cache.findIndex(function(m) { return m && m.id === messageId; });
    if (ci !== -1) {
      var updated = {};
      for (var k in cache[ci]) { updated[k] = cache[ci][k]; }
      for (var k in props) { updated[k] = props[k]; }
      cache[ci] = updated;
    }
  };

  var curIdx = findIdx();
  if (curIdx !== -1) {
    var initData = {};
    initData['messages[' + curIdx + '].destroying'] = true;
    initData['messages[' + curIdx + '].remainTime'] = remainTime;
    initData['messages[' + curIdx + '].hideWhenFading'] = true;
    this.setData(initData);
    syncCache({ destroying: true, remainTime: remainTime, hideWhenFading: true });
  }

  var stayTimer = setInterval(function() {
    remainTime--;
    var ci = findIdx();
    if (ci === -1) {
      clearInterval(stayTimer);
      that.destroyTimers && that.destroyTimers.delete(messageId);
      return;
    }
    var ud = {};
    ud['messages[' + ci + '].remainTime'] = remainTime;
    that.setData(ud);
    syncCache({ remainTime: remainTime });

    console.log('🔥 [销毁倒计时] 停留倒计时:', remainTime);

    if (remainTime <= 0) {
      clearInterval(stayTimer);
      that.startFadingDestroy(messageId, null, fadeDuration);
    }
  }, 1000);

  this.destroyTimers.set(messageId, stayTimer);
}

/**
 * 🔥 开始透明度渐变销毁
 * 【HOTFIX-v1.3.78】B 端系统消息修复:支持 messageIndex 为 null,自动查找索引
 *
 * 流程:
 * 1. 优先把比当前更早的消息也启动淡出(保证旧消息先消失)
 * 2. 设置 fading=true / opacity=1 / remainTime=fadeDuration
 * 3. 50ms 后设置 opacity=0 + fadingCollapse,触发 CSS transition
 * 4. fadeDuration 秒后调用 permanentlyDeleteMessage
 *
 * @param {string} messageId - 消息 ID
 * @param {number|null} messageIndex - 索引(null 时自动查找)
 * @param {number} fadeDuration - 渐隐秒数
 */
function startFadingDestroy(messageId, messageIndex, fadeDuration) {
  console.log('🔥 [透明度渐变] 开始透明度渐变销毁:', messageId, '时长:', fadeDuration, '秒');

  var actualIndex = this.data.messages.findIndex(function(m) { return m && m.id === messageId; });

  if (actualIndex === -1) {
    console.warn('⚠️ [透明度渐变] 消息不存在,跳过销毁:', messageId);
    return;
  }

  var current = this.data.messages[actualIndex];
  if (current && (current.fading || current.destroyed)) {
    console.warn('⚠️ [透明度渐变] 已在渐隐/已销毁,跳过:', messageId);
    return;
  }

  /**
   * @description 保证旧消息先于新消息淡出:遍历所有比当前消息更早发送、且尚未进入 fade 的消息,优先触发它们的淡出。
   */
  var targetTime = current.sendTime || current.timestamp || 0;
  if (targetTime > 0) {
    var msgs = this.data.messages;
    for (var oi = 0; oi < msgs.length; oi++) {
      var om = msgs[oi];
      if (!om || om.id === messageId || om.isSystem) continue;
      if (om.fading || om.destroyed || om.fadingCollapse) continue;
      var omTime = om.sendTime || om.timestamp || 0;
      if (omTime > 0 && omTime < targetTime) {
        console.log('🔥 [销毁顺序修正] 先淡出更旧的消息:', om.id, om.content);
        if (this.destroyTimers && this.destroyTimers.has(om.id)) {
          clearInterval(this.destroyTimers.get(om.id));
          clearTimeout(this.destroyTimers.get(om.id));
          this.destroyTimers.delete(om.id);
        }
        this.startFadingDestroy(om.id, null, fadeDuration);
      }
    }
  }

  var fadeInitData = {};
  fadeInitData['messages[' + actualIndex + '].fading'] = true;
  fadeInitData['messages[' + actualIndex + '].destroying'] = false;
  fadeInitData['messages[' + actualIndex + '].opacity'] = 1;
  fadeInitData['messages[' + actualIndex + '].remainTime'] = fadeDuration;
  this.setData(fadeInitData);

  var cache = this._localMessageCache;
  if (cache) {
    var ci = cache.findIndex(function(m) { return m && m.id === messageId; });
    if (ci !== -1) {
      var u = {};
      for (var k in cache[ci]) { u[k] = cache[ci][k]; }
      u.fading = true; u.destroying = false; u.opacity = 1; u.remainTime = fadeDuration;
      cache[ci] = u;
    }
  }

  console.log('🔥 [透明度渐变] ✅ 第一步:已设置fading状态');

  var _fadeSelf = this;
  // 🔥 【HOTFIX-v1.3.78】在下一个渲染周期设置 opacity=0,触发 CSS transition
  setTimeout(() => {
    // 🔥 【HOTFIX-v1.3.91】加强检查:过滤 undefined 元素并安全查找索引
    const messages = this.data.messages || [];
    const checkIndex = messages.findIndex(m => m && m.id === messageId);
    if (checkIndex === -1) {
      console.warn('⚠️ [透明度渐变-v1.3.91] 消息已被删除,取消淡出');
      return;
    }

    const fadeStartData = {};
    fadeStartData[`messages[${checkIndex}].opacity`] = 0;
    fadeStartData[`messages[${checkIndex}].fadingCollapse`] = true;
    this.setData(fadeStartData);

    var fc = _fadeSelf._localMessageCache;
    if (fc) {
      var fci = fc.findIndex(function(m) { return m && m.id === messageId; });
      if (fci !== -1) { fc[fci] = Object.assign({}, fc[fci], { opacity: 0, fadingCollapse: true }); }
    }

    console.log('🔥 [透明度渐变-v1.3.78] ✅ 第二步:已设置opacity=0 + fadingCollapse,CSS transition将在', fadeDuration, '秒内完成淡出');

    // 🔥 【HOTFIX-v1.3.78】等待 CSS transition 完成后删除消息(opacity 5s + height collapse 0.3s delay 后 0.3s)
    const fadeTimer = setTimeout(() => {
      console.log('🔥 [透明度渐变-v1.3.78] CSS transition完成,开始彻底删除消息:', messageId);
      this.permanentlyDeleteMessage(messageId);
    }, fadeDuration * 1000 + 400); // opacity 完成后再等 0.4s 确保 height collapse 也完成

    // 更新定时器引用
    if (this.destroyTimers) {
      this.destroyTimers.set(messageId, fadeTimer);
    }
  }, 50); // 延迟 50ms,确保第一次 setData 已完成渲染
}

/**
 * 🔥 清理所有销毁定时器
 * 【HOTFIX-v1.3.73】同时清理 setInterval 和 setTimeout 定时器
 */
function clearAllDestroyTimers() {
  if (this.destroyTimers) {
    this.destroyTimers.forEach(timer => {
      clearInterval(timer); // 清理停留阶段的 interval
      clearTimeout(timer);  // 清理淡出阶段的 timeout
    });
    this.destroyTimers.clear();
  }
}

/**
 * 把所有销毁相关方法挂到 page 实例上
 * @param {Object} page - Page 实例
 */
function attach(page) {
  page.destroyMessage = destroyMessage;
  page.markMessageAsReadAndDestroy = markMessageAsReadAndDestroy;
  page.processOfflineMessages = processOfflineMessages;
  page.permanentlyDeleteMessage = permanentlyDeleteMessage;
  page.startDestroyCountdown = startDestroyCountdown;
  page.startFadingDestroy = startFadingDestroy;
  page.clearAllDestroyTimers = clearAllDestroyTimers;
}

module.exports = { attach };
