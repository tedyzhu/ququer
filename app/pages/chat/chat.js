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
    scrollIntoView: '',
    chatTitle: '你和jerala(2)', // 聊天标题
    dynamicTitle: '', // 动态标题
    // 阅后即焚倒计时配置（秒）
    destroyTimeout: 10,
    showDestroyTimer: false,
    destroyTimerText: '',
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

    // 更新动态标题
    this.updateDynamicTitle();
    
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
      // 🔥 如果是从邀请链接进入，立即加入聊天
      console.log('🔗 [被邀请者] 从邀请链接进入，开始加入聊天');
      this.joinChatByInvite(chatId, inviter);
    } else {
      // 如果是新创建的聊天，先创建conversation记录
      if (isNewChat) {
        this.createConversationRecord(chatId).then(() => {
          // 创建记录后再获取聊天记录和参与者信息
          this.fetchMessages();
          this.fetchChatParticipants();
          this.addSystemMessage('您创建了私密聊天，可点击右上角菜单分享链接邀请朋友加入');
        }).catch(err => {
          console.error('🔥 创建会话记录失败:', err);
          // 即使创建失败也要尝试获取聊天记录
          this.fetchMessages();
          this.fetchChatParticipants();
        });
      } else {
        // 否则直接获取聊天记录
        this.fetchMessages();
        
        // 获取聊天参与者信息
        this.fetchChatParticipants();
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
    console.log('🎯 [新版] 聊天页面分享');
    
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    const nickName = userInfo.nickName || '好友';
    const chatId = this.data.contactId;
    
    console.log('🎯 [新版] 分享聊天ID:', chatId);
    console.log('🎯 [新版] 邀请者信息:', { nickName, openId: userInfo.openId });

    // 启动监听被邀请者加入（无需调用createInvite，直接监听）
    this.startWatchingForNewParticipants(chatId);
    
    // 返回分享配置，直接跳转到聊天页面（简化流程）
    const sharePath = `/app/pages/chat/chat?id=${chatId}&inviter=${encodeURIComponent(nickName)}&fromInvite=true`;
    
    console.log('🎯 [新版] 分享路径:', sharePath);
    
    return {
      title: `${nickName}邀请你进行私密聊天`,
      path: sharePath,
      imageUrl: '/assets/images/logo.png'
    };
  },

  /**
   * 被邀请者加入聊天
   */
  joinChatByInvite: function(chatId, inviter) {
    console.log('🔗 [被邀请者] 开始加入聊天:', { chatId, inviter });
    
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    // 添加系统消息
    this.addSystemMessage('正在加入聊天...');
    
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
        console.log('🔗 [被邀请者] 加入聊天成功:', res.result);
        
        if (res.result && res.result.success) {
          // 加入成功，先清除创建状态
          this.setData({
            isCreatingChat: false,
            chatCreationStatus: ''
          });
          
          // 延迟一下再获取聊天记录和参与者信息，确保数据库已更新
          setTimeout(() => {
            this.fetchMessages();
            this.fetchChatParticipants();
          }, 1000);
          
          // 显示成功提示
          wx.showToast({
            title: '加入聊天成功',
            icon: 'success',
            duration: 2000
          });
          
        } else {
          console.error('🔗 [被邀请者] 加入聊天失败:', res.result?.error);
          this.addSystemMessage('加入聊天失败，请重试');
        }
      },
      fail: (err) => {
        console.error('🔗 [被邀请者] 调用joinByInvite失败:', err);
        this.addSystemMessage('网络错误，加入聊天失败');
      }
    });
  },

  /**
   * 监听新参与者加入
   */
  startWatchingForNewParticipants: function(chatId) {
    console.log('🎯 开始监听新参与者加入:', chatId);
    
    try {
      const db = wx.cloud.database();
      
      // 如果已有监听器，先关闭
      if (this.participantWatcher) {
        this.participantWatcher.close();
        this.participantWatcher = null;
      }
      
      this.participantWatcher = db.collection('conversations')
        .doc(chatId)
        .watch({
          onChange: snapshot => {
            console.log('🎯 监听到聊天状态变化:', snapshot);
            
            if (snapshot.docs && snapshot.docs.length > 0) {
              const chatData = snapshot.docs[0];
              const participants = chatData.participants || [];
              
              console.log('🎯 当前数据库中的参与者:', participants);
              console.log('🎯 当前页面中的参与者:', this.data.participants);
              
              // 检查是否有新参与者加入
              if (participants.length > this.data.participants.length) {
                console.log('🎯 检测到新参与者加入，参与者数量从', this.data.participants.length, '增加到', participants.length);
                
                // 延迟一下再获取参与者信息，确保数据同步完成
                setTimeout(() => {
                  this.fetchChatParticipants();
                  this.fetchMessages(); // 同时刷新消息列表
                }, 500);
                
                // 添加系统消息
                this.addSystemMessage('有新朋友加入了聊天！');
                
                // 继续监听，不关闭监听器
              }
            }
          },
          onError: err => {
            console.error('🎯 监听出错:', err);
          }
        });
        
      console.log('🎯 监听器启动成功');
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
      senderId: 'system',
      isSelf: false,
      type: 'system',
      content: `${participantName}加入了私密聊天`,
      time: this.formatTime(new Date()),
      timeDisplay: this.formatTime(new Date()),
      showTime: true,
      status: 'sent',
      destroyed: false,
      destroying: false,
      remainTime: 0,
      avatar: '/assets/images/default-avatar.png',
      isSystem: true
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
            
            // 获取头像
            let avatar = '/assets/images/default-avatar.png'; // 默认头像
            if (isSelf) {
              // 自己的头像
              avatar = that.data.currentUser?.avatarUrl || '/assets/images/default-avatar.png';
            } else {
              // 对方的头像，从参与者列表中查找
              // 支持多种ID字段格式
              const sender = that.data.participants.find(p => 
                p.openId === msg.senderId || p.id === msg.senderId
              );
              avatar = sender?.avatarUrl || sender?.avatar || '/assets/images/default-avatar.png';
            }
            
            return {
              id: msg._id,
              senderId: isSelf ? 'self' : (msg.type === 'system' ? 'system' : 'other'),
              isSelf: isSelf,
              content: msg.content,
              type: msg.type,
              time: that.formatTime(new Date(msg.sendTime)),
              timeDisplay: that.formatTime(new Date(msg.sendTime)),
              showTime: true, // 简化处理，都显示时间
              status: msg.status,
              destroyed: msg.destroyed,
              destroying: false,
              remainTime: 0,
              avatar: avatar,
              isSystem: msg.type === 'system'
            };
          });
          
          console.log(`🔍 处理后的消息数据 ${messages.length} 条:`, messages);
          
          that.setData({
            messages: messages,
            isLoading: false
          });
          
          // 🔧 检测是否需要修复连接
          that.checkAndFixConnection(messages);
          
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
    const currentUser = this.data.currentUser;
    const mockMessages = [
      {
        id: '1',
        senderId: 'other',
        isSelf: false,
        content: '你好，这是一条测试消息',
        type: 'text',
        time: '14:20',
        timeDisplay: '14:20',
        showTime: true,
        status: 'received',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: '/assets/images/default-avatar.png',
        isSystem: false
      },
      {
        id: '2',
        senderId: 'self',
        isSelf: true,
        content: '你好，很高兴认识你',
        type: 'text',
        time: '14:21',
        timeDisplay: '14:21',
        showTime: true,
        status: 'sent',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: currentUser?.avatarUrl || '/assets/images/default-avatar.png',
        isSystem: false
      },
      {
        id: '3',
        senderId: 'other',
        isSelf: false,
        content: '这条消息会自动销毁',
        type: 'text',
        time: '14:22',
        timeDisplay: '14:22',
        showTime: true,
        status: 'received',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: '/assets/images/default-avatar.png',
        isSystem: false
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
      isSelf: true,
      content: content,
      type: 'text',
      time: this.formatTime(new Date()),
      timeDisplay: this.formatTime(new Date()),
      showTime: true,
      status: 'sending',
      destroyed: false,
      destroying: false,
      remainTime: 0,
      avatar: this.data.currentUser?.avatarUrl || '/assets/images/default-avatar.png',
      isSystem: false
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
    console.log('🔥 开始销毁消息:', messageId);
    
    // 🔥 改用本地处理，不调用云函数，避免"云函数不存在"错误
    const { messages } = this.data;
    const updatedMessages = messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          destroyed: true,
          content: '[已销毁]',
          destroying: false,
          remainTime: 0
        };
      }
      return msg;
    });
    
    this.setData({
      messages: updatedMessages
    });
    
    console.log('✅ 消息已本地销毁:', messageId);
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
      isSelf: false,
      content: content,
      type: 'system',
      time: this.formatTime(new Date()),
      timeDisplay: this.formatTime(new Date()),
      showTime: true,
      status: 'sent',
      destroyed: false,
      destroying: false,
      remainTime: 0,
      avatar: '/assets/images/default-avatar.png',
      isSystem: true
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
          
          // 获取聊天参与者信息
          this.fetchChatParticipants();
          
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
                
                // 获取聊天参与者信息
                this.fetchChatParticipants();
                
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
   * 输入框内容变化处理
   */
  onInputChange: function(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  /**
   * 返回上一页
   */
  goBack: function() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        // 如果返回失败，则跳转到首页
        wx.reLaunch({
          url: '/pages/home/home'
        });
      }
    });
  },

  /**
   * 显示聊天菜单
   */
  showChatMenu: function() {
    wx.showActionSheet({
      itemList: ['聊天详情', '清空聊天记录', '举报', '添加到桌面'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0: // 聊天详情
            wx.navigateTo({
              url: `/app/pages/chat/detail?id=${this.data.contactId}`
            });
            break;
          case 1: // 清空聊天记录
            this.clearChatHistory();
            break;
          case 2: // 举报
            wx.showToast({
              title: '举报功能开发中',
              icon: 'none'
            });
            break;
          case 3: // 添加到桌面
            wx.showToast({
              title: '添加到桌面功能开发中',
              icon: 'none'
            });
            break;
        }
      }
    });
  },

  /**
   * 清空聊天记录
   */
  clearChatHistory: function() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空聊天记录吗？此操作不可恢复。',
      confirmText: '清空',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            messages: []
          });
          wx.showToast({
            title: '聊天记录已清空',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 长按消息处理
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
   * 打开表情选择器
   */
  openEmojiPicker: function() {
    wx.showToast({
      title: '表情功能开发中',
      icon: 'none'
    });
  },

  /**
   * 开启语音输入
   */
  toggleVoiceInput: function() {
    wx.showToast({
      title: '语音功能开发中',
      icon: 'none'
    });
  },

  /**
   * 打开更多功能
   */
  openMoreFunctions: function() {
    wx.showActionSheet({
      itemList: ['发送图片', '语音通话', '视频通话', '销毁设置'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0: // 发送图片
            wx.showToast({
              title: '图片发送功能开发中',
              icon: 'none'
            });
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
            wx.showToast({
              title: '销毁设置功能开发中',
              icon: 'none'
            });
            break;
        }
      }
    });
  },

  /**
   * 销毁消息
   */
  destroyMessage: function(msgId) {
    wx.showModal({
      title: '确认销毁',
      content: '确定要销毁这条消息吗？',
      success: (res) => {
        if (res.confirm) {
          // 这里调用销毁消息的云函数
          wx.showToast({
            title: '消息销毁功能开发中',
            icon: 'none'
          });
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
  },

  /**
   * 更新动态标题
   * 规则：
   * 1. 只有自己时显示自己的名字
   * 2. 2人聊天时显示"我和好友的名字（2）"  
   * 3. 超过2人显示"群聊（人数）"
   */
  updateDynamicTitle: function() {
    const { participants, currentUser } = this.data;
    const participantCount = participants.length;
    let title = '';

    console.log('🏷️ [统一版本] 更新动态标题，参与者数量:', participantCount, '参与者:', participants);
    console.log('🏷️ [统一版本] 当前用户:', currentUser);

    if (participantCount <= 1) {
      // 只有自己，显示自己的名字
      title = currentUser?.nickName || '我';
      console.log('🏷️ [统一版本] 单人聊天，显示用户名:', title);
    } else if (participantCount === 2) {
      // 两个人，显示"我和好友的名字（2）"
      const currentUserOpenId = currentUser?.openId;
      console.log('🏷️ [统一版本] 当前用户openId:', currentUserOpenId);
      
      const otherParticipant = participants.find(p => {
        const pOpenId = p.openId || p.id;
        console.log('🏷️ [统一版本] 比较参与者openId:', pOpenId, '与当前用户:', currentUserOpenId);
        return pOpenId !== currentUserOpenId;
      });
      
      console.log('🏷️ [统一版本] 找到的对方参与者:', otherParticipant);
      
      if (otherParticipant) {
        const otherName = otherParticipant?.nickName || otherParticipant?.name || '好友';
        title = `我和${otherName}（2）`;
        console.log('🏷️ [统一版本] 双人聊天，对方名字:', otherName, '最终标题:', title);
      } else {
        // 如果没找到对方，可能是参与者信息还在同步中
        title = currentUser?.nickName || '我';
        console.log('🏷️ [统一版本] 未找到对方参与者，暂时显示自己名字:', title);
        
        // 延迟重新获取参与者信息
        setTimeout(() => {
          console.log('🏷️ [统一版本] 延迟重新获取参与者信息');
          this.fetchChatParticipants();
        }, 2000);
      }
    } else {
      // 超过2人，显示"群聊（人数）"
      title = `群聊（${participantCount}）`;
      console.log('🏷️ [统一版本] 群聊，人数:', participantCount);
    }

    console.log('🏷️ [统一版本] 动态标题更新为:', title);

    this.setData({
      dynamicTitle: title,
      chatTitle: title // 同时更新chatTitle确保兼容性
    }, () => {
      console.log('🏷️ [统一版本] setData回调执行，当前dynamicTitle:', this.data.dynamicTitle);
      
      // 强制刷新页面（调试用）
      if (this.data.isDebugMode) {
        this.setData({
          dynamicTitle: title + ' ✓' // 添加标记确认更新
        });
      }
    });

    console.log('🏷️ [统一版本] 页面数据设置完成，当前dynamicTitle:', this.data.dynamicTitle);
  },

  /**
   * 创建会话记录
   */
  createConversationRecord: function(chatId) {
    return new Promise((resolve, reject) => {
      console.log('🔥 创建会话记录，chatId:', chatId);
      
      wx.cloud.callFunction({
        name: 'createChat',
        data: {
          chatId: chatId,
          message: '您创建了私密聊天，可点击右上角菜单分享链接邀请朋友加入'
        },
        success: res => {
          console.log('🔥 创建会话记录成功:', res);
          if (res.result && res.result.success) {
            resolve(res.result);
          } else {
            reject(new Error(res.result?.error || '创建会话记录失败'));
          }
        },
        fail: err => {
          console.error('🔥 创建会话记录失败:', err);
          reject(err);
        }
      });
    });
  },

  /**
   * 获取聊天参与者信息
   */
  fetchChatParticipants: function() {
    const chatId = this.data.contactId;
    if (!chatId) return;

    console.log('👥 [统一版本] 获取聊天参与者信息，chatId:', chatId);

    wx.cloud.callFunction({
      name: 'getChatParticipants',
      data: {
        chatId: chatId
      },
      success: res => {
        console.log('👥 [统一版本] 获取参与者成功:', res);
        
        if (res.result && res.result.success && res.result.participants) {
          const participants = res.result.participants;
          const currentUserOpenId = this.data.currentUser?.openId;
          
          console.log('👥 [统一版本] 原始参与者数据:', participants);
          console.log('👥 [统一版本] 当前用户OpenId:', currentUserOpenId);
          
          // 标准化参与者数据，确保字段统一
          const normalizedParticipants = participants.map(p => {
            const participantOpenId = p.id || p.openId;
            const normalized = {
              id: participantOpenId,
              openId: participantOpenId,
              nickName: p.nickName || p.name || '用户',
              avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
              isCreator: p.isCreator || false,
              isJoiner: p.isJoiner || false,
              isSelf: participantOpenId === currentUserOpenId
            };
            
            console.log('👥 [统一版本] 标准化参与者:', {
              原始: p,
              标准化: normalized,
              是否当前用户: normalized.isSelf
            });
            
            return normalized;
          });

          console.log('👥 [统一版本] 最终标准化参与者列表:', normalizedParticipants);

          // 更新参与者列表
          this.setData({
            participants: normalizedParticipants
          });

          // 更新动态标题
          this.updateDynamicTitle();
        } else {
          console.log('👥 [统一版本] 获取参与者失败，尝试备用方案');
          
          // 如果获取失败，确保至少有当前用户在参与者列表中
          const currentUser = this.data.currentUser;
          if (currentUser && this.data.participants.length === 0) {
            console.log('👥 [统一版本] 使用当前用户作为默认参与者');
            this.setData({
              participants: [currentUser]
            });
            this.updateDynamicTitle();
          }
          
          // 同时尝试从消息推断参与者
          setTimeout(() => {
            this.inferParticipantsFromMessages();
          }, 1000);
        }
      },
      fail: err => {
        console.error('👥 [统一版本] 获取参与者请求失败:', err);
        console.log('👥 [统一版本] 网络错误，尝试备用方案');
        
        // 网络错误时，尝试从消息推断参与者
        this.inferParticipantsFromMessages();
      }
    });
  },

  /**
   * 手动修复连接 - 当检测到有消息但参与者未正确连接时调用
   */
  manualFixConnection: function() {
    console.log('🔧 [手动修复] 开始修复连接问题');
    
    const chatId = this.data.contactId;
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    // 强制调用getChatParticipants，尝试获取所有参与者
    wx.cloud.callFunction({
      name: 'getChatParticipants',
      data: {
        chatId: chatId
      },
      success: (res) => {
        console.log('🔧 [手动修复] 获取参与者结果:', res.result);
        
        if (res.result && res.result.success && res.result.participants) {
          // 检查是否有其他参与者
          const allParticipants = res.result.participants;
          const currentUserOpenId = userInfo.openId;
          
          console.log('🔧 [手动修复] 所有参与者:', allParticipants);
          console.log('🔧 [手动修复] 当前用户OpenId:', currentUserOpenId);
          
          // 查找其他参与者
          const otherParticipants = allParticipants.filter(p => 
            (p.openId || p.id) !== currentUserOpenId
          );
          
          if (otherParticipants.length > 0) {
            console.log('🔧 [手动修复] 发现其他参与者，更新连接');
            
            // 标准化参与者数据
            const standardizedParticipants = allParticipants.map(p => ({
              id: p.id || p.openId,
              openId: p.id || p.openId,
              nickName: p.nickName || p.name || '用户',
              avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
              isSelf: (p.id || p.openId) === currentUserOpenId
            }));
            
            // 更新参与者列表
            this.setData({
              participants: standardizedParticipants
            });
            
            // 更新标题
            this.updateDynamicTitle();
            
            console.log('🔧 [手动修复] 连接修复完成，参与者数量:', standardizedParticipants.length);
          } else {
            console.log('🔧 [手动修复] 未发现其他参与者，尝试通过消息推断');
            this.inferParticipantsFromMessages();
          }
        }
      },
      fail: (err) => {
        console.error('🔧 [手动修复] 获取参与者失败:', err);
        // 尝试通过消息推断参与者
        this.inferParticipantsFromMessages();
      }
    });
  },

  /**
   * 通过消息推断参与者 - 当无法从数据库获取参与者时的备用方案
   */
  inferParticipantsFromMessages: function() {
    console.log('🔧 [推断参与者] 开始通过消息推断参与者');
    
    const messages = this.data.messages || [];
    const app = getApp();
    const currentUserOpenId = app.globalData.userInfo.openId;
    const uniqueParticipants = new Map();
    
    // 添加当前用户
    uniqueParticipants.set(currentUserOpenId, {
      id: currentUserOpenId,
      openId: currentUserOpenId,
      nickName: app.globalData.userInfo.nickName,
      avatarUrl: app.globalData.userInfo.avatarUrl,
      isSelf: true
    });
    
    // 从消息中推断其他参与者
    messages.forEach(msg => {
      if (msg.senderId && msg.senderId !== currentUserOpenId && msg.senderId !== 'system' && msg.senderId !== 'self') {
        if (!uniqueParticipants.has(msg.senderId)) {
          // 推断参与者信息
          uniqueParticipants.set(msg.senderId, {
            id: msg.senderId,
            openId: msg.senderId,
            nickName: '朋友', // 默认名称，无法从消息推断具体名字
            avatarUrl: '/assets/images/default-avatar.png',
            isSelf: false
          });
        }
      }
    });
    
    const inferredParticipants = Array.from(uniqueParticipants.values());
    console.log('🔧 [推断参与者] 推断出的参与者列表:', inferredParticipants);
    
    if (inferredParticipants.length > 1) {
      // 更新参与者列表
      this.setData({
        participants: inferredParticipants
      });
      
      // 更新标题
      this.updateDynamicTitle();
      
      console.log('🔧 [推断参与者] 通过消息推断完成，参与者数量:', inferredParticipants.length);
         } else {
       console.log('🔧 [推断参与者] 未能推断出其他参与者');
     }
   },

   /**
    * 检测并修复连接问题
    */
   checkAndFixConnection: function(messages) {
     console.log('🔧 [连接检测] 开始检测连接问题');
     
     const participants = this.data.participants || [];
     const app = getApp();
     const currentUserOpenId = app.globalData.userInfo.openId;
     
     // 检查参与者数量
     if (participants.length <= 1) {
       console.log('🔧 [连接检测] 参与者数量异常，只有', participants.length, '个参与者');
       
       // 检查消息中是否有其他发送者
       const hasOtherSenders = messages.some(msg => 
         msg.senderId && 
         msg.senderId !== currentUserOpenId && 
         msg.senderId !== 'system' && 
         msg.senderId !== 'self'
       );
       
       if (hasOtherSenders) {
         console.log('🔧 [连接检测] 检测到有其他发送者的消息，但参与者列表不完整，开始修复');
         
         // 延迟1秒执行修复，确保页面初始化完成
         setTimeout(() => {
           this.manualFixConnection();
         }, 1000);
       } else {
         console.log('🔧 [连接检测] 没有其他发送者，可能是新聊天');
       }
     } else {
       console.log('🔧 [连接检测] 参与者数量正常:', participants.length);
     }
   },

   /**
    * 生命周期函数--监听页面卸载
    */
   onUnload: function() {
     console.log('[聊天页面] 页面卸载，清理监听器');
     
     // 清理参与者监听器
     if (this.participantWatcher) {
       this.participantWatcher.close();
       this.participantWatcher = null;
       console.log('[聊天页面] 参与者监听器已清理');
     }
     
     // 清理聊天创建检查定时器
     if (this.chatCreationTimer) {
       clearInterval(this.chatCreationTimer);
       this.chatCreationTimer = null;
       console.log('[聊天页面] 聊天创建定时器已清理');
     }
   }
 })  