/**
 * 发送消息云函数
 * 用于处理消息发送、加密等操作
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

// 初始化云开发环境
cloud.init({
  env: 'cloud1-9gmp8bcn2dc3576a'
});

/**
 * AES加密消息内容
 * @param {String} content - 消息内容
 * @param {String} key - 加密密钥
 * @returns {String} 加密后的内容
 */
function encryptMessage(content, key) {
  // 实际应用中应使用安全的密钥管理，这里简化处理
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  let encrypted = cipher.update(content, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 发送消息云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise<Object>} 返回消息发送结果
 */
exports.main = async (event, context) => {
  console.log('发送消息云函数被调用', event);
  
  // 参数验证
  if (!event.receiverId || !event.content || !event.type) {
    return {
      success: false,
      error: '参数不完整'
    };
  }
  
  const wxContext = cloud.getWXContext();
  const senderId = wxContext.OPENID;
  
  // 初始化数据库
  const db = cloud.database();
  const messagesCollection = db.collection('messages');
  const conversationsCollection = db.collection('conversations');
  
  try {
    // 生成唯一消息ID
    const messageId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // 加密消息内容 (使用固定密钥，实际应用中应使用更安全的密钥管理)
    const encryptionKey = '0123456789abcdef0123456789abcdef'; // 32位密钥
    const encryptedContent = encryptMessage(event.content, encryptionKey);
    
    // 创建消息记录
    const messageData = {
      _id: messageId,
      senderId: senderId,
      receiverId: event.receiverId,
      type: event.type, // 'text', 'image', 'voice', 'video'
      content: encryptedContent,
      originalContent: event.type !== 'text' ? event.fileId : '', // 如果是媒体消息，保存文件ID
      sendTime: db.serverDate(),
      status: 'sent', // 'sent', 'received', 'read', 'destroyed'
      destroyed: false,
      // 销毁相关
      viewTime: null,
      destroyTime: null,
      destroyTimeout: event.destroyTimeout || 10 // 默认10秒后销毁
    };
    
    // 保存消息
    await messagesCollection.add({
      data: messageData
    });
    
    // 查找或创建会话
    const conversationId = [senderId, event.receiverId].sort().join('_');
    const conversation = await conversationsCollection.where({
      _id: conversationId
    }).get();
    
    // 会话元数据
    const lastMessagePreview = event.type === 'text' ? 
      event.content.substring(0, 20) : 
      `[${event.type === 'image' ? '图片' : (event.type === 'voice' ? '语音' : '视频')}]`;
    
    if (conversation.data.length === 0) {
      // 创建新会话
      await conversationsCollection.add({
        data: {
          _id: conversationId,
          participants: [senderId, event.receiverId],
          lastMessage: {
            content: lastMessagePreview,
            type: event.type,
            time: db.serverDate(),
            senderId: senderId,
            destroyed: false
          },
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
    } else {
      // 更新已有会话
      await conversationsCollection.doc(conversationId).update({
        data: {
          lastMessage: {
            content: lastMessagePreview,
            type: event.type,
            time: db.serverDate(),
            senderId: senderId,
            destroyed: false
          },
          updateTime: db.serverDate()
        }
      });
    }
    
    // TODO: 发送消息通知（云开发实现）
    
    return {
      success: true,
      messageId: messageId
    };
  } catch (err) {
    console.error('发送消息出错', err);
    return {
      success: false,
      error: err
    };
  }
}; 