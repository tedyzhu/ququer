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
    inviteId: '', // 邀请ID
    inviter: '', // 邀请人
    isInvited: false, // 是否是被邀请的用户
    isDebugMode: false // 调试模式开关
  },

  /**
   * 页面加载时执行
   */
  onLoad: function(options) {
    console.log('登录页面加载，参数:', options);
    
    // 检查云环境是否已初始化
    const app = getApp();
    if (!app.globalData.cloudInitialized) {
      console.log('云环境未初始化，开始初始化...');
      app.initCloud();
    } else {
      console.log('云环境已初始化');
    }

    // 检查是否有待处理的邀请信息
    const pendingInvite = wx.getStorageSync('pendingInvite');
    if (pendingInvite && pendingInvite.inviteId) {
      console.log('检测到待处理邀请:', pendingInvite);
      this.setData({
        inviteId: pendingInvite.inviteId,
        inviter: pendingInvite.inviter || '朋友',
        isInvited: true
      });
    } else {
      // 向下兼容旧的存储方式
      const isInvited = wx.getStorageSync('isInvited');
      const inviteId = wx.getStorageSync('inviteId');
      
      if (isInvited && inviteId) {
        console.log('检测到旧格式邀请信息，邀请ID:', inviteId);
        this.setData({
          inviteId: inviteId,
          isInvited: true
        });
      }
    }
    
    // 检查是否开启调试模式
    this.checkDebugMode();
  },
  
  /**
   * 检查是否开启调试模式
   */
  checkDebugMode: function() {
    try {
      // 在开发环境中可以开启调试模式
      const systemInfo = wx.getSystemInfoSync();
      if (systemInfo.platform === 'devtools') {
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
   * 表单提交事件
   * @param {Object} e - 事件对象
   */
  onFormSubmit: function(e) {
    const nickname = e.detail.value.nickname;
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

    console.log('准备调用登录云函数，发送数据:', userInfo);

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
        
        // 打印完整结构便于调试
        console.log('完整结构:', JSON.stringify(res.result));
        
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
        app.globalData.userInfo = userInfo;
        app.globalData.openId = openId;
        app.globalData.hasLogin = true;
        
        console.log('用户信息已存储到全局数据，openId:', openId);
        
        // 存储用户信息到本地
        wx.setStorage({
          key: 'userInfo',
          data: userInfo,
          success: () => console.log('用户信息已存储到本地存储')
        });
        
        wx.setStorage({
          key: 'openId',
          data: openId,
          success: () => console.log('openId已存储到本地存储')
        });
        
        // 显示登录成功提示
        wx.showToast({
          title: '登录成功',
          icon: 'success',
          duration: 1000
        });
        
        // 根据是否是被邀请用户决定跳转逻辑
        setTimeout(() => {
          if (this.data.isInvited && this.data.inviteId) {
            console.log('被邀请用户登录成功，直接进入聊天，邀请ID:', this.data.inviteId);
            
            // 跳转到聊天页面
            const chatUrl = `/app/pages/chat/chat?id=${this.data.inviteId}&inviter=${encodeURIComponent(this.data.inviter || '朋友')}`;
            console.log('准备跳转到聊天页面:', chatUrl);
            
            wx.reLaunch({
              url: chatUrl,
              success: () => {
                console.log('成功跳转到聊天页面');
                
                // 登录成功并跳转后，延迟一段时间再清除邀请信息
                setTimeout(() => {
                  wx.removeStorageSync('pendingInvite');
                  wx.removeStorageSync('isInvited');
                  wx.removeStorageSync('inviteId');
                }, 5000);
              },
              fail: (err) => {
                console.error('跳转到聊天页面失败:', err);
                
                // 尝试使用另一种路径格式
                const altChatUrl = `../chat/chat?id=${this.data.inviteId}&inviter=${encodeURIComponent(this.data.inviter || '朋友')}`;
                console.log('尝试使用相对路径跳转:', altChatUrl);
                
                wx.reLaunch({
                  url: altChatUrl,
                  success: () => {
                    console.log('使用相对路径跳转成功');
                  },
                  fail: (err2) => {
                    console.error('相对路径跳转也失败:', err2);
                    // 弹窗提示跳转失败
                    wx.showModal({
                      title: '跳转失败',
                      content: '无法进入聊天页面，即将进入首页',
                      showCancel: false,
                      success: () => {
                        // 如果失败，跳转到首页
                        wx.reLaunch({
                          url: '../home/home'
                        });
                      }
                    });
                  }
                });
              }
            });
          } else {
            // 普通用户登录，跳转到首页
            console.log('普通用户登录成功，跳转到首页');
            wx.reLaunch({
              url: '../home/home',
              success: () => {
                console.log('成功跳转到首页');
              },
              fail: (err) => {
                console.error('跳转到首页失败:', err);
                // 弹窗提示跳转失败
                wx.showModal({
                  title: '跳转失败',
                  content: '无法进入首页，请重启小程序',
                  showCancel: false
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
  }
}); 