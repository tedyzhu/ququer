/**
 * 获取消息列表云函数
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

// 初始化云开发环境
cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
});

/**
 * 解密消息内容
 * @param {String} encryptedContent - 加密的消息内容
 * @param {String} key - 解密密钥
 * @returns {String} 解密后的内容
 */
function decryptMessage(encryptedContent, key) {
  try {
    const parts = encryptedContent.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('解密消息失败', err);
    return '[加密消息]';
  }
}

/**
 * 获取消息列表云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise<Object>} 返回消息列表
 */
exports.main = async (event, context) => {
  console.log('获取消息云函数被调用', event);
  
  // 🔥 修改参数验证：支持chatId参数
  if (!event.conversationId && !event.targetUserId && !event.chatId) {
    return {
      success: false,
      error: '参数不完整，需要conversationId、targetUserId或chatId其中之一'
    };
  }
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  // 初始化数据库
  const db = cloud.database();
  const _ = db.command;
  const messagesCollection = db.collection('messages');
  
  try {
    // 🔥 查询条件：支持多种查询方式
    let queryCondition;
    
    if (event.chatId) {
      // 🔥 如果提供了chatId，直接按chatId查询
      console.log('按chatId查询消息:', event.chatId);
      queryCondition = {
        chatId: event.chatId
      };
    } else if (event.targetUserId) {
      // 如果提供了目标用户ID，查询与该用户的对话（兼容旧模式）
      console.log('按targetUserId查询消息:', event.targetUserId);
      queryCondition = _.or([
        {
          senderId: userId,
          receiverId: event.targetUserId
        },
        {
          senderId: event.targetUserId,
          receiverId: userId
        }
      ]);
    } else if (event.conversationId) {
      // 如果提供了会话ID，验证用户是否有权限访问该会话
      console.log('按conversationId查询消息:', event.conversationId);
      const conversationParts = event.conversationId.split('_');
      if (!conversationParts.includes(userId)) {
        return {
          success: false,
          error: '无权访问该会话'
        };
      }
      
      // 构建查询条件
      queryCondition = _.or([
        {
          senderId: conversationParts[0],
          receiverId: conversationParts[1]
        },
        {
          senderId: conversationParts[1],
          receiverId: conversationParts[0]
        }
      ]);
    }
    
    // 🔥 查询消息（不包括已销毁的）
    let messagesQuery = messagesCollection
      .where(queryCondition)
      .orderBy('sendTime', 'desc');
    
    // 分页限制
    if (event.limit) {
      messagesQuery = messagesQuery.limit(event.limit);
    } else {
      messagesQuery = messagesQuery.limit(50); // 默认获取最近50条
    }
    
    // 执行查询
    const messagesResult = await messagesQuery.get();
    console.log(`查询到 ${messagesResult.data.length} 条消息`);
    
    // 对消息内容进行解密处理
    const encryptionKey = '0123456789abcdef0123456789abcdef'; // 32位密钥
    const messages = messagesResult.data.map(msg => {
      // 创建一个新对象以避免修改原始数据
      const processedMsg = { ...msg };
      
      // 🔥 如果消息未销毁且有加密内容，则解密
      if (!msg.destroyed && msg.type === 'text' && msg.content) {
        try {
          processedMsg.content = decryptMessage(msg.content, encryptionKey);
        } catch (err) {
          console.error('解密消息失败', err);
          processedMsg.content = msg.content; // 🔥 如果解密失败，返回原内容
        }
      } else if (msg.destroyed) {
        // 已销毁的消息内容置空
        processedMsg.content = '';
      } else if (msg.type === 'system') {
        // 🔥 系统消息不需要解密
        processedMsg.content = msg.content;
      }
      
      return processedMsg;
    });
    
    // 按照时间正序返回
    messages.reverse();
    
    return {
      success: true,
      messages: messages,
      count: messages.length,
      queryType: event.chatId ? 'chatId' : (event.targetUserId ? 'targetUserId' : 'conversationId')
    };
  } catch (err) {
    console.error('获取消息列表出错', err);
    return {
      success: false,
      error: err.message || '获取消息失败'
    };
  }
}; 