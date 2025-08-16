/**
 * 通知邀请者开始聊天云函数
 * 版本：1.2.0 (2023-06-01)
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
 * 通知邀请者开始聊天
 * @param {Object} event - 云函数调用参数
 * @param {String} event.conversationId - 会话ID
 * @param {String} event.userName - 用户昵称
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise} 返回处理结果
 */
exports.main = async (event, context) => {
  console.log('[云函数] startConversation v1.2.0 被调用，参数:', event);
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  if (!userId) {
    return {
      success: false,
      error: '获取用户ID失败',
      version: '1.2.0'
    };
  }
  
  try {
    const { conversationId, userName } = event;
    
    if (!conversationId) {
      return {
        success: false,
        error: '缺少会话ID参数',
        version: '1.2.0'
      };
    }
    
    // 查询会话信息
    const conversation = await db.collection('conversations').doc(conversationId).get()
      .catch((err) => {
        console.error('[云函数] 查询会话失败:', err);
        return { data: null };
      });
    
    if (!conversation.data) {
      console.log('[云函数] 会话不存在，创建新会话');
      
      // 会话不存在，创建新会话
      const newConversation = {
        _id: conversationId,
        chatStarted: true,
        chatStartedBy: userId,
        chatStartedByName: userName || '用户',
        chatStartedAt: db.serverDate(),
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        participants: [userId],
        lastMessage: `${userName || '用户'} 开始了聊天`,
        lastMessageTime: db.serverDate(),
        status: 'active'
      };
      
      await db.collection('conversations').add({
        data: newConversation
      });
      
      console.log('[云函数] 成功创建新会话:', conversationId);
      
      // 添加系统消息
      const messageResult = await db.collection('messages').add({
        data: {
          chatId: conversationId,
          content: `${userName || '用户'} 开始了聊天`,
          senderId: 'system',
          type: 'system',
          sendTime: db.serverDate(),
          status: 'sent',
          destroyed: false
        }
      });
      
      return {
        success: true,
        message: '创建新会话并开始聊天成功',
        version: '1.2.0',
        chatStarted: true,
        isNewConversation: true,
        messageId: messageResult._id,
        updatedAt: new Date().toISOString()
      };
    }
    
    console.log('[云函数] 即将更新会话状态，当前状态:', conversation.data);
    
    // 会话已存在，检查是否已经开始
    if (conversation.data.chatStarted) {
      console.log('[云函数] 会话已经处于开始状态');
      
      // 只更新时间戳和最后消息
      await db.collection('conversations').doc(conversationId).update({
        data: {
          updatedAt: db.serverDate(),
          lastMessage: `${userName || '用户'}加入了私密聊天`,
          lastMessageTime: db.serverDate(),
          // 确保当前用户在参与者列表中
          participants: db.command.addToSet(userId)
        }
      });
      
      // 添加系统消息
      await db.collection('messages').add({
        data: {
          chatId: conversationId,
          content: `${userName || '用户'}加入了私密聊天`,
          senderId: 'system',
          type: 'system',
          sendTime: db.serverDate(),
          status: 'sent',
          destroyed: false
        }
      });
      
      return {
        success: true,
        message: '会话已处于开始状态',
        version: '1.2.0',
        chatStarted: true,
        alreadyStarted: true,
        updatedAt: new Date().toISOString()
      };
    }
    
    // 更新会话状态为已开始
    await db.collection('conversations').doc(conversationId).update({
      data: {
        chatStarted: true,
        chatStartedBy: userId,
        chatStartedByName: userName || '用户',
        chatStartedAt: db.serverDate(),
        updatedAt: db.serverDate(),
        lastMessage: `${userName || '用户'} 开始了聊天`,
        lastMessageTime: db.serverDate(),
        // 确保当前用户在参与者列表中
        participants: db.command.addToSet(userId)
      }
    });
    
    // 再次获取会话信息，确认更新成功
    const updatedConversation = await db.collection('conversations').doc(conversationId).get();
    
    console.log('[云函数] 会话状态已更新，新状态:', updatedConversation.data);
    
    // 添加系统消息
    const messageResult = await db.collection('messages').add({
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
    
    console.log('[云函数] 系统消息已添加:', messageResult);
    
    return {
      success: true,
      message: '通知开始聊天成功',
      version: '1.2.0',
      chatStarted: true,
      messageId: messageResult._id,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[云函数] startConversation 执行出错:', error);
    
    return {
      success: false,
      error: error.message || '通知失败',
      version: '1.2.0'
    };
  }
}; 