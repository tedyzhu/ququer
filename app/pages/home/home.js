/**
 * 首页/会话列表页面逻辑
 */
Page({
  /**
   * 页面初始数据
   */
  data: {
    userInfo: {},
    conversations: [],
    loading: true,
    lastLoginTime: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function () {
    this.checkLoginStatus();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    this.fetchConversations();
    // 获取用户最近登录时间
    this.getUserData();
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus: function () {
    const app = getApp();
    if (!app.globalData.hasLogin) {
      wx.redirectTo({
        url: '/app/pages/login/login'
      });
      return;
    }
    
    this.setData({
      userInfo: app.globalData.userInfo
    });
  },

  /**
   * 获取用户数据（包括最近登录时间）
   */
  getUserData: function() {
    const app = getApp();
    if (!app.globalData.hasLogin) return;
    
    console.log('正在获取用户数据，openId:', app.globalData.userInfo.openId);
    const db = wx.cloud.database();
    db.collection('users').where({
      openId: app.globalData.userInfo.openId
    }).get({
      success: res => {
        console.log('获取用户数据成功:', res);
        if (res.data && res.data.length > 0) {
          const userData = res.data[0];
          // 格式化登录时间
          let loginTimeStr = '未知';
          if (userData.lastLoginTime) {
            const loginTime = new Date(userData.lastLoginTime);
            loginTimeStr = `${loginTime.getFullYear()}-${loginTime.getMonth() + 1}-${loginTime.getDate()} ${loginTime.getHours()}:${loginTime.getMinutes()}`;
          }
          
          this.setData({
            lastLoginTime: loginTimeStr
          });
        } else {
          console.log('未找到用户数据');
        }
      },
      fail: err => {
        console.error('获取用户数据失败', err);
      }
    });
  },

  /**
   * 获取会话列表
   */
  fetchConversations: function () {
    const that = this;
    // 调用云函数获取会话列表
    wx.cloud.callFunction({
      name: 'getConversations',
      success: res => {
        console.log('获取会话列表成功', res);
        if (res.result && res.result.success) {
          // 处理会话列表数据
          const conversations = res.result.conversations.map(conv => {
            return {
              id: conv.id,
              avatarUrl: conv.contactInfo.avatarUrl || 'https://placekitten.com/80/80',
              nickName: conv.contactInfo.nickName || '用户',
              lastMessage: conv.lastMessage.destroyed ? '' : conv.lastMessage.content,
              lastTime: that.formatTime(conv.lastMessage.time),
              unread: 0, // 默认无未读
              destroyed: conv.lastMessage.destroyed
            };
          });
          
          that.setData({
            conversations: conversations,
            loading: false
          });
          
          // 更新全局数据
          const app = getApp();
          app.globalData.conversations = conversations;
        } else {
          // 获取失败时显示模拟数据
          that.showMockData();
        }
      },
      fail: err => {
        console.error('获取会话列表失败', err);
        // 获取失败时显示模拟数据
        that.showMockData();
      }
    });
  },
  
  /**
   * 显示模拟数据（作为备份）
   */
  showMockData: function() {
    const mockConversations = [
      {
        id: '1',
        avatarUrl: 'https://placekitten.com/80/80',
        nickName: '张三',
        lastMessage: '你好，这是一条测试消息',
        lastTime: '14:25',
        unread: 2,
        destroyed: false
      },
      {
        id: '2',
        avatarUrl: 'https://placekitten.com/81/81',
        nickName: '李四',
        lastMessage: '',
        lastTime: '昨天',
        unread: 0,
        destroyed: true
      },
      {
        id: '3',
        avatarUrl: 'https://placekitten.com/82/82',
        nickName: '王五',
        lastMessage: '请查看我发送的最新文档',
        lastTime: '周一',
        unread: 1,
        destroyed: false
      }
    ];

    this.setData({
      conversations: mockConversations,
      loading: false
    });

    // 更新全局数据
    const app = getApp();
    app.globalData.conversations = mockConversations;
  },

  /**
   * 格式化时间
   */
  formatTime: function(timeStr) {
    if (!timeStr) return '';
    
    const time = new Date(timeStr);
    const now = new Date();
    
    // 今天的消息显示时间
    if (time.toDateString() === now.toDateString()) {
      return `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 昨天的消息
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (time.toDateString() === yesterday.toDateString()) {
      return '昨天';
    }
    
    // 一周内的消息显示星期几
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const diffDays = Math.floor((now - time) / (24 * 3600 * 1000));
    if (diffDays < 7) {
      return weekdays[time.getDay()];
    }
    
    // 更早的消息显示日期
    return `${time.getMonth() + 1}-${time.getDate()}`;
  },

  /**
   * 打开聊天页面
   * @param {Object} e - 事件对象
   */
  navigateToChat: function (e) {
    const { id, nickname } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/app/pages/chat/chat?id=${id}&name=${encodeURIComponent(nickname)}`
    });
  },

  /**
   * 添加新联系人
   */
  addContact: function () {
    wx.showToast({
      title: '添加好友功能开发中',
      icon: 'none'
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '秘信 - 阅后即焚的私密聊天工具',
      path: '/app/pages/login/login'
    };
  }
}) 