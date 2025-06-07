const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 使用当前云环境
});

const db = cloud.database();

/**
 * 获取聊天参与者信息
 * @param {Object} event - 云函数事件参数
 * @param {string} event.chatId - 聊天ID
 * @returns {Object} 返回参与者列表
 */
exports.main = async (event, context) => {
  const { chatId } = event;
  
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
    
    // 标准化参与者数据格式
    if (participants.length > 0) {
      // 如果participants是字符串数组（只有openId），需要查询用户信息
      if (typeof participants[0] === 'string') {
        console.log('👥 参与者是openId列表，查询用户详细信息');
        
        try {
          const userResults = await db.collection('users')
            .where({
              openId: db.command.in(participants)
            })
            .get();
          
          console.log('👥 查询到的用户信息:', userResults.data);
          
          participants = participants.map(openId => {
            const userInfo = userResults.data.find(user => user.openId === openId);
            return {
              openId: openId,
              nickName: userInfo?.userInfo?.nickName || userInfo?.nickName || '用户',
              avatarUrl: userInfo?.userInfo?.avatarUrl || userInfo?.avatarUrl || '/assets/images/default-avatar.png'
            };
          });
        } catch (error) {
          console.error('👥 查询用户信息失败:', error);
          // 降级处理，返回基本结构
          participants = participants.map(openId => ({
            openId: openId,
            nickName: '用户',
            avatarUrl: '/assets/images/default-avatar.png'
          }));
        }
      }
    }
    
    console.log('👥 标准化后的参与者列表:', participants.length, '人');
    console.log('👥 参与者详情:', participants);
    
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