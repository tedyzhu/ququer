/**
 * 首页/欢迎页面逻辑
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    userInfo: {},
    isLoading: true,
    hasInvitation: false, // 是否已发出邀请
    conversationStarted: false, // 是否已开始对话
    partnerName: '', // 对话伙伴昵称
    messages: [], // 消息列表
    inputContent: '', // 输入框内容
    conversationId: '', // 会话ID
    directJoin: false, // 是否直接加入聊天
    friendJoined: false, // 朋友是否已加入
    friendName: '', // 朋友昵称
    checkJoinTimer: null, // 检查朋友加入的定时器
    chatStarted: false // 聊天是否已开始
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('首页加载，参数:', options);
    
    // 获取应用实例
    const app = getApp();
    
    // 首先检查登录状态，未登录直接跳转登录页
    if (!app.globalData.hasLogin) {
      console.log('用户未登录，保存邀请参数后跳转到登录页');
      
      // 如果有邀请ID参数，保存起来以便登录后使用
      if (options.inviteId) {
        // 保存邀请参数
        app.saveInviteInfo(options.inviteId, options.inviter || '朋友');
        console.log('已保存邀请ID:', options.inviteId);
      }
      
      // 跳转到登录页
      wx.redirectTo({
        url: '../login/login',
        fail: (err) => {
          console.error('跳转登录页失败，尝试备用路径:', err);
          wx.redirectTo({
            url: '/pages/login/login',
            fail: (err2) => {
              console.error('备用路径也失败:', err2);
              wx.reLaunch({
                url: '/app/pages/login/login'
              });
            }
          });
        }
      });
      return;
    }
    
    // 以下是登录用户的处理逻辑
    
    // 检查是否从分享链接进入
    if (options.inviteId) {
      console.log('通过邀请链接进入，邀请ID:', options.inviteId);
      this.setData({
        conversationId: options.inviteId,
        directJoin: true
      });
      
      // 保存邀请信息到storage
      wx.setStorageSync('isInvited', true);
      wx.setStorageSync('inviteId', options.inviteId);
    }
    
    // 更新UI状态
    this.setData({
      userInfo: app.globalData.userInfo,
      isLoading: false
    });
    
    // 检查是否有聊天邀请需要处理
    this.checkInvitation();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    console.log('[生命周期] onShow，当前状态:', {
      hasInvitation: this.data.hasInvitation,
      friendJoined: this.data.friendJoined,
      chatStarted: this.data.chatStarted,
      conversationId: this.data.conversationId
    });
    
    // 已登录状态下检查是否有未处理的邀请
    const app = getApp();
    if (app.globalData.hasLogin) {
      this.checkInvitation();
      
      // 如果已发送邀请但朋友还未加入或未开始聊天，启动轮询
      if (this.data.hasInvitation && (!this.data.friendJoined || !this.data.chatStarted)) {
        console.log('[生命周期] 已发送邀请但未完成，启动轮询');
        this.startCheckFriendJoinedTimer();
      } else if (this.data.hasInvitation) {
        console.log('[生命周期] 已完成邀请流程，无需轮询');
      } else {
        console.log('[生命周期] 未发送邀请，无需轮询');
      }
    }
  },
  
  /**
   * 页面隐藏时停止轮询
   */
  onHide: function() {
    this.stopCheckFriendJoinedTimer();
  },
  
  /**
   * 页面卸载时停止轮询
   */
  onUnload: function() {
    this.stopCheckFriendJoinedTimer();
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus: function () {
    const app = getApp();
    if (!app.globalData.hasLogin) {
      console.log('用户未登录，跳转到登录页');
      wx.redirectTo({
        url: '../login/login'
      });
      return;
    }
    
    console.log('用户已登录', app.globalData.userInfo);
    this.setData({
      userInfo: app.globalData.userInfo,
      isLoading: false
    });
    
    // 如果需要直接加入聊天，立即处理邀请
    if (this.data.directJoin && this.data.conversationId) {
      console.log('直接加入聊天:', this.data.conversationId);
      this.joinConversation(this.data.conversationId);
    }
  },
  
  /**
   * 检查是否有邀请需要处理
   */
  checkInvitation: function() {
    // 如果已经直接处理了邀请，就不再重复处理
    if (this.data.directJoin && this.data.conversationStarted) {
      console.log('已直接加入聊天，不再重复处理邀请');
      return;
    }
    
    const isInvited = wx.getStorageSync('isInvited');
    const inviteId = wx.getStorageSync('inviteId');
    
    if (isInvited && inviteId) {
      console.log('处理邀请，ID:', inviteId);
      this.joinConversation(inviteId);
      
      // 清除邀请标记，避免重复处理
      wx.removeStorageSync('isInvited');
    }
  },
  
  /**
   * 加入会话
   */
  joinConversation: function(inviteId) {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    // 模拟加入会话的过程
    // 实际项目中应该调用云函数处理
    setTimeout(() => {
      this.setData({
        conversationStarted: true,
        partnerName: '向冬', // 实际应从服务器获取对方昵称
        conversationId: inviteId,
        messages: [
          {
            id: Date.now(),
            content: '你好，欢迎加入蛐曲儿~',
            isSelf: false,
            timestamp: new Date().toISOString()
          }
        ]
      });
      
      console.log('成功加入会话:', inviteId);
      
      // 通知对方已加入会话
      this.notifyPartnerJoined(inviteId, userInfo);
    }, 1000);
  },
  
  /**
   * 通知对方已加入会话
   */
  notifyPartnerJoined: function(conversationId, userInfo) {
    // 这里应该调用云函数通知对方
    console.log('通知对方已加入会话:', conversationId, userInfo);
    
    // 调用云函数通知邀请者
    wx.cloud.callFunction({
      name: 'notifyJoined',
      data: {
        conversationId: conversationId,
        userName: userInfo.nickName || '用户'
      },
      success: res => {
        console.log('成功通知对方已加入:', res);
      },
      fail: err => {
        console.error('通知对方失败:', err);
      }
    });
    
    // 模拟对方收到通知后的响应
    setTimeout(() => {
      if (this.data.messages.length === 1) {
        // 添加一条来自对方的消息
        const messages = this.data.messages.concat({
          id: Date.now(),
          content: '很高兴你能加入，开始聊天吧！',
          isSelf: false,
          timestamp: new Date().toISOString()
        });
        
        this.setData({ messages });
      }
    }, 2000);
  },
  
  /**
   * 开始定时检查朋友是否已加入
   */
  startCheckFriendJoinedTimer: function() {
    console.log('[轮询] 开始检查朋友是否已加入');
    
    // 清除可能存在的旧定时器
    this.stopCheckFriendJoinedTimer();
    
    // 创建新的定时器，每1秒检查一次
    const timerID = setInterval(() => {
      console.log('[轮询] 定时检查触发');
      this.checkFriendJoined();
    }, 1000);
    
    // 保存定时器ID
    this.setData({
      checkJoinTimer: timerID
    });
    
    // 立即执行一次检查
    this.checkFriendJoined();
    
    console.log('[轮询] 轮询启动完成，TimerID:', timerID);
  },
  
  /**
   * 停止检查朋友是否已加入的定时器
   */
  stopCheckFriendJoinedTimer: function() {
    console.log('[轮询] 尝试停止轮询, TimerID:', this.data.checkJoinTimer);
    
    if (this.data.checkJoinTimer) {
      clearInterval(this.data.checkJoinTimer);
      
      this.setData({
        checkJoinTimer: null
      });
      
      console.log('[轮询] 轮询已停止');
    }
  },
  
  /**
   * 检查朋友是否已加入
   */
  checkFriendJoined: function() {
    // 如果朋友已加入或没有邀请，不需要检查
    if ((this.data.friendJoined && this.data.chatStarted) || !this.data.conversationId) {
      console.log('[检查] 跳过检查：', this.data.friendJoined, this.data.chatStarted, this.data.conversationId);
      return;
    }
    
    console.log('[检查] 检查朋友是否已加入:', this.data.conversationId);
    
    // 调用云函数检查朋友是否已加入
    wx.cloud.callFunction({
      name: 'checkChatStatus',
      data: {
        chatId: this.data.conversationId
      },
      success: res => {
        console.log('[检查] 检查结果:', JSON.stringify(res.result));
        
        if (res.result && res.result.joined && !this.data.friendJoined) {
          console.log('[检查] 朋友已加入，更新状态');
          // 朋友已加入但状态未更新
          this.setData({
            friendJoined: true,
            friendName: res.result.friendName || '朋友'
          });
          
          // 播放提示音或震动提醒用户
          wx.vibrateShort();
        }
        
        // 检查是否已开始聊天
        if (res.result && res.result.chatStarted) {
          console.log('[检查] 检测到对方已开始聊天，准备自动跳转');
          console.log('[检查] 详细信息:', {
            chatStartedBy: res.result.chatStartedBy,
            chatStartedByName: res.result.chatStartedByName
          });
          
          // 更新状态
          this.setData({
            chatStarted: true
          });
          
          // 停止轮询
          this.stopCheckFriendJoinedTimer();
          
          // 添加短暂延迟，确保UI更新后再跳转
          setTimeout(() => {
            console.log('[检查] 准备跳转到聊天页面');
            
            // 获取跳转参数 - 始终使用id和inviter参数
            const inviterParam = encodeURIComponent(res.result.chatStartedByName || this.data.friendName || '朋友');
            
            // 自动跳转到聊天页面，使用正确的参数格式
            const chatUrls = [
              `/pages/chat/chat?id=${this.data.conversationId}&inviter=${inviterParam}`,
              `../chat/chat?id=${this.data.conversationId}&inviter=${inviterParam}`,
              `/app/pages/chat/chat?id=${this.data.conversationId}&inviter=${inviterParam}`
            ];
            
            console.log('[检查] 准备跳转URL:', chatUrls[0]);
            
            wx.showToast({
              title: '聊天已开始，即将进入',
              icon: 'none',
              duration: 1500
            });
            
            // 短暂延迟后跳转
            setTimeout(() => {
              console.log('[检查] 执行跳转:', chatUrls[0]);
              this.tryNavigateToUrls(chatUrls, 0);
            }, 1000);
          }, 500);
        } else {
          console.log('[检查] 聊天尚未开始，继续等待');
        }
      },
      fail: err => {
        console.error('[检查] 检查朋友是否加入失败:', err);
      }
    });
  },
  
  /**
   * 开始聊天
   */
  startChat: function() {
    if (!this.data.conversationId) {
      wx.showToast({
        title: '聊天ID不存在',
        icon: 'none'
      });
      return;
    }
    
    console.log('[开始聊天] 准备开始聊天:', this.data.conversationId);
    
    // 显示loading
    wx.showLoading({
      title: '正在开始聊天...',
      mask: true
    });
    
    // 先确保聊天记录已创建
    this.ensureChatCreated(() => {
      // 聊天已创建，继续通知邀请者开始聊天
      this.notifyStartConversation();
    });
  },
  
  /**
   * 确保聊天记录已创建
   */
  ensureChatCreated: function(callback) {
    console.log('[创建聊天] 确保聊天记录已创建');
    
    // 调用云函数创建聊天（如果不存在）
    wx.cloud.callFunction({
      name: 'createChat',
      data: {
        chatId: this.data.conversationId,
        message: `${this.data.userInfo.nickName || '用户'}加入了聊天`
      },
      success: res => {
        console.log('[创建聊天] 创建聊天结果:', JSON.stringify(res.result));
        
        if (res.result && (res.result.success || res.result.exists)) {
          // 聊天创建成功或已存在
          if (typeof callback === 'function') {
            callback();
          }
        } else {
          // 创建失败
          wx.hideLoading();
          wx.showToast({
            title: '创建聊天失败，请重试',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('[创建聊天] 创建聊天失败:', JSON.stringify(err));
        
        wx.hideLoading();
        wx.showToast({
          title: '创建聊天失败，请重试',
          icon: 'none'
        });
      }
    });
  },
  
  /**
   * 通知邀请者开始聊天
   */
  notifyStartConversation: function() {
    console.log('[开始聊天] 通知邀请者已准备好开始聊天');
    
    // 调用云函数通知邀请者
    wx.cloud.callFunction({
      name: 'startConversation',
      data: {
        conversationId: this.data.conversationId,
        userName: this.data.userInfo.nickName || '用户'
      },
      success: res => {
        console.log('[开始聊天] 成功通知邀请者开始聊天:', JSON.stringify(res.result));
        
        // 隐藏loading
        wx.hideLoading();
        
        // 更新本地状态
        this.setData({
          chatStarted: true
        });
        
        // 获取跳转参数，确保格式一致，使用安全编码
        const encoding = require('../../app/utils/encoding.js');
        const nickname = encoding.safeEncodeNickname(this.data.userInfo.nickName || '用户');
        
        console.log('[开始聊天] 当前用户昵称:', this.data.userInfo.nickName, '编码后:', nickname);
        
        // 跳转到聊天页面，使用id和inviter参数，参数顺序与checkFriendJoined保持一致
        const chatUrls = [
          `/pages/chat/chat?id=${this.data.conversationId}&inviter=${nickname}`,
          `../chat/chat?id=${this.data.conversationId}&inviter=${nickname}`,
          `/app/pages/chat/chat?id=${this.data.conversationId}&inviter=${nickname}`
        ];
        
        console.log('[开始聊天] 尝试跳转到:', chatUrls[0]);
        
        // 使用通用的URL跳转方法
        this.tryNavigateToUrls(chatUrls, 0);
      },
      fail: err => {
        console.error('[开始聊天] 通知邀请者失败:', JSON.stringify(err));
        
        // 隐藏loading
        wx.hideLoading();
        
        // 根据错误类型显示不同的提示
        if (err.errCode === -404) {
          wx.showToast({
            title: '云函数不存在，请检查部署',
            icon: 'none',
            duration: 2000
          });
          return;
        }
        
        wx.showToast({
          title: '通知失败，但仍继续进入聊天',
          icon: 'none',
          duration: 2000
        });
        
        // 获取跳转参数，确保格式一致
        const nickname = encodeURIComponent(this.data.userInfo.nickName || '用户');
        
        // 即使通知失败也继续跳转，保持相同的URL参数顺序
        const chatUrls = [
          `/pages/chat/chat?id=${this.data.conversationId}&inviter=${nickname}`,
          `../chat/chat?id=${this.data.conversationId}&inviter=${nickname}`,
          `/app/pages/chat/chat?id=${this.data.conversationId}&inviter=${nickname}`
        ];
        
        this.tryNavigateToUrls(chatUrls, 0);
      }
    });
  },
  
  /**
   * 递归尝试URL列表
   */
  tryNavigateToUrls: function(urls, index) {
    console.log('[跳转] 尝试跳转，当前索引:', index, '目标URL:', urls[index]);
    
    if (index >= urls.length) {
      console.error('[跳转] 所有URL都失败了');
      wx.showToast({
        title: '无法跳转到聊天页面',
        icon: 'none'
      });
      return;
    }
    
    const currentUrl = urls[index];
    
    // 先尝试navigateTo（保留当前页面，跳转到新页）
    wx.navigateTo({
      url: currentUrl,
      success: () => {
        console.log('[跳转] navigateTo成功:', currentUrl);
      },
      fail: (err) => {
        console.error('[跳转] navigateTo失败:', err);
        
        // 如果navigateTo失败，尝试redirectTo（关闭当前页面，跳转到新页面）
        wx.redirectTo({
          url: currentUrl,
          success: () => {
            console.log('[跳转] redirectTo成功:', currentUrl);
          },
          fail: (redirectErr) => {
            console.error('[跳转] redirectTo也失败:', redirectErr);
            
            // 如果redirectTo也失败，尝试reLaunch（关闭所有页面，打开新页面）
            wx.reLaunch({
              url: currentUrl,
              success: () => {
                console.log('[跳转] reLaunch成功:', currentUrl);
              },
              fail: (reLaunchErr) => {
                console.error('[跳转] 所有方式都失败:', reLaunchErr);
                
                // 尝试下一个URL
                this.tryNavigateToUrls(urls, index + 1);
              }
            });
          }
        });
      }
    });
  },
  
  /**
   * 响应输入框内容变化
   */
  onInputChange: function(e) {
    this.setData({
      inputContent: e.detail.value
    });
  },
  
  /**
   * 发送消息
   */
  sendMessage: function() {
    const content = this.data.inputContent.trim();
    if (!content) return;
    
    // 创建消息对象
    const message = {
      id: Date.now(),
      content: content,
      isSelf: true,
      timestamp: new Date().toISOString()
    };
    
    // 添加到本地消息列表
    const messages = this.data.messages;
    messages.push(message);
    
    this.setData({
      messages: messages,
      inputContent: '' // 清空输入框
    });
    
    // 发送消息到服务器
    this.sendMessageToServer(message);
  },
  
  /**
   * 将消息发送到服务器
   */
  sendMessageToServer: function(message) {
    // 这里调用云函数发送消息
    console.log('发送消息到服务器:', message);
    // wx.cloud.callFunction 实现...
    
    // 模拟对方收到消息后的回复
    if (Math.random() > 0.5) { // 50%概率回复
      setTimeout(() => {
        const reply = {
          id: Date.now(),
          content: '收到你的消息了！',
          isSelf: false,
          timestamp: new Date().toISOString()
        };
        
        const messages = this.data.messages.concat(reply);
        this.setData({ messages });
      }, 1500 + Math.random() * 1000); // 随机1.5-2.5秒回复
    }
  },
  
  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const app = getApp();
    let conversationId = this.data.conversationId;
    
    // 如果没有会话ID，创建一个新的
    if (!conversationId) {
      conversationId = 'invite_' + Date.now() + '_' + app.globalData.userInfo.nickName;
      console.log('[分享] 创建新的会话ID:', conversationId);
      
      this.setData({
        conversationId: conversationId,
        hasInvitation: true,
        friendJoined: false,
        chatStarted: false
      });
      
      // 开始检查朋友是否加入
      console.log('[分享] 启动轮询检查朋友是否加入');
      this.startCheckFriendJoinedTimer();
    }
    
      const userNickname = app.globalData.userInfo.nickName || '用户';
  const shareTitle = `${userNickname}邀请你加入蛐曲儿私密聊天`;
  
  // 🔥 修复：直接跳转到新版聊天页面，简化分享流程
  const sharePath = `/app/pages/chat/chat?id=${conversationId}&inviter=${encodeURIComponent(userNickname)}&fromInvite=true`;
  
  console.log('[分享] 分享链接:', {
    title: shareTitle, 
    path: sharePath,
    conversationId: conversationId,
    inviter: userNickname
  });
    
    return {
      title: shareTitle,
      path: sharePath,
      imageUrl: '/assets/images/logo.svg'
    };
  }
}); 