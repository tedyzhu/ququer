/**
 * 通知邀请者朋友已加入聊天
 */
const cloud = require('wx-server-sdk');

// 初始化云环境
cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7',
  // 添加安全相关配置
  securityHeaders: {
    enableCrossOriginIsolation: true,
    crossOriginOpenerPolicy: {
      value: 'same-origin'
    },
    crossOriginEmbedderPolicy: {
      value: 'require-corp'
    },
    crossOriginResourcePolicy: {
      value: 'same-origin'
    }
  }
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
      await db.collection('conversations').doc(conversationId).update({
        data: {
          friendJoined: true,
          friendName: userName || '用户',
          updatedAt: db.serverDate(),
          lastMessage: `${userName || '用户'}加入了聊天`,
          lastMessageTime: db.serverDate(),
          // 确保当前用户在参与者列表中
          participants: db.command.addToSet(userId)
        }
      });
    }
    
    // 添加系统消息
    await db.collection('messages').add({
      data: {
        chatId: conversationId,
        content: `${userName || '用户'}加入了聊天`,
        senderId: 'system',
        type: 'system',
        sendTime: db.serverDate(),
        status: 'sent',
        destroyed: false
      }
    });
    
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