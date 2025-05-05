/**
 * 登录页面逻辑
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {},
    avatarUrl: '',
    nickName: '',
    submitting: false,
    isDebugMode: false // 调试模式开关
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('登录页面加载，参数:', options);
    
    // 检查入口类型、场景值和参数
    const scene = options.scene || getApp().globalData.launchOptions?.scene || '未知场景';
    console.log('小程序启动场景:', scene);
    console.log('完整启动参数:', getApp().globalData.launchOptions);
    
    // 尝试提取所有可能的参数来源
    console.log('options直接参数:', options);
    console.log('options.query:', options.query);
    console.log('referrerInfo:', options.referrerInfo);
    
    // 处理邀请参数
    if (options.inviteId && options.inviter) {
      console.log('发现直接邀请参数，保存到存储:', options);
      wx.setStorageSync('pendingInvite', {
        inviteId: options.inviteId,
        inviter: options.inviter
      });
    } 
    // 从extraData中提取
    else if (options.referrerInfo && options.referrerInfo.extraData) {
      console.log('从extraData中提取邀请参数:', options.referrerInfo.extraData);
      if (options.referrerInfo.extraData.inviteId) {
        wx.setStorageSync('pendingInvite', {
          inviteId: options.referrerInfo.extraData.inviteId,
          inviter: options.referrerInfo.extraData.inviter || '朋友'
        });
      }
    }
    
    // 显示当前邀请状态
    const pendingInvite = wx.getStorageSync('pendingInvite');
    if (pendingInvite && pendingInvite.inviteId) {
      console.log('当前存在待处理邀请:', pendingInvite);
    } else {
      console.log('没有待处理的邀请');
    }
    
    // 检查是否已登录
    this.checkLoginStatus();
    
    // 云环境初始化
    const app = getApp();
    if (app.initCloud && typeof app.initCloud === 'function') {
      if (app.initCloud()) {
        console.log('云环境已初始化');
      }
    }
    
    // 检查是否开启调试模式
    this.checkDebugMode();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('登录页面显示');
    
    // 尝试从app.js的全局变量中读取启动参数
    const app = getApp();
    if (app.globalData.launchOptions) {
      const options = app.globalData.launchOptions;
      console.log('从全局变量读取启动参数:', options);
      
      // 提取并保存可能的邀请参数
      this.processStartupParams(options);
    }
  },
  
  /**
   * 处理启动参数
   */
  processStartupParams: function(options) {
    // 从各种可能的来源提取邀请参数
    let inviteId = null;
    let inviter = null;
    
    // 1. 直接参数
    if (options.inviteId) {
      inviteId = options.inviteId;
      inviter = options.inviter;
    }
    // 2. query对象
    else if (options.query) {
      if (typeof options.query === 'object') {
        inviteId = options.query.inviteId;
        inviter = options.query.inviter;
      } 
    }
    // 3. extraData
    else if (options.referrerInfo && options.referrerInfo.extraData) {
      inviteId = options.referrerInfo.extraData.inviteId;
      inviter = options.referrerInfo.extraData.inviter;
    }
    
    // 保存有效的邀请参数
    if (inviteId) {
      console.log('处理启动参数成功提取邀请信息:', {inviteId, inviter});
      wx.setStorageSync('pendingInvite', {
        inviteId: inviteId,
        inviter: inviter || '朋友'
      });
    }
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus: function() {
    const app = getApp();
    if (app.globalData.hasLogin) {
      console.log('用户已登录，跳转到首页');
      this.redirectToHome();
    }
  },

  /**
   * 检查是否开启调试模式
   */
  checkDebugMode: function() {
    try {
      // 在开发环境中可以开启调试模式
      // 或者连续点击10次昵称输入框也会开启
      const systemInfo = wx.getSystemInfoSync();
      if (systemInfo.platform === 'devtools') {
        this.setData({
          isDebugMode: true
        });
      }
    } catch (e) {
      console.error('获取系统信息失败', e);
    }
  },

  /**
   * 清除存储(调试功能)
   */
  debugClearStorage: function() {
    try {
      wx.clearStorageSync();
      wx.showToast({
        title: '存储已清除',
        icon: 'success'
      });
      
      // 重置全局数据
      const app = getApp();
      app.globalData.userInfo = null;
      app.globalData.hasLogin = false;
      app.globalData.openId = '';
      app.globalData.cloudInitialized = false;
      
      console.log('存储和全局数据已重置');
    } catch (e) {
      console.error('清除存储失败', e);
      wx.showToast({
        title: '清除失败',
        icon: 'error'
      });
    }
  },

  /**
   * 重新初始化云环境(调试功能)
   */
  debugReInitCloud: function() {
    const app = getApp();
    if (app.initCloud && typeof app.initCloud === 'function') {
      // 先重置初始化状态
      app.globalData.cloudInitialized = false;
      
      if (app.initCloud()) {
        wx.showToast({
          title: '云环境已重新初始化',
          icon: 'success'
        });
      } else {
        wx.showToast({
          title: '重新初始化失败',
          icon: 'error'
        });
      }
    } else {
      wx.showToast({
        title: '初始化方法不存在',
        icon: 'error'
      });
    }
  },

  /**
   * 获取用户头像
   * @param {Object} e - 事件对象
   */
  onChooseAvatar: function(e) {
    const { avatarUrl } = e.detail;
    this.setData({
      avatarUrl: avatarUrl
    });
  },

  /**
   * 处理昵称输入
   * @param {Object} e - 事件对象
   */
  onNickNameInput: function(e) {
    this.setData({
      nickName: e.detail.value
    });
  },

  /**
   * 提交表单，进行登录
   * @param {Object} e - 事件对象
   */
  onFormSubmit: function(e) {
    // 防止重复提交
    if (this.data.submitting) {
      return;
    }
    
    // 设置提交中状态
    this.setData({
      submitting: true
    });
    
    // 获取表单数据
    const { nickName } = this.data;
    let { avatarUrl } = this.data;
    
    // 简单的表单验证
    if (!nickName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      });
      this.setData({ submitting: false });
      return;
    }
    
    if (!avatarUrl) {
      // 如果用户未选择头像，使用默认头像
      avatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242L3M4EnjhT8l8cubIgL8F7nM7YhnHR7R0FnsPO0Cdua8ZrOeYuwibLw1ohEJCQKfTgNw/0';
    }
    
    // 构建用户信息
    const userInfo = {
      nickName: nickName,
      avatarUrl: avatarUrl
    };
    
    console.log('准备调用登录云函数，发送数据:', userInfo);
    
    // 确保云环境已初始化
    const app = getApp();
    if (app.initCloud && typeof app.initCloud === 'function') {
      app.initCloud();
    }
    
    // 调用云函数进行登录
    wx.cloud.callFunction({
      name: 'login',
      data: {
        userInfo: userInfo
      },
      success: res => {
        console.log('登录云函数调用成功，完整响应:', res);
        
        if (!res.result) {
          console.error('登录失败，返回结果为空');
          this.handleLoginFailure(userInfo);
          return;
        }
        
        console.log('登录云函数返回结果:', res.result);
        
        // 获取云函数返回的用户唯一标识openId
        let openId = '';
        
        // 优先从result.openId获取
        if (res.result.openId) {
          openId = res.result.openId;
          console.log('从result.openId获取到openId:', openId);
        } 
        // 然后尝试从tcbContext获取
        else if (res.result.tcbContext && res.result.tcbContext.OPENID) {
          openId = res.result.tcbContext.OPENID;
          console.log('从tcbContext.OPENID获取到openId:', openId);
        }
        // 最后尝试从模拟登录结果获取
        else if (res.result.simulated) {
          console.log('使用模拟登录返回的openId');
          openId = res.result.openId || ('simulator_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9));
        }
        
        // 检查是否成功获取openId
        if (!openId) {
          console.warn('未能获取有效的openId，生成模拟ID');
          // 使用时间戳加随机数模拟一个唯一ID
          openId = 'simulator_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
          console.log('生成模拟openId:', openId);
        }
        
        // 保存用户信息到本地存储和全局数据
        this.saveUserInfo(userInfo, openId);
        
        // 跳转到首页
        this.redirectToHome();
      },
      fail: err => {
        console.error('登录云函数调用失败:', err);
        this.handleLoginFailure(userInfo);
      },
      complete: () => {
        // 无论成功失败，都取消提交状态
        this.setData({ submitting: false });
      }
    });
  },
  
  /**
   * 处理登录失败情况
   * @param {Object} userInfo - 用户信息
   */
  handleLoginFailure: function(userInfo) {
    // 使用本地模拟登录
    console.warn('尝试使用本地模拟登录');
    
    // 生成模拟openId
    const mockOpenId = 'local_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
    console.log('生成本地模拟openId:', mockOpenId);
    
    // 保存模拟信息
    this.saveUserInfo(userInfo, mockOpenId);
    
    // 提示用户
    wx.showToast({
      title: '使用离线模式登录',
      icon: 'none',
      duration: 2000
    });
    
    // 延迟后跳转到首页
    setTimeout(() => {
      this.redirectToHome();
    }, 1000);
  },

  /**
   * 保存用户信息
   * @param {Object} userInfo - 用户信息
   * @param {String} openId - 用户的唯一标识
   */
  saveUserInfo: function(userInfo, openId) {
    const app = getApp();
    
    // 添加openId到用户信息
    userInfo.openId = openId;
    
    // 保存到全局数据
    app.globalData.userInfo = userInfo;
    app.globalData.hasLogin = true;
    app.globalData.openId = openId;
    
    console.log('用户信息已存储到全局数据', app.globalData);
    
    // 保存到本地存储
    wx.setStorage({
      key: 'userInfo',
      data: userInfo
    });
    
    console.log('用户信息已存储到本地存储');
    
    // 存储openId
    wx.setStorage({
      key: 'openId',
      data: openId
    });
  },

  /**
   * 跳转到首页
   */
  redirectToHome: function() {
    console.log('登录成功，准备跳转页面');
    
    // 检查是否有等待处理的邀请
    const pendingInvite = wx.getStorageSync('pendingInvite');
    
    // 如果有邀请信息，直接跳转到聊天页面
    if (pendingInvite && pendingInvite.inviteId) {
      console.log('发现待处理的邀请，直接跳转到聊天页面:', pendingInvite);
      
      // 构建跳转URL
      const url = `/pages/chat/chat?id=${pendingInvite.inviteId}&inviter=${encodeURIComponent(pendingInvite.inviter || '朋友')}`;
      
      // 使用reLaunch跳转
      wx.reLaunch({
        url: url,
        success: () => {
          console.log('成功跳转到聊天页面');
          
          // 不要立即清除pendingInvite，让聊天页面处理完成后再清除
          setTimeout(() => {
            wx.removeStorageSync('pendingInvite');
          }, 5000);
        },
        fail: (err) => {
          console.error('跳转到聊天页面失败:', err);
          
          // 如果跳转失败，尝试使用navigateTo
          wx.navigateTo({
            url: url,
            fail: (err2) => {
              console.error('navigateTo也失败:', err2);
              
              // 最后尝试跳转到首页
              wx.reLaunch({
                url: '/pages/home/home'
              });
            }
          });
        }
      });
    } else {
      // 没有邀请，跳转到首页
      console.log('没有待处理的邀请，跳转到首页');
      wx.reLaunch({
        url: '/pages/home/home',
        success: () => {
          console.log('成功跳转到首页');
        },
        fail: (err) => {
          console.error('跳转到首页失败:', err);
          // 如果跳转失败，尝试使用navigateTo
          wx.navigateTo({
            url: '/pages/home/home'
          });
        }
      });
    }
  }
}) 