App({
  /**
   * 全局数据
   */
  globalData: {
    userInfo: null,
    hasLogin: false,
    conversations: []
  },

  /**
   * 当小程序初始化完成时，会触发 onLaunch（全局只触发一次）
   * @param {Object} options - 启动参数
   */
  onLaunch: function (options) {
    // 初始化云环境
    if (!wx.cloud) {
      console.error('请使用2.2.3或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-9gmp8bcn2dc3576a',
        traceUser: true
      });
      console.log('云环境初始化成功: cloud1-9gmp8bcn2dc3576a');
    }
    
    // 检查登录状态
    this.checkLoginStatus();
    
    // 监听用户截屏事件
    wx.onUserCaptureScreen(() => {
      wx.showModal({
        title: '隐私提醒',
        content: '请尊重隐私，请勿截屏',
        showCancel: false,
        confirmText: '我知道了'
      });
    });
  },

  /**
   * 检查用户是否已登录
   */
  checkLoginStatus: function () {
    const that = this;
    wx.getStorage({
      key: 'userInfo',
      success: function (res) {
        that.globalData.userInfo = res.data;
        that.globalData.hasLogin = true;
        
        // 登录成功后更新云端登录时间
        that.updateUserLoginTime(res.data);
      }
    });
  },
  
  /**
   * 更新用户登录时间
   * @param {Object} userInfo - 用户信息
   */
  updateUserLoginTime: function(userInfo) {
    // 调用云函数更新登录时间
    wx.cloud.callFunction({
      name: 'login',
      data: { userInfo },
      success: res => {
        console.log('更新登录时间成功', res);
      },
      fail: err => {
        console.error('更新登录时间失败', err);
      }
    });
  }
}) 