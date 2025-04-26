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
  console.log('登录云函数被调用', event);
  
  const wxContext = cloud.getWXContext();
  
  // 获取用户openId和unionId
  const { OPENID, APPID, UNIONID } = wxContext;
  
  // 查询用户是否已存在
  const db = cloud.database();
  const userCollection = db.collection('users');
  
  try {
    // 查询用户记录
    const userRecord = await userCollection.where({
      openId: OPENID
    }).get();
    
    let userId = null;
    
    // 用户不存在，创建用户记录
    if (userRecord.data.length === 0) {
      const result = await userCollection.add({
        data: {
          openId: OPENID,
          unionId: UNIONID || '',
          createTime: db.serverDate(),
          lastLoginTime: db.serverDate(),
          userInfo: event.userInfo || {},
          // 默认系统设置
          settings: {
            destroyTimeout: 10, // 默认10秒销毁
            allowScreenshot: true, // 默认允许截屏
            messageNotification: true // 默认开启消息通知
          }
        }
      });
      
      userId = result._id;
    } else {
      // 用户已存在，更新登录时间
      userId = userRecord.data[0]._id;
      await userCollection.doc(userId).update({
        data: {
          lastLoginTime: db.serverDate(),
          // 如果有新的用户信息，则更新
          ...(event.userInfo ? { userInfo: event.userInfo } : {})
        }
      });
    }
    
    // 返回登录成功信息
    return {
      success: true,
      openId: OPENID,
      unionId: UNIONID,
      userId: userId
    };
  } catch (err) {
    console.error('登录处理出错', err);
    return {
      success: false,
      error: err
    };
  }
}; 