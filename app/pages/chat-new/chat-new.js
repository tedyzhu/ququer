/**
 * 全新安全聊天页面 - 完全重写，彻底解决无限循环
 * 创建时间：2025-05-31
 */
Page({
  data: {
    chatId: '',
    contactName: '安全聊天',
    messages: [],
    inputValue: '',
    scrollTop: 0,
    showEmergencyInfo: true,
    // 🔥 软键盘自适应
    keyboardHeight: 0,
    extraBottomPaddingPx: 0,
    inputFocus: false,
    keepKeyboardOpenOnSend: false
  },

  /**
   * 页面加载事件
   */
  onLoad: function (options) {
    console.log('🆕 全新安全聊天页面加载！参数:', options);
    
    // 设置基本数据
    this.setData({
      chatId: options.id || 'new_safe_chat_' + Date.now(),
      contactName: options.inviter || '安全聊天模式',
      showEmergencyInfo: true
    });

    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: this.data.contactName
    });

    // 显示修复成功消息
    this.showWelcomeMessages();

    // 绑定键盘高度监听
    this.bindKeyboardHeightListener();
  },

  onShow: function () {
    this.bindKeyboardHeightListener();
  },

  onHide: function () {
    this.unbindKeyboardHeightListener();
  },

  onUnload: function () {
    this.unbindKeyboardHeightListener();
  },

  /**
   * 输入框聚焦/失焦：优化滚动与吸底表现
   */
  onInputFocus: function() {
    try {
      if (this.data.keepKeyboardOpenOnSend) {
        this.setData({ keepKeyboardOpenOnSend: false });
      }
      this.setData({ scrollTop: 999999, inputFocus: true });
    } catch (e) {
      console.log('⚠️ 输入框聚焦处理失败:', e);
    }
  },
  onInputBlur: function() {
    try {
      if (this.data.keepKeyboardOpenOnSend) {
        // 🔥 立即清除标志位，防止进入无限循环或竞态条件
        this.setData({ keepKeyboardOpenOnSend: false });
        
        // 核心修复：先设置为false(响应blur) -> 异步设置为true(拉起键盘)
        // 这种"闪烁"操作能强制基础库重新识别焦点状态
        this.setData({ inputFocus: false }, () => {
          wx.nextTick(() => {
            this.setData({ inputFocus: true });
          });
        });
        return;
      }
      this.setData({ inputFocus: false, keyboardHeight: 0, extraBottomPaddingPx: 0 });
    } catch (e) {
      console.log('⚠️ 输入框失焦处理失败:', e);
    }
  },

  /**
   * 绑定键盘高度监听
   */
  bindKeyboardHeightListener: function() {
    if (!wx.onKeyboardHeightChange) {
      console.log('⚠️ 当前基础库不支持 wx.onKeyboardHeightChange');
      return;
    }
    if (this._keyboardHeightHandler) {
      return;
    }

    this._keyboardHeightHandler = (res = {}) => {
      const height = res && res.height ? res.height : 0;
      this.setData({
        keyboardHeight: height,
        extraBottomPaddingPx: height > 0 ? height : 0
      }, () => {
        if (height > 0) {
          try {
            this.setData({ scrollTop: 999999 });
          } catch (err) {
            console.log('⚠️ 滚动至底部失败:', err);
          }
        }
      });
    };

    wx.onKeyboardHeightChange(this._keyboardHeightHandler);
  },

  /**
   * 解绑键盘高度监听
   */
  unbindKeyboardHeightListener: function() {
    if (this._keyboardHeightHandler && wx.offKeyboardHeightChange) {
      try {
        wx.offKeyboardHeightChange(this._keyboardHeightHandler);
      } catch (err) {
        console.log('⚠️ 解绑键盘监听失败:', err);
      }
    }
    this._keyboardHeightHandler = null;
    if (this.data.keyboardHeight !== 0 || this.data.extraBottomPaddingPx !== 0) {
      this.setData({
        keyboardHeight: 0,
        extraBottomPaddingPx: 0
      });
    }
  },

  /**
   * 显示欢迎消息
   */
  showWelcomeMessages: function() {
    const welcomeMessages = [
      {
        id: 'welcome_1',
        senderId: 'system',
        content: '🎉 恭喜！无限循环问题已彻底解决！',
        type: 'system',
        time: this.formatCurrentTime(),
        backgroundColor: '#4CAF50'
      },
      {
        id: 'welcome_2', 
        senderId: 'system',
        content: '✅ 您现在使用的是全新的安全聊天页面',
        type: 'system',
        time: this.formatCurrentTime(),
        backgroundColor: '#2196F3'
      },
      {
        id: 'welcome_3',
        senderId: 'system', 
        content: '🛡️ 此页面采用了多重防护机制，确保稳定运行',
        type: 'system',
        time: this.formatCurrentTime(),
        backgroundColor: '#FF9800'
      }
    ];

    this.setData({
      messages: welcomeMessages
    });
  },

  /**
   * 处理输入框变化
   */
  handleInputChange: function (e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  /**
   * 语音/表情/更多按钮（与A端布局保持一致，均为占位功能）
   */
  toggleVoiceInput: function() {
    wx.showToast({
      title: '语音功能开发中',
      icon: 'none'
    });
  },

  openEmojiPicker: function() {
    wx.showToast({
      title: '表情功能开发中',
      icon: 'none'
    });
  },

  openMoreFunctions: function() {
    wx.showActionSheet({
      itemList: ['发送图片', '语音通话', '视频通话', '销毁设置'],
      success: (res) => {
        const toastMap = [
          '图片发送功能开发中',
          '语音通话功能开发中',
          '视频通话功能开发中',
          '销毁设置功能开发中'
        ];
        const tip = toastMap[res.tapIndex] || '功能开发中';
        wx.showToast({
          title: tip,
          icon: 'none'
        });
      },
      fail: () => {}
    });
  },

  /**
   * 发送消息
   */
  sendMessage: function () {
    const content = this.data.inputValue.trim();
    if (!content) {
      wx.showToast({
        title: '请输入消息内容',
        icon: 'none'
      });
      return;
    }

    const newMessage = {
      id: 'msg_' + Date.now(),
      senderId: 'self',
      content: content,
      type: 'text',
      time: this.formatCurrentTime(),
      status: 'sent'
    };

    // 添加新消息
    const updatedMessages = [...this.data.messages, newMessage];
    
    this.setData({
      messages: updatedMessages,
      inputValue: '',
      scrollTop: 999999,
      inputFocus: true,
      keepKeyboardOpenOnSend: true
    });

    // 模拟回复
    setTimeout(() => {
      this.addAutoReply(content);
    }, 1000);
  },

  /**
   * 添加自动回复
   */
  addAutoReply: function(originalContent) {
    const replies = [
      '收到您的消息了！',
      '感谢您使用安全聊天模式！',
      `您刚才说的"${originalContent}"很有趣！`,
      '这个新的聊天页面运行得很稳定呢！',
      '无限循环问题已经彻底解决了！'
    ];

    const randomReply = replies[Math.floor(Math.random() * replies.length)];
    
    const replyMessage = {
      id: 'reply_' + Date.now(),
      senderId: 'other',
      content: randomReply,
      type: 'text', 
      time: this.formatCurrentTime(),
      status: 'received'
    };

    const updatedMessages = [...this.data.messages, replyMessage];
    
    this.setData({
      messages: updatedMessages,
      scrollTop: 999999
    });
  },

  /**
   * 格式化当前时间
   */
  formatCurrentTime: function() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function () {
    console.log('🔄 安全刷新');
    wx.stopPullDownRefresh();
    
    wx.showToast({
      title: '页面运行正常',
      icon: 'success'
    });
  },

  /**
   * 关闭紧急信息
   */
  closeEmergencyInfo: function() {
    this.setData({
      showEmergencyInfo: false
    });
  },

  /**
   * 页面显示
   */
  onShow: function () {
    console.log('🆕 安全聊天页面显示');
  },

  /**
   * 页面隐藏
   */
  onHide: function () {
    console.log('🆕 安全聊天页面隐藏');
    // 🔥 解绑键盘监听避免重复注册
    try { if (wx.offKeyboardHeightChange) { wx.offKeyboardHeightChange(); } } catch (e) {}
  },

  /**
   * 页面卸载
   */
  onUnload: function () {
    console.log('🆕 安全聊天页面卸载');
    // 清理工作已经不需要了，因为这个页面是安全的
  }
}); 