/**
 * 聊天页面逻辑
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    chatId: '',
    contactName: '',
    contactAvatar: '',
    messages: [],
    inputValue: '',
    scrollTop: 0,
    isLoading: true,
    scrollIntoView: '',
    destroyTimeout: 10, // 默认10秒销毁
    showDestroyTimer: false,
    destroyTimerText: '',
    participants: [], // 聊天参与者
    isNewChat: false, // 是否是新建的聊天
    chatName: '', // 聊天名称
    showWelcomeHint: false // 是否显示欢迎提示
  },

  /**
   * 生命周期函数--监听页面加载
   * @param {Object} options - 页面参数
   */
  onLoad: function (options) {
    console.log('聊天页onLoad，携带参数:', options);
    
    // 立即结束加载状态，避免界面卡在loading
    this.setData({
      isLoading: false
    });
    
    const { id, isNewChat, inviter } = options;
    
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
    
    // 获取当前用户信息
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    // 确保云环境已初始化
    if (app.initCloud && typeof app.initCloud === 'function') {
      app.initCloud();
    }
    
    // 确保全局chats对象已初始化
    if (!app.globalData.chats) {
      app.globalData.chats = {};
    }
    
    let isJoiningExistingChat = false;
    let initialParticipants = [];
    
    // 简化聊天初始化逻辑
    // 1. 检查聊天是否存在
    const existingChat = app.globalData.chats[id];
    
    if (existingChat && existingChat.participants && existingChat.participants.length > 0) {
      console.log('聊天已存在，参与者:', existingChat.participants);
      
      // 处理现有参与者，标记自己
      initialParticipants = existingChat.participants.map(p => {
        if (p.id === userInfo.openId || (userInfo.nickName && p.nickName === userInfo.nickName)) {
          return {...p, isSelf: true};
        }
        return {...p, isSelf: false};
      });
      
      // 检查当前用户是否已在参与者列表中
      const currentUserInChat = initialParticipants.some(p => p.isSelf);
      
      if (!currentUserInChat) {
        console.log('当前用户不在聊天参与者中，添加');
        isJoiningExistingChat = true;
        
        // 添加当前用户
        initialParticipants.push({
          id: userInfo.openId || 'user_' + new Date().getTime(),
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          isSelf: true
        });
      }
    } else {
      console.log('聊天不存在，创建新聊天');
      
      // 创建新聊天，添加自己作为参与者
      initialParticipants = [{
        id: userInfo.openId || 'user_' + new Date().getTime(),
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        isSelf: true
      }];
      
      // 如果是通过邀请进入，添加邀请者
      if (inviter) {
        initialParticipants.push({
          id: 'inviter_' + new Date().getTime(),
          nickName: decodeURIComponent(inviter),
          avatarUrl: '/assets/images/avatar1.png',
          isSelf: false
        });
      }
    }
    
    console.log('最终参与者列表:', initialParticipants);
    
    // 设置页面数据
    this.setData({
      chatId: id,
      isNewChat: isNewChat === 'true',
      participants: initialParticipants,
      contactName: inviter ? decodeURIComponent(inviter) : '',
      showWelcomeHint: isJoiningExistingChat
    });
    
    // 更新全局聊天信息
    app.globalData.chats[id] = {
      id: id,
      participants: initialParticipants,
      lastActive: new Date().getTime(),
      createdAt: existingChat ? existingChat.createdAt : new Date().getTime()
    };
    
    // 更新导航栏标题
    this.updateNavigationBarTitle();
    
    // 加载聊天记录
    this.loadMessages();
    
    // 设置右上角按钮，开启分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    });
  },
  
  /**
   * 保存聊天信息到全局或云数据库
   */
  saveChatInfo: function() {
    console.log('保存聊天信息');
    
    try {
      // 在实际应用中，这里应该保存聊天信息到云数据库
      // 目前只简单保存到全局数据作为演示
      const app = getApp();
      
      // 确保全局chats对象已初始化
      if (!app.globalData.chats) {
        app.globalData.chats = {};
      }
      
      // 保存聊天信息
      app.globalData.chats[this.data.chatId] = {
        ...app.globalData.chats[this.data.chatId],
        id: this.data.chatId,
        participants: this.data.participants,
        name: this.data.chatName,
        lastActive: new Date().getTime()
      };
      
      console.log('聊天信息已保存:', app.globalData.chats[this.data.chatId]);
    } catch (error) {
      console.error('保存聊天信息失败:', error);
    }
  },

  /**
   * 更新导航栏标题
   */
  updateNavigationBarTitle: function() {
    let title = this.data.chatName || '秘信聊天';
    
    // 如果有聊天名称，直接使用
    if (this.data.chatName) {
      title = this.data.chatName;
    } 
    // 如果是一对一聊天，显示对方名称
    else if (this.data.participants.length === 2) {
      // 找到非自己的参与者
      const otherParticipant = this.data.participants.find(p => !p.isSelf);
      if (otherParticipant) {
        title = otherParticipant.nickName;
      }
    } 
    // 如果是多人聊天，显示人数
    else if (this.data.participants.length > 2) {
      title = `${this.data.participants.length}人聊天`;
    }
    
    wx.setNavigationBarTitle({
      title: title
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('聊天页面显示');
    
    // 保存聊天信息到全局数据
    this.saveChatInfo();
    
    // 每次页面显示时检查是否有新参与者加入
    this.checkParticipantsUpdate();
  },
  
  /**
   * 检查参与者是否有更新
   */
  checkParticipantsUpdate: function() {
    // 在实际应用中，这里应该从云数据库获取最新的参与者列表
    // 目前从全局数据获取作为演示
    const app = getApp();
    if (app.globalData.chats && app.globalData.chats[this.data.chatId]) {
      const chatInfo = app.globalData.chats[this.data.chatId];
      
      // 如果聊天名称已更新，也更新
      if (chatInfo.name && chatInfo.name !== this.data.chatName) {
        this.setData({
          chatName: chatInfo.name
        });
      }
      
      // 如果参与者有变化，更新数据
      if (chatInfo.participants) {
        const currentIds = this.data.participants.map(p => p.id);
        const newIds = chatInfo.participants.map(p => p.id);
        
        // 检查是否有新增或减少的参与者
        const hasChanges = currentIds.length !== newIds.length || 
                          newIds.some(id => !currentIds.includes(id));
        
        if (hasChanges) {
          // 将现有的isSelf标记保留到新的参与者列表
          const updatedParticipants = chatInfo.participants.map(p => {
            const existingParticipant = this.data.participants.find(ep => ep.id === p.id);
            if (existingParticipant) {
              return {...p, isSelf: existingParticipant.isSelf};
            }
            return p;
          });
          
          this.setData({
            participants: updatedParticipants
          });
          
          // 如果有新参与者加入，显示系统消息
          if (newIds.length > currentIds.length) {
            const newParticipants = chatInfo.participants.filter(
              p => !currentIds.includes(p.id)
            );
            
            if (newParticipants.length > 0) {
              this.addSystemMessage(`${newParticipants.map(p => p.nickName).join('、')} 加入了聊天`);
            }
          }
        }
      }
      
      // 更新导航栏标题
      this.updateNavigationBarTitle();
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    // 刷新聊天记录
    this.loadMessages();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载聊天记录
   */
  loadMessages: function() {
    console.log('加载聊天记录');
    
    // 直接加载消息，不使用延迟
    const mockMessages = this.getMockMessages();
    
    this.setData({
      isLoading: false,
      messages: mockMessages,
      scrollIntoView: mockMessages.length > 0 ? `msg-${mockMessages.length - 1}` : ''
    });
    
    // 如果是新用户加入聊天，直接显示欢迎消息
    if (this.data.showWelcomeHint) {
      this.addSystemMessage('欢迎加入聊天，历史消息不可见，新消息将在查看后销毁');
      this.setData({
        showWelcomeHint: false
      });
    }
  },
  
  /**
   * 添加系统消息
   */
  addSystemMessage: function(content) {
    const { messages } = this.data;
    
    // 创建系统消息
    const systemMessage = {
      id: `msg-sys-${new Date().getTime()}`,
      userId: 'system',
      avatar: '/assets/images/logo.svg',
      content: content,
      time: this.getCurrentTime(),
      isSelf: false,
      isSystem: true,
      isDestroying: false,
      isDestroyed: false
    };
    
    // 添加消息到列表
    const updatedMessages = [...messages, systemMessage];
    
    this.setData({
      messages: updatedMessages,
      scrollIntoView: `msg-${updatedMessages.length - 1}`
    });
  },
  
  /**
   * 获取模拟聊天记录
   */
  getMockMessages: function() {
    const app = getApp();
    const myAvatar = app.globalData.userInfo.avatarUrl;
    
    // 如果是新聊天，只显示欢迎消息
    if (this.data.isNewChat) {
      return [{
        id: 'msg-1',
        userId: 'system',
        avatar: '/assets/images/logo.svg',
        content: '欢迎使用秘信，此聊天中的消息将在查看后自动销毁',
        time: this.getCurrentTime(),
        isSelf: false,
        isSystem: true,
        isDestroying: false,
        isDestroyed: false
      }];
    }
    
    // 否则返回模拟消息数据
    return [
      {
        id: 'msg-1',
        userId: 'system',
        avatar: '/assets/images/logo.svg',
        content: '欢迎使用秘信，此聊天中的消息将在查看后自动销毁',
        time: '18:30',
        isSelf: false,
        isSystem: true,
        isDestroying: false,
        isDestroyed: false
      },
      {
        id: 'msg-2',
        userId: 'other',
        avatar: this.data.contactAvatar || '/assets/images/avatar1.png',
        content: '你好，这是一条测试消息',
        time: '18:31',
        isSelf: false,
        isDestroying: false,
        isDestroyed: false
      },
      {
        id: 'msg-3',
        userId: 'self',
        avatar: myAvatar,
        content: '收到了，这个程序很酷',
        time: '18:32',
        isSelf: true,
        isDestroying: false,
        isDestroyed: false
      }
    ];
  },

  /**
   * 处理输入框内容变化
   * @param {Object} e - 事件对象
   */
  onInputChange: function(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  /**
   * 发送消息
   */
  sendMessage: function() {
    const { inputValue, messages } = this.data;
    
    if (!inputValue.trim()) {
      return;
    }
    
    const app = getApp();
    const myAvatar = app.globalData.userInfo.avatarUrl;
    
    // 创建新消息
    const newMessage = {
      id: `msg-${messages.length}`,
      userId: 'self',
      avatar: myAvatar,
      content: inputValue,
      time: this.getCurrentTime(),
      isSelf: true,
      isDestroying: false,
      isDestroyed: false
    };
    
    // 添加消息到列表
    const updatedMessages = [...messages, newMessage];
    
    this.setData({
      messages: updatedMessages,
      inputValue: '',
      scrollIntoView: `msg-${updatedMessages.length - 1}`
    });
    
    // 模拟对方回复消息（如果有其他参与者）
    if (this.data.participants.length > 1) {
      this.simulateReply();
    }
  },
  
  /**
   * 获取当前时间
   */
  getCurrentTime: function() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },
  
  /**
   * 模拟对方回复消息
   */
  simulateReply: function() {
    // 随机回复内容
    const replies = [
      '好的，收到',
      '明白了',
      '稍等，我马上回复',
      '这条消息会在10秒后销毁',
      '理解了'
    ];
    
    // 随机选择回复
    const randomReply = replies[Math.floor(Math.random() * replies.length)];
    
    // 获取一个非自己的随机参与者
    const otherParticipants = this.data.participants.filter(p => !p.isSelf);
    if (otherParticipants.length === 0) return;
    
    const randomParticipant = otherParticipants[Math.floor(Math.random() * otherParticipants.length)];
    
    // 延迟2-3秒回复
    const replyDelay = 2000 + Math.random() * 1000;
    
    setTimeout(() => {
      const { messages } = this.data;
      
      // 创建回复消息
      const replyMessage = {
        id: `msg-${messages.length}`,
        userId: randomParticipant.id,
        avatar: randomParticipant.avatarUrl,
        content: randomReply,
        time: this.getCurrentTime(),
        isSelf: false,
        isDestroying: false,
        isDestroyed: false
      };
      
      // 添加消息到列表
      const updatedMessages = [...messages, replyMessage];
      
      this.setData({
        messages: updatedMessages,
        scrollIntoView: `msg-${updatedMessages.length - 1}`
      });
    }, replyDelay);
  },
  
  /**
   * 消息长按事件
   */
  onMessageLongTap: function(e) {
    const { msgid } = e.currentTarget.dataset;
    
    wx.showActionSheet({
      itemList: ['复制', '转发', '销毁'],
      success: (res) => {
        const { messages } = this.data;
        const messageIndex = messages.findIndex(msg => msg.id === msgid);
        
        if (messageIndex === -1) return;
        
        const message = messages[messageIndex];
        
        switch(res.tapIndex) {
          case 0: // 复制
            wx.setClipboardData({
              data: message.content,
              success: () => {
                wx.showToast({
                  title: '复制成功',
                  icon: 'success'
                });
              }
            });
            break;
          case 1: // 转发
            wx.showToast({
              title: '转发功能开发中',
              icon: 'none'
            });
            break;
          case 2: // 销毁
            this.destroyMessage(msgid);
            break;
        }
      }
    });
  },
  
  /**
   * 销毁消息
   */
  destroyMessage: function(msgId) {
    const { messages } = this.data;
    const messageIndex = messages.findIndex(msg => msg.id === msgId);
    
    if (messageIndex === -1) return;
    
    // 开始销毁倒计时
    let seconds = this.data.destroyTimeout;
    const message = {...messages[messageIndex], isDestroying: true};
    
    messages[messageIndex] = message;
    
    this.setData({
      messages: messages,
      showDestroyTimer: true,
      destroyTimerText: `消息将在 ${seconds} 秒后销毁`
    });
    
    // 开始倒计时
    const timer = setInterval(() => {
      seconds--;
      
      if (seconds <= 0) {
        // 销毁完成
        clearInterval(timer);
        this.completeDestroy(msgId);
      } else {
        this.setData({
          destroyTimerText: `消息将在 ${seconds} 秒后销毁`
        });
      }
    }, 1000);
  },
  
  /**
   * 完成销毁消息
   */
  completeDestroy: function(msgId) {
    const { messages } = this.data;
    const updatedMessages = messages.map(msg => {
      if (msg.id === msgId) {
        return {...msg, isDestroying: false, isDestroyed: true, content: '[已销毁]'};
      }
      return msg;
    });
    
    this.setData({
      messages: updatedMessages,
      showDestroyTimer: false,
      destroyTimerText: ''
    });
    
    wx.showToast({
      title: '消息已销毁',
      icon: 'success'
    });
  },
  
  /**
   * 打开表情选择器
   */
  openEmojiPicker: function() {
    wx.showToast({
      title: '表情功能开发中',
      icon: 'none'
    });
  },
  
  /**
   * 打开更多功能
   */
  openMoreFunctions: function() {
    wx.showActionSheet({
      itemList: ['发送图片', '语音通话', '视频通话', '销毁设置', '聊天详情'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0: // 发送图片
            this.chooseAndSendImage();
            break;
          case 1: // 语音通话
            wx.showToast({
              title: '语音通话功能开发中',
              icon: 'none'
            });
            break;
          case 2: // 视频通话
            wx.showToast({
              title: '视频通话功能开发中',
              icon: 'none'
            });
            break;
          case 3: // 销毁设置
            this.showDestroySettings();
            break;
          case 4: // 聊天详情
            this.navigateToChatDetail();
            break;
        }
      }
    });
  },
  
  /**
   * 跳转到聊天详情页
   */
  navigateToChatDetail: function() {
    wx.navigateTo({
      url: `/app/pages/chat/detail?id=${this.data.chatId}`
    });
  },
  
  /**
   * 选择并发送图片
   */
  chooseAndSendImage: function() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        
        // 在实际应用中，这里会上传图片到服务器
        // 这里简单模拟发送图片消息
        wx.showToast({
          title: '图片发送功能开发中',
          icon: 'none'
        });
      }
    });
  },
  
  /**
   * 显示销毁设置
   */
  showDestroySettings: function() {
    wx.showActionSheet({
      itemList: ['5秒', '10秒', '30秒', '1分钟', '5分钟'],
      success: (res) => {
        const timeMap = [5, 10, 30, 60, 300];
        const selectedTime = timeMap[res.tapIndex];
        
        this.setData({
          destroyTimeout: selectedTime
        });
        
        wx.showToast({
          title: `已设置为${selectedTime}秒`,
          icon: 'success'
        });
      }
    });
  },
  
  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    return {
      title: '加入我的秘密聊天',
      path: `/app/pages/home/home?inviteId=${this.data.chatId}&inviter=${encodeURIComponent(userInfo.nickName)}`,
      imageUrl: '/assets/images/logo.svg'
    };
  }
}) 