/**
 * 登录页面逻辑
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    isLoading: false
  },

  /**
   * 页面加载时执行
   */
  onLoad: function () {
    // 检查是否已经登录
    const app = getApp();
    if (app.globalData.hasLogin) {
      this.navigateToHome();
    }
    
    // 检查云环境是否初始化
    if (!wx.cloud) {
      console.error('基础库版本过低，请使用2.2.3或以上的基础库');
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，请升级微信后再使用',
        showCancel: false
      });
      return;
    }
    
    // 确保云环境已初始化
    if (!wx.cloud._isInit) {
      const app = getApp();
      app.initCloud();
    }
  },

  /**
   * 用户点击获取头像昵称授权按钮
   * @param {Object} e - 事件对象
   */
  getUserProfile: function (e) {
    const that = this;
    that.setData({
      isLoading: true
    });

    // 推荐使用wx.getUserProfile获取用户信息
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        console.log('获取用户信息成功', res.userInfo);
        // 获取用户openId
        that.loginWithWeixin(res.userInfo);
      },
      fail: (err) => {
        console.error('获取用户信息失败', err);
        wx.showToast({
          title: '授权失败',
          icon: 'none'
        });
        that.setData({
          isLoading: false
        });
      }
    });
  },

  /**
   * 使用微信登录并获取openId
   * @param {Object} userInfo - 用户信息
   */
  loginWithWeixin: function (userInfo) {
    const that = this;
    
    console.log('正在调用login云函数...');
    // 使用云函数获取openId并注册/更新用户
    wx.cloud.callFunction({
      name: 'login',
      data: { userInfo },
      success: (res) => {
        console.log('云函数调用成功:', res);
        if (res.result && res.result.success) {
          // 存储用户信息
          const app = getApp();
          // 将openId添加到用户信息中
          userInfo.openId = res.result.openId;
          app.globalData.userInfo = userInfo;
          app.globalData.hasLogin = true;
          
          // 存储用户信息到本地
          wx.setStorage({
            key: 'userInfo',
            data: userInfo
          });
          
          wx.showToast({
            title: '登录成功',
            icon: 'success',
            duration: 2000
          });
          
          that.navigateToHome();
        } else {
          console.error('登录失败:', res);
          let errorMsg = '登录失败，请重试';
          // 如果返回了具体错误信息，则显示
          if (res.result && res.result.error && res.result.error.message) {
            console.error('错误详情:', res.result.error.message);
            errorMsg = '登录失败: ' + res.result.error.message;
          }
          wx.showToast({
            title: errorMsg,
            icon: 'none'
          });
          that.setData({
            isLoading: false
          });
        }
      },
      fail: (err) => {
        console.error('云函数调用失败:', err);
        let errorMsg = '网络异常，请重试';
        if (err && err.errMsg) {
          console.error('错误详情:', err.errMsg);
          // 针对不同错误类型提供更具体的提示
          if (err.errMsg.includes('FunctionName not exist')) {
            errorMsg = '登录功能未部署，请联系管理员';
          } else if (err.errMsg.includes('timeout')) {
            errorMsg = '网络连接超时，请检查网络';
          }
        }
        wx.showToast({
          title: errorMsg,
          icon: 'none',
          duration: 3000
        });
        that.setData({
          isLoading: false
        });
      },
      complete: () => {
        // 无论成功失败，确保loading状态被清除
        setTimeout(() => {
          if (that.data.isLoading) {
            that.setData({
              isLoading: false
            });
          }
        }, 3000);
      }
    });
  },

  /**
   * 跳转到首页
   */
  navigateToHome: function () {
    wx.reLaunch({
      url: '/app/pages/home/home'
    });
  }
}) 
}) 