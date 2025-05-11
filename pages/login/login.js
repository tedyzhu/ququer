/**
 * 登录页面逻辑
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {},
    avatarUrl: '',
    nickName: '',
    isLoading: false,
    inviteId: '', // 添加邀请ID字段
    inviter: '', // 添加邀请人字段
    isInvited: false, // 是否是被邀请的用户
    isDebugMode: false // 调试模式开关
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('[邀请流程] 登录页面加载，参数:', options);
    
    // 检查入口类型、场景值和参数
    const scene = options.scene || getApp().globalData.launchOptions?.scene || '未知场景';
    console.log('小程序启动场景:', scene);
    console.log('完整启动参数:', getApp().globalData.launchOptions);
    
    // 处理可能存在的邀请参数
    this.handleInviteParams(options);
    
    // 检查是否已登录
    this.checkLoginStatus();
    
    // 云环境初始化
    const app = getApp();
    if (app.initCloud && typeof app.initCloud === 'function') {
      if (app.initCloud()) {
        console.log('云环境已初始化');
      }
    }
    
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
    }
  },
  
  /**
   * 检查登录状态
   */
  checkLoginStatus: function() {
    const app = getApp();
    if (app.globalData.hasLogin) {
      console.log('用户已登录，跳转到首页');
      this.redirectToHome();
    }
  },

  /**
   * 检查是否开启调试模式
   */
  checkDebugMode: function() {
    try {
      // 在开发环境中可以开启调试模式
      // 或者连续点击10次昵称输入框也会开启
      const appBaseInfo = wx.getAppBaseInfo();
      if (appBaseInfo.platform === 'devtools') {
        this.setData({
          isDebugMode: true
        });
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
   * 获取用户头像
   * @param {Object} e - 事件对象
   */
  onChooseAvatar: function(e) {
    const { avatarUrl } = e.detail;
    this.setData({
      avatarUrl: avatarUrl
    });
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
   * 表单提交，进行登录
   */
  onFormSubmit: function(e) {
    // 防止重复提交
    if (this.data.isLoading) {
      return;
    }
    
    // 设置提交中状态
    this.setData({
      isLoading: true
    });
    
    // 获取表单数据
    const { nickName } = this.data;
    let { avatarUrl } = this.data;
    
    // 验证数据有效性
    if (!nickName || nickName.trim() === '') {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      });
      this.setData({ isLoading: false });
      return;
    }
    
    // 使用默认头像
    if (!avatarUrl) {
      avatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';
    }
    
    const userInfo = {
      nickName: nickName,
      avatarUrl: avatarUrl
    };
    
    console.log('[邀请流程] 准备调用登录云函数，发送数据:', userInfo);
    
    // 调用登录云函数
    wx.cloud.callFunction({
      name: 'login',
      data: {
        userInfo: userInfo
      },
      success: res => {
        console.log('登录云函数调用成功:', res);
        
        // 验证结果
        if (!res.result) {
          wx.showToast({
            title: '登录失败，请重试',
            icon: 'none'
          });
          this.setData({ isLoading: false });
          return;
        }
        
        // 获取openId
        let openId = null;
        
        if (res.result.openId) {
          openId = res.result.openId;
        } else if (res.result.tcbContext && res.result.tcbContext.OPENID) {
          openId = res.result.tcbContext.OPENID;
        } else {
          openId = 'local_' + Date.now();
          console.warn('无法从服务器获取openId，使用本地ID:', openId);
        }
        
        // 存储用户信息
        const app = getApp();
        app.saveUserInfo(userInfo, openId);
        
        // 登录成功提示
        wx.showToast({
          title: '登录成功',
          icon: 'success',
          duration: 1500
        });
        
        // 延迟执行，给提示足够显示时间
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
        }, 1500);
      },
      fail: err => {
        console.error('登录云函数调用失败:', err);
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
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
  },

  /**
   * 跳转到首页
   */
  redirectToHome: function() {
    console.log('登录成功，准备跳转页面');
    
    // 检查是否有等待处理的邀请
    const pendingInvite = wx.getStorageSync('pendingInvite');
    
    // 如果有邀请信息，直接跳转到聊天页面
    if (pendingInvite && pendingInvite.inviteId) {
      console.log('发现待处理的邀请，尝试跳转到聊天页面:', pendingInvite);
      
      // 尝试3种格式的聊天页面URL
      const chatUrls = [
        `/app/pages/chat/chat?id=${pendingInvite.inviteId}&inviter=${encodeURIComponent(pendingInvite.inviter || '朋友')}`,
        `../chat/chat?id=${pendingInvite.inviteId}&inviter=${encodeURIComponent(pendingInvite.inviter || '朋友')}`,
        `/pages/chat/chat?id=${pendingInvite.inviteId}&inviter=${encodeURIComponent(pendingInvite.inviter || '朋友')}`
      ];
      
      // 尝试第一种URL格式
      this.tryNavigateTo(chatUrls, 0, () => {
        // 所有跳转都失败的后备方案，尝试跳转到首页
        wx.reLaunch({
          url: '/app/pages/home/home',
          fail: () => {
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
      });
    } else {
      // 没有邀请，跳转到首页，尝试三种路径格式
      console.log('没有待处理的邀请，跳转到首页');
      wx.reLaunch({
        url: '/app/pages/home/home',
        success: () => {
          console.log('成功跳转到首页(绝对路径)');
        },
        fail: (err) => {
          console.error('跳转到首页失败:', err);
          // 尝试相对路径
          wx.reLaunch({
            url: '../home/home',
            success: () => {
              console.log('成功跳转到首页(相对路径)');
            },
            fail: (err2) => {
              console.error('相对路径跳转也失败:', err2);
              // 最后尝试传统路径
              wx.reLaunch({
                url: '/pages/home/home',
                success: () => {
                  console.log('成功跳转到首页(传统路径)');
                },
                fail: (err3) => {
                  console.error('所有路径尝试都失败:', err3);
                }
              });
            }
          });
        }
      });
    }
  }
}) 