/**
 * 登录页面
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    isLoading: false,
    avatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
  },

  /**
   * 页面加载时执行
   */
  onLoad: function() {
    // 检查云环境是否已初始化
    const app = getApp();
    if (!app.globalData.cloudInitialized) {
      console.log('云环境未初始化，开始初始化...');
      app.initCloud();
    } else {
      console.log('云环境已初始化');
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
        
        // 即使云函数返回格式不对，也尝试进行登录处理
        // 判断是否有tcbContext，这表示云函数至少被成功调用
        if (res.result && res.result.tcbContext) {
          // 获取用户openId
          const openId = res.result.tcbContext && res.result.tcbContext.openid;
          
          if (openId) {
            // 存储用户信息
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
            
            // 显示登录成功提示
            wx.showToast({
              title: '登录成功',
              icon: 'success',
              duration: 1500
            });
            
            // 跳转到首页
            setTimeout(() => {
              wx.reLaunch({
                url: '/app/pages/home/home'
              });
            }, 1500);
            
            return;
          }
        }
        
        // 处理标准返回格式（如之前的修改生效）
        if (res.result && res.result.success) {
          // 存储用户信息
          const app = getApp();
          app.globalData.userInfo = userInfo;
          app.globalData.openId = res.result.openId;
          app.globalData.hasLogin = true;
          
          console.log('用户信息已存储到全局数据', app.globalData);
          
          // 存储用户信息到本地
          wx.setStorage({
            key: 'userInfo',
            data: userInfo,
            success: () => console.log('用户信息已存储到本地存储')
          });
          
          // 跳转到首页
          wx.reLaunch({
            url: '/app/pages/home/home'
          });
        } else {
          console.error('登录失败，返回结果:', res.result);
          let errorMsg = '未知错误';
          
          if (res.result) {
            if (res.result.error) {
              errorMsg = res.result.error.message || JSON.stringify(res.result.error);
            } else {
              errorMsg = '返回结果格式错误: ' + JSON.stringify(res.result);
            }
          }
          
          wx.showModal({
            title: '登录失败',
            content: errorMsg,
            showCancel: false
          });
        }
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