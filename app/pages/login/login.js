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

    // 处理可能存在的邀请参数
    this.handleInviteParams(options);
    
    // 检查是否开启调试模式
    this.checkDebugMode();
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
    
    const app = getApp();
    const inviteInfo = app.handleInviteParams(options);
    
    if (inviteInfo) {
      this.setData({
        inviteId: inviteInfo.inviteId,
        inviter: inviteInfo.inviter,
        isInvited: true
      });
      
      console.log('[邀请流程] 登录页面已记录邀请信息:', inviteInfo);
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
        
        // 提取openId - 尝试多种方式获取
        let openId = null;
        
        // 检查所有可能的位置
        if (res.result.openId) {
          // 直接从结果中获取
          openId = res.result.openId;
          console.log('从结果中直接获取到openId:', openId);
        } else if (res.result.tcbContext && res.result.tcbContext.OPENID) {
          // 从tcbContext中获取
          openId = res.result.tcbContext.OPENID;
          console.log('从tcbContext中获取到openId:', openId);
        } else {
          // 如果没有找到，生成一个本地ID
          openId = 'local_' + Date.now();
          console.log('无法从服务器获取openId，生成本地ID:', openId);
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
          // 从app全局获取最新的邀请信息
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
            // 普通用户登录，跳转到首页
            console.log('普通用户登录成功，尝试跳转到首页');
            // 先尝试绝对路径
            wx.reLaunch({
              url: '/app/pages/home/home',
              success: () => {
                console.log('使用绝对路径成功跳转到首页');
              },
              fail: (err) => {
                console.error('绝对路径跳转到首页失败:', err);
                // 尝试相对路径
                wx.reLaunch({
                  url: '../home/home',
                  success: () => {
                    console.log('使用相对路径成功跳转到首页');
                  },
                  fail: (err2) => {
                    console.error('相对路径跳转到首页也失败:', err2);
                    // 最后尝试传统路径
                    wx.reLaunch({
                      url: '/pages/home/home',
                      success: () => {
                        console.log('使用传统路径成功跳转到首页');
                      },
                      fail: (err3) => {
                        // 弹窗提示跳转失败
                        wx.showModal({
                          title: '跳转失败',
                          content: '无法进入首页，请重启小程序',
                          showCancel: false
                        });
                      }
                    });
                  }
                });
              }
            });
          }
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