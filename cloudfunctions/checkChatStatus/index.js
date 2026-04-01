/**
 * 检查聊天状态云函数
 */
const cloud = require('wx-server-sdk');

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 获取数据库引用
const db = cloud.database();

/**
 * 检查聊天状态云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {String} event.chatId - 聊天ID
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise} 返回处理结果
 */
exports.main = async (event, context) => {
  console.log('[云函数] checkChatStatus 被调用，参数:', event);
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  if (!userId) {
    return {
      success: false,
      error: '获取用户ID失败'
    };
  }
  
  try {
    const { chatId } = event;
    
    if (!chatId) {
      return {
        success: false,
        error: '缺少聊天ID参数'
      };
    }
    
    // 查询会话信息
    const chat = await db.collection('conversations').doc(chatId).get()
      .catch(() => ({ data: null }));
    
    // 如果聊天不存在
    if (!chat.data) {
      return {
        success: true,
        exists: false,
        joined: false,
        chatStarted: false
      };
    }
    
    // 检查是否有参与者
    const participants = chat.data.participants || [];
    
    // 🔧 修复：正确计算参与者数量，支持对象数组和字符串数组
    let participantCount = participants.length;
    // 如果是对象数组，统计有效的唯一参与者
    if (participantCount > 0 && typeof participants[0] === 'object') {
      const uniqueIds = new Set();
      participants.forEach(p => {
        const pid = p.id || p.openId;
        if (pid) uniqueIds.add(pid);
      });
      participantCount = uniqueIds.size;
    }
    
    // 检查是否有朋友加入标记
    const friendJoined = chat.data.friendJoined === true;
    
    // 检查是否已开始聊天
    const chatStarted = chat.data.chatStarted === true;
    
    // 构建返回结果
    const result = {
      success: true,
      exists: true,
      joined: friendJoined || participantCount > 1,
      chatStarted: chatStarted,
      chatStartedBy: chat.data.chatStartedBy || '',
      chatStartedByName: chat.data.chatStartedByName || '',
      friendName: chat.data.friendName || '朋友',
      participants: participantCount,
      createdBy: chat.data.createdBy,
      isChatCreator: chat.data.createdBy === userId
    };
    
    return result;
  } catch (error) {
    console.error('[云函数] checkChatStatus 执行出错:', error);
    
    return {
      success: false,
      error: error.message || '检查失败'
    };
  }
}; 