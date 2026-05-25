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
const { SYSTEM_MESSAGE_DEFAULTS, isPlaceholderJoinMessage } = ChatHelpers;

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
 * 🔥 【HOTFIX-v1.3.55】清除错误的A端系统消息
 * 当确认用户为B端时,立即清理之前可能错误添加的A端系统消息
 */
function clearIncorrectSystemMessages() {
  const messages = this.data.messages || [];
  const originalCount = messages.length;

  // 过滤掉错误的A端系统消息
  const filteredMessages = messages.filter(msg => {
    if (!msg.isSystem || !msg.content) return true;

    // 移除A端创建者消息
    if (msg.content.includes('您创建了私密聊天')) {
      console.log('🔥 [清理错误消息] 移除A端创建消息:', msg.content);
      return false;
    }

    // 移除错误的B端重复消息
    if (msg.content.includes('加入') && msg.content.includes('的聊天')) {
      console.log('🔥 [清理错误消息] 移除重复B端消息,稍后会重新添加正确的:', msg.content);
      return false;
    }

    return true;
  });

  if (filteredMessages.length !== originalCount) {
    console.log(`🔥 [清理错误消息] 清除了 ${originalCount - filteredMessages.length} 条错误消息`);
    this._localMessageCache = filteredMessages;
    this.setData({
      messages: filteredMessages
    });
  }
}

/**
 * 🔥 【CRITICAL-FIX-v4】全面清理错误的系统消息和垃圾数据
 * @returns {number} 清理后剩余的消息数量
 */
function cleanupWrongSystemMessages() {
  console.log('🔥 [垃圾数据清理-v4] 开始全面清理错误消息和垃圾数据');

  const currentMessages = this.data.messages || [];
  const beforeCount = currentMessages.length;
  const isReceiverEnv = this.isReceiverEnvironment();

  const cleanedMessages = currentMessages.filter(msg => {
    // 🔥 【垃圾数据过滤】优先过滤无效数据
    if (!msg || !msg.content || msg.content.trim() === '') {
      console.log('🔥 [垃圾数据清理-v4] 移除空消息:', msg);
      return false;
    }

    // 🔥 【无效ID过滤】过滤senderId无效的消息
    if (!msg.senderId ||
        msg.senderId === 'undefined' ||
        msg.senderId === 'null' ||
        msg.senderId === '' ||
        msg.senderId === ' ') {
      console.log('🔥 [垃圾数据清理-v4] 移除无效senderId消息:', msg.content, 'senderId:', msg.senderId);
      return false;
    }

    if (msg.isSystem && msg.content) {
      // 🔥 【HOTFIX-v1.3.61】B端永远不应该看到创建者消息或A端风格"XX加入聊天"
      if (isReceiverEnv) {
        if (msg.content.includes('您创建了私密聊天') || (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content))) {
          console.log('🔥 [垃圾数据清理-v4] (B端) 移除不应显示的系统消息:', msg.content);
          return false;
        }
      }

      // 🔒 无论端别,统一移除占位符格式的B端加入消息(如"加入用户的聊天")
      if (isPlaceholderJoinMessage(msg.content)) {
        console.log('🔥 [垃圾数据清理-v4] 移除占位符加入消息:', msg.content);
        return false;
      }

      // 🔥 【系统消息过滤】过滤错误格式的系统消息
      const shouldRemove =
        // 精确匹配错误消息格式
        msg.content === '成功加入朋友的聊天' ||
        msg.content === '成功加入朋友的聊天！' ||
        msg.content === '已加入朋友的聊天' ||
        msg.content === '成功加入聊天' ||
        msg.content === '已加入聊天' ||
        // 移除所有包含"成功加入"的消息
        msg.content.includes('成功加入') ||
        // 移除特定的"已加入"错误格式
        (msg.content.includes('已加入') && !msg.content.match(/^已加入.+的聊天$/)) ||
        // 移除含有感叹号的旧格式消息
        (msg.content.includes('加入') && msg.content.includes('聊天') && msg.content.includes('！')) ||
        // 移除重复的"朋友已加入聊天"类型消息
        msg.content === '朋友已加入聊天' ||
        msg.content === '朋友已加入聊天！' ||
        // 移除格式错误的系统消息
        (msg.content.includes('系统') && msg.content.length < 3);

      if (shouldRemove) {
        // 🔥 【二次检查】不要移除正确格式的消息
        const isCorrectFormat =
          /^.+加入聊天$/.test(msg.content) ||      // "朋友加入聊天", "xx加入聊天"
          /^加入.+的聊天$/.test(msg.content) ||    // "加入朋友的聊天", "加入xx的聊天"
          msg.content.includes('您创建了私密聊天'); // 创建消息

        if (!isReceiverEnv && isCorrectFormat && msg.senderId && msg.senderId !== 'undefined') {
          console.log('🔥 [垃圾数据清理-v4] 保留正确格式消息:', msg.content);
          return true; // 保留正确格式
        }

        console.log('🔥 [垃圾数据清理-v4] 移除错误系统消息:', msg.content, 'senderId:', msg.senderId);
        return false;
      }
    }

    // 🔥 【额外垃圾数据检查】移除其他类型的垃圾数据
    if (msg.content && (
      msg.content === 'undefined' ||
      msg.content === 'null' ||
      msg.content === '[object Object]' ||
      msg.content.includes('NaN') ||
      msg.content.length > 1000 // 过长的消息可能是错误数据
    )) {
      console.log('🔥 [垃圾数据清理-v4] 移除垃圾内容:', msg.content.substring(0, 50));
      return false;
    }

    return true;
  });

  const afterCount = cleanedMessages.length;

  if (beforeCount !== afterCount) {
    this._localMessageCache = cleanedMessages;
    this.setData({
      messages: cleanedMessages
    });
    console.log('🔥 [垃圾数据清理-v4] ✅ 清理完成,移除消息数量:', beforeCount - afterCount);
  } else {
    console.log('🔥 [垃圾数据清理-v4] 没有发现需要清理的数据');
  }

  return afterCount;
}

/**
 * 🔥 【A端专用】修复A端系统消息显示
 */
function fixAEndSystemMessage() {
  console.log('🔥 [A端系统消息修复] 开始修复A端系统消息');

  const currentMessages = this.data.messages || [];
  const { isSender, isFromInvite } = this.data;

  // 只为A端用户执行
  if (isFromInvite || !isSender) {
    console.log('🔥 [A端系统消息修复] 非A端用户,跳过修复');
    return;
  }

  // 移除所有错误的B端系统消息
  const filteredMessages = currentMessages.filter(msg => {
    if (msg.isSystem && msg.content) {
      const shouldRemove =
        msg.content.includes('加入') && msg.content.includes('的聊天');

      if (shouldRemove) {
        console.log('🔥 [A端系统消息修复] 移除不适合A端的B端消息:', msg.content);
        return false;
      }
    }
    return true;
  });

  // 检查是否已有正确的A端系统消息
  const hasCorrectAEndMessage = filteredMessages.some(msg =>
    msg.isSystem &&
    msg.content &&
    msg.content.includes('您创建了私密聊天')
  );

  if (!hasCorrectAEndMessage) {
    const aEndMessage = '您创建了私密聊天,可点击右上角菜单分享链接邀请朋友加入';
    console.log('🔥 [A端系统消息修复] 添加正确的A端系统消息:', aEndMessage);

    this._localMessageCache = filteredMessages;
    this.setData({
      messages: filteredMessages
    });

    this.addSystemMessage(aEndMessage, {
      autoFadeStaySeconds: 3,
      fadeSeconds: 5
    });
  } else {
    console.log('🔥 [A端系统消息修复] 已存在正确的A端消息,只更新过滤后的消息');
    this._localMessageCache = filteredMessages;
    this.setData({
      messages: filteredMessages
    });
  }
}

/**
 * 🔥 【B端专用】修复系统消息显示
 * @param {string} realInviterName - 真实邀请者昵称
 */
function fixBEndSystemMessage(realInviterName) {
  console.log('🔥 [B端系统消息修复] 开始修复,邀请者:', realInviterName);

  const currentMessages = this.data.messages || [];

  // 移除所有错误的系统消息
  const filteredMessages = currentMessages.filter(msg => {
    if (msg.isSystem && msg.content) {
      const shouldRemove =
        msg.content.includes('您创建了私密聊天') ||
        msg.content.includes('可点击右上角菜单分享链接邀请朋友加入') ||
        msg.content.includes('创建了私密聊天') ||
        msg.content.includes('私密聊天已创建') ||
        (msg.content.includes('创建') && msg.content.includes('聊天'));

      if (shouldRemove) {
        console.log('🔥 [B端系统消息修复] 移除不适合B端的消息:', msg.content);
        return false;
      }
    }
    return true;
  });

  // 检查是否已有正确的加入消息
  const hasCorrectJoinMessage = filteredMessages.some(msg =>
    msg.isSystem &&
    msg.content &&
    msg.content.includes('加入') &&
    msg.content.includes(realInviterName) &&
    msg.content.includes('的聊天')
  );

  if (!hasCorrectJoinMessage) {
    const joinMessage = `加入${realInviterName}的聊天`;
    console.log('🔥 [B端系统消息修复] 添加正确的B端系统消息:', joinMessage);

    this._localMessageCache = filteredMessages;
    this.setData({
      messages: filteredMessages
    });

    this.addSystemMessage(joinMessage, {
      autoFadeStaySeconds: 3,
      fadeSeconds: 5
    });
  } else {
    console.log('🔥 [B端系统消息修复] 已存在正确的加入消息,只更新过滤后的消息');
    this._localMessageCache = filteredMessages;
    this.setData({
      messages: filteredMessages
    });
  }
}

/**
 * 把所有系统消息相关方法挂到 page 实例上
 * @param {Object} page - Page 实例
 */
function attach(page) {
  page.addSystemMessage = addSystemMessage;
  page.startSystemMessageFade = startSystemMessageFade;
  page.clearIncorrectSystemMessages = clearIncorrectSystemMessages;
  page.cleanupWrongSystemMessages = cleanupWrongSystemMessages;
  page.fixAEndSystemMessage = fixAEndSystemMessage;
  page.fixBEndSystemMessage = fixBEndSystemMessage;
}

module.exports = { attach };
