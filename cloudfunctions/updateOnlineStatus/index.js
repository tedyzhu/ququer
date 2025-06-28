/**
 * 🔥 更新用户在线状态云函数
 * 用于管理聊天室中用户的在线状态
 */

const cloud = require('wx-server-sdk');

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 更新用户在线状态云函数入口
 * @param {Object} event - 云函数参数
 * @param {string} event.chatId - 聊天室ID
 * @param {string} event.userId - 用户ID
 * @param {boolean} event.isOnline - 是否在线
 * @param {number} event.timestamp - 时间戳
 * @returns {Promise<Object>} 返回更新结果
 */
exports.main = async (event, context) => {
  console.log('👥 [在线状态云函数] 收到请求:', event);
  
  const { chatId, userId, isOnline, timestamp } = event;
  
  // 参数验证
  if (!chatId || !userId) {
    console.error('👥 [在线状态云函数] 缺少必要参数');
    return {
      success: false,
      error: '缺少必要参数'
    };
  }
  
  try {
    const onlineStatusCollection = db.collection('onlineStatus');
    
    if (isOnline) {
      // 用户上线：更新或创建在线状态记录
      console.log('👥 [在线状态云函数] 用户上线:', userId);
      
      const updateResult = await onlineStatusCollection
        .where({
          chatId: chatId,
          userId: userId
        })
        .update({
          data: {
            isOnline: true,
            timestamp: timestamp || Date.now(),
            lastActiveTime: Date.now()
          }
        });
      
      // 如果没有找到现有记录，创建新记录
      if (updateResult.stats.updated === 0) {
        await onlineStatusCollection.add({
          data: {
            chatId: chatId,
            userId: userId,
            isOnline: true,
            timestamp: timestamp || Date.now(),
            lastActiveTime: Date.now()
          }
        });
        console.log('👥 [在线状态云函数] 创建新的在线状态记录');
      } else {
        console.log('👥 [在线状态云函数] 更新现有在线状态记录');
      }
      
    } else {
      // 用户离线：更新在线状态为false
      console.log('👥 [在线状态云函数] 用户离线:', userId);
      
      await onlineStatusCollection
        .where({
          chatId: chatId,
          userId: userId
        })
        .update({
          data: {
            isOnline: false,
            timestamp: timestamp || Date.now(),
            offlineTime: Date.now()
          }
        });
    }
    
    // 🔥 清理过期的在线状态记录（超过10分钟没有活动的记录）
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    await onlineStatusCollection
      .where({
        chatId: chatId,
        lastActiveTime: db.command.lt(tenMinutesAgo)
      })
      .remove();
    
    console.log('👥 [在线状态云函数] 在线状态更新成功');
    
    return {
      success: true,
      message: `用户${isOnline ? '上线' : '离线'}状态更新成功`
    };
    
  } catch (err) {
    console.error('👥 [在线状态云函数] 更新失败:', err);
    return {
      success: false,
      error: err.message || '更新在线状态失败'
    };
  }
}; 