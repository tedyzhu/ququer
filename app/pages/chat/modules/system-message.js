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
const { SYSTEM_MESSAGE_DEFAULTS, isPlaceholderJoinMessage, isSystemLikeMessage } = ChatHelpers;

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
 * 🔥 【HOTFIX-v1.3.83】A 端本地添加创建消息,设置自动淡出
 *
 * 注意:chat.js 原本同名定义两次(行 ~2049 与 ~2898),由于 JavaScript 对象字面量
 * 后定义覆盖前者,实际生效的是 v1.3.83 版本。抽离时只保留 v1.3.83 版本,删除前者。
 */
function addCreatorSystemMessage() {
  console.log('🔥 [a端系统消息-v1.3.83] A端本地添加创建消息');

  // 🔥 【HOTFIX-v1.3.83】检查是否已有创建或加入消息
  const messages = this.data.messages || [];
  const hasSystemMessage = messages.some(msg =>
    msg.isSystem && msg.content && (
      msg.content.includes('您创建了私密聊天') ||
      msg.content.includes('加入聊天')
    )
  );

  if (hasSystemMessage) {
    console.log('🔥 [a端系统消息-v1.3.83] 已有系统消息,跳过添加');
    return;
  }

  // 🔥 【HOTFIX-v1.3.83】本地添加创建消息,设置自动淡出
  const creatorMessage = '您创建了私密聊天,可点击右上角菜单分享链接邀请朋友加入';
  this.addSystemMessage(creatorMessage, {
    autoFadeStaySeconds: 3,
    fadeSeconds: 5
  });
  console.log('🔥 [a端系统消息-v1.3.83] ✅ 已添加本地创建消息,将在8秒后自动淡出');
}

/**
 * 系统消息强制校正(参与者达 2 人后)
 *
 * 规则:
 * - A 端:初始显示"您创建了私密聊天",当检测到 B 端加入后,将其替换为"[B端昵称]加入聊天"
 * - B 端:加入后只显示"加入[A端昵称]的聊天",清理所有创建者类提示
 */
function enforceSystemMessages() {
  const isReceiverEnv = this.isReceiverEnvironment();
  const messages = this.data.messages || [];
  const participants = this.data.participants || [];

  if (participants.length < 2) return;

  // 找到对方昵称
  const currentUserOpenId = this.data.currentUser?.openId;
  const other = participants.find(p => (p.openId || p.id) !== currentUserOpenId);
  const otherName = other?.nickName || other?.name || '好友';

  if (isReceiverEnv) {
    // ever:若已显示过 B 端加入提示,直接返回,防止重复
    if (this.hasBEndJoinEver && this.hasBEndJoinEver(this.data.contactId)) {
      console.log('🛡️ [B端一次性防护] enforce阶段检测到ever标记,跳过');
      this.bEndSystemMessageProcessed = true;
      return;
    }
    // 🔒 B端防重复:若已处理过,则不再补充系统消息
    if (this.bEndSystemMessageProcessed) {
      console.log('🔥 [B端系统消息] 已处理过加入提示,跳过enforce补充');
      return;
    }

    // 🔥 【1008终极防护】检查是否已存在B端系统消息
    const hasBEndJoinMessage = messages.some(m =>
      m && isSystemLikeMessage(m) && m.content && /^加入.+的聊天$/.test(m.content)
    );
    if (hasBEndJoinMessage) {
      console.log('🔥 [B端系统消息保护-1008] 已存在B端加入消息,跳过enforce补充');
      this.bEndSystemMessageProcessed = true;
      return;
    }

    // B 端:确保"加入[A端昵称]的聊天"存在,并移除创建者类消息
    const joinMsg = `加入${otherName}的聊天`;
    const hasJoin = messages.some(m => isSystemLikeMessage(m) && m.content === joinMsg);
    // 🔥 【HOTFIX-v1.3.61】只过滤A端格式,保留B端格式
    const filtered = messages.filter(m => !(isSystemLikeMessage(m) && (
      m.content?.includes('您创建了私密聊天') || (/^.+加入聊天$/.test(m.content || '') && !/^加入.+的聊天$/.test(m.content || ''))
    )));
    this._localMessageCache = filtered;
    this.setData({ messages: filtered });

    // 🔥 【HOTFIX-v1.3.76】如果不存在加入消息,使用 addSystemMessage 添加,确保淡出效果
    if (!hasJoin) {
      console.log('🔥 [B端系统消息-v1.3.76] 通过enforceSystemMessages添加淡出消息:', joinMsg);
      this.addSystemMessage(joinMsg, {
        autoFadeStaySeconds: 3,
        fadeSeconds: 5
      });
    }
  } else {
    // A 端:将创建提示替换为"[B端昵称]加入聊天"
    this.replaceCreatorMessageWithJoinMessage(otherName);
  }
}

/**
 * 统一校正并淡出系统消息(加载后兜底)
 * - B 端:移除 A 端风格系统消息,仅保留并短暂显示"加入XX的聊天"
 * - A 端:对"您创建了私密聊天/XX加入聊天/加入XX的聊天"若未进入淡出,则触发 2s 停留 + 5s 渐隐
 * @returns {void}
 */
function normalizeSystemMessagesAfterLoad() {
  const isReceiverEnv = this.isReceiverEnvironment();
  const messages = this.data.messages || [];
  const participants = this.data.participants || [];
  let changed = false;

  // 🔒 全局预清理:无论端别,移除占位符格式的加入消息(如"加入用户的聊天")
  const placeholderFiltered = (messages || []).filter(m => {
    if (!m || !isSystemLikeMessage(m) || !m.content) return true;
    if (isPlaceholderJoinMessage(m.content)) {
      console.log('🔥 [系统消息预清理] 移除占位符加入消息:', m.content);
      return false;
    }
    return true;
  });
  if (placeholderFiltered.length !== messages.length) {
    this._localMessageCache = placeholderFiltered;
    this.setData({ messages: placeholderFiltered });
    changed = true;
  }

  if (isReceiverEnv) {
    // ever:若已显示过 B 端加入提示,直接返回,防止重复
    if (this.hasBEndJoinEver && this.hasBEndJoinEver(this.data.contactId)) {
      console.log('🛡️ [B端一次性防护] normalize阶段检测到ever标记,跳过');
      this.bEndSystemMessageProcessed = true;
      return;
    }
    // 🔒 B端防重复:若已处理过,则不再 normalize 补充
    if (this.bEndSystemMessageProcessed) {
      console.log('🔥 [B端系统消息保护] 已处理过B端系统消息,跳过normalize补充');
      return;
    }

    // 🔥 【1008终极防护】检查是否已存在B端系统消息
    const hasBEndJoinMessage = messages.some(m =>
      m && isSystemLikeMessage(m) && m.content && /^加入.+的聊天$/.test(m.content)
    );
    if (hasBEndJoinMessage) {
      console.log('🔥 [B端系统消息保护-1008] 已存在B端加入消息,跳过normalize补充');
      this.bEndSystemMessageProcessed = true;
      return;
    }

    // B 端:确定对方昵称
    const currentUserOpenId = this.data.currentUser?.openId;
    const other = participants.find(p => (p.openId || p.id) !== currentUserOpenId);
    const otherName = other?.nickName || other?.name || '朋友';
    const joinMsg = `加入${otherName}的聊天`;

    // 过滤掉 A 端风格及错误/占位格式系统消息
    const filtered = messages.filter(m => {
      if (!m || !isSystemLikeMessage(m) || !m.content) return true;
      if (m.content.includes('您创建了私密聊天')) return false;
      // 🔥 【HOTFIX-v1.3.61】只过滤 A 端格式"XX加入聊天",保留 B 端格式"加入XX的聊天"
      if (/^.+加入聊天$/.test(m.content) && !/^加入.+的聊天$/.test(m.content)) return false;
      if (
        m.content === '成功加入朋友的聊天' ||
        m.content === '成功加入朋友的聊天！' ||
        m.content === '已加入朋友的聊天' ||
        m.content === '成功加入聊天' ||
        m.content === '已加入聊天'
      ) return false;
      if (isPlaceholderJoinMessage(m.content)) return false;
      // 移除与目标 joinMsg 不一致的占位加入消息
      if (/^加入.+的聊天$/.test(m.content) && m.content !== joinMsg) return false;
      return true;
    });

    if (filtered.length !== messages.length) {
      this._localMessageCache = filtered;
      this.setData({ messages: filtered });
      changed = true;
    }

    // 🔥【HOTFIX-v1.3.66】确保存在正确的加入提示,B 端系统消息和 A 端保持一致会自动淡出
    const hasJoin = (changed ? this.data.messages : messages).some(m => isSystemLikeMessage(m) && m.content === joinMsg);
    if (!hasJoin && !this.bEndSystemMessageProcessed) {
      // 🔥 【HOTFIX-v1.3.66】B 端系统消息和 A 端保持一致,显示一段时间后自动淡出
      this.addSystemMessage(joinMsg, {
        autoFadeStaySeconds: 3,
        fadeSeconds: 5
      });
    } else if (!hasJoin && this.bEndSystemMessageProcessed) {
      console.log('🔥 [B端系统消息] 已处理过加入提示,跳过再次补充');
    }
  } else {
    // A 端:对应的系统消息若未进入淡出流程则强制触发
    messages.forEach(m => {
      if (!m || !isSystemLikeMessage(m) || !m.content) return;
      const match = (
        m.content.includes('您创建了私密聊天') ||
        /^.+加入聊天$/.test(m.content) ||
        /^加入.+的聊天$/.test(m.content)
      );
      if (match && !m.destroying && !m.fading && !m.destroyed) {
        try { this.startSystemMessageFade && this.startSystemMessageFade(m.id, 2, 5); } catch (e) {}
      }
    });
  }
}

/**
 * 🔥 【CRITICAL-FIX-v5】B 端系统消息修复 — 彻底解决 B 端重复系统消息问题
 *
 * 这是 B 端加入聊天后系统消息处理的核心入口。流程概要:
 * 1. 全局/本地防重复检查
 * 2. 强制清理任何错误的 A 端创建消息
 * 3. 解码邀请者昵称(双重 URL 解码)
 * 4. 检查是否已存在正确的 B 端加入消息
 * 5. 调用 fetchChatParticipantsWithRealNames 拿真实参与者
 * 6. 800ms 后用真实昵称添加加入消息;1200ms 安全兜底;1000ms 后更新标题
 *
 * @param {string} inviterName - 邀请者昵称(可能是占位符,会通过参与者列表升级为真实昵称)
 */
function updateSystemMessageAfterJoin(inviterName) {
  console.log('🔥 [B端系统消息修复-v7] 开始处理B端系统消息');
  console.log('🔥 [B端系统消息修复-v7] 邀请者名称:', inviterName);

  // 🔥 【HOTFIX-v1.3.57】全局防重复检查 - 确保整个应用生命周期内只添加一次 B 端系统消息
  if (this.globalBEndMessageAdded) {
    console.log('🔥 [B端系统消息修复-v7] ⚠️ 全局检测到B端消息已添加,跳过重复调用');
    return;
  }

  console.log('🔥 [B端系统消息修复-v7] 开始全局防重复检查');

  const currentUser = this.data.currentUser;
  const dataIsFromInvite = this.data.isFromInvite;
  const isReceiverEnv = this.isReceiverEnvironment();
  const userNickName = currentUser?.nickName || '我';
  console.log('🔥 [B端系统消息修复-v5] 当前用户身份 isFromInvite:', dataIsFromInvite, 'isReceiverEnv:', isReceiverEnv);

  // 🔥 【HOTFIX-v1.3.56】强制检查并清理错误的 A 端消息
  const currentMessages = this.data.messages || [];
  const hasWrongCreatorMessage = currentMessages.some(msg =>
    msg.isSystem &&
    msg.content &&
    msg.content.includes('您创建了私密聊天')
  );

  if (hasWrongCreatorMessage) {
    console.log('🔥 [B端系统消息修复-v6] ⚠️ 检测到错误的A端消息,强制清理并重新添加正确的B端消息');
    // 重置新增标记允许替换,但保留已处理标志(由 ever 控制补充逻辑)
    this.bEndSystemMessageAdded = false;
  }

  // 检查是否已存在正确的 B 端系统消息
  const hasCorrectJoinMessage = currentMessages.some(msg =>
    msg.isSystem &&
    msg.content &&
    msg.content.includes('加入') &&
    msg.content.includes('的聊天') &&
    !msg.content.includes('您创建了')
  );

  if (hasCorrectJoinMessage && !hasWrongCreatorMessage) {
    console.log('🔥 [B端系统消息修复-v6] ✅ 已存在正确的B端加入消息,跳过重复添加');
    this.bEndSystemMessageAdded = true;
    return;
  }

  // 🔥 【HOTFIX-v1.3.53】改进邀请者名称处理,支持智能检测场景
  let processedInviterName = inviterName;
  // 兼容单重/双重编码,避免出现 %E6%... 乱码
  try { processedInviterName = decodeURIComponent(processedInviterName); } catch (e) {}
  try { processedInviterName = decodeURIComponent(processedInviterName); } catch (e) {}
  if (!processedInviterName || processedInviterName === 'undefined' || processedInviterName === '邀请者') {
    // 🔥 【HOTFIX-v1.3.53】尝试从参与者信息中获取真实的对方昵称
    processedInviterName = this.getOtherParticipantRealName() || '朋友';
    console.log('🔥 [B端系统消息修复-v5] 从参与者获取邀请者名称:', processedInviterName);
  } else {
    console.log('🔥 [B端系统消息修复-v5] 使用传入的邀请者名称:', processedInviterName);
  }

  console.log('🔥 [B端系统消息修复-v5] 处理后的邀请者名称:', processedInviterName);
  // 【修复】检查是否真的是 B 端身份
  if (!isReceiverEnv) {
    console.log('🔥 [B端系统消息修复-v5] 检测到非B端身份,跳过B端系统消息处理');
    return;
  }

  // 🔥 【HOTFIX-v1.3.52】额外检查:确保当前用户不是创建者
  const isSender = this.data.isSender;
  if (isSender) {
    console.log('🔥 [B端系统消息修复-v5] 检测到发送方身份,强制跳过B端系统消息处理');
    return;
  }

  // 🔥 【HOTFIX-v1.3.56】B 端:强制清理所有错误的 A 端系统消息
  console.log('🔥 [B端系统消息修复-v6] 开始强制清理错误消息,清理前消息数量:', currentMessages.length);

  const filteredMessages = currentMessages.filter(msg => {
    if (msg.isSystem && msg.content) {
      // 🔥 彻底移除所有 A 端相关的系统消息
      const shouldRemove =
        msg.content.includes('您创建了私密聊天') ||
        msg.content.includes('可点击右上角菜单分享链接邀请朋友加入') ||
        msg.content.includes('私密聊天已创建') ||
        msg.content.includes('分享链接邀请朋友') ||
        // 移除任何"创建"相关的消息(B 端不应该看到)
        (msg.content.includes('创建') && msg.content.includes('聊天')) ||
        // 移除错误格式的系统消息
        msg.content === '成功加入朋友的聊天' ||
        msg.content === '成功加入朋友的聊天！' ||
        msg.content === '已加入朋友的聊天' ||
        msg.content === '成功加入聊天' ||
        msg.content === '已加入聊天' ||
        msg.content.includes('成功加入') ||
        // 🔥 【HOTFIX-v1.3.61】B 端不显示 A 端风格的"XX加入聊天",但保留 B 端风格的"加入XX的聊天"
        (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content)) ||
        isPlaceholderJoinMessage(msg.content) ||
        // 移除 senderId 无效的消息
        (!msg.senderId || msg.senderId === 'undefined' || msg.senderId === '');

      if (shouldRemove) {
        console.log('🔥 [B端系统消息修复-v4] 移除不适合B端的消息:', msg.content);
        return false;
      }
    }
    return true;
  });

  console.log('🔥 [B端系统消息修复-v4] 清理后消息数量:', filteredMessages.length);

  this._localMessageCache = filteredMessages;
  this.setData({
    messages: filteredMessages
  });

  // 🔥 【CRITICAL-FIX-v4】B 端添加正确的加入消息
  // 🔥 【HOTFIX-v1.3.55】确保昵称解码正确,避免显示编码格式
  let decodedInviterName = processedInviterName;
  try {
    if (processedInviterName && processedInviterName.includes('%')) {
      decodedInviterName = decodeURIComponent(processedInviterName);
      if (decodedInviterName.includes('%')) {
        decodedInviterName = decodeURIComponent(decodedInviterName);
      }
    }
  } catch (e) {
    console.log('🔥 [昵称解码] 解码失败,使用原始昵称:', processedInviterName);
  }

  // 🔥 【HOTFIX-v1.3.61】确保 B 端系统消息格式严格正确
  const joinMessage = `加入${decodedInviterName}的聊天`;
  console.log('🔥 [B端系统消息-v1.3.61] 生成的消息格式:', joinMessage);

  // 🔥 【HOTFIX-v1.3.61】格式校验:确保消息符合 B 端格式"加入xx的聊天"
  if (!/^加入.+的聊天$/.test(joinMessage)) {
    console.error('🔥 [B端系统消息-v1.3.61] ❌ 消息格式错误,已阻止:', joinMessage);
    return; // 阻止错误格式的消息
  }
  console.log('🔥 [B端系统消息-v1.3.61] ✅ 消息格式校验通过');

  // 🔥 【HOTFIX-v1.3.61】增强防重复检查:同时检查 B 端格式和 A 端格式
  const existingJoinMessage = filteredMessages.find(msg => {
    if (!msg.isSystem || !msg.content) return false;

    // B 端格式:"加入xx的聊天"
    const isBEndFormat = msg.content.startsWith('加入') && msg.content.endsWith('的聊天');

    // A 端格式:"xx加入聊天"(不应该出现,但双重检查)
    const isAEndFormat = /^.+加入聊天$/.test(msg.content) && !isBEndFormat;

    if (isAEndFormat) {
      console.warn('🔥 [B端系统消息-v1.3.61] ⚠️ 发现A端格式消息(异常):', msg.content);
    }

    return isBEndFormat;
  });

  console.log('🔥 [B端系统消息-v1.3.61] 是否已存在B端加入消息:', !!existingJoinMessage);

  if (!existingJoinMessage) {
    // 🔥 【HOTFIX-v1.3.56】强制重置防重复标记,确保能够添加正确的 B 端消息
    console.log('🔥 [B端系统消息修复-v6] 强制添加正确的B端系统消息');
    this.bEndSystemMessageAdded = false;

    // 先调用获取参与者方法(不返回 Promise)
    this.fetchChatParticipantsWithRealNames();

    // 延迟处理,确保获取参与者方法完成
    setTimeout(() => {
      const participants = this.data.participants || [];
      const currentUserOpenId = this.data.currentUser?.openId;

      // 找到非当前用户的参与者(即 A 端用户)
      const realInviterInfo = participants.find(p => {
        const pId = p.id || p.openId;
        return pId && pId !== currentUserOpenId;
      });

      if (realInviterInfo && realInviterInfo.nickName) {
        // 使用真实昵称
        const realNickname = realInviterInfo.nickName;
        const isPlaceholder = ['朋友', '邀请者', '用户', '好友'].includes(realNickname);

        if (!isPlaceholder) {
          const realJoinMessage = `加入${realNickname}的聊天`;
          console.log('🔥 [B端系统消息修复-v7] 添加真实昵称系统消息:', realJoinMessage);
          // 🔥 【HOTFIX-v1.3.66】B 端系统消息和 A 端保持一致,显示一段时间后自动淡出
          this.addSystemMessage(realJoinMessage, {
            autoFadeStaySeconds: 3,
            fadeSeconds: 5
          });
          this.bEndSystemMessageProcessed = true; // 🔥 设置防重复标记
          this.globalBEndMessageAdded = true; // 🔥 【HOTFIX-v1.3.57】设置全局防重复标记
        } else {
          // 如果仍是占位符,使用传入的名称
          console.log('🔥 [B端系统消息修复-v7] 使用传入名称:', joinMessage);
          // 🔥 【HOTFIX-v1.3.66】B 端系统消息和 A 端保持一致,显示一段时间后自动淡出
          this.addSystemMessage(joinMessage, {
            autoFadeStaySeconds: 3,
            fadeSeconds: 5
          });
          this.bEndSystemMessageProcessed = true; // 🔥 设置防重复标记
          this.globalBEndMessageAdded = true; // 🔥 【HOTFIX-v1.3.57】设置全局防重复标记
        }
      } else {
        // 找不到真实昵称,使用传入的名称
        console.log('🔥 [B端系统消息修复-v7] 未找到真实昵称,使用传入名称:', joinMessage);
        // 🔥 【HOTFIX-v1.3.66】B 端系统消息和 A 端保持一致,显示一段时间后自动淡出
        this.addSystemMessage(joinMessage, {
          autoFadeStaySeconds: 3,
          fadeSeconds: 5
        });
        this.bEndSystemMessageProcessed = true; // 🔥 设置防重复标记
        this.globalBEndMessageAdded = true; // 🔥 【HOTFIX-v1.3.57】设置全局防重复标记
      }
    }, 800); // 给足够时间让 fetchChatParticipantsWithRealNames 完成

    // 🔥 【HOTFIX-v1.3.57】安全机制:检查全局标记,避免重复添加
    setTimeout(() => {
      if (this.globalBEndMessageAdded) {
        console.log('🔥 [B端系统消息-安全机制] 全局标记显示消息已添加,跳过安全机制');
        return;
      }

      const currentMessages = this.data.messages || [];
      const hasAnyJoinMessage = currentMessages.some(msg =>
        msg.isSystem &&
        msg.content &&
        msg.content.includes('加入') &&
        msg.content.includes('的聊天') &&
        !msg.content.includes('您创建了')
      );

      if (!hasAnyJoinMessage) {
        console.log('🔥 [B端系统消息-安全机制] 未发现B端加入消息,强制添加基础消息');
        const fallbackMessage = `加入${decodedInviterName}的聊天`;
        // 🔥 【HOTFIX-v1.3.66】B 端系统消息和 A 端保持一致,显示一段时间后自动淡出
        this.addSystemMessage(fallbackMessage, {
          autoFadeStaySeconds: 3,
          fadeSeconds: 5
        });
        this.bEndSystemMessageProcessed = true;
        this.globalBEndMessageAdded = true; // 🔥 【HOTFIX-v1.3.57】设置全局防重复标记
      } else {
        console.log('🔥 [B端系统消息-安全机制] ✅ B端消息已正确显示');
      }
    }, 1200); // 确保在所有其他逻辑完成后执行

    // 🔥 【HOTFIX-v1.3.54】修复标题更新的 Promise 调用错误
    // 延迟更新标题,确保参与者数据已获取
    setTimeout(() => {
      const participants = this.data.participants || [];
      const currentUserOpenId = this.data.currentUser?.openId;

      // 找到非当前用户的参与者(即 A 端用户)
      const realInviterInfo = participants.find(p => {
        const pId = p.id || p.openId;
        return pId && pId !== currentUserOpenId;
      });

      let titleName = processedInviterName;
      if (realInviterInfo && realInviterInfo.nickName) {
        const realNickname = realInviterInfo.nickName;
        const isPlaceholder = ['朋友', '邀请者', '用户', '好友'].includes(realNickname);
        if (!isPlaceholder) {
          titleName = realNickname;
          console.log('🔥 [B端标题修复-v6] 使用真实昵称设置标题:', titleName);
        }
      }

      const correctTitle = `我和${titleName}（2）`;
      this.setData({
        dynamicTitle: correctTitle,
        chatTitle: correctTitle,
        contactName: correctTitle
      });

      // 🔥 立即更新导航栏标题
      wx.setNavigationBarTitle({
        title: correctTitle,
        success: () => {
          console.log('🔥 [B端系统消息修复-v6] ✅ B端标题已正确设置:', correctTitle);
        },
        fail: (e) => {
          console.log('🔥 [B端标题修复-v6] 标题设置失败:', e);
        }
      });
    }, 1000); // 给更多时间让参与者数据加载完成

    // 🔥 【HOTFIX-v1.3.52】标记 B 端系统消息已添加,防止重复
    this.bEndSystemMessageAdded = true;
    console.log('🔥 [B端系统消息修复-v5] ✅ B端系统消息处理完成,已标记防重复');
  } else {
    console.log('🔥 [B端系统消息修复-v5] B端加入消息已存在,跳过添加');
    // 即使跳过添加,也要标记已处理,避免其他地方重复调用
    this.bEndSystemMessageAdded = true;
  }
}

/**
 * 🔥 【HOTFIX-v1.3.56】B 端系统消息安全二次检查
 *
 * 兜底机制:确保 B 端用户绝不会看到错误的 A 端系统消息。
 * 通常在 onLoad 末尾、参与者监听就绪后调用。
 */
function performBEndSystemMessageCheck() {
  console.log('🔥 [B端安全检查-v57] ==================== 开始B端系统消息安全检查 ====================');

  const { isFromInvite, currentUser, messages } = this.data;

  // 只对 B 端用户进行检查
  if (!isFromInvite) {
    console.log('🔥 [B端安全检查-v57] 当前用户是A端,跳过B端检查');
    return;
  }

  // 🔥 【HOTFIX-v1.3.57】检查全局防重复标记
  if (this.globalBEndMessageAdded) {
    console.log('🔥 [B端安全检查-v57] 全局标记显示B端消息已添加,跳过重复检查');
    return;
  }

  console.log('🔥 [B端安全检查-v56] 检测到B端用户,开始安全检查');
  console.log('🔥 [B端安全检查-v56] 用户信息:', currentUser);
  console.log('🔥 [B端安全检查-v56] 当前消息数量:', messages ? messages.length : 0);

  if (!messages || messages.length === 0) {
    console.log('🔥 [B端安全检查-v56] 暂无消息,无需检查');
    return;
  }

  // 检查是否存在错误的 A 端系统消息
  const wrongCreatorMessages = messages.filter(msg =>
    msg.isSystem &&
    msg.content &&
    msg.content.includes('您创建了私密聊天')
  );

  if (wrongCreatorMessages.length > 0) {
    console.log('🔥 [B端安全检查-v56] ⚠️ 发现错误的A端系统消息:', wrongCreatorMessages.length, '条');
    wrongCreatorMessages.forEach((msg, index) => {
      console.log(`🔥 [B端安全检查-v56] 错误消息${index + 1}: "${msg.content}"`);
    });

    // 立即清理错误消息
    const cleanedMessages = messages.filter(msg =>
      !(msg.isSystem && msg.content && msg.content.includes('您创建了私密聊天'))
    );

    this.setData({
      messages: cleanedMessages
    });

    console.log('🔥 [B端安全检查-v56] ✅ 已清理错误的A端消息');

    // 确保 B 端有正确的系统消息
    const hasCorrectBEndMessage = cleanedMessages.some(msg =>
      msg.isSystem &&
      msg.content &&
      msg.content.includes('加入') &&
      msg.content.includes('的聊天') &&
      !msg.content.includes('您创建了')
    );

    if (!hasCorrectBEndMessage) {
      console.log('🔥 [B端安全检查-v56] 缺少正确的B端系统消息,开始添加');

      // 尝试获取邀请者信息
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const options = currentPage.options || {};

      let inviterName = '朋友';
      if (options.inviter) {
        try {
          inviterName = decodeURIComponent(decodeURIComponent(options.inviter));
          if (!inviterName || inviterName === 'undefined' || inviterName === '邀请者') {
            inviterName = '朋友';
          }
        } catch (e) {
          inviterName = '朋友';
        }
      }

      const correctBEndMessage = `加入${inviterName}的聊天`;
      console.log('🔥 [B端安全检查-v57] 添加正确的B端系统消息:', correctBEndMessage);

      // 🔥 【HOTFIX-v1.3.66】B 端系统消息和 A 端保持一致,显示一段时间后自动淡出
      this.addSystemMessage(correctBEndMessage, {
        autoFadeStaySeconds: 3,
        fadeSeconds: 5
      });
      this.globalBEndMessageAdded = true; // 🔥 【HOTFIX-v1.3.57】设置全局防重复标记

      console.log('🔥 [B端安全检查-v57] ✅ B端系统消息修复完成');
    } else {
      console.log('🔥 [B端安全检查-v56] ✅ 已存在正确的B端系统消息');
    }
  } else {
    console.log('🔥 [B端安全检查-v56] ✅ 未发现错误的A端系统消息');

    // 检查是否有正确的 B 端系统消息
    const hasCorrectBEndMessage = messages.some(msg =>
      msg.isSystem &&
      msg.content &&
      msg.content.includes('加入') &&
      msg.content.includes('的聊天')
    );

    if (!hasCorrectBEndMessage) {
      console.log('🔥 [B端安全检查-v56] ⚠️ B端缺少系统消息,尝试添加');

      // 尝试获取邀请者信息
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const options = currentPage.options || {};

      let inviterName = '朋友';
      if (options.inviter) {
        try {
          inviterName = decodeURIComponent(decodeURIComponent(options.inviter));
          if (!inviterName || inviterName === 'undefined' || inviterName === '邀请者') {
            inviterName = '朋友';
          }
        } catch (e) {
          inviterName = '朋友';
        }
      }

      const correctBEndMessage = `加入${inviterName}的聊天`;
      console.log('🔥 [B端安全检查-v57] 添加B端系统消息:', correctBEndMessage);

      // 🔥 【HOTFIX-v1.3.66】B 端系统消息和 A 端保持一致,显示一段时间后自动淡出
      this.addSystemMessage(correctBEndMessage, {
        autoFadeStaySeconds: 3,
        fadeSeconds: 5
      });
      this.globalBEndMessageAdded = true; // 🔥 【HOTFIX-v1.3.57】设置全局防重复标记
    } else {
      console.log('🔥 [B端安全检查-v56] ✅ B端系统消息正常');
    }
  }

  console.log('🔥 [B端安全检查-v57] ==================== B端系统消息安全检查完成 ====================');
}

/**
 * 🔥 【新增】把"创建消息"替换为"加入消息"
 * 🔥 【HOTFIX-v1.3.81】全局防重复 — 整个 page 生命周期内只替换一次
 *
 * 当 A 端检测到 B 端加入,需要把"您创建了私密聊天..."这条消息替换为"[B端昵称]加入聊天"。
 * 同时删除重复的创建消息(云端 + 本地可能各一条)。
 *
 * @param {string} participantName - 加入者昵称
 */
function replaceCreatorMessageWithJoinMessage(participantName) {
  console.log('🔥 [系统消息替换-v1.3.81] 开始替换创建消息为加入消息,参与者:', participantName);

  // 🔥 【HOTFIX-v1.3.81】全局防重复检查
  if (this._hasReplacedCreatorMessage) {
    console.log('🔥 [系统消息替换-v1.3.81] ⚠️ 已执行过替换,跳过重复操作');
    return;
  }

  const messages = this.data.messages || [];
  let hasReplaced = false;
  let replacedMessageId = null;
  let removedDuplicates = [];

  // 🔥 【HOTFIX-v1.3.81】查找所有创建消息(可能有云端和本地的重复)
  const creatorMessages = messages.filter(msg =>
    msg.content && (
      msg.content.includes('您创建了私密聊天') ||
      /^.+创建了私密聊天$/.test(msg.content)
    )
  );

  console.log('🔥 [系统消息替换-v1.3.81] 找到创建消息数量:', creatorMessages.length);

  // 🔥 【HOTFIX-v1.3.81】检查是否已有加入消息,如果有则跳过
  const hasJoinMessage = messages.some(msg =>
    msg.isSystem && msg.content && (
      msg.content.includes('加入聊天') && !msg.content.includes('您创建了') && !msg.content.includes('的聊天')
    )
  );

  if (hasJoinMessage) {
    console.log('🔥 [系统消息替换-v1.3.81] 已存在加入消息,跳过替换');
    this._hasReplacedCreatorMessage = true;
    return;
  }

  // 查找并替换/删除创建消息
  const updatedMessages = messages.map((msg, index) => {
    if (msg.content && (msg.content.includes('您创建了私密聊天') || /^.+创建了私密聊天$/.test(msg.content))) {
      if (!hasReplaced) {
        // 保留第一个,替换为加入消息
        console.log('🔥 [系统消息替换-v1.3.81] 找到创建消息,准备替换:', msg.content);
        hasReplaced = true;
        replacedMessageId = msg.id;
        return {
          ...msg,
          content: `${participantName}加入聊天`,
          time: this.formatTime(new Date()),
          timeDisplay: this.formatTime(new Date()),
          // 🔥 【HOTFIX-v1.3.81】确保保留系统消息标记
          isSystem: true,
          isSystemMessage: true,
          opacity: 1
        };
      } else {
        // 删除重复的创建消息
        console.log('🔥 [系统消息替换-v1.3.81] 删除重复的创建消息:', msg.content);
        removedDuplicates.push(msg.id);
        return null; // 标记为删除
      }
    }
    return msg;
  }).filter(msg => msg !== null); // 过滤掉被标记删除的消息

  if (hasReplaced || removedDuplicates.length > 0) {
    // 🔥 【HOTFIX-v1.3.81】设置全局标记防止重复
    this._hasReplacedCreatorMessage = true;

    this._localMessageCache = updatedMessages;
    var kbActive = !!(this.data.inputFocus || this.data.keyboardVisible || this.data.keyboardHeight > 0);
    var replacePatch = {
      messages: updatedMessages,
      hasSystemMessage: true
    };
    if (kbActive) {
      replacePatch.scrollIntoView = '';
      replacePatch.scrollTop = this.data.scrollTop === 99999 ? 99998 : 99999;
    } else {
      replacePatch.scrollIntoView = '';
    }
    var self = this;
    this.setData(replacePatch, function() {
      if (kbActive) { self.scheduleScrollToBottom(); }
    });

    console.log('🔥 [系统消息替换-v1.3.83] ✅ 创建消息已替换为加入消息:', `${participantName}加入聊天`);
    console.log('🔥 [系统消息替换-v1.3.83] 删除的重复消息:', removedDuplicates);

    // 🔥 【HOTFIX-v1.3.83】替换后的"xx加入聊天"统一使用3秒后淡出
    try {
      if (replacedMessageId) {
        this.startSystemMessageFade && this.startSystemMessageFade(replacedMessageId, 3, 5);

        // 🔥 清除 hasSystemMessage 标记
        setTimeout(() => {
          this.setData({ hasSystemMessage: false });
        }, 8000); // 3秒停留 + 5秒淡出
      }
    } catch (e) {
      console.warn('⚠️ [系统消息替换-v1.3.83] 启动加入消息淡出失败:', e);
    }
  } else {
    // 🔥 【HOTFIX-v1.3.83】未找到创建消息时,直接添加加入消息
    console.log('🔥 [系统消息替换-v1.3.83] 未找到创建消息,直接添加加入消息');
    this._hasReplacedCreatorMessage = true;

    // 直接添加加入消息
    const joinMessage = `${participantName}加入聊天`;
    this.addSystemMessage(joinMessage, {
      autoFadeStaySeconds: 3,
      fadeSeconds: 5
    });
    console.log('🔥 [系统消息替换-v1.3.83] ✅ 已添加加入消息(创建消息不存在)');
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
  page.addCreatorSystemMessage = addCreatorSystemMessage;
  page.enforceSystemMessages = enforceSystemMessages;
  page.normalizeSystemMessagesAfterLoad = normalizeSystemMessagesAfterLoad;
  page.updateSystemMessageAfterJoin = updateSystemMessageAfterJoin;
  page.performBEndSystemMessageCheck = performBEndSystemMessageCheck;
  page.replaceCreatorMessageWithJoinMessage = replaceCreatorMessageWithJoinMessage;
}

module.exports = { attach };
