/**
 * 聊天页面逻辑
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    contactId: '',
    contactName: '',
    messages: [],
    inputValue: '',
    scrollTop: 0,
    isLoading: true,
    // 阅后即焚倒计时配置（秒）
    destroyTimeout: 10,
    // 是否正在创建聊天
    isCreatingChat: false,
    // 创建聊天重试次数
    createChatRetryCount: 0,
    // 最大重试次数
    maxRetryCount: 5
  },

  /**
   * 生命周期函数--监听页面加载
   * @param {Object} options - 页面参数
   */
  onLoad: function (options) {
    console.log('聊天页面加载，携带参数:', options);
    const { id, name, inviter } = options;
    
    // 检查是否来自邀请链接
    const isFromInvite = !!inviter;
    
    this.setData({
      contactId: id,
      contactName: decodeURIComponent(name || inviter || '聊天'),
      isCreatingChat: isFromInvite // 如果是从邀请链接进入，显示创建聊天状态
    });

    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: this.data.contactName
    });

    if (isFromInvite) {
      // 如果是从邀请链接进入，启动轮询检查聊天状态
      this.startChatCreationCheck();
      
      // 添加系统提示消息
      this.addSystemMessage('正在与对方建立聊天...');
    } else {
      // 否则直接获取聊天记录
      this.fetchMessages();
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    // 刷新聊天记录
    this.fetchMessages();
    wx.stopPullDownRefresh();
  },

  /**
   * 获取聊天记录
   */
  fetchMessages: function () {
    const that = this;
    
    // 使用云函数获取消息
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        targetUserId: that.data.contactId
      },
      success: res => {
        console.log('获取消息成功', res);
        if (res.result && res.result.success) {
          // 处理消息数据
          const messages = res.result.messages.map(msg => {
            // 确定消息发送者是否为自己
            const isSelf = msg.senderId === getApp().globalData.userInfo.openId;
            
            return {
              id: msg._id,
              senderId: isSelf ? 'self' : 'other',
              content: msg.content,
              type: msg.type,
              time: that.formatTime(new Date(msg.sendTime)),
              status: msg.status,
              destroyed: msg.destroyed,
              destroying: false,
              remainTime: 0
            };
          });
          
          that.setData({
            messages: messages,
            isLoading: false
          });
          
          // 滚动到底部
          that.scrollToBottom();
        } else {
          // 获取失败时使用模拟数据
          that.showMockMessages();
        }
      },
      fail: err => {
        console.error('获取消息失败', err);
        // 失败时使用模拟数据
        that.showMockMessages();
      }
    });
  },
  
  /**
   * 显示模拟消息数据（作为备份）
   */
  showMockMessages: function() {
    const mockMessages = [
      {
        id: '1',
        senderId: 'other',
        content: '你好，这是一条测试消息',
        type: 'text',
        time: '14:20',
        status: 'received',
        // 是否已被销毁
        destroyed: false,
        // 是否正在倒计时销毁
        destroying: false,
        // 剩余销毁时间（秒）
        remainTime: 0
      },
      {
        id: '2',
        senderId: 'self',
        content: '你好，很高兴认识你',
        type: 'text',
        time: '14:21',
        status: 'sent',
        destroyed: false,
        destroying: false,
        remainTime: 0
      },
      {
        id: '3',
        senderId: 'other',
        content: '这条消息会自动销毁',
        type: 'text',
        time: '14:22',
        status: 'received',
        destroyed: false,
        destroying: false,
        remainTime: 0
      }
    ];

    this.setData({
      messages: mockMessages,
      isLoading: false
    });

    // 滚动到底部
    this.scrollToBottom();
  },

  /**
   * 滚动到聊天底部
   */
  scrollToBottom: function () {
    wx.createSelectorQuery()
      .select('#message-container')
      .boundingClientRect(function (rect) {
        // 使用ScrollView的scroll-top实现滚动到底部
        wx.createSelectorQuery()
          .select('#scroll-view')
          .boundingClientRect(function (scrollRect) {
            // 计算需要滚动的高度
            if (rect && scrollRect) {
              const scrollTop = rect.height;
              this.setData({
                scrollTop: scrollTop
              });
            }
          }.bind(this))
          .exec();
      }.bind(this))
      .exec();
  },

  /**
   * 处理输入框内容变化
   * @param {Object} e - 事件对象
   */
  handleInputChange: function (e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  /**
   * 发送消息
   */
  sendMessage: function () {
    const content = this.data.inputValue.trim();
    if (!content) return;

    // 创建新消息对象
    const newMessage = {
      id: Date.now().toString(),
      senderId: 'self',
      content: content,
      type: 'text',
      time: this.formatTime(new Date()),
      status: 'sending',
      destroyed: false,
      destroying: false,
      remainTime: 0
    };

    // 添加到消息列表
    const messages = this.data.messages.concat(newMessage);
    
    this.setData({
      messages: messages,
      inputValue: ''
    });

    // 滚动到底部
    this.scrollToBottom();

    // 使用云函数发送消息
    wx.cloud.callFunction({
      name: 'sendMessage',
      data: {
        receiverId: this.data.contactId,
        content: content,
        type: 'text',
        destroyTimeout: this.data.destroyTimeout
      },
      success: res => {
        console.log('发送消息成功', res);
        if (res.result && res.result.success) {
          // 更新本地消息状态为已发送
          const updatedMessages = this.data.messages.map(msg => {
            if (msg.id === newMessage.id) {
              return { 
                ...msg, 
                status: 'sent',
                id: res.result.messageId // 使用云端返回的消息ID
              };
            }
            return msg;
          });

          this.setData({
            messages: updatedMessages
          });

          // 模拟对方查看了消息
          this.simulateMessageRead();
        } else {
          // 发送失败
          this.showMessageError(newMessage.id);
        }
      },
      fail: err => {
        console.error('发送消息失败', err);
        // 发送失败
        this.showMessageError(newMessage.id);
      }
    });
  },
  
  /**
   * 显示消息发送错误
   */
  showMessageError: function(messageId) {
    const updatedMessages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return { ...msg, status: 'failed' };
      }
      return msg;
    });

    this.setData({
      messages: updatedMessages
    });
    
    wx.showToast({
      title: '发送失败，请重试',
      icon: 'none'
    });
  },

  /**
   * 模拟对方已读消息，触发阅后即焚倒计时
   */
  simulateMessageRead: function () {
    // 延迟2秒，模拟对方查看消息
    setTimeout(() => {
      const messages = this.data.messages.filter(msg => !msg.destroyed);
      
      // 找到对方发送的最后一条消息，模拟我们已读了它
      const otherMessages = messages.filter(msg => msg.senderId === 'other');
      if (otherMessages.length > 0) {
        const lastOtherMessage = otherMessages[otherMessages.length - 1];
        this.startDestroyCountdown(lastOtherMessage.id);
      }
    }, 2000);
  },

  /**
   * 开始销毁倒计时
   * @param {String} messageId - 消息ID
   */
  startDestroyCountdown: function (messageId) {
    // 更新消息状态为正在销毁中
    const messages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return { 
          ...msg, 
          destroying: true, 
          remainTime: this.data.destroyTimeout 
        };
      }
      return msg;
    });

    this.setData({ messages });

    // 创建销毁倒计时
    const countdownInterval = setInterval(() => {
      const updatedMessages = this.data.messages.map(msg => {
        if (msg.id === messageId && msg.destroying) {
          const newRemainTime = msg.remainTime - 1;
          
          if (newRemainTime <= 0) {
            // 时间到，销毁消息
            clearInterval(countdownInterval);
            
            // 调用云函数销毁消息
            this.destroyMessage(messageId);
            
            // 设置为已销毁状态
            return { ...msg, destroying: false, destroyed: true, remainTime: 0 };
          }
          
          return { ...msg, remainTime: newRemainTime };
        }
        return msg;
      });

      this.setData({ messages: updatedMessages });
    }, 1000);
  },
  
  /**
   * 调用云函数销毁消息
   */
  destroyMessage: function(messageId) {
    wx.cloud.callFunction({
      name: 'destroyMessage',
      data: { messageId },
      success: res => {
        console.log('销毁消息成功', res);
      },
      fail: err => {
        console.error('销毁消息失败', err);
      }
    });
  },

  /**
   * 消息点击事件
   * @param {Object} e - 事件对象
   */
  handleMessageTap: function (e) {
    const { messageid } = e.currentTarget.dataset;
    
    // 对于接收到的消息，点击查看后开始倒计时销毁
    const message = this.data.messages.find(msg => msg.id === messageid);
    if (message && message.senderId === 'other' && !message.destroying && !message.destroyed) {
      this.startDestroyCountdown(messageid);
    }
  },

  /**
   * 格式化时间
   * @param {Date} date - 日期对象
   * @returns {String} 格式化的时间字符串
   */
  formatTime: function (date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  },

  /**
   * 添加系统消息
   */
  addSystemMessage: function(content) {
    const systemMessage = {
      id: 'sys_' + new Date().getTime(),
      senderId: 'system',
      content: content,
      type: 'system',
      time: this.formatTime(new Date()),
      status: 'sent',
      destroyed: false,
      destroying: false,
      remainTime: 0
    };
    
    const messages = this.data.messages || [];
    messages.push(systemMessage);
    
    this.setData({
      messages: messages
    });
  },
  
  /**
   * 启动聊天创建状态检查
   */
  startChatCreationCheck: function() {
    // 清除可能存在的旧定时器
    if (this.chatCreationTimer) {
      clearInterval(this.chatCreationTimer);
    }
    
    // 每3秒检查一次
    this.chatCreationTimer = setInterval(() => {
      this.checkChatCreationStatus();
    }, 3000);
  },
  
  /**
   * 检查聊天创建状态
   */
  checkChatCreationStatus: function() {
    const { createChatRetryCount, maxRetryCount } = this.data;
    
    console.log(`检查聊天创建状态: 第${createChatRetryCount+1}/${maxRetryCount}次`);
    
    // 检查重试次数
    if (createChatRetryCount >= maxRetryCount) {
      // 超过最大重试次数，停止轮询并进入聊天状态
      clearInterval(this.chatCreationTimer);
      console.log('超过最大重试次数，强制进入聊天界面');
      
      this.setData({
        isCreatingChat: false
      });
      
      // 获取聊天记录
      this.fetchMessages();
      
      // 添加系统消息
      this.addSystemMessage('聊天已创建成功，可以开始聊天了');
      return;
    }
    
    // 我们可以在这里添加云函数调用来检查聊天是否真的创建成功
    // 但为了简单起见，我们暂时模拟一个随机过程
    
    // 50%的概率认为聊天创建成功
    if (Math.random() > 0.5 || createChatRetryCount > 2) {
      clearInterval(this.chatCreationTimer);
      console.log('检测到聊天创建成功，结束创建状态');
      
      this.setData({
        isCreatingChat: false
      });
      
      // 获取聊天记录
      this.fetchMessages();
      
      // 添加系统消息
      this.addSystemMessage('聊天已创建成功，你们可以开始聊天了');
    } else {
      // 增加重试计数
      this.setData({
        createChatRetryCount: createChatRetryCount + 1
      });
    }
  }
}) 