const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 使用当前云环境
});

const db = cloud.database();

/**
 * 获取聊天参与者信息
 * @param {Object} event - 云函数事件参数
 * @param {string} event.chatId - 聊天ID
 * @param {boolean} event.forceCleanup - 是否强制清理重复参与者
 * @returns {Object} 返回参与者列表
 */
exports.main = async (event, context) => {
  const { chatId, forceCleanup } = event;
  
  console.log('👥 获取聊天参与者，chatId:', chatId);
  
  try {
    if (!chatId) {
      return {
        success: false,
        error: '缺少聊天ID参数'
      };
    }

    // 查询conversations集合获取参与者信息
    const conversationResult = await db.collection('conversations')
      .doc(chatId)
      .get();

    if (!conversationResult.data) {
      console.log('👥 聊天不存在，可能是新创建的聊天');
      
      // 检查是否是新聊天，如果是则返回当前用户作为唯一参与者
      const wxContext = cloud.getWXContext();
      const currentUserId = wxContext.OPENID;
      
      if (currentUserId) {
        console.log('👥 返回当前用户作为默认参与者:', currentUserId);
        
        // 尝试从users集合获取当前用户信息
        try {
          const userResult = await db.collection('users')
            .where({ openId: currentUserId })
            .limit(1)
            .get();
          
          let userInfo = {
            openId: currentUserId,
            nickName: '用户',
            avatarUrl: '/assets/images/default-avatar.png'
          };
          
          if (userResult.data && userResult.data.length > 0) {
            const userData = userResult.data[0];
            userInfo = {
              openId: currentUserId,
              nickName: userData.userInfo?.nickName || userData.nickName || '用户',
              avatarUrl: userData.userInfo?.avatarUrl || userData.avatarUrl || '/assets/images/default-avatar.png'
            };
          }
          
          console.log('👥 找到当前用户信息:', userInfo);
          
          return {
            success: true,
            participants: [userInfo]
          };
        } catch (error) {
          console.error('👥 查询当前用户信息失败:', error);
          
          return {
            success: true,
            participants: [{
              openId: currentUserId,
              nickName: '用户',
              avatarUrl: '/assets/images/default-avatar.png'
            }]
          };
        }
      }
      
      return {
        success: true,
        participants: []
      };
    }

    const conversationData = conversationResult.data;
    let participants = conversationData.participants || [];
    
    console.log('👥 原始参与者数据:', participants);
    
    // 标准化参与者数据格式并从users表获取最新信息
    if (participants.length > 0) {
      console.log('👥 开始标准化参与者数据');
      
      // 提取所有参与者的openId
      const participantOpenIds = participants.map(p => {
        if (typeof p === 'string') {
          return p;
        } else if (typeof p === 'object') {
          return p.id || p.openId;
        }
        return null;
      }).filter(id => id);
      
      console.log('👥 提取的参与者openId列表:', participantOpenIds);
      
      try {
        // 🔧 始终从users表查询最新的用户信息
        const userResults = await db.collection('users')
          .where({
            openId: db.command.in(participantOpenIds)
          })
          .get();
        
        console.log('👥 从users表查询到的用户信息:', userResults.data);
        
        // 重构参与者列表，优先使用users表中的最新信息
        participants = participantOpenIds.map(openId => {
          const userFromDB = userResults.data.find(user => user.openId === openId);
          const originalParticipant = participants.find(p => 
            (typeof p === 'string' && p === openId) ||
            (typeof p === 'object' && (p.id === openId || p.openId === openId))
          );
          
          // 🔧 优先使用数据库中的最新信息
          let finalUserInfo = {
            openId: openId,
            nickName: '用户',
            avatarUrl: '/assets/images/default-avatar.png'
          };
          
          if (userFromDB) {
            // 优先使用users表中的信息
            finalUserInfo = {
              openId: openId,
              nickName: userFromDB.userInfo?.nickName || userFromDB.nickName || '用户',
              avatarUrl: userFromDB.userInfo?.avatarUrl || userFromDB.avatarUrl || '/assets/images/default-avatar.png'
            };
            console.log('👥 使用数据库中的用户信息:', finalUserInfo);
          } else if (typeof originalParticipant === 'object') {
            // 如果数据库中没有，使用conversations中的信息作为备选
            finalUserInfo = {
              openId: openId,
              nickName: originalParticipant.nickName || originalParticipant.name || '用户',
              avatarUrl: originalParticipant.avatarUrl || originalParticipant.avatar || '/assets/images/default-avatar.png'
            };
            console.log('👥 使用conversations中的用户信息:', finalUserInfo);
          }
          
          return finalUserInfo;
        });
        
      } catch (error) {
        console.error('👥 查询用户信息失败:', error);
        // 降级处理，使用原始数据
        participants = participantOpenIds.map(openId => {
          const originalParticipant = participants.find(p => 
            (typeof p === 'string' && p === openId) ||
            (typeof p === 'object' && (p.id === openId || p.openId === openId))
          );
          
          if (typeof originalParticipant === 'object') {
            return {
              openId: openId,
              nickName: originalParticipant.nickName || originalParticipant.name || '用户',
              avatarUrl: originalParticipant.avatarUrl || originalParticipant.avatar || '/assets/images/default-avatar.png'
            };
          } else {
            return {
              openId: openId,
              nickName: '用户',
              avatarUrl: '/assets/images/default-avatar.png'
            };
          }
        });
      }
    }
    
    console.log('👥 标准化后的参与者列表:', participants.length, '人');
    console.log('👥 参与者详情:', participants);
    
    // 🔥 如果开启强制清理模式，进行去重和数据库更新
    if (forceCleanup && participants.length > 0) {
      console.log('🔧 强制清理模式：开始去重和清理');
      
      // 按openId去重
      const uniqueParticipants = [];
      const seenIds = new Set();
      
      for (const participant of participants) {
        const participantId = participant.openId;
        if (!seenIds.has(participantId)) {
          seenIds.add(participantId);
          uniqueParticipants.push(participant);
          console.log('🔧 保留唯一参与者:', participantId, participant.nickName);
        } else {
          console.log('🔧 跳过重复参与者:', participantId);
        }
      }
      
      // 如果参与者数量发生变化，更新数据库
      if (uniqueParticipants.length !== participants.length) {
        console.log('🔧 检测到重复数据，从', participants.length, '人减少到', uniqueParticipants.length, '人');
        
        try {
          await db.collection('conversations')
            .doc(chatId)
            .update({
              data: {
                participants: uniqueParticipants,
                lastCleanup: db.serverDate()
              }
            });
          
          console.log('🔧 数据库参与者列表已清理');
          
          return {
            success: true,
            participants: uniqueParticipants,
            cleaned: true,
            originalCount: participants.length,
            cleanedCount: uniqueParticipants.length
          };
        } catch (updateError) {
          console.error('🔧 更新数据库失败:', updateError);
        }
      } else {
        console.log('🔧 没有发现重复数据，无需清理');
      }
      
      participants = uniqueParticipants;
    }
    
    return {
      success: true,
      participants: participants
    };

  } catch (error) {
    console.error('👥 获取聊天参与者失败:', error);
    
    return {
      success: false,
      error: error.message || '获取参与者失败'
    };
  }
}; 