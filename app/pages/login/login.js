/**
 * 登录页面
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    isLoading: false,
    avatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    nickName: '', // 添加昵称字段
    inviteId: '', // 邀请ID
    inviter: '', // 邀请人
    isInvited: false, // 是否是被邀请的用户
    isDebugMode: false // 调试模式开关
  },

  /**
   * 页面加载时执行
   */
  onLoad: function(options) {
    console.log('[邀请流程] 登录页面加载，参数:', options);
    
    // 检查云环境是否已初始化
    const app = getApp();
    if (!app.globalData.cloudInitialized) {
      console.log('云环境未初始化，开始初始化...');
      app.initCloud();
    } else {
      console.log('云环境已初始化');
    }

    // 🔥 优先检查是否有已保存的邀请信息
    this.checkSavedInviteInfo();

    // 🔥 检查启动参数中是否包含分享链接信息
    this.checkShareLinkParams();

    // 处理可能存在的邀请参数
    this.handleInviteParams(options);
    
    // 检查是否开启调试模式
    this.checkDebugMode();
  },

  /**
   * 检查已保存的邀请信息
   */
  checkSavedInviteInfo: function() {
    console.log('[邀请流程] 检查已保存的邀请信息');
    
    try {
      // 检查app级别的邀请信息
      const app = getApp();
      const appInviteInfo = app.getStoredInviteInfo();
      
      if (appInviteInfo && appInviteInfo.inviteId) {
        console.log('[邀请流程] 发现app级别的邀请信息:', appInviteInfo);
        
        this.setData({
          inviteId: appInviteInfo.inviteId,
          inviter: appInviteInfo.inviter || '朋友',
          isInvited: true
        });
        
        return appInviteInfo;
      }
      
      // 检查本地存储的邀请信息
      const localInviteInfo = wx.getStorageSync('pendingInvite');
      if (localInviteInfo && localInviteInfo.inviteId) {
        console.log('[邀请流程] 发现本地存储的邀请信息:', localInviteInfo);
        
        this.setData({
          inviteId: localInviteInfo.inviteId,
          inviter: localInviteInfo.inviter || '朋友',
          isInvited: true
        });
        
        return localInviteInfo;
      }
      
      console.log('[邀请流程] 未发现已保存的邀请信息');
      return null;
      
    } catch (error) {
      console.error('[邀请流程] 检查已保存的邀请信息失败:', error);
      return null;
    }
  },

  /**
   * 检查分享链接参数
   */
  checkShareLinkParams: function() {
    try {
      const app = getApp();
      const launchOptions = app.globalData.launchOptions;
      
      console.log('[邀请流程] 检查启动参数中的分享信息:', launchOptions);
      
      if (launchOptions && launchOptions.path) {
        // 检查是否是分享链接但被重定向到登录页
        if (launchOptions.path.includes('share') && launchOptions.query) {
          console.log('[邀请流程] 检测到分享链接被重定向，提取参数:', launchOptions.query);
          
          // 从query字符串中提取参数
          const queryParams = this.parseQueryString(launchOptions.query);
          
          if (queryParams.chatId && queryParams.inviter) {
            console.log('[邀请流程] 成功提取分享参数:', queryParams);
            
            // 保存邀请信息
            const inviteInfo = {
              chatId: queryParams.chatId,
              inviter: decodeURIComponent(queryParams.inviter),
              isInvitee: queryParams.isInvitee === 'true',
              timestamp: Date.now(),
              source: 'share_link_redirect'
            };
            
            wx.setStorageSync('pendingInvite', inviteInfo);
            
            this.setData({
              inviteId: inviteInfo.chatId,
              inviter: inviteInfo.inviter,
              isInvited: true
            });
            
            console.log('[邀请流程] 已保存重定向的分享邀请信息:', inviteInfo);
          }
        }
      }
    } catch (error) {
      console.error('[邀请流程] 检查分享链接参数失败:', error);
    }
  },

  /**
   * 解析query字符串
   */
  parseQueryString: function(queryString) {
    const params = {};
    // 🔥 检查queryString是否为字符串
    if (queryString && typeof queryString === 'string') {
      const pairs = queryString.split('&');
      pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          params[key] = value;
        }
      });
    } else if (queryString && typeof queryString === 'object') {
      // 🔥 如果queryString已经是对象，直接返回
      return queryString;
    }
    return params;
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('登录页面显示');
    
    // 尝试从全局参数中提取邀请信息
    try {
      const app = getApp();
      if (app.globalData.launchOptions) {
        this.handleInviteParams(app.globalData.launchOptions);
      }
    } catch (error) {
      console.error('处理全局启动参数失败:', error);
    }
  },
  
  /**
   * 处理邀请参数
   * @param {Object} options - 可能包含邀请信息的参数对象
   */
  handleInviteParams: function(options) {
    console.log('[邀请流程] 处理可能的邀请参数:', options);
    
    // 🔥 直接处理分享链接传来的参数
    const chatId = options.chatId || options.inviteId;
    const inviter = options.inviter;
    const isInvitee = options.isInvitee === 'true';
    
    if (chatId && inviter) {
      console.log('[邀请流程] 检测到分享邀请参数，保存到本地');
      
      // 保存邀请信息
      const inviteInfo = {
        chatId: chatId,
        inviter: decodeURIComponent(inviter),
        isInvitee: isInvitee,
        timestamp: Date.now(),
        source: 'login_page_direct'
      };
      
      wx.setStorageSync('pendingInvite', inviteInfo);
      
      this.setData({
        inviteId: chatId,
        inviter: inviteInfo.inviter,
        isInvited: true
      });
      
      console.log('[邀请流程] 登录页面已记录邀请信息:', inviteInfo);
    } else {
      // 尝试使用app级别的处理方法
      const app = getApp();
      if (app.handleInviteParams) {
        const appInviteInfo = app.handleInviteParams(options);
        
        if (appInviteInfo) {
          this.setData({
            inviteId: appInviteInfo.inviteId || appInviteInfo.chatId,
            inviter: appInviteInfo.inviter,
            isInvited: true
          });
          
          console.log('[邀请流程] 登录页面已记录邀请信息(App级别):', appInviteInfo);
        }
      }
    }
  },
  
  /**
   * 检查是否开启调试模式
   */
  checkDebugMode: function() {
    try {
      // 在开发环境中可以开启调试模式
      const appBaseInfo = wx.getAppBaseInfo();
      if (appBaseInfo.platform === 'devtools') {
        this.setData({
          isDebugMode: true
        });
        console.log('已开启调试模式');
      }
    } catch (e) {
      console.error('获取系统信息失败', e);
    }
  },

  /**
   * 清除存储(调试功能)
   */
  debugClearStorage: function() {
    try {
      wx.clearStorageSync();
      wx.showToast({
        title: '存储已清除',
        icon: 'success'
      });
      
      // 重置全局数据
      const app = getApp();
      app.globalData.userInfo = null;
      app.globalData.hasLogin = false;
      app.globalData.openId = '';
      app.globalData.cloudInitialized = false;
      
      console.log('存储和全局数据已重置');
    } catch (e) {
      console.error('清除存储失败', e);
      wx.showToast({
        title: '清除失败',
        icon: 'error'
      });
    }
  },

  /**
   * 重新初始化云环境(调试功能)
   */
  debugReInitCloud: function() {
    const app = getApp();
    if (app.initCloud && typeof app.initCloud === 'function') {
      // 先重置初始化状态
      app.globalData.cloudInitialized = false;
      
      if (app.initCloud()) {
        wx.showToast({
          title: '云环境已重新初始化',
          icon: 'success'
        });
      } else {
        wx.showToast({
          title: '重新初始化失败',
          icon: 'error'
        });
      }
    } else {
      wx.showToast({
        title: '初始化方法不存在',
        icon: 'error'
      });
    }
  },

  /**
   * 选择头像事件
   * @param {Object} e - 事件对象
   */
  onChooseAvatar(e) {
    try {
      const { avatarUrl } = e.detail;
      if (avatarUrl) {
        console.log('获取到头像URL:', avatarUrl);
        this.setData({
          avatarUrl
        });
      } else {
        console.warn('未获取到头像URL');
      }
    } catch (error) {
      console.error('头像选择过程中出错:', error);
      // 模拟器中可能会失败，但不影响其他功能
      wx.showToast({
        title: '头像选择失败，请在真机上测试',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 处理昵称输入
   * @param {Object} e - 事件对象
   */
  onNickNameInput: function(e) {
    this.setData({
      nickName: e.detail.value
    });
  },

  /**
   * 表单提交事件
   * @param {Object} e - 事件对象
   */
  onFormSubmit: function(e) {
    // 获取昵称，优先使用data中的nickName，如果不存在则从表单中获取
    const nickname = this.data.nickName || (e.detail.value && e.detail.value.nickname);
    
    if (!nickname) {
      wx.showModal({
        title: '提示',
        content: '请输入昵称',
        showCancel: false
      });
      return;
    }

    this.setData({
      isLoading: true
    });

    // 构建用户信息对象
    const userInfo = {
      nickName: nickname,
      avatarUrl: this.data.avatarUrl
    };

    console.log('[邀请流程] 准备调用登录云函数，发送数据:', userInfo);

    // 检查云环境是否已初始化
    const app = getApp();
    if (!app.globalData.cloudInitialized) {
      console.log('云环境未初始化，尝试重新初始化...');
      app.initCloud();
      
      // 等待一小段时间让初始化完成
      setTimeout(() => {
        this.callLoginCloudFunction(userInfo);
      }, 1000);
      return;
    }
    
    this.callLoginCloudFunction(userInfo);
  },
  
  /**
   * 调用登录云函数
   * @param {Object} userInfo 用户信息
   */
  callLoginCloudFunction: function(userInfo) {
    const app = getApp();
    
    // 调用云函数登录
    wx.cloud.callFunction({
      name: 'login',
      data: {
        userInfo: userInfo
      },
      success: res => {
        console.log('登录云函数调用成功，完整响应:', res);
        console.log('登录云函数返回结果:', res.result);
        
        // 确保result不为空
        if (!res.result) {
          console.error('云函数返回结果为空');
          wx.showModal({
            title: '登录失败',
            content: '服务器返回结果为空，请重试',
            showCancel: false
          });
          this.setData({ isLoading: false });
          return;
        }
        
        // 🔥 【HOTFIX-v1.3.23】统一ID获取逻辑，确保使用云函数返回的ID
        let openId = null;
        
        console.log('🔥 [ID统一] 云函数返回结果详情:', res.result);
        
        // 检查所有可能的位置
        if (res.result && res.result.openId) {
          // 直接从结果中获取
          openId = res.result.openId;
          console.log('🔥 [ID统一] 从result.openId中获取到openId:', openId);
        } else if (res.result && res.result.tcbContext && res.result.tcbContext.OPENID) {
          // 从tcbContext中获取
          openId = res.result.tcbContext.OPENID;
          console.log('🔥 [ID统一] 从tcbContext中获取到openId:', openId);
        } else {
          // 🔥 【HOTFIX-v1.3.23】如果云函数没有返回ID，记录详细信息并生成本地ID
          console.warn('🔥 [ID统一] 云函数未返回有效openId，可能影响消息收发');
          console.log('🔥 [ID统一] 完整云函数响应:', JSON.stringify(res, null, 2));
          
          // 生成本地ID
          openId = 'local_' + Date.now();
          console.log('🔥 [ID统一] 无法从服务器获取openId，生成本地ID:', openId);
        }
        
        // 存储用户信息和ID
        const app = getApp();
        app.saveUserInfo(userInfo, openId);
        
        // 显示登录成功提示
        wx.showToast({
          title: '登录成功',
          icon: 'success',
          duration: 1000
        });
        
        // 根据是否是被邀请用户决定跳转逻辑
        setTimeout(() => {
          // 🔥 优先检查分享启动信息
          this.checkAndProcessShareLaunch(() => {
          // 如果没有分享启动信息，再检查常规邀请信息
          const inviteInfo = app.getStoredInviteInfo();
          
          if (inviteInfo && inviteInfo.inviteId) {
            // 新增：仅在“确认为邀请启动”时才自动进入聊天，避免A端普通登录被误判为B端
            /**
             * 判断是否应当基于本地邀请信息自动进入聊天
             * 条件满足其一：
             * 1) inviteInfo.fromInvite === true（明确来自邀请链接）
             * 2) 小程序启动参数包含 fromInvite=true 或 action=join 或 URL中包含 inviter
             */
            const launchOptions = (typeof wx.getLaunchOptionsSync === 'function') ? wx.getLaunchOptionsSync() : {};
            const launchQuery = (launchOptions && launchOptions.query) || {};
            const launchPath = (launchOptions && launchOptions.path) || '';
            // 仅基于“启动参数中的显式邀请”判断，而不依赖本地pendingInvite的新鲜度
            const hasExplicitInviteInLaunch = (
              launchQuery.fromInvite === 'true' || launchQuery.fromInvite === true || launchQuery.fromInvite === '1' ||
              launchQuery.action === 'join' ||
              !!launchQuery.inviter || !!launchQuery.chatId || !!launchQuery.inviteId ||
              (typeof launchPath === 'string' && launchPath.includes('/chat') && (launchQuery.fromInvite === 'true' || !!launchQuery.inviter || !!launchQuery.chatId || !!launchQuery.inviteId))
            );
            const launchedByInvite = (inviteInfo.fromInvite === true) || hasExplicitInviteInLaunch;
            // ✅ 收紧策略：仅当“明确邀请启动”时才允许邀请跳转
            const allowInviteNavigation = launchedByInvite;

            // 🚫 不再因缺少显式邀请而直接走普通登录。若存在有效的邀请信息，则始终进行一次云端校验。
            if (!allowInviteNavigation || !inviteInfo.fromInvite) {
              console.log('[邀请流程] 🔍 未携带fromInvite或显式邀请标记，转为云端二次校验以避免误判');
              const currentOpenId = app.globalData && app.globalData.openId;
              if (!currentOpenId) {
                console.log('[邀请流程] 缺少当前openId，走普通登录流程');
                try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e) {}
                this.createAndEnterNewChat(userInfo);
                return;
              }
              wx.cloud.callFunction({
                name: 'getChatParticipants',
                data: { chatId: inviteInfo.inviteId },
                success: (res) => {
                  try {
                    const participants = (res.result && res.result.participants) || [];
                    console.log('[邀请流程] 二次校验参与者结果:', participants);
                    console.log('[邀请流程] 当前用户OpenId:', currentOpenId);
                    
                    // 🔥 增强调试信息
                    participants.forEach((p, index) => {
                      console.log(`[邀请流程] 参与者${index}:`, {
                        openId: p.openId,
                        id: p.id,
                        nickName: p.nickName,
                        isCreator: p.isCreator
                      });
                    });
                    
                    // 过滤出他人
                    const others = participants.filter(p => {
                      const participantId = p.openId || p.id;
                      const isOther = participantId && participantId !== currentOpenId;
                      console.log(`[邀请流程] 参与者ID: ${participantId}, 是否为他人: ${isOther}`);
                      return isOther;
                    });
                    
                    console.log('[邀请流程] 他人参与者数量:', others.length);
                    console.log('[邀请流程] 总参与者数量:', participants.length);
                    
                    const hasOtherOnly = participants.length >= 1 && others.length >= 1;
                    console.log('[邀请流程] hasOtherOnly判断结果:', hasOtherOnly);

                    // 🔥【HOTFIX-v1.3.58】关键检查：用户是否已经在参与者列表中
                    const userAlreadyInChat = participants.some(p => {
                      const pId = p.openId || p.id;
                      return pId === currentOpenId;
                    });
                    console.log('[邀请流程] 用户是否已在聊天中:', userAlreadyInChat);
                    
                    // 🔥【HOTFIX-v1.3.58】如果用户已在聊天中，说明是回访而非新加入
                    if (userAlreadyInChat && participants.length >= 2) {
                      console.log('[邀请流程] ⚠️ 检测到用户已在聊天参与者列表中，这是回访而非新加入');
                      const meParticipant = participants.find(p => {
                        const pId = p.openId || p.id;
                        return pId === currentOpenId;
                      }) || null;
                      const meIsCreatorByFlag = !!(meParticipant && meParticipant.isCreator);
                      const creatorKey = `creator_${inviteInfo.chatId}`;
                      const storedCreator = wx.getStorageSync(creatorKey);
                      const meIsStoredCreator = storedCreator === currentOpenId;
                      const meIsCreatorByEvidence = meIsCreatorByFlag;

                      if (meIsStoredCreator && !meIsCreatorByFlag) {
                        wx.removeStorageSync(creatorKey);
                        console.warn('[邀请流程] ⚠️ 检测到疑似历史误写创建者缓存，已清理:', currentOpenId);
                      }

                      if (meIsCreatorByEvidence) {
                        console.log('[邀请流程] 🎯 确认为回访的创建者，直接进入聊天，跳过joinByInvite');
                        wx.setStorageSync(creatorKey, currentOpenId);
                        console.log('[邀请流程] 🔥 [v1.3.96] 存储回访创建者信息:', currentOpenId);

                        /** 清除无效的邀请信息。 */
                        try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e) {}
                        wx.removeStorageSync('inviteInfo');

                        /** 创建者回访直接进入聊天，并携带create action避免身份漂移。 */
                        const chatPath = `/app/pages/chat/chat?id=${inviteInfo.chatId}&action=create&userName=${encodeURIComponent(userInfo.nickName)}`;
                        console.log('[邀请流程] 🚀 回访创建者直接进入聊天:', chatPath);

                        wx.reLaunch({
                          url: chatPath,
                          success: () => {
                            console.log('[邀请流程] ✅ 回访创建者成功进入聊天页面');
                          },
                          fail: (err) => {
                            console.error('[邀请流程] ❌ 回访创建者跳转失败，走普通流程:', err);
                            this.createAndEnterNewChat(userInfo);
                          }
                        });
                      } else {
                        const otherParticipant = others[0] || null;
                        const inviterName = (otherParticipant && (otherParticipant.nickName || otherParticipant.name)) || inviteInfo.inviter || '朋友';
                        console.log('[邀请流程] 🎯 确认为回访的接收方，按邀请身份进入聊天:', inviterName);

                        /** 清理可能的错误创建者污染，避免后续在chat页被反向判定为A端。 */
                        if (storedCreator && storedCreator !== currentOpenId) {
                          console.log('[邀请流程] [回访接收方] 保留现有创建者记录:', storedCreator);
                        } else if (storedCreator === currentOpenId) {
                          wx.removeStorageSync(creatorKey);
                          console.log('[邀请流程] [回访接收方] 已清除错误创建者记录:', currentOpenId);
                        }

                        /** 强化邀请态，让chat页拿到明确fromInvite证据。 */
                        try {
                          app.saveInviteInfo && app.saveInviteInfo(inviteInfo.chatId, inviterName, true);
                        } catch (e) {
                          console.warn('[邀请流程] 保存回访接收方邀请信息失败，继续跳转', e);
                        }

                        const chatPath = `/app/pages/chat/chat?id=${inviteInfo.chatId}&inviter=${encodeURIComponent(inviterName)}&fromInvite=true&action=join&chatStarted=true&userName=${encodeURIComponent(userInfo.nickName)}`;
                        console.log('[邀请流程] 🚀 回访接收方进入聊天:', chatPath);

                        wx.reLaunch({
                          url: chatPath,
                          success: () => {
                            console.log('[邀请流程] ✅ 回访接收方成功进入聊天页面');
                            setTimeout(() => {
                              try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e) {}
                            }, 5000);
                          },
                          fail: (err) => {
                            console.error('[邀请流程] ❌ 回访接收方跳转失败，走普通流程:', err);
                            this.createAndEnterNewChat(userInfo);
                          }
                        });
                      }
                      return;
                    }

                    // 🔥【A端身份紧急修复】防止A端创建者被误判为B端
                    const normalized = participants.map(p => ({
                      id: p.openId || p.id,
                      isCreator: !!p.isCreator
                    }));
                    let meIsCreator = normalized.some(p => p.isCreator && p.id === currentOpenId);
                    console.log('[邀请流程] 数据库标记的创建者状态:', meIsCreator);

                    // 🔥【HOTFIX-v1.3.58】邀请信息时效性检查 - 过期邀请不应触发B端逻辑
                    const inviteTimestamp = inviteInfo.timestamp || 0;
                    const currentTime = Date.now();
                    const inviteAge = currentTime - inviteTimestamp;
                    const isExpiredInvite = inviteAge > 600000; // 10分钟
                    console.log('[邀请流程] 邀请信息时效检查:', {
                      inviteTimestamp,
                      currentTime,
                      inviteAge,
                      isExpiredInvite,
                      ageInMinutes: (inviteAge / 60000).toFixed(2)
                    });

                    // 🔥【智能创建者检测】当数据库标记不准确时，使用其他证据
                    if (!meIsCreator && hasOtherOnly) {
                      console.log('[邀请流程] 🔍 数据库创建者标记可能不准确，开始智能检测');
                      
                      // 证据1: 检查聊天ID是否包含当前用户ID
                      const userIdShort = currentOpenId.substring(currentOpenId.length - 8);
                      const chatIdContainsUserId = inviteInfo.chatId.includes(userIdShort);
                      
                      // 证据2: 检查访问历史（创建者通常会多次访问）
                      // 🔥【HOTFIX-v1.3.58】使用与chat.js相同的存储结构
                      const allVisitHistory = wx.getStorageSync('chat_visit_history') || {};
                      const visitHistory = allVisitHistory[inviteInfo.chatId] || 0;
                      const isFrequentVisitor = visitHistory >= 2;
                      
                      // 证据3: 检查用户昵称是否与邀请者信息不符
                      const currentNickname = userInfo.nickName || '';
                      const inviterNickname = inviteInfo.inviter || '';
                      const nicknameConflict = currentNickname && inviterNickname && 
                                             currentNickname !== inviterNickname && 
                                             inviterNickname !== '朋友';
                      
                      // 🔥【HOTFIX-v1.3.58】新证据4: 参与者顺序判断
                      // 如果用户是第一个参与者，很可能是创建者
                      const userParticipantIndex = participants.findIndex(p => {
                        const pId = p.openId || p.id;
                        return pId === currentOpenId;
                      });
                      const isFirstParticipant = userParticipantIndex === 0;
                      
                      // 🔥【HOTFIX-v1.3.58】新证据5: 邀请信息过期
                      // 如果邀请信息已过期，且用户在参与者列表中，很可能是回访的创建者
                      const isReturningCreator = isExpiredInvite && participants.length >= 2;
                      
                      console.log('[邀请流程] 🔍 智能创建者检测结果:');
                      console.log('[邀请流程] - 聊天ID包含用户ID片段:', chatIdContainsUserId, `(${userIdShort})`);
                      console.log('[邀请流程] - 访问次数:', visitHistory, '是否频繁访问:', isFrequentVisitor);
                      console.log('[邀请流程] - 昵称冲突（非邀请者）:', nicknameConflict);
                      console.log('[邀请流程] - 是否第一个参与者:', isFirstParticipant);
                      console.log('[邀请流程] - 邀请已过期回访:', isReturningCreator);
                      
                      // 如果有任一创建者证据，认定为创建者
                      if (chatIdContainsUserId || isFrequentVisitor || nicknameConflict || 
                          isFirstParticipant || isReturningCreator) {
                        meIsCreator = true;
                        console.log('[邀请流程] ✅ 智能检测确认：用户是聊天创建者！');
                        console.log('[邀请流程] 📝 证据：chatId包含userId=', chatIdContainsUserId, 
                                  ', 频繁访问=', isFrequentVisitor, ', 昵称冲突=', nicknameConflict,
                                  ', 第一参与者=', isFirstParticipant, ', 过期回访=', isReturningCreator);
                      }
                    }
                    
                    console.log('[邀请流程] 最终创建者判断结果:', meIsCreator);

                    if (meIsCreator) {
                      console.log('[邀请流程] 🎯 确认用户是该聊天创建者，清除错误邀请信息并直接进入聊天');
                      
                      // 清除无效的邀请信息
                      try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e) {}
                      wx.removeStorageSync('inviteInfo');
                      
                      // A端创建者直接进入聊天，使用create action
                      const chatPath = `/pages/chat/chat?id=${inviteInfo.chatId}&action=create&userName=${encodeURIComponent(userInfo.nickName)}`;
                      console.log('[邀请流程] 🚀 A端创建者直接进入聊天:', chatPath);
                      
                      wx.reLaunch({
                        url: chatPath,
                        success: () => {
                          console.log('[邀请流程] ✅ A端创建者成功进入聊天页面');
                        },
                        fail: (err) => {
                          console.error('[邀请流程] ❌ A端跳转失败，走普通流程:', err);
                          this.createAndEnterNewChat(userInfo);
                        }
                      });
                      return;
                    }

                    if (hasOtherOnly) {
                      console.log('[邀请流程] 🎉 二次校验通过，B端确认进入A端聊天!');
                      // 🔥 【关键修复】B端应该调用joinByInvite加入聊天，而不是直接跳转
                      console.log('[邀请流程] 开始调用joinByInvite加入聊天:', inviteInfo.inviteId);
                      
                      wx.cloud.callFunction({
                        name: 'joinByInvite',
                        data: {
                          chatId: inviteInfo.inviteId,
                          inviter: inviteInfo.inviter
                        },
                        success: (joinRes) => {
                          console.log('[邀请流程] ✅ joinByInvite调用成功:', joinRes);
                          if (joinRes.result && joinRes.result.success) {
                            console.log('[邀请流程] B端成功加入A端聊天，开始跳转');
                            app.tryNavigateToChat(inviteInfo.inviteId, inviteInfo.inviter,
                              () => { setTimeout(() => { try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e) {} }, 5000); },
                              () => { 
                                console.warn('[邀请流程] 跳转失败，创建新聊天');
                                this.createAndEnterNewChat(userInfo);
                              }
                            );
                          } else {
                            console.warn('[邀请流程] joinByInvite失败，创建新聊天:', joinRes.result);
                            this.createAndEnterNewChat(userInfo);
                          }
                        },
                        fail: (joinErr) => {
                          console.error('[邀请流程] joinByInvite调用失败:', joinErr);
                          // 🔥 即使joinByInvite失败，也尝试直接跳转，因为聊天已经存在
                          console.log('[邀请流程] joinByInvite失败，但聊天存在，尝试直接跳转');
                          app.tryNavigateToChat(inviteInfo.inviteId, inviteInfo.inviter,
                            () => { setTimeout(() => { try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e) {} }, 5000); },
                            () => { this.createAndEnterNewChat(userInfo); }
                          );
                        }
                      });
                    } else {
                      console.log('[邀请流程] ❌ 二次校验不通过，详细信息:');
                      console.log('[邀请流程] - 参与者数量:', participants.length);
                      console.log('[邀请流程] - 他人数量:', others.length);
                      console.log('[邀请流程] - hasOtherOnly:', hasOtherOnly);
                      console.log('[邀请流程] 走普通登录流程');
                      try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e) {}
                      this.createAndEnterNewChat(userInfo);
                    }
                  } catch (e) {
                    console.warn('[邀请流程] 二次校验解析异常，走普通登录流程', e);
                    try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e2) {}
                    this.createAndEnterNewChat(userInfo);
                  }
                },
                fail: (err) => {
                  console.warn('[邀请流程] 二次校验失败，走普通登录流程', err);
                  try { app.clearInviteInfo && app.clearInviteInfo(); } catch (e) {}
                  this.createAndEnterNewChat(userInfo);
                }
              });
              return;
            }

            console.log('[邀请流程] 被邀请用户登录成功，直接进入聊天，邀请ID:', inviteInfo.inviteId);
            
            // 使用app全局方法进行跳转
            app.tryNavigateToChat(inviteInfo.inviteId, inviteInfo.inviter, 
                // 成功回调
                () => {
                  // 延迟清除邀请信息
                  setTimeout(() => {
                    app.clearInviteInfo();
                  }, 5000);
                }, 
                // 失败回调
                () => {
                  // 所有跳转都失败的后备方案
                  wx.showModal({
                    title: '跳转失败',
                    content: '无法进入聊天页面，即将进入首页',
                    showCancel: false,
                    success: () => {
                      // 尝试跳转到首页
                      wx.reLaunch({
                        url: '/app/pages/home/home',
                        fail: () => {
                          wx.reLaunch({
                            url: '../home/home',
                            fail: () => {
                              wx.showModal({
                                title: '无法跳转',
                                content: '请重启小程序',
                                showCancel: false
                              });
                            }
                          });
                        }
                      });
                    }
                  });
                }
              );
            } else {
              // 🔥 再次检查是否有邀请信息（可能在页面加载后才保存）
              const lastCheckInviteInfo = app.getStoredInviteInfo();
              
              if (lastCheckInviteInfo && lastCheckInviteInfo.inviteId) {
                console.log('[邀请流程] 最后检查发现邀请信息，进入邀请聊天:', lastCheckInviteInfo);
                
                // 使用app全局方法进行跳转
                app.tryNavigateToChat(lastCheckInviteInfo.inviteId, lastCheckInviteInfo.inviter, 
                  // 成功回调
                  () => {
                    // 延迟清除邀请信息
                    setTimeout(() => {
                      app.clearInviteInfo();
                    }, 5000);
                  }, 
                  // 失败回调
                  () => {
                    // 跳转失败，创建新聊天
                    this.createAndEnterNewChat(userInfo);
                  }
                );
              } else {
                // 普通用户登录，创建新聊天
                this.createAndEnterNewChat(userInfo);
              }
            }
          });
        }, 1000);
      },
      
      fail: err => {
        console.error('登录云函数调用失败，错误信息:', err);
        wx.showModal({
          title: '登录失败',
          content: '网络异常，请重试',
          showCancel: false
        });
      },
      complete: () => {
        this.setData({
          isLoading: false
        });
      }
    });
  },

  /**
   * 检查并处理分享启动
   */
  checkAndProcessShareLaunch: function(fallbackCallback) {
    try {
      // 检查是否有分享启动信息
      const shareLaunchInfo = wx.getStorageSync('shareLaunchInfo');
      
      if (shareLaunchInfo && shareLaunchInfo.query) {
        console.log('[邀请流程] 发现分享启动信息:', shareLaunchInfo);
        
        // 解析query参数
        const queryParams = this.parseQueryString(shareLaunchInfo.query);
        
        if (queryParams.chatId && queryParams.inviter) {
          console.log('[邀请流程] 成功解析分享参数，准备进入聊天:', queryParams);
          
          // 清除分享启动信息
          wx.removeStorageSync('shareLaunchInfo');
          
          // 直接跳转到聊天页面
          const chatUrl = `/app/pages/chat/chat?id=${queryParams.chatId}&inviter=${queryParams.inviter}&chatStarted=true&fromInvite=true`;
          
          wx.reLaunch({
            url: chatUrl,
            success: () => {
              console.log('[邀请流程] 分享邀请用户成功进入聊天页面');
            },
            fail: (err) => {
              console.error('[邀请流程] 分享邀请跳转失败:', err);
              // 如果跳转失败，执行fallback
              if (typeof fallbackCallback === 'function') {
                fallbackCallback();
              }
            }
          });
          
          return; // 成功处理了分享启动，不执行fallback
        }
      }
      
      // 没有分享启动信息，执行fallback
      if (typeof fallbackCallback === 'function') {
        fallbackCallback();
      }
      
    } catch (error) {
      console.error('[邀请流程] 检查分享启动失败:', error);
      // 出错时执行fallback
      if (typeof fallbackCallback === 'function') {
        fallbackCallback();
      }
    }
  },
  
  /**
   * 创建并进入新聊天
   * @param {Object} userInfo - 用户信息
   */
  createAndEnterNewChat: function(userInfo) {
    console.log('[邀请流程] 普通用户登录成功，开始智能检测现有聊天');
    
    // 🔥 【HOTFIX-v1.3.53】添加智能聊天检测机制
    this.intelligentChatDetection(userInfo);
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.53】智能聊天检测机制
   * 检查是否有现有聊天可以加入，避免用户总是创建新聊天
   * @param {Object} userInfo - 用户信息
   */
  intelligentChatDetection: function(userInfo) {
    console.log('🔥 [智能检测] 开始检查是否有现有聊天可以加入');
    
    const app = getApp();
    const currentOpenId = app.globalData && app.globalData.openId;
    
    if (!currentOpenId) {
      console.log('🔥 [智能检测] 缺少用户OpenId，直接创建新聊天');
      this.proceedWithNewChat(userInfo);
      return;
    }
    
    // 调用云函数检查用户的聊天记录
    wx.cloud.callFunction({
      name: 'getConversations',
      data: {
        openId: currentOpenId,
        limit: 10 // 获取最近的10个聊天
      },
      success: (res) => {
        console.log('🔥 [智能检测] 获取聊天记录成功:', res);
        this.analyzeExistingChats(res.result, userInfo);
      },
      fail: (error) => {
        console.log('🔥 [智能检测] 获取聊天记录失败，创建新聊天:', error);
        this.proceedWithNewChat(userInfo);
      }
    });
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.53】分析现有聊天并提供选择
   * @param {Object} conversationsResult - 聊天记录结果
   * @param {Object} userInfo - 用户信息
   */
  analyzeExistingChats: function(conversationsResult, userInfo) {
    const conversations = conversationsResult.conversations || [];
    console.log('🔥 [智能检测] 分析现有聊天，数量:', conversations.length);
    
    if (conversations.length === 0) {
      console.log('🔥 [智能检测] 没有现有聊天，创建新聊天');
      this.proceedWithNewChat(userInfo);
      return;
    }
    
    // 筛选活跃的聊天（最近7天内有活动的）
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const activeChats = conversations.filter(chat => {
      const lastMessageTime = chat.lastMessageTime || chat.createTime || 0;
      return lastMessageTime > sevenDaysAgo;
    });
    
    console.log('🔥 [智能检测] 活跃聊天数量:', activeChats.length);
    
    if (activeChats.length === 0) {
      console.log('🔥 [智能检测] 没有活跃聊天，创建新聊天');
      this.proceedWithNewChat(userInfo);
      return;
    }
    
    // 如果只有一个活跃聊天，询问用户是否要加入
    if (activeChats.length === 1) {
      const chat = activeChats[0];
      this.askUserToJoinExistingChat(chat, userInfo);
      return;
    }
    
    // 如果有多个活跃聊天，让用户选择
    this.showMultipleChatOptions(activeChats, userInfo);
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.53】询问用户是否加入现有聊天
   * @param {Object} chat - 聊天信息
   * @param {Object} userInfo - 用户信息
   */
  askUserToJoinExistingChat: function(chat, userInfo) {
    console.log('🔥 [智能检测] 询问用户是否加入现有聊天:', chat.chatId);
    
    // 获取对方昵称
    const otherParticipantName = this.getOtherParticipantName(chat);
    
    wx.showModal({
      title: '发现现有聊天',
      content: `发现你与 ${otherParticipantName} 的聊天，是否继续该聊天？`,
      confirmText: '继续聊天',
      cancelText: '创建新聊天',
      success: (res) => {
        if (res.confirm) {
          console.log('🔥 [智能检测] 用户选择继续现有聊天');
          this.joinExistingChat(chat, userInfo);
        } else {
          console.log('🔥 [智能检测] 用户选择创建新聊天');
          this.proceedWithNewChat(userInfo);
        }
      },
      fail: () => {
        // 默认创建新聊天
        console.log('🔥 [智能检测] 弹窗失败，默认创建新聊天');
        this.proceedWithNewChat(userInfo);
      }
    });
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.53】显示多个聊天选项
   * @param {Array} activeChats - 活跃聊天列表
   * @param {Object} userInfo - 用户信息
   */
  showMultipleChatOptions: function(activeChats, userInfo) {
    console.log('🔥 [智能检测] 显示多个聊天选项，数量:', activeChats.length);
    
    const items = activeChats.map(chat => {
      const otherName = this.getOtherParticipantName(chat);
      const timeStr = this.formatChatTime(chat.lastMessageTime || chat.createTime);
      return `与 ${otherName} 的聊天 (${timeStr})`;
    });
    items.push('创建新聊天');
    
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const tapIndex = res.tapIndex;
        if (tapIndex < activeChats.length) {
          // 选择了现有聊天
          const selectedChat = activeChats[tapIndex];
          console.log('🔥 [智能检测] 用户选择现有聊天:', selectedChat.chatId);
          this.joinExistingChat(selectedChat, userInfo);
        } else {
          // 选择创建新聊天
          console.log('🔥 [智能检测] 用户选择创建新聊天');
          this.proceedWithNewChat(userInfo);
        }
      },
      fail: () => {
        // 默认创建新聊天
        console.log('🔥 [智能检测] 选择失败，默认创建新聊天');
        this.proceedWithNewChat(userInfo);
      }
    });
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.53】加入现有聊天
   * @param {Object} chat - 聊天信息
   * @param {Object} userInfo - 用户信息
   */
  joinExistingChat: function(chat, userInfo) {
    console.log('🔥 [智能检测] 用户加入现有聊天:', chat.chatId);
    
    const otherParticipantName = this.getOtherParticipantName(chat);
    
    // 设置邀请信息，确保以B端身份进入
    const app = getApp();
    app.saveInviteInfo(chat.chatId, otherParticipantName, true);
    
    // 跳转到聊天页面，使用邀请参数
    const chatUrl = `/app/pages/chat/chat?id=${chat.chatId}&inviter=${encodeURIComponent(otherParticipantName)}&fromInvite=true`;
    console.log('🔥 [智能检测] 跳转到现有聊天:', chatUrl);
    
    wx.reLaunch({
      url: chatUrl,
      success: () => {
        console.log('🔥 [智能检测] 成功加入现有聊天');
      },
      fail: (err) => {
        console.error('🔥 [智能检测] 加入现有聊天失败:', err);
        this.proceedWithNewChat(userInfo);
      }
    });
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.53】创建新聊天（原有逻辑）
   * @param {Object} userInfo - 用户信息
   */
  proceedWithNewChat: function(userInfo) {
    console.log('🔥 [智能检测] 执行创建新聊天逻辑');
    
    // 创建新的聊天ID
    const newChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    console.log('[邀请流程] 为新用户创建聊天ID:', newChatId);
    
    // 跳转到聊天页面
    wx.reLaunch({
      url: `/app/pages/chat/chat?id=${newChatId}&isNewChat=true&userName=${encodeURIComponent(userInfo.nickName)}&action=create`,
      success: () => {
        console.log('[邀请流程] 新用户成功进入聊天页面');
      },
      fail: (err) => {
        console.error('[邀请流程] 跳转到聊天页面失败:', err);
        // 备用方案：跳转到首页
        wx.reLaunch({
          url: '/app/pages/home/home',
          fail: (err2) => {
            console.error('[邀请流程] 备用方案也失败:', err2);
            wx.showModal({
              title: '跳转失败',
              content: '无法进入页面，请重启小程序',
              showCancel: false
            });
          }
        });
      }
    });
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.53】获取聊天中其他参与者的名称
   * @param {Object} chat - 聊天信息
   * @returns {String} 其他参与者名称
   */
  getOtherParticipantName: function(chat) {
    if (chat.participantNames && chat.participantNames.length > 0) {
      const app = getApp();
      const currentOpenId = app.globalData && app.globalData.openId;
      const currentNickName = app.globalData.userInfo && app.globalData.userInfo.nickName;
      
      // 找到不是当前用户的参与者
      const otherName = chat.participantNames.find(name => name !== currentNickName);
      return otherName || '朋友';
    }
    return '朋友';
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.53】格式化聊天时间
   * @param {Number} timestamp - 时间戳
   * @returns {String} 格式化的时间字符串
   */
  formatChatTime: function(timestamp) {
    if (!timestamp) return '最近';
    
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}天前`;
    } else if (hours > 0) {
      return `${hours}小时前`;
    } else {
      return '最近';
    }
  },

  /**
   * 尝试按顺序导航到URL列表中的一个URL
   * @param {Array} urls - URL列表
   * @param {Number} index - 当前尝试的索引
   * @param {Function} onAllFailed - 所有URL尝试失败后的回调
   */
  tryNavigateTo: function(urls, index, onAllFailed) {
    // 使用app全局方法进行跳转，逐渐弃用此方法
    const app = getApp();
    app.tryNavigateToUrls(urls, index, null, onAllFailed);
  }
}); 