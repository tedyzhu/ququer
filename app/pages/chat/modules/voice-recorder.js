/**
 * 语音录制 / 播放子系统
 *
 * 通过 init(page) 一次性完成两件事:
 *   1. 把以下方法挂到 page 实例上(行为与原 chat.js 一致):
 *      - toggleVoiceInput
 *      - onVoiceTouchStart / onVoiceTouchMove / onVoiceTouchEnd / onVoiceTouchCancel
 *      - _startRecording
 *      - _sendVoiceMessage
 *      - playVoice
 *   2. 初始化 RecorderManager / InnerAudioContext,绑定生命周期回调
 *      (单页仅绑定一次,通过 page._recorderHooksBound 防止重复绑定 — 与原实现一致)
 *
 * 设计:
 * - 每个挂载到 page 的函数体内 this 不变,运行时 this===page
 * - 与 test-methods.js 同样的 attach 模式
 *
 * 注意:
 * - 当前 chat.wxml 中尚未绑定 onVoiceTouchStart 等录音输入事件,
 *   这些方法属于"完整保留以便未来启用"的状态
 * - playVoice 经由 onMessageTap 间接调用,依赖 page._innerAudioCtx
 */

/**
 * 把挂载方法 + 录音器初始化合并执行
 *
 * @param {Object} page - Page 实例
 */
function init(page) {
  attachMethods(page);

  // 单页仅绑定一次,与原实现一致
  if (page._recorderHooksBound) {
    return;
  }
  page._recorderHooksBound = true;

  page._recorderManager = wx.getRecorderManager();
  page._innerAudioCtx = wx.createInnerAudioContext();
  page._recordingTimer = null;
  page._voiceTouchStartY = 0;

  page._recorderManager.onStart(function() {
    console.log('🎙️ 录音开始');
    if (page._recordingTimer) {
      clearInterval(page._recordingTimer);
      page._recordingTimer = null;
    }
    page.setData({ isRecording: true, recordingDuration: 0, voiceCancelMove: false });
    page._recordingTimer = setInterval(function() {
      var d = page.data.recordingDuration + 1;
      page.setData({ recordingDuration: d });
      if (d >= 60) {
        page._recorderManager.stop();
      }
    }, 1000);
  });

  page._recorderManager.onStop(function(res) {
    console.log('🎙️ 录音结束', res);
    if (page._recordingTimer) { clearInterval(page._recordingTimer); page._recordingTimer = null; }
    var wasCancel = page.data.voiceCancelMove;
    page.setData({ isRecording: false, recordingDuration: 0, voiceCancelMove: false });
    if (wasCancel) {
      console.log('🎙️ 录音已取消');
      return;
    }
    if (res.duration < 1000) {
      wx.showToast({ title: '说话时间太短', icon: 'none' });
      return;
    }
    page._sendVoiceMessage(res.tempFilePath, Math.ceil(res.duration / 1000));
  });

  page._recorderManager.onError(function(err) {
    console.error('🎙️ 录音失败:', err);
    if (page._recordingTimer) { clearInterval(page._recordingTimer); page._recordingTimer = null; }
    page.setData({ isRecording: false, recordingDuration: 0, voiceCancelMove: false });
    wx.showToast({ title: '录音失败', icon: 'none' });
  });

  page._innerAudioCtx.onEnded(function() {
    page.setData({ playingVoiceId: '' });
  });
  page._innerAudioCtx.onError(function(err) {
    console.error('🔊 语音播放失败:', err);
    page.setData({ playingVoiceId: '' });
    wx.showToast({ title: '播放失败', icon: 'none' });
  });
}

/**
 * 把所有外部触发的方法挂到 page 上(不含 _initRecorderManager 本身)
 *
 * @param {Object} page - Page 实例
 */
function attachMethods(page) {
  /**
   * @description 切换语音/键盘输入模式
   */
  page.toggleVoiceInput = function() {
    var toVoice = !this.data.isVoiceMode;
    if (toVoice) {
      this.setData({ isVoiceMode: true, inputFocus: false });
    } else {
      this.setData({ isVoiceMode: false, inputFocus: true });
    }
  };

  /**
   * @description 语音按钮 touchstart — 检查权限后开始录音
   */
  page.onVoiceTouchStart = function(e) {
    this._voiceTouchStartY = e.touches[0].clientY;
    var self = this;
    wx.getSetting({
      success: function(res) {
        if (res.authSetting['scope.record'] === false) {
          wx.openSetting({
            success: function(settingRes) {
              if (settingRes.authSetting['scope.record']) {
                self._startRecording();
              }
            }
          });
          return;
        }
        if (res.authSetting['scope.record']) {
          self._startRecording();
        } else {
          wx.authorize({
            scope: 'scope.record',
            success: function() { self._startRecording(); },
            fail: function() {
              wx.showToast({ title: '需要录音权限才能发送语音', icon: 'none' });
            }
          });
        }
      }
    });
  };

  /** @description 实际调用录音管理器开始录音 */
  page._startRecording = function() {
    if (!this._recorderManager) return;
    this._recorderManager.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3'
    });
  };

  /**
   * @description 上滑取消检测;仅在状态变化时 setData,避免 touchmove 高频触发导致主线程卡死
   */
  page.onVoiceTouchMove = function(e) {
    if (!this.data.isRecording) return;
    var moveY = e.touches[0].clientY;
    var diff = this._voiceTouchStartY - moveY;
    var cancel = diff > 50;
    if (this.data.voiceCancelMove === cancel) {
      return;
    }
    this.setData({ voiceCancelMove: cancel });
  };

  /**
   * @description 语音按钮 touchend — 停止或取消录音
   */
  page.onVoiceTouchEnd = function() {
    if (!this.data.isRecording) return;
    if (this.data.voiceCancelMove) {
      this._recorderManager.stop();
    } else {
      this._recorderManager.stop();
    }
  };

  /**
   * @description 语音按钮 touchcancel — 取消录音
   */
  page.onVoiceTouchCancel = function() {
    if (!this.data.isRecording) return;
    this.setData({ voiceCancelMove: true });
    this._recorderManager.stop();
  };

  /**
   * @description 上传语音文件到云存储并发送语音消息
   * @param {string} tempFilePath - 录音临时文件路径
   * @param {number} duration - 语音时长(秒)
   */
  page._sendVoiceMessage = function(tempFilePath, duration) {
    var self = this;
    var app = getApp();
    var currentUser = this.data.currentUser || app.globalData.userInfo;

    if (!currentUser || !currentUser.openId) {
      wx.showToast({ title: '用户信息异常', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发送中...', mask: true });

    var timestamp = Date.now();
    var cloudPath = 'voice/' + timestamp + '_' + Math.floor(Math.random() * 1000) + '.mp3';

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      success: function(uploadRes) {
        var fileID = uploadRes.fileID;
        console.log('🎙️ 语音上传成功:', fileID);

        var nowTs = Date.now();
        var userAvatar = currentUser.avatarUrl || '/assets/images/default-avatar.png';
        var newMessage = {
          id: nowTs.toString(),
          senderId: currentUser.openId,
          isSelf: true,
          content: fileID,
          type: 'voice',
          duration: duration,
          time: self.formatTime(new Date()),
          timeDisplay: self.formatTime(new Date()),
          timestamp: nowTs,
          sendTime: nowTs,
          showTime: true,
          status: 'sending',
          destroyed: false,
          destroying: false,
          remainTime: 0,
          avatar: userAvatar,
          isSystem: false,
          _localTemp: true
        };

        var messages = (self._localMessageCache || self.data.messages).concat(newMessage);
        self._localMessageCache = messages;
        self.setData({
          messages: messages,
          scrollTop: self.data.scrollTop === 99999 ? 99998 : 99999
        }, function() {
          wx.nextTick(function() { self.scrollToBottom(); });
        });

        wx.cloud.callFunction({
          name: 'sendMessage',
          data: {
            chatId: self.data.contactId,
            content: fileID,
            type: 'voice',
            duration: duration,
            destroyTimeout: self.data.destroyTimeout,
            senderId: currentUser.openId,
            currentUserInfo: {
              nickName: currentUser.nickName,
              avatarUrl: currentUser.avatarUrl || '/assets/images/default-avatar.png'
            }
          },
          success: function(res) {
            wx.hideLoading();
            console.log('🎙️ 语音消息发送成功', res);
            if (res.result && res.result.success) {
              var updatedMessages = self.data.messages.map(function(msg) {
                if (msg.id === newMessage.id) {
                  return Object.assign({}, msg, {
                    status: 'sent',
                    id: res.result.messageId || newMessage.id
                  });
                }
                return msg;
              });
              self._localMessageCache = updatedMessages;
              self.setData({ messages: updatedMessages });
            }
          },
          fail: function(err) {
            wx.hideLoading();
            console.error('🎙️ 语音消息发送失败:', err);
            wx.showToast({ title: '发送失败', icon: 'none' });
          }
        });
      },
      fail: function(err) {
        wx.hideLoading();
        console.error('🎙️ 语音上传失败:', err);
        wx.showToast({ title: '语音发送失败', icon: 'none' });
      }
    });
  };

  /**
   * @description 播放/停止语音消息
   */
  page.playVoice = function(e) {
    var msgId = e.currentTarget.dataset.msgid;
    if (!msgId) return;

    if (this.data.playingVoiceId === msgId) {
      this._innerAudioCtx.stop();
      this.setData({ playingVoiceId: '' });
      return;
    }

    var msg = this.data.messages.find(function(m) { return m.id === msgId; });
    if (!msg || msg.type !== 'voice') return;

    this._innerAudioCtx.stop();
    this._innerAudioCtx.src = msg.content;
    this._innerAudioCtx.play();
    this.setData({ playingVoiceId: msgId });
  };
}

module.exports = { init };
