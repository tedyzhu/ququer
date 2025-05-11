/**
 * 首页逻辑 - 欢迎页面
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    userInfo: {},
    isLoading: true,
    chatId: '', // 当前生成的聊天ID
    inviteSent: false, // 是否已真正发出邀请
    statusBarHeight: 20, // 状态栏高度，默认值
    inviteeJoined: false, // 被邀请者是否已加入
    _currentShareChatId: null // 保存当前的分享ID
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('首页onLoad，携带参数:', options);
    
    // 获取状态栏高度
    this.getStatusBarHeight();
    
    // 处理可能存在的query参数嵌套
    if (options.query && typeof options.query === 'object') {
      console.log('处理嵌套的query参数');
      // 有些场景下，微信会将参数嵌套在query对象中
      if (options.query.inviteId) {
        options.inviteId = options.query.inviteId;
        options.inviter = options.query.inviter || '未知用户';
      }
    }
    
    // 检查登录状态
    if (!this.checkLoginStatus()) {
      console.log('未登录，保存邀请参数后跳转登录页');
      // 未登录时，保存邀请参数到本地存储供登录后使用
      if (options.inviteId && options.inviter) {
        wx.setStorageSync('pendingInvite', {
          inviteId: options.inviteId,
          inviter: options.inviter
        });
        console.log('已保存邀请参数到本地存储');
      }
      
      // 确保跳转到登录页
      wx.redirectTo({
        url: '/pages/login/login',
        success: function() {
          console.log('成功跳转到登录页面');
        },
        fail: function(err) {
          console.error('跳转到登录页面失败:', err);
          // 使用reLaunch作为备选方案
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      });
      return;
    }
    
    // 已登录，处理参数
    this.handleOptions(options);
  },

  /**
   * 处理页面参数
   */
  handleOptions: function(options) {
    console.log('处理首页参数:', options);
    
    // 检查是否有缓存的邀请参数
    const pendingInvite = wx.getStorageSync('pendingInvite');
    if (pendingInvite && pendingInvite.inviteId) {
      console.log('发现缓存的邀请参数:', pendingInvite);
      options.inviteId = pendingInvite.inviteId;
      options.inviter = pendingInvite.inviter;
      
      // 使用后清除缓存
      wx.removeStorageSync('pendingInvite');
    }
    
    // 处理邀请链接
    const { inviteId, inviter } = options;
    if (inviteId) {
      console.log('发现邀请参数，准备跳转到聊天页:', inviteId, inviter);
      // 如果是通过邀请链接进入，直接跳转到对应的聊天
      this.navigateToDirectChat(inviteId, inviter);
    } else {
      console.log('无邀请参数，创建新聊天并显示欢迎界面');
      // 创建聊天ID但不立即跳转
      this.createNewChatId();
      
      // 立即显示欢迎界面
      this.setData({
        isLoading: false
      });
    }
  },

  /**
   * 页面显示时触发
   */
  onShow: function() {
    // 检查是否有缓存的邀请，在登录后的跳转中可能丢失URL参数
    const pendingInvite = wx.getStorageSync('pendingInvite');
    if (pendingInvite && pendingInvite.inviteId) {
      console.log('onShow发现缓存的邀请参数:', pendingInvite);
      this.handleOptions({
        inviteId: pendingInvite.inviteId,
        inviter: pendingInvite.inviter
      });
    }
  },

  /**
   * 获取状态栏高度
   */
  getStatusBarHeight: function() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
  },

  /**
   * 检查登录状态，返回是否已登录
   */
  checkLoginStatus: function () {
    const app = getApp();
    
    // 如果全局状态已经表明已登录，直接返回true
    if (app.globalData.hasLogin && app.globalData.userInfo) {
      console.log('用户已登录(全局状态):', app.globalData.userInfo);
      this.setData({
        userInfo: app.globalData.userInfo
      });
      return true;
    }
    
    try {
      // 先检查本地存储中是否有用户信息
      const storageInfo = wx.getStorageInfoSync();
      if (!storageInfo.keys.includes('userInfo')) {
        console.log('本地存储中没有用户信息，需要登录');
        this.redirectToLogin();
        return false;
      }
      
      // 尝试获取用户信息
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.nickName) {
        console.log('从本地存储获取到用户信息:', userInfo);
        
        // 更新全局状态
        app.globalData.userInfo = userInfo;
        app.globalData.hasLogin = true;
        
        // 更新页面数据
        this.setData({
          userInfo: userInfo
        });
        
        return true;
      } else {
        console.log('本地存储中的用户信息无效');
        this.redirectToLogin();
        return false;
      }
    } catch (error) {
      console.error('检查登录状态出错:', error);
      this.redirectToLogin();
      return false;
    }
  },
  
  /**
   * 重定向到登录页
   */
  redirectToLogin: function() {
    console.log('用户未登录，跳转到登录页');
    wx.redirectTo({
      url: '/pages/login/login',
      fail: function(err) {
        console.error('跳转到登录页面失败:', err);
        // 使用reLaunch作为备选方案
        wx.reLaunch({
          url: '/pages/login/login'
        });
      }
    });
  },

  /**
   * 创建新的聊天ID
   */
  createNewChatId: function() {
    // 生成唯一的聊天ID
    const chatId = 'chat_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
    
    // 保存到数据中
    this.setData({
      chatId: chatId
    });
    
    // 初始化聊天信息
    this.initChatInfo(chatId);
    
    return chatId;
  },
  
  /**
   * 初始化聊天信息
   */
  initChatInfo: function(chatId) {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    // 初始化聊天信息，只包含自己作为参与者
    const chatInfo = {
      id: chatId,
      participants: [{
        id: userInfo.openId || 'user_' + new Date().getTime(),
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        isSelf: true
      }],
      lastActive: new Date().getTime(),
      createdAt: new Date().getTime()
    };
    
    // 保存到全局数据
    this.saveChatInfo(chatId, chatInfo);
  },
  
  /**
   * 保存聊天信息到全局数据
   */
  saveChatInfo: function(chatId, chatInfo) {
    const app = getApp();
    
    // 确保全局chats对象已初始化
    if (!app.globalData.chats) {
      app.globalData.chats = {};
    }
    
    // 保存聊天信息
    app.globalData.chats[chatId] = {
      ...app.globalData.chats[chatId],
      ...chatInfo,
      lastUpdate: new Date().getTime()
    };
    
    console.log('保存聊天信息成功', app.globalData.chats[chatId]);
  },

  /**
   * 通过邀请进入聊天
   */
  navigateToDirectChat: function(chatId, inviterName) {
    console.log('准备跳转到聊天页:', chatId, inviterName);
    
    try {
      // 首先清除loading状态，防止界面卡住
      this.setData({
        isLoading: false
      });
      
      // 检查chatId是否有效
      if (!chatId) {
        console.error('无效的聊天ID');
        wx.showToast({
          title: '无效的邀请链接',
          icon: 'none'
        });
        return;
      }
      
      // 确保聊天信息已初始化，添加当前用户到聊天参与者
      const app = getApp();
      const userInfo = app.globalData.userInfo;
      
      console.log('用户信息:', userInfo);
      console.log('当前全局chats:', app.globalData.chats);
      
      // 直接跳转到聊天页面（不进行复杂的检查，简化流程）
      console.log('直接跳转到聊天页面');
      const url = `/pages/chat/chat?id=${chatId}&inviter=${encodeURIComponent(inviterName || '未知用户')}`;
      console.log('跳转URL:', url);
      
      // 使用redirectTo确保切换页面
      wx.redirectTo({
        url: url,
        success: () => {
          console.log('成功跳转到聊天页面');
        },
        fail: (error) => {
          console.error('跳转失败:', error);
          // 如果redirectTo失败，尝试使用navigateTo
          wx.navigateTo({
            url: url,
            fail: (error2) => {
              console.error('navigateTo也失败:', error2);
              // 最后尝试reLaunch
              wx.reLaunch({
                url: '/pages/home/home'
              });
            }
          });
        }
      });
    } catch (error) {
      console.error('进入聊天过程中出错:', error);
      this.setData({
        isLoading: false
      });
      
      wx.showModal({
        title: '提示',
        content: '进入聊天失败，请重试',
        showCancel: false
      });
    }
  },
  
  /**
   * 直接显示微信分享菜单
   */
  showShareMenu: function() {
    // 确保有聊天ID
    const chatId = this.data.chatId || this.createNewChatId();
    
    // 显示原生分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    });
  },
  
  /**
   * 点击邀请按钮时直接处理分享逻辑
   */
  onShareClick: function() {
    // 确保有聊天ID
    const chatId = this.data.chatId || this.createNewChatId();
    
    // 保存当前的分享ID到全局变量
    this._currentShareChatId = chatId;
    
    // 标记为已发出邀请状态
    this.setData({
      inviteSent: true
    });
    
    // 启动轮询检查被邀请人是否已加入
    this.startCheckingInviteeJoined(chatId);
    
    // 直接调用分享给朋友的API
    if (wx.canIUse('shareAppMessage')) {
      // 注意: 此API仅适用于特定场景，详见微信文档
      // https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareAppMessage.html
      wx.shareAppMessage({
        title: `${getApp().globalData.userInfo.nickName}邀请你加入秘密聊天`,
        path: '/pages/index/index',
        imageUrl: '/assets/images/logo.svg'
      });
    } else {
      // 如果不支持直接分享，则提示用户使用右上角菜单
      wx.showModal({
        title: '邀请提示',
        content: '请点击右上角"..."，选择"转发"来邀请好友',
        showCancel: false
      });
    }
  },
  
  /**
   * 开始检查被邀请人是否已加入
   */
  startCheckingInviteeJoined: function(chatId) {
    // 每5秒检查一次聊天参与者状态
    this.checkInviteeInterval = setInterval(() => {
      this.checkInviteeJoined(chatId);
    }, 5000);
  },
  
  /**
   * 检查被邀请人是否已加入
   */
  checkInviteeJoined: function(chatId) {
    const app = getApp();
    
    // 如果全局没有聊天数据，则跳过
    if (!app.globalData.chats || !app.globalData.chats[chatId]) {
      return;
    }
    
    // 获取聊天参与者
    const chatInfo = app.globalData.chats[chatId];
    const participants = chatInfo.participants || [];
    
    // 如果参与者数量大于1，说明有人加入
    if (participants.length > 1) {
      // 清除定时器
      if (this.checkInviteeInterval) {
        clearInterval(this.checkInviteeInterval);
      }
      
      // 标记为已加入
      this.setData({
        inviteeJoined: true
      });
      
      // 提示用户并自动跳转到聊天页面
      wx.showToast({
        title: '好友已加入，即将进入聊天',
        icon: 'none',
        duration: 1500
      });
      
      // 延迟跳转到聊天页面
      setTimeout(() => {
        this.goToChat();
      }, 1500);
    }
  },
  
  /**
   * 进入聊天页面
   */
  goToChat: function() {
    const chatId = this.data.chatId || this.createNewChatId();
    
    // 跳转到聊天页面
    wx.navigateTo({
      url: `/pages/chat/chat?id=${chatId}&isNewChat=true`
    });
  },

  /**
   * 页面卸载时清除定时器
   */
  onUnload: function() {
    if (this.checkInviteeInterval) {
      clearInterval(this.checkInviteeInterval);
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    // 优先使用保存的分享ID，否则创建新的
    const chatId = this._currentShareChatId || this.data.chatId || this.createNewChatId();
    
    console.log('分享聊天ID:', chatId);
    
    // 标记为已发出邀请
    this.setData({
      inviteSent: true
    });
    
    // 启动轮询检查被邀请人是否已加入
    this.startCheckingInviteeJoined(chatId);
    
    // 使用最简单的分享方式 - 入口页面
    return {
      title: `${userInfo.nickName}邀请你加入秘密聊天`,
      path: '/pages/index/index',  // 使用主入口页面，避免任何参数传递
      imageUrl: '/assets/images/logo.svg'
    };
  }
}) 