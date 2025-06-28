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
    pendingInvite: null,  // 存储待处理的邀请信息
    ENCODING_FIX_APPLIED: false, // 编码修复状态
    CLOUD_FIX_APPLIED: false, // 云函数错误修复状态
    SAFE_CLOUD_FIX_APPLIED: false // 安全的云函数错误修复状态
  },

  /**
   * 当小程序初始化完成时，会触发 onLaunch（全局只触发一次）
   * @param {Object} options - 启动参数
   */
  onLaunch: function (options) {
    console.log('小程序启动，参数:', options);
    
    // 🔥 立即保存启动参数，确保分享链接信息不丢失
    this.globalData.launchOptions = options;
    
    // 🔥 优先检查和保存分享邀请信息
    this.checkAndSaveShareInvite(options);
    
    // 🚨 立即应用编码修复，防止btoa错误
    try {
      require('./fix-encoding-error.js');
      this.globalData.ENCODING_FIX_APPLIED = true;
      console.log('✅ 编码修复已应用');
    } catch (e) {
      console.warn('编码修复应用失败，但不影响正常功能:', e);
    }
    
    // 🚨 应用云函数错误修复
    try {
      require('./fix-cloud-function-errors.js');
      this.globalData.CLOUD_FIX_APPLIED = true;
      console.log('✅ 云函数错误修复已应用');
    } catch (e) {
      console.warn('云函数错误修复应用失败:', e);
    }
    
    // 🚨 应用安全的云函数错误修复
    try {
      require('./fix-cloud-function-errors-safe.js');
      this.globalData.SAFE_CLOUD_FIX_APPLIED = true;
      console.log('✅ 安全的云函数错误修复已应用');
    } catch (e) {
      console.warn('安全的云函数错误修复应用失败:', e);
    }
    
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
    
    // 🔧 修复：设置安全标头，解决SharedArrayBuffer警告
    this.setupSecurityHeaders();
    
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
    
    // 🔗 每次显示时检查邀请参数（支持普通模式的分享链接）
    this.handleInviteParams(options);
    
    // 每次显示时检查登录状态
    if (!this.globalData.hasLogin) {
      // 直接调用检查登录状态方法，不使用catch链
      this.checkLoginStatus();
    }
  },
  
  /**
   * 设置安全标头，解决SharedArrayBuffer相关警告
   * @private
   */
  setupSecurityHeaders: function() {
    try {
      // 设置跨域隔离配置
      if (wx.setCustomRequestConfig) {
        wx.setCustomRequestConfig({
          crossOriginIsolation: true,
          headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Resource-Policy': 'same-origin'
          }
        });
      }
      
      // 如果支持WebView安全配置
      if (wx.setWebViewSecurity) {
        wx.setWebViewSecurity({
          enable: true,
          complete: (res) => {
            console.log('🔧 WebView安全配置设置结果:', res);
          }
        });
      }
      
      console.log('🔧 安全标头配置完成');
    } catch (e) {
      console.warn('安全标头配置失败，但不影响正常功能:', e);
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
        console.log('开始初始化云环境 ququer-env-6g35f0nv28c446e7');
        wx.cloud.init({
          env: 'ququer-env-6g35f0nv28c446e7',
          traceUser: true,
          // 🔧 移除无效的安全配置（小程序云开发不支持这些配置）
          timeout: 10000, // 设置超时时间为10秒
          retry: 3        // 设置重试次数
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
    // 调用云函数更新登录时间
    if (!this.globalData.cloudInitialized) {
      console.log('云环境未初始化，延迟更新登录时间');
      // 延迟重试
      setTimeout(() => {
        if (this.globalData.cloudInitialized) {
          this.updateUserLoginTime(userInfo);
        }
      }, 2000);
      return;
    }
    
    console.log('调用云函数更新登录时间');
    wx.cloud.callFunction({
      name: 'login',
      data: { userInfo },
      timeout: 10000, // 设置超时时间
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
        
        // 如果是-404006错误，尝试重新初始化云环境
        if (err.errCode === -404006) {
          console.log('检测到-404006错误，重新初始化云环境');
          this.globalData.cloudInitialized = false;
          this.initCloud();
        }
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
    
    // 使用安全编码，避免btoa错误
    const encoding = require('./app/utils/encoding.js');
    const encodedInviter = encoding.safeEncodeNickname(inviter || '朋友');
    
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
   * 检查并保存分享邀请信息
   * @param {Object} options - 启动参数
   */
  checkAndSaveShareInvite: function(options) {
    console.log('[邀请流程] 检查分享邀请信息:', options);
    
    // 检查是否是分享链接启动
    if (options.path && options.path.includes('share')) {
      console.log('[邀请流程] 检测到分享链接启动');
      
      if (options.query && (options.query.chatId || options.query.inviteId)) {
        const chatId = options.query.chatId || options.query.inviteId;
        const inviter = options.query.inviter || '朋友';
        
        console.log('[邀请流程] 分享链接包含邀请信息:', { chatId, inviter });
        
        // 立即保存邀请信息
        const inviteInfo = {
          inviteId: chatId,
          chatId: chatId,
          inviter: inviter,
          timestamp: Date.now(),
          source: 'share_link_launch',
          isInvitee: true
        };
        
        // 保存到全局和本地存储
        this.globalData.pendingInvite = inviteInfo;
        wx.setStorageSync('pendingInvite', inviteInfo);
        
        // 同时保存分享启动信息，以备后用
        wx.setStorageSync('shareLaunchInfo', {
          path: options.path,
          query: options.query,
          timestamp: Date.now()
        });
        
        console.log('[邀请流程] 分享邀请信息已保存:', inviteInfo);
        return inviteInfo;
      }
    }
    
    // 检查query中是否直接包含邀请参数（兼容其他分享方式）
    if (options.query && (options.query.chatId || options.query.inviteId)) {
      const chatId = options.query.chatId || options.query.inviteId;
      const inviter = options.query.inviter || '朋友';
      
      console.log('[邀请流程] 直接参数包含邀请信息:', { chatId, inviter });
      
      const inviteInfo = {
        inviteId: chatId,
        chatId: chatId,
        inviter: inviter,
        timestamp: Date.now(),
        source: 'direct_params',
        isInvitee: true
      };
      
      this.globalData.pendingInvite = inviteInfo;
      wx.setStorageSync('pendingInvite', inviteInfo);
      
      console.log('[邀请流程] 直接邀请信息已保存:', inviteInfo);
      return inviteInfo;
    }
    
    return null;
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
    
    if (!options) {
      console.log('[邀请流程] options为空，跳过处理');
      return null;
    }
    
    let inviteId = null;
    let inviter = null;
    let fromInvite = false;
    
    // 🔗 检查path中是否包含邀请参数（普通模式下的分享链接）
    if (options.path && options.path.includes('chat')) {
      console.log('[邀请流程] 检测到聊天页面路径，解析参数:', options.path);
      
      // 解析path中的参数（例如：app/pages/chat/chat?id=xxx&inviter=xxx&fromInvite=true）
      const pathParts = options.path.split('?');
      if (pathParts.length > 1) {
        const queryString = pathParts[1];
        const urlParams = new URLSearchParams(queryString);
        
        console.log('[邀请流程] 解析到的URL参数:', queryString);
        
        if (urlParams.get('id')) {
          inviteId = urlParams.get('id');
          console.log('[邀请流程] 从path解析到聊天ID:', inviteId);
        }
        
        if (urlParams.get('inviter')) {
          try {
            // 🔧 处理双重编码
            inviter = decodeURIComponent(decodeURIComponent(urlParams.get('inviter')));
            console.log('[邀请流程] 从path解析到邀请者:', inviter);
          } catch (e) {
            inviter = decodeURIComponent(urlParams.get('inviter'));
            console.log('[邀请流程] 单次解码邀请者:', inviter);
          }
        }
        
        if (urlParams.get('fromInvite') === 'true') {
          fromInvite = true;
          console.log('[邀请流程] 确认来自邀请链接');
        }
      }
    }
    
    // 🔥 直接提取options中的邀请信息，兼容chatId和inviteId
    if (!inviteId && options.chatId) {
      console.log('[邀请流程] 从直接参数中找到chatId:', options.chatId);
      inviteId = options.chatId;
      inviter = options.inviter ? decodeURIComponent(options.inviter) : '朋友';
    } else if (!inviteId && options.inviteId) {
      console.log('[邀请流程] 从直接参数中找到邀请ID:', options.inviteId);
      inviteId = options.inviteId;
      inviter = options.inviter || '朋友';
    }
    // 从query中提取
    else if (!inviteId && options.query && (options.query.chatId || options.query.inviteId || options.query.id)) {
      console.log('[邀请流程] 从query参数中找到邀请ID');
      inviteId = options.query.chatId || options.query.inviteId || options.query.id;
      if (options.query.inviter) {
        try {
          inviter = decodeURIComponent(decodeURIComponent(options.query.inviter));
        } catch (e) {
          inviter = decodeURIComponent(options.query.inviter);
        }
      } else {
        inviter = '朋友';
      }
      if (options.query.fromInvite === 'true') {
        fromInvite = true;
      }
    }
    // 从referrerInfo.extraData中提取
    else if (!inviteId && options.referrerInfo && options.referrerInfo.extraData) {
      const extraData = options.referrerInfo.extraData;
      if (extraData.chatId || extraData.inviteId) {
        console.log('[邀请流程] 从extraData中找到邀请ID');
        inviteId = extraData.chatId || extraData.inviteId;
        inviter = extraData.inviter || '朋友';
      }
    }
    
    // 如果找到邀请ID，保存邀请信息
    if (inviteId) {
      const saveInfo = this.saveInviteInfo(inviteId, inviter, fromInvite);
      
      // 🔗 如果是来自邀请链接，直接导航到聊天页面
      if (fromInvite && options.path && options.path.includes('chat')) {
        console.log('[邀请流程] 检测到普通模式下的邀请链接，准备导航到聊天页面');
        // 延迟一点时间确保app初始化完成
        setTimeout(() => {
          const chatUrl = `/${options.path}`;
          console.log('[邀请流程] 导航到聊天页面:', chatUrl);
          wx.reLaunch({
            url: chatUrl,
            success: () => {
              console.log('[邀请流程] 成功导航到聊天页面');
            },
            fail: (err) => {
              console.error('[邀请流程] 导航失败，尝试备用方案:', err);
              // 备用方案：使用相对路径
              wx.reLaunch({
                url: `app/pages/chat/chat?id=${inviteId}&inviter=${encodeURIComponent(inviter)}&fromInvite=true`
              });
            }
          });
        }, 1000);
      }
      
      return saveInfo;
    }
    
    // 检查是否有待处理的邀请信息
    return this.getStoredInviteInfo();
  },
  
  /**
   * 保存邀请信息
   * @param {String} inviteId - 邀请ID (chatId或inviteId)
   * @param {String} inviter - 邀请人
   * @param {Boolean} fromInvite - 是否来自邀请链接
   * @returns {Object} 保存的邀请信息
   */
  saveInviteInfo: function(inviteId, inviter, fromInvite = false) {
    if (!inviteId) return null;
    
    const inviterName = inviter || '朋友';
    console.log(`[邀请流程] 保存邀请信息: ID=${inviteId}, 邀请人=${inviterName}, 来自邀请=${fromInvite}`);
    
    // 🔥 创建邀请信息对象，同时保存为inviteId和chatId确保兼容性
    const inviteInfo = {
      inviteId: inviteId,
      chatId: inviteId, // 🔥 兼容字段
      inviter: inviterName,
      fromInvite: fromInvite,
      timestamp: Date.now(),
      source: 'app_level_handler'
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
    if (pendingInvite && (pendingInvite.inviteId || pendingInvite.chatId)) {
      console.log('[邀请流程] 检测到本地存储的邀请:', pendingInvite);
      
      // 🔥 确保兼容性，如果只有chatId没有inviteId，则复制chatId到inviteId
      if (!pendingInvite.inviteId && pendingInvite.chatId) {
        pendingInvite.inviteId = pendingInvite.chatId;
      }
      if (!pendingInvite.chatId && pendingInvite.inviteId) {
        pendingInvite.chatId = pendingInvite.inviteId;
      }
      
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
        chatId: inviteId, // 🔥 兼容字段
        inviter: '朋友',
        timestamp: Date.now(),
        source: 'legacy_format'
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