/**
 * 通知邀请者朋友已加入聊天
 */
const cloud = require('wx-server-sdk');

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 获取数据库引用
const db = cloud.database();

/**
 * 通知邀请者朋友已加入聊天
 * @param {Object} event - 云函数调用参数
 * @param {String} event.conversationId - 会话ID
 * @param {String} event.userName - 加入者昵称
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise} 返回处理结果
 */
exports.main = async (event, context) => {
  console.log('[云函数] notifyJoined 被调用，参数:', event);
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  if (!userId) {
    return {
      success: false,
      error: '获取用户ID失败'
    };
  }
  
  try {
    const { conversationId, userName } = event;
    
    if (!conversationId) {
      return {
        success: false,
        error: '缺少会话ID参数'
      };
    }
    
    // 查询会话信息
    const conversation = await db.collection('conversations').doc(conversationId).get()
      .catch(() => ({ data: null }));
    
    if (!conversation.data) {
      // 会话不存在，创建新会话
      await db.collection('conversations').add({
        data: {
          _id: conversationId,
          participants: [userId],
          createdBy: userId,
          friendJoined: true,
          friendName: userName || '用户',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
          lastMessage: `${userName || '用户'}加入了聊天`,
          lastMessageTime: db.serverDate(),
          status: 'active'
        }
      });
    } else {
      // 会话存在，更新状态
      // 🔧 修复：正确处理对象数组格式的 participants
      const existingParticipants = conversation.data.participants || [];
      const isObjectArray = existingParticipants.length > 0 && typeof existingParticipants[0] === 'object';
      
      let participantsUpdate;
      if (isObjectArray) {
        const alreadyIn = existingParticipants.some(p => 
          (p.id === userId || p.openId === userId)
        );
        if (!alreadyIn) {
          participantsUpdate = [...existingParticipants, {
            id: userId,
            openId: userId,
            nickName: userName || '用户',
            isCreator: false,
            joinTime: db.serverDate()
          }];
        } else {
          participantsUpdate = existingParticipants;
        }
      } else {
        participantsUpdate = db.command.addToSet(userId);
      }
      
      await db.collection('conversations').doc(conversationId).update({
        data: {
          friendJoined: true,
          friendName: userName || '用户',
          updatedAt: db.serverDate(),
          lastMessage: `${userName || '用户'}加入了聊天`,
          lastMessageTime: db.serverDate(),
          participants: participantsUpdate
        }
      });
    }
    
    // 添加系统消息 - 🔧 修复：检查是否已有相同的系统消息，避免重复
    const recentMessages = await db.collection('messages')
      .where({
        chatId: conversationId,
        type: 'system',
        senderId: 'system'
      })
      .orderBy('sendTime', 'desc')
      .limit(3)
      .get();
    
    const duplicateContent = `${userName || '用户'}加入了聊天`;
    const hasDuplicate = (recentMessages.data || []).some(msg => 
      msg.content === duplicateContent || 
      msg.content === `加入${userName || '用户'}的聊天`
    );
    
    if (!hasDuplicate) {
      await db.collection('messages').add({
        data: {
          chatId: conversationId,
          content: duplicateContent,
          senderId: 'system',
          type: 'system',
          sendTime: db.serverDate(),
          status: 'sent',
          destroyed: false
        }
      });
    } else {
      console.log('[云函数] 跳过重复系统消息:', duplicateContent);
    }
    
    return {
      success: true,
      message: '通知成功'
    };
  } catch (error) {
    console.error('[云函数] notifyJoined 执行出错:', error);
    
    return {
      success: false,
      error: error.message || '通知失败'
    };
  }
}; 