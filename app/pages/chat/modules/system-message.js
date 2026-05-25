/**
 * 聊天页系统消息子系统
 *
 * 职责:
 * - 系统消息的添加/淡出 (addSystemMessage / startSystemMessageFade)
 * - A 端系统消息修复 (addCreatorSystemMessage / fixAEndSystemMessage)
 * - B 端系统消息修复 (updateSystemMessageAfterJoin / fixBEndSystemMessage / performBEndSystemMessageCheck)
 * - 错误清理 (clearIncorrectSystemMessages / cleanupWrongSystemMessages)
 * - 加载后归一化 (enforceSystemMessages / normalizeSystemMessagesAfterLoad)
 *
 * 设计原则(详见 .kiro/specs/chat-system-message-module/design.md):
 * - 这些函数在 attach() 时被绑定到 page 实例,运行时 `this === page`
 * - 不引入新的状态容器,继续读写 page 实例属性 (bEndSystemMessageAdded 等)
 * - 跨模块依赖通过 page 上的方法调用 (如 page.isReceiverEnvironment())
 */

const ChatHelpers = require('./chat-helpers.js');
const { SYSTEM_MESSAGE_DEFAULTS } = ChatHelpers;

/**
 * 添加系统消息
 * @param {string} content - 系统消息内容
 * @param {{autoFadeStaySeconds?: number, fadeSeconds?: number, position?: 'top'|'bottom'}} [options] - 可选配置:自动淡出停留秒数、渐隐秒数、插入位置
 * @returns {string} 新增系统消息的ID
 */
function addSystemMessage(content, options) {
  // 去重:若已存在同内容系统消息则直接跳过
  try {
    const existing = (this.data.messages || []).find(m => m && m.isSystem && m.content === content);
    if (existing) {
      console.log('📝 [系统消息] 已存在同内容系统消息,跳过重复添加:', content);
      // B端加入提示时,确保标记为已处理,避免后续重复
      if (this.data.isFromInvite && /^加入.+的聊天$/.test(content)) {
        this.bEndSystemMessageProcessed = true;
        this.globalBEndMessageAdded = true;
      }
      return existing.id;
    }
  } catch (e) {}

  // options: { autoFadeStaySeconds?: number, fadeSeconds?: number, position?: 'top'|'bottom' }
  const autoFadeStaySeconds = options && typeof options.autoFadeStaySeconds === 'number'
    ? options.autoFadeStaySeconds
    : SYSTEM_MESSAGE_DEFAULTS.AUTO_FADE_STAY_SECONDS;
  const fadeSeconds = options && typeof options.fadeSeconds === 'number'
    ? options.fadeSeconds
    : SYSTEM_MESSAGE_DEFAULTS.FADE_SECONDS;
  // 🔥 【HOTFIX-v1.3.80】强制系统消息插入顶部
  const position = options && options.position === 'bottom' ? 'bottom' : 'top';

  // 如果是B端加入提示,先移除已有的所有B端加入提示,保证唯一
  let messages = this.data.messages || [];
  const isBEndJoin = this.data && this.data.isFromInvite && /^加入.+的聊天$/.test(content);
  if (isBEndJoin) {
    // 若已标记"曾经显示过",直接跳过添加,避免重复
    if (this.hasBEndJoinEver && this.hasBEndJoinEver(this.data.contactId)) {
      console.log('🛡️ [B端一次性防护] 已存在ever标记,跳过重复添加:', content);
      this.bEndSystemMessageProcessed = true;
      this.globalBEndMessageAdded = true;
      return null;
    }
    const before = messages.length;
    messages = messages.filter(m => {
      if (!m || !m.isSystem || typeof m.content !== 'string') return true;
      // 同时移除 B 端样式"加入XX的聊天"和 A 端样式"XX加入聊天"
      if (/^加入.+的聊天$/.test(m.content)) return false;
      if (/^.+加入聊天$/.test(m.content)) return false;
      return true;
    });
    if (before !== messages.length) {
      console.log('🧹 [B端系统消息] 预清理旧的加入提示(含A端样式),移除数量:', before - messages.length);
    }
  }

  const systemMessage = {
    id: 'sys_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 5),
    senderId: 'system',
    isSelf: false,
    content: content,
    type: 'system',
    time: this.formatTime(new Date()),
    timeDisplay: this.formatTime(new Date()),
    showTime: true,
    status: 'sent',
    destroyed: false,
    destroying: false,
    remainTime: 0,
    avatar: '/assets/images/default-avatar.png',
    isSystem: true,
    opacity: 1,
    // 🔥 【HOTFIX-v1.3.80】标记系统消息,防止被滚动影响
    isSystemMessage: true
  };

  // 根据position参数决定插入位置
  if (position === 'top') {
    messages.unshift(systemMessage); // 插入到数组开头(顶部)
    console.log('📝 [系统消息-v1.3.83] 添加到顶部:', systemMessage);
  } else {
    messages.push(systemMessage); // 插入到数组末尾(底部)
    console.log('📝 [系统消息-v1.3.83] 添加到底部:', systemMessage);
  }

  this._localMessageCache = messages;
  const shouldKeepBottom = !!(this.data.inputFocus || this.data.keyboardVisible || this.data.keyboardHeight > 0);
  const patch = {
    messages: messages,
    hasSystemMessage: true
  };
  if (!shouldKeepBottom && position === 'top') {
    patch.scrollIntoView = 'sys-0';
  } else {
    patch.scrollIntoView = '';
    patch.scrollTop = this.data.scrollTop === 99999 ? 99998 : 99999;
  }
  this.setData(patch, () => {
    if (shouldKeepBottom) {
      this.scheduleScrollToBottom();
    }
  });

  if (!shouldKeepBottom && position === 'top') {
    console.log('📝 [系统消息-v1.3.83] ✅ 系统消息已添加,滚动到顶部sys-0');
  } else {
    console.log('📝 [系统消息-v1.3.83] ✅ 系统消息已添加,保持底部可见');
  }

  // B端加入提示:设置处理标记,防重复
  if (this.data && this.data.isFromInvite && /^加入.+的聊天$/.test(content)) {
    this.bEndSystemMessageProcessed = true;
    this.globalBEndMessageAdded = true;
    // 写入ever标记(当前chatId作用域)
    if (this.markBEndJoinEver) {
      try { this.markBEndJoinEver(this.data.contactId); } catch (e) {}
    }
    // 保险:立即做一次去重清理,仅保留最新一条
    try { this.removeDuplicateBEndMessages && this.removeDuplicateBEndMessages(); } catch (e) {}
  }

  // 🔥 【HOTFIX-v1.3.80】延迟清除hasSystemMessage标记,给系统消息显示时间
  setTimeout(() => {
    this.setData({ hasSystemMessage: false });
  }, (autoFadeStaySeconds + fadeSeconds) * 1000 || 8000);

  // 🔥 【HOTFIX-v1.3.77】B端系统消息修复:确保系统消息正确销毁,避免常驻
  if (autoFadeStaySeconds > 0) {
    try {
      this.startSystemMessageFade(systemMessage.id, autoFadeStaySeconds, fadeSeconds);
    } catch (e) {
      console.warn('⚠️ 系统消息自动淡出启动失败,将采用备用销毁流程:', e);
      // 兜底:使用通用销毁流程
      try { this.startDestroyCountdown && this.startDestroyCountdown(systemMessage.id); } catch (err) {}
    }
  } else {
    // 🔥 【HOTFIX-v1.3.77】对于没有设置自动淡出的系统消息,设置默认销毁时间避免常驻
    setTimeout(() => {
      try {
        this.startFadingDestroy && this.startFadingDestroy(systemMessage.id, 0, 5);
      } catch (e) {
        console.warn('⚠️ 系统消息默认销毁失败:', e);
        // 最终兜底:直接删除
        try { this.permanentlyDeleteMessage && this.permanentlyDeleteMessage(systemMessage.id); } catch (err) {}
      }
    }, 3000); // 3秒后开始销毁
  }

  return systemMessage.id;
}

/**
 * 启动系统消息的固定时长淡出(比如2秒后逐渐消失)
 * @param {string} messageId - 消息ID
 * @param {number} staySeconds - 停留秒数
 * @param {number} fadeSeconds - 渐隐秒数
 */
function startSystemMessageFade(messageId, staySeconds, fadeSeconds) {
  // 🔥 【HOTFIX-v1.3.78】B端系统消息修复:每次都重新查找索引,避免索引失效
  const findMessageIndex = () => this.data.messages.findIndex(m => m.id === messageId);
  var _sysSelf = this;
  /** @private 同步 _localMessageCache,防止轮询合并丢失系统消息销毁状态 */
  var syncSysCache = function(props) {
    var c = _sysSelf._localMessageCache;
    if (!c) return;
    var i = c.findIndex(function(m) { return m && m.id === messageId; });
    if (i !== -1) { c[i] = Object.assign({}, c[i], props); }
  };

  let index = findMessageIndex();
  if (index === -1) {
    console.warn('⚠️ [系统消息销毁-v1.3.78] 消息不存在,跳过:', messageId);
    return;
  }

  const initialUpdate = {};
  initialUpdate[`messages[${index}].destroying`] = true;
  initialUpdate[`messages[${index}].remainTime`] = staySeconds;
  this.setData(initialUpdate);
  syncSysCache({ destroying: true, remainTime: staySeconds });

  let remain = staySeconds;
  const stayTimer = setInterval(() => {
    remain--;

    // 🔥 【HOTFIX-v1.3.78】每次倒计时都重新查找消息索引
    const currentIndex = findMessageIndex();
    if (currentIndex === -1) {
      console.warn('⚠️ [系统消息销毁-v1.3.78] 消息已被删除,停止倒计时:', messageId);
      clearInterval(stayTimer);
      return;
    }

    const tickUpdate = {};
    tickUpdate[`messages[${currentIndex}].remainTime`] = remain;
    this.setData(tickUpdate);
    syncSysCache({ remainTime: remain });

    if (remain <= 0) {
      clearInterval(stayTimer);
      // 进入渐隐阶段
      console.log('🔥 [系统消息销毁-v1.3.78] 停留时间结束,开始渐隐:', messageId);
      try {
        // 🔥 【HOTFIX-v1.3.78】不传递索引参数,让startFadingDestroy自己查找
        this.startFadingDestroy && this.startFadingDestroy(messageId, null, fadeSeconds);
      } catch (e) {
        console.warn('⚠️ [系统消息销毁-v1.3.78] 渐隐失败,直接删除:', e);
        // 兜底:直接删除
        try { this.permanentlyDeleteMessage && this.permanentlyDeleteMessage(messageId); } catch (err) {}
      }
    }
  }, 1000);

  if (!this.destroyTimers) {
    this.destroyTimers = new Map();
  }
  this.destroyTimers.set(messageId, stayTimer);
}

/**
 * 把所有系统消息相关方法挂到 page 实例上
 * @param {Object} page - Page 实例
 */
function attach(page) {
  page.addSystemMessage = addSystemMessage;
  page.startSystemMessageFade = startSystemMessageFade;
}

module.exports = { attach };
