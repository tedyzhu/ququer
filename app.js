App({
  /**
   * 全局数据
   */
  globalData: {
    userInfo: null,
    hasLogin: false,
    conversations: [],
    cloudInitialized: false,
    launchOptions: null, // 存储启动参数
    pendingInvite: null  // 存储待处理的邀请信息
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
    
    // 设置web-view安全隔离，解决SharedArrayBuffer警告
    if (wx.setWebViewSecurity) {
      wx.setWebViewSecurity({
        enable: true,
        complete: (res) => {
          console.log('设置web-view安全隔离结果:', res);
        }
      });
    }
    
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
   * 小程序启动，或从后台进入前台显示时触发
   */
  onShow: function(options) {
    console.log('App onShow，参数:', options);
    
    // 更新启动参数
    this.globalData.launchOptions = options;
    
    // 每次显示时检查登录状态
    if (!this.globalData.hasLogin) {
      // 直接调用检查登录状态方法，不使用catch链
      this.checkLoginStatus();
    }
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
        console.log('开始初始化云环境 cloud1-9gmp8bcn2dc3576a');
        wx.cloud.init({
          env: 'cloud1-9gmp8bcn2dc3576a',
          traceUser: true,
          // 增强安全相关配置，解决SharedArrayBuffer警告
          securityHeaders: {
            enableCrossOriginIsolation: true,
            crossOriginOpenerPolicy: {
              value: 'same-origin'
            },
            crossOriginEmbedderPolicy: {
              value: 'require-corp'
            },
            crossOriginResourcePolicy: {
              value: 'same-origin'
            }
          }
        });
        console.log('云环境初始化成功: cloud1-9gmp8bcn2dc3576a');
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
    // 如果全局数据中已有登录状态，直接使用
    if (this.globalData.hasLogin && this.globalData.userInfo) {
      console.log('全局数据中已有登录状态，无需重新检查');
      return true;
    }
    
    console.log('开始检查登录状态...');
    
    const that = this;
    
    // 先尝试从本地存储获取用户信息
    wx.getStorage({
      key: 'userInfo',
      success: function (res) {
        if (res.data && res.data.nickName) {
          console.log('从本地存储获取到用户信息:', res.data.nickName);
          that.globalData.userInfo = res.data;
          that.globalData.hasLogin = true;
          
          // 再尝试获取openId
          wx.getStorage({
            key: 'openId',
            success: function (openIdRes) {
              console.log('从本地存储获取到openId:', openIdRes.data);
              that.globalData.openId = openIdRes.data;
              
              // 确保用户信息中包含openId
              if (!that.globalData.userInfo.openId && that.globalData.openId) {
                that.globalData.userInfo.openId = that.globalData.openId;
                
                // 更新存储
                wx.setStorage({
                  key: 'userInfo',
                  data: that.globalData.userInfo
                });
              }
              
              // 更新用户登录时间
              that.updateUserLoginTime(that.globalData.userInfo);
            },
            fail: function (err) {
              // openId获取失败，但仍然有用户信息
              console.log('未能获取openId，但用户信息有效，可能需要重新登录');
            }
          });
        } else {
          console.log('本地存储中的用户信息无效');
          that.cleanLoginStatus();
        }
      },
      fail: function (err) {
        // 静默处理未登录状态，不输出错误
        console.log('用户尚未登录（未找到用户信息）');
        that.cleanLoginStatus();
      }
    });
  },
  
  /**
   * 更新用户登录时间
   * @param {Object} userInfo - 用户信息
   */
  updateUserLoginTime: function(userInfo) {
    // 确保云环境已初始化
    if (!this.globalData.cloudInitialized) {
      this.initCloud();
    }
    
    // 调用云函数更新登录时间
    wx.cloud.callFunction({
      name: 'login',
      data: { userInfo },
      success: res => {
        console.log('更新登录时间成功', res);
      },
      fail: err => {
        console.error('更新登录时间失败', err);
      }
    });
  },
  
  /**
   * 保存用户信息
   * @param {Object} userInfo - 用户信息
   * @param {String} openId - 用户的唯一标识
   */
  saveUserInfo: function(userInfo, openId) {
    // 添加openId到用户信息
    userInfo.openId = openId;
    
    // 保存到全局数据
    this.globalData.userInfo = userInfo;
    this.globalData.hasLogin = true;
    this.globalData.openId = openId;
    
    console.log('用户信息已存储到全局数据', userInfo);
    
    // 保存到本地存储
    wx.setStorage({
      key: 'userInfo',
      data: userInfo,
      success: function() {
        console.log('用户信息成功保存到本地存储');
      },
      fail: function(err) {
        console.error('保存用户信息到本地存储失败:', err);
      }
    });
    
    // 存储openId
    wx.setStorage({
      key: 'openId',
      data: openId,
      success: function() {
        console.log('openId成功保存到本地存储');
      },
      fail: function(err) {
        console.error('保存openId到本地存储失败:', err);
      }
    });
    
    return userInfo;
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
    
    // 统一使用inviter参数，不再使用name参数
    return [
      `/pages/chat/chat?id=${chatId}&inviter=${encodedInviter}`,
      `../chat/chat?id=${chatId}&inviter=${encodedInviter}`,
      `/app/pages/chat/chat?id=${chatId}&inviter=${encodedInviter}`
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
   * 递归尝试URL列表
   * @param {Array} urls - URL列表
   * @param {Number} index - 当前尝试的索引
   * @param {Function} onSuccess - 成功回调
   * @param {Function} onFail - 失败回调
   */
  tryNavigateToUrls: function(urls, index, onSuccess, onFail) {
    // 如果已尝试所有URL，则执行失败回调
    if (index >= urls.length) {
      console.error('[邀请流程] 所有跳转URL都失败了');
      if (typeof onFail === 'function') {
        onFail();
      }
      return;
    }
    
    const currentUrl = urls[index];
    console.log(`[邀请流程] 尝试跳转到URL(${index+1}/${urls.length}): ${currentUrl}`);
    
    wx.reLaunch({
      url: currentUrl,
      success: () => {
        console.log(`[邀请流程] 成功跳转到: ${currentUrl}`);
        if (typeof onSuccess === 'function') {
          onSuccess();
        }
      },
      fail: (err) => {
        console.error(`[邀请流程] 跳转到 ${currentUrl} 失败:`, err);
        // 递归尝试下一个URL
        this.tryNavigateToUrls(urls, index + 1, onSuccess, onFail);
      }
    });
  },

  /**
   * 处理邀请参数
   * @param {Object} options - 可能包含邀请信息的参数对象
   * @returns {Object|null} 提取出的邀请信息，或者null
   */
  handleInviteParams: function(options) {
    console.log('[邀请流程] 处理邀请参数:', options);
    
    let inviteId = null;
    let inviter = null;
    
    // 直接提取options中的邀请信息
    if (options.inviteId) {
      console.log('[邀请流程] 从直接参数中找到邀请ID:', options.inviteId);
      inviteId = options.inviteId;
      inviter = options.inviter;
    }
    // 从query中提取
    else if (options.query && options.query.inviteId) {
      console.log('[邀请流程] 从query参数中找到邀请ID:', options.query.inviteId);
      inviteId = options.query.inviteId;
      inviter = options.query.inviter;
    }
    // 从referrerInfo.extraData中提取
    else if (options.referrerInfo && options.referrerInfo.extraData) {
      const extraData = options.referrerInfo.extraData;
      if (extraData.inviteId) {
        console.log('[邀请流程] 从extraData中找到邀请ID:', extraData.inviteId);
        inviteId = extraData.inviteId;
        inviter = extraData.inviter;
      }
    }
    
    // 如果找到邀请ID，保存邀请信息
    if (inviteId) {
      return this.saveInviteInfo(inviteId, inviter);
    }
    
    // 检查是否有待处理的邀请信息
    return this.getStoredInviteInfo();
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
    this.globalData.pendingInvite = null;
    wx.removeStorageSync('pendingInvite');
    wx.removeStorageSync('isInvited');
    wx.removeStorageSync('inviteId');
  },

  /**
   * 清除登录状态
   */
  cleanLoginStatus: function() {
    console.log('清除登录状态');
    
    // 重置全局数据
    this.globalData.userInfo = null;
    this.globalData.hasLogin = false;
    this.globalData.openId = null;
    
    try {
      // 移除存储的登录信息
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('openId');
      console.log('成功清除登录存储数据');
    } catch (e) {
      console.error('清除登录存储数据失败:', e);
    }
  }
}) 