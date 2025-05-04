App({
  /**
   * 全局数据
   */
  globalData: {
    userInfo: null,
    hasLogin: false,
    conversations: [],
    cloudInitialized: false,
    openId: '', // 用户openId
    chats: {} // 存储聊天信息
  },

  /**
   * 当小程序初始化完成时，会触发 onLaunch（全局只触发一次）
   * @param {Object} options - 启动参数
   */
  onLaunch: function (options) {
    console.log('小程序启动，参数:', options);
    
    // 初始化云环境
    this.initCloud();
    
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
    
    // 监听网络状态变化
    wx.onNetworkStatusChange((res) => {
      console.log('网络状态变化, 当前是否连接:', res.isConnected);
      if (res.isConnected && !this.globalData.cloudInitialized) {
        // 当网络恢复且云环境未初始化时，重新初始化
        this.initCloud();
      }
    });
  },
  
  /**
   * 初始化云环境
   * @returns {boolean} 初始化是否成功
   */
  initCloud: function() {
    console.log('尝试初始化云环境');
    
    // 如果已经初始化过，直接返回true
    if (this.globalData.cloudInitialized) {
      console.log('云环境已经初始化过，跳过');
      return true;
    }
    
    if (!wx.cloud) {
      console.error('请使用2.2.3或以上的基础库以使用云能力');
      return false;
    } else {
      try {
        console.log('开始初始化云环境 cloud1-9gmp8bcn2dc3576a');
        wx.cloud.init({
          env: 'cloud1-9gmp8bcn2dc3576a',
          traceUser: true
        });
        console.log('云环境初始化成功: cloud1-9gmp8bcn2dc3576a');
        this.globalData.cloudInitialized = true;
        return true;
      } catch (e) {
        console.error('云环境初始化失败', e);
        
        // 设置延迟重试
        setTimeout(() => {
          if (!this.globalData.cloudInitialized) {
            console.log('尝试重新初始化云环境');
            this.initCloud();
          }
        }, 3000);
        
        return false;
      }
    }
  },

  /**
   * 检查用户是否已登录
   */
  checkLoginStatus: function () {
    console.log('检查登录状态');
    
    const that = this;
    
    // 先检查是否有openId
    wx.getStorage({
      key: 'openId',
      success: function (res) {
        console.log('获取到openId:', res.data);
        that.globalData.openId = res.data;
        
        // 再获取用户信息
        wx.getStorage({
          key: 'userInfo',
          success: function (res) {
            console.log('获取到用户信息:', res.data);
            that.globalData.userInfo = res.data;
            that.globalData.hasLogin = true;
            
            // 确保用户信息中包含openId
            if (!that.globalData.userInfo.openId && that.globalData.openId) {
              that.globalData.userInfo.openId = that.globalData.openId;
              
              // 更新存储
              wx.setStorage({
                key: 'userInfo',
                data: that.globalData.userInfo
              });
            }
            
            // 登录成功后更新云端登录时间
            that.updateUserLoginTime(res.data);
          },
          fail: function (err) {
            console.log('获取用户信息失败:', err);
            // 清除可能存在的部分登录状态
            that.cleanLoginStatus();
          }
        });
      },
      fail: function (err) {
        console.log('获取openId失败:', err);
        // 清除可能存在的部分登录状态
        that.cleanLoginStatus();
      }
    });
  },
  
  /**
   * 清除登录状态
   */
  cleanLoginStatus: function() {
    console.log('清除登录状态');
    this.globalData.userInfo = null;
    this.globalData.hasLogin = false;
    this.globalData.openId = '';
    
    try {
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('openId');
    } catch (e) {
      console.error('清除存储失败', e);
    }
  },
  
  /**
   * 更新用户登录时间
   * @param {Object} userInfo - 用户信息
   */
  updateUserLoginTime: function(userInfo) {
    // 调用云函数更新登录时间
    if (!this.globalData.cloudInitialized) {
      console.log('云环境未初始化，不更新登录时间');
      return;
    }
    
    console.log('调用云函数更新登录时间');
    wx.cloud.callFunction({
      name: 'login',
      data: { userInfo },
      success: res => {
        console.log('更新登录时间成功', res);
        
        // 如果返回了openId，保存起来
        if (res.result && res.result.openId) {
          this.globalData.openId = res.result.openId;
          
          // 存储到本地以便下次使用
          wx.setStorage({
            key: 'openId',
            data: res.result.openId
          });
          
          // 确保用户信息中也包含openId
          if (this.globalData.userInfo && !this.globalData.userInfo.openId) {
            this.globalData.userInfo.openId = res.result.openId;
            
            // 更新存储
            wx.setStorage({
              key: 'userInfo',
              data: this.globalData.userInfo
            });
          }
        }
      },
      fail: err => {
        console.error('更新登录时间失败', err);
      }
    });
  },
  
  /**
   * 获取指定聊天的信息
   * @param {String} chatId - 聊天ID
   * @returns {Object} 聊天信息，若不存在则返回null
   */
  getChatInfo: function(chatId) {
    if (this.globalData.chats && this.globalData.chats[chatId]) {
      return this.globalData.chats[chatId];
    }
    return null;
  }
}) 