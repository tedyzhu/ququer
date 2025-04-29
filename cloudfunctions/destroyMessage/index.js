/**
 * 销毁消息云函数
 * 用于处理阅后即焚消息的销毁逻辑
 */
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: 'cloud1-9gmp8bcn2dc3576a'
});

/**
 * 销毁消息云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise<Object>} 返回销毁结果
 */
exports.main = async (event, context) => {
  console.log('销毁消息云函数被调用', event);
  
  // 参数验证
  if (!event.messageId) {
    return {
      success: false,
      error: '缺少消息ID'
    };
  }
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  // 初始化数据库和存储
  const db = cloud.database();
  const messagesCollection = db.collection('messages');
  const conversationsCollection = db.collection('conversations');
  const storage = cloud.storage();
  
  try {
    // 查询消息记录
    const messageResult = await messagesCollection.doc(event.messageId).get();
    if (messageResult.data.length === 0) {
      return {
        success: false,
        error: '消息不存在'
      };
    }
    
    const message = messageResult.data;
    
    // 权限验证：仅允许消息发送者或接收者执行销毁操作
    if (message.senderId !== userId && message.receiverId !== userId) {
      return {
        success: false,
        error: '无权操作该消息'
      };
    }
    
    // 已销毁的消息无需再次销毁
    if (message.destroyed) {
      return {
        success: true,
        message: '消息已被销毁'
      };
    }
    
    // 更新消息状态为已销毁
    await messagesCollection.doc(event.messageId).update({
      data: {
        status: 'destroyed',
        destroyed: true,
        destroyTime: db.serverDate()
      }
    });
    
    // 如果是媒体文件类型，从云存储中删除原始文件
    if (message.type !== 'text' && message.originalContent) {
      try {
        await storage.deleteFile({
          fileList: [message.originalContent]
        });
      } catch (storageErr) {
        console.error('删除媒体文件失败', storageErr);
        // 继续执行，不影响消息销毁
      }
    }
    
    // 更新会话的最后消息状态
    const conversationId = [message.senderId, message.receiverId].sort().join('_');
    const conversationResult = await conversationsCollection.where({
      _id: conversationId
    }).get();
    
    if (conversationResult.data.length > 0) {
      const conversation = conversationResult.data[0];
      
      // 如果最后一条消息是要销毁的消息，更新会话最后消息状态
      if (conversation.lastMessage && 
          conversation.lastMessage.time.getTime() === message.sendTime.getTime() &&
          conversation.lastMessage.senderId === message.senderId) {
        
        await conversationsCollection.doc(conversationId).update({
          data: {
            'lastMessage.destroyed': true,
            'lastMessage.content': '[已销毁]'
          }
        });
      }
    }
    
    return {
      success: true
    };
  } catch (err) {
    console.error('销毁消息出错', err);
    return {
      success: false,
      error: err
    };
  }
};