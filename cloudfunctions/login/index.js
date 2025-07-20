/**
 * 登录云函数
 * 实现微信登录及获取用户openId
 */
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 登录云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise<Object>} 返回登录结果
 */
exports.main = async (event, context) => {
  console.log('🔥 [login] 云函数被调用，参数:', event);
  
  const wxContext = cloud.getWXContext();
  const db = cloud.database();
  
  // 🔥 确保返回openId
  const userInfo = {
    openId: wxContext.OPENID,
    appId: wxContext.APPID,
    unionId: wxContext.UNIONID,
    ...event
  };
  
  console.log('🔥 [login] 用户信息:', userInfo);
  
  try {
    // 更新用户信息到数据库
    await db.collection('users').doc(wxContext.OPENID).set({
      data: {
        ...userInfo,
        lastLoginTime: db.serverDate()
      }
    });
    
    return {
      success: true,
      userInfo,
      tcbContext: wxContext
    };
  } catch (error) {
    console.error('❌ [login] 错误:', error);
    return {
      success: false,
      error: error.message,
      userInfo,
      tcbContext: wxContext
    };
  }
}; 