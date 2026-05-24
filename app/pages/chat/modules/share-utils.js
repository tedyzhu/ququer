/**
 * 分享 / 邀请相关的轻量工具
 *
 * 模块导出:
 *   - recordChatVisit(chatId, userId): 把一次聊天访问记入 wx.storage + globalData
 *   - buildSharePayload(page): 给 onShareAppMessage 用,返回 {title, path, imageUrl}
 *     ★ 这里也会触发 page.startWatchingForNewParticipants(chatId)
 *       (与原行为一致,启动监听被邀请者加入)
 *
 * 设计:
 * - recordChatVisit 是真正的纯函数,不需要 page 参数
 * - buildSharePayload 需要 page,因为要触发监听器
 *
 * 历史背景: chat.js 中曾有 generateRealShareLink / simulateRealShare 两个调试方法,
 * 它们没有任何生产路径调用,在本次重构中已删除(可从 git 历史恢复)。
 */

/**
 * 记录聊天访问历史
 *
 * 副作用:
 *   - wx.storage 'chat_visit_history':{ [chatId]: count }
 *   - wx.storage 'visited_chats': [chatId,...]
 *   - getApp().globalData.chatCreators: ['<userId>_<chatId>',...] (访问 ≥ 2 次时加入)
 *
 * @param {string} chatId
 * @param {string} userId
 */
function recordChatVisit(chatId, userId) {
  if (!chatId || !userId) return;

  try {
    const visitHistory = wx.getStorageSync('chat_visit_history') || {};
    const visitKey = chatId;
    visitHistory[visitKey] = (visitHistory[visitKey] || 0) + 1;
    wx.setStorageSync('chat_visit_history', visitHistory);

    const visitedChats = wx.getStorageSync('visited_chats') || [];
    if (!visitedChats.includes(chatId)) {
      visitedChats.push(chatId);
      wx.setStorageSync('visited_chats', visitedChats);
    }

    if (visitHistory[visitKey] >= 2) {
      const app = getApp();
      app.globalData.chatCreators = app.globalData.chatCreators || [];
      const creatorKey = userId + '_' + chatId;
      if (!app.globalData.chatCreators.includes(creatorKey)) {
        app.globalData.chatCreators.push(creatorKey);
        console.log('🔥 [访问历史] 添加创建者候选:', creatorKey, '访问次数:', visitHistory[visitKey]);
      }
    }

    console.log('🔥 [访问历史] 记录聊天访问:', chatId, '用户:', userId, '次数:', visitHistory[visitKey]);
  } catch (e) {
    console.error('🔥 [访问历史] 记录失败:', e);
  }
}

/**
 * 构建 onShareAppMessage 的返回 payload
 *
 * 同时触发 page.startWatchingForNewParticipants(chatId),
 * 与 chat.js 原 onShareAppMessage 行为完全一致。
 *
 * @param {Object} page - Page 实例
 * @returns {{title: string, path: string, imageUrl: string}}
 */
function buildSharePayload(page) {
  console.log('🎯 [新版] 聊天页面分享');

  const app = getApp();
  const userInfo = app.globalData.userInfo || {};
  const nickName = userInfo.nickName || '好友';
  const chatId = page.data.contactId;

  console.log('🎯 [新版] 分享聊天ID:', chatId);
  console.log('🎯 [新版] 邀请者信息:', { nickName, openId: userInfo.openId });

  // 启动监听被邀请者加入(无需调用 createInvite,直接监听)
  if (typeof page.startWatchingForNewParticipants === 'function') {
    page.startWatchingForNewParticipants(chatId);
  }

  // 🔥 【HOTFIX-v1.3.45】增强分享配置,确保 b 端能正确识别
  const encodedNickname = encodeURIComponent(nickName);
  const sharePath = `/app/pages/chat/chat?id=${chatId}&inviter=${encodedNickname}&fromInvite=true&action=join`;

  console.log('🎯 [新版] 分享路径:', sharePath);
  console.log('🎯 [新版] 编码前昵称:', nickName);
  console.log('🎯 [新版] 编码后昵称:', encodedNickname);

  return {
    title: `${nickName}邀请你加入私密聊天`,
    path: sharePath,
    imageUrl: '/assets/images/logo.png'
  };
}

module.exports = {
  recordChatVisit,
  buildSharePayload
};
