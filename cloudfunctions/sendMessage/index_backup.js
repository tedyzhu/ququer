/**
 * 发送消息云函数
 * 用于处理消息发送、存储等操作
 */
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
});

/**
 * 发送消息云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise<Object>} 返回消息发送结果
 */
exports.main = async (event, context) => {
  console.log('🔥 sendMessage云函数被调用:', event);
  
  // 参数验证
  if (!event.chatId || !event.content || !event.type) {
    console.error('❌ 参数不完整:', event);
    return {
      success: false,
      error: '参数不完整，需要chatId、content和type'
    };
  }
  
  const wxContext = cloud.getWXContext();
  const senderId = wxContext.OPENID;
  
  console.log('✅ 参数验证通过，senderId:', senderId);
  
  // 初始化数据库
  const db = cloud.database();
  const messagesCollection = db.collection('messages');
  
  try {
    // 生成唯一消息ID
    const messageId = 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    
    console.log('📝 生成消息ID:', messageId);
    
    // 创建消息记录
    const messageData = {
      _id: messageId,
      chatId: event.chatId,
      senderId: senderId,
      type: event.type, // 'text', 'image', 'voice', 'video', 'system'
      content: event.content,
      sendTime: db.serverDate(),
      status: 'sent',
      destroyed: false,
      destroyTimeout: event.destroyTimeout || 10
    };
    
    console.log('💾 准备保存消息数据:', messageData);
    
    // 保存消息到数据库
    const result = await messagesCollection.add({
      data: messageData
    });
    
    console.log('✅ 消息保存成功:', result);
    
    // 尝试更新会话信息
    try {
      const conversationsCollection = db.collection('conversations');
      const lastMessagePreview = event.type === 'text' ? 
        event.content.substring(0, 20) : 
        '[' + (event.type === 'image' ? '图片' : '消息') + ']';
      
      await conversationsCollection.doc(event.chatId).update({
        data: {
          lastMessage: lastMessagePreview,
          lastMessageTime: db.serverDate(),
          lastMessageSender: senderId,
          updateTime: db.serverDate()
        }
      });
      console.log('✅ 会话信息更新成功');
    } catch (updateErr) {
      console.log('⚠️ 更新会话失败（会话可能不存在）:', updateErr.message);
      // 不影响消息发送，继续执行
    }
    
    return {
      success: true,
      messageId: messageId,
      chatId: event.chatId,
      timestamp: Date.now()
    };
  } catch (err) {
    console.error('❌ 发送消息出错:', err);
    return {
      success: false,
      error: err.message || '发送消息失败'
    };
  }
}; 