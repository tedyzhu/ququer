/**
 * 消息组件
 */
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    /**
     * 消息数据
     */
    message: {
      type: Object,
      value: {}
    },
    /**
     * 是否为自己发送的消息
     */
    isSelf: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 阅后即焚倒计时相关
    countdown: 0,
    countdownInterval: null
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 触发点击消息事件
     */
    handleTap: function() {
      this.triggerEvent('tap', {
        message: this.properties.message
      });
    },

    /**
     * 长按消息
     */
    handleLongPress: function() {
      // 仅允许对未销毁的自己发送的消息进行操作
      if (this.properties.isSelf && !this.properties.message.destroyed) {
        wx.showActionSheet({
          itemList: ['撤回消息'],
          success: (res) => {
            if (res.tapIndex === 0) {
              this.triggerEvent('retract', {
                message: this.properties.message
              });
            }
          }
        });
      }
    },

    /**
     * 开始阅后即焚倒计时
     * @param {Number} seconds - 倒计时秒数
     */
    startDestroying: function(seconds) {
      // 清除可能存在的倒计时
      if (this.data.countdownInterval) {
        clearInterval(this.data.countdownInterval);
      }
      
      this.setData({
        countdown: seconds
      });
      
      const countdownInterval = setInterval(() => {
        const remaining = this.data.countdown - 1;
        
        if (remaining <= 0) {
          clearInterval(countdownInterval);
          this.triggerEvent('destroy', {
            message: this.properties.message
          });
        } else {
          this.setData({
            countdown: remaining
          });
        }
      }, 1000);
      
      this.setData({
        countdownInterval: countdownInterval
      });
    }
  },

  /**
   * 组件生命周期 - 在组件实例被从页面节点树移除时执行
   */
  detached: function() {
    // 清除倒计时
    if (this.data.countdownInterval) {
      clearInterval(this.data.countdownInterval);
    }
  }
}) 