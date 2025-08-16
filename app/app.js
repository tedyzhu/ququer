App({
  /**
   * 全局数据
   */
  globalData: {
    userInfo: null,
    hasLogin: false,
    conversations: [],
    cloudInitialized: false,
    openId: '', // 用户openId
    chats: {}, // 存储聊天信息
    pendingInvite: null
  },

  /**
   * 当小程序初始化完成时，会触发 onLaunch（全局只触发一次）
   * @param {Object} options - 启动参数
   */
  onLaunch: function (options) {
    console.log('小程序启动，参数:', options);
    
    // 初始化云环境
    this.initCloud();
    
    // 检查登录状态
    this.checkLoginStatus();
    
    // 监听用户截屏事件
    wx.onUserCaptureScreen(() => {
      wx.showModal({
        title: '隐私提醒',
        content: '请尊重隐私，请勿截屏',
        showCancel: false,
        confirmText: '我知道了'
      });
    });
    
    // 监听网络状态变化
    wx.onNetworkStatusChange((res) => {
      console.log('网络状态变化, 当前是否连接:', res.isConnected);
      if (res.isConnected && !this.globalData.cloudInitialized) {
        // 当网络恢复且云环境未初始化时，重新初始化
        this.initCloud();
      }
    });
    
    // 添加页面不存在监听器
    wx.onPageNotFound((res) => {
      console.error('页面不存在:', res.path);
      
      // 获取页面路径的最后一段作为页面名称
      const pagePath = res.path;
      console.log('尝试修复页面路径:', pagePath);
      
      // 判断是否包含home页面
      if (pagePath.includes('home')) {
        console.log('检测到请求home页面，尝试重定向');
        wx.reLaunch({
          url: '/app/pages/home/home',
          fail: (err) => {
            console.error('重定向到绝对路径失败:', err);
            wx.reLaunch({
              url: 'app/pages/login/login',
              fail: (err2) => {
                console.error('重定向到登录页也失败:', err2);
                wx.showToast({
                  title: '页面跳转失败',
                  icon: 'none'
                });
              }
            });
          }
        });
      } else {
        // 默认重定向到登录页
        console.log('默认重定向到登录页');
        wx.reLaunch({
          url: '/app/pages/login/login',
          fail: (err) => {
            console.error('重定向到登录页失败:', err);
          }
        });
      }
    });
  },
  
  /**
   * 初始化云环境
   * @returns {boolean} 初始化是否成功
   */
  initCloud: function() {
    console.log('尝试初始化云环境');
    
    // 如果已经初始化过，直接返回true
    if (this.globalData.cloudInitialized) {
      console.log('云环境已经初始化过，跳过');
      return true;
    }
    
    if (!wx.cloud) {
      console.error('请使用2.2.3或以上的基础库以使用云能力');
      return false;
    } else {
      try {
        console.log('开始初始化云环境 ququer-env-6g35f0nv28c446e7');
        wx.cloud.init({
          env: 'ququer-env-6g35f0nv28c446e7',
          traceUser: true,
          timeout: 10000
        });
        console.log('云环境初始化成功: ququer-env-6g35f0nv28c446e7');
        this.globalData.cloudInitialized = true;
        return true;
      } catch (e) {
        console.error('云环境初始化失败', e);
        
        // 设置延迟重试
        setTimeout(() => {
          if (!this.globalData.cloudInitialized) {
            console.log('尝试重新初始化云环境');
            this.initCloud();
          }
        }, 3000);
        
        return false;
      }
    }
  },

  /**
   * 检查用户是否已登录
   */
  checkLoginStatus: function () {
    console.log('检查登录状态');
    
    const that = this;
    
    // 先检查是否有openId
    wx.getStorage({
      key: 'openId',
      success: function (res) {
        console.log('获取到openId:', res.data);
        that.globalData.openId = res.data;
        
        // 再获取用户信息
        wx.getStorage({
          key: 'userInfo',
          success: function (res) {
            console.log('获取到用户信息:', res.data);
            that.globalData.userInfo = res.data;
            that.globalData.hasLogin = true;
            
            // 确保用户信息中包含openId
            if (!that.globalData.userInfo.openId && that.globalData.openId) {
              that.globalData.userInfo.openId = that.globalData.openId;
              
              // 更新存储
              wx.setStorage({
                key: 'userInfo',
                data: that.globalData.userInfo
              });
            }
            
            // 登录成功后更新云端登录时间
            that.updateUserLoginTime(res.data);
          },
          fail: function (err) {
            console.log('获取用户信息失败:', err);
            // 清除可能存在的部分登录状态
            that.cleanLoginStatus();
          }
        });
      },
      fail: function (err) {
        console.log('获取openId失败:', err);
        // 清除可能存在的部分登录状态
        that.cleanLoginStatus();
      }
    });
  },
  
  /**
   * 清除登录状态
   */
  cleanLoginStatus: function() {
    console.log('清除登录状态');
    this.globalData.userInfo = null;
    this.globalData.hasLogin = false;
    this.globalData.openId = '';
    
    try {
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('openId');
    } catch (e) {
      console.error('清除存储失败', e);
    }
  },
  
  /**
   * 更新用户登录时间
   * @param {Object} userInfo - 用户信息
   */
  updateUserLoginTime: function(userInfo) {
    // 调用云函数更新登录时间
    if (!this.globalData.cloudInitialized) {
      console.log('云环境未初始化，不更新登录时间');
      return;
    }
    
    console.log('调用云函数更新登录时间');
    wx.cloud.callFunction({
      name: 'login',
      data: { userInfo },
      success: res => {
        console.log('更新登录时间成功', res);
        
        // 如果返回了openId，保存起来
        if (res.result && res.result.openId) {
          this.globalData.openId = res.result.openId;
          
          // 存储到本地以便下次使用
          wx.setStorage({
            key: 'openId',
            data: res.result.openId
          });
          
          // 确保用户信息中也包含openId
          if (this.globalData.userInfo && !this.globalData.userInfo.openId) {
            this.globalData.userInfo.openId = res.result.openId;
            
            // 更新存储
            wx.setStorage({
              key: 'userInfo',
              data: this.globalData.userInfo
            });
          }
        }
      },
      fail: err => {
        console.error('更新登录时间失败', err);
      }
    });
  },
  
  /**
   * 获取指定聊天的信息
   * @param {String} chatId - 聊天ID
   * @returns {Object} 聊天信息，若不存在则返回null
   */
  getChatInfo: function(chatId) {
    if (this.globalData.chats && this.globalData.chats[chatId]) {
      return this.globalData.chats[chatId];
    }
    return null;
  },

  /**
   * 保存邀请信息
   * @param {String} inviteId - 邀请ID
   * @param {String} inviter - 邀请人
   * @returns {Object} 保存的邀请信息
   */
  saveInviteInfo: function(inviteId, inviter) {
    if (!inviteId) return null;
    
    const inviterName = inviter || '朋友';
    console.log(`[邀请流程] 保存邀请信息: ID=${inviteId}, 邀请人=${inviterName}`);
    
    // 创建邀请信息对象
    const inviteInfo = {
      inviteId: inviteId,
      inviter: inviterName,
      timestamp: Date.now()
    };
    
    // 保存到全局数据
    this.globalData.pendingInvite = inviteInfo;
    
    // 保存到本地存储，确保持久化
    wx.setStorageSync('pendingInvite', inviteInfo);
    
    return inviteInfo;
  },
  
  /**
   * 获取已存储的邀请信息
   * @returns {Object|null} 存储的邀请信息，或者null
   */
  getStoredInviteInfo: function() {
    // 先检查全局变量中是否已存在
    if (this.globalData.pendingInvite) {
      return this.globalData.pendingInvite;
    }
    
    // 检查本地存储
    const pendingInvite = wx.getStorageSync('pendingInvite');
    if (pendingInvite && pendingInvite.inviteId) {
      console.log('[邀请流程] 检测到本地存储的邀请:', pendingInvite);
      this.globalData.pendingInvite = pendingInvite;
      return pendingInvite;
    }
    
    // 向下兼容旧的存储方式
    const isInvited = wx.getStorageSync('isInvited');
    const inviteId = wx.getStorageSync('inviteId');
    
    if (isInvited && inviteId) {
      console.log('[邀请流程] 检测到旧格式邀请信息，邀请ID:', inviteId);
      const inviteInfo = {
        inviteId: inviteId,
        inviter: '朋友',
        timestamp: Date.now()
      };
      
      // 更新为新格式
      this.globalData.pendingInvite = inviteInfo;
      wx.setStorageSync('pendingInvite', inviteInfo);
      
      return inviteInfo;
    }
    
    return null;
  },
  
  /**
   * 清除邀请信息
   */
  clearInviteInfo: function() {
    console.log('[邀请流程] 清除邀请信息');
    
    // 清除全局变量
    this.globalData.pendingInvite = null;
    
    // 清除本地存储
    try {
      wx.removeStorageSync('pendingInvite');
      
      // 同时清除旧格式存储
      wx.removeStorageSync('isInvited');
      wx.removeStorageSync('inviteId');
      
      console.log('[邀请流程] 邀请信息已清除');
      return true;
    } catch (e) {
      console.error('[邀请流程] 清除邀请信息失败:', e);
      return false;
    }
  },

  /**
   * 获取跳转到聊天页面的URL列表
   * @param {String} chatId - 聊天ID
   * @param {String} inviter - 邀请人昵称
   * @returns {Array} 跳转URL列表
   */
  getChatUrlList: function(chatId, inviter) {
    if (!chatId) return [];
    
    const encodedInviter = encodeURIComponent(inviter || '朋友');
    
    // 按优先级排序的跳转URL列表（强化邀请标识）
    return [
      `/app/pages/chat/chat?id=${chatId}&inviter=${encodedInviter}&fromInvite=true&action=join`,
      `../chat/chat?id=${chatId}&inviter=${encodedInviter}&fromInvite=true&action=join`,
      `/pages/chat/chat?id=${chatId}&inviter=${encodedInviter}&fromInvite=true&action=join`
    ];
  },

  /**
   * 尝试跳转到聊天页面
   * @param {String} chatId - 聊天ID
   * @param {String} inviter - 邀请人昵称
   * @param {Function} onSuccess - 成功回调
   * @param {Function} onFail - 失败回调
   */
  tryNavigateToChat: function(chatId, inviter, onSuccess, onFail) {
    console.log('[邀请流程] 尝试跳转到聊天页面', chatId, inviter);
    
    if (!chatId) {
      console.error('[邀请流程] 缺少聊天ID，无法跳转');
      if (typeof onFail === 'function') onFail();
      return;
    }
    
    const urls = this.getChatUrlList(chatId, inviter);
    this.tryNavigateToUrls(urls, 0, onSuccess, onFail);
  },
  
  /**
   * 尝试按顺序导航到URL列表中的URL
   * @param {Array} urls - URL列表
   * @param {Number} index - 当前尝试的索引
   * @param {Function} onSuccess - 成功回调
   * @param {Function} onFail - 所有URL尝试失败后的回调
   */
  tryNavigateToUrls: function(urls, index, onSuccess, onFail) {
    // 检查是否已经尝试完所有URL
    if (index >= urls.length) {
      console.error('[邀请流程] 所有URL尝试都失败');
      if (typeof onFail === 'function') onFail();
      return;
    }
    
    const currentUrl = urls[index];
    console.log(`[邀请流程] 尝试跳转到(${index+1}/${urls.length}): ${currentUrl}`);
    
    // 使用安全封装，避免并发跳转导致丢失 webview
    if (!this._navLocked) {
      this._navLocked = true;
      clearTimeout(this._navLockTimer);
      this._navLockTimer = setTimeout(() => { this._navLocked = false; }, 2000);
      wx.reLaunch({
        url: currentUrl,
        success: () => {
          this._navLocked = false;
          console.log(`[邀请流程] 成功跳转到: ${currentUrl}`);
          if (typeof onSuccess === 'function') onSuccess();
        },
        fail: (err) => {
          this._navLocked = false;
          console.error(`[邀请流程] 跳转失败: ${currentUrl}`, err);
          // 尝试下一个URL
          this.tryNavigateToUrls(urls, index + 1, onSuccess, onFail);
        }
      });
    } else {
      console.warn('[导航] 跳过重复跳转:', currentUrl);
      // 直接尝试下一个，避免卡住
      this.tryNavigateToUrls(urls, index + 1, onSuccess, onFail);
    }
  },

  /**
   * 处理邀请参数
   * @param {Object} options - 可能包含邀请信息的参数对象
   * @returns {Object|null} 提取出的邀请信息，或者null
   */
  handleInviteParams: function(options) {
    console.log('[邀请流程] 处理邀请参数:', options);
    
    if (!options) {
      console.log('[邀请流程] options为空，跳过处理');
      return null;
    }
    
    let inviteId = null;
    let inviter = null;
    
    // 直接提取options中的邀请信息
    if (options.inviteId) {
      console.log('[邀请流程] 从直接参数中找到邀请ID:', options.inviteId);
      inviteId = options.inviteId;
      inviter = options.inviter || '朋友'; // 统一使用inviter参数
    }
    // 从query中提取
    else if (options.query && options.query.inviteId) {
      console.log('[邀请流程] 从query参数中找到邀请ID:', options.query.inviteId);
      inviteId = options.query.inviteId;
      inviter = options.query.inviter || '朋友'; // 统一使用inviter参数
    }
    // 从id参数中提取(兼容聊天页面的参数格式)
    else if (options.id) {
      console.log('[邀请流程] 从id参数中找到邀请ID:', options.id);
      inviteId = options.id;
      inviter = options.inviter || '朋友'; // 统一使用inviter参数
    }
    // 从referrerInfo.extraData中提取
    else if (options.referrerInfo && options.referrerInfo.extraData) {
      const extraData = options.referrerInfo.extraData;
      if (extraData.inviteId) {
        console.log('[邀请流程] 从extraData中找到邀请ID:', extraData.inviteId);
        inviteId = extraData.inviteId;
        inviter = extraData.inviter || '朋友'; // 统一使用inviter参数
      }
    }
    // 从scene中提取
    else if (options.scene) {
      try {
        const scene = decodeURIComponent(options.scene);
        console.log('[邀请流程] 尝试从scene中解析邀请信息:', scene);
        
        // 尝试多种格式
        if (scene.includes('=')) {
          // 格式1: "inviteId=xxx&inviter=yyy"
          try {
            const params = new URLSearchParams(scene);
            inviteId = params.get('inviteId');
            inviter = params.get('inviter') || '朋友'; // 统一使用inviter参数
            if (inviteId) {
              console.log('[邀请流程] 从scene参数中解析出邀请ID:', inviteId, '邀请者:', inviter);
            }
          } catch (e) {
            console.error('[邀请流程] 解析scene参数失败:', e);
          }
        } 
        // 格式2: "xxx,yyy" (逗号分隔)
        else if (scene.includes(',')) {
          const parts = scene.split(',');
          if (parts.length >= 1) {
            inviteId = parts[0];
            if (parts.length >= 2) {
              inviter = parts[1];
            } else {
              inviter = '朋友'; // 默认名称
            }
            console.log('[邀请流程] 从逗号分隔scene中解析出邀请ID:', inviteId, '邀请者:', inviter);
          }
        }
        // 格式3: 直接使用scene作为inviteId
        else if (scene.length > 0) {
          inviteId = scene;
          inviter = '朋友'; // 默认名称
          console.log('[邀请流程] 直接使用scene作为邀请ID:', inviteId, '邀请者:', inviter);
        }
      } catch (e) {
        console.error('[邀请流程] 解析scene参数失败:', e);
      }
    }
    
    // 如果找到邀请ID，保存邀请信息
    if (inviteId) {
      console.log('[邀请流程] 成功找到邀请信息，ID:', inviteId, '邀请者:', inviter);
      return this.saveInviteInfo(inviteId, inviter);
    }
    
    console.log('[邀请流程] 未在参数中找到邀请信息，检查存储');
    // 检查是否有待处理的邀请信息
    return this.getStoredInviteInfo();
  }
}) 