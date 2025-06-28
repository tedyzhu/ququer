const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 调试用户数据库信息
 */
exports.main = async (event, context) => {
  console.log('🔍 debugUserDatabase 被调用');
  
  try {
    // 查询所有用户信息
    const usersResult = await db.collection('users').get();
    
    console.log('🔍 用户数据库查询结果:', usersResult.data);
    
    // 格式化输出
    const formattedUsers = usersResult.data.map(user => ({
      _id: user._id,
      openId: user.openId,
      昵称字段: user.nickName,
      用户信息昵称: user.userInfo?.nickName,
      头像: user.avatarUrl,
      用户信息头像: user.userInfo?.avatarUrl,
      创建时间: user.createTime,
      更新时间: user.updateTime
    }));
    
    return {
      success: true,
      totalUsers: usersResult.data.length,
      users: formattedUsers,
      rawData: usersResult.data
    };
    
  } catch (error) {
    console.error('🔍 调试用户数据库失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}; 