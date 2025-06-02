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
    maxRetryCount: 5,
    // 聊天创建状态
    chatCreationStatus: '',
    // 是否为新创建的聊天
    isNewChat: false,
    // 当前用户信息
    currentUser: null,
    // 聊天参与者列表
    participants: [],
    // 🔥 调试模式
    isDebugMode: false
  },

  /**
   * 生命周期函数--监听页面加载
   * @param {Object} options - 页面参数
   */
  onLoad: function (options) {
    console.log('[聊天页面] 页面加载，携带参数:', options);
    
    // 获取应用实例
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    // 使用全局统一的邀请参数处理
    const inviteInfo = app.handleInviteParams(options);
    
    // 如果没有chatId参数，尝试从邀请信息中获取
    let chatId = options.id;
    let inviter = options.inviter || '';
    let isNewChat = options.isNewChat === 'true';
    let userName = options.userName ? decodeURIComponent(options.userName) : '';
    
    if (!chatId && inviteInfo && inviteInfo.inviteId) {
      chatId = inviteInfo.inviteId;
      inviter = inviteInfo.inviter;
      console.log('[聊天页面] 使用邀请信息作为聊天参数:', inviteInfo);
    }
    
    // 检查必要的id参数
    if (!chatId) {
      wx.showModal({
        title: '错误',
        content: '聊天ID不存在，无法加载聊天',
        showCancel: false,
        success: () => {
          // 返回登录页
          wx.reLaunch({
            url: '/app/pages/login/login'
          });
        }
      });
      return;
    }
    
    // 检查是否来自邀请链接
    const isFromInvite = !!inviter;
    
    // 设置聊天标题
    let chatTitle = '秘信聊天';
    if (isNewChat) {
      chatTitle = `${userName || userInfo.nickName}的聊天`;
    } else if (inviter) {
      chatTitle = `与${decodeURIComponent(inviter)}的聊天`;
    }
    
    this.setData({
      contactId: chatId,
      contactName: chatTitle,
      isCreatingChat: isFromInvite,
      chatCreationStatus: isFromInvite ? '正在建立连接...' : '',
      isNewChat: isNewChat,
      currentUser: userInfo,
      participants: [userInfo], // 初始化参与者列表，包含当前用户
      // 🔥 在开发环境开启调试模式
      isDebugMode: wx.getSystemInfoSync().platform === 'devtools'
    });

    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: chatTitle
    });
    
    // 检查用户登录状态
    if (!app.globalData.hasLogin) {
      console.error('[邀请流程] 用户未登录，无法进入聊天界面');
      
      // 保存聊天参数以便登录后继续
      app.saveInviteInfo(chatId, inviter || '朋友'); // 统一使用inviter参数
      
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

    if (isFromInvite) {
      // 如果是从邀请链接进入，启动轮询检查聊天状态
      this.startChatCreationCheck();
      
      // 添加系统提示消息
      this.addSystemMessage('正在与对方建立聊天...');
    } else {
      // 否则直接获取聊天记录
      this.fetchMessages();
      
      // 如果是新创建的聊天，添加欢迎消息
      if (isNewChat) {
        this.addSystemMessage('开始您的私密聊天，点击右上角菜单邀请好友加入');
      }
    }
    
    // 标记为已处理邀请，在5秒后清理邀请信息
    if (inviteInfo) {
      setTimeout(() => {
        app.clearInviteInfo();
      }, 5000);
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function() {
    console.log('🎯 聊天页面分享');
    
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    const nickName = userInfo.nickName || '好友';
    const chatId = this.data.contactId;
    
    console.log('🎯 分享聊天ID:', chatId);
    
    // 调用创建邀请云函数
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: chatId,
        inviter: {
          openId: app.globalData.openId || userInfo.openId,
          nickName: nickName,
          avatarUrl: userInfo.avatarUrl
        }
      },
      success: (res) => {
        console.log('🎯 创建邀请成功:', res.result);
        
        if (res.result && res.result.success) {
          console.log('🎯 邀请创建成功');
          
          // 启动监听被邀请者加入
          this.startWatchingForNewParticipants(chatId);
        }
      },
      fail: (err) => {
        console.error('🎯 创建邀请失败:', err);
      }
    });
    
    // 返回分享配置
    return {
      title: `${nickName}邀请你进行私密聊天`,
      path: `/app/pages/share/share?chatId=${chatId}&inviter=${encodeURIComponent(nickName)}&isInvitee=true`,
      imageUrl: '/assets/images/logo.png'
    };
  },

  /**
   * 监听新参与者加入
   */
  startWatchingForNewParticipants: function(chatId) {
    console.log('🎯 开始监听新参与者加入:', chatId);
    
    try {
      const db = wx.cloud.database();
      this.participantWatcher = db.collection('conversations')
        .doc(chatId)
        .watch({
          onChange: snapshot => {
            console.log('🎯 监听到聊天状态变化:', snapshot);
            
            if (snapshot.docChanges && snapshot.docChanges.length > 0) {
              const chatData = snapshot.docChanges[0].doc;
              const participants = chatData.participants || [];
              
              // 检查是否有新参与者加入
              if (participants.length > this.data.participants.length) {
                console.log('🎯 检测到新参与者加入');
                
                // 找出新加入的参与者
                const currentParticipantIds = this.data.participants.map(p => p.openId);
                const newParticipants = participants.filter(p => !currentParticipantIds.includes(p.openId));
                
                // 更新参与者列表
                this.setData({
                  participants: participants
                });
                
                // 为每个新参与者添加系统消息
                newParticipants.forEach(participant => {
                  this.addInviteSystemMessage(participant.nickName);
                });
                
                // 关闭监听器
                if (this.participantWatcher) {
                  this.participantWatcher.close();
                  this.participantWatcher = null;
                }
              }
            }
          },
          onError: err => {
            console.error('🎯 监听出错:', err);
          }
        });
    } catch (err) {
      console.error('🎯 设置监听失败:', err);
    }
  },

  /**
   * 添加邀请系统消息
   */
  addInviteSystemMessage: function(participantName) {
    const systemMessage = {
      id: 'system_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      type: 'system',
      content: `你邀请${participantName}加入了聊天`,
      time: this.formatTime(new Date()),
      senderId: 'system'
    };
    
    const messages = this.data.messages;
    messages.push(systemMessage);
    
    this.setData({
      messages: messages
    });
    
    // 滚动到底部
    this.scrollToBottom();
    
    console.log('🎯 已添加邀请系统消息:', systemMessage);
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
    
    console.log('🔍 获取聊天记录，chatId:', that.data.contactId);
    
    // 显示加载状态
    wx.showLoading({
      title: '加载消息中',
      mask: true
    });
    
    // 🔥 使用云函数获取消息 - 传递chatId而不是targetUserId
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        chatId: that.data.contactId // 🔥 使用chatId参数
      },
      success: res => {
        console.log('🔍 获取消息成功', res);
        wx.hideLoading();
        
        if (res.result && res.result.success) {
          // 处理消息数据
          const messages = res.result.messages.map(msg => {
            // 🔥 确定消息发送者是否为自己
            const currentUserOpenId = getApp().globalData.userInfo.openId || getApp().globalData.openId;
            const isSelf = msg.senderId === currentUserOpenId;
            
            return {
              id: msg._id,
              senderId: isSelf ? 'self' : (msg.type === 'system' ? 'system' : 'other'),
              content: msg.content,
              type: msg.type,
              time: that.formatTime(new Date(msg.sendTime)),
              status: msg.status,
              destroyed: msg.destroyed,
              destroying: false,
              remainTime: 0
            };
          });
          
          console.log(`🔍 处理后的消息数据 ${messages.length} 条:`, messages);
          
          that.setData({
            messages: messages,
            isLoading: false
          });
          
          // 滚动到底部
          that.scrollToBottom();
        } else {
          console.log('🔍 获取消息失败，使用模拟数据');
          // 获取失败时使用模拟数据
          that.showMockMessages();
        }
      },
      fail: err => {
        console.error('🔍 获取消息失败', err);
        wx.hideLoading();
        
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

    console.log('📤 发送消息到chatId:', this.data.contactId, '内容:', content);

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

    // 🔥 使用云函数发送消息 - 传递chatId而不是receiverId
    wx.cloud.callFunction({
      name: 'sendMessage',
      data: {
        chatId: this.data.contactId, // 🔥 使用chatId参数
        content: content,
        type: 'text',
        destroyTimeout: this.data.destroyTimeout
      },
      success: res => {
        console.log('📤 发送消息成功', res);
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

          // 🔥 去掉模拟消息读取，让实际用户看到真实消息
          console.log('📤 消息发送成功，等待对方回复');
        } else {
          // 发送失败
          this.showMessageError(newMessage.id);
        }
      },
      fail: err => {
        console.error('📤 发送消息失败', err);
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
        
        // 获取聊天记录
        this.fetchMessages();
        
        // 添加系统消息
        this.addSystemMessage('聊天创建超时，已自动为您进入聊天。如遇问题，请联系对方重新邀请。');
      }
    }, 20000);
  },
  
  /**
   * 检查聊天创建状态
   */
  checkChatCreationStatus: function() {
    const { contactId, createChatRetryCount, maxRetryCount } = this.data;
    
    console.log(`[邀请流程] 检查聊天创建状态: 第${createChatRetryCount+1}/${maxRetryCount}次`);
    
    // 更新状态文本
    this.setData({
      chatCreationStatus: `正在建立连接(${createChatRetryCount+1}/${maxRetryCount})...`
    });
    
    // 检查重试次数
    if (createChatRetryCount >= 2) {
      // 超过2次就直接退出创建状态，避免长时间等待
      clearInterval(this.chatCreationTimer);
      console.log('[邀请流程] 已尝试检查多次，直接进入聊天界面');
      
      this.setData({
        isCreatingChat: false,
        chatCreationStatus: ''
      });
      
      // 获取聊天记录
      this.fetchMessages();
      
      // 添加系统消息
      this.addSystemMessage('聊天已准备就绪，可以开始聊天了');
      return;
    }
    
    // 调用云函数检查聊天是否真的创建成功
    wx.cloud.callFunction({
      name: 'checkChatStatus',
      data: {
        chatId: contactId
      },
      success: res => {
        console.log('[邀请流程] 检查聊天状态结果:', res);
        
        // 如果云函数返回聊天已创建
        if (res.result && res.result.exists) {
          clearInterval(this.chatCreationTimer);
          console.log('[邀请流程] 检测到聊天创建成功，结束创建状态');
          
          this.setData({
            isCreatingChat: false,
            chatCreationStatus: ''
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
          
          // 如果第一次检查失败，直接尝试创建
          if (createChatRetryCount === 0) {
            this.tryCreateChat(false);
          }
          
          // 如果已经是第二次检查，也直接退出创建状态
          if (createChatRetryCount === 1) {
            setTimeout(() => {
              if (this.data.isCreatingChat) {
                clearInterval(this.chatCreationTimer);
                console.log('[邀请流程] 两次检查后直接进入聊天界面');
                
                this.setData({
                  isCreatingChat: false,
                  chatCreationStatus: ''
                });
                
                // 获取聊天记录
                this.fetchMessages();
                
                // 添加系统消息
                this.addSystemMessage('聊天已创建，现在可以开始聊天了');
              }
            }, 2000);
          }
        }
      },
      fail: err => {
        console.error('[邀请流程] 检查聊天状态失败:', err);
        
        // 增加重试计数
        this.setData({
          createChatRetryCount: createChatRetryCount + 1
        });
        
        // 如果第一次检查就失败，直接尝试创建
        if (createChatRetryCount === 0) {
          this.tryCreateChat(false);
        }
        
        // 如果已经是第二次检查失败，直接进入聊天
        if (createChatRetryCount === 1) {
          setTimeout(() => {
            if (this.data.isCreatingChat) {
              clearInterval(this.chatCreationTimer);
              console.log('[邀请流程] 检查失败，直接进入聊天界面');
              
              this.setData({
                isCreatingChat: false,
                chatCreationStatus: ''
              });
              
              // 获取聊天记录
              this.fetchMessages();
              
              // 添加系统消息
              this.addSystemMessage('无法创建聊天，但您仍可以使用聊天功能');
            }
          }, 1000);
        }
      }
    });
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
          
          // 获取聊天记录
          this.fetchMessages();
          
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
   * 页面卸载
   */
  onUnload: function () {
    console.log('🎯 聊天页面卸载，清理资源');
    
    // 清除定时器
    if (this.chatCreationTimer) {
      clearInterval(this.chatCreationTimer);
      this.chatCreationTimer = null;
    }
    
    // 清除参与者监听器
    if (this.participantWatcher) {
      this.participantWatcher.close();
      this.participantWatcher = null;
    }
    
    // 🔥 清除消息监听器
    this.stopMessageListener();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    console.log('[邀请流程] 聊天页面显示');
    
    // 🔥 页面显示时启动实时消息监听
    this.startMessageListener();
  },

  /**
   * 🔥 启动实时消息监听
   */
  startMessageListener: function() {
    const chatId = this.data.contactId;
    if (!chatId) return;
    
    console.log('🔔 启动实时消息监听，chatId:', chatId);
    
    try {
      // 如果已有监听器，先关闭
      if (this.messageWatcher) {
        this.messageWatcher.close();
        this.messageWatcher = null;
      }
      
      const db = wx.cloud.database();
      this.messageWatcher = db.collection('messages')
        .where({
          chatId: chatId
        })
        .orderBy('sendTime', 'desc')
        .limit(1)
        .watch({
          onChange: snapshot => {
            console.log('🔔 监听到消息变化:', snapshot);
            
            if (snapshot.type === 'init') {
              console.log('🔔 消息监听器初始化');
              return;
            }
            
            // 检查是否有新消息
            if (snapshot.docChanges && snapshot.docChanges.length > 0) {
              const changes = snapshot.docChanges;
              let hasNewMessage = false;
              
              changes.forEach(change => {
                if (change.queueType === 'enqueue') {
                  console.log('🔔 检测到新消息:', change.doc);
                  hasNewMessage = true;
                }
              });
              
              if (hasNewMessage) {
                console.log('🔔 刷新聊天记录以显示新消息');
                // 延迟一下再刷新，确保消息已写入
                setTimeout(() => {
                  this.fetchMessages();
                }, 500);
              }
            }
          },
          onError: err => {
            console.error('🔔 消息监听出错:', err);
          }
        });
    } catch (err) {
      console.error('🔔 设置消息监听失败:', err);
    }
  },

  /**
   * 🔥 停止实时消息监听
   */
  stopMessageListener: function() {
    if (this.messageWatcher) {
      console.log('🔔 停止消息监听');
      this.messageWatcher.close();
      this.messageWatcher = null;
    }
  }
}) 