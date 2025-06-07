// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 验证聊天ID是否有效
 * @param {string} chatId - 待验证的聊天ID
 * @returns {boolean} 是否有效
 */
function isValidChatId(chatId) {
  if (!chatId) return false;
  
  // 检查是否是标准微信场景值
  if (/^[0-9]{4}$/.test(chatId) || chatId === '1001') {
    console.log('检测到chatId是标准场景值，拒绝处理:', chatId);
    return false;
  }
  
  // 要求chatId必须以chat_开头或长度足够或包含特殊字符
  if (!chatId.startsWith('chat_') && chatId.length < 10 && !chatId.includes('_') && !chatId.includes('-')) {
    console.log('chatId格式无效，拒绝处理:', chatId);
    return false;
  }
  
  return true;
}

/**
 * 通过邀请加入聊天
 * @param {Object} event - 云函数调用参数
 * @param {string} event.chatId - 聊天ID
 * @param {Object} event.joiner - 加入者信息对象
 * @param {string} event.joiner.openId - 加入者的openId
 * @param {string} event.joiner.nickName - 加入者昵称
 * @param {string} event.joiner.avatarUrl - 加入者头像URL
 * @returns {Object} 处理结果和聊天信息
 */
exports.main = async (event, context) => {
  console.log('[云函数] joinByInvite 开始执行');
  console.log('[云函数] 输入参数:', JSON.stringify(event, null, 2));
  
  try {
    const wxContext = cloud.getWXContext()
    const userId = event.joiner?.openId || wxContext.OPENID
    
    console.log('[云函数] 微信上下文:', { 
      OPENID: wxContext.OPENID, 
      APPID: wxContext.APPID,
      UNIONID: wxContext.UNIONID 
    });
    console.log('[云函数] 解析的用户ID:', userId);
    
    // 提取用户信息，兼容旧格式
    const userName = event.joiner?.nickName || event.userName || '用户';
    const userAvatar = event.joiner?.avatarUrl || event.userAvatar || '/assets/images/avatar1.png';
    
    console.log('[云函数] 用户信息:', { userName, userAvatar });
    
    // 检查必要参数
    if (!event.chatId) {
      console.log('[云函数] 错误: 缺少聊天ID参数');
      return {
        success: false,
        error: '缺少聊天ID参数'
      }
    }
    
    // 验证聊天ID格式
    if (!isValidChatId(event.chatId)) {
      console.log('[云函数] 错误: 无效的聊天ID格式:', event.chatId);
      return {
        success: false,
        error: '无效的聊天ID格式'
      }
    }
    
    console.log('[云函数] 开始查询聊天记录:', event.chatId);
    
    // 查询聊天是否存在
    const chatResult = await db.collection('conversations')
      .doc(event.chatId)
      .get()
      .catch(err => {
        console.log('[云函数] 聊天不存在或查询失败:', err.message);
        return { data: null }
      })
    
    console.log('[云函数] 聊天查询结果:', chatResult);
    
    // 如果聊天不存在
    if (!chatResult.data) {
      console.log('[云函数] 错误: 聊天不存在或已过期');
      return {
        success: false,
        error: '聊天不存在或已过期'
      }
    }
    
    // 获取参与者列表
    const chat = chatResult.data
    const participants = chat.participants || []
    
    console.log('[云函数] 当前参与者列表:', participants);
    
    // 检查用户是否已在参与者列表中
    const isUserInChat = participants.some(p => 
      (typeof p === 'object' && p.id === userId) || p === userId
    )
    
    console.log('[云函数] 用户是否已在聊天中:', isUserInChat);
    
    // 构建完整的用户信息对象
    const userInfo = {
      id: userId,
      name: userName,
      nickName: userName,
      avatar: userAvatar,
      avatarUrl: userAvatar,
      joinTime: db.serverDate(),
      isJoiner: true // 标记为加入者
    }
    
    console.log('[云函数] 构建的用户信息:', userInfo);
    
    // 如果用户已在参与者列表中,更新其信息并标记状态为活跃
    if (isUserInChat) {
      console.log('[云函数] 用户已在聊天中，更新状态');
      
      // 更新参与者列表中的用户信息
      const updatedParticipants = participants.map(p => {
        if ((typeof p === 'object' && p.id === userId) || p === userId) {
          return {
            ...userInfo,
            joinTime: p.joinTime || db.serverDate(),
            isJoiner: true
          };
        }
        return p;
      });
      
      console.log('[云函数] 更新后的参与者列表:', updatedParticipants);
      
      // 更新聊天状态
      await db.collection('conversations')
        .doc(event.chatId)
        .update({
          data: {
            status: 'active',
            chatStarted: true,
            updateTime: db.serverDate(),
            participants: updatedParticipants
          }
        });
      
      console.log('[云函数] 聊天状态更新完成');
      
      // 返回当前所有参与者信息
      const result = {
        success: true,
        chatId: event.chatId,
        alreadyJoined: true,
        participants: updatedParticipants,
        chat: {
          ...chat,
          participants: updatedParticipants,
          status: 'active',
          chatStarted: true
        }
      };
      
      console.log('[云函数] 返回结果(已加入):', result);
      return result;
    }
    
    console.log('[云函数] 用户首次加入，处理参与者列表');
    
    // 更新现有参与者信息，确保他们有完整的显示信息
    let updatedParticipants = [];
    if (participants.length > 0) {
      updatedParticipants = participants.map(p => {
        if (typeof p === 'object') {
          return {
            ...p,
            nickName: p.nickName || p.name || '用户',
            avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
            isCreator: p.isCreator === undefined ? true : p.isCreator
          };
        } else {
          // 处理可能存在的非对象参与者
          return {
            id: p,
            name: '用户',
            nickName: '用户',
            avatarUrl: '/assets/images/default-avatar.png',
            isCreator: true
          };
        }
      });
    } else {
      // 如果没有参与者，创建一个默认的创建者
      updatedParticipants = [{
        id: chat.creator || 'creator_' + Date.now(),
        name: chat.creatorName || '用户',
        nickName: chat.creatorName || '用户',
        avatarUrl: chat.creatorAvatar || '/assets/images/default-avatar.png',
        isCreator: true
      }];
    }
    
    console.log('[云函数] 处理后的现有参与者:', updatedParticipants);
    
    // 添加新用户到参与者列表
    const newParticipants = [...updatedParticipants, userInfo];
    
    console.log('[云函数] 新的参与者列表:', newParticipants);
    
    // 更新后的聊天数据
    const updatedChat = {
      ...chat,
      participants: newParticipants,
      status: 'active',
      chatStarted: true,
      joinTime: db.serverDate(),
      updateTime: db.serverDate()
    };
    
    console.log('[云函数] 准备更新聊天记录');
    
    // 更新聊天记录
    await db.collection('conversations')
      .doc(event.chatId)
      .update({
        data: {
          participants: newParticipants,
          status: 'active',
          chatStarted: true,
          joinTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    
    console.log('[云函数] 聊天记录更新完成');
    
    console.log('[云函数] 添加系统消息');
    
    // 添加系统消息
    await db.collection('messages').add({
      data: {
        chatId: event.chatId,
        type: 'system',
        content: `${userName}加入了私密聊天`,
        sendTime: db.serverDate(),
        status: 'sent'
      }
    })
    
    console.log('[云函数] 系统消息添加完成');
    
    // 🔥 强制触发数据库更新事件，确保监听器能捕获到变化
    await db.collection('conversations')
      .doc(event.chatId)
      .update({
        data: {
          lastActivity: db.serverDate(),
          lastJoiner: userName
        }
      });
    
    console.log('[云函数] 触发监听更新完成');
    
    // 返回完整的聊天信息，包括所有参与者
    const result = {
      success: true,
      chatId: event.chatId,
      message: '成功加入聊天',
      participants: newParticipants,
      chat: updatedChat,
      // 🔥 添加聊天已开始标志
      chatStarted: true,
      needsNavigation: true // 标记需要导航到聊天页面
    };
    
    console.log('[云函数] 返回结果(新加入):', result);
    return result;
    
  } catch (error) {
    console.error('[云函数] 执行过程中发生错误:', error);
    console.error('[云函数] 错误堆栈:', error.stack);
    
    const errorResult = {
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      errorStack: error.stack
    };
    
    console.log('[云函数] 返回错误结果:', errorResult);
    return errorResult;
  }
}
