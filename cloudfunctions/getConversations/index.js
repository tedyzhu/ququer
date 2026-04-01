/**
 * 获取会话列表云函数 - 优化版
 * 修复参与者昵称显示问题，获取真实的用户昵称
 */
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 获取参与者的真实信息
 * @param {Array} participants - 参与者列表
 * @returns {Promise<Array>} 包含真实信息的参与者列表
 */
async function getParticipantsWithRealNames(participants) {
  if (!participants || participants.length === 0) {
    return [];
  }

  const participantInfos = await Promise.all(
    participants.map(async participant => {
      // 如果已经是完整对象，直接返回
      if (typeof participant === 'object' && participant.nickName) {
        return {
          id: participant.id || participant.openId,
          nickName: participant.nickName || participant.name || '用户',
          avatarUrl: participant.avatarUrl || participant.avatar || ''
        };
      }

      // 否则从 users 集合查询
      try {
        const participantId = typeof participant === 'object' 
          ? (participant.id || participant.openId) 
          : participant;
        
        const userResult = await db.collection('users')
          .where({ openId: participantId })
          .limit(1)
          .get();

        if (userResult.data && userResult.data.length > 0) {
          const userData = userResult.data[0];
          return {
            id: participantId,
            nickName: userData.nickName || userData.userInfo?.nickName || '用户',
            avatarUrl: userData.avatarUrl || userData.userInfo?.avatarUrl || ''
          };
        }
      } catch (error) {
        console.error('🔥 [getConversations] 查询用户信息失败:', error);
      }

      // 默认值
      return {
        id: typeof participant === 'object' ? participant.id : participant,
        nickName: '用户',
        avatarUrl: ''
      };
    })
  );

  return participantInfos;
}

/**
 * 云函数入口函数
 * @param {Object} event - 云函数调用参数
 * @param {number} [event.limit=10] - 返回会话数量限制
 * @param {number} [event.offset=0] - 分页偏移量
 * @param {Object} context - 云函数执行上下文
 * @returns {Promise<Object>} 返回会话列表
 */
exports.main = async (event, context) => {
  console.log('🔥 [getConversations] 云函数被调用', event);
  
  try {
    const wxContext = cloud.getWXContext();
    const userId = wxContext.OPENID;
    
    console.log('🔥 [getConversations] 用户ID:', userId);
    
    if (!userId) {
      return {
        success: false,
        error: '用户未登录',
        conversations: []
      };
    }

    // 查询用户参与的会话
    const conversationsCollection = db.collection('conversations');
    
    // 获取用户的会话列表
    // 🔧 修复：participants 可能是字符串数组或对象数组，需要同时查询两种格式
    let result;
    try {
      // 先尝试查询对象数组格式（participants[].openId 或 participants[].id）
      const objectResult = await conversationsCollection
        .where({
          'participants.openId': userId
        })
        .orderBy('updateTime', 'desc')
        .limit(event.limit || 10)
        .get();
      
      // 再查询字符串数组格式
      const stringResult = await conversationsCollection
        .where({
          participants: userId
        })
        .orderBy('updateTime', 'desc')
        .limit(event.limit || 10)
        .get();
      
      // 合并去重
      const allConversations = [...(objectResult.data || [])];
      const existingIds = new Set(allConversations.map(c => c._id));
      for (const conv of (stringResult.data || [])) {
        if (!existingIds.has(conv._id)) {
          allConversations.push(conv);
          existingIds.add(conv._id);
        }
      }
      
      // 也查询 participants[].id 格式
      const idResult = await conversationsCollection
        .where({
          'participants.id': userId
        })
        .orderBy('updateTime', 'desc')
        .limit(event.limit || 10)
        .get();
      
      for (const conv of (idResult.data || [])) {
        if (!existingIds.has(conv._id)) {
          allConversations.push(conv);
          existingIds.add(conv._id);
        }
      }
      
      // 按 updateTime 排序
      allConversations.sort((a, b) => {
        const timeA = a.updateTime || a.createTime || 0;
        const timeB = b.updateTime || b.createTime || 0;
        return timeB - timeA;
      });
      
      result = { data: allConversations.slice(0, event.limit || 10) };
    } catch (queryError) {
      console.error('🔥 [getConversations] 查询失败，使用降级方案:', queryError);
      result = await conversationsCollection
        .where({
          participants: userId
        })
        .orderBy('updateTime', 'desc')
        .limit(event.limit || 10)
        .get();
    }
    
    console.log('🔥 [getConversations] 查询结果数量:', result.data?.length || 0);
    
    if (!result.data || result.data.length === 0) {
      return {
        success: true,
        conversations: [],
        message: '暂无会话记录'
      };
    }
    
    // 处理每个会话，获取真实的参与者信息
    const conversations = await Promise.all(
      result.data.map(async conversation => {
        // 获取参与者真实信息
        const participantsInfo = await getParticipantsWithRealNames(
          conversation.participants || []
        );
        
        console.log('🔥 [getConversations] 会话参与者信息:', {
          chatId: conversation._id,
          participantCount: participantsInfo.length,
          names: participantsInfo.map(p => p.nickName)
        });
        
        // 找到对方（非当前用户）
        const otherParticipant = participantsInfo.find(p => p.id !== userId);
        
        return {
          id: conversation._id,
          chatId: conversation._id,
          participants: conversation.participants,
          participantNames: participantsInfo.map(p => p.nickName),
          lastMessage: conversation.lastMessage || '开始聊天吧',
          lastMessageTime: conversation.updateTime || conversation.createTime,
          createTime: conversation.createTime,
          updateTime: conversation.updateTime,
          status: conversation.status,
          chatStarted: conversation.chatStarted,
          contactInfo: otherParticipant || {
            id: '',
            nickName: '未知用户',
            avatarUrl: ''
          }
        };
      })
    );
    
    console.log('🔥 [getConversations] 处理后的会话列表:', conversations.length);
    
    return {
      success: true,
      conversations: conversations,
      total: conversations.length
    };
    
  } catch (error) {
    console.error('🔥 [getConversations] 错误:', error);
    return {
      success: false,
      error: error.message || '获取会话列表失败',
      conversations: []
    };
  }
};