/**
 * 销毁消息云函数
 * 用于处理阅后即焚消息的销毁逻辑
 */
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 销毁消息云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise<Object>} 返回销毁结果
 */
exports.main = async (event, context) => {
  console.log('🔥 destroyMessage云函数被调用:', event);
  
  // 参数验证
  if (!event.messageId) {
    console.error('❌ 参数不完整:', event);
    return {
      success: false,
      error: '参数不完整，需要messageId'
    };
  }
  
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  
  console.log('✅ 参数验证通过，userId:', userId);
  
  // 初始化数据库
  const db = cloud.database();
  
  try {
    console.log('🗑️ 准备销毁消息:', event.messageId);
    
    // 更新消息状态为已销毁
    const updateResult = await db.collection('messages').doc(event.messageId).update({
      data: {
        destroyed: true,
        destroyTime: db.serverDate(),
        content: '[已销毁]',
        status: 'destroyed'
      }
    });
    
    console.log('✅ 消息销毁成功:', updateResult);
    
    return {
      success: true,
      messageId: event.messageId,
      destroyTime: Date.now()
    };
  } catch (err) {
    console.error('❌ 销毁消息出错:', err);
    return {
      success: false,
      error: err.message || '销毁消息失败'
    };
  }
};