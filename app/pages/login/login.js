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
    console.log('[邀请流程] 普通用户登录成功，创建新聊天并进入聊天页面');
    
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