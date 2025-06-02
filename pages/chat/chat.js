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
    showWelcomeHint: false, // 是否显示欢迎提示
    isCreatingChat: false, // 是否正在创建聊天
    createChatRetryCount: 0, // 聊天创建重试次数
    maxRetryCount: 5, // 最大重试次数
    chatCreationStatus: '' // 聊天创建状态
  },

  /**
   * 生命周期函数--监听页面加载
   * @param {Object} options - 页面参数
   */
  onLoad: function (options) {
    console.log('[邀请流程] 聊天页onLoad，携带参数:', options);
    
    // 🔥 优先检查是否从邀请链接进入
    const fromInvite = options.fromInvite === 'true';
    if (fromInvite) {
      console.log('[邀请流程] 检测到从邀请链接进入');
      // 保存邀请信息到更可靠的存储
      const inviteData = {
        chatId: options.id,
        inviter: options.inviter ? decodeURIComponent(options.inviter) : '朋友',
        fromInvite: true,
        timestamp: Date.now()
      };
      
      try {
        wx.setStorageSync('current_invite', inviteData);
        wx.setStorageSync('pending_chat_id', options.id);
        console.log('[邀请流程] 邀请信息已保存:', inviteData);
      } catch (e) {
        console.error('[邀请流程] 保存邀请信息失败:', e);
      }
    }
    
    // 获取app实例
    const app = getApp();
    
    // 使用全局统一的邀请参数处理
    const inviteInfo = app.handleInviteParams(options);
    
    // 解析聊天参数，优先使用options.id，如果没有则使用邀请信息
    let chatId = options.id;
    let inviter = options.inviter || '';
    
    // 🔥 检查并修复无效的聊天ID
    if (typeof chatId !== 'string' || chatId === '[object Object]' || chatId === 'undefined' || chatId === 'null') {
      console.error('[邀请流程] 检测到无效的聊天ID:', chatId, '类型:', typeof chatId);
      chatId = null; // 重置为null以触发后续处理
    }
    
    if (!chatId && inviteInfo && inviteInfo.inviteId) {
      chatId = inviteInfo.inviteId;
      inviter = inviteInfo.inviter;
      console.log('[邀请流程] 使用邀请信息作为聊天参数:', inviteInfo);
    }
    
    // 检查必要的id参数
    if (!chatId) {
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
                url: '/pages/home/home'
              });
            }
          });
        }
      });
      return;
    }
    
    // 立即结束加载状态，避免界面卡在loading
    this.setData({
      isLoading: false
    });
    
    // 获取当前用户信息
    const userInfo = app.globalData.userInfo || {};
    
    // 检查用户是否已登录，如果未登录，保存邀请信息后跳转到登录页
    if (!app.globalData.hasLogin || !userInfo.nickName) {
      console.log('[邀请流程] 用户未登录，跳转到登录页面');
      
      // 保存邀请信息
      app.saveInviteInfo(chatId, inviter ? decodeURIComponent(inviter) : '朋友');
      
      // 尝试多种路径格式跳转到登录页
      this.tryNavigateToLogin();
      return;
    }
    
    // 以下是已登录用户的处理逻辑
    // 使用安全解码，避免btoa错误
    if (inviter) {
      try {
        const encoding = require('../../app/utils/encoding.js');
        inviter = encoding.safeDecodeNickname(inviter);
      } catch (e) {
        console.error('解码inviter失败:', e);
        inviter = '朋友'; // 降级方案
      }
    }
    
    // 检查是否是从邀请链接进入
    const isFromInvite = !!inviter || options.fromInvite === 'true';
    
    // 🔥 检查是否已标记聊天开始
    const urlChatStarted = options.chatStarted === 'true';
    
    // 尝试从本地存储获取聊天状态
    let localChatStarted = false;
    try {
      const chatInfo = wx.getStorageSync(`chat_info_${chatId}`);
      if (chatInfo && chatInfo.chatStarted) {
        localChatStarted = true;
        console.log('[邀请流程] 从本地存储检测到聊天已开始');
      }
    } catch (e) {
      console.error('[邀请流程] 读取本地聊天状态失败:', e);
    }
    
    // 如果URL参数或本地存储标记为已开始，则不进入等待状态
    const chatAlreadyStarted = urlChatStarted || localChatStarted;
    
    console.log('[邀请流程] 聊天状态检查:', {
      isFromInvite,
      urlChatStarted,
      localChatStarted,
      chatAlreadyStarted
    });
    
    // 设置页面数据
    this.setData({
      chatId: chatId,
      isNewChat: options.isNewChat === 'true',
      contactName: inviter || options.name || '聊天',
      showWelcomeHint: false,
      // 🔥 只有在真正需要等待时才显示创建状态
      isCreatingChat: isFromInvite && !chatAlreadyStarted,
      chatCreationStatus: (isFromInvite && !chatAlreadyStarted) ? '正在建立连接...' : ''
    });
    
    // 更新导航栏标题
    this.updateNavigationBarTitle();
    
    // 如果是正在创建聊天状态，启动轮询检查
    if (this.data.isCreatingChat) {
      // 添加系统消息
      this.addSystemMessage('正在与对方建立聊天...');
      
      // 启动轮询
      this.startChatCreationCheck();
    } else {
      // 加载聊天记录
      this.loadMessages();
    }
    
    // 设置右上角按钮，开启分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    });
    
    // 标记为已处理邀请，在5秒后清理邀请信息
    if (inviteInfo) {
      setTimeout(() => {
        app.clearInviteInfo();
      }, 5000);
    }
  },
  
  /**
   * 尝试多种路径格式跳转到登录页
   */
  tryNavigateToLogin: function() {
    const loginUrls = [
      '/pages/login/login',
      '../login/login',
      '/app/pages/login/login'
    ];
    
    const app = getApp();
    app.tryNavigateToUrls(loginUrls, 0, null, () => {
      wx.showModal({
        title: '错误',
        content: '无法跳转到登录页，请重启小程序',
        showCancel: false
      });
    });
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
        
        // 加载聊天记录
        this.loadMessages();
        
        // 添加系统消息
        this.addSystemMessage('聊天创建超时，已自动为您进入聊天。如遇问题，请联系对方重新邀请。');
      }
    }, 20000);
  },
  
  /**
   * 检查聊天创建状态
   */
  checkChatCreationStatus: function() {
    const app = getApp();
    const { chatId, createChatRetryCount, maxRetryCount } = this.data;
    
    console.log(`[邀请流程] 检查聊天创建状态: 第${createChatRetryCount+1}/${maxRetryCount}次`);
    
    // 更新状态文本
    this.setData({
      chatCreationStatus: `正在建立连接(${createChatRetryCount+1}/${maxRetryCount})...`
    });
    
    // 检查重试次数
    if (createChatRetryCount >= 2) {
      // 超过2次就尝试主动创建一次，然后退出创建状态
      this.tryCreateChat(true);
      
      setTimeout(() => {
        clearInterval(this.chatCreationTimer);
        console.log('[邀请流程] 已尝试检查多次，直接进入聊天界面');
        
        this.setData({
          isCreatingChat: false,
          chatCreationStatus: ''
        });
        
        // 加载聊天记录
        this.loadMessages();
        
        // 添加系统消息
        this.addSystemMessage('聊天已准备就绪，可以开始聊天了');
      }, 1500);
      
      return;
    }
    
    // 调用云函数检查聊天是否真的创建成功
    wx.cloud.callFunction({
      name: 'checkChatStatus',
      data: {
        chatId: chatId
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
          
          // 加载聊天记录
          this.loadMessages();
          
          // 添加系统消息
          this.addSystemMessage('聊天已创建成功，你们可以开始聊天了');
          
          // 主动调用startConversation通知对方
          this.notifyConversationStarted();
          
          // 清除邀请信息
          app.clearInviteInfo();
        } else {
          // 增加重试计数
          this.setData({
            createChatRetryCount: createChatRetryCount + 1
          });
          
          // 如果第一次检查失败，直接尝试创建
          if (createChatRetryCount === 0) {
            this.tryCreateChat(false);
          }
          
          // 如果已经是第二次检查，准备退出创建状态
          if (createChatRetryCount === 1) {
            // 进行最后一次尝试创建
            setTimeout(() => {
              this.tryCreateChat(true);
              
              setTimeout(() => {
                if (this.data.isCreatingChat) {
                  clearInterval(this.chatCreationTimer);
                  console.log('[邀请流程] 两次检查后直接进入聊天界面');
                  
                  this.setData({
                    isCreatingChat: false,
                    chatCreationStatus: ''
                  });
                  
                  // 加载聊天记录
                  this.loadMessages();
                  
                  // 添加系统消息
                  this.addSystemMessage('聊天已创建，现在可以开始聊天了');
                  
                  // 主动调用startConversation通知对方
                  this.notifyConversationStarted();
                }
              }, 1500);
            }, 500);
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
        
        // 如果已经是第二次检查失败，直接进入聊天并尝试最后一次通知
        if (createChatRetryCount === 1) {
          setTimeout(() => {
            this.tryCreateChat(true);
            
            setTimeout(() => {
              if (this.data.isCreatingChat) {
                clearInterval(this.chatCreationTimer);
                console.log('[邀请流程] 检查失败，直接进入聊天界面');
                
                this.setData({
                  isCreatingChat: false,
                  chatCreationStatus: ''
                });
                
                // 加载聊天记录
                this.loadMessages();
                
                // 添加系统消息
                this.addSystemMessage('无法创建聊天，但您仍可以使用聊天功能');
                
                // 主动调用startConversation通知对方
                this.notifyConversationStarted();
              }
            }, 1500);
          }, 500);
        }
      }
    });
  },
  
  /**
   * 通知会话已开始
   */
  notifyConversationStarted: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    
    console.log('[邀请流程] 主动通知对方聊天已开始');
    
    wx.cloud.callFunction({
      name: 'startConversation',
      data: {
        conversationId: this.data.chatId,
        userName: userInfo.nickName || '用户'
      },
      success: res => {
        console.log('[邀请流程] 通知开始聊天结果:', res);
      },
      fail: err => {
        console.error('[邀请流程] 通知开始聊天失败:', err);
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
    
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    
    // 调用云函数创建聊天
    wx.cloud.callFunction({
      name: 'startConversation',
      data: {
        conversationId: this.data.chatId,
        userName: userInfo.nickName || '用户'
      },
      success: res => {
        console.log('[邀请流程] 创建聊天结果:', res);
        
        if (res.result && res.result.success) {
          clearInterval(this.chatCreationTimer);
          
          this.setData({
            isCreatingChat: false,
            chatCreationStatus: ''
          });
          
          // 加载聊天记录
          this.loadMessages();
          
          // 添加系统消息
          this.addSystemMessage('聊天已成功创建，可以开始交流了');
        } else {
          // 创建失败，显示错误消息
          this.setData({
            chatCreationStatus: '创建聊天失败，继续重试...'
          });
          
          // 如果是初始创建尝试失败，也加载消息界面而不是无限等待
          if (isInitial) {
            setTimeout(() => {
              console.log('[邀请流程] 初始创建失败，强制进入聊天');
              clearInterval(this.chatCreationTimer);
              
              this.setData({
                isCreatingChat: false,
                chatCreationStatus: ''
              });
              
              // 加载聊天记录
              this.loadMessages();
            }, 1500);
          }
        }
      },
      fail: err => {
        console.error('[邀请流程] 创建聊天失败:', err);
        
        // 创建失败，显示错误消息
        this.setData({
          chatCreationStatus: '创建聊天失败，继续重试...'
        });
        
        // 如果是初始创建尝试失败，还是尝试加载界面
        if (isInitial) {
          setTimeout(() => {
            console.log('[邀请流程] 初始创建失败，强制进入聊天');
            clearInterval(this.chatCreationTimer);
            
            this.setData({
              isCreatingChat: false,
              chatCreationStatus: ''
            });
            
            // 加载聊天记录
            this.loadMessages();
          }, 1500);
        }
      }
    });
  },

  /**
   * 主动更新参与者信息
   */
  updateParticipantsInfo: function() {
    const app = getApp();
    const { chatId, participants } = this.data;
    
    // 确保聊天信息存在
    if (!app.globalData.chats) {
      app.globalData.chats = {};
    }
    
    if (!app.globalData.chats[chatId]) {
      app.globalData.chats[chatId] = {
        id: chatId,
        participants: participants,
        lastActive: new Date().getTime(),
        createdAt: new Date().getTime(),
        __updating: false // 添加互斥锁
      };
    }
    
    const chatInfo = app.globalData.chats[chatId];
    
    // 检查互斥锁，避免并发更新
    if (chatInfo.__updating) {
      console.log('当前聊天信息正在被更新，跳过本次更新');
      return;
    }
    
    // 设置互斥锁
    chatInfo.__updating = true;
    
    try {
      // 检查当前用户是否在参与者列表中
      const userInfo = app.globalData.userInfo || {};
      const currentUserInParticipants = participants.some(p => 
        p.isSelf || p.id === userInfo.openId || (userInfo.nickName && p.nickName === userInfo.nickName)
      );
      
      // 如果当前用户不在列表中，添加
      if (!currentUserInParticipants && userInfo.nickName) {
        console.log('将当前用户添加到参与者列表');
        const updatedParticipants = [...participants, {
          id: userInfo.openId || 'user_' + new Date().getTime(),
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          isSelf: true
        }];
        
        this.setData({
          participants: updatedParticipants
        });
        
        chatInfo.participants = updatedParticipants;
      }
      
      // 如果是从邀请进入，检查邀请者是否在列表中
      if (this.data.contactName && participants.length < 2) {
        const inviterInParticipants = participants.some(p => 
          !p.isSelf && p.nickName === this.data.contactName
        );
        
        // 如果邀请者不在列表中，添加
        if (!inviterInParticipants) {
          console.log('将邀请者添加到参与者列表');
          const updatedParticipants = [...participants, {
            id: 'inviter_' + new Date().getTime(),
            nickName: this.data.contactName,
            avatarUrl: '/assets/images/avatar1.png',
            isSelf: false
          }];
          
          this.setData({
            participants: updatedParticipants
          });
          
          chatInfo.participants = updatedParticipants;
        }
      }
      
      // 更新时间戳
      chatInfo.lastActive = new Date().getTime();
    } finally {
      // 释放互斥锁
      chatInfo.__updating = false;
    }
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
    console.log('[邀请流程] 聊天页面显示');
    
    // 获取app实例
    const app = getApp();
    
    // 检查用户是否已登录，如果未登录，保存邀请信息后跳转到登录页
    if (!app.globalData.hasLogin || !app.globalData.userInfo) {
      console.log('[邀请流程] 用户未登录，跳转到登录页面');
      
      // 保存邀请信息
      if (this.data.chatId) {
        app.saveInviteInfo(this.data.chatId, this.data.contactName || '朋友');
      }
      
      // 跳转到登录页
      this.tryNavigateToLogin();
      return;
    }
    
    // 如果仍在创建聊天状态，继续检查
    if (this.data.isCreatingChat && !this.chatCreationTimer) {
      console.log('[邀请流程] 聊天页面显示时仍在创建状态，重新启动检查');
      this.startChatCreationCheck();
    }
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
   * 销毁消息 - 临时禁用
   */
  destroyMessage: function(msgId) {
    // 临时禁用销毁功能，专注于邀请功能测试
    wx.showToast({
      title: '销毁功能暂时禁用',
      icon: 'none'
    });
    return;
    
    // 以下代码暂时注释
    /*
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
    */
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