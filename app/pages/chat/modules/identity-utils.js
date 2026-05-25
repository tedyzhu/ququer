/**
 * 身份判定相关的轻量工具
 *
 * 这里**只放与流程解耦的纯/弱状态函数**:
 * - 读 page.data 与 wx.storage,但不写
 * - 不调用其他 Page 方法
 *
 * 注意:聊天身份判定的"主流程"(在 onLoad 中长达 1900 行的多重证据决策)是另一个模块的职责,
 * 后续会拆分到 modules/identity-resolver.js。本文件仅承担可独立测试的小工具。
 */

/**
 * 判断当前是否处于 B 端(接收方)环境
 *
 * 决策顺序(短路返回):
 * 1. data.isFromInvite === true  → 接收方
 * 2. data.isSender === false     → 接收方
 * 3. page.finalIsFromInvite 已确定 → 用此值
 * 4. page.isSender 已确定         → 用其反值
 * 5. participants 中找到自己的标记(isJoiner / isReceiver / role==='receiver') → 接收方
 * 6. participants 中找到自己的标记(isCreator / isSender / role==='creator')   → 发送方
 * 7. participants 中其他人有 creator 标记,且自己不是 creator → 接收方
 * 8. wx.storage 中 creator_<chatId> 不是当前用户 → 接收方
 * 9. 都不满足 → 默认发送方(false)
 *
 * @param {Object} page - Page 实例
 * @returns {boolean}
 */
function isReceiverEnvironment(page) {
  const data = page.data || {};
  if (data.isFromInvite === true) return true;
  if (data.isSender === false) return true;
  if (typeof page.finalIsFromInvite === 'boolean') {
    return page.finalIsFromInvite;
  }
  if (typeof page.isSender === 'boolean') {
    return page.isSender === false;
  }

  const participants = Array.isArray(data.participants) ? data.participants : [];
  const currentUserOpenId = data.currentUser?.openId;

  if (participants.length && currentUserOpenId) {
    const selfParticipant = participants.find(p => {
      const pid = p && (p.openId || p.id);
      return pid && pid === currentUserOpenId;
    });

    if (selfParticipant) {
      if (selfParticipant.isJoiner === true ||
          selfParticipant.isReceiver === true ||
          selfParticipant.role === 'receiver') {
        return true;
      }
      if (selfParticipant.isCreator === true ||
          selfParticipant.isSender === true ||
          selfParticipant.role === 'creator') {
        return false;
      }
    }

    const otherHasCreatorFlag = participants.some(p => {
      if (!p || p === selfParticipant) return false;
      return p.isCreator === true || p.isSender === true || p.role === 'creator';
    });
    if (otherHasCreatorFlag && (!selfParticipant || selfParticipant.isCreator !== true)) {
      return true;
    }
  }

  try {
    const contactId = data.contactId || page.data?.contactId;
    if (contactId && currentUserOpenId && typeof wx !== 'undefined' && wx.getStorageSync) {
      const creatorKey = `creator_${contactId}`;
      const storedCreator = wx.getStorageSync(creatorKey);
      if (storedCreator && storedCreator !== currentUserOpenId) {
        return true;
      }
    }
  } catch (error) {
    try { console.warn('⚠️ [B端检测] 本地创建者比对失败:', error); } catch (_) {}
  }

  return false;
}

/**
 * 判断消息是否由当前用户发送
 *
 * 仅按 senderId / currentUserOpenId 严格相等判断,不做任何映射推断,避免历史的"误自动映射"。
 *
 * @param {Object} page - Page 实例
 * @param {string} senderId - 消息发送者 ID
 * @param {string} [currentUserOpenId] - 当前用户 openId(可选,缺省自动从 page.data / app 取)
 * @returns {boolean}
 */
function isMessageFromCurrentUser(page, senderId, currentUserOpenId) {
  try {
    if (!senderId || senderId === 'system') return false;
    const app = getApp();
    const sid = String(senderId);
    const uid = String(
      currentUserOpenId ||
      page.data.currentUser?.openId ||
      app?.globalData?.userInfo?.openId ||
      app?.globalData?.openId ||
      ''
    );
    if (!uid) return false;
    return sid === uid;
  } catch (e) {
    try { console.warn('⚠️ [身份匹配] 判断失败,安全返回false:', e); } catch (_) {}
    return false;
  }
}

/**
 * 判断 B 端"加入系统消息"是否曾在此 chatId 中显示过(本地持久化)
 *
 * @param {Object} page - Page 实例
 * @param {string} [chatId] - 缺省取 page.data.contactId
 * @returns {boolean}
 */
function hasBEndJoinEver(page, chatId) {
  try {
    const id = chatId || page.data?.contactId;
    if (!id) return false;
    const key = `bEndJoinEver_${id}`;
    const val = wx.getStorageSync(key);
    return !!val;
  } catch (e) {
    try { console.warn('⚠️ [B端一次性防护] 读取持久化标记失败,安全返回false:', e); } catch (_) {}
    return false;
  }
}

/**
 * 标记 B 端"加入系统消息"为已显示过(本地持久化 + 内存标志同步)
 *
 * 同步效果:
 * - wx.setStorageSync('bEndJoinEver_<chatId>', true)
 * - page.bEndSystemMessageProcessed = true
 * - page.globalBEndMessageAdded = true
 *
 * @param {Object} page - Page 实例
 * @param {string} [chatId] - 缺省取 page.data.contactId
 */
function markBEndJoinEver(page, chatId) {
  try {
    const id = chatId || page.data?.contactId;
    if (!id) return;
    const key = `bEndJoinEver_${id}`;
    wx.setStorageSync(key, true);
    page.bEndSystemMessageProcessed = true;
    page.globalBEndMessageAdded = true;
  } catch (e) {
    try { console.warn('⚠️ [B端一次性防护] 写入持久化标记失败:', e); } catch (_) {}
  }
}

module.exports = {
  isReceiverEnvironment,
  isMessageFromCurrentUser,
  hasBEndJoinEver,
  markBEndJoinEver
};
