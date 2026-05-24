/**
 * 更新用户信息云函数
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: 'cloud1-d8g0b5fni24b9cb89'
});

const db = cloud.database();

exports.main = async (event, context) => {
  console.log('👤 updateUserInfo被调用:', event);
  
  try {
    const wxContext = cloud.getWXContext();
    const userId = event.openId || wxContext.OPENID;
    const userInfo = event.userInfo || {};
    
    if (!userId) {
      return {
        success: false,
        error: '缺少用户ID'
      };
    }
    
    console.log('👤 更新用户信息:', { userId, userInfo });
    
    // 查找是否已存在该用户
    const existingUser = await db.collection('users')
      .where({ openId: userId })
      .limit(1)
      .get();
    
    const userData = {
      openId: userId,
      nickName: userInfo.nickName || '用户',
      avatarUrl: userInfo.avatarUrl || '/assets/images/default-avatar.png',
      updateTime: db.serverDate()
    };
    
    if (existingUser.data && existingUser.data.length > 0) {
      // 更新现有用户
      await db.collection('users')
        .doc(existingUser.data[0]._id)
        .update({
          data: {
            nickName: userData.nickName,
            avatarUrl: userData.avatarUrl,
            updateTime: userData.updateTime,
            userInfo: userData // 兼容性字段
          }
        });
      
      console.log('👤 用户信息更新成功');
    } else {
      // 创建新用户
      await db.collection('users')
        .add({
          data: {
            ...userData,
            createTime: db.serverDate(),
            userInfo: userData // 兼容性字段
          }
        });
      
      console.log('👤 新用户创建成功');
    }
    
    return {
      success: true,
      userData: userData
    };
    
  } catch (error) {
    console.error('👤 更新用户信息失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}; 