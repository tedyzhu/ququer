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
    _currentShareChatId: null, // 保存当前的分享ID
    shareStatus: '', // 分享状态文本
    shareProgress: 0 // 分享进度 0-100
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
    wx.showModal({
      title: '邀请好友',
      content: '请点击右上角的"..."菜单，选择"转发"来邀请好友加入聊天',
      showCancel: false,
      confirmText: '我知道了'
    });
  },
  
  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function() {
    console.log('🎯 用户点击右上角分享');
    
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    const nickName = userInfo.nickName || '好友';
    
    // 创建新的聊天ID用于分享
    const shareCreatedChatId = 'chat_share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    console.log('🎯 创建分享聊天ID:', shareCreatedChatId);
    
    // 更新状态 - 开始创建邀请
    this.setData({
      inviteSent: false,
      chatId: shareCreatedChatId,
      _currentShareChatId: shareCreatedChatId,
      shareStatus: '正在创建邀请...',
      shareProgress: 25
    });
    
    // 立即调用云函数创建邀请
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: shareCreatedChatId,
        inviter: {
          openId: app.globalData.openId || userInfo.openId,
          nickName: nickName,
          avatarUrl: userInfo.avatarUrl
        }
      },
      success: (res) => {
        console.log('🎯 创建邀请成功:', res.result);
        
        if (res.result && res.result.success) {
          console.log('🎯 邀请创建成功，启动监听');
          
          // 标记为已发出邀请
          this.setData({
            inviteSent: true,
            shareStatus: '邀请创建成功，等待好友加入...',
            shareProgress: 50
          });
          
          // 启动监听被邀请者加入
          this.startCheckingInviteeJoined(shareCreatedChatId);
        } else {
          // 创建失败
          this.setData({
            shareStatus: '创建邀请失败，请重试',
            shareProgress: 0
          });
        }
      },
      fail: (err) => {
        console.error('🎯 创建邀请失败:', err);
        this.setData({
          shareStatus: '网络错误，请重试',
          shareProgress: 0
        });
      }
    });
    
    // 🔥 修复：统一跳转到新版聊天页面，确保连接建立
    return {
      title: `${nickName}邀请你进行私密聊天`,
      path: `/app/pages/chat/chat?id=${shareCreatedChatId}&inviter=${encodeURIComponent(nickName)}&fromInvite=true`,
      imageUrl: '/assets/images/logo.png',
      success: (res) => {
        console.log('🎯 分享成功！');
        this.setData({
          shareStatus: '分享成功，等待好友加入...',
          shareProgress: 75
        });
        wx.showToast({
          title: '分享成功！',
          icon: 'success',
          duration: 2000
        });
      },
      fail: (err) => {
        console.error('🎯 分享失败:', err);
        this.setData({
          inviteSent: false,
          shareStatus: '分享失败，请重试',
          shareProgress: 0
        });
      }
    };
  },

  /**
   * 开始检查被邀请人是否已加入（使用云数据库实时监听）
   */
  startCheckingInviteeJoined: function(chatId) {
    console.log('🎯 开始监听被邀请人加入:', chatId);
    
    // 清除之前的监听器
    if (this.inviteeWatcher) {
      this.inviteeWatcher.close();
    }
    
    // 初始化分享开始时间
    this.shareStartTime = Date.now();
    
    try {
      // 使用云数据库实时监听
      const db = wx.cloud.database();
      this.inviteeWatcher = db.collection('conversations')
        .doc(chatId)
        .watch({
          onChange: snapshot => {
            console.log('🎯 监听到聊天状态变化:', snapshot);
            
            if (snapshot.docChanges && snapshot.docChanges.length > 0) {
              const chatData = snapshot.docChanges[0].doc;
              const participants = chatData.participants || [];
              const chatStatus = chatData.status;
              const chatStarted = chatData.chatStarted;
              
              console.log('🎯 状态检查:', {
                participantsCount: participants.length,
                chatStatus: chatStatus,
                chatStarted: chatStarted
              });
              
              // 🔥 如果聊天已开始或有多个参与者或状态为active
              if (participants.length > 1 || chatStatus === 'active' || chatStarted === true) {
                console.log('🎯 检测到聊天已开始');
                
                // 保存聊天状态到本地
                try {
                  const chatStartedInfo = {
                    chatId: chatId,
                    chatStarted: true,
                    participants: participants,
                    startedAt: new Date().toISOString()
                  };
                  wx.setStorageSync(`chat_info_${chatId}`, chatStartedInfo);
                  console.log('🎯 聊天状态已保存到本地');
                } catch (storageError) {
                  console.error('🎯 保存聊天状态失败:', storageError);
                }
                
                // 标记为已加入
                this.setData({
                  inviteeJoined: true,
                  shareStatus: '好友已加入，即将进入聊天',
                  shareProgress: 100
                });
                
                // 关闭监听
                this.inviteeWatcher.close();
                this.inviteeWatcher = null;
                
                // 提示用户并自动跳转
                wx.showToast({
                  title: '好友已加入！',
                  icon: 'success',
                  duration: 1500
                });
                
                setTimeout(() => {
                  this.goToChat(chatId);
                }, 1500);
              } else {
                // 更新等待时间
                const elapsed = Math.floor((Date.now() - this.shareStartTime) / 1000);
                if (elapsed > 5) {
                  this.setData({
                    shareStatus: `等待好友加入中 (${elapsed}秒)...`,
                    shareProgress: 75
                  });
                }
              }
            }
          },
          onError: err => {
            console.error('🎯 监听出错:', err);
            // 出错时回退到轮询
            this.fallbackToPolling(chatId);
          }
        });
    } catch (err) {
      console.error('🎯 设置监听失败:', err);
      // 设置失败时回退到轮询
      this.fallbackToPolling(chatId);
    }
  },

  /**
   * 回退到轮询机制
   */
  fallbackToPolling: function(chatId) {
    console.log('🎯 回退到轮询机制');
    
    // 清除可能存在的定时器
    if (this.checkInviteeInterval) {
      clearInterval(this.checkInviteeInterval);
    }
    
    // 每5秒检查一次
    this.checkInviteeInterval = setInterval(() => {
      this.checkInviteeJoined(chatId);
    }, 5000);
  },

  /**
   * 检查被邀请人是否已加入（轮询方式）
   */
  checkInviteeJoined: function(chatId) {
    console.log('🎯 轮询检查被邀请人状态:', chatId);
    
    // 从云数据库查询最新状态
    wx.cloud.database().collection('conversations')
      .doc(chatId)
      .get()
      .then(res => {
        if (res.data) {
          const participants = res.data.participants || [];
          const chatStatus = res.data.status;
          const chatStarted = res.data.chatStarted;
          
          console.log('🎯 轮询状态检查:', {
            participantsCount: participants.length,
            chatStatus: chatStatus,
            chatStarted: chatStarted
          });
          
          if (participants.length > 1 || chatStatus === 'active' || chatStarted === true) {
            console.log('🎯 轮询检测到聊天已开始');
            
            // 清除定时器
            if (this.checkInviteeInterval) {
              clearInterval(this.checkInviteeInterval);
              this.checkInviteeInterval = null;
            }
            
            // 标记为已加入
            this.setData({
              inviteeJoined: true
            });
            
            // 提示并跳转
            wx.showToast({
              title: '好友已加入！',
              icon: 'success',
              duration: 1500
            });
            
            setTimeout(() => {
              this.goToChat(chatId);
            }, 1500);
          }
        }
      })
      .catch(err => {
        console.error('🎯 查询聊天状态失败:', err);
      });
  },

  /**
   * 按钮点击进入聊天（处理点击事件）
   */
  enterChat: function(e) {
    console.log('🎯 点击进入聊天按钮');
    console.log('🎯 当前页面数据状态:', {
      chatId: this.data.chatId,
      _currentShareChatId: this.data._currentShareChatId,
      inviteSent: this.data.inviteSent,
      inviteeJoined: this.data.inviteeJoined
    });
    
    // 从数据中获取聊天ID
    const targetChatId = this.data.chatId || this.data._currentShareChatId;
    
    if (!targetChatId) {
      console.error('🎯 无效的聊天ID，数据状态:', {
        chatId: this.data.chatId,
        _currentShareChatId: this.data._currentShareChatId
      });
      wx.showToast({
        title: '聊天ID获取失败',
        icon: 'error'
      });
      return;
    }
    
    // 验证聊天ID的有效性
    if (typeof targetChatId !== 'string' || targetChatId.length < 5) {
      console.error('🎯 聊天ID格式无效:', targetChatId);
      wx.showToast({
        title: '聊天ID格式错误',
        icon: 'error'
      });
      return;
    }
    
    console.log('🎯 使用聊天ID进入聊天:', targetChatId);
    this.goToChat(targetChatId);
  },

  /**
   * 进入聊天页面
   */
  goToChat: function(chatId) {
    const targetChatId = chatId || this.data.chatId || this.data._currentShareChatId;
    
    if (!targetChatId) {
      console.error('🎯 无效的聊天ID');
      return;
    }
    
    console.log('🎯 准备进入聊天:', targetChatId);
    
    // 清除分享状态
    this.setData({
      inviteSent: false,
      inviteeJoined: false,
      shareStatus: '',
      shareProgress: 0
    });
    
    // 清除监听器和定时器
    if (this.inviteeWatcher) {
      this.inviteeWatcher.close();
      this.inviteeWatcher = null;
    }
    
    if (this.checkInviteeInterval) {
      clearInterval(this.checkInviteeInterval);
      this.checkInviteeInterval = null;
    }
    
    // 跳转到聊天页面
    wx.navigateTo({
      url: `/pages/chat/chat?id=${targetChatId}&chatStarted=true`,
      success: () => {
        console.log('🎯 成功进入聊天');
      },
      fail: (err) => {
        console.error('🎯 跳转聊天失败:', err);
        // 备用方案
        wx.redirectTo({
          url: `/pages/chat/chat?id=${targetChatId}&chatStarted=true`
        });
      }
    });
  },

  /**
   * 测试分享功能
   */
  testShare: function() {
    console.log('🧪 测试分享功能');
    
    // 模拟分享过程
    const testChatId = 'chat_test_' + Date.now();
    
    this.setData({
      shareStatus: '测试分享功能...',
      shareProgress: 50,
      chatId: testChatId,
      _currentShareChatId: testChatId
    });
    
    // 3秒后模拟好友加入
    setTimeout(() => {
      this.setData({
        inviteSent: true,
        inviteeJoined: true,
        shareStatus: '测试完成！好友已加入',
        shareProgress: 100
      });
      
      wx.showToast({
        title: '测试成功！',
        icon: 'success'
      });
    }, 3000);
  },

  /**
   * 页面卸载时清除定时器
   */
  onUnload: function() {
    console.log('🎯 页面卸载，清理资源');
    
    // 清除定时器
    if (this.checkInviteeInterval) {
      clearInterval(this.checkInviteeInterval);
      this.checkInviteeInterval = null;
    }
    
    // 关闭数据库监听
    if (this.inviteeWatcher) {
      this.inviteeWatcher.close();
      this.inviteeWatcher = null;
    }
  },
}) 