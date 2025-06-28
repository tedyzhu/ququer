/**
 * 极简版 sendMessage 云函数
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
});

exports.main = async (event, context) => {
  console.log('sendMessage被调用:', event);
  
  if (!event.chatId || !event.content) {
    return { success: false, error: '参数不完整' };
  }
  
  const db = cloud.database();
  const wxContext = cloud.getWXContext();
  
  // 🔥 调试：打印微信上下文信息
  console.log('🔧 [调试] wxContext.OPENID:', wxContext.OPENID);
  console.log('🔧 [调试] wxContext.APPID:', wxContext.APPID);
  console.log('🔧 [调试] wxContext.UNIONID:', wxContext.UNIONID);
  
  try {
    const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 3);
    
    // 🔥 修复：优先使用传入的senderId，如果没有则使用wxContext.OPENID
    const senderId = event.senderId || wxContext.OPENID;
    console.log('🔧 [调试] 最终使用的senderId:', senderId);
    
    const messageData = {
      _id: messageId,
      chatId: event.chatId,
      senderId: senderId,
      content: event.content,
      type: event.type || 'text',
      sendTime: db.serverDate(),
      timestamp: Date.now(),
      status: 'sent',
      destroyTimeout: event.destroyTimeout || 10,
      destroyed: false
    };
    
    console.log('🔧 [调试] 准备保存的消息数据:', messageData);
    
    await db.collection('messages').add({
      data: messageData
    });
    
    console.log('🔧 [调试] 消息保存成功，messageId:', messageId);
    
    return { success: true, messageId: messageId, senderId: senderId };
  } catch (err) {
    console.error('🔧 [错误] sendMessage云函数执行失败:', err);
    return { success: false, error: err.message };
  }
}; 