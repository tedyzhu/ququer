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
