/**
 * 首页
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    hasLogin: false,
    userInfo: null,
    warning: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    // 确保云环境初始化
    this.ensureCloudInit();
    
    // 检查登录状态
    this.checkLoginStatus();
    
    // 检查是否有SharedArrayBuffer警告
    this.checkBrowserWarnings();
  },
  
  /**
   * 确保云环境初始化
   */
  ensureCloudInit: function() {
    const app = getApp();
    if (!app.globalData.cloudInitialized) {
      app.initCloud();
    }
  },
  
  /**
   * 检查登录状态
   */
  checkLoginStatus: function() {
    const app = getApp();
    if (app.globalData.hasLogin && app.globalData.userInfo) {
      this.setData({
        hasLogin: true,
        userInfo: app.globalData.userInfo
      });
      
      // 已登录，延迟跳转到主页
      setTimeout(() => {
        wx.redirectTo({
          url: '/app/pages/home/home'
        });
      }, 800);
    } else {
      this.setData({
        hasLogin: false
      });
      
      // 未登录，延迟跳转到登录页
      setTimeout(() => {
        wx.navigateTo({
          url: '/app/pages/login/login'
        });
      }, 800);
    }
  },
  
  /**
   * 检查是否有浏览器警告信息
   */
  checkBrowserWarnings: function() {
    // 在调试模式下检查SharedArrayBuffer警告
    try {
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      
      if (appBaseInfo.platform === 'devtools') {
        // 仅在开发工具中提示
        this.setData({
          warning: 'SharedArrayBuffer配置已启用，如仍有警告请查看docs/SharedArrayBufferFix.md'
        });
        
        // 3秒后自动清除提示
        setTimeout(() => {
          this.setData({
            warning: null
          });
        }, 3000);
      }
    } catch (err) {
      console.log('获取系统信息出错', err);
    }
  },
  
  /**
   * 跳转到登录页
   */
  goToLogin: function() {
    wx.navigateTo({
      url: '/app/pages/login/login'
    });
  }
}) 