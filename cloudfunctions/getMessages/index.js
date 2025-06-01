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
  
  // 参数验证
  if (!event.conversationId && !event.targetUserId) {
    return {
      success: false,
      error: '参数不完整'
    };
  }
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  // 初始化数据库
  const db = cloud.database();
  const _ = db.command;
  const messagesCollection = db.collection('messages');
  
  try {
    // 查询条件：当前用户与目标用户之间的聊天记录
    let queryCondition;
    
    if (event.targetUserId) {
      // 如果提供了目标用户ID，查询与该用户的对话
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
    
    // 查询消息（不包括已销毁的）
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
    
    // 对消息内容进行解密处理
    const encryptionKey = '0123456789abcdef0123456789abcdef'; // 32位密钥
    const messages = messagesResult.data.map(msg => {
      // 创建一个新对象以避免修改原始数据
      const processedMsg = { ...msg };
      
      // 如果消息未销毁且有加密内容，则解密
      if (!msg.destroyed && msg.type === 'text') {
        try {
          processedMsg.content = decryptMessage(msg.content, encryptionKey);
        } catch (err) {
          console.error('解密消息失败', err);
          processedMsg.content = '[加密消息]';
        }
      } else if (msg.destroyed) {
        // 已销毁的消息内容置空
        processedMsg.content = '';
      }
      
      return processedMsg;
    });
    
    // 按照时间正序返回
    messages.reverse();
    
    return {
      success: true,
      messages: messages
    };
  } catch (err) {
    console.error('获取消息列表出错', err);
    return {
      success: false,
      error: err
    };
  }
}; 