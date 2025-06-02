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
  
  try {
    const messageId = 'msg_' + Date.now();
    
    await db.collection('messages').add({
      data: {
        _id: messageId,
        chatId: event.chatId,
        senderId: wxContext.OPENID,
        content: event.content,
        type: event.type || 'text',
        sendTime: db.serverDate(),
        status: 'sent'
      }
    });
    
    return { success: true, messageId: messageId };
  } catch (err) {
    console.error('错误:', err);
    return { success: false, error: err.message };
  }
}; 