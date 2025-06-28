// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 更新会话参与者信息
 * @param {Object} event - 云函数事件参数
 * @param {string} event.chatId - 聊天ID
 * @param {Array} event.participants - 参与者列表
 */
exports.main = async (event, context) => {
  const { chatId, participants } = event;
  
  console.log('🔧 [更新参与者] 开始更新conversations集合，chatId:', chatId);
  console.log('🔧 [更新参与者] 参与者列表:', participants);
  
  try {
    if (!chatId || !participants || !Array.isArray(participants)) {
      return {
        success: false,
        error: '参数不完整'
      };
    }

    // 更新conversations集合中的participants字段
    const updateResult = await db.collection('conversations')
      .doc(chatId)
      .update({
        data: {
          participants: participants,
          lastUpdate: db.serverDate(),
          participantCount: participants.length
        }
      });
    
    console.log('🔧 [更新参与者] 更新结果:', updateResult);
    
    if (updateResult.stats && updateResult.stats.updated > 0) {
      console.log('🔧 [更新参与者] ✅ 参与者信息更新成功');
      return {
        success: true,
        updatedCount: updateResult.stats.updated
      };
    } else {
      console.log('🔧 [更新参与者] ❌ 没有文档被更新，可能聊天不存在');
      return {
        success: false,
        error: '聊天不存在或更新失败'
      };
    }
    
  } catch (error) {
    console.error('🔧 [更新参与者] 错误:', error);
    return {
      success: false,
      error: error.message
    };
  }
}; 