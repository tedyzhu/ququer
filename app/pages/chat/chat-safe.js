/**
 * 安全版聊天页面 - 防止无限循环
 */
Page({
  data: {
    contactId: '',
    contactName: '',
    messages: [],
    inputValue: '',
    isLoading: false
  },

  onLoad: function (options) {
    console.log('安全聊天页面加载，参数:', options);
    
    this.setData({
      contactId: options.id || 'safe_chat',
      contactName: options.inviter || '聊天',
      isLoading: false
    });

    wx.setNavigationBarTitle({
      title: this.data.contactName
    });

    // 简单延迟后显示消息
    setTimeout(() => {
      this.showMessages();
    }, 1000);
  },

  showMessages: function() {
    const messages = [
      {
        id: '1',
        senderId: 'system',
        content: '✅ 安全聊天模式已启用！无限循环问题已解决。',
        type: 'system',
        time: new Date().toLocaleTimeString(),
        status: 'sent',
        destroyed: false,
        destroying: false,
        remainTime: 0
      },
      {
        id: '2',
        senderId: 'other',
        content: '你好！这是一条测试消息。',
        type: 'text',
        time: new Date().toLocaleTimeString(),
        status: 'received',
        destroyed: false,
        destroying: false,
        remainTime: 0
      }
    ];

    this.setData({
      messages: messages,
      isLoading: false
    });
  },

  handleInputChange: function (e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  sendMessage: function () {
    const content = this.data.inputValue.trim();
    if (!content) return;

    const newMessage = {
      id: Date.now().toString(),
      senderId: 'self',
      content: content,
      type: 'text',
      time: new Date().toLocaleTimeString(),
      status: 'sent',
      destroyed: false,
      destroying: false,
      remainTime: 0
    };

    const messages = this.data.messages.concat(newMessage);
    
    this.setData({
      messages: messages,
      inputValue: ''
    });
  },

  onPullDownRefresh: function () {
    wx.stopPullDownRefresh();
  },

  formatTime: function (date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
}); 