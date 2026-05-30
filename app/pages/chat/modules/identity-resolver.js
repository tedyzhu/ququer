/**
 * onLoad 身份判定主流程的渐进式拆分模块
 *
 * P3 阶段重构,目标是把 chat.js 的 onLoad(目前约 1096 行)拆解为多个语义独立的子流程。
 * 因为 onLoad 内部混合了 URL 参数解析、stored invite 清理、多重身份判定、
 * 标题刷新策略、加入/创建分支动作、阅后即焚检查等若干职责,
 * 一次性整段抽离风险极高,因此分多次 PR 处理。
 *
 * 当前文件承载**阶段 1**:onLoad 头部的 URL 参数解析 + stored invite 清理(原行 471-525)。
 *
 * 设计原则:
 * - 纯函数与副作用函数分离,纯函数易测试
 * - 字段命名与 chat.js onLoad 中的 `let` 变量一致,允许后续阶段直接解构使用
 * - 保留原 console.log 一致,继续支持线上排错
 */

const ChatHelpers = require('./chat-helpers.js');

/**
 * @typedef {Object} LoadContext
 * @property {string}  chatId             解析或 fallback 生成的 chatId
 * @property {string}  inviter            邀请者昵称(可能为空字符串或 null)
 * @property {string}  userName           URL 编码状态的 userName
 * @property {boolean} isNewChat          是否新聊天
 * @property {boolean} forceReceiverMode  始终 false(P2 起已禁用,保留兼容下游)
 * @property {?Object} inviteInfo         stored invite,可能被清理为 null
 * @property {Object}  options            原始 options 引用,后续阶段复用
 */

/**
 * 纯函数:从 onLoad 收到的 options 解析得到基础字段
 *
 * 不读取 wx.storage / app 状态,无任何副作用。
 *
 * @param {Object} options - onLoad 收到的 URL 参数
 * @returns {{ chatId: string, inviter: string, userName: string, isNewChat: boolean }}
 */
function parseLoadOptions(options) {
  // 与 chat.js 历史代码完全一致的解析顺序,字段名也保持一致
  let chatId = options.id || '';
  let inviter = options.inviter || '';
  let userName = options.userName || '';
  // 兼容 'true' 字符串、布尔 true、action=create、缺 id 这 4 种新聊天信号
  let isNewChat = options.isNewChat === 'true' || options.isNewChat === true ||
                  options.action === 'create' || (!options.id && !chatId);

  console.log('🔧 [页面参数] 原始参数:', { chatId, inviter, userName, isNewChat: options.isNewChat, action: options.action });
  console.log('🔥 [关键修复] 正确解析的isNewChat:', isNewChat);
  console.log('🔥 [关键修复] 解析细节: isNewChat字符串?', options.isNewChat === 'true', '| isNewChat布尔?', options.isNewChat === true, '| action=create?', options.action === 'create');

  // fallback chatId:依次尝试 contactId / chatId,都没有就生成
  if (!chatId) {
    chatId = options.contactId || options.chatId || `chat_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  return { chatId, inviter, userName, isNewChat };
}

/**
 * 副作用函数:基于解析结果决定是否清理 stored invite
 *
 * 调用 `app.clearInviteInfo()` 修改全局状态。
 * 当 inviteInfo 缺失或满足以下任一条件时清理:
 *   - 距离 inviteInfo.timestamp 已超 10 分钟(过期)
 *   - 距离 inviteInfo.timestamp ≤ 10 分钟,但 options 中 inviter / fromInvite 都缺失(残留信息)
 *
 * @param {Object}  page         - Page 实例(预留,本阶段未实际使用)
 * @param {?Object} inviteInfo   - 由 app.getStoredInviteInfo() 取得
 * @param {Object}  options      - onLoad 收到的 URL 参数
 * @param {string}  currentInviter - 当前 inviter 值(可能被清理为 null)
 * @param {number}  [now]        - 当前时间戳,默认 Date.now()。允许测试注入
 * @returns {{ inviteInfo: ?Object, inviter: ?string }}
 */
function cleanupStaleInviteInfo(page, inviteInfo, options, currentInviter, now) {
  // 这里 require 在函数内部,避免 chat-helpers.js 不存在的循环依赖风险
  const app = getApp();
  const currentTime = typeof now === 'number' ? now : Date.now();

  // inviteInfo 缺失:无需做任何处理
  if (!inviteInfo || !inviteInfo.inviteId) {
    return { inviteInfo: null, inviter: currentInviter };
  }

  const inviteTime = inviteInfo.timestamp || 0;
  const timeDiff = currentTime - inviteTime;

  console.log('🔥 [邀请信息清理] 检测到邀请信息，分析有效性');
  console.log('🔥 [邀请信息清理] 当前时间:', currentTime);
  console.log('🔥 [邀请信息清理] 邀请时间:', inviteTime);
  console.log('🔥 [邀请信息清理] 时间差:', timeDiff);

  // 过期(>10 分钟)
  if (timeDiff > 10 * 60 * 1000) {
    console.log('🔥 [邀请信息清理] 检测到过期邀请信息，立即清理');
    app.clearInviteInfo && app.clearInviteInfo();
    return { inviteInfo: null, inviter: null };
  }

  console.log('🔥 [邀请信息清理] 邀请信息在有效期内，但需要验证真实性');

  // 没有 URL 邀请参数 → 视为残留
  if (!options.inviter && !options.fromInvite) {
    console.log('🔥 [邀请信息清理] 无真实邀请参数，清理残留邀请信息');
    app.clearInviteInfo && app.clearInviteInfo();
    return { inviteInfo: null, inviter: null };
  }

  console.log('🔥 [邀请信息清理] 验证通过，保留邀请信息');
  return { inviteInfo, inviter: currentInviter };
}

/**
 * 入口:组合 parseLoadOptions + cleanupStaleInviteInfo,返回完整 LoadContext
 *
 * @param {Object} page    - Page 实例
 * @param {Object} options - onLoad 收到的 URL 参数
 * @returns {LoadContext}
 */
function prepareLoadContext(page, options) {
  const parsed = parseLoadOptions(options);

  const app = getApp();
  const initialInviteInfo = app && app.getStoredInviteInfo ? app.getStoredInviteInfo() : null;

  // P2 起已禁用,保留字段是为了让 chat.js 现有 if 分支不报错
  const forceReceiverMode = false;

  console.log('🔧 [修复发送方误判] 特殊处理:如果有分享链接中的邀请信息，优先处理');

  const cleaned = cleanupStaleInviteInfo(page, initialInviteInfo, options, parsed.inviter);

  return {
    chatId: parsed.chatId,
    inviter: cleaned.inviter,
    userName: parsed.userName,
    isNewChat: parsed.isNewChat,
    forceReceiverMode,
    inviteInfo: cleaned.inviteInfo,
    options,
  };
}

module.exports = {
  prepareLoadContext,
  parseLoadOptions,
  cleanupStaleInviteInfo,
};


// ========== 阶段 2:身份判定核心(渐进抽离) ==========
//
// 阶段 2 目标是分解 onLoad 行 483-967 的 485 行身份判定逻辑。
// 直接整段抽离风险极高(异步副作用 / 多个 let 变量重写 / 矛盾 hotfix 历史),
// 因此进一步细分为多个子阶段,每次只抽纯/弱状态计算部分:
//
//   - 阶段 2a(本文件):detectInvitePresence — URL 参数预检测(纯函数)
//   - 阶段 2b(后续):collectCreatorEvidence — inviteInfo 内的证据收集(弱状态,只读 wx.storage / app)
//   - 阶段 2c(后续):computeIdentityDecision — 决策合成
//   - 阶段 2d(后续):云端验证 + 副作用调用(留在 onLoad 不动,等阶段 4 重新设计)

/**
 * 纯函数:从 onLoad options 检测是否有任何邀请进入的迹象
 *
 * 原 chat.js 行 484-501 的逻辑等价封装。
 *
 * @param {Object} options - onLoad 收到的 URL 参数
 * @returns {{
 *   hasExplicitInviterParam: boolean,  // 有明确的非 'undefined' 字符串的 inviter
 *   hasJoinAction: boolean,             // action=join
 *   hasFromInviteFlag: boolean,         // fromInvite=true / 'true' / '1'
 *   preliminaryInviteDetected: boolean  // 三者任一
 * }}
 */
function detectInvitePresence(options) {
  const hasExplicitInviterParam = !!(options.inviter && options.inviter !== 'undefined');
  const hasJoinAction = options.action === 'join';
  const hasFromInviteFlag = options.fromInvite === 'true' ||
                             options.fromInvite === true ||
                             options.fromInvite === '1';
  const preliminaryInviteDetected = hasExplicitInviterParam || hasJoinAction || hasFromInviteFlag;

  console.log('🔥 [优先检查] URL参数分析:');
  console.log('🔥 [优先检查] options.inviter:', options.inviter);
  console.log('🔥 [优先检查] options.action:', options.action);
  console.log('🔥 [优先检查] options.fromInvite:', options.fromInvite);
  console.log('🔥 [优先检查] 明确的邀请参数:', hasExplicitInviterParam);

  if (preliminaryInviteDetected) {
    console.log('🔥 [优先检查] 检测到URL邀请参数，但需要先验证是否为创建者');
    console.log('🔥 [优先检查] 将进行创建者验证以确定真实身份');
  }

  return {
    hasExplicitInviterParam,
    hasJoinAction,
    hasFromInviteFlag,
    preliminaryInviteDetected,
  };
}

module.exports.detectInvitePresence = detectInvitePresence;


/**
 * 阶段 2b:在 stored inviteInfo 存在时,收集所有创建者证据(只读 wx.storage / app)
 *
 * 原 chat.js 行 491-560(约 70 行)的逻辑等价封装。
 * 仅在 `inviteInfo && inviteInfo.inviteId && !forceReceiverMode` 时才被 onLoad 调用。
 *
 * 副作用范围:
 * - 读 wx.getStorageSync('visited_chats')  / wx.getStorageSync('chat_visit_history')
 * - 读 app.globalData.recentCreateActions / chatCreators / isInShareMode
 * - 读 page.data.isNewChat
 * - 调 ChatHelpers.smartNicknameMatch(纯函数)
 * - 不写入任何状态
 *
 * @param {Object} page - Page 实例(读 data.isNewChat)
 * @param {Object} options - onLoad URL 参数
 * @param {Object} inviteInfo - 已确认 truthy 的 stored invite
 * @param {Object} userInfo - app.globalData.userInfo
 * @param {boolean} preliminaryInviteDetected - 由 detectInvitePresence 给出
 * @returns {{
 *   currentUserNickName: string,
 *   currentUserOpenId: string,
 *   chatIdContainsUserId: boolean,
 *   inviteTime: number,
 *   currentTime: number,
 *   timeSinceInvite: number,
 *   isVeryRecentInvite: boolean,
 *   inviterNickname: string,
 *   userNickname: string,
 *   isSameUser: boolean,
 *   hasCreateAction: boolean,
 *   isInShareMode: boolean,
 *   isRecentInvite: boolean,
 *   isModeratelyRecent: boolean,
 *   smartNicknameMatch: boolean,
 *   hasHistoricalEvidence: boolean,
 *   isRepeatVisit: boolean,
 *   hasOwnershipMarkers: boolean,
 *   chatVisitCount: number,
 *   isFrequentVisitor: boolean
 * }}
 */
function collectCreatorEvidence(page, options, inviteInfo, userInfo, preliminaryInviteDetected) {
  const app = getApp();

  // 🔥 【修复发送方误判】改进检测逻辑：检查用户是否可能是聊天创建者
  const currentUserNickName = userInfo && userInfo.nickName;
  const currentUserOpenId = (userInfo && userInfo.openId) || (app.globalData && app.globalData.openId);

  console.log('🔥 [身份判断修复] 邀请信息分析:');
  console.log('🔥 [身份判断修复] 用户昵称:', currentUserNickName);
  console.log('🔥 [身份判断修复] 邀请者昵称:', inviteInfo.inviter);
  console.log('🔥 [身份判断修复] 聊天ID:', inviteInfo.inviteId);
  console.log('🔥 [身份判断修复] 用户OpenId:', currentUserOpenId);

  // 🔥 【HOTFIX-v1.3.44d】智能判断用户是否为聊天创建者
  // 方法1：检查聊天ID是否包含用户ID片段
  const chatIdContainsUserId = !!(currentUserOpenId && inviteInfo.inviteId &&
    (inviteInfo.inviteId.includes(currentUserOpenId.substring(0, 8)) ||
     inviteInfo.inviteId.includes(currentUserOpenId.slice(-8)) ||
     inviteInfo.inviteId.includes(currentUserOpenId.substring(0, 12)) ||
     inviteInfo.inviteId.includes(currentUserOpenId.slice(-12))));

  // 方法2：检查邀请时间是否太新（创建者不会立即通过邀请链接进入）
  const inviteTime = inviteInfo.timestamp || 0;
  const currentTime = Date.now();
  const timeSinceInvite = currentTime - inviteTime;
  const isVeryRecentInvite = timeSinceInvite < 2 * 60 * 1000; // 2分钟内

  // 方法3：检查是否是同一用户（邀请者昵称和当前用户昵称相似）
  // 🔥 【CRITICAL-FIX-v3】优先使用URL参数中的邀请者昵称
  let inviterNickname = inviteInfo.inviter || '';

  // 如果URL包含邀请参数，优先使用URL中的邀请者昵称
  if (preliminaryInviteDetected && options.inviter) {
    try {
      const urlInviterName = decodeURIComponent(options.inviter);
      if (urlInviterName && urlInviterName !== '朋友' && urlInviterName !== '邀请者') {
        inviterNickname = urlInviterName;
        console.log('🔥 [邀请者昵称] 使用URL参数中的邀请者昵称:', inviterNickname);
      }
    } catch (e) {
      console.log('🔥 [邀请者昵称] URL参数解码失败，使用默认值');
    }
  }

  const userNickname = currentUserNickName || '';
  const isSameUser = inviterNickname === userNickname;

  // 🔥 【HOTFIX-v1.3.44e】增强检测方法
  const hasCreateAction = options.action === 'create' ||
                          (page.data && page.data.isNewChat === true) ||
                          (app.globalData && app.globalData.recentCreateActions &&
                           app.globalData.recentCreateActions.includes(inviteInfo.inviteId));

  const isInShareMode = !!(app.globalData && app.globalData.isInShareMode === true);

  const isRecentInvite = timeSinceInvite < 24 * 60 * 60 * 1000; // 24小时内
  const isModeratelyRecent = timeSinceInvite < 7 * 24 * 60 * 60 * 1000; // 7天内

  // 智能昵称匹配
  const smartNicknameMatch = ChatHelpers.smartNicknameMatch(inviterNickname, userNickname);

  // 🔥 【增强检测】添加更多创建者证据
  const hasHistoricalEvidence = !!(app.globalData && app.globalData.chatCreators &&
                                   app.globalData.chatCreators.includes(currentUserOpenId + '_' + inviteInfo.inviteId));
  const visitedChats = wx.getStorageSync('visited_chats');
  const isRepeatVisit = !!(visitedChats && visitedChats.includes && visitedChats.includes(inviteInfo.inviteId));
  const hasOwnershipMarkers = inviteInfo.createdBy === currentUserOpenId ||
                              inviteInfo.creator === currentUserOpenId ||
                              inviteInfo.owner === currentUserOpenId;

  // 🔥 【关键增强】如果用户反复进入同一个聊天，很可能是创建者
  const visitHistory = wx.getStorageSync('chat_visit_history') || {};
  const chatVisitCount = visitHistory[inviteInfo.inviteId] || 0;
  const isFrequentVisitor = chatVisitCount >= 2;

  // 🔥 【CRITICAL-FIX-v5】修复A端身份误判 - 删除错误的强制B端判断逻辑
  // 所有情况都进行统一的身份检测，不能仅基于时间强制判断身份

  console.log('🔥 [身份检测-v5] 开始全面身份验证');
  console.log('🔥 [身份检测-v5] 邀请时间差:', timeSinceInvite, 'ms');
  console.log('🔥 [身份检测-v5] 是否很新邀请:', isVeryRecentInvite);
  console.log('🔥 [身份检测-v5] 邀请者昵称:', inviterNickname);
  console.log('🔥 [身份检测-v5] 用户昵称:', userNickname);
  console.log('🔥 [身份检测-v5] 是否同一用户:', isSameUser);
  console.log('🔥 [身份检测-v5] 聊天ID包含用户ID:', chatIdContainsUserId);

  return {
    currentUserNickName,
    currentUserOpenId,
    chatIdContainsUserId,
    inviteTime,
    currentTime,
    timeSinceInvite,
    isVeryRecentInvite,
    inviterNickname,
    userNickname,
    isSameUser,
    hasCreateAction,
    isInShareMode,
    isRecentInvite,
    isModeratelyRecent,
    smartNicknameMatch,
    hasHistoricalEvidence,
    isRepeatVisit,
    hasOwnershipMarkers,
    chatVisitCount,
    isFrequentVisitor,
  };
}

module.exports.collectCreatorEvidence = collectCreatorEvidence;


/**
 * 阶段 2c(纯计算部分):基于 collectCreatorEvidence 输出,合成 isChatCreator 决策
 *
 * 这只覆盖"常规决策"部分,不含:
 *  - 云端验证(占位符邀请 + 频繁访问者场景,留 onLoad 内,有 await)
 *  - 强制 B 端(isDefinitelyReceiver,触发 this.clearIncorrectSystemMessages 副作用)
 *  - 统一处理后的副作用(clearInviteInfo / addCreatorSystemMessage)
 *  - 第二次"无 URL 邀请参数时的频繁访问者备用检测"(在 onLoad 决策表达式之后,需要 hasExplicitInviteParams)
 *
 * 等价于原 chat.js 第一段 isChatCreator 决策表达式(行 641-657),
 * 即 evidence 7 个 OR 项 + (isRecentInvite && smartNicknameMatch) + 内嵌的频繁访问者备用检测。
 *
 * 注:此函数不输出 console.log(原 chat.js 在该段后还有大量 log,留在 onLoad 处保持原顺序),
 * 仅作纯计算并返回结果。
 *
 * @param {Object} evidence - 由 collectCreatorEvidence 返回的对象
 * @returns {boolean}
 */
function computeCreatorByEvidence(evidence) {
  const {
    chatIdContainsUserId, isSameUser, hasCreateAction,
    isInShareMode, hasHistoricalEvidence, hasOwnershipMarkers,
    isFrequentVisitor,
    isRecentInvite, smartNicknameMatch,
    userNickname,
  } = evidence;

  // 主决策表达式:7 个独立证据 OR + 时间+昵称组合
  let isChatCreator = !!(chatIdContainsUserId ||
    isSameUser ||
    hasCreateAction ||
    isInShareMode ||
    hasHistoricalEvidence ||
    hasOwnershipMarkers ||
    isFrequentVisitor ||
    (isRecentInvite && smartNicknameMatch));

  // 内嵌备用检测:主决策未命中,但用户频繁访问且有真实昵称
  if (!isChatCreator && isFrequentVisitor && userNickname && userNickname !== '朋友') {
    isChatCreator = true;
  }

  return isChatCreator;
}

module.exports.computeCreatorByEvidence = computeCreatorByEvidence;


// ========== 阶段 5:onLoad 后处理 hooks ==========

/**
 * 阶段 5:onLoad 末尾的 4 个延迟副作用 hooks
 *
 * 包括:
 *  - B 端系统消息安全检查(1500ms 后,仅 isFromInvite=true 时执行)
 *  - 重置阅后即焚 / 系统消息防重复标记
 *  - 清除 loading 状态(500ms 后)
 *  - 阅后即焚检查(2000ms 后,带冷却期)
 *
 * 与原 chat.js 行 1285-1340 的 4 个独立 setTimeout 块行为等价。
 *
 * 设计:
 * - 内部仍用 setTimeout 异步触发,与原代码时序完全一致(1500/500/2000ms)
 * - 同步部分(标志位重置)立即执行
 * - 所有 page 方法调用通过 typeof 守卫,与原代码 `&&` 短路一致
 *
 * @param {Object} page - Page 实例
 */
function runPostLoadHooks(page) {
  // 1500ms:B 端系统消息安全检查
  setTimeout(function() {
    if (page.data && page.data.isFromInvite) {
      if (typeof page.performBEndSystemMessageCheck === 'function') {
        page.performBEndSystemMessageCheck();
      }
      // 额外保险:清理可能的重复消息(仅 B 端)
      setTimeout(function() {
        if (typeof page.removeDuplicateBEndMessages === 'function') {
          page.removeDuplicateBEndMessages();
        }
      }, 500);
    } else {
      console.log('🛡️ [B端检查] A端环境，跳过B端系统消息安全检查与去重');
    }
  }, 1500);

  // 同步:重置 B 端加入消息标志
  // 取消旧的"预添加 B 端系统消息"策略,改为在 joinByInvite 成功后统一添加
  page.needsJoinMessage = false;
  page.inviterDisplayName = '';

  // 同步:重置阅后即焚和系统消息标记(不清空已处理标志,防止重复补充)
  page.setData({
    hasCheckedBurnAfterReading: false,
    hasAddedConnectionMessage: false,
    isNewChatSession: true,
  });
  page.globalBEndMessageAdded = false;
  page.bEndSystemMessageAdded = false;

  // 500ms:清除 loading 状态
  setTimeout(function() {
    console.log('🔧 [页面初始化] 确保清除loading状态，保持界面流畅');
    page.setData({
      isLoading: false,
      isCreatingChat: false,
      chatCreationStatus: '',
    });
    console.log('🔧 [页面初始化] ✅ loading状态已清除');
  }, 500);

  // 2000ms:阅后即焚检查(带冷却期)
  setTimeout(function() {
    console.log('🔥 [页面初始化] 执行阅后即焚检查');
    var currentTime = Date.now();
    var lastCleanupTime = page.data.lastCleanupTime;
    var cooldownPeriod = page.data.cleanupCooldownPeriod;
    if (lastCleanupTime && (currentTime - lastCleanupTime) < cooldownPeriod) {
      console.log('🔥 [页面初始化] 仍在清理冷却期内，跳过阅后即焚检查');
      return;
    }
    if (typeof page.checkBurnAfterReadingCleanup === 'function') {
      page.checkBurnAfterReadingCleanup();
    }
  }, 2000);
}

module.exports.runPostLoadHooks = runPostLoadHooks;


// ========== 阶段 4:身份分支动作 ==========

/**
 * 阶段 4:基于已确认身份执行对应分支动作
 *
 * 三大主路径:
 *   1. B 端(finalIsFromInvite=true):调 joinChatByInvite,后续都不走 A 端逻辑
 *   2. A 端 + 新聊天(isNewChat=true):createConversationRecord 后启动监听
 *   3. A 端 + 已有聊天:根据 participants 数量分两子路径
 *
 * 与原 chat.js 行 1147-1281 的完整 if/else 链路行为等价。
 *
 * 副作用范围(显著):
 * - wx.setStorageSync('creator_<chatId>', openId)
 * - this.joinChatByInvite / addCreatorSystemMessage / updateUserInfoInDatabase /
 *   createConversationRecord / startParticipantListener
 * - this.setData(清除 loading)
 * - this.needsCreatorMessage 标志位读写
 * - 5 秒后调 app.clearInviteInfo(顶层 setTimeout 留在 onLoad 里调用)
 *
 * 注:5 秒清理邀请信息的 setTimeout 不抽,因为它依赖 onLoad 中的 `inviteInfo` 变量
 * (本函数返回后才会清理),保留在 onLoad 内时序更直观。
 *
 * @param {Object} page - Page 实例
 * @param {Object} ctx  - 分支动作所需上下文
 * @param {boolean} ctx.finalIsFromInvite - 最终身份判断结果
 * @param {string}  ctx.chatId
 * @param {string}  ctx.inviter
 * @param {string}  ctx.userName
 * @param {boolean} ctx.isNewChat
 */
function runIdentityBranchActions(page, ctx) {
  const { finalIsFromInvite, chatId, inviter, userName, isNewChat } = ctx;

  if (finalIsFromInvite) {
    // 🔥 如果是从邀请链接进入，立即加入聊天
    console.log('🔗 [被邀请者] 从邀请链接进入，开始加入聊天');
    page.joinChatByInvite(chatId, inviter || userName);
    return;
  }

  // 以下为 A 端(非邀请)分支
  const actualUserOpenId = page.actualCurrentUser && page.actualCurrentUser.openId;

  // 🔥 【HOTFIX-v1.3.89】A 端身份确认后立即存储创建者信息
  const creatorKey = `creator_${chatId}`;
  const existingCreator = wx.getStorageSync(creatorKey);
  if (!existingCreator) {
    wx.setStorageSync(creatorKey, actualUserOpenId);
    console.log('🔥 [创建者存储-v1.3.89] A端首次访问，存储创建者信息:', actualUserOpenId);
  } else {
    console.log('🔥 [创建者存储-v1.3.89] 创建者信息已存在:', existingCreator);
  }

  // 🔥 【HOTFIX-v1.3.21】发送方强化阅后即焚保护
  console.log('🔥 [发送方保护] 发送方身份确认，启动阅后即焚保护');

  // 🔥 【HOTFIX-v1.3.44d】如果身份判断修复检测到需要添加创建者消息，立即添加
  if (page.needsCreatorMessage) {
    console.log('🔥 [身份修复] 检测到需要添加创建者系统消息');
    page.addCreatorSystemMessage();
    page.needsCreatorMessage = false; // 清除标志
  }

  // 🔥 发送方：更新用户信息到数据库
  page.updateUserInfoInDatabase();

  // 🔥 【HOTFIX-v1.3.21】发送方严格禁止获取历史消息
  console.log('🔥 [发送方保护] 发送方严格禁止获取任何历史消息');

  if (isNewChat) {
    // 🔥 【HOTFIX-v1.3.89】存储创建者信息(冗余写一次,保持原代码行为)
    wx.setStorageSync(creatorKey, actualUserOpenId);
    console.log('🔥 [创建者存储-v1.3.89] 已存储创建者信息:', actualUserOpenId);

    page.createConversationRecord(chatId).then(function() {
      // 🔥 【HOTFIX-v1.3.3】发送方创建聊天时不获取历史消息，确保阅后即焚
      console.log('🔥 [发送方创建] 跳过获取历史消息，保持阅后即焚环境纯净');

      // 🔥 【HOTFIX-v1.3.4】发送方创建成功后立即清除加载状态
      page.setData({ isLoading: false, isCreatingChat: false, chatCreationStatus: '' });
      console.log('🔥 [发送方创建] ✅ 已清除加载状态，界面就绪');

      // 🔥 发送方创建时:不要立即调用 fetchChatParticipantsWithRealNames
      // 因为这会触发标题更新逻辑,导致单人变双人
      console.log('🔥 [发送方创建] 跳过立即获取参与者，等待对方加入');

      // 🔥 【HOTFIX-v1.3.42】发送方创建聊天时的系统消息修复
      // a 端应该立即显示创建聊天的系统提示
      console.log('🔥 [发送方创建] 立即添加a端创建聊天系统消息');
      page.addCreatorSystemMessage();

      // 🔥 发送方:立即启动参与者监听，等待接收方加入
      page.startParticipantListener(chatId);
    }).catch(function(err) {
      console.error('🔥 创建会话记录失败:', err);

      // 🔥 【修复】即使创建失败也要清除加载状态
      page.setData({ isLoading: false, isCreatingChat: false, chatCreationStatus: '' });
      console.log('🔥 [发送方创建] ⚠️ 创建失败但已清除加载状态');

      // 🔥 【修复】即使创建失败也不获取历史消息，保持阅后即焚原则
      console.log('🔥 [发送方创建] 创建失败，但仍跳过获取历史消息');

      // 🔥 失败时也要启动监听，但不要立即获取参与者
      page.startParticipantListener(chatId);
    });
    return;
  }

  // A 端 + 已有聊天:根据当前参与者数分两子路径
  const participants = page.data.participants || [];
  if (participants.length === 1) {
    console.log('🔥 [发送方检测] 单人参与者，疑似发送方，跳过获取历史消息');

    // 🔥 【HOTFIX-v1.3.4】发送方检测时也要清除加载状态
    page.setData({ isLoading: false, isCreatingChat: false, chatCreationStatus: '' });
    console.log('🔥 [发送方检测] ✅ 已清除加载状态，界面就绪');

    // 🔥 【关键修复】A 端正常进入时也要添加系统消息
    if (!finalIsFromInvite) {
      console.log('🔥 [A端系统消息] A端正常进入，添加创建者系统消息');
      page.addCreatorSystemMessage();
    }

    // 🔥 发送方不获取历史消息，只启动监听等待对方加入
    page.startParticipantListener(chatId);
  } else {
    // 🔥 【HOTFIX-v1.3.20】发送方严格阅后即焚保护 — 即使是已存在的聊天也不获取历史消息
    console.log('🔥 [发送方保护] 检测到非新聊天，但仍保持阅后即焚原则');

    // 🔥 发送方永远不获取历史消息，只启动监听等待对方加入
    page.setData({ isLoading: false, isCreatingChat: false, chatCreationStatus: '' });
    console.log('🔥 [发送方保护] ✅ 已清除加载状态，跳过获取历史消息');

    // 🔥 【关键修复】A 端正常进入时也要添加系统消息
    if (!finalIsFromInvite) {
      console.log('🔥 [A端系统消息] A端正常进入（多参与者），添加创建者系统消息');
      page.addCreatorSystemMessage();
    }

    // 🔥 只启动参与者监听，不获取历史消息和参与者信息
    page.startParticipantListener(chatId);
    console.log('🔥 [发送方保护] 仅启动参与者监听，保持环境纯净');
  }
}

module.exports.runIdentityBranchActions = runIdentityBranchActions;


// ========== 阶段 3:身份决议(finalIsFromInvite)+ 标题 ==========

/**
 * 阶段 3a:基于已收集的证据决议最终身份
 *
 * 与原 chat.js 行 876-998 完整 if/else if 链路等价。
 *
 * 决策树:
 *   1. isNewChat=true → 发送方
 *   2. skipCreatorCheck=true 且 needsCreatorMessage=false → 发送方(已确认创建者)
 *   3. needsCreatorMessage=true 或 (有 inviteInfo 但无 inviter) → 发送方(已纠正)
 *   4. 否则:执行完整邀请证据 + 创建者证据综合判断
 *
 * 副作用范围:
 * - 读:wx.getStorageSync(creator_<chatId> / chat_visit_<chatId>_<openId> / inviteInfo)
 * - 写:wx.removeStorageSync(creator_<chatId> / inviteInfo) — 当强接收方证据击败弱创建者证据时清缓存
 * - 写:app.clearInviteInfo() — 创建者强制纠正路径
 *
 * @param {Object} page - Page 实例(读 needsCreatorMessage / data.contactId)
 * @param {Object} ctx
 * @param {boolean} ctx.isNewChat
 * @param {boolean} ctx.skipCreatorCheck
 * @param {?Object} ctx.inviteInfo
 * @param {string}  ctx.inviter
 * @param {boolean} ctx.isFromInvite       - 之前阶段已识别的初步结果
 * @param {Object}  ctx.options            - onLoad URL 参数
 * @param {Object}  ctx.userInfo           - app.globalData.userInfo
 * @returns {{ finalIsFromInvite: boolean, isActualCreator: boolean }}
 */
function resolveFinalIdentity(page, ctx) {
  const { isNewChat, skipCreatorCheck, inviteInfo, inviter, isFromInvite, options, userInfo } = ctx;
  const app = getApp();

  let finalIsFromInvite = false;
  let isActualCreator = false;

  if (isNewChat) {
    finalIsFromInvite = false;
    console.log('🔥 [最终判断] 新聊天模式，确认为发送方');
    return { finalIsFromInvite, isActualCreator };
  }

  if (skipCreatorCheck && page.needsCreatorMessage === false) {
    finalIsFromInvite = false;
    console.log('🔥 [最终判断] 已确认为a端创建者，绝对是发送方');
    return { finalIsFromInvite, isActualCreator };
  }

  // 严格验证:身份纠正路径
  const hasBeenCorrectedToCreator = page.needsCreatorMessage || (inviteInfo && !inviter);
  if (hasBeenCorrectedToCreator) {
    finalIsFromInvite = false;
    console.log('🔥 [最终判断] 检测到身份已被纠正为创建者，强制设为发送方');
    return { finalIsFromInvite, isActualCreator };
  }

  // 邀请证据收集
  const hasUrlInviter = !!options.inviter;
  const hasStoredInviter = !!inviter;
  const hasFromInviteFlag = options.fromInvite === 'true' || options.fromInvite === true || options.fromInvite === '1';
  const hasJoinAction = options.action === 'join';
  const wasPreviouslyIdentifiedAsReceiver = isFromInvite;
  const hasStrongReceiverEvidence = hasUrlInviter || hasFromInviteFlag || hasJoinAction || wasPreviouslyIdentifiedAsReceiver;

  // A 端创建者证据(本地 storage 检测)
  const chatId = options.id || (page.data && page.data.contactId);
  const currentUserOpenId = userInfo && userInfo.openId;

  if (currentUserOpenId && chatId) {
    const creatorKey = `creator_${chatId}`;
    const storedCreator = wx.getStorageSync(creatorKey);
    const isStoredCreator = storedCreator === currentUserOpenId;

    const visitKey = `chat_visit_${chatId}_${currentUserOpenId}`;
    const visitHistory = wx.getStorageSync(visitKey) || 0;
    const isFrequentVisitor = visitHistory >= 2;

    const hasCreateAction = options.action === 'create';

    const storedInviteInfo = wx.getStorageSync('inviteInfo');
    const isReturningCreator = !!(storedInviteInfo &&
      storedInviteInfo.chatId === chatId &&
      !storedInviteInfo.fromInvite);

    const hasWeakCreatorEvidence = isStoredCreator || isFrequentVisitor || isReturningCreator;
    isActualCreator = hasWeakCreatorEvidence || hasCreateAction;

    // 强接收方证据击败弱创建者证据
    if (hasStrongReceiverEvidence && !hasCreateAction && hasWeakCreatorEvidence) {
      console.warn('🔥 [A端最终防护-v1.3.96] 检测到接收方强证据，忽略本地创建者弱证据');
      isActualCreator = false;

      // 清理历史误写的创建者缓存
      if (isStoredCreator && (hasFromInviteFlag || hasJoinAction || hasUrlInviter)) {
        wx.removeStorageSync(creatorKey);
        console.log('🔥 [A端最终防护-v1.3.96] 已清理旧创建者缓存:', creatorKey);
      }
    }

    console.log('🔥 [A端最终防护-v1.3.89] 创建者证据检查:');
    console.log('🔥 [A端最终防护-v1.3.89] - 存储的创建者:', isStoredCreator, storedCreator);
    console.log('🔥 [A端最终防护-v1.3.89] - 频繁访问:', isFrequentVisitor, '次数:', visitHistory);
    console.log('🔥 [A端最终防护-v1.3.89] - create action:', hasCreateAction);
    console.log('🔥 [A端最终防护-v1.3.89] - 回访创建者:', isReturningCreator);
    console.log('🔥 [A端最终防护-v1.3.89] - 最终是否创建者:', isActualCreator);
  }

  // 综合邀请证据,排除真正的创建者
  const hasValidInviteEvidence = (
    hasUrlInviter || hasStoredInviter || hasFromInviteFlag ||
    hasJoinAction || wasPreviouslyIdentifiedAsReceiver
  ) && !isActualCreator;

  finalIsFromInvite = hasValidInviteEvidence && !hasBeenCorrectedToCreator;

  // 如果检测到是创建者,强制纠正为发送方并清邀请缓存
  if (isActualCreator && finalIsFromInvite) {
    console.log('🔥 [A端最终防护] 检测到用户是真正创建者，强制纠正身份');
    finalIsFromInvite = false;
    wx.removeStorageSync('inviteInfo');
    if (app && app.clearInviteInfo) {
      app.clearInviteInfo();
    }
  }

  console.log('🔥 [最终判断] 邀请证据详情:');
  console.log('🔥 [最终判断] - URL邀请者:', hasUrlInviter, options.inviter);
  console.log('🔥 [最终判断] - 存储邀请者:', hasStoredInviter, inviter);
  console.log('🔥 [最终判断] - 之前身份:', wasPreviouslyIdentifiedAsReceiver);
  console.log('🔥 [最终判断] - 综合证据:', hasValidInviteEvidence);
  console.log('🔥 [最终判断] - 最终结果:', finalIsFromInvite);

  // 真机日志埋点:身份判定结果(双端排查身份误判的关键节点)
  try {
    const rtLog = app && app.globalData && app.globalData.realtimeLogger;
    if (rtLog) {
      rtLog.logIdentity({
        chatId: chatId,
        openId: currentUserOpenId,
        finalIsFromInvite: finalIsFromInvite,
        isActualCreator: isActualCreator,
        hasUrlInviter: hasUrlInviter,
        hasStoredInviter: hasStoredInviter,
        hasValidInviteEvidence: hasValidInviteEvidence,
      });
    }
  } catch (e) { /* 日志失败不影响身份判定 */ }

  return { finalIsFromInvite, isActualCreator };
}

/**
 * 阶段 3b:基于最终身份设置初始标题
 *
 * 与原 chat.js 行 1011-1075 等价(包含 wx.setNavigationBarTitle 副作用)。
 *
 * A/B 端策略:
 *   - B 端(finalIsFromInvite=true 且有 inviter):
 *     - 真实昵称 → 我和<昵称>(2)
 *     - 占位符 → 我和新用户(2),并 500ms 后 fetchRealInviterNameAndUpdateTitle
 *     - 解码异常 → fallback 到 userInfo.nickName
 *   - A 端:userInfo.nickName 或 'actualCurrentUser?.nickName' 或 '我'
 *
 * 副作用:
 * - wx.setNavigationBarTitle(立即生效)
 * - page.setData({ dynamicTitle })
 * - page.isAEndUser / isAEndTitleProtected / receiverTitleLocked(A 端标记)
 * - setTimeout(fetchRealInviterNameAndUpdateTitle, 500) — 仅占位符邀请者场景
 *
 * @param {Object} page
 * @param {Object} ctx
 * @param {boolean} ctx.finalIsFromInvite
 * @param {string}  ctx.inviter
 * @param {Object}  ctx.userInfo
 * @param {?Object} ctx.actualCurrentUser
 * @returns {string} 设置好的初始标题
 */
function setupInitialTitle(page, ctx) {
  const { finalIsFromInvite, inviter, userInfo, actualCurrentUser } = ctx;

  let initialTitle = (userInfo && userInfo.nickName) || '我';

  console.log('🔥 [标题修复] 开始设置初始标题');
  console.log('🔥 [标题修复] finalIsFromInvite:', finalIsFromInvite);
  console.log('🔥 [标题修复] 用户昵称:', userInfo && userInfo.nickName);
  console.log('🔥 [标题修复] 邀请者:', inviter);

  if (finalIsFromInvite && inviter) {
    // B 端策略
    try {
      const decodedInviterName = decodeURIComponent(decodeURIComponent(inviter));
      if (decodedInviterName && decodedInviterName !== '朋友' && decodedInviterName !== '邀请者') {
        initialTitle = `我和${decodedInviterName}（2）`;
        console.log('🔥 [B端标题] B端初始标题设置:', initialTitle);
        wx.setNavigationBarTitle({ title: initialTitle });
      } else {
        // 占位符邀请者:临时标题 + 500ms 后异步获取真实昵称
        console.log('🔥 [B端标题] 检测到占位符邀请者，将获取真实昵称');
        initialTitle = '我和新用户（2）';
        wx.setNavigationBarTitle({ title: initialTitle });
        setTimeout(function() {
          if (typeof page.fetchRealInviterNameAndUpdateTitle === 'function') {
            page.fetchRealInviterNameAndUpdateTitle();
          }
        }, 500);
      }
      console.log('🔥 [B端标题] ✅ B端导航栏标题立即设置成功:', initialTitle);
      page.setData({ dynamicTitle: initialTitle });
    } catch (e) {
      console.log('🔥 [B端标题] 邀请者昵称解码失败:', e);
      initialTitle = (userInfo && userInfo.nickName) || '我';
    }
  } else {
    // A 端策略
    const userNickname = (userInfo && userInfo.nickName) ||
                          (actualCurrentUser && actualCurrentUser.nickName) || '我';
    initialTitle = userNickname;
    console.log('🔥 [A端标题] A端标题设置为用户昵称:', initialTitle);
    wx.setNavigationBarTitle({ title: initialTitle });
    console.log('🔥 [A端标题] ✅ A端导航栏标题设置成功:', initialTitle);
    page.setData({ dynamicTitle: initialTitle });

    // A 端标记
    page.isAEndUser = true;
    page.isAEndTitleProtected = false;
    page.receiverTitleLocked = false;

    console.log('🔥 [统一标题] 采用统一的标题显示策略');
  }

  return initialTitle;
}

module.exports.resolveFinalIdentity = resolveFinalIdentity;
module.exports.setupInitialTitle = setupInitialTitle;
