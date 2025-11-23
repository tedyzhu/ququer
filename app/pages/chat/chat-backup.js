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
    destroyTimeout: 30,
    // 是否正在创建聊天
    isCreatingChat: false,
    // 创建聊天重试次数
    createChatRetryCount: 0,
    // 最大重试次数
    maxRetryCount: 5,
    // 聊天创建状态
    chatCreationStatus: ''
  },

  /**
   * 生命周期函数--监听页面加载
   * @param {Object} options - 页面参数
   */
  onLoad: function (options) {
    console.log('[邀请流程] 聊天页面加载，携带参数:', options);
    
    // 防止重复执行 - 检查是否已经在加载过程中
    if (this._isLoading) {
      console.log('[邀请流程] 页面正在加载中，跳过重复执行');
      return;
    }
    this._isLoading = true;
    
    // 获取应用实例
    const app = getApp();
    
    // 使用全局统一的邀请参数处理
    const inviteInfo = app.handleInviteParams(options);
    
    // 如果没有chatId参数，尝试从邀请信息中获取
    let chatId = options.id;
    let inviter = options.inviter || '';
    
    if (!chatId && inviteInfo && inviteInfo.inviteId) {
      chatId = inviteInfo.inviteId;
      inviter = inviteInfo.inviter;
      console.log('[邀请流程] 使用邀请信息作为聊天参数:', inviteInfo);
    }
    
    // 检查必要的id参数
    if (!chatId) {
      this._isLoading = false; // 重置加载标志
      wx.showModal({
        title: '错误',
        content: '聊天ID不存在，无法加载聊天',
        showCancel: false,
        success: () => {
          // 返回首页
          wx.reLaunch({
            url: '../home/home',
            fail: () => {
              wx.reLaunch({
                url: '/app/pages/home/home'
              });
            }
          });
        }
      });
      return;
    }
    
    // 检查是否来自邀请链接或已标记为开始聊天
    const isFromInvite = !!inviter;
    // 新增：检查URL中是否带有chatStarted参数或本地存储中是否已标记聊天开始
    const urlChatStarted = options.chatStarted === 'true';
    
    // 尝试从本地存储获取会话状态
    let localChatStarted = false;
    try {
      const chatInfo = wx.getStorageSync(`chat_info_${chatId}`);
      if (chatInfo && chatInfo.chatStarted) {
        localChatStarted = true;
      }
    } catch (e) {
      console.error('读取本地聊天状态失败:', e);
    }
    
    // 如果URL参数或本地存储标记为已开始，则不进入等待状态
    const chatAlreadyStarted = urlChatStarted || localChatStarted;
    
    // 检查isInvitee参数，确定当前用户角色
    const isInvitee = options.isInvitee === 'true' || options.isInvitee === true;
    
    console.log('[邀请流程] 聊天状态检查:', {
      isFromInvite,
      urlChatStarted,
      localChatStarted,
      chatAlreadyStarted,
      isInvitee
    });
    
    // 如果是被邀请者进入且带有chatStarted=true参数，确保更新聊天状态
    if (isInvitee && urlChatStarted) {
      // 主动更新聊天状态为active
      wx.cloud.callFunction({
        name: 'updateChatStatus',
        data: {
          chatId: chatId,
          status: 'active',
          chatStarted: true
        }
      }).then(res => {
        console.log('[邀请流程] 被邀请者更新聊天状态成功:', res);
      }).catch(err => {
        console.error('[邀请流程] 被邀请者更新聊天状态失败:', err);
      });
    }
    
    this.setData({
      contactId: chatId,
      contactName: decodeURIComponent(inviter || '聊天'), // 统一使用inviter参数
      isCreatingChat: isFromInvite && !chatAlreadyStarted, // 只有在真正需要等待时才显示创建状态
      chatCreationStatus: (isFromInvite && !chatAlreadyStarted) ? '正在建立连接...' : ''
    });

    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: this.data.contactName
    });
    
    // 检查用户登录状态
    if (!app.globalData.hasLogin) {
      console.error('[邀请流程] 用户未登录，无法进入聊天界面');
      this._isLoading = false; // 重置加载标志
      
      // 保存聊天参数以便登录后继续
      app.saveInviteInfo(chatId, inviter || '朋友', true); // 统一使用inviter参数，默认为被邀请者
      
      // 使用全局统一的URL跳转方法
      const loginUrls = [
        '../login/login', 
        '/app/pages/login/login', 
        '/pages/login/login'
      ];
      
      app.tryNavigateToUrls(loginUrls, 0, null, () => {
        wx.showModal({
          title: '错误',
          content: '无法跳转到登录页，请重启小程序',
          showCancel: false
        });
      });
      return;
    }

    if (this.data.isCreatingChat) {
      // 如果需要等待，启动轮询检查聊天状态
      this.startChatCreationCheck();
      
      // 添加系统提示消息
      this.addSystemMessage('正在与对方建立聊天...');
    } else {
      // 延迟获取聊天记录，防止立即重复调用
      setTimeout(() => {
        this.fetchMessages();
        
        // 如果是从被邀请链接进入且已确认开始，添加提示消息
        if (chatAlreadyStarted && isFromInvite) {
          this.addSystemMessage('聊天已准备就绪，可以开始聊天了');
        }
      }, 100);
    }
    
    // 标记为已处理邀请，在5秒后清理邀请信息
    if (inviteInfo) {
      setTimeout(() => {
        app.clearInviteInfo();
      }, 5000);
    }
    
    // 页面加载完成，重置加载标志
    this._isLoading = false;
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    // 刷新聊天记录 - 添加延迟防止循环
    setTimeout(() => {
      this.fetchMessages();
    }, 200);
    wx.stopPullDownRefresh();
  },

  /**
   * 获取聊天记录
   */
  fetchMessages: function () {
    const that = this;
    
    // 强化防重复调用机制
    if (this._isFetchingMessages) {
      console.log('[邀请流程] 消息加载中，跳过重复调用');
      return;
    }
    
    // 添加全局防重复标志
    if (this._lastFetchTime && Date.now() - this._lastFetchTime < 1000) {
      console.log('[邀请流程] 1秒内重复调用，跳过');
      return;
    }
    
    this._isFetchingMessages = true;
    this._lastFetchTime = Date.now();
    
    console.log('[邀请流程] 开始加载聊天信息:', this.data.contactId);
    
    // 检查是否有全局聊天信息
    const app = getApp();
    if (app.globalData.currentChatInfo && app.globalData.currentChatInfo._id === this.data.contactId) {
      console.log('[邀请流程] 从全局数据获取到聊天信息:', app.globalData.currentChatInfo);
      
      // 检查聊天状态
      if (app.globalData.currentChatInfo.status === 'active' && app.globalData.currentChatInfo.chatStarted) {
        console.log('[邀请流程] 处理聊天状态: active - 立即停止循环');
        
        // 清理可能导致循环的全局数据
        delete app.globalData.currentChatInfo;
        console.log('[邀请流程] 已清理全局数据，防止循环');
        
        // 重置标志并显示模拟数据
        this._isFetchingMessages = false;
        this.showMockMessages();
        return;
      }
    }
    
    // 显示加载状态
    wx.showLoading({
      title: '加载消息中',
      mask: true
    });
    
    // 使用云函数获取消息
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        targetUserId: that.data.contactId
      },
      success: res => {
        console.log('获取消息成功', res);
        wx.hideLoading();
        that._isFetchingMessages = false; // 重置标志
        
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
        wx.hideLoading();
        that._isFetchingMessages = false; // 重置标志
        
        // 显示错误提示
        wx.showToast({
          title: '获取消息失败',
          icon: 'none',
          duration: 2000
        });
        
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
    
    // 滚动到底部
    setTimeout(() => {
      this.scrollToBottom();
    }, 100);
  },
  
  /**
   * 启动聊天创建状态检查
   */
  startChatCreationCheck: function() {
    console.log('[邀请流程] 启动聊天创建状态检查');
    
    // 清除可能存在的旧定时器
    if (this.chatCreationTimer) {
      clearInterval(this.chatCreationTimer);
    }
    
    // 更新UI状态
    this.setData({
      isCreatingChat: true,
      chatCreationStatus: '正在建立连接...',
      // 重置重试计数器
      createChatRetryCount: 0
    });
    
    // 先尝试主动创建聊天，不等待检查
    this.tryCreateChat(true);
    
    // 每2秒检查一次
    this.chatCreationTimer = setInterval(() => {
      this.checkChatCreationStatus();
    }, 2000);
    
    // 设置20秒超时，防止永久等待
    setTimeout(() => {
      if (this.data.isCreatingChat) {
        // 20秒后仍在创建状态，强制结束
        clearInterval(this.chatCreationTimer);
        console.log('[邀请流程] 创建聊天超时，强制进入聊天界面');
        
        this.setData({
          isCreatingChat: false,
          chatCreationStatus: ''
        });
        
        // 获取聊天记录 - 延迟执行防止循环
        setTimeout(() => {
          this.fetchMessages();
        }, 300);
        
        // 添加系统消息
        this.addSystemMessage('聊天创建超时，已自动为您进入聊天。如遇问题，请联系对方重新邀请。');
      }
    }, 20000);
  },
  
  /**
   * 检查聊天创建状态
   */
  checkChatCreationStatus: function() {
    const that = this;
    console.log('[邀请流程] 检查聊天创建状态: 第' + (that.data.createChatRetryCount + 1) + '/' + that.data.maxRetryCount + '次');
    
    // 调用云函数检查状态
    wx.cloud.callFunction({
      name: 'checkChatStatus',
      data: {
        chatId: that.data.contactId
      },
      success: res => {
        console.log('[邀请流程] 检查聊天状态结果:', res);
        
        if (res.result && res.result.success) {
          if (res.result.exists && res.result.isParticipant) {
            // 聊天已创建且当前用户已加入
            that.setData({
              isCreatingChat: false,
              chatCreationStatus: ''
            });
            
            // 保存聊天状态到本地
            wx.setStorageSync(`chat_info_${that.data.contactId}`, {
              chatStarted: true,
              timestamp: Date.now()
            });
            
            // 开始加载消息 - 延迟执行防止循环
            setTimeout(() => {
              that.fetchMessages();
            }, 200);
            
            // 添加系统提示
            that.addSystemMessage('聊天已准备就绪，可以开始聊天了');
            
            // 停止轮询
            that.stopChatCreationCheck();
          } else {
            // 继续等待或重试
            that.handleChatCreationRetry();
          }
        } else {
          // 检查失败，继续重试
          that.handleChatCreationRetry();
        }
      },
      fail: err => {
        console.error('[邀请流程] 检查聊天状态失败:', err);
        that.handleChatCreationRetry();
      }
    });
  },
  
  /**
   * 处理聊天创建重试逻辑
   */
  handleChatCreationRetry: function() {
    const that = this;
    
    // 增加重试次数
    that.setData({
      createChatRetryCount: that.data.createChatRetryCount + 1
    });
    
    // 如果超过最大重试次数
    if (that.data.createChatRetryCount >= that.data.maxRetryCount) {
      console.log('[邀请流程] 超过最大重试次数，强制进入聊天');
      that.setData({
        isCreatingChat: false,
        chatCreationStatus: ''
      });
      
      // 开始加载消息 - 延迟执行防止循环
      setTimeout(() => {
        that.fetchMessages();
      }, 300);
      
      // 添加系统提示
      that.addSystemMessage('正在尝试建立连接...');
      
      // 停止轮询
      that.stopChatCreationCheck();
    }
  },
  
  /**
   * 尝试创建聊天（备选方案）
   * @param {Boolean} [isInitial=false] - 是否是初始创建尝试
   */
  tryCreateChat: function(isInitial) {
    console.log('[邀请流程] 尝试主动创建聊天...');
    
    // 更新状态文本
    this.setData({
      chatCreationStatus: isInitial ? '正在创建聊天...' : '正在尝试创建聊天...'
    });
    
    // 调用云函数创建聊天
    wx.cloud.callFunction({
      name: 'createChat',
      data: {
        chatId: this.data.contactId,
        message: `${getApp().globalData.userInfo.nickName || '用户'}发起了聊天` 
      },
      success: res => {
        console.log('[邀请流程] 创建聊天结果:', res);
        
        if (res.result && res.result.success) {
          clearInterval(this.chatCreationTimer);
          
          this.setData({
            isCreatingChat: false,
            chatCreationStatus: ''
          });
          
          // 获取聊天记录 - 延迟执行防止循环
          setTimeout(() => {
            this.fetchMessages();
          }, 200);
          
          // 添加系统消息
          this.addSystemMessage('聊天已成功创建，可以开始交流了');
        } else {
          // 创建失败，显示错误消息
          this.setData({
            chatCreationStatus: '创建聊天失败，继续重试...'
          });
          
          // 如果是初始创建尝试失败，直接加载消息界面而不是无限等待
          if (isInitial) {
            console.log('[邀请流程] 初始创建尝试失败，但继续检查...');
            // 继续让定时器检查，不强制退出
          }
        }
      },
      fail: err => {
        console.error('[邀请流程] 创建聊天失败:', err);
        
        // 创建失败，显示错误消息
        this.setData({
          chatCreationStatus: '创建聊天失败，继续重试...'
        });
        
        // 如果是初始创建尝试失败，直接加载消息界面而不是无限等待
        if (isInitial) {
          console.log('[邀请流程] 初始创建尝试失败，但继续检查...');
          // 继续让定时器检查，不强制退出
        }
      }
    });
  },

  /**
   * 停止聊天创建状态检查
   */
  stopChatCreationCheck: function() {
    console.log('[邀请流程] 停止聊天创建状态检查');
    
    // 清除定时器
    if (this.chatCreationTimer) {
      clearInterval(this.chatCreationTimer);
      this.chatCreationTimer = null;
    }
    
    // 重置状态
    this.setData({
      isCreatingChat: false,
      chatCreationStatus: '',
      createChatRetryCount: 0
    });
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    console.log('[邀请流程] 聊天页面卸载');
    
    // 清理定时器
    this.stopChatCreationCheck();
    
    // 重置所有加载标志
    this._isLoading = false;
    this._isFetchingMessages = false;
    this._lastFetchTime = 0;
    
    // 清理全局数据防止影响其他页面
    const app = getApp();
    if (app.globalData.currentChatInfo) {
      delete app.globalData.currentChatInfo;
      console.log('[邀请流程] 页面卸载时清理全局聊天数据');
    }
    
    // 清理其他可能的定时器
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {
    console.log('[邀请流程] 聊天页面隐藏');
    
    // 暂停定时器
    if (this.chatCreationTimer) {
      clearInterval(this.chatCreationTimer);
      this.chatCreationTimer = null;
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    console.log('[邀请流程] 聊天页面显示');
    
    // 如果页面处于创建聊天状态且没有定时器，重新启动检查
    if (this.data.isCreatingChat && !this.chatCreationTimer) {
      console.log('[邀请流程] 页面重新显示时恢复聊天创建检查');
      this.startChatCreationCheck();
    }
  }
}) 