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
    message: '正在处理邀请...',
    error: ''
  },

  /**
   * 页面加载时执行，处理分享参数
   * @param {Object} options - 页面参数
   */
  onLoad: function(options) {
    console.log('🔗 分享页面加载，参数:', options);
    
    // 保存启动参数到本地，便于调试
    wx.setStorageSync('shareOptions', {
      options: options,
      time: new Date().toString(),
      from: 'app_share_page'
    });
    
    // 处理分享参数
    this.processShareParams(options);
  },
  
  /**
   * 处理分享参数
   */
  processShareParams: function(options) {
    try {
      // 提取参数
      let chatId = options.chatId || options.inviteId || options.id;
      let inviter = options.inviter ? decodeURIComponent(options.inviter) : '朋友';
      let isInvitee = options.isInvitee === 'true';
      
      console.log('🔗 解析参数:', { chatId, inviter, isInvitee });
      
      if (!chatId) {
        this.setData({
          loading: false,
          error: '邀请链接无效，即将跳转...'
        });
        this.redirectToHome();
        return;
      }
      
      // 检查用户是否已登录
      const app = getApp();
      if (!app.globalData.hasLogin || !app.globalData.userInfo) {
        console.log('🔗 用户未登录，保存邀请信息后跳转登录页');
        
        // 保存邀请信息
        wx.setStorageSync('pendingInvite', {
          chatId: chatId,
          inviter: inviter,
          isInvitee: isInvitee,
          timestamp: Date.now(),
          source: 'app_share_page'
        });
        
        this.setData({
          message: `接收到${inviter}的邀请，正在跳转登录...`
        });
        
        this.redirectToLogin();
        return;
      }
      
      // 用户已登录，直接处理邀请
      console.log('🔗 用户已登录，开始加入聊天');
      this.joinChatDirectly(chatId, inviter);
      
    } catch (error) {
      console.error('🔗 处理分享参数出错:', error);
      this.setData({
        loading: false,
        error: '处理邀请出错，正在跳转...'
      });
      this.redirectToHome();
    }
  },
  
  /**
   * 直接加入聊天
   */
  joinChatDirectly: function(chatId, inviter) {
    console.log('🔗 开始加入聊天:', chatId, inviter);
    
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    this.setData({
      message: '正在加入聊天...'
    });
    
    // 调用云函数加入聊天
    wx.cloud.callFunction({
      name: 'joinByInvite',
      data: {
        chatId: chatId,
        joiner: {
          openId: userInfo.openId || app.globalData.openId,
          nickName: userInfo.nickName || '用户',
          avatarUrl: userInfo.avatarUrl
        }
      },
      success: (res) => {
        console.log('🔗 加入聊天结果:', res);
        
        if (res.result && res.result.success) {
          console.log('🔗 加入聊天成功');
          
          // 保存聊天状态到本地存储
          const chatStartedInfo = {
            chatId: chatId,
            chatStarted: true,
            participants: res.result.participants || [],
            joinedAt: new Date().toISOString()
          };
          
          try {
            wx.setStorageSync(`chat_info_${chatId}`, chatStartedInfo);
            console.log('🔗 聊天状态已保存到本地');
          } catch (storageError) {
            console.error('🔗 保存聊天状态失败:', storageError);
          }
          
          this.setData({
            message: '加入成功，正在进入聊天...'
          });
          
          // 跳转到聊天页面
          setTimeout(() => {
            this.navigateToChat(chatId, inviter);
          }, 1000);
        } else {
          console.error('🔗 加入聊天失败:', res.result);
          this.setData({
            message: res.result?.error || '加入聊天失败，正在跳转...'
          });
          
          // 失败时仍然尝试跳转，可能是重复加入
          setTimeout(() => {
            this.navigateToChat(chatId, inviter);
          }, 2000);
        }
      },
      fail: (err) => {
        console.error('🔗 调用加入聊天云函数失败:', err);
        this.setData({
          message: '网络错误，正在跳转...'
        });
        
        // 网络错误时也尝试跳转
        setTimeout(() => {
          this.navigateToChat(chatId, inviter);
        }, 2000);
      }
    });
  },
  
  /**
   * 跳转到聊天页面
   */
  navigateToChat: function(chatId, inviter) {
    const chatUrl = `/app/pages/chat/chat?id=${chatId}&inviter=${encodeURIComponent(inviter)}&chatStarted=true&fromInvite=true`;
    
    wx.redirectTo({
      url: chatUrl,
      success: () => {
        console.log('🔗 成功跳转到聊天页面');
      },
      fail: (err) => {
        console.error('🔗 跳转聊天页面失败，尝试备用方案:', err);
        
        // 备用方案1：使用navigateTo
        wx.navigateTo({
          url: chatUrl,
          fail: (err2) => {
            console.error('🔗 navigateTo也失败，使用reLaunch:', err2);
            
            // 备用方案2：使用reLaunch
            wx.reLaunch({
              url: chatUrl
            });
          }
        });
      }
    });
  },
  
  /**
   * 跳转到登录页面
   */
  redirectToLogin: function() {
    setTimeout(() => {
      wx.reLaunch({
        url: '/app/pages/login/login',
        success: () => {
          console.log('🔗 成功跳转到登录页');
        },
        fail: (err) => {
          console.error('🔗 跳转登录页失败:', err);
          // 备用路径
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      });
    }, 1500);
  },
  
  /**
   * 跳转到首页
   */
  redirectToHome: function() {
    setTimeout(() => {
      wx.reLaunch({
        url: '/app/pages/home/home',
        success: () => {
          console.log('🔗 成功跳转到首页');
        },
        fail: (err) => {
          console.error('🔗 跳转首页失败:', err);
          // 备用路径
          wx.reLaunch({
            url: '/pages/home/home'
          });
        }
      });
    }, 1500);
  }
}); 