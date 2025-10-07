/**
 * 获取会话列表云函数
 */
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 获取会话列表云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise<Object>} 返回会话列表
 */
exports.main = async (event, context) => {
  console.log('获取会话列表云函数被调用', event);
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  // 初始化数据库
  const db = cloud.database();
  const _ = db.command;
  const conversationsCollection = db.collection('conversations');
  const usersCollection = db.collection('users');
  
  try {
    // 🔥 【HOTFIX-v1.3.53】增强查询逻辑，支持智能检测
    const limit = event.limit || 20; // 默认获取20个会话
    
    // 查询当前用户参与的所有会话
    const conversationsResult = await conversationsCollection
      .where({
        participants: userId
      })
      .orderBy('updateTime', 'desc')
      .limit(limit)
      .get();
    
    // 获取所有参与用户的ID
    const userIds = new Set();
    conversationsResult.data.forEach(conversation => {
      conversation.participants.forEach(participantId => {
        if (participantId !== userId) {
          userIds.add(participantId);
        }
      });
    });
    
    // 查询所有参与用户的信息
    const userInfoMap = {};
    if (userIds.size > 0) {
      // 云函数中batch获取用户信息
      const usersResult = await usersCollection
        .where({
          openId: _.in([...userIds])
        })
        .get();
      
      // 构建用户信息映射
      usersResult.data.forEach(user => {
        userInfoMap[user.openId] = {
          nickName: user.userInfo.nickName || '用户',
          avatarUrl: user.userInfo.avatarUrl || ''
        };
      });
    }
    
    // 🔥 【HOTFIX-v1.3.53】处理会话数据，支持智能检测需要的字段
    const processedConversations = conversationsResult.data.map(conversation => {
      // 找到对方的ID
      const otherUserId = conversation.participants.find(id => id !== userId);
      
      // 获取对方用户信息
      const otherUserInfo = userInfoMap[otherUserId] || {
        nickName: '用户',
        avatarUrl: ''
      };
      
      // 获取所有参与者昵称
      const participantNames = conversation.participants.map(pId => {
        if (pId === userId) {
          return '我'; // 当前用户显示为"我"
        } else {
          return userInfoMap[pId]?.nickName || '用户';
        }
      });
      
      // 组装返回数据，兼容原有格式和新的智能检测格式
      return {
        id: conversation._id,
        chatId: conversation._id, // 🔥 添加chatId字段供智能检测使用
        lastMessage: conversation.lastMessage || {
          content: '',
          type: 'text',
          time: new Date(),
          senderId: '',
          destroyed: false
        },
        // 对方用户信息（原有格式）
        contactInfo: {
          id: otherUserId,
          nickName: otherUserInfo.nickName,
          avatarUrl: otherUserInfo.avatarUrl
        },
        // 🔥 【HOTFIX-v1.3.53】新增字段供智能检测使用
        participantNames: participantNames,
        lastMessageTime: conversation.updateTime?.getTime() || conversation.lastMessage?.time?.getTime() || 0,
        createTime: conversation.createTime?.getTime() || conversation._createTime?.getTime() || 0,
        updateTime: conversation.updateTime
      };
    });
    
    return {
      success: true,
      conversations: processedConversations
    };
  } catch (err) {
    console.error('获取会话列表出错', err);
    return {
      success: false,
      error: err
    };
  }
}; 