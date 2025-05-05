/**
 * 主入口页面
 * 负责检查登录状态，处理邀请和路由
 */
Page({
  data: {
    loading: true,
    message: '加载中...'
  },
  
  /**
   * 页面加载处理
   */
  onLoad: function(options) {
    console.log('🔥 入口页面加载:', options);
    
    // 保存启动参数到本地，便于调试
    const entryData = {
      options: options,
      time: new Date().toString(),
      scene: getApp().globalData.launchOptions?.scene || '未知场景'
    };
    
    wx.setStorageSync('entryOptions', entryData);
    
    // 处理和保存可能的邀请参数
    this.processInviteParams(options);
    
    // 延迟跳转到登录页
    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/login/login',
        success: () => {
          console.log('🔥 跳转到登录页成功');
        },
        fail: (err) => {
          console.error('🔥 跳转到登录页失败:', err);
          this.setData({ 
            loading: false,
            message: '跳转失败，请重启小程序'
          });
        }
      });
    }, 1000);
  },
  
  /**
   * 处理邀请参数
   */
  processInviteParams: function(options) {
    try {
      // 从各种可能的来源提取邀请参数
      let inviteId = null;
      let inviter = '朋友';
      
      // 1. 直接参数
      if (options.inviteId) {
        inviteId = options.inviteId;
        inviter = options.inviter || inviter;
      }
      // 2. query对象
      else if (options.query) {
        if (typeof options.query === 'object') {
          inviteId = options.query.inviteId;
          inviter = options.query.inviter || inviter;
        } else if (typeof options.query === 'string') {
          try {
            const queryObj = JSON.parse(options.query);
            inviteId = queryObj.inviteId;
            inviter = queryObj.inviter || inviter;
          } catch (e) {
            console.error('解析query字符串失败:', e);
          }
        }
      }
      // 3. scene参数
      else if (options.scene) {
        try {
          const scene = decodeURIComponent(options.scene);
          
          // 尝试多种可能的格式解析scene参数
          if (scene.includes('=')) {
            try {
              const params = new URLSearchParams(scene);
              inviteId = params.get('inviteId');
              inviter = params.get('inviter') || inviter;
            } catch (e) { 
              console.error('解析scene参数失败:', e);
            }
          } 
          // 格式2: "xxx,yyy" (逗号分隔)
          else if (scene.includes(',')) {
            const parts = scene.split(',');
            if (parts.length >= 1) {
              inviteId = parts[0];
              if (parts.length >= 2) {
                inviter = parts[1];
              }
            }
          }
          // 格式3: 直接使用scene作为inviteId
          else if (scene.length > 0) {
            inviteId = scene;
          }
        } catch (e) {
          console.error('解析scene参数失败:', e);
        }
      }
      
      // 如果成功提取到邀请ID，保存到本地存储
      if (inviteId) {
        console.log('成功提取邀请参数:', {inviteId, inviter});
        
        const inviteInfo = {
          inviteId: inviteId,
          inviter: inviter,
          timestamp: Date.now()
        };
        
        wx.setStorageSync('pendingInvite', inviteInfo);
      }
    } catch (error) {
      console.error('处理邀请参数出错:', error);
    }
  }
}); 