/**
 * 分享页面
 * 用于处理小程序分享链接进入的场景
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    loading: true,
    message: '正在加载分享内容...',
    shareId: '',
    error: ''
  },

  /**
   * 页面加载时执行，处理分享参数
   * @param {Object} options - 页面参数
   */
  onLoad: function(options) {
    console.log('分享页面加载，参数:', options);
    
    // 保存启动参数到本地，便于调试
    wx.setStorageSync('shareOptions', {
      options: options,
      time: new Date().toString(),
      from: 'share_page'
    });
    
    // 获取分享ID
    const shareId = options.id || '';
    
    if (!shareId) {
      this.setData({
        loading: false,
        error: '无效的分享链接'
      });
      
      // 无效分享ID，3秒后跳转到首页
      setTimeout(() => {
        wx.reLaunch({
          url: '/app/pages/index/index',
          fail: (err) => {
            console.error('跳转到首页失败:', err);
            // 尝试备用路径
            wx.reLaunch({
              url: '../index/index'
            });
          }
        });
      }, 3000);
      
      return;
    }
    
    this.setData({ shareId });
    
    // 检查登录状态
    const app = getApp();
    if (!app.globalData.hasLogin) {
      console.log('用户未登录，跳转到登录页');
      
      // 将分享ID存储到本地，以便登录后恢复
      wx.setStorageSync('pendingShareId', shareId);
      
      // 跳转到登录页
      wx.reLaunch({
        url: '/app/pages/login/login',
        fail: (err) => {
          console.error('跳转到登录页失败:', err);
          // 尝试备用路径
          wx.reLaunch({
            url: '../login/login'
          });
        }
      });
      
      return;
    }
    
    // 用户已登录，直接处理分享
    this.processShare(shareId);
  },
  
  /**
   * 处理分享ID，打开对应聊天
   * @param {String} shareId - 分享ID
   */
  processShare: function(shareId) {
    console.log('处理分享ID:', shareId);
    
    // TODO: 根据实际业务逻辑处理分享ID
    // 这里简单示例，直接跳转到聊天页面
    wx.navigateTo({
      url: '/app/pages/chat/chat?id=' + shareId,
      success: () => {
        console.log('成功跳转到聊天页面');
      },
      fail: (error) => {
        console.error('跳转到聊天页面失败:', error);
        // 尝试备用路径
        wx.navigateTo({
          url: '../chat/chat?id=' + shareId,
          success: () => {
            console.log('使用相对路径成功跳转到聊天页面');
          },
          fail: (error2) => {
            console.error('备用路径跳转也失败:', error2);
            this.setData({
              loading: false,
              error: '无法打开聊天: ' + error2.errMsg
            });
          }
        });
      }
    });
  }
}); 