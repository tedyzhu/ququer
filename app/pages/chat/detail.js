/**
 * 聊天详情页面逻辑
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    chatId: '',
    participants: [],
    messageSound: true,
    messageNotification: true,
    stickOnTop: false,
    isLoading: true,
    chatName: '' // 聊天名称
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const { id } = options;
    
    if (!id) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    this.setData({
      chatId: id
    });
    
    // 加载聊天参与者信息
    this.loadChatInfo();
  },

  /**
   * 加载聊天信息和参与者
   */
  loadChatInfo: function() {
    // 模拟加载参与者信息
    // 在实际应用中，应该从云数据库加载
    setTimeout(() => {
      const app = getApp();
      const currentUser = app.globalData.userInfo;
      
      // 从全局数据获取聊天信息
      let participants = [];
      let chatName = '';
      
      if (app.globalData.chats && app.globalData.chats[this.data.chatId]) {
        const chatInfo = app.globalData.chats[this.data.chatId];
        participants = chatInfo.participants || [];
        chatName = chatInfo.name || '';
      } else {
        // 如果全局数据中没有，创建模拟数据
        participants = [
          {
            id: currentUser.openId,
            nickName: currentUser.nickName,
            avatarUrl: currentUser.avatarUrl,
            isSelf: true
          }
        ];
      }
      
      this.setData({
        participants: participants,
        chatName: chatName,
        isLoading: false
      });
    }, 500);
  },

  /**
   * 添加好友到聊天
   */
  addParticipant: function() {
    // 这里调用小程序的分享功能，让用户分享小程序
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    });
  },

  /**
   * 更改聊天名称
   */
  changeChatName: function() {
    wx.showModal({
      title: '更改聊天名称',
      editable: true,
      placeholderText: '请输入聊天名称',
      content: this.data.chatName,
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.setData({
            chatName: res.content.trim()
          });
          
          // 保存聊天名称到全局数据
          const app = getApp();
          if (app.globalData.chats && app.globalData.chats[this.data.chatId]) {
            app.globalData.chats[this.data.chatId].name = res.content.trim();
          }
          
          wx.showToast({
            title: '名称已更新',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 切换消息提示音
   */
  toggleMessageSound: function() {
    this.setData({
      messageSound: !this.data.messageSound
    });
  },

  /**
   * 切换消息通知
   */
  toggleMessageNotification: function() {
    this.setData({
      messageNotification: !this.data.messageNotification
    });
  },

  /**
   * 切换置顶聊天
   */
  toggleStickOnTop: function() {
    this.setData({
      stickOnTop: !this.data.stickOnTop
    });
  },

  /**
   * 清空聊天记录
   */
  clearChatHistory: function() {
    wx.showModal({
      title: '清空聊天记录',
      content: '确定要清空所有聊天记录吗？此操作无法撤销。',
      confirmText: '清空',
      confirmColor: '#FF0000',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '已清空聊天记录',
            icon: 'success'
          });
          
          // 这里应该调用云函数清空聊天记录
          // 这里只是模拟
        }
      }
    });
  },

  /**
   * 设置聊天背景
   */
  setChatBackground: function() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  /**
   * 投诉
   */
  reportIssue: function() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  /**
   * 返回聊天页面并通知更新
   */
  navigateBackToChat: function() {
    // 更新页面需要的参数
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2]; // 上一个页面
    
    // 调用上一页的刷新参与者方法
    if (prevPage && prevPage.checkParticipantsUpdate) {
      prevPage.checkParticipantsUpdate();
    }
    
    wx.navigateBack();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    return {
      title: '加入我的秘密聊天',
      path: '/pages/share/share?id=' + this.data.chatId,
      imageUrl: '/assets/images/logo.svg'
    };
  }
}) 