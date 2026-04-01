/**
 * 创建聊天云函数
 * 支持两种创建方式：
 * 1. 通过targetUserId创建（支持老版本接口）
 * 2. 通过chatId直接创建（支持新版本接口）
 */
const cloud = require('wx-server-sdk');

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 获取数据库引用
const db = cloud.database();
const _ = db.command;

/**
 * 创建聊天云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise} 返回处理结果
 */
exports.main = async (event, context) => {
  console.log('[云函数] createChat 被调用，参数:', event);
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  if (!userId) {
    return {
      success: false,
      error: '获取用户ID失败'
    };
  }
  
  try {
    let chatId;
    let participantIds = [];
    
    // 确定聊天ID和参与者
    if (event.chatId) {
      // 方式1: 直接使用传入的chatId
      chatId = event.chatId;
      
      // 从数据库查询是否已存在该聊天
      const existingChat = await db.collection('conversations').doc(chatId).get()
        .catch(() => ({ data: null }));
      
      if (existingChat.data) {
        // 聊天已存在，仅更新当前用户的状态
        const participants = existingChat.data.participants || [];
        
        // 🔧 修复：支持对象数组和字符串数组两种格式
        const isInChat = participants.some(p => {
          if (typeof p === 'string') return p === userId;
          if (typeof p === 'object') return (p.id === userId || p.openId === userId);
          return false;
        });
        
        if (!isInChat) {
          // 根据现有格式添加参与者
          const isObjectArray = participants.length > 0 && typeof participants[0] === 'object';
          const newParticipant = isObjectArray ? {
            id: userId,
            openId: userId,
            nickName: event.userName || '用户',
            isCreator: participants.length === 0,
            joinTime: db.serverDate()
          } : userId;
          
          participants.push(newParticipant);
          await db.collection('conversations').doc(chatId).update({
            data: {
              participants: participants,
              updatedAt: db.serverDate()
            }
          });
        }
        
        return {
          success: true,
          chatId: chatId,
          exists: true,
          message: '成功加入已存在的聊天'
        };
      }
      
      // 如果聊天不存在，使用chatId创建
      participantIds = [userId];
    } else if (event.targetUserId) {
      // 方式2: 通过目标用户ID创建
      const targetUserId = event.targetUserId;
      
      if (!targetUserId || targetUserId === userId) {
        return {
          success: false,
          error: '无效的目标用户ID'
        };
      }
      
      // 按照ID顺序生成聊天ID
      participantIds = [userId, targetUserId].sort();
      chatId = participantIds.join('_');
      
      // 检查是否已存在聊天
      const existingChat = await db.collection('conversations').where({
        _id: chatId
      }).get();
      
      if (existingChat.data && existingChat.data.length > 0) {
        return {
          success: true,
          chatId: chatId,
          exists: true,
          message: '聊天已存在'
        };
      }
    } else {
      return {
        success: false,
        error: '缺少必要参数：chatId或targetUserId'
      };
    }
    
    // 创建新聊天记录
    const timestamp = db.serverDate();
    
    // 🔧 修复：使用对象格式存储参与者，与 joinByInvite 保持一致
    const creatorParticipant = {
      id: userId,
      openId: userId,
      nickName: event.userName || '用户',
      isCreator: true,
      joinTime: timestamp
    };
    
    // 首次创建聊天记录
    await db.collection('conversations').add({
      data: {
        _id: chatId,
        participants: [creatorParticipant],
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessage: event.message || '您创建了私密聊天，可点击右上角菜单分享链接邀请朋友加入',
        lastMessageTime: timestamp,
        status: 'active'
      }
    });
    
    // 🔥 【HOTFIX-v1.3.86】取消云端添加系统消息，完全由前端控制
    // 原因：云端添加的系统消息会与前端本地添加的系统消息重复,导致3个相同消息
    // if (event.message) {
    //   const messageId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    //   await db.collection('messages').add({
    //     data: {
    //       _id: messageId,
    //       chatId: chatId,
    //       senderId: userId,
    //       content: event.message,
    //       type: 'system',
    //       isSystem: true,
    //       sendTime: timestamp,
    //       status: 'sent',
    //       destroyed: false,
    //       destroyTimeout: 7
    //     }
    //   });
    // }
    
    return {
      success: true,
      chatId: chatId,
      exists: false,
      message: '成功创建聊天'
    };
  } catch (error) {
    console.error('[云函数] createChat 执行出错:', error);
    
    return {
      success: false,
      error: error.message || '创建聊天失败'
    };
  }
}; 