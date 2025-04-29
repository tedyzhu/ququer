/**
 * 登录云函数
 * 实现微信登录及获取用户openId
 */
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: 'cloud1-9gmp8bcn2dc3576a'
});

/**
 * 登录云函数入口
 * @param {Object} event - 云函数调用参数
 * @param {Object} context - 云函数调用上下文
 * @returns {Promise<Object>} 返回登录结果
 */
exports.main = async (event, context) => {
  console.log('登录云函数被调用，参数:', event);
  
  try {
    // 获取微信上下文
    const wxContext = cloud.getWXContext();
    console.log('获取到的微信上下文:', wxContext);
    
    if (!wxContext || !wxContext.OPENID) {
      console.error('无法获取微信上下文或openId为空');
      return {
        success: false,
        error: {
          message: '无法获取用户标识',
          detail: '微信上下文获取失败'
        }
      };
    }
    
    // 获取用户openId和unionId
    const { OPENID, APPID, UNIONID } = wxContext;
    console.log('获取到用户openId:', OPENID);
    
    // 检查数据库是否存在
    const db = cloud.database();
    
    try {
      // 检查users集合是否存在，如果不存在则创建
      try {
        const collections = await db.collections();
        const collectionNames = collections.data.map(collection => collection.name);
        if (!collectionNames.includes('users')) {
          console.log('users集合不存在，准备创建');
          // 在某些云环境中可能无法动态创建集合，这里仅作为提示
          console.warn('请在云开发控制台手动创建users集合');
        } else {
          console.log('users集合已存在，继续处理');
        }
      } catch (colErr) {
        console.error('检查集合出错', colErr);
        // 忽略错误，继续尝试使用集合
      }
      
      const userCollection = db.collection('users');
      
      // 查询用户记录
      const userRecord = await userCollection.where({
        openId: OPENID
      }).get();
      
      console.log('查询用户记录结果:', userRecord);
      
      let userId = null;
      
      // 用户不存在，创建用户记录
      if (userRecord.data.length === 0) {
        console.log('用户不存在，创建新用户');
        const userData = {
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
        };
        
        console.log('准备创建用户数据:', userData);
        
        try {
          const result = await userCollection.add({
            data: userData
          });
          
          console.log('创建用户结果:', result);
          userId = result._id;
        } catch (addErr) {
          console.error('创建用户记录失败', addErr);
          return {
            success: false,
            error: {
              message: '创建用户失败',
              detail: addErr
            }
          };
        }
      } else {
        // 用户已存在，更新登录时间
        userId = userRecord.data[0]._id;
        console.log('用户已存在，更新登录时间，用户ID:', userId);
        
        const updateData = {
          lastLoginTime: db.serverDate()
        };
        
        // 如果有新的用户信息，则更新
        if (event.userInfo) {
          updateData.userInfo = event.userInfo;
        }
        
        console.log('准备更新用户数据:', updateData);
        
        try {
          await userCollection.doc(userId).update({
            data: updateData
          });
        } catch (updateErr) {
          console.error('更新用户记录失败', updateErr);
          // 更新失败不影响登录，继续返回用户数据
        }
      }
      
      // 返回登录成功信息
      const response = {
        success: true,
        openId: OPENID,
        unionId: UNIONID || '',
        userId: userId
      };
      
      console.log('返回登录成功信息:', response);
      return response;
      
    } catch (dbErr) {
      console.error('数据库操作出错', dbErr);
      return {
        success: false,
        error: {
          message: '数据库操作失败',
          detail: dbErr
        }
      };
    }
  } catch (err) {
    console.error('登录处理出错', err);
    return {
      success: false,
      error: {
        message: '服务器内部错误',
        detail: err
      }
    };
  }
}; 