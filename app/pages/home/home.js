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
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('首页加载，参数:', options);
    // 检查是否从分享链接进入
    if (options.inviteId) {
      console.log('通过邀请链接进入，邀请ID:', options.inviteId);
      this.setData({
        conversationId: options.inviteId,
        directJoin: options.directJoin === 'true' // 是否要直接加入聊天
      });
      
      // 标记为受邀用户
      wx.setStorageSync('isInvited', true);
      wx.setStorageSync('inviteId', options.inviteId);
      
      // 如果用户还未登录，需要先去登录
      const app = getApp();
      if (!app.globalData.hasLogin) {
        wx.redirectTo({
          url: '../login/login'
        });
        return;
      }
    }
    
    // 检查登录状态
    this.checkLoginStatus();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 已登录状态下检查是否有未处理的邀请
    const app = getApp();
    if (app.globalData.hasLogin) {
      this.checkInvitation();
    }
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
    // wx.cloud.callFunction 实现...
    
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
      this.setData({
        conversationId: conversationId,
        hasInvitation: true
      });
    }
    
    return {
      title: `${app.globalData.userInfo.nickName}邀请你加入蛐曲儿私密聊天`,
      path: `/pages/home/home?inviteId=${conversationId}`,
      imageUrl: '/assets/images/logo.svg'
    };
  }
}); 