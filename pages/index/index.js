// 主入口页面
Page({
  data: {
    loading: true,
    message: '加载中...'
  },
  onLoad: function(options) {
    console.log('🔥 入口页面加载:', options);
    
    // 保存启动参数到本地，便于调试
    wx.setStorageSync('entryOptions', {
      options: options,
      time: new Date().toString()
    });
    
    // 延迟跳转到登录页
    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/login/login',
        success: () => {
          console.log('🔥 跳转到登录页成功');
        },
        fail: (err) => {
          console.error('🔥 跳转到登录页失败:', err);
          this.setData({ 
            loading: false,
            message: '跳转失败，请重启小程序'
          });
        }
      });
    }, 1000);
  }
}) 