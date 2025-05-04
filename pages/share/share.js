/**
 * 分享链接处理页面
 * 专门用于接收微信分享链接
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    loading: true,
    message: '正在处理邀请...'
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('☢️ 分享中转页面加载，参数:', options);
    
    // 关键点：无论如何先保存原始参数，以便调试
    wx.setStorageSync('debugShareParams', {
      options: options,
      time: new Date().toString(),
      from: 'share_page_onLoad'
    });
    
    // 处理分享参数并保存
    this.processAndSaveParams(options);
    
    // 无论如何都延迟跳转到登录页
    setTimeout(() => {
      wx.reLaunch({
        url: '/pages/login/login',
        success: () => {
          console.log('☢️ 从分享页成功跳转到登录页');
        },
        fail: (err) => {
          console.error('☢️ 跳转到登录页失败:', err);
          this.setData({
            message: '跳转失败，请退出小程序重试'
          });
        }
      });
    }, 1500);
  },
  
  /**
   * 处理分享参数
   */
  processAndSaveParams: function(options) {
    try {
      // 从各种可能的来源提取邀请参数
      let inviteId = null;
      let inviter = '朋友';
      
      console.log('☢️ 处理分享参数:', options);
      
      // 1. 直接参数
      if (options.inviteId) {
        inviteId = options.inviteId;
        inviter = options.inviter || inviter;
        console.log('☢️ 从直接参数获取邀请信息');
      }
      // 2. query对象
      else if (options.query) {
        if (typeof options.query === 'object') {
          inviteId = options.query.inviteId;
          inviter = options.query.inviter || inviter;
          console.log('☢️ 从query对象获取邀请信息');
        }
      }
      // 3. scene参数解码
      else if (options.scene) {
        try {
          const scene = decodeURIComponent(options.scene);
          console.log('☢️ 解码scene参数:', scene);
          // 尝试解析scene参数，格式可能是"inviteId=xxx&inviter=yyy"
          const params = new URLSearchParams(scene);
          inviteId = params.get('inviteId');
          inviter = params.get('inviter') || inviter;
        } catch (e) {
          console.error('☢️ 解析scene参数失败:', e);
        }
      }
      
      // 如果成功提取到邀请ID，保存到本地存储
      if (inviteId) {
        console.log('☢️ 成功提取邀请参数:', {inviteId, inviter});
        
        wx.setStorageSync('pendingInvite', {
          inviteId: inviteId,
          inviter: inviter,
          timestamp: Date.now(),
          source: 'share_page'
        });
        
        this.setData({
          message: `接收到${inviter}的邀请，正在跳转...`
        });
      } else {
        console.log('☢️ 未能提取邀请参数，将直接跳转到登录页');
        this.setData({
          message: '正在跳转到登录页...'
        });
      }
    } catch (error) {
      console.error('☢️ 处理分享参数出错:', error);
      this.setData({
        message: '处理邀请出错，正在跳转...'
      });
    }
  },
  
  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    // 如果用户从分享页再次分享，确保正确传递参数
    const pendingInvite = wx.getStorageSync('pendingInvite');
    
    if (pendingInvite && pendingInvite.inviteId) {
      return {
        title: `${pendingInvite.inviter}邀请你加入秘密聊天`,
        path: `/pages/share/share?inviteId=${pendingInvite.inviteId}&inviter=${encodeURIComponent(pendingInvite.inviter)}`
      };
    }
    
    // 默认分享信息
    return {
      title: '秘信 - 阅后即焚的私密聊天',
      path: '/pages/share/share'
    };
  }
}) 