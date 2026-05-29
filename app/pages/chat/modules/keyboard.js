/**
 * 软键盘监听子系统
 *
 * 通过 attach(page) 把以下方法挂到 Page 实例上:
 *   - getEffectiveKeyboardHeight(rawHeight) - 计算有效键盘高度,事件值优先,
 *     失败时用 windowHeight 差值兜底
 *   - _registerKeyboardListener() - 注册/重新注册全局 wx.onKeyboardHeightChange 监听
 *     (多页面栈中最后注册者生效,onShow 也需要调用)
 *
 * 设计要点:
 * - attach 模式(与 message-listener 等 14 个模块一致):整段函数体搬迁,this 不动
 * - 仅 chat.js 内部 onLoad / onShow 调用,无 wxml 绑定,可安全 attach
 */

/**
 * @param {Object} page - Page 实例
 */
function attach(page) {
    /**
     * @description 计算有效键盘高度，优先取事件值，失败时用窗口高度差值兜底。
     * @param {number} rawHeight 键盘事件原始高度（px）
     * @returns {number} 最终可用的键盘高度（px）
     */
    page.getEffectiveKeyboardHeight = function(rawHeight) {
      var kbH = rawHeight > 0 ? rawHeight : 0;
      try {
        var baseWinH = (this._layoutInfo && this._layoutInfo.windowHeight) || this.data.windowHeight || 0;
        if (baseWinH > 0 && wx.getWindowInfo) {
          var info = wx.getWindowInfo();
          var currentWinH = (info && info.windowHeight) ? info.windowHeight : 0;
          var inferredKbH = baseWinH - currentWinH;
          if (inferredKbH > kbH) kbH = inferredKbH;
        }
      } catch (e) {}
      if (kbH < 0) kbH = 0;
      return Math.floor(kbH);
    };

    /**
     * @description 注册/重新注册全局键盘高度监听。
     * wx.onKeyboardHeightChange 是全局回调，多页面栈中最后注册者生效。
     * 因此 onShow 也需要调用，确保当前可见页面始终能收到键盘事件。
     */
    page._registerKeyboardListener = function() {
      try {
        if (!wx.onKeyboardHeightChange) return;
        var self = this;
        if (!this._keyboardHeightChangeHandler) {
          /**
           * @description 固定引用供 offKeyboardHeightChange 解绑，避免 onShow 重复注册导致回调堆积卡死模拟器。
           */
          this._keyboardHeightChangeHandler = function(res) {
            var rawKbH = (res && res.height) ? res.height : 0;
            var kbH = self.getEffectiveKeyboardHeight(rawKbH);
            var side = self.data.isSender ? 'A端' : 'B端';
            console.log('🔥 [onKeyboardHeightChange][' + side + '] 键盘高度变化:', kbH, 'containerHeight:', self.data.containerHeight, 'windowHeight:', (self._layoutInfo && self._layoutInfo.windowHeight));
            if (!self.data.isPageActive) kbH = 0;

            if (kbH > 0) {
              if (self._kbResetTimer) { clearTimeout(self._kbResetTimer); self._kbResetTimer = null; }
              self._lastKnownKeyboardHeight = kbH;
              var winH = (self._layoutInfo && self._layoutInfo.windowHeight) || self.data.windowHeight || 700;
              var patch = {
                keyboardHeight: kbH,
                keyboardVisible: true,
                containerHeight: winH - kbH,
                scrollIntoView: '',
                scrollTop: self.data.scrollTop === 99999 ? 99998 : 99999
              };
              wx.pageScrollTo({ scrollTop: 0, duration: 0 });
              self.setData(patch, function() {
                self.scheduleScrollToBottom();
                wx.pageScrollTo({ scrollTop: 0, duration: 0 });
              });
            } else {
              if (self.data.inputFocus || self._kbTransitionGuard) {
                return;
              }
              self.setData({ keyboardHeight: 0, keyboardVisible: false });
              if (self._kbResetTimer) clearTimeout(self._kbResetTimer);
              self._kbResetTimer = setTimeout(function() {
                self._kbResetTimer = null;
                if (self.data.keyboardHeight === 0 && !self.data.inputFocus && !self._kbTransitionGuard) {
                  var winH2 = (self._layoutInfo && self._layoutInfo.windowHeight) || self.data.windowHeight || 700;
                  if (self.data.containerHeight !== winH2) {
                    self.setData({ containerHeight: winH2 });
                  }
                }
              }, 300);
            }
          };
        }
        if (typeof wx.offKeyboardHeightChange === 'function' && this._keyboardHeightChangeHandler) {
          try {
            wx.offKeyboardHeightChange(this._keyboardHeightChangeHandler);
          } catch (offErr) {
            try { wx.offKeyboardHeightChange(); } catch (offErr2) { /* 部分基础库仅支持无参 off */ }
          }
        }
        wx.onKeyboardHeightChange(this._keyboardHeightChangeHandler);
      } catch (e) {
        console.log('⚠️ 键盘高度监听不可用:', e);
      }
    };
}

module.exports = { attach };
