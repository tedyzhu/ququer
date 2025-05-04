// 主入口页面
Page({
  data: {
    loading: true,
    message: '加载中...'
  },
  onLoad: function(options) {
    console.log('🔥 app目录入口页面加载:', options);
    
    // 保存启动参数到本地，便于调试
    wx.setStorageSync('entryOptions', {
      options: options,
      time: new Date().toString(),
      from: 'app_index_page'
    });
    
    // 延迟跳转到登录页
    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/login/login',
        success: () => {
          console.log('🔥 成功跳转到登录页');
        },
        fail: (err) => {
          console.error('🔥 跳转到登录页失败:', err);
          // 尝试从根路径开始跳转
          wx.reLaunch({
            url: '/pages/login/login',
            fail: (err2) => {
              console.error('🔥 reLaunch也失败:', err2);
              this.setData({ 
                loading: false,
                message: '跳转失败，请重启小程序'
              });
            }
          });
        }
      });
    }, 1000);
  }
}) 