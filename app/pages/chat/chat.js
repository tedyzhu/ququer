/**
 * 聊天页面逻辑 - 已集成资源管理器和错误处理器
 */

// 引入系统性修复工具
const ResourceManager = require('../../../utils/resource-manager.js');
const ErrorHandler = require('../../../utils/error-handler.js');

// 聊天页通用工具与常量(详见 ./modules/chat-helpers.js)
const ChatHelpers = require('./modules/chat-helpers.js');
const {
  SYSTEM_MESSAGE_DEFAULTS,
  DEBUG_FLAGS,
  DEFAULT_DESTROY_TIMEOUT,
  ENABLE_HOMOGENEOUS_UI_MODE,
  DEFAULT_KEYBOARD_HEIGHT,
  PLACEHOLDER_JOIN_MESSAGE_REGEX,
  isPlaceholderJoinMessage,
  isSystemLikeMessage,
  ensureSystemFlags
} = ChatHelpers;
const MessageDebugHook = require('./modules/message-debug-hook.js');
const DestroyedStore = require('./modules/destroyed-store.js');
const IdentityUtils = require('./modules/identity-utils.js');
const TestMethods = require('./modules/test-methods.js');
const VoiceRecorder = require('./modules/voice-recorder.js');
const ShareUtils = require('./modules/share-utils.js');
const SystemMessage = require('./modules/system-message.js');
const TitleController = require('./modules/title-controller.js');
const BurnAfterRead = require('./modules/burn-after-read.js');
const ParticipantListener = require('./modules/participant-listener.js');
const IdentityResolver = require('./modules/identity-resolver.js');

Page({
  disableScroll: true,


  initializeDestroyedMessageStore: function(chatId, userOpenId) {
    DestroyedStore.initialize(this, chatId, userOpenId);
  },

  ensureDestroyedMessageStore: function() {
    DestroyedStore.ensure(this);
  },
  /**
   * 判断昵称是否为占位符,详见 modules/chat-helpers.js#isPlaceholderNickname
   * @param {string} name
   * @returns {boolean}
   */
  isPlaceholderNickname: function(name) {
    return ChatHelpers.isPlaceholderNickname(name);
  },

  /**
   * 判断当前是否处于B端接收方环境
   * @returns {boolean} 是否应按B端逻辑处理
   */
  isReceiverEnvironment: function() {
    return IdentityUtils.isReceiverEnvironment(this);
  },

  /**
   * 判断消息是否由当前用户发送
   * @param {string} senderId - 消息发送者ID（可能为openId或其他映射ID）
   * @param {string} currentUserOpenId - 当前用户openId（可选，若未提供将自动获取）
   * @returns {boolean} 是否为当前用户消息
   */
  isMessageFromCurrentUser: function(senderId, currentUserOpenId) {
    return IdentityUtils.isMessageFromCurrentUser(this, senderId, currentUserOpenId);
  },
  
  /**
   * 判断B端加入系统消息是否曾经显示过（当前chatId级别持久化）
   * @param {string} chatId - 聊天ID
   * @returns {boolean} 是否曾经显示过B端加入消息
   */
  hasBEndJoinEver: function(chatId) {
    return IdentityUtils.hasBEndJoinEver(this, chatId);
  },
  
  /**
   * 标记B端加入系统消息为“已显示过”（当前chatId级别持久化）
   * @param {string} chatId - 聊天ID
   * @returns {void}
   */
  markBEndJoinEver: function(chatId) {
    IdentityUtils.markBEndJoinEver(this, chatId);
  },


  /**
   * 根据页面参数与本地缓存决定是否开启消息Diff日志。
   * URL参数示例：debugMsgDiff=1
   * @param {Object} options - onLoad参数
   * @returns {boolean} 是否开启消息Diff日志
   */
  shouldEnableMessageDiffDebug: function(options) {
    return MessageDebugHook.shouldEnable(options);
  },


  /**
   * 安装setData消息Diff调试钩子。
   * 仅在 setData({ messages: [...] }) 时打印差异日志。
   * @returns {void}
   */
  installMessageSetDataDebugHook: function() {
    MessageDebugHook.install(this);
  },

  /**
   * 卸载setData消息Diff调试钩子。
   * @returns {void}
   */
  uninstallMessageSetDataDebugHook: function() {
    MessageDebugHook.uninstall(this);
  },
  /**
   * 页面初始数据
   */
  data: {
    contactId: '',
    contactName: '',
    messages: [],
    inputValue: '',
    scrollTop: 0,
    isLoading: false, // 🔧 修改：默认不显示loading，保持界面简洁
    scrollIntoView: '',
    chatTitle: '', // 聊天标题（动态设置）
    dynamicTitle: '', // 动态标题
    // 阅后即焚倒计时配置（秒）
    destroyTimeout: DEFAULT_DESTROY_TIMEOUT,
    showDestroyTimer: false,
    destroyTimerText: '',
    // 是否正在创建聊天
    isCreatingChat: false,
    // 是否正在发送消息
    isSending: false,
    // 创建聊天重试次数
    createChatRetryCount: 0,
    // 最大重试次数
    maxRetryCount: 5,
    // 聊天创建状态
    chatCreationStatus: '',
    // 是否为新创建的聊天
    isNewChat: false,
    // 当前用户信息
    currentUser: null,
    // 聊天参与者列表
    participants: [],
    // 🔥 调试模式
    isDebugMode: false,
    
    // 🔥 阅后即焚增强状态管理
    isPageActive: true,        // 页面是否活跃（用户在聊天界面）
    onlineUsers: [],           // 在线用户列表
    autoDestroyEnabled: true,  // 是否启用自动销毁
    lastActivityTime: null,    // 最后活动时间
    backgroundTime: null,      // 后台运行开始时间
    messageDestroyQueue: [],   // 消息销毁队列
    isBurnAfterReadingCleaning: false, // 🔥 是否正在进行阅后即焚清理
    lastCleanupTime: null,     // 🔥 最后清理时间
    cleanupCooldownPeriod: 60000, // 🔥 清理冷却期（60秒）
    // 🔥 软键盘自适应 & 布局尺寸（由 JS 精确计算）
    windowHeight: 0,
    scrollViewHeight: 300,
    keyboardHeight: 0,
    keyboardVisible: false,
    containerHeight: 700,
    inputFocus: false,
    keepKeyboardOpenOnSend: false,

    // 语音输入
    isVoiceMode: false,
    isRecording: false,
    recordingDuration: 0,
    voiceCancelMove: false,
    playingVoiceId: ''
  },

  /**
   * @description 计算有效键盘高度，优先取事件值，失败时用窗口高度差值兜底。
   * @param {number} rawHeight 键盘事件原始高度（px）
   * @returns {number} 最终可用的键盘高度（px）
   */
  getEffectiveKeyboardHeight: function(rawHeight) {
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
  },

  /**
   * @description 在渲染完成后吸底，避免高频 setData 场景丢滚动。
   * @param {number} [delayMs=0] 延迟毫秒
   * @returns {void}
   */
  scheduleScrollToBottom: function(delayMs) {
    var self = this;
    var delay = typeof delayMs === 'number' ? delayMs : 0;
    if (self._scrollBottomTimer) {
      clearTimeout(self._scrollBottomTimer);
      self._scrollBottomTimer = null;
    }
    self._scrollBottomTimer = setTimeout(function() {
      self._scrollBottomTimer = null;
      wx.nextTick(function() { self.scrollToBottom(); });
    }, delay);
  },

  /**
   * @description A/B端是否启用同构UI模式（布局/键盘/滚动完全一致）。
   * @returns {boolean} 是否启用同构UI模式
   */
  isHomogeneousUiMode: function() {
    return ENABLE_HOMOGENEOUS_UI_MODE;
  },
  
  /**
   * @description 注册/重新注册全局键盘高度监听。
   * wx.onKeyboardHeightChange 是全局回调，多页面栈中最后注册者生效。
   * 因此 onShow 也需要调用，确保当前可见页面始终能收到键盘事件。
   */
  _registerKeyboardListener: function() {
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
  },

  /**
   * 输入框聚焦/失焦：优化滚动与吸底表现，确保标题栏不受影响
   */
  onInputFocus: function(e) {
    try {
      if (this._kbResetTimer) { clearTimeout(this._kbResetTimer); this._kbResetTimer = null; }
      var rawKbH = (e && e.detail && e.detail.height) ? e.detail.height : 0;
      var kbH = this.getEffectiveKeyboardHeight(rawKbH);
      if (kbH <= 0 && this._lastKnownKeyboardHeight > 0) kbH = this._lastKnownKeyboardHeight;
      if (kbH <= 0 && this.data.keyboardHeight > 0) kbH = this.data.keyboardHeight;
      if (kbH <= 0) kbH = DEFAULT_KEYBOARD_HEIGHT;
      var side = this.data.isSender ? 'A端' : 'B端';
      console.log('🔥 [' + side + '] 键盘弹出 - 输入框获得焦点, 键盘高度:', kbH, 'windowHeight:', (this._layoutInfo && this._layoutInfo.windowHeight), 'containerHeight:', this.data.containerHeight);
      // 🔧 仅保留一次“保持展开”行为，恢复正常 blur 逻辑
      if (this.data.keepKeyboardOpenOnSend) {
        this.setData({ keepKeyboardOpenOnSend: false });
      }

      var winH = (this._layoutInfo && this._layoutInfo.windowHeight) || this.data.windowHeight || 700;
      var self = this;
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      this.setData({
        inputFocus: true,
        keyboardVisible: true,
        keyboardHeight: kbH,
        containerHeight: winH - kbH,
        scrollIntoView: '',
        scrollTop: this.data.scrollTop === 99999 ? 99998 : 99999
      }, function() {
        self.scheduleScrollToBottom();
        wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      });

    } catch (err) {
      console.error('输入框聚焦处理失败:', err);
    }
  },

  /** @description 阻止 chat-container 上的触摸滚动穿透到页面层 */
  preventPageScroll: function() {},

  onInputBlur: function() {
    try {
      console.log('🔥 键盘收起 - 输入框失去焦点');
      
    if (this.data.keepKeyboardOpenOnSend) {
      if (this._kbResetTimer) { clearTimeout(this._kbResetTimer); this._kbResetTimer = null; }
      if (this._kbFocusProbeTimer) { clearTimeout(this._kbFocusProbeTimer); this._kbFocusProbeTimer = null; }
      var self = this;
      self._kbTransitionGuard = true;
      this.setData({
        inputFocus: false,
        keepKeyboardOpenOnSend: false
      }, () => {
        wx.nextTick(() => {
          self._kbTransitionGuard = false;
          self.setData({ inputFocus: true, keyboardVisible: true });
        });
      });
      return;
    }
      
      if (this._kbResetTimer) { clearTimeout(this._kbResetTimer); this._kbResetTimer = null; }
      if (this._kbFocusProbeTimer) { clearTimeout(this._kbFocusProbeTimer); this._kbFocusProbeTimer = null; }
      this.setData({
        inputFocus: false,
        keyboardVisible: false
      });
      var self = this;
      this._kbResetTimer = setTimeout(function() {
        self._kbResetTimer = null;
        if (!self.data.inputFocus && !self._kbTransitionGuard) {
          var winH = (self._layoutInfo && self._layoutInfo.windowHeight) || self.data.windowHeight || 700;
          self.setData({
            keyboardHeight: 0,
            containerHeight: winH
          });
        }
      }, 300);
    } catch (e) {
      console.error('输入框失焦处理失败:', e);
    }
  },


  /**
   * 生命周期函数--监听页面加载
   * @param {Object} options - 页面参数
   */
  onLoad: async function (options) {
    // 挂载系统消息子系统(详见 modules/system-message.js)
    SystemMessage.attach(this);
    // 挂载标题刷新子系统(详见 modules/title-controller.js)
    TitleController.attach(this);
    // 挂载阅后即焚子系统(详见 modules/burn-after-read.js)
    BurnAfterRead.attach(this);
    // 挂载参与者监听子系统(详见 modules/participant-listener.js)
    ParticipantListener.attach(this);

    // 🔥 【HOTFIX-v1.3.65】重置防重复标记（保留ever已显示状态，不清空处理标志）
    this.bEndSystemMessageAdded = false;
    this.aEndJoinMessageAdded = false; // 🔥 A端加入消息防重复标记
    this.participantWatcherReady = false; // 🔥 发送方监听初始化状态
    this.lastParticipantIds = []; // 🔥 记录最近一次同步的参与者ID列表
    this._messageDiffDebugEnabled = this.shouldEnableMessageDiffDebug(options);
    if (this._messageDiffDebugEnabled) {
      this.installMessageSetDataDebugHook();
      console.log('🧪 [消息Diff调试] 当前会话已开启，可用参数关闭: debugMsgDiff=0');
    }
    console.log('🔥 [页面初始化-v1.3.65] 重置系统消息防重复标记');
    
    /**
     * @description 一次性计算并缓存布局尺寸，后续键盘事件仅做减法。
     *   windowHeight 取自 wx.getWindowInfo()，不受键盘弹出影响。
     */
    try {
      var wInfo = wx.getWindowInfo();
      var statusBarH = wInfo.statusBarHeight || 0;
      var navContentH = 44;
      var navTotalH = navContentH + statusBarH;
      var safeBottom = wInfo.safeArea
        ? (wInfo.screenHeight - wInfo.safeArea.bottom)
        : 0;
      var inputApproxH = 56 + safeBottom;
      var winH = wInfo.windowHeight;
      this._layoutInfo = {
        windowHeight: winH,
        navTotalHeight: navTotalH,
        inputHeight: inputApproxH,
        safeAreaBottom: safeBottom
      };
      this.setData({
        windowHeight: winH,
        containerHeight: winH,
        scrollViewHeight: winH - navTotalH - inputApproxH
      });
    } catch (e) {
      var fallbackH = 700;
      this._layoutInfo = { windowHeight: fallbackH, navTotalHeight: 88, inputHeight: 56, safeAreaBottom: 0 };
      this.setData({ windowHeight: fallbackH, containerHeight: fallbackH, scrollViewHeight: fallbackH - 88 - 56 });
    }

    // 🔥 软键盘高度监听（提取为方法以便 onShow 中重新注册）
    this._registerKeyboardListener();

    // 语音录音管理器初始化(详见 modules/voice-recorder.js)
    VoiceRecorder.init(this);

    console.log('[聊天页面] 页面加载，携带参数:', options);
    
    // 🛠️ 【系统性修复】初始化资源管理器
    this.resourceManager = new ResourceManager(this);
    console.log('🛠️ [系统修复] 资源管理器已初始化');
    
    const app = getApp();
    
    // 检查云环境是否已初始化
    if (!app.globalData.cloudInitialized) {
      console.log('云环境未初始化，开始初始化...');
      app.initCloud();
    }
    
    // 🔥 【temp_user 修复】等待登录就绪后再读取 userInfo。
    // 场景:B 端从分享链接(onShareAppMessage 的 path)直接进入 chat 页时,
    // onLaunch 触发的 performCloudLogin 可能还没返回,globalData.userInfo 仍为 null。
    // 此时若直接读取会走 fallback 到 'temp_user',导致后续身份判定全部错乱。
    // ensureLogin 兼容:已登录立即返回 / 登录中复用 Promise / 未启动主动登录。
    if (typeof app.ensureLogin === 'function' && (!app.globalData.hasLogin || !app.globalData.openId)) {
      console.log('🔐 [登录就绪] 检测到 globalData 未就绪,等待 ensureLogin 完成');
      try {
        await app.ensureLogin();
        console.log('🔐 [登录就绪] ✅ 登录就绪,openId:', app.globalData.openId);
      } catch (loginErr) {
        console.warn('🔐 [登录就绪] ensureLogin 失败,走兜底:', loginErr);
      }
    }
    
    // 获取用户信息
    const userInfo = app.globalData.userInfo || {};
    
    // 解析 URL 参数 + 清理过期/残留 stored invite(详见 modules/identity-resolver.js)
    const loadCtx = IdentityResolver.prepareLoadContext(this, options);
    let chatId = loadCtx.chatId;
    let inviter = loadCtx.inviter;
    let userName = loadCtx.userName;
    let isNewChat = loadCtx.isNewChat;
    let forceReceiverMode = loadCtx.forceReceiverMode;
    let inviteInfo = loadCtx.inviteInfo;
    
    // 阶段 2a:URL 参数预检测(详见 modules/identity-resolver.js#detectInvitePresence)
    const { hasExplicitInviterParam, hasJoinAction, hasFromInviteFlag, preliminaryInviteDetected } =
      IdentityResolver.detectInvitePresence(options);
    
    // 🔥 【关键修复】有URL邀请参数时，先检查是否为创建者，再决定身份
    let skipCreatorCheck = false;
    let isFromInvite; // 🔥 声明变量
    
    if (inviteInfo && inviteInfo.inviteId && !forceReceiverMode) {
      // 阶段 2b:收集创建者证据(详见 modules/identity-resolver.js#collectCreatorEvidence)
      const evidence = IdentityResolver.collectCreatorEvidence(this, options, inviteInfo, userInfo, preliminaryInviteDetected);
      const {
        currentUserNickName, currentUserOpenId,
        chatIdContainsUserId,
        inviteTime, currentTime, timeSinceInvite, isVeryRecentInvite,
        inviterNickname, userNickname, isSameUser,
        hasCreateAction, isInShareMode,
        isRecentInvite, isModeratelyRecent,
        smartNicknameMatch,
        hasHistoricalEvidence, isRepeatVisit, hasOwnershipMarkers,
        chatVisitCount, isFrequentVisitor,
      } = evidence;
      
      // 🔥 【CRITICAL-FIX-v3】优先检查URL邀请参数，防止频繁访问误判
      
      // 🔥 【第一步】检查是否有明确的邀请参数
      const hasExplicitInviteParams = preliminaryInviteDetected && options.inviter;
      
      // 【修复】解码邀请者参数，处理双重编码情况
      let decodedInviter = '';
      if (hasExplicitInviteParams && options.inviter) {
        try {
          decodedInviter = decodeURIComponent(options.inviter);
          // 尝试二次解码（处理双重编码情况）
          if (decodedInviter.indexOf('%') !== -1) {
            decodedInviter = decodeURIComponent(decodedInviter);
          }
        } catch (e) {
          console.log('🔥 [优先检测] 解码邀请者参数失败:', e);
        }
      }
      
      // 🔥 【ULTIMATE-FIX-v1.3.48】终极修复：URL邀请参数优先检测策略
      // 检查邀请者是否为占位符名称
      const isPlaceholderInviter = ['朋友', '邀请者', '用户', '好友'].includes(decodedInviter);
      
      // 🔥 【智能B端判断】结合多个因素判断，避免误判A端为B端
      // 🔥 【HOTFIX-B端识别】移除频繁访问者限制，优先信任URL邀请参数
      const isDefinitelyReceiver = hasExplicitInviteParams && 
        decodedInviter && 
        userNickname && 
        decodedInviter !== userNickname &&
        !isPlaceholderInviter; // 🔥 只要有明确的非占位符邀请者，就识别为B端
        // 🔥 【关键修复】移除频繁访问者检查，因为B端用户也可能多次访问同一个聊天
      
      console.log('🔥 [URL优先检测] URL明确包含邀请参数:', hasExplicitInviteParams);
      console.log('🔥 [URL优先检测] 邀请者参数:', options.inviter);
      console.log('🔥 [URL优先检测] 解码后邀请者:', decodedInviter || 'N/A');
      console.log('🔥 [URL优先检测] 用户昵称:', userNickname);
      console.log('🔥 [URL优先检测] 是否占位符邀请者:', isPlaceholderInviter);
      console.log('🔥 [URL优先检测] 是否频繁访问者:', isFrequentVisitor);
      console.log('🔥 [URL优先检测] 智能B端判断结果:', isDefinitelyReceiver);
      
      // 🔥 【HOTFIX-v1.3.56】增强B端识别：通过participants列表验证真实身份
      let isChatCreator;
      
      // 🔥 【关键修复】即使邀请者是占位符，也要通过云端参与者列表验证身份
      if (hasExplicitInviteParams && isPlaceholderInviter && isFrequentVisitor) {
        console.log('🔥 [占位符邀请] 检测到占位符邀请者+频繁访问，需要云端验证真实身份');
        
        try {
          // 🔥 通过云端获取参与者列表，验证用户是否为创建者
          const conversationResult = await wx.cloud.database().collection('conversations')
            .doc(chatId)
            .get();
          
          if (conversationResult && conversationResult.data) {
            const participants = conversationResult.data.participants || [];
            const currentUserOpenId = userInfo?.openId || app.globalData?.openId;
            
            console.log('🔥 [云端验证] 参与者数量:', participants.length);
            console.log('🔥 [云端验证] 当前用户OpenId:', currentUserOpenId);
            
            // 查找当前用户在参与者列表中的信息
            const currentUserParticipant = participants.find(p => 
              (typeof p === 'object' && (p.id === currentUserOpenId || p.openId === currentUserOpenId)) || 
              p === currentUserOpenId
            );
            
            if (currentUserParticipant) {
              const isUserCreator = typeof currentUserParticipant === 'object' ? 
                currentUserParticipant.isCreator === true : false;
              const hasMultipleParticipants = participants.length >= 2;
              
              console.log('🔥 [云端验证] 用户是否为创建者:', isUserCreator);
              console.log('🔥 [云端验证] 是否多人聊天:', hasMultipleParticipants);
              
              // 🔥 【关键判断】如果用户在参与者列表中但不是创建者，且已经是多人聊天，说明是B端
              if (!isUserCreator && hasMultipleParticipants) {
                console.log('🔥 [云端验证] ✅ 确认为B端接收者，强制设置B端身份');
                isChatCreator = false;
                // 强制跳转到B端处理逻辑
                isFromInvite = true;
                skipCreatorCheck = true;
                
                // 🔥 获取真实的邀请者昵称（A端昵称）
                const otherParticipant = participants.find(p => {
                  const participantId = typeof p === 'object' ? (p.id || p.openId) : p;
                  return participantId !== currentUserOpenId;
                });
                
                if (otherParticipant && typeof otherParticipant === 'object' && otherParticipant.nickName) {
                  inviter = otherParticipant.nickName;
                  console.log('🔥 [云端验证] 获取到A端真实昵称:', inviter);
                }
                
                // 直接跳转到B端处理
                console.log('🔥 [云端验证] 跳过后续创建者检测，直接处理B端逻辑');
              } else if (isUserCreator) {
                console.log('🔥 [云端验证] ✅ 确认为A端创建者');
                isChatCreator = true;
              } else {
                console.log('🔥 [云端验证] ⚠️ 单人聊天，继续常规检测');
                isChatCreator = null; // 继续后续检测
              }
            } else {
              console.log('🔥 [云端验证] ⚠️ 用户不在参与者列表中，继续常规检测');
              isChatCreator = null; // 继续后续检测
            }
          } else {
            console.log('🔥 [云端验证] ⚠️ 未获取到会话数据，继续常规检测');
            isChatCreator = null; // 继续后续检测
          }
        } catch (err) {
          console.log('🔥 [云端验证] ⚠️ 云端验证异常:', err);
          isChatCreator = null; // 继续后续检测
        }
      }
      
      // 🔥 只有在云端验证没有明确结果时，才进行常规判断
      if (isChatCreator === null || isChatCreator === undefined) {
        if (isDefinitelyReceiver) {
        // 🔥 【强制B端】URL邀请参数明确且邀请者与用户不同，强制判断为B端
        isChatCreator = false;
        console.log('🔥 [强制B端] URL邀请参数明确且邀请者与用户不同，强制确定为B端接收方');
        
        // 🔥 【立即清理】清除任何已错误添加的A端系统消息
        this.clearIncorrectSystemMessages();
        
        // 🔥 【强制B端模式】设置正确的B端身份和标题
        isFromInvite = true;
        inviter = decodedInviter;
        skipCreatorCheck = true;
        
        console.log('🔥 [强制B端] 设置B端身份: isFromInvite=true, inviter=', inviter);
      } else {
        // 🔥 【创建者检测】仅在没有明确邀请参数时才考虑频繁访问等因素
        // 详见 modules/identity-resolver.js#computeCreatorByEvidence(纯计算,
        // 已合并主决策 + 频繁访问者备用提升)
        isChatCreator = IdentityResolver.computeCreatorByEvidence(evidence);
        
        console.log('🔥 [创建者检测] 无明确邀请参数，进行完整创建者检测:', isChatCreator);
      }
      } // 🔥 结束云端验证条件判断
      
      // 🔥 【简化逻辑】主要检测已完成，记录关键检测点即可
      
      console.log('🔥 [创建者检查] 聊天ID包含用户ID:', chatIdContainsUserId);
      console.log('🔥 [创建者检查] 邀请时间很新:', isVeryRecentInvite, '时间差:', timeSinceInvite);
      console.log('🔥 [创建者检查] 邀请者与用户是同一人:', isSameUser);
      console.log('🔥 [创建者检查增强] 操作历史:', hasCreateAction);
      console.log('🔥 [创建者检查增强] 历史证据:', hasHistoricalEvidence);
      console.log('🔥 [创建者检查增强] 重复访问:', isRepeatVisit);
      console.log('🔥 [创建者检查增强] 所有权标记:', hasOwnershipMarkers);
      console.log('🔥 [创建者检查增强] 频繁访问者:', isFrequentVisitor, '访问次数:', chatVisitCount);
      console.log('🔥 [创建者检查增强] 分享模式:', isInShareMode);
      console.log('🔥 [创建者检查增强] 智能昵称匹配:', smartNicknameMatch);
      console.log('🔥 [创建者检查增强] 综合判断结果:', isChatCreator);
      
      // 🔥 【备用检测】如果主要检测未识别为创建者，进行最后验证（仅在无任何邀请标记时才允许）
      // 🔥 【修复】增加URL邀请参数检测，防止B端用户被误判
      if (!isChatCreator && 
          !preliminaryInviteDetected && 
          !hasExplicitInviteParams && // 🔥 新增：有URL邀请参数时不进行备用检测
          isFrequentVisitor && 
          currentUserNickName && 
          currentUserNickName !== '朋友') {
        console.log('🔥 [备用检测] 频繁访问者且有真实昵称，可能是创建者重新登录');
        console.log('🔥 [备用检测] 访问次数:', chatVisitCount, '用户昵称:', currentUserNickName);
        console.log('🔥 [备用检测] 无URL邀请参数，考虑提升为创建者');
        isChatCreator = true;
      }
      
      // 🔥 【统一处理】基于检测结果进行身份设置
      if (isChatCreator) {
          // 用户是聊天创建者，应该是a端，清除邀请信息
          console.log('🔥 [身份判断修复] 检测到用户是聊天创建者，应为a端（发送方）');
          
          // 清除错误的邀请信息
          const app = getApp();
          app.clearInviteInfo();
          
          // 强制设为发送方模式
          isFromInvite = false;
          inviter = null;
          skipCreatorCheck = true; // 🔥 确认为创建者，跳过后续b端检测
          
          console.log('🔥 [身份判断修复] 已清除邀请信息，用户确认为a端');
          
          // 🔥 【HOTFIX-v1.3.44e】立即添加创建者系统消息，不等待后续流程
          this.needsCreatorMessage = true;
          console.log('🔥 [身份修复] 检测到需要添加创建者系统消息');
          this.addCreatorSystemMessage();
          this.needsCreatorMessage = false;
        } else {
        // 🔥 【最终确认】用户不是创建者，确认为B端被邀请者
        console.log('🔥 [身份判断修复-v5] 确认用户是b端（接收方）');
        console.log('🔥 [身份判断修复-v5] 邀请时间差:', timeSinceInvite);
        console.log('🔥 [身份判断修复-v5] 邀请者:', inviterNickname);
        console.log('🔥 [身份判断修复-v5] 用户:', userNickname);
        
        // 真正的接收方，使用邀请信息
        isFromInvite = true;
        chatId = inviteInfo.inviteId;
        inviter = inviteInfo.inviter || inviter;
        skipCreatorCheck = true; // 🔥 已确认为B端，跳过后续创建者检测
        console.log('🔧 [邀请信息] 使用app级别保存的邀请信息:', inviteInfo);
        
        // 🔥 【HOTFIX-v1.3.52】移除重复的B端系统消息调用
        // B端系统消息统一在其他流程中处理，避免重复添加
        console.log('🔥 [B端修复] B端身份确认，系统消息将在统一流程中处理');
        
        // 🔥 【规则调整】B端在"加入成功之前"不显示任何系统消息，仅在加入成功后统一添加
        // 仅保存邀请者昵称用于后续成功回调（非必须）
        this.pendingBJoinInviterName = inviterNickname;
        console.log('🔥 [B端修复] 加入成功前不添加系统消息，保存邀请者以备后用:', inviterNickname);
      }
    }
    
    // 🔥 【HOTFIX-v1.3.51】修复身份确认逻辑，区分A端创建者和B端接收者
    // skipCreatorCheck=true有两种情况：1）确认为A端创建者 2）确认为B端接收者
    // 需要通过isFromInvite状态来区分
    const isConfirmedCreator = skipCreatorCheck && !isFromInvite && (this.needsCreatorMessage === false);
    
    // 🔥 【HOTFIX-v1.3.53】增强B端身份验证，支持智能检测场景
    // 如果URL包含邀请参数且用户不是聊天ID的创建者，强制识别为B端
    const urlHasInviter = options.inviter && options.inviter !== 'undefined';
    const userNotInChatId = chatId && !chatId.includes((userInfo?.openId || '').substring(0, 8));
    
    // 🔥 【HOTFIX-v1.3.53】检查是否通过智能检测进入（fromInvite参数为true）
    const isFromSmartDetection = options.fromInvite === 'true' || options.fromInvite === true;
    
    if ((urlHasInviter || isFromSmartDetection) && userNotInChatId && !isConfirmedCreator) {
      console.log('🔥 [HOTFIX-v1.3.53] 额外B端检测：(URL有邀请者 或 智能检测进入) + 用户不在聊天ID中 → 强制B端');
      isFromInvite = true;
      if (!inviter && options.inviter) {
        inviter = decodeURIComponent(options.inviter);
        console.log('🔥 [HOTFIX-v1.3.53] 设置邀请者:', inviter);
      }
    }
    
    // 🔥 【HOTFIX-v1.3.53】特殊处理智能检测场景：如果明确标记为智能检测进入且非新聊天，强制设为B端
    if (isFromSmartDetection && !isNewChat && !isConfirmedCreator) {
      console.log('🔥 [HOTFIX-v1.3.53] 智能检测场景：强制识别为B端接收者');
      isFromInvite = true;
      if (!inviter && options.inviter) {
        inviter = decodeURIComponent(options.inviter);
        console.log('🔥 [HOTFIX-v1.3.53] 智能检测设置邀请者:', inviter);
      }
    }
    
    // 🔧 【HOTFIX-v1.3.45】处理URL邀请参数情况
    // 🔥 【关键修复】如果之前未设置isFromInvite，根据URL参数和创建者状态决定
    if (typeof isFromInvite === 'undefined') {
      // 如果URL有邀请参数但用户不是创建者，确认为b端
      if (preliminaryInviteDetected && !skipCreatorCheck) {
        console.log('🔥 [身份确认] URL有邀请参数且非创建者，确认为b端');
        isFromInvite = true;
        inviter = decodeURIComponent(decodeURIComponent(options.inviter || inviteInfo?.inviter || '邀请者'));
      } else {
        // 其他情况的默认判断
        isFromInvite = !!inviter || options.fromInvite === 'true' || options.fromInvite === true || options.fromInvite === '1';
        console.log('🔥 [默认设置] isFromInvite设置为默认值:', isFromInvite);
      }
    }
    
    // 🔥 【关键修复】如果已确认为创建者，强制重置isFromInvite
    if (isConfirmedCreator) {
      console.log('🔥 [身份保护] 已确认为a端创建者，强制重置isFromInvite为false');
      isFromInvite = false;
      inviter = null;
    }
    
    console.log('🔥 [b端检测] 邀请参数分析:');
    console.log('🔥 [b端检测] options.inviter:', options.inviter);
    console.log('🔥 [b端检测] options.fromInvite:', options.fromInvite);
    console.log('🔥 [b端检测] options.action:', options.action);
    console.log('🔥 [b端检测] 当前inviter:', inviter);
    console.log('🔥 [b端检测] 初步isFromInvite判断:', isFromInvite);
    
    // 🔥 【URGENT-FIX】在已确认为a端创建者后，跳过所有b端检测逻辑
    if (!isConfirmedCreator && !skipCreatorCheck) {
      // 🔥 【HOTFIX-v1.3.45】增强b端检测：检查action=join参数
      if (!isFromInvite && options.action === 'join') {
        console.log('🔥 [b端检测] 检测到action=join，强制识别为b端');
        isFromInvite = true;
        if (!inviter && options.inviter) {
          inviter = options.inviter;
          console.log('🔥 [b端检测] 从URL参数获取邀请者:', inviter);
        }
      }
      
      // 🔥 【HOTFIX-v1.3.45】增强b端检测：聊天ID模式检测
      if (!isFromInvite && !isNewChat && chatId) {
        const userOpenId = userInfo?.openId || app.globalData?.openId;
        if (userOpenId && !chatId.includes(userOpenId.substring(0, 8))) {
          console.log('🔥 [b端检测] 聊天ID不包含用户ID，可能是b端:', { chatId, userOpenId });
          isFromInvite = true;
          if (!inviter) {
            inviter = options.inviter || '邀请者';
            console.log('🔥 [b端检测] 设置默认邀请者名称:', inviter);
          }
        }
      }
    } else {
      console.log('🔥 [身份保护] 已确认为a端创建者，跳过所有b端检测逻辑');
    }
    
    console.log('🔥 [b端检测] 最终isFromInvite判断:', isFromInvite);
    
    // 🔥 【HOTFIX-v1.3.44】移除错误的昵称匹配判断逻辑
    // 原逻辑错误地认为"昵称不匹配=创建者"，这导致所有b端用户被误判为a端
    // 现在不再使用这种错误的判断方式
    const isCreatorByNickname = false; // 禁用错误的昵称判断逻辑
    
    // 🔥 【HOTFIX-v1.3.44】已移除基于昵称的错误判断条件
    
    // 🔥 【HOTFIX-v1.3.26】统一身份判断逻辑
    let hasEncodedUserName = false;
    let isJoiningExistingChat = false;
    
    // 保存用户身份到本地存储
    const roleKey = `${chatId}_role`;
    const userRole = {
      isFromInvite: isFromInvite,
      isSender: !isFromInvite
    };
    wx.setStorageSync(roleKey, userRole);
    console.log('🔥 [身份判断] 保存用户身份:', userRole);
    
    // 🔥 如果是新聊天，绝对不应该是邀请模式（发送方创建新聊天）
    if (isNewChat) {
      console.log('🔧 [邀请检测] 检测到新聊天创建，用户是发送方，不是邀请模式');
      isFromInvite = false; // 强制重置，确保发送方身份正确
      
      // 更新本地存储的身份
      userRole.isFromInvite = false;
      userRole.isSender = true;
      wx.setStorageSync(roleKey, userRole);
      console.log('🔥 [身份判断] 更新发送方身份:', userRole);
    } else {
      // 只有在非新聊天时才检测邀请链接特征
      hasEncodedUserName = userName && userName.includes('%');
      if (hasEncodedUserName && !isFromInvite) {
        console.log('🔧 [邀请检测] 检测到编码用户名，可能来自邀请链接:', userName);
        // 尝试从用户名中提取邀请者信息
        inviter = userName;
      }
      
      // 🔧 【HOTFIX-v1.3.50】修复：超强检测，但不覆盖已确认的A端身份
      const userOpenId = userInfo?.openId || app.globalData?.openId;
      isJoiningExistingChat = !isNewChat && chatId && userOpenId && !chatId.includes(userOpenId);
      if (isJoiningExistingChat && !isFromInvite && !skipCreatorCheck) {
        console.log('🔧 [邀请检测] 检测到加入现有聊天，但用户未被确认为创建者，设为邀请模式');
        isFromInvite = true;
        if (!inviter) {
          inviter = '朋友'; // 使用默认邀请者名称
        }
      } else if (isJoiningExistingChat && skipCreatorCheck) {
        console.log('🔧 [邀请检测] 检测到加入现有聊天，但用户已确认为A端创建者，跳过邀请模式设置');
      }
    }
    
    console.log('🔧 [邀请检测] 最终判断结果:', { 
      isNewChat,
      isFromInvite, 
      hasEncodedUserName,
      inviter, 
      userName, 
      isJoiningExistingChat,
      options 
    });
    
    // 🔥 【URGENT-FIX】严格的最终身份判断逻辑 - 防止a端误判
    let finalIsFromInvite = false;
    
    // 🔥 【关键修复】多重检查确保判断准确性
    if (isNewChat) {
      // 新聊天：绝对是发送方
      finalIsFromInvite = false;
      console.log('🔥 [最终判断] 新聊天模式，确认为发送方');
    } else {
      // 🔥 【URGENT-FIX】优先检查是否已确认为a端创建者
      if (skipCreatorCheck && (this.needsCreatorMessage === false)) {
        // 已经确认为创建者，绝对是发送方
        finalIsFromInvite = false;
        console.log('🔥 [最终判断] 已确认为a端创建者，绝对是发送方');
      } else {
        // 🔥 【严格验证】检查是否有强制身份翻转的情况
        const hasBeenCorrectedToCreator = this.needsCreatorMessage || (inviteInfo && !inviter);
        
        if (hasBeenCorrectedToCreator) {
          // 已经被纠正为创建者，强制设为发送方
          finalIsFromInvite = false;
          console.log('🔥 [最终判断] 检测到身份已被纠正为创建者，强制设为发送方');
        } else {
          // 🔥 【邀请证据检查】检查多种邀请证据
          const hasUrlInviter = !!options.inviter;                    // URL中有邀请者参数
          const hasStoredInviter = !!inviter;                         // 有存储的邀请者信息
          const hasFromInviteFlag = options.fromInvite === 'true' || options.fromInvite === true || options.fromInvite === '1';    // URL明确标记
          const hasJoinAction = options.action === 'join';            // URL标记为加入操作
          const wasPreviouslyIdentifiedAsReceiver = isFromInvite;     // 之前已识别为接收方
          const hasStrongReceiverEvidence = hasUrlInviter || hasFromInviteFlag || hasJoinAction || wasPreviouslyIdentifiedAsReceiver;
          
        // 🔥 【A端身份最终防护】防止A端创建者被误判
        // 检查是否是聊天创建者的其他证据
        const chatId = options.id || this.data.contactId;
        const currentUserOpenId = userInfo?.openId;
        let isActualCreator = false;
        
        if (currentUserOpenId && chatId) {
          // 🔥 【HOTFIX-v1.3.89】修复创建者ID检测逻辑
          // 证据1: 检查聊天记录中的创建者标记（最可靠）
          const creatorKey = `creator_${chatId}`;
          const storedCreator = wx.getStorageSync(creatorKey);
          const isStoredCreator = storedCreator === currentUserOpenId;
          
          // 证据2: 检查访问历史(频繁访问可能是创建者)
          const visitKey = `chat_visit_${chatId}_${currentUserOpenId}`;
          const visitHistory = wx.getStorageSync(visitKey) || 0;
          const isFrequentVisitor = visitHistory >= 2;
          
          // 证据3: action参数为create
          const hasCreateAction = options.action === 'create';
          
          // 证据4: 检查本地存储的邀请信息(如果存储说是"回访创建者",则确认)
          const storedInviteInfo = wx.getStorageSync('inviteInfo');
          const isReturningCreator = storedInviteInfo && 
                                     storedInviteInfo.chatId === chatId && 
                                     !storedInviteInfo.fromInvite;
          
          const hasWeakCreatorEvidence = isStoredCreator || isFrequentVisitor || isReturningCreator;
          isActualCreator = hasWeakCreatorEvidence || hasCreateAction;

          /** 当前会话存在明确接收方证据时，不允许本地弱证据反向覆盖成创建者。 */
          if (hasStrongReceiverEvidence && !hasCreateAction && hasWeakCreatorEvidence) {
            console.warn('🔥 [A端最终防护-v1.3.96] 检测到接收方强证据，忽略本地创建者弱证据');
            isActualCreator = false;

            /** 清理历史误写的创建者缓存，避免后续持续误判。 */
            if (isStoredCreator && (hasFromInviteFlag || hasJoinAction || hasUrlInviter)) {
              wx.removeStorageSync(creatorKey);
              console.log('🔥 [A端最终防护-v1.3.96] 已清理旧创建者缓存:', creatorKey);
            }
          }
          
          console.log('🔥 [A端最终防护-v1.3.89] 创建者证据检查:');
          console.log('🔥 [A端最终防护-v1.3.89] - 存储的创建者:', isStoredCreator, storedCreator);
          console.log('🔥 [A端最终防护-v1.3.89] - 频繁访问:', isFrequentVisitor, '次数:', visitHistory);
          console.log('🔥 [A端最终防护-v1.3.89] - create action:', hasCreateAction);
          console.log('🔥 [A端最终防护-v1.3.89] - 回访创建者:', isReturningCreator);
          console.log('🔥 [A端最终防护-v1.3.89] - 最终是否创建者:', isActualCreator);
        }
        
        // 🔥 【关键修复】即使是"朋友"也是有效的邀请证据，但要排除真正的创建者
        const hasValidInviteEvidence = (
          hasUrlInviter ||                                          // URL中有邀请者参数
          hasStoredInviter ||                                       // 有存储的邀请者
          hasFromInviteFlag ||                                      // URL明确标记
          hasJoinAction ||                                          // 标记为加入操作
          wasPreviouslyIdentifiedAsReceiver                         // 之前已确认为接收方
        ) && !isActualCreator;                                      // 🔥 排除真正的创建者
        
        finalIsFromInvite = hasValidInviteEvidence && !hasBeenCorrectedToCreator;
        
        // 🔥 【A端身份强制纠正】如果检测到是创建者，强制设为A端
        if (isActualCreator && finalIsFromInvite) {
          console.log('🔥 [A端最终防护] 检测到用户是真正创建者，强制纠正身份');
          finalIsFromInvite = false;
          
          // 清除错误的邀请信息
          wx.removeStorageSync('inviteInfo');
          if (typeof app !== 'undefined' && app.clearInviteInfo) {
            app.clearInviteInfo();
          }
        }
          
          console.log('🔥 [最终判断] 邀请证据详情:');
          console.log('🔥 [最终判断] - URL邀请者:', hasUrlInviter, options.inviter);
          console.log('🔥 [最终判断] - 存储邀请者:', hasStoredInviter, inviter);
          console.log('🔥 [最终判断] - 之前身份:', wasPreviouslyIdentifiedAsReceiver);
          console.log('🔥 [最终判断] - 综合证据:', hasValidInviteEvidence);
          console.log('🔥 [最终判断] - 最终结果:', finalIsFromInvite);
        }
      }
    }
    
    // 设置聊天标题
    let chatTitle = '秘信聊天';
    if (isNewChat) {
      chatTitle = `${userName || userInfo?.nickName || '用户'}的聊天`;
    } else if (inviter) {
      chatTitle = `与${decodeURIComponent(decodeURIComponent(inviter))}的聊天`; // 🔧 双重解码修复
    }
    
    // 🔥 【ULTIMATE-FIX-v1.3.48】修复A端B端标题显示逻辑
    let initialTitle = userInfo?.nickName || '我';
    
    console.log('🔥 [标题修复] 开始设置初始标题');
    console.log('🔥 [标题修复] finalIsFromInvite:', finalIsFromInvite);
    console.log('🔥 [标题修复] isNewChat:', isNewChat);
    console.log('🔥 [标题修复] 用户昵称:', userInfo?.nickName);
    console.log('🔥 [标题修复] 邀请者:', inviter);
    
    if (finalIsFromInvite && inviter) {
      // 🔥 【B端标题策略】B端接收方显示"我和[A端昵称]（2）"格式
      try {
        const decodedInviterName = decodeURIComponent(decodeURIComponent(inviter));
        if (decodedInviterName && decodedInviterName !== '朋友' && decodedInviterName !== '邀请者') {
          initialTitle = `我和${decodedInviterName}（2）`;
          console.log('🔥 [B端标题] B端初始标题设置:', initialTitle);
          
          // 立即设置标题，不等待后续逻辑
          wx.setNavigationBarTitle({
            title: initialTitle
          });
        } else {
          // 🔥 【HOTFIX-v1.3.55】如果是占位符邀请者，立即获取真实昵称
          console.log('🔥 [B端标题] 检测到占位符邀请者，将获取真实昵称');
          initialTitle = '我和新用户（2）'; // 临时标题
          wx.setNavigationBarTitle({
            title: initialTitle
          });
          
          // 异步获取真实昵称并更新标题
          setTimeout(() => {
            this.fetchRealInviterNameAndUpdateTitle();
          }, 500);
        }
        console.log('🔥 [B端标题] ✅ B端导航栏标题立即设置成功:', initialTitle);
        
        this.setData({
          dynamicTitle: initialTitle
        });
      } catch (e) {
        console.log('🔥 [B端标题] 邀请者昵称解码失败:', e);
        initialTitle = userInfo?.nickName || '我';
      }
    } else {
      // 🔥 【A端标题策略】A端创建者显示自己的昵称
      const userNickname = userInfo?.nickName || actualCurrentUser?.nickName || '我';
      initialTitle = userNickname;
      console.log('🔥 [A端标题] A端标题设置为用户昵称:', initialTitle);
      
      // 立即设置A端标题
      wx.setNavigationBarTitle({
        title: initialTitle
      });
      console.log('🔥 [A端标题] ✅ A端导航栏标题设置成功:', initialTitle);
      
      this.setData({
        dynamicTitle: initialTitle
      });
      
      // 🔥 【A端标记】标记A端身份，但允许动态标题更新
      this.isAEndUser = true;
      
      // 🔥 【重要】A端不使用锁定机制，允许动态更新
      this.isAEndTitleProtected = false;
      this.receiverTitleLocked = false;  // 允许正常的标题更新
      
      console.log('🔥 [统一标题] 采用统一的标题显示策略');
    }
    
    wx.setNavigationBarTitle({
      title: initialTitle
    });
    
    // 🔥 【临时修复】强制区分a和b的身份，即使是同一用户
    let actualCurrentUser = {
      ...userInfo,
      openId: userInfo?.openId || app.globalData?.openId || 'temp_user',
      nickName: userInfo?.nickName || '我',
      avatarUrl: userInfo?.avatarUrl || '/assets/images/default-avatar.png'
    };
    // 🔥 【HOTFIX-v1.3.21】移除强制接收方模式的用户身份修改逻辑
    console.log('🔥 [身份设置] 使用正常的用户身份信息，不进行强制修改');
    
    // 🔥 【HOTFIX-v1.3.44】保存身份判断结果到页面实例，避免data被覆盖
    this.finalIsFromInvite = finalIsFromInvite;
    this.actualCurrentUser = actualCurrentUser;
    this.initializeDestroyedMessageStore(chatId, actualCurrentUser?.openId);
    
    // 🔥 【增强检测】记录聊天访问历史，用于未来的创建者检测
    this.recordChatVisit(chatId, actualCurrentUser?.openId);
    
    this.setData({
      contactId: chatId,
      contactName: chatTitle,
      dynamicTitle: initialTitle, // 🔥 立即设置动态标题（接收方已正确）
      isCreatingChat: finalIsFromInvite,
      chatCreationStatus: finalIsFromInvite ? '正在建立连接...' : '',
      isNewChat: isNewChat,
      isFromInvite: finalIsFromInvite, // 🔥 保存身份判断结果
      currentUser: actualCurrentUser, // 🔥 使用可能修改过的用户信息
      participants: [{
        ...actualCurrentUser,
        id: actualCurrentUser.openId,
        isSelf: true,
        isCreator: !finalIsFromInvite
      }], // 🔥 初始化参与者列表，包含当前用户完整信息
      // 🔥 在开发环境开启调试模式
      isDebugMode: wx.getAppBaseInfo().platform === 'devtools',
      // 🔥 【HOTFIX-v1.3.44c】禁用过时的身份修复弹窗，身份判断已修复
      shouldShowIdentityFix: false
    });

    // 延迟交给统一逻辑：当参与者到 2 人时自动切换为“我和对方（2）”
    setTimeout(() => {
      this.updateDynamicTitle();
      
      // 🔥 【紧急修复】如果检测到身份错误，提供手动修复选项
      if (this.data.shouldShowIdentityFix) {
        console.log('🚨 [紧急修复] 检测到可能的身份错误，显示修复提示');
        this.showIdentityFixDialog();
      }
    }, 100);
    
    // 检查用户登录状态
    if (!app.globalData.hasLogin && !finalIsFromInvite) {
      console.error('[邀请流程] 用户未登录，无法进入聊天界面');
      
      // 保存聊天参数以便登录后继续
      app.saveInviteInfo(chatId, inviter || '朋友'); // 统一使用inviter参数
      
      // 使用全局统一的URL跳转方法
      const loginUrls = [
        '../login/login', 
        '/app/pages/login/login', 
        '/pages/login/login'
      ];
      
      app.tryNavigateToUrls(loginUrls, 0, null, () => {
        wx.showModal({
          title: '错误',
          content: '无法跳转到登录页，请重启小程序',
          showCancel: false
        });
      });
      return;
    } else if (!app.globalData.hasLogin && finalIsFromInvite) {
      console.log('🔗 [邀请流程] 接收方未登录，但允许继续邀请流程');
    }
    
    if (finalIsFromInvite) {
      // 🔥 如果是从邀请链接进入，立即加入聊天
      console.log('🔗 [被邀请者] 从邀请链接进入，开始加入聊天');
      this.joinChatByInvite(chatId, inviter || userName);
    } else {
      // 🔥 【HOTFIX-v1.3.89】A端身份确认后立即存储创建者信息
      const creatorKey = `creator_${chatId}`;
      const existingCreator = wx.getStorageSync(creatorKey);
      if (!existingCreator) {
        wx.setStorageSync(creatorKey, actualCurrentUser.openId);
        console.log('🔥 [创建者存储-v1.3.89] A端首次访问，存储创建者信息:', actualCurrentUser.openId);
      } else {
        console.log('🔥 [创建者存储-v1.3.89] 创建者信息已存在:', existingCreator);
      }
      
      // 🔥 【HOTFIX-v1.3.21】发送方强化阅后即焚保护
      console.log('🔥 [发送方保护] 发送方身份确认，启动阅后即焚保护');
      
      // 🔥 【HOTFIX-v1.3.44d】如果身份判断修复检测到需要添加创建者消息，立即添加
      if (this.needsCreatorMessage) {
        console.log('🔥 [身份修复] 检测到需要添加创建者系统消息');
        this.addCreatorSystemMessage();
        this.needsCreatorMessage = false; // 清除标志
      }
      
      // 🔥 发送方：更新用户信息到数据库
      this.updateUserInfoInDatabase();
      
      // 🔥 【HOTFIX-v1.3.21】发送方严格禁止获取历史消息
      console.log('🔥 [发送方保护] 发送方严格禁止获取任何历史消息');
      
      // 如果是新创建的聊天，先创建conversation记录
      if (isNewChat) {
        // 🔥 【HOTFIX-v1.3.89】存储创建者信息
        const creatorKey = `creator_${chatId}`;
        wx.setStorageSync(creatorKey, actualCurrentUser.openId);
        console.log('🔥 [创建者存储-v1.3.89] 已存储创建者信息:', actualCurrentUser.openId);
        
        this.createConversationRecord(chatId).then(() => {
          // 🔥 【HOTFIX-v1.3.3】发送方创建聊天时不获取历史消息，确保阅后即焚
          console.log('🔥 [发送方创建] 跳过获取历史消息，保持阅后即焚环境纯净');
          
          // 🔥 【HOTFIX-v1.3.4】发送方创建成功后立即清除加载状态
          this.setData({
            isLoading: false,
            isCreatingChat: false,
            chatCreationStatus: ''
          });
          console.log('🔥 [发送方创建] ✅ 已清除加载状态，界面就绪');
          
          // 🔥 发送方创建时：不要立即调用fetchChatParticipantsWithRealNames
          // 因为这会触发标题更新逻辑，导致单人变双人
          console.log('🔥 [发送方创建] 跳过立即获取参与者，等待对方加入');
          
          // 🔥 【HOTFIX-v1.3.42】发送方创建聊天时的系统消息修复
          // a端应该立即显示创建聊天的系统提示
          console.log('🔥 [发送方创建] 立即添加a端创建聊天系统消息');
          this.addCreatorSystemMessage();
          
          // 🔥 发送方：立即启动参与者监听，等待接收方加入
          this.startParticipantListener(chatId);
        }).catch(err => {
          console.error('🔥 创建会话记录失败:', err);
          
          // 🔥 【修复】即使创建失败也要清除加载状态
          this.setData({
            isLoading: false,
            isCreatingChat: false,
            chatCreationStatus: ''
          });
          console.log('🔥 [发送方创建] ⚠️ 创建失败但已清除加载状态');
          
          // 🔥 【修复】即使创建失败也不获取历史消息，保持阅后即焚原则
          console.log('🔥 [发送方创建] 创建失败，但仍跳过获取历史消息');
          
          // 🔥 失败时也要启动监听，但不要立即获取参与者
          this.startParticipantListener(chatId);
        });
      } else {
        // 🔥 【修复】非新聊天时也要检查是否为发送方，避免获取历史消息
        const participants = this.data.participants || [];
        if (participants.length === 1) {
          console.log('🔥 [发送方检测] 单人参与者，疑似发送方，跳过获取历史消息');
          
          // 🔥 【HOTFIX-v1.3.4】发送方检测时也要清除加载状态
          this.setData({
            isLoading: false,
            isCreatingChat: false,
            chatCreationStatus: ''
          });
          console.log('🔥 [发送方检测] ✅ 已清除加载状态，界面就绪');
          
          // 🔥 【关键修复】A端正常进入时也要添加系统消息
          if (!finalIsFromInvite) {
            console.log('🔥 [A端系统消息] A端正常进入，添加创建者系统消息');
            this.addCreatorSystemMessage();
          }
          
          // 🔥 发送方不获取历史消息，只启动监听等待对方加入
        this.startParticipantListener(chatId);
        } else {
          // 🔥 【HOTFIX-v1.3.20】发送方严格阅后即焚保护 - 即使是已存在的聊天也不获取历史消息
          console.log('🔥 [发送方保护] 检测到非新聊天，但仍保持阅后即焚原则');
          
          // 🔥 发送方永远不获取历史消息，只启动监听等待对方加入
          this.setData({
            isLoading: false,
            isCreatingChat: false,
            chatCreationStatus: ''
          });
          console.log('🔥 [发送方保护] ✅ 已清除加载状态，跳过获取历史消息');
          
          // 🔥 【关键修复】A端正常进入时也要添加系统消息
          if (!finalIsFromInvite) {
            console.log('🔥 [A端系统消息] A端正常进入（多参与者），添加创建者系统消息');
            this.addCreatorSystemMessage();
          }
          
          // 🔥 只启动参与者监听，不获取历史消息和参与者信息
          this.startParticipantListener(chatId);
          console.log('🔥 [发送方保护] 仅启动参与者监听，保持环境纯净');
        }
      }
    }
    
    // 标记为已处理邀请，在5秒后清理邀请信息
    if (inviteInfo) {
      setTimeout(() => {
        app.clearInviteInfo();
      }, 5000);
    }
    
    // 🧪 【开发调试】在页面加载时添加测试方法（受DEBUG_FLAGS控制）
    if (DEBUG_FLAGS.ENABLE_TEST_APIS) {
      this.addTestMethods();
      console.log('🧪 [调试] 测试方法已在onLoad中添加完成');
    }
    
    // 阶段 5:onLoad 后处理 hooks
    // 详见 modules/identity-resolver.js#runPostLoadHooks
    // (B 端系统消息安全检查 / 标志位重置 / 清除 loading / 阅后即焚检查)
    IdentityResolver.runPostLoadHooks(this);
  },

  /**
   * 用户点击右上角分享(详见 modules/share-utils.js#buildSharePayload)
   * @returns {{title: string, path: string, imageUrl: string}}
   */
  onShareAppMessage: function() {
    return ShareUtils.buildSharePayload(this);
  },

  /**
   * 被邀请者加入聊天
   */
  joinChatByInvite: function(chatId, inviter) {
    console.log('🔗 [被邀请者] 开始加入聊天, chatId:', chatId, 'inviter:', inviter);
    
    const app = getApp();
    let userInfo = this.data.currentUser || app.globalData.userInfo;
    
    // 如果没有用户信息，使用默认信息
    if (!userInfo || !userInfo.openId) {
      const storedUserInfo = wx.getStorageSync('userInfo');
      const storedOpenId = wx.getStorageSync('openId');
      
          userInfo = {
        openId: storedOpenId || app.globalData.openId || 'local_' + Date.now(),
        nickName: storedUserInfo?.nickName || app.globalData.userInfo?.nickName || '用户',
        avatarUrl: storedUserInfo?.avatarUrl || app.globalData.userInfo?.avatarUrl || '/assets/images/default-avatar.png'
      };
      
      // 更新页面数据
      this.setData({
        currentUser: userInfo
      });
    }
    
    console.log('🔗 [被邀请者] 最终用户信息:', userInfo);
    
    // 🔥 先更新基本信息，但标题遵循规则：未满2人时显示自己的昵称
    const inviterName = decodeURIComponent(decodeURIComponent(inviter)) || '好友'; // 🔧 双重解码修复
    const selfNickname = (userInfo && userInfo.nickName) || getApp().globalData.userInfo?.nickName || '我';
    this.setData({
      contactName: `与${inviterName}的聊天`,
      dynamicTitle: selfNickname
    });
    
    // 🔧 【系统提示优化】不再显示"正在加入聊天..."，直接等待成功后显示
    // this.addSystemMessage('正在加入聊天...');
    
    // 调用云函数加入聊天
    wx.cloud.callFunction({
      name: 'joinByInvite',
      data: {
        chatId: chatId,
        // 🔧 传递邀请者昵称给云函数
        inviterNickName: inviterName,
        joiner: {
          openId: userInfo.openId || app.globalData.openId,
          nickName: userInfo.nickName || '用户',
          avatarUrl: userInfo.avatarUrl
        }
      },
      success: (res) => {
        console.log('🔗 [被邀请者] 加入聊天成功:', res.result);
        
        // ⚡ 【热修复】立即强制清除连接状态，不管任何条件
        this.setData({
          isCreatingChat: false,
          chatCreationStatus: '',
          isLoading: false
        });
        console.log('🚨 [热修复] 连接状态已在success回调开始时立即清除');
        
        if (res.result && res.result.success) {
          
          // 🔥 【CRITICAL-FIX-v4】B端加入成功后，立即设置正确的标题和身份
          console.log('🔥 [B端标题修复-v4] 开始B端身份确认和标题设置');
          console.log('🔥 [B端标题修复-v4] 邀请者名称:', inviterName);
          console.log('🔥 [B端标题修复-v4] 当前isFromInvite状态:', this.data.isFromInvite);
          
          // 🔥 【关键修复】确保邀请者名称正确解码
          let decodedInviterName = inviterName;
          try {
            if (inviterName && inviterName.includes('%')) {
              decodedInviterName = decodeURIComponent(decodeURIComponent(inviterName));
              console.log('🔥 [B端标题修复-v4] 双重解码邀请者名称:', decodedInviterName);
            }
          } catch (e) {
            console.log('🔥 [B端标题修复-v4] 解码失败，使用原始名称:', inviterName);
            decodedInviterName = inviterName;
          }
          
          // 🔥 【关键修复】确保邀请者名称不为空
          if (!decodedInviterName || decodedInviterName === '邀请者' || decodedInviterName === 'undefined') {
            decodedInviterName = '朋友'; // 使用通用名称
            console.log('🔥 [B端标题修复-v4] 使用备用邀请者名称:', decodedInviterName);
          }
          
          // 🔥 【修正】加入成功后再切换为双人标题；此处仅记录身份，标题在参与者到位后由统一逻辑更新
          const immediateTitle = this.data.dynamicTitle; // 保持当前（自己昵称）
          
          // 🔥 仅更新身份标记，不强制覆盖标题
          this.setData({
            isFromInvite: true, // 确保B端身份
            isSender: false,    // 明确标记为接收方
            // 🔥 标记B端已加入，防止重复处理
            hasJoinedAsReceiver: true,
            joinedTimestamp: Date.now()
          });
          
          console.log('🔥 [B端标题修复-v1.3.71] ✅ 身份设置完成，开始立即刷新标题');
          
          // 🔥 【HOTFIX-v1.3.71】简化B端标题刷新机制，立即刷新+单次保险
          console.log('🔥 [B端立即刷新-v1.3.71] 立即获取参与者信息并更新B端标题');
          this.fetchChatParticipantsWithRealNames();
          
          // 🔥 【HOTFIX-v1.3.71】单次保险刷新，确保B端标题及时正确
          setTimeout(() => {
            console.log('🔥 [B端立即刷新-保险-v1.3.71] 单次保险刷新，确保最终正确');
            this.fetchChatParticipantsWithRealNames();
          }, 800);
          
          // 🔥 【B端立即标题】额外的立即标题设置，确保B端标题即使在参与者信息未加载前也正确显示
          if (decodedInviterName && decodedInviterName !== '朋友' && decodedInviterName !== '邀请者') {
            const immediateTitle = `我和${decodedInviterName}（2）`;
            console.log('🔥 [B端立即标题] 设置立即标题:', immediateTitle);
            wx.setNavigationBarTitle({
              title: immediateTitle
            });
            this.setData({
              dynamicTitle: immediateTitle
            });
          }
          
          // 🔥 【HOTFIX-v1.3.71】简化B端系统消息处理 - 统一由fetchChatParticipantsWithRealNames处理
          // 移除复杂的多次重试逻辑，避免重复调用和延迟
          console.log('🔥 [HOTFIX-v1.3.71] B端标题和系统消息统一由fetchChatParticipantsWithRealNames处理');
          
          // 🔥 【策略】只在有真实昵称时立即设置标题，系统消息完全交给fetchChatParticipantsWithRealNames
          if (decodedInviterName && !['朋友', '邀请者', '用户', '好友', '新用户'].includes(decodedInviterName)) {
            console.log('🔥 [HOTFIX-v1.3.71-立即] ✅ 检测到真实昵称，立即设置标题');
            const immediateTitle = `我和${decodedInviterName}（2）`;
            wx.setNavigationBarTitle({ title: immediateTitle });
            this.setData({
              dynamicTitle: immediateTitle,
              contactName: immediateTitle,
              chatTitle: immediateTitle
            });
          }
          
          // 🔥 【移除】原有的多次重试逻辑已移除，统一由上方的fetchChatParticipantsWithRealNames处理

                // 🔥 【HOTFIX-v1.3.56】修复B端系统消息错误 - 强化身份检查逻辑
      // 【关键修复】仅A端（创建者）才添加系统消息，避免B端误添加
      try {
        const isCreator = !this.data.isFromInvite;
        
        // 🔥 【核心修复】额外检查：如果是通过邀请加入的，强制确认为B端，绝不添加A端消息
        const isJoinByInvite = chatId && inviter;
        const hasInviteParams = inviter || this.data.inviter;
        
        console.log('🔥 [身份验证] isFromInvite:', this.data.isFromInvite);
        console.log('🔥 [身份验证] isCreator:', isCreator);
        console.log('🔥 [身份验证] isJoinByInvite:', isJoinByInvite);
        console.log('🔥 [身份验证] hasInviteParams:', hasInviteParams);
        
        // 🔥 如果有任何邀请迹象，强制设为B端，不添加A端消息
        if (hasInviteParams || isJoinByInvite) {
          console.log('🔥 [B端强制确认] 检测到邀请参数，强制确认为B端身份，跳过A端系统消息');
          // 强制更新身份状态
          this.setData({
            isFromInvite: true,
            isSender: false
          });
        } else if (isCreator) {
          console.log('🔥 [A端系统消息] 检测到A端身份，准备添加/更新系统消息');
          
          // 仅当当前消息列表还没有创建消息时添加
          const hasCreator = (this.data.messages || []).some(m => m.isSystem && m.content && m.content.includes('您创建了私密聊天'));
          if (!hasCreator) {
            this.addCreatorSystemMessage();
          }
          
          // 🔥 【关键修复】当B端加入时，A端将创建消息替换为加入消息
          setTimeout(() => {
            const updatedParticipants = res.result.participants || [];
            if (updatedParticipants.length >= 2) {
              // 找到B端参与者
              const currentUserOpenId = userInfo.openId || app.globalData.openId;
              const bSideParticipant = updatedParticipants.find(p => 
                (p.id || p.openId) !== currentUserOpenId
              );
              
              if (bSideParticipant) {
                const bSideName = bSideParticipant.nickName || bSideParticipant.name || '好友';
                console.log('🔥 [A端系统消息] B端已加入，替换创建消息为加入消息:', bSideName);
                this.replaceCreatorMessageWithJoinMessage(bSideName);
              }
            }
          }, 800);
        } else {
          console.log('🔥 [B端确认] 检测到B端身份，不添加A端系统消息');
        }
        
        // 🔥 【HOTFIX-v1.3.57】B端身份二次确认：只清理错误消息，不重复添加
        if (hasInviteParams || isJoinByInvite) {
          console.log('🔥 [B端二次确认] 开始清理可能存在的错误A端消息');
          setTimeout(() => {
            this.cleanupWrongSystemMessages();
            // 🔥 不再重复调用updateSystemMessageAfterJoin，避免重复消息
            console.log('🔥 [B端二次确认] 清理完成，B端系统消息将由主流程处理');
          }, 100);
        }
      } catch (e) {
        console.error('🔥 [系统消息错误]', e);
      }
          
          // 🔥 【系统消息修复-v2】B端加入后额外清理任何遗留的错误消息
          setTimeout(() => {
            this.cleanupWrongSystemMessages();
          }, 200);
          
          // 🔥 【消息收发修复】确保接收方能收到发送方的消息
          console.log('🔧 [接收方修复] 强制重启消息监听器，确保能收到发送方消息');
          this.stopMessageListener();
          setTimeout(() => {
            this.startMessageListener();
            console.log('🔧 [接收方修复] 消息监听器重启完成');
          }, 500);
          
          // 🔥 立即更新参与者信息（从云函数返回的数据中获取）
          if (res.result.participants && res.result.participants.length > 0) {
            const currentUserOpenId = userInfo.openId || app.globalData.openId;
            
            // 🔥 【CRITICAL-FIX-v4】标准化参与者数据 - 修复B端标题显示"用户"问题
            const decodedInviterName = inviterName || (inviter ? decodeURIComponent(decodeURIComponent(inviter)) : null) || '好友';
            console.log('🔥 [B端参与者数据] 解码后的邀请者名称:', decodedInviterName);
            
            const normalizedParticipants = res.result.participants.map(p => ({
              id: p.id || p.openId,
              openId: p.id || p.openId,
              nickName: p.nickName || p.name || (p.id === currentUserOpenId ? userInfo.nickName : decodedInviterName) || '朋友',
              avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
              isSelf: (p.id || p.openId) === currentUserOpenId,
              isCreator: p.isCreator || false,
              isJoiner: p.isJoiner || false
            }));
            
            // 🔥 特别处理：确保邀请者（对方）的昵称和头像正确显示
            const inviterNickName = decodeURIComponent(decodeURIComponent(inviter)) || '好友'; // 🔧 双重解码修复
            const processedParticipants = normalizedParticipants.map(p => {
              if (!p.isSelf) {
                // 这是邀请者，使用URL中的昵称，但保持原有头像（如果有的话）
                return {
                  ...p,
                  nickName: inviterNickName,
                  name: inviterNickName,
                  avatarUrl: p.avatarUrl || '/assets/images/default-avatar.png' // 🔧 保持原有头像或使用默认头像
                };
              }
              return p;
            });
            
            console.log('🔗 [被邀请者] 立即更新参与者信息:', processedParticipants);
            console.log('🔗 [被邀请者] 邀请者昵称:', inviterNickName);
            
            this.setData({
              participants: processedParticipants
            });
            
            // 🔥 立即更新标题，使用真实的参与者昵称（接收方专用逻辑）
            setTimeout(() => {
              // 🔥 【修复b端标题】优先使用URL中的邀请者昵称
              const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
              let finalInviterName = inviterNickName;
              
              if (urlParams.inviter) {
                try {
                  const urlInviter = decodeURIComponent(decodeURIComponent(urlParams.inviter));
                  if (urlInviter && 
                      urlInviter !== '朋友' && 
                      urlInviter !== '好友' && 
                      urlInviter !== '邀请者' && 
                      urlInviter !== '用户') {
                    finalInviterName = urlInviter;
                    console.log('🔗 [被邀请者] 使用URL中的真实邀请者昵称:', finalInviterName);
                  }
                } catch (e) {
                  console.log('🔗 [被邀请者] URL解码失败，使用传入的昵称');
                }
              }
              
              // 直接设置标题，不经过复杂的函数链
              const receiverTitle = `我和${finalInviterName}（2）`;
              console.log('🔗 [被邀请者] 设置接收方标题:', receiverTitle);
              
              this.setData({
                dynamicTitle: receiverTitle,
                contactName: receiverTitle,
                chatTitle: receiverTitle
              });
              
              wx.setNavigationBarTitle({
                title: receiverTitle,
                success: () => {
                  console.log('🔗 [被邀请者] ✅ 接收方标题设置成功:', receiverTitle);
                }
              });
            }, 100);
          }
          
          // 延迟获取聊天记录和参与者信息，确保数据库已更新
          setTimeout(() => {
            this.fetchMessagesAndMerge(); // 使用新的方法来合并消息
            
            // 🔥 启动实时监听（增强版）
            this.startMessageListener();
            
            // 🔧 【消息收发修复】启动轮询备份，确保消息同步
            this.startPollingMessages();
            
            // 🔥 强制更新用户信息到数据库，确保后续查询能获取到正确信息
            this.updateUserInfoInDatabase();
            
            // 🔥 强制刷新参与者信息，获取发送方的真实头像
            setTimeout(() => {
              this.fetchChatParticipantsWithRealNames();
              
              // 🔗 再次确保接收方标题正确
              const inviterName = decodeURIComponent(decodeURIComponent(inviter)) || '邀请者';
              // 仅接收方才允许调用接收方标题更新
              if (this.data.isFromInvite) {
                this.updateTitleForReceiver(inviterName);
              }
            }, 1500);
          }, 1000);
          
        } else {
          console.error('🔗 [被邀请者] 加入聊天失败:', res.result?.error);
          this.addSystemMessage('加入聊天失败，请重试', { autoFadeStaySeconds: 3, fadeSeconds: 5 });
        }
      },
      fail: (err) => {
        console.error('🔗 [被邀请者] 调用joinByInvite失败:', err);
        this.addSystemMessage('网络错误，加入聊天失败', { autoFadeStaySeconds: 3, fadeSeconds: 5 });
      }
    });
  },

  /**
   * 🔥 【双端显示修复】立即修复标题和系统消息
   */
  fixBEndDisplayImmediately: function() {
    if (this.isHomogeneousUiMode()) {
      console.log('🔥 [同构UI模式] 跳过B端专用显示修复，复用统一UI状态机');
      return;
    }
    console.log('🔥 [双端显示修复] 开始检查并修复显示问题');
    
    const { isFromInvite, isSender, currentUser } = this.data;
    
    // 🔥 【A端专门处理】A端创建者的显示修复
    if (!isFromInvite && isSender) {
      console.log('🔥 [A端显示修复] 检测到A端用户，修复A端显示');
      
      // 修复A端标题（显示自己的昵称）
      const aEndTitle = currentUser?.nickName || '我';
      wx.setNavigationBarTitle({
        title: aEndTitle
      });
      this.setData({
        dynamicTitle: aEndTitle
      });
      
      // 修复A端系统消息
      this.fixAEndSystemMessage();
      return;
    }
    
    // 🔥 【B端专门处理】B端用户的显示修复
    const isReceiverEnv = this.isReceiverEnvironment();
    if (isReceiverEnv) {
      console.log('🔥 [B端显示修复] 检测到B端用户，修复B端显示');
    } else {
      console.log('🔥 [双端显示修复] 身份不明确，跳过修复');
      return;
    }
    
    console.log('🔥 [B端显示修复] 确认B端身份，开始修复');
    
    // 立即获取参与者信息并更新标题
    this.fetchChatParticipantsWithRealNames();
    
    setTimeout(() => {
      const participants = this.data.participants || [];
      var currentUserOpenId = currentUser?.openId
        || getApp().globalData.userInfo?.openId
        || getApp().globalData.openId
        || wx.getStorageSync('openId');
      
      // 找到A端用户
      const aEndUser = participants.find(p => {
        const pId = p.id || p.openId;
        return pId && pId !== currentUserOpenId;
      });
      
      if (aEndUser && aEndUser.nickName && !['朋友', '邀请者', '用户', '好友'].includes(aEndUser.nickName)) {
        const bEndTitle = `我和${aEndUser.nickName}（2）`;
        console.log('🔥 [B端显示修复] 立即更新B端标题:', bEndTitle);
        
        wx.setNavigationBarTitle({
          title: bEndTitle
        });
        
        this.setData({
          dynamicTitle: bEndTitle
        });
        
        // 同时修复B端系统消息
        this.fixBEndSystemMessage(aEndUser.nickName);
      } else {
        console.log('🔥 [B端显示修复] 暂未获取到真实昵称，等待下次更新');
        
        // 再次延迟尝试
        setTimeout(() => {
          this.fixBEndDisplayImmediately();
        }, 1000);
      }
    }, 800);
  },

  /**
   * 记录聊天访问历史(详见 modules/share-utils.js#recordChatVisit)
   * @param {string} chatId
   * @param {string} userId
   */
  recordChatVisit: function(chatId, userId) {
    ShareUtils.recordChatVisit(chatId, userId);
  },
  /**
   * 🔥 更新用户信息到数据库
   */
  updateUserInfoInDatabase: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;

    if (!userInfo || !userInfo.openId) return;

    console.log('👤 更新用户信息到数据库:', userInfo);

    wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: {
        openId: userInfo.openId,
        userInfo: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl
        }
      },
      success: res => {
        console.log('👤 用户信息更新成功:', res);
      },
      fail: err => {
        console.error('👤 用户信息更新失败:', err);
      }
    });
  },

  /**
   * 🔧 更新特定用户信息到数据库
   * @param {string} openId - 目标用户 openId
   * @param {string} nickName - 目标用户昵称
   */
  updateSpecificUserInfo: function(openId, nickName) {
    if (!openId || !nickName || nickName === '用户') return;

    console.log('👤 [修复] 更新特定用户信息到数据库:', { openId, nickName });

    wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: {
        openId: openId,
        userInfo: {
          nickName: nickName,
          avatarUrl: '/assets/images/default-avatar.png'
        }
      },
      success: res => {
        console.log('👤 [修复] 特定用户信息更新成功:', res);
      },
      fail: err => {
        console.error('👤 [修复] 特定用户信息更新失败:', err);
      }
    });
  },


  /**
   * 🔥 【新增】移除b端错误的创建消息
   */
  removeWrongCreatorMessages: function() {
    const { isFromInvite, messages } = this.data;
    
    // 只有b端需要移除错误的创建消息
    if (!isFromInvite || !messages) return;
    
    const filteredMessages = messages.filter(msg => {
      if (msg.isSystem && msg.content && msg.content.includes('您创建了私密聊天')) {
        console.log('🔄 [b端清理] 移除错误的创建消息:', msg.content);
        return false;
      }
      return true;
    });
    
    if (filteredMessages.length !== messages.length) {
      this._localMessageCache = filteredMessages;
      this.setData({
        messages: filteredMessages
      });
      console.log('🔄 [b端清理] ✅ 已移除错误的创建消息');
    }
  },

  /**
   * 🔧 检查并修复昵称显示问题
   */
  checkAndFixNicknames: function() {
     console.log('🔧 [昵称修复] 开始检查昵称显示问题');
     
     const participants = this.data.participants || [];
     const currentUserOpenId = this.data.currentUser?.openId;
     
     console.log('🔧 [昵称修复] 当前参与者数量:', participants.length);
     console.log('🔧 [昵称修复] 参与者列表详情:', participants);
     
     // 🚨 【修复】如果参与者数量异常（>2），先进行去重处理
     if (participants.length > 2) {
       console.log('🔧 [昵称修复] 参与者数量异常，开始去重处理');
       this.deduplicateParticipants();
       return; // 🔥 【防无限循环】去重完成，不再重复调用昵称修复
     }
     
     if (participants.length !== 2) {
       console.log('🔧 [昵称修复] 参与者数量不是2，跳过修复');
       return;
     }
     
     const otherParticipant = participants.find(p => (p.openId || p.id) !== currentUserOpenId);
     
     if (otherParticipant && otherParticipant.nickName === '用户') {
       console.log('🔧 [昵称修复] 发现对方昵称为"用户"，尝试从URL参数或存储修复');
       {
         console.log('🔧 [昵称修复] 尝试从URL参数或本地存储获取正确昵称');
         
         // 🔧 尝试从URL参数获取邀请者信息
         const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
         let correctNickname = null;
         
         if (urlParams.inviter) {
           try {
             correctNickname = decodeURIComponent(decodeURIComponent(urlParams.inviter));
             console.log('🔧 [昵称修复] 从URL参数获取到昵称:', correctNickname);
           } catch (e) {
             console.log('🔧 [昵称修复] URL解码失败:', e);
           }
         }
         
         // 🔧 如果URL中没有，尝试从邀请信息中获取
         if (!correctNickname || correctNickname === '好友' || correctNickname === '朋友') {
           const app = getApp();
           const savedInviteInfo = wx.getStorageSync('inviteInfo');
           if (savedInviteInfo && savedInviteInfo.inviter) {
             correctNickname = savedInviteInfo.inviter;
             console.log('🔧 [昵称修复] 从邀请信息获取到昵称:', correctNickname);
           }
         }
         
         if (correctNickname && correctNickname !== '好友' && correctNickname !== '朋友') {
           console.log('🔧 [昵称修复] 使用获取到的正确昵称进行修复:', correctNickname);
           
           // 更新本地显示
           const updatedParticipants = participants.map(p => {
             if ((p.openId || p.id) === otherParticipant.openId) {
               return {
                 ...p,
                 nickName: correctNickname,
                 name: correctNickname
               };
             }
             return p;
           });
           
           // 更新页面数据
           this.setData({
             participants: updatedParticipants
           });
           
           // 更新标题
           setTimeout(() => {
             this.updateDynamicTitleWithRealNames();
           }, 100);
           
           // 更新数据库
           this.updateSpecificUserInfo(otherParticipant.openId, correctNickname);
           
           console.log('🔧 [昵称修复] 通用修复完成');
         } else {
           console.log('🔧 [昵称修复] 无法获取正确昵称，触发手动修复流程');
           this.manuallyFixConnection();
         }
       }
     } else {
       console.log('🔧 [昵称修复] 昵称显示正常，无需修复');
     }
   },


  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    // 刷新聊天记录
    this.fetchMessages();
    wx.stopPullDownRefresh();
  },
  /**
   * 获取聊天记录并合并本地消息（用于接收方加入后）
   */
  fetchMessagesAndMerge: function() {
    const that = this;
    
    console.log('🔍 获取聊天记录并合并本地消息，chatId:', that.data.contactId);
    
    // 保存当前的本地消息（特别是刚添加的系统消息）
    const localMessages = that.data.messages || [];
    const localSystemMessages = localMessages.filter(msg => 
      msg.isSystem && msg.id && msg.id.startsWith('sys_')
    );
    
    console.log('🔍 保存的本地系统消息:', localSystemMessages);
    
    // 🔥 修改：后台静默获取消息，不显示加载气泡
    console.log('🔍 开始后台静默获取历史消息...');
    
    // 使用云函数获取消息
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        chatId: that.data.contactId
      },
      success: res => {
        console.log('🔍 获取消息成功', res);
        wx.hideLoading();
        
        if (res.result && res.result.success) {
          // 处理服务器消息数据
          const serverMessages = res.result.messages.map(msg => {
            const currentUserOpenId = getApp().globalData.userInfo.openId || getApp().globalData.openId;
            const isSelf = that.isMessageFromCurrentUser(msg.senderId, currentUserOpenId);
            const resolvedServerId = msg._id || msg.id || '';
            if (!resolvedServerId) {
              console.warn('🔍 [历史消息] 跳过无ID消息，避免列表key冲突:', msg.content);
              return null;
            }
            
            // 🔥 获取正确的头像
            let avatar = '/assets/images/default-avatar.png';
            if (msg.type === 'system') {
              avatar = '/assets/images/default-avatar.png';
            } else if (isSelf) {
              // 🔥 【B端头像修复】B端自己的消息不显示头像
              const isFromInvite = (typeof that.isReceiverEnvironment === 'function')
                ? that.isReceiverEnvironment()
                : !!that.data.isFromInvite;
              if (isFromInvite) {
                // B端用户自己发送的消息，不设置头像
                avatar = null;
                console.log('🔥 [B端头像修复] B端自己发送的消息，移除头像显示');
              } else {
                // A端用户自己的头像
                avatar = that.data.currentUser?.avatarUrl || getApp().globalData.userInfo?.avatarUrl || '/assets/images/default-avatar.png';
              }
            } else {
              // 对方的头像，从参与者列表中查找
              const sender = that.data.participants.find(p => 
                p.openId === msg.senderId || p.id === msg.senderId
              );
              avatar = sender?.avatarUrl || sender?.avatar || '/assets/images/default-avatar.png';
              
              // 🔥 如果参与者列表中没有找到，尝试从URL参数获取邀请者信息
              if (!sender || avatar === '/assets/images/default-avatar.png') {
                const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
                if (urlParams.inviter) {
                  // 使用默认头像，但保留真实昵称用于标题显示
                  avatar = '/assets/images/default-avatar.png';
                }
              }
            }
            
            // 保留原始数值时间戳
            let numericTs = Date.now();
            try {
              if (msg.sendTime) {
                if (typeof msg.sendTime === 'number') {
                  numericTs = msg.sendTime;
                } else if (msg.sendTime._date) {
                  numericTs = new Date(msg.sendTime._date).getTime();
                } else if (msg.sendTime.getTime) {
                  numericTs = msg.sendTime.getTime();
                } else {
                  const p = new Date(msg.sendTime).getTime();
                  if (!isNaN(p)) numericTs = p;
                }
              } else if (msg._createTime) {
                numericTs = typeof msg._createTime === 'number'
                  ? msg._createTime
                  : new Date(msg._createTime).getTime();
              }
            } catch (_e) { /* fallback Date.now() */ }

            return {
              id: resolvedServerId,
              senderId: msg.senderId,
              originalSenderId: msg.senderId,
              isSelf: isSelf,
              content: msg.content,
              type: msg.type,
              duration: msg.duration || 0,
              time: that.formatTime(new Date(msg.sendTime)),
              timeDisplay: that.formatTime(new Date(msg.sendTime)),
              timestamp: numericTs,
              sendTime: numericTs,
              showTime: true,
              status: msg.status,
              destroyed: msg.destroyed,
              destroying: false,
              remainTime: 0,
              avatar: avatar,
              isSystem: msg.type === 'system'
            };
          }).filter(msg => msg !== null);
          
          // 🔥 【CRITICAL-FIX-v4】B端专用消息过滤 - 彻底解决B端获取A端消息问题
          const filteredServerMessages = serverMessages.filter(msg => {
            if (msg.isSystem && msg.content) {
              // 🔥 【B端特殊过滤】如果当前用户是B端（isFromInvite），彻底过滤A端消息
              const isFromInvite = (typeof this.isReceiverEnvironment === 'function')
                ? this.isReceiverEnvironment()
                : !!this.data.isFromInvite;
              
              if (isFromInvite) {
                // 🔥 【HOTFIX-v1.3.68】B端用户：彻底过滤掉所有A端相关的系统消息
                const shouldFilterForBSide = 
                  msg.content.includes('您创建了私密聊天') ||
                  msg.content.includes('可点击右上角菜单分享链接邀请朋友加入') ||
                  msg.content.includes('私密聊天已创建') ||
                  msg.content.includes('分享链接邀请朋友') ||
                  (msg.content.includes('创建') && msg.content.includes('聊天')) ||
                  // 🔥 【HOTFIX-v1.3.68】过滤A端加入消息格式"XX加入聊天"（但保留B端格式"加入XX的聊天"）
                  (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content));
                
                if (shouldFilterForBSide) {
                  console.log('🔥 [B端消息过滤-v1.3.68] B端彻底过滤A端系统消息:', msg.content);
                  return false;
                }
              }
              
              // 🔥 【CRITICAL-FIX-v4】垃圾数据和错误格式双重过滤
              const shouldFilter = 
                // 【垃圾数据过滤】优先过滤无效数据
                !msg.content || msg.content.trim() === '' ||
                !msg.senderId || 
                msg.senderId === 'undefined' || 
                msg.senderId === 'null' ||
                msg.senderId === '' ||
                msg.senderId === ' ' ||
                // 【内容垃圾过滤】
                msg.content === 'undefined' ||
                msg.content === 'null' ||
                msg.content === '[object Object]' ||
                msg.content.includes('NaN') ||
                msg.content.length > 1000 ||
                // 【错误格式过滤】精确匹配错误消息格式
                msg.content === '成功加入朋友的聊天' ||
                msg.content === '成功加入朋友的聊天！' ||
                msg.content === '已加入朋友的聊天' ||
                msg.content === '成功加入聊天' ||
                msg.content === '已加入聊天' ||
                msg.content === '朋友已加入聊天' ||
                msg.content === '朋友已加入聊天！' ||
                // 过滤所有包含"成功加入"的消息
                msg.content.includes('成功加入') ||
                // 移除特定的"已加入"错误格式
                (msg.content.includes('已加入') && !msg.content.match(/^已加入.+的聊天$/)) ||
                // 过滤包含感叹号的旧格式消息
                (msg.content.includes('加入') && msg.content.includes('聊天') && msg.content.includes('！')) ||
                isPlaceholderJoinMessage(msg.content);
              
              if (shouldFilter) {
                // 🔥 【HOTFIX-v1.3.68】二次检查：不要过滤正确格式的消息
                let isCorrectFormat = false;
                
                if (isFromInvite) {
                  // B端只保留B端格式的加入消息
                  isCorrectFormat = /^加入.+的聊天$/.test(msg.content); // "加入xx的聊天"
                } else {
                  // A端保留A端格式的消息
                  isCorrectFormat = 
                    (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content)) || // "xx加入聊天"（非"加入xx的聊天"）
                    msg.content.includes('您创建了私密聊天'); // A端创建消息
                }
                  
                if (isCorrectFormat) {
                  console.log('🔥 [消息过滤-v1.3.68] 保留正确格式消息:', msg.content, 'B端:', isFromInvite);
                  return true; // 保留正确格式
                }
                
                console.log('🔥 [消息过滤-v1.3.68] 过滤错误系统消息:', msg.content, '发送者:', msg.senderId);
                return false; // 过滤掉
              }
              
              // 🔥 【HOTFIX-v1.3.68】额外验证：只保留正确格式的系统消息
              if (msg.content.includes('加入') && msg.content.includes('聊天')) {
                let isCorrectFormat = false;
                
                if (isFromInvite) {
                  // B端只保留B端格式："加入xx的聊天"
                  isCorrectFormat = /^加入.+的聊天$/.test(msg.content);
                } else {
                  // A端保留A端格式："xx加入聊天" 或 "您创建了私密聊天"
                  isCorrectFormat = 
                    (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content)) ||
                    msg.content.includes('您创建了私密聊天');
                }
                
                if (!isCorrectFormat) {
                  console.log('🔥 [消息过滤-v1.3.68] 过滤格式不正确的加入消息:', msg.content, 'B端:', isFromInvite);
                  return false;
                }
              }
            }
            return true;
          });
          
          // 合并本地系统消息和服务器消息
          let allMessages = [...filteredServerMessages, ...localSystemMessages];
          // B端合并时强制剔除A端样式“XX加入聊天”，仅保留“加入XX的聊天”
          if ((typeof that.isReceiverEnvironment === 'function'
            ? that.isReceiverEnvironment()
            : (that.data && that.data.isFromInvite))) {
            allMessages = allMessages.filter(m => {
              if (!m || !isSystemLikeMessage(m) || typeof m.content !== 'string') return true;
              if (/^.+加入聊天$/.test(m.content) && !/^加入.+的聊天$/.test(m.content)) {
                console.log('🧹 [合并过滤] (B端) 移除A端样式系统消息:', m.content);
                return false;
              }
              return true;
            });
          }
          
          // 按时间排序，但确保本地系统消息显示在最后
          allMessages.sort((a, b) => {
            // 如果是本地系统消息，放在最后
            if (a.id && a.id.startsWith('sys_') && !(b.id && b.id.startsWith('sys_'))) {
              return 1;
            }
            if (b.id && b.id.startsWith('sys_') && !(a.id && a.id.startsWith('sys_'))) {
              return -1;
            }
            
            // 其他消息按时间排序
            const timeA = a.time || '00:00';
            const timeB = b.time || '00:00';
            return timeA.localeCompare(timeB);
          });
          
          console.log(`🔍 合并后的消息数据 ${allMessages.length} 条:`, allMessages);
          
          that._localMessageCache = allMessages;
          that.setData({
            messages: allMessages,
            isLoading: false
          }, function() {
            that.scheduleScrollToBottom();
          });

        // 🔥 补偿：为仍未进入销毁流程的普通消息启动倒计时（防止刷新后计时丢失）
        setTimeout(() => {
          const currentUserId = that.data.currentUser?.openId;
          const msgs = that.data.messages || [];
          msgs.forEach(m => {
            if (
              m &&
              !m.isSystem &&
              m.senderId !== 'system' &&
              !m.destroyed &&
              !m.destroying &&
              !m.fading &&
              m.id &&
              (!that.destroyTimers || !that.destroyTimers.has(m.id))
            ) {
              // 自己或对方的普通消息都应按规则销毁
              try { that.startDestroyCountdown(m.id); } catch (e) {
                console.warn('⚠️ [销毁补偿] 启动倒计时失败:', m.id, e);
              }
            }
          });
        }, 200); // 给setData一次渲染时间
          
          // 🔥 【系统消息修复-v2】消息获取后进行额外清理
          setTimeout(() => {
            that.cleanupWrongSystemMessages();
          }, 100);
          
          // 滚动到底部
          that.scheduleScrollToBottom();
        } else {
          console.log('🔍 获取消息失败，保持本地消息');
          // 获取失败时保持当前消息不变
          that.setData({
            isLoading: false
          });
        }
      },
      fail: err => {
        console.error('🔍 获取消息失败', err);
        wx.hideLoading();
        
        // 失败时保持当前消息不变
        that.setData({
          isLoading: false
        });
      }
    });
  },

  /**
   * 获取聊天记录
   */
  fetchMessages: function () {
    const that = this;
    that.ensureDestroyedMessageStore();
    
    console.log('🔍 获取聊天记录，chatId:', that.data.contactId);
    
    // 🔥 修复：避免频繁显示加载提示和重复请求
    if (that.data.isLoading) {
      console.log('🔍 正在加载中，跳过重复请求');
      return;
    }
    
    // 🔥 修改：所有消息加载都在后台静默进行，不显示加载气泡
    const lastFetchTime = that.lastFetchTime || 0;
    const currentTime = Date.now();
    console.log('🔍 后台静默获取消息，无前端加载提示');
    
    that.lastFetchTime = currentTime;
    // that.setData({ isLoading: true }); // 🔥 修改：后台静默获取，不显示loading界面
    
    // 🔥 【HOTFIX-v1.3.38】保存当前已销毁消息的ID列表，使用全局记录防止重新显示
    const existingMessages = that._localMessageCache || that.data.messages || [];
    const destroyedMessageIds = new Set();
    const destroyingMessageIds = new Set();
    const destroyingMessageStates = new Map(); // 保存销毁状态

    const registerMessageKeys = ChatHelpers.registerMessageKeys;

    const registerDestroyState = (message, state) => {
      if (!message || !state) {
        return;
      }
      const keys = [];
      if (message.id) {
        keys.push(message.id);
      }
      if (message._id && message._id !== message.id) {
        keys.push(message._id);
      }
      if (!keys.length) {
        return;
      }
      keys.forEach(key => destroyingMessageStates.set(key, state));
    };

    const getDestroyState = (message) => {
      if (!message) {
        return undefined;
      }
      const key = message._id || message.id;
      if (!key) {
        return undefined;
      }
      return destroyingMessageStates.get(key);
    };
    
    // 🔥 【HOTFIX-v1.3.75】合并本地消息状态和全局销毁记录，包括fading状态
    existingMessages.forEach(msg => {
      if (msg.destroyed) {
        registerMessageKeys(destroyedMessageIds, msg);
        registerMessageKeys(that.globalDestroyedMessageIds, msg); // 添加到全局记录
      }
      // 🔥 【HOTFIX-v1.3.75】同时记录fading状态的消息，防止刷新时重新显示
      if (msg.fading || msg.destroying) {
        registerMessageKeys(destroyingMessageIds, msg);
        registerDestroyState(msg, {
          opacity: msg.opacity,
          remainTime: msg.remainTime,
          fading: msg.fading,
          destroying: msg.destroying,
          hideWhenFading: msg.hideWhenFading
        });
        console.log('🔥 [防空白气泡-v1.3.75] 标记正在淡出的消息:', msg.id, msg.content);
        // 🔥 不要将fading/destroying的消息加入destroyedMessageIds，否则会被过滤掉
        // registerMessageKeys(destroyedMessageIds, msg);
        // if (that.globalDestroyedMessageIds) {
        //   registerMessageKeys(that.globalDestroyedMessageIds, msg);
        // }
      }
    });
    
    if (that.globalDestroyedMessageIds) {
      that.globalDestroyedMessageIds.forEach(id => {
        destroyedMessageIds.add(id);
      });
    }
    
    console.log('🔥 [防重复加载] 已销毁消息ID:', Array.from(destroyedMessageIds));
    console.log('🔥 [防重复加载] 正在销毁消息ID:', Array.from(destroyingMessageIds));
    console.log('🔥 [防重复加载] 全局销毁记录:', Array.from(that.globalDestroyedMessageIds || []));
    
    // 🔥 使用云函数获取消息 - 传递chatId而不是targetUserId
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        chatId: that.data.contactId // 🔥 使用chatId参数
      },
      success: res => {
        console.log('🔍 获取消息成功', res);
        // wx.hideLoading(); // 🔥 已移除对应的showLoading，无需hideLoading
        
        if (res.result && res.result.success) {
          // 处理消息数据
          let messages = res.result.messages.map(msg => {
            // 🔥 标准化ID集合，便于判重/过滤
            const msgKeyIds = [];
            if (msg._id) msgKeyIds.push(msg._id);
            if (msg.id && msg.id !== msg._id) msgKeyIds.push(msg.id);

            const resolvedMessageId = msg._id || msg.id || '';
            if (!resolvedMessageId) {
              console.warn('🔥 [防重复加载] 跳过无ID云端消息，避免列表key冲突:', msg.content);
              return null;
            }

            // 🔥 记录服务端的destroyed标记，避免回流
            if (msg.destroyed === true) {
              msgKeyIds.forEach(id => {
                destroyedMessageIds.add(id);
                if (that.globalDestroyedMessageIds) that.globalDestroyedMessageIds.add(id);
              });
            }

            // 🔥 检查是否为已销毁/正在销毁的消息，直接跳过
            const isDestroyedOrMarked = msg.destroyed === true || msgKeyIds.some(id => destroyedMessageIds.has(id));
            if (isDestroyedOrMarked) {
              console.log('🔥 [防重复加载] 跳过已销毁/标记销毁的消息:', msg.content, msgKeyIds);
              return null; // 标记为跳过
            }
            
            // 🔥 【HOTFIX-v1.3.23】修复接收方消息判断 - 使用智能身份匹配
            const currentUserOpenId = that.data.currentUser?.openId || getApp().globalData.userInfo?.openId || getApp().globalData.openId;
            const isSelf = that.isMessageFromCurrentUser(msg.senderId, currentUserOpenId);
            
            console.log('🔍 [消息处理] 消息ID:', msg._id, '发送者:', msg.senderId, '当前用户:', currentUserOpenId, '是否自己:', isSelf);
            
            // 🔥 【B端头像修复】处理头像逻辑
            let avatar = null; // 默认不显示头像
            const isFromInvite = (typeof that.isReceiverEnvironment === 'function')
              ? that.isReceiverEnvironment()
              : !!that.data.isFromInvite;
            
            if (msg.type === 'system' && isPlaceholderJoinMessage(msg.content)) {
              console.log('🔥 [防重复加载] 过滤占位系统消息，避免回流:', msg.content);
              return null;
            }

            if (msg.type === 'system') {
              avatar = null; // 系统消息不显示头像
            } else if (isSelf) {
              // 🔥 【B端修复】B端用户自己的消息不显示头像
              if (isFromInvite) {
                avatar = null;
                console.log('🔥 [B端头像修复] B端自己发送的消息，不设置头像');
              } else {
                // A端用户自己的消息也不显示头像（统一处理）
                avatar = null;
              }
            } else {
              // 对方的头像也暂时不显示（因为当前模板没有头像元素）
              avatar = null;
            }
            
            // 🚨 【修复时间错误】安全处理sendTime
            let msgTime = '00:00';
            try {
              if (msg.sendTime) {
                // 处理不同格式的时间
                let timeValue;
                if (typeof msg.sendTime === 'string') {
                  timeValue = new Date(msg.sendTime);
                } else if (msg.sendTime._date) {
                  // 微信云数据库的serverDate格式
                  timeValue = new Date(msg.sendTime._date);
                } else if (msg.sendTime.getTime) {
                  // 已经是Date对象
                  timeValue = msg.sendTime;
                } else {
                  // 时间戳格式
                  timeValue = new Date(msg.sendTime);
                }
                
                if (timeValue && !isNaN(timeValue.getTime())) {
                  msgTime = that.formatTime(timeValue);
                } else {
                  console.warn('🚨 [时间修复] 无效时间格式:', msg.sendTime);
                  msgTime = that.formatTime(new Date());
                }
              } else {
                console.warn('🚨 [时间修复] 消息缺少sendTime字段:', msg._id);
                msgTime = that.formatTime(new Date());
              }
            } catch (timeError) {
              console.error('🚨 [时间修复] 时间处理错误:', timeError, '原始时间:', msg.sendTime);
              msgTime = that.formatTime(new Date());
            }
            
            // 🔥 保持原有的销毁状态
            const messageStateKey = resolvedMessageId;
            const stateSnapshot = messageStateKey ? destroyingMessageStates.get(messageStateKey) : undefined;
            const wasDestroying = (stateSnapshot && stateSnapshot.destroying) || (messageStateKey ? destroyingMessageIds.has(messageStateKey) : false);
            
            // 🔥 【HOTFIX-v1.3.67】B端立即过滤掉A端系统消息，防止刷新时重新出现
            if (msg.type === 'system' && isFromInvite) {
              // B端需要过滤A端的系统消息
              if (msg.content.includes('您创建了私密聊天')) {
                console.log('🔥 [B端过滤-v1.3.67] 过滤A端创建消息:', msg.content);
                return null;
              }
              // 过滤A端的"XX加入聊天"格式（但保留B端的"加入XX的聊天"格式）
              if (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content)) {
                console.log('🔥 [B端过滤-v1.3.67] 过滤A端加入消息:', msg.content);
                return null;
              }
            }
            
            const systemLikeMsg = isSystemLikeMessage(msg);

            // 保留原始数值时间戳，供 checkBurnAfterReadingCleanup 等判断消息新旧
            let numericTimestamp = Date.now();
            try {
              if (msg.sendTime) {
                if (typeof msg.sendTime === 'number') {
                  numericTimestamp = msg.sendTime;
                } else if (msg.sendTime._date) {
                  numericTimestamp = new Date(msg.sendTime._date).getTime();
                } else if (msg.sendTime.getTime) {
                  numericTimestamp = msg.sendTime.getTime();
                } else {
                  const parsed = new Date(msg.sendTime).getTime();
                  if (!isNaN(parsed)) numericTimestamp = parsed;
                }
              } else if (msg._createTime) {
                numericTimestamp = typeof msg._createTime === 'number'
                  ? msg._createTime
                  : new Date(msg._createTime).getTime();
              }
            } catch (_e) { /* 解析失败保持 Date.now() */ }

            return {
              id: resolvedMessageId,
              senderId: msg.senderId,
              originalSenderId: msg.senderId,
              isSelf: isSelf,
              content: msg.content,
              type: msg.type || (systemLikeMsg ? 'system' : 'text'),
              duration: msg.duration || 0,
              time: msgTime,
              timeDisplay: msgTime,
              timestamp: numericTimestamp,
              sendTime: numericTimestamp,
              showTime: true,
              status: msg.status,
              destroyed: msg.destroyed,
              destroying: wasDestroying,
              fading: stateSnapshot?.fading || false,
              hideWhenFading: stateSnapshot?.hideWhenFading || false,
              remainTime: stateSnapshot?.remainTime || 0,
              opacity: stateSnapshot?.opacity !== undefined ? stateSnapshot.opacity : 1,
              avatar: avatar,
              isSystem: systemLikeMsg,
              isSystemMessage: systemLikeMsg
            };
          }).filter(msg => msg !== null); // 🔥 过滤掉已销毁的消息和B端不应看到的A端系统消息
          
          // 🔥 去重保护：按id/_id去重，避免历史消息回流造成重复
          const uniqueMap = new Map();
          messages.forEach(m => {
            if (!m) return;
            const key = m.id || m._id || `${m.senderId || 'unknown'}_${m.timestamp || m.sendTime || 0}_${m.content || ''}`;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, m);
            }
          });
          messages = Array.from(uniqueMap.values());

          console.log(`🔍 处理后的消息数据 ${messages.length} 条(去重后):`, messages);

          // 🔥 【合并模式-v3】保留本地已有但云端尚未返回的消息
          // 关键修复：重新读取 _localMessageCache，因为 watcher 可能在异步云端请求期间添加了新消息
          const freshLocalMessages = that._localMessageCache || that.data.messages || [];
          const cloudMsgIds = new Set(messages.map(m => m.id).filter(Boolean));
          const retainedLocal = freshLocalMessages.filter(localMsg => {
            if (!localMsg || !localMsg.id) return false;
            if (cloudMsgIds.has(localMsg.id)) return false;
            if (localMsg.destroyed) return false;
            if (destroyedMessageIds.has(localMsg.id)) return false;
            if (localMsg._localTemp || localMsg.status === 'sending') {
              console.log('🔥 [合并模式] 跳过正在发送的临时消息:', localMsg.id, localMsg.content);
              return false;
            }
            console.log('🔥 [合并模式] 保留本地消息（云端未返回）:', localMsg.id, localMsg.content);
            return true;
          });
          if (retainedLocal.length > 0) {
            console.log('🔥 [合并模式] 从本地保留了', retainedLocal.length, '条消息');
            messages = messages.concat(retainedLocal);
            // 再次去重
            const mergedMap = new Map();
            messages.forEach(m => {
              if (!m) return;
              const k = m.id || `auto_${mergedMap.size}`;
              if (!mergedMap.has(k)) mergedMap.set(k, m);
            });
            messages = Array.from(mergedMap.values());
          }
          
          // 🔥 【B端最终防线】setData前再次清理A端样式系统消息
          if ((typeof that.isReceiverEnvironment === 'function')
            ? that.isReceiverEnvironment()
            : !!that.data.isFromInvite) {
            const beforeCleanCount = messages.length;
            messages = messages.filter(m => {
              if (!m || !isSystemLikeMessage(m) || typeof m.content !== 'string') return true;
              if (/^.+加入聊天$/.test(m.content) && !/^加入.+的聊天$/.test(m.content)) {
                console.log('🧹 [B端setData前清理] 移除A端样式系统消息:', m.content);
                return false;
              }
              if (m.content.includes('您创建了私密聊天')) {
                console.log('🧹 [B端setData前清理] 移除A端创建消息:', m.content);
                return false;
              }
              return true;
            });
            if (messages.length !== beforeCleanCount) {
              console.log('🧹 [B端setData前清理] 已移除', beforeCleanCount - messages.length, '条A端样式系统消息');
            }
          }
          
          // 🔥 【HOTFIX-v1.3.84】检查是否有系统消息，如果有则滚动到顶部
          const hasSystemMessage = messages.some(msg => isSystemLikeMessage(msg));
          const shouldKeepBottom = !!(that.data.inputFocus || that.data.keyboardVisible || that.data.keyboardHeight > 0);
          const scrollTarget = (hasSystemMessage && !shouldKeepBottom) ? 'sys-0' : '';
          
          console.log('🔥 [滚动控制-v1.3.84] 消息列表中是否有系统消息:', hasSystemMessage);
          if (hasSystemMessage && !shouldKeepBottom) {
            console.log('🔥 [滚动控制-v1.3.84] 将滚动到顶部系统消息 sys-0');
          } else if (hasSystemMessage && shouldKeepBottom) {
            console.log('🔥 [滚动控制-v1.3.84] 键盘可见，保持底部，不执行顶部定位');
          }
          
          // 🔥 【核心修复-v4】当 watcher 活跃时，使用非破坏性合并防止覆盖 watcher 已添加的消息
          if (that._watcherInitialized) {
            var currentLocal = that._localMessageCache || that.data.messages || [];
            var currentLocalIds = new Set(currentLocal.map(function(m) { return m && m.id; }).filter(Boolean));
            var cloudMsgIds_final = new Set(messages.map(function(m) { return m && m.id; }).filter(Boolean));
            var newFromCloud = messages.filter(function(m) { return m && m.id && !currentLocalIds.has(m.id); });
            
            // 清理：移除已销毁的本地消息和已有云端版本的临时消息
            var cleanedLocal = currentLocal.filter(function(m) {
              if (!m || !m.id) return false;
              if (m.destroyed || destroyedMessageIds.has(m.id)) return false;
              if ((m._localTemp || m.status === 'sending') && cloudMsgIds_final.has(m.id)) return false;
              if ((m._localTemp || m.status === 'sending') && messages.some(function(cm) { return cm.content === m.content && cm.senderId === m.senderId; })) return false;
              return true;
            });
            
            if (newFromCloud.length > 0) {
              messages = cleanedLocal.concat(newFromCloud);
              messages.sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
              console.log('🔥 [非破坏合并] 添加', newFromCloud.length, '条新云端消息，本地保留', cleanedLocal.length, '条');
            } else {
              messages = cleanedLocal;
            }
          }
          
          that._localMessageCache = messages;
          that.setData({
            messages: messages,
            isLoading: false,
            scrollIntoView: scrollTarget,
            hasSystemMessage: hasSystemMessage
          }, function() {
            if (!hasSystemMessage || that.data.inputFocus || that.data.keyboardVisible || that.data.keyboardHeight > 0) {
              that.scheduleScrollToBottom();
            }
          });
          
          try { that.normalizeSystemMessagesAfterLoad && that.normalizeSystemMessagesAfterLoad(); } catch (e) {}

          const currentUserOpenId = that.data.currentUser?.openId || getApp().globalData.userInfo?.openId;
          console.log('🔥 [历史消息销毁] 当前用户OpenId:', currentUserOpenId);
          
          messages.forEach((msg, index) => {
            const isFromCurrentUser = that.isMessageFromCurrentUser(msg.senderId, currentUserOpenId);
            console.log('🔥 [历史消息销毁-v1.3.84] 消息:', msg.content, '发送者:', msg.senderId, '是否自己发送:', isFromCurrentUser);
            
            // 🔥 修复：检查消息是否已经在销毁倒计时队列中
            const isAlreadyDestroying = that.destroyTimers && that.destroyTimers.has(msg.id);
            
            // 🔥 【HOTFIX-v1.3.84】处理系统消息的自动淡出
            if (msg.isSystem || msg.senderId === 'system') {
              if (isPlaceholderJoinMessage(msg.content)) {
                console.log('🔥 [系统消息淡出-v1.3.96] 跳过占位系统消息:', msg.content);
                return;
              }
              if (!isAlreadyDestroying && !msg.destroyed && !msg.destroying) {
                console.log('🔥 [系统消息淡出-v1.3.84] 为云端系统消息启动淡出:', msg.content);
                // 立即启动系统消息的淡出逻辑
                setTimeout(() => {
                  that.startSystemMessageFade(msg.id, 3, 5); // 3秒停留 + 5秒淡出
                }, 100 + index * 50); // 小延迟，确保消息渲染完成
              } else {
                console.log('🔥 [系统消息淡出-v1.3.84] 系统消息已在处理中，跳过:', msg.content);
              }
            } else if (!isFromCurrentUser &&
                !msg.destroyed && 
                !msg.destroying &&
                !isAlreadyDestroying &&
                !destroyingMessageIds.has(msg.id)) { // 🔥 避免重复启动销毁倒计时
              console.log('🔥 [历史消息销毁-v1.3.84] 为对方发送的消息自动开始销毁倒计时:', msg.content);
              setTimeout(() => {
                that.startDestroyCountdown(msg.id);
              }, 2000 + index * 500); // 错开时间，避免同时销毁
            } else if (isAlreadyDestroying) {
              console.log('🔥 [历史消息销毁-v1.3.84] 消息已在销毁倒计时中，跳过:', msg.content);
            }

            // 补偿：sendMessage 回调因竞态未能启动的倒计时
            if (that._pendingDestroyIds && that._pendingDestroyIds.has(msg.id)) {
              var hasTimer = that.destroyTimers && that.destroyTimers.has(msg.id);
              if (!hasTimer && !msg.destroying && !msg.fading && !msg.destroyed) {
                console.log('🔥 [待销毁补偿] 从 _pendingDestroyIds 启动:', msg.id);
                that._pendingDestroyIds.delete(msg.id);
                (function(mid) { setTimeout(function() { that.startDestroyCountdown(mid); }, 100); })(msg.id);
              } else {
                that._pendingDestroyIds.delete(msg.id);
              }
            }
          });
          
          // 🔥 阅后即焚检查（函数内部自带冷却期保护）
          that.checkBurnAfterReadingCleanup();
          
          // 🔧 连接检测独立于清理冷却期
          that.checkAndFixConnection(messages);
          
          // 滚动到底部
          that.scheduleScrollToBottom();
        } else {
          console.log('🔍 获取消息失败，使用模拟数据');
          // 获取失败时使用模拟数据
          that.showMockMessages();
        }
      },
      fail: err => {
        console.error('🔍 获取消息失败', err);
        // wx.hideLoading(); // 🔥 已移除对应的showLoading，无需hideLoading
        that.setData({ isLoading: false }); // 🔥 修复：重置加载状态
        
        // 显示错误提示
        wx.showToast({
          title: '获取消息失败',
          icon: 'none',
          duration: 2000
        });
        
        // 失败时使用模拟数据
        that.showMockMessages();
      }
    });
  },
  
  /**
   * 显示模拟消息数据（作为备份）
   */
  showMockMessages: function() {
    const currentUser = this.data.currentUser;
    const mockMessages = [
      {
        id: '1',
        senderId: 'other',
        isSelf: false,
        content: '你好，这是一条测试消息',
        type: 'text',
        time: '14:20',
        timeDisplay: '14:20',
        showTime: true,
        status: 'received',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: '/assets/images/default-avatar.png',
        isSystem: false
      },
      {
        id: '2',
        senderId: 'self',
        isSelf: true,
        content: '你好，很高兴认识你',
        type: 'text',
        time: '14:21',
        timeDisplay: '14:21',
        showTime: true,
        status: 'sent',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: currentUser?.avatarUrl || '/assets/images/default-avatar.png',
        isSystem: false
      },
      {
        id: '3',
        senderId: 'other',
        isSelf: false,
        content: '这条消息会自动销毁',
        type: 'text',
        time: '14:22',
        timeDisplay: '14:22',
        showTime: true,
        status: 'received',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: '/assets/images/default-avatar.png',
        isSystem: false
      }
    ];

    this.setData({
      messages: mockMessages,
      isLoading: false
    });

    // 滚动到底部
    this.scrollToBottom();
  },

  /**
   * @description 可靠滚动到底部：交替 scrollTop 大值触发重新渲染。
   *   微信小程序 scroll-view 不会在 scrollTop 值不变时重新滚动，
   *   因此每次在两个大值之间切换来保证触发。
   */
  scrollToBottom: function () {
    this.setData({
      scrollIntoView: '',
      scrollTop: this.data.scrollTop === 99999 ? 99998 : 99999
    });
  },

  /**
   * 发送消息
   * @param {string} [contentOverride] - 可选的消息内容（用于重试发送）
   */
  sendMessage: function (contentOverride) {
    // 🔥 【鲁棒性】防止重复提交：检查是否正在发送中
    if (this.data.isSending) {
      console.warn('📤 [发送消息] 正在发送中，跳过重复提交');
      return;
    }

    const isRetrySend = typeof contentOverride === 'string';
    // 🔥 严格验证事件对象结构，防止非事件对象触发默认行为
    const isEvent = !isRetrySend && 
                   contentOverride && 
                   typeof contentOverride === 'object' && 
                   (contentOverride.type || contentOverride.detail || contentOverride.currentTarget);

    const eventPayload = isEvent ? contentOverride : null;

    let eventProvidedContent = '';
    if (eventPayload) {
      const candidateValue = eventPayload.detail?.value;
      if (typeof candidateValue === 'string') {
        eventProvidedContent = candidateValue;
      } else if (typeof candidateValue === 'number') {
        eventProvidedContent = String(candidateValue);
      } else if (typeof eventPayload.currentTarget?.dataset?.value === 'string') {
        eventProvidedContent = eventPayload.currentTarget.dataset.value;
      }
    }

    const rawContent = isRetrySend
      ? contentOverride
      : (isEvent || !contentOverride ? (eventProvidedContent || this.data.inputValue) : '');
    const content = (rawContent || '').trim();
    
    if (!content) {
      if (isRetrySend) {
        console.warn('📤 [重试发送] 提供的消息内容为空，已跳过重试');
      }
      // 🔥 如果是因为内容为空返回，也要确保状态重置（虽然此时还没有设置isSending，但为了保险）
      if (this.data.isSending) {
        this.setData({ isSending: false });
      }
      return;
    }

    // 🔥 【CRITICAL-FIX-v4】记录消息发送时间，防止参与者监听器误触发
    const messageTime = Date.now();
    this.setData({
      lastMessageSentTime: messageTime,
      recentlySentMessage: true
    });
    
    // 🔥 2秒后清除标记，避免影响真正的参与者加入检测
    setTimeout(() => {
      this.setData({
        recentlySentMessage: false
      });
    }, 2000);

    console.log('📤 发送消息到chatId:', this.data.contactId, '内容:', content);
    console.log('🔥 [消息时间跟踪] 消息发送时间:', messageTime);
    
    // 🔥 【HOTFIX-v1.3.25】增强ID验证日志

    // 🔥 获取当前用户完整信息
    const app = getApp();
    let currentUser = this.data.currentUser || app.globalData.userInfo;
    const userAvatar = currentUser?.avatarUrl || app.globalData.userInfo?.avatarUrl || '/assets/images/default-avatar.png';
    
    // 🔥 验证并确保用户ID信息完整
    if (!currentUser || !currentUser.openId || currentUser.openId === 'temp_user') {
      console.warn('🔧 [发送验证] ⚠️ 用户ID缺失或无效，尝试修复');
      
      // 🔥 【HOTFIX-v1.3.46】尝试从多个来源恢复有效的用户ID
      const fallbackOpenId = app.globalData?.openId || wx.getStorageSync('openId');
      if (!fallbackOpenId) {
        console.error('🔧 [发送验证] ❌ 无法恢复openId，终止发送');
        wx.showToast({
          title: '用户信息异常，请重新登录',
          icon: 'none'
        });
        this.setData({ isSending: false });
        return;
      }
      
      const fallbackUserInfo = app.globalData?.userInfo || 
                              wx.getStorageSync('userInfo') || 
                              { nickName: 'Y.', avatarUrl: '/assets/images/default-avatar.png' };
      
      // 更新currentUser
      currentUser = {
        ...fallbackUserInfo,
        openId: fallbackOpenId
      };
      
      // 同步更新到全局和本地存储
      app.globalData.userInfo = currentUser;
      app.globalData.openId = fallbackOpenId;
      this.setData({ currentUser });
      
      console.log('🔧 [发送验证] ✅ 用户ID已修复:', fallbackOpenId);
    }
    
    if (currentUser && currentUser.openId) {
      console.log('🔧 [发送验证] 当前用户ID:', currentUser.openId);
      console.log('🔧 [发送验证] ID格式:', currentUser.openId.startsWith('local_') ? '本地生成' : '云端返回');
      console.log('🔧 [发送验证] 将发送到云函数的senderId:', currentUser.openId);
    } else {
      console.error('🔧 [发送验证] ❌ 用户ID修复失败，可能导致消息归属问题');
      console.error('🔧 [发送验证] currentUser:', currentUser);
      console.error('🔧 [发送验证] app.globalData.userInfo:', app.globalData.userInfo);
      this.setData({ isSending: false }); // 🔥 异常返回前清除发送标记
      return; // 🔥 阻止发送消息，避免senderId为undefined
    }

    // 🔥 【HOTFIX-v1.3.29】强化用户信息验证和传递
    console.log('🔥 [发送消息] 用户信息详细验证:');
    console.log('🔥 [发送消息] currentUser:', currentUser);
    console.log('🔥 [发送消息] app.globalData.userInfo:', app.globalData.userInfo);
    console.log('🔥 [发送消息] 存储中的用户信息:', wx.getStorageSync('userInfo'));
    console.log('🔥 [发送消息] 存储中的openId:', wx.getStorageSync('openId'));
    
    // 🔥 严格验证用户信息
    if (!currentUser || !currentUser.openId || !currentUser.nickName) {
      console.error('🔥 [发送消息] ❌ 用户信息不完整，可能导致发送失败');
      wx.showToast({
        title: '用户信息异常，请重新登录',
        icon: 'none'
      });
      this.setData({ isSending: false }); // 🔥 异常返回前清除发送标记
      return;
    }
    
    // 🔥 确保用户信息准确性
    const validatedUserInfo = {
      nickName: currentUser.nickName,
      avatarUrl: currentUser.avatarUrl || '/assets/images/default-avatar.png'
    };
    
    console.log('🔥 [发送消息] 验证后的用户信息:', validatedUserInfo);

    // 创建新消息对象
    const nowTs = Date.now();
    const newMessage = {
      id: nowTs.toString(),
      senderId: currentUser?.openId,
      isSelf: true,
      content: content,
      type: 'text',
      time: this.formatTime(new Date()),
      timeDisplay: this.formatTime(new Date()),
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

    // 添加到消息列表
    const messages = (this._localMessageCache || this.data.messages).concat(newMessage);
    this._localMessageCache = messages;
    const nextState = {
      messages: messages,
      inputFocus: true,
      keyboardVisible: true,
      keepKeyboardOpenOnSend: true,
      isSending: true
    };
    
    if (!isRetrySend) {
      nextState.inputValue = '';
    }
    
    var self = this;
    this.setData(nextState, function() {
      wx.nextTick(function() { self.scrollToBottom(); });
    });

    // 🔥 使用云函数发送消息 - 传递chatId而不是receiverId
    wx.cloud.callFunction({
      name: 'sendMessage',
      data: {
        chatId: this.data.contactId, // 🔥 使用chatId参数
        content: content,
        type: 'text',
        destroyTimeout: this.data.destroyTimeout,
        senderId: currentUser.openId, // 🔥 修复：明确传递发送方ID
        currentUserInfo: validatedUserInfo // 🔥 【HOTFIX-v1.3.29】传递验证后的用户信息
      },
      success: res => {
        console.log('📤 发送消息成功', res);
        
        // 🔥 发送完成后清除发送标记
        this.setData({ isSending: false });

        if (res.result && res.result.success) {
          // 更新本地消息状态为已发送
          const updatedMessages = this.data.messages.map(msg => {
            if (msg.id === newMessage.id) {
              return { 
                ...msg, 
                status: 'sent',
                  id: res.result.messageId || newMessage.id // 使用云端返回的消息ID，若不存在则保留本地ID
              };
            }
            return msg;
          });

          this.setData({
            messages: updatedMessages
          }, () => {
            // 🔥 【HOTFIX-v1.3.88】确保使用更新后的消息ID
            console.log('📤 消息发送成功，自动开始销毁倒计时');
            
            // 🔥 【关键修复】在setData回调完成后，再次确认消息ID
            const finalMessageId = res.result.messageId || newMessage.id;
            console.log('🔥 [销毁倒计时] 准备启动，消息ID:', finalMessageId);
            
            /**
             * @description 延迟启动销毁倒计时；若消息暂未出现在列表中（轮询竞态），
             *   注册到 _pendingDestroyIds，由下一次 fetchMessages 补偿启动。
             */
            var _tryStart = (function(fmId, retries) {
              var ctx = this;
              return function attempt() {
                var exists = ctx.data.messages.some(function(msg) { return msg.id === fmId; });
                if (exists) {
                  console.log('🔥 [销毁倒计时] 消息已找到，启动销毁:', fmId);
                  ctx.startDestroyCountdown(fmId);
                } else if (retries > 0) {
                  retries--;
                  setTimeout(attempt, 600);
                } else {
                  console.log('🔥 [销毁倒计时] 消息暂未出现，注册到待销毁队列:', fmId);
                  if (!ctx._pendingDestroyIds) ctx._pendingDestroyIds = new Set();
                  ctx._pendingDestroyIds.add(fmId);
                }
              };
            }).call(this, finalMessageId, 2);
            setTimeout(_tryStart, 300);
          });
        } else {
          // 发送失败
          this.showMessageError(newMessage.id);
        }
      },
      fail: err => {
        console.error('📤 发送消息失败', err);
        // 🔥 发送失败也要清除发送标记
        this.setData({ isSending: false });
        // 发送失败
        this.showMessageError(newMessage.id);
      }
    });
  },
  
  /**
   * 显示消息发送错误
   */
  showMessageError: function(messageId) {
    const updatedMessages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return { ...msg, status: 'failed' };
      }
      return msg;
    });

    this.setData({
      messages: updatedMessages
    });
    
    // 🔥 修复：显示重试弹窗而不是简单的Toast
    const failedMessage = updatedMessages.find(msg => msg.id === messageId);
    
    wx.showModal({
      title: '发送失败',
      content: '消息发送失败，是否重新发送？',
      confirmText: '重试',
      cancelText: '取消',
      confirmColor: '#007AFF',
      success: (res) => {
        if (res.confirm) {
          console.log('用户选择重试发送消息:', messageId);
          
          // 重新发送失败的消息
          if (failedMessage && failedMessage.content) {
            // 移除失败的消息
            const filteredMessages = this.data.messages.filter(msg => msg.id !== messageId);
            this._localMessageCache = filteredMessages;
            this.setData({ messages: filteredMessages });
            
            this.sendMessage(failedMessage.content);
          }
        } else {
          console.log('用户取消重试发送');
          
          // 显示保存提示
          wx.showModal({
            title: '消息保存',
            content: '消息已保存到草稿，稍后可在网络恢复时重新发送',
            showCancel: false,
            confirmText: '知道了'
          });
        }
      }
    });
  },




  /**
   * 格式化时间
   * @param {Date} date - 日期对象
   * @returns {String} 格式化的时间字符串
   */
  formatTime: function (date) {
    return ChatHelpers.formatTime(date);
  },




  /**
   * 🔥 【HOTFIX-v1.3.44e】智能昵称匹配方法
   * @param {string} name1 - 第一个昵称
   * @param {string} name2 - 第二个昵称
   * @returns {boolean} 是否匹配
   */
  smartNicknameMatch: function(name1, name2) {
    return ChatHelpers.smartNicknameMatch(name1, name2);
  },
  

  /**
   * 尝试创建聊天（备选方案）
   * @param {Boolean} [isInitial=false] - 是否是初始创建尝试
   */
  tryCreateChat: function(isInitial) {
    console.log('[邀请流程] 尝试主动创建聊天...');
    
    // 更新状态文本
    this.setData({
      chatCreationStatus: isInitial ? '正在创建聊天...' : '正在尝试创建聊天...'
    });
    
    // 调用云函数创建聊天
    wx.cloud.callFunction({
      name: 'createChat',
      data: {
        chatId: this.data.contactId,
        message: `${getApp().globalData.userInfo.nickName || '用户'}发起了聊天` 
      },
      success: res => {
        console.log('[邀请流程] 创建聊天结果:', res);
        
        if (res.result && res.result.success) {
          clearInterval(this.chatCreationTimer);
          
          this.setData({
            isCreatingChat: false,
            chatCreationStatus: ''
          });
          
          // 获取聊天记录
          this.fetchMessages();
          
          // 添加系统消息
          this.addSystemMessage('聊天已成功创建，可以开始交流了');
        } else {
          // 创建失败，显示错误消息
          this.setData({
            chatCreationStatus: '创建聊天失败，继续重试...'
          });
          
          // 如果是初始创建尝试失败，直接加载消息界面而不是无限等待
          if (isInitial) {
            console.log('[邀请流程] 初始创建尝试失败，但继续检查...');
            // 继续让定时器检查，不强制退出
          }
        }
      },
      fail: err => {
        console.error('[邀请流程] 创建聊天失败:', err);
        
        // 创建失败，显示错误消息
        this.setData({
          chatCreationStatus: '创建聊天失败，继续重试...'
        });
        
        // 如果是初始创建尝试失败，直接加载消息界面而不是无限等待
        if (isInitial) {
          console.log('[邀请流程] 初始创建尝试失败，但继续检查...');
          // 继续让定时器检查，不强制退出
        }
      }
    });
  },

  /**
   * 输入框内容变化处理
   */
  onInputChange: function(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  /**
   * 返回上一页
   */


  /**
   * 显示聊天菜单
   */
  showChatMenu: function() {
    console.log('🔧 [调试] 菜单按钮被点击！');
    
    wx.showActionSheet({
      itemList: ['🔗 接收方标题测试', '🔄 切换到Y.身份', '🔄 切换到向冬身份', '🆘 紧急身份修复', '🔧 专项昵称修复', '更多功能...'],
      success: (res) => {
        console.log('🔧 [调试] 菜单项被选择:', res.tapIndex);
        switch(res.tapIndex) {
          case 0: // 接收方标题测试
            this.testReceiverTitle();
            break;
          case 1: // 切换到Y.身份
            this.testAsReceiver();
            break;
          case 2: // 切换到向冬身份
            this.testAsSender();
            break;
          case 3: // 紧急身份修复
            this.emergencyFixUserIdentity();
            break;
          case 4: // 专项昵称修复
            this.fixSpecificUserNickname();
            break;
          case 5: // 更多功能
            this.showMoreMenu();
            break;
        }
      },
      fail: (err) => {
        console.error('🔧 [调试] 菜单显示失败:', err);
      }
    });
  },

  /**
   * 显示更多菜单功能
   */
  showMoreMenu: function() {
    wx.showActionSheet({
      itemList: ['🔧 清理重复参与者', '🔗 手动加入现有聊天', '强制修复昵称', '清空聊天记录', '返回主菜单'],
      success: (res) => {
        console.log('🔧 [调试] 更多菜单项被选择:', res.tapIndex);
        switch(res.tapIndex) {
          case 0: // 清理重复参与者
            this.cleanupDuplicateParticipants();
            break;
          case 1: // 手动加入现有聊天
            this.manualJoinExistingChat();
            break;
          case 2: // 强制修复昵称
            this.forceFixSpecificUserNicknames();
            break;
          case 3: // 清空聊天记录
            this.clearChatHistory();
            break;
          case 4: // 返回主菜单
            this.showChatMenu();
            break;
        }
      },
      fail: (err) => {
        console.error('🔧 [调试] 更多菜单显示失败:', err);
      }
    });
  },

  /**
   * 清空聊天记录
   */
  clearChatHistory: function() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空聊天记录吗？此操作不可恢复。',
      confirmText: '清空',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this._localMessageCache = [];
          this.setData({
            messages: []
          });
          wx.showToast({
            title: '聊天记录已清空',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 🔥 消息点击处理（阅后即焚触发）
   */
  onMessageTap: function(e) {
    var msgType = e.currentTarget.dataset.msgtype;
    if (msgType === 'voice') {
      this.playVoice(e);
      return;
    }

    const messageId = e.currentTarget.dataset.msgid;
    console.log('🔥 [消息点击] 用户点击消息:', messageId);
    
    const messages = this.data.messages;
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    const message = messages[messageIndex];
    
    if (!message) {
      console.log('🔥 [消息点击] 未找到消息');
      return;
    }
    
    const currentUserOpenId = this.data.currentUser?.openId;
    
    // 🔥 只有对方发送的消息才触发阅后即焚
    if (message.senderId !== currentUserOpenId && 
        message.senderId !== 'system' && 
        !message.isDestroyed && 
        !message.isDestroying) {
      
      console.log('🔥 [消息点击] 触发阅后即焚:', message.content);
      
      // 🔥 检查是否双方都在线
      const { onlineUsers, participants } = this.data;
      const participantIds = participants.map(p => p.openId || p.id);
      const allOnline = participantIds.every(id => onlineUsers.includes(id)) && participantIds.length >= 2;
      
      if (allOnline) {
        console.log('🔥 [消息点击] 双方都在线，立即开始销毁倒计时');
        this.markMessageAsReadAndDestroy(messageId, messageIndex);
      } else {
        console.log('🔥 [消息点击] 非双方在线模式，使用传统阅后即焚');
        // 传统模式：显示消息内容后开始倒计时
        wx.showModal({
          title: '阅后即焚消息',
          content: message.content,
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            // 用户确认查看后开始销毁倒计时
            this.markMessageAsReadAndDestroy(messageId, messageIndex);
          }
        });
      }
    }
  },

  /**
   * 长按消息处理
   */
  onMessageLongTap: function(e) {
    const { msgid } = e.currentTarget.dataset;
    
    wx.showActionSheet({
      itemList: ['复制', '转发', '销毁'],
      success: (res) => {
        const { messages } = this.data;
        const messageIndex = messages.findIndex(msg => msg.id === msgid);
        
        if (messageIndex === -1) return;
        
        const message = messages[messageIndex];
        
        switch(res.tapIndex) {
          case 0: // 复制
            wx.setClipboardData({
              data: message.content,
              success: () => {
                wx.showToast({
                  title: '复制成功',
                  icon: 'success'
                });
              }
            });
            break;
          case 1: // 转发
            wx.showToast({
              title: '转发功能开发中',
              icon: 'none'
            });
            break;
          case 2: // 销毁
            this.destroyMessage(msgid);
            break;
        }
      }
    });
  },

  /**
   * 打开表情选择器
   */
  openEmojiPicker: function() {
    // 🔥 直接聚焦输入框，方便用户切换系统表情页
    try {
      this.setData({
        inputFocus: true,
        keyboardVisible: true,
        keepKeyboardOpenOnSend: true,
        scrollIntoView: '',
        scrollTop: this.data.scrollTop === 99999 ? 99998 : 99999
      });
    } catch (e) {
      wx.showToast({
        title: '请手动点击输入框切换表情',
        icon: 'none'
      });
    }
  },

  /**
   * 打开更多功能
   */
  openMoreFunctions: function() {
    wx.showActionSheet({
      itemList: ['发送图片', '语音通话', '视频通话', '销毁设置'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0: // 发送图片
            wx.showToast({
              title: '图片发送功能开发中',
              icon: 'none'
            });
            break;
          case 1: // 语音通话
            wx.showToast({
              title: '语音通话功能开发中',
              icon: 'none'
            });
            break;
          case 2: // 视频通话
            wx.showToast({
              title: '视频通话功能开发中',
              icon: 'none'
            });
            break;
          case 3: // 销毁设置
            wx.showToast({
              title: '销毁设置功能开发中',
              icon: 'none'
            });
            break;
        }
      }
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    console.log('[邀请流程] 聊天页面显示');
    
    // 🔥 页面恢复时强制清理可能残留的系统弹层/遮罩
    try { wx.hideLoading(); } catch (_e) {}
    try { wx.hideToast(); } catch (_e) {}

    // 🔥 重置全部 UI 状态，keyboardVisible=false 使内联 height 不生效，容器回到 height:100%
    var winH = 700;
    try {
      var wInfo = wx.getWindowInfo();
      if (wInfo && wInfo.windowHeight > 0) winH = wInfo.windowHeight;
    } catch (_e) {}
    if (!winH || winH <= 0) winH = (this._layoutInfo && this._layoutInfo.windowHeight) || this.data.windowHeight || 700;
    this.setData({
      isPageActive: true,
      lastActivityTime: Date.now(),
      containerHeight: winH,
      keyboardHeight: 0,
      keyboardVisible: false,
      inputFocus: false,
      isCreatingChat: false,
      chatCreationStatus: ''
    });
    console.log('🔥 [onShow] 页面恢复, keyboardVisible=false, containerHeight:', winH);

    // 🔥 延迟二次保障：200ms 后再次强制重置，覆盖可能的异步竞态
    var self = this;
    wx.nextTick(function() {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    });
    setTimeout(function() {
      if (self.data.keyboardVisible || self.data.keyboardHeight > 0) {
        console.log('🔥 [onShow-fallback] 延迟重置 keyboardVisible');
        self.setData({ keyboardVisible: false, keyboardHeight: 0, containerHeight: winH });
      }
    }, 200);

    // 🔥 重新注册键盘监听器，确保当前页面实例能收到键盘事件
    this._registerKeyboardListener();
    
    // 🔥 【阅后即焚增强】重新进入页面时，启动在线状态监听
    this.startOnlineStatusMonitor();
    
    // 🔥 【阅后即焚增强】检查并处理离线期间的消息
    this.processOfflineMessages();
    
    // 🚨 【B端系统消息强制清理】页面显示时立即清理A端样式系统消息
    if (this.data.isFromInvite) {
      const messages = this.data.messages || [];
      const beforeCount = messages.length;
      const cleanedMessages = messages.filter(m => {
        if (!m || !m.isSystem || typeof m.content !== 'string') return true;
        // 移除A端样式"XX加入聊天"(但保留B端样式"加入XX的聊天")
        if (/^.+加入聊天$/.test(m.content) && !/^加入.+的聊天$/.test(m.content)) {
          console.log('🧹 [B端onShow清理] 移除A端样式系统消息:', m.content);
          return false;
        }
        // 移除A端创建消息
        if (m.content.includes('您创建了私密聊天')) {
          console.log('🧹 [B端onShow清理] 移除A端创建消息:', m.content);
          return false;
        }
        return true;
      });
      if (cleanedMessages.length !== beforeCount) {
        this._localMessageCache = cleanedMessages;
        this.setData({ messages: cleanedMessages }, () => {
          if (this.data.inputFocus || this.data.keyboardVisible || this.data.keyboardHeight > 0) {
            this.scheduleScrollToBottom();
          }
        });
        console.log('🧹 [B端onShow清理] 已移除', beforeCount - cleanedMessages.length, '条A端样式系统消息');
      }
    }
    
    // 🚨 【强化热修复】页面显示时运行多项检查和修复
    setTimeout(() => {
      // 1. 检查并清除连接状态
      this.checkAndClearConnectionStatus();
      
      // 2. 🆘 【强化修复】检查参与者数量并强制修复
      if (this.data.participants && this.data.participants.length > 2) {
        console.log('🔥 [页面显示] 检测到严重的参与者数量异常，触发强制修复');
        this.forceFixParticipantDuplicates();
      } else {
        // 即使数量正常，也检查是否有重复ID
        const participants = this.data.participants || [];
        const seenIds = new Set();
        let hasDuplicates = false;
        
        for (const p of participants) {
          const id = p.openId || p.id;
          if (id && seenIds.has(id)) {
            hasDuplicates = true;
            break;
          }
          if (id) seenIds.add(id);
        }
        
        if (hasDuplicates) {
          console.log('🔥 [页面显示] 检测到隐藏的参与者重复，触发强制修复');
          this.forceFixParticipantDuplicates();
        } else {
          // 无重复时进行标准去重
          this.deduplicateParticipants();
        }
      }
      
      // 3. 检查消息同步
      this.checkAndFixMessageSync();
      
      // 4. 检查标题显示
      if (this.data.dynamicTitle && this.data.dynamicTitle.includes('群聊（')) {
        console.log('🔥 [页面显示] 检测到群聊标题，可能需要修复');
        setTimeout(() => {
          this.updateDynamicTitleWithRealNames();
        }, 500);
      }
    }, 1000);
    
    // 🔥 页面显示时启动实时消息监听（增强版）
    this.startMessageListener();
    
    // 🔧 【消息收发修复】同时启动轮询备份，确保双方都能收到消息
    setTimeout(() => {
      this.startPollingMessages();
    }, 1000);
    
    // 🔧 页面显示时检查并修复昵称显示问题
    setTimeout(() => {
      this.checkAndFixNicknames();
    }, 2000);
    
    // 🔥 【同构UI模式】禁用B端专用显示修复，避免与统一键盘/滚动状态机冲突
    if (!this.isHomogeneousUiMode()) {
      setTimeout(() => {
        this.fixBEndDisplayImmediately();
      }, 1000);
    }
    
    // 🧪 【开发调试】添加测试方法
    if (DEBUG_FLAGS.ENABLE_TEST_APIS) {
      this.addTestMethods();
    }
  },

  /**
   * 🔥 启动实时消息监听
   */
  startMessageListener: function() {
    const chatId = this.data.contactId;
    if (!chatId) return;
    
    console.log('🔔 启动实时消息监听，chatId:', chatId);
    
    try {
      // 如果已有监听器，先关闭
      if (this.messageWatcher) {
        this.messageWatcher.close();
        this.messageWatcher = null;
      }
      
      const db = wx.cloud.database();
      this.messageWatcher = db.collection('messages')
        .where({
          chatId: chatId
        })
        .orderBy('sendTime', 'desc')
        .limit(50)  // 🔥 增加监听范围，确保不遗漏消息
        .watch({
          onChange: snapshot => {
            console.log('🔔 监听到消息变化:', snapshot);
            
            if (snapshot.type === 'init') {
              console.log('🔔 消息监听器初始化');
              this._watcherInitialized = true;
              return;
            }
            
            // 🔥 检查是否有新消息
            if (snapshot.docChanges && snapshot.docChanges.length > 0) {
              const changes = snapshot.docChanges;
              let hasNewMessage = false;
              
              // 🔧 【消息收发修复】使用页面当前用户OpenId，而不是全局数据
              const currentUserOpenId = this.data.currentUser?.openId || getApp().globalData.userInfo?.openId || getApp().globalData.openId;
              console.log('🔔 [消息监听] 当前用户OpenId:', currentUserOpenId);
              
              changes.forEach(change => {
                if (change.queueType === 'enqueue') {
                  const newDoc = change.doc;
                  console.log('🔔 检测到新消息:', newDoc);
                  console.log('🔔 [消息检测] 消息发送者:', newDoc.senderId, '当前用户:', currentUserOpenId);
                  
                  // 🔥 【HOTFIX-v1.3.68】B端系统消息过滤 - B端不应该接收A端的系统消息
                  if (this.data.isFromInvite && newDoc.isSystem && newDoc.content) {
                    // 🔥 【HOTFIX-v1.3.68】只过滤A端格式，保留B端格式
                    const shouldFilterForBSide = 
                      newDoc.content.includes('您创建了私密聊天') ||
                      newDoc.content.includes('可点击右上角菜单分享链接邀请朋友加入') ||
                      newDoc.content.includes('私密聊天已创建') ||
                      newDoc.content.includes('分享链接邀请朋友') ||
                      (newDoc.content.includes('创建') && newDoc.content.includes('聊天')) ||
                      (/^.+加入聊天$/.test(newDoc.content) && !/^加入.+的聊天$/.test(newDoc.content)); // 只过滤A端格式"XX加入聊天"
                    
                    if (shouldFilterForBSide) {
                      console.log('🔥 [B端过滤-v1.3.68] B端过滤A端系统消息:', newDoc.content);
                      return; // 跳过此消息
                    }
                  }
                  
                  // 🔥 【HOTFIX-v1.3.23】增强身份匹配逻辑，支持不同ID格式
                  const isMyMessage = this.isMessageFromCurrentUser(newDoc.senderId, currentUserOpenId);
                  console.log('🔥 [ID匹配] 消息归属判断结果:', isMyMessage);
                  
                  // 🔥 B端容错：若身份误判为自己（同一微信号测试），也要视为新消息
                  if (!isMyMessage || this.data.isFromInvite) {
                    console.log('🔔 检测到对方发送的新消息，准备刷新');
                    hasNewMessage = true;
                  } else {
                    console.log('🔔 [消息检测] 这是自己发送的消息，跳过处理');
                  }
                }
              });
              
              // 🔥 【调试】始终打印身份判断信息，便于诊断
              const currentUser = this.data.currentUser;
              const isFromInvite = this.data.isFromInvite;
              const isSender = !isFromInvite; // 🔥 修复：使用更准确的身份判断
              
              console.log('🔔 [身份判断] isFromInvite:', isFromInvite, 'isSender:', isSender, 'hasNewMessage:', hasNewMessage);
              
              if (hasNewMessage) {
                console.log('🔔 刷新聊天记录以显示新消息');
                
                // 🔥 【FIX-v2.1】不再强制调用fetchMessages替换整个消息列表
                // 直接通过下方 direct-add 逻辑逐条追加，轮询(5s)提供兜底同步
                // 旧逻辑会导致B端多条消息被替换而非逐条显示
                this._watcherDirectAddSuccess = false;
                
                              // 🔥 【HOTFIX-v1.3.25】智能建立用户映射关系和实时ID检测
              if (this.smartEstablishMapping && typeof this.smartEstablishMapping === 'function') {
              this.smartEstablishMapping();
              }
              
              // 🔥 【URGENT-FIX】修复作用域错误，确保消息监听正常工作
              try {
                if (snapshot.docChanges && snapshot.docChanges.length > 0) {
                  snapshot.docChanges.forEach(change => {
                    var ct = change.dataType || change.type || '';
                    if (ct !== 'add' && ct !== 'added' && ct !== 'init' && ct !== '') return;
                    var msgData;
                    if (change.doc && typeof change.doc.data === 'function') {
                      msgData = change.doc.data();
                    } else if (change.doc && change.doc._data) {
                      msgData = change.doc._data;
                    } else if (change.doc) {
                      msgData = change.doc;
                    } else { return; }
                    var senderId = msgData && msgData.senderId;
                    var currentUserId = this.data.currentUser?.openId;
                    
                    if (senderId && currentUserId && senderId !== currentUserId) {
                      console.log('🔥 [实时映射] 检测到新消息 - 发送者:', senderId, '当前用户:', currentUserId);
                      if (this.shouldEstablishMapping && typeof this.shouldEstablishMapping === 'function' && this.shouldEstablishMapping(senderId, currentUserId)) {
                        console.log('🔥 [实时映射] 🚨 立即建立映射关系');
                        if (this.establishUserMapping && typeof this.establishUserMapping === 'function') {
                          this.establishUserMapping(currentUserId, senderId, this.data.currentUser.nickName);
                        }
                      }
                    }
                  });
                }
              } catch (mappingErr) {
                console.warn('🔥 [实时映射] 映射处理异常，不影响消息接收:', mappingErr);
              }
              
              if (hasNewMessage) {
                  console.log('🔔 [智能消息处理] 检测到新消息，直接添加到界面（双端通用）');
                  
                  if (snapshot.docChanges && snapshot.docChanges.length > 0) {
                    var currentUserInfo = this.data.currentUser;
                    var currentUserId = currentUserInfo?.openId;
                    var batchNewMessages = [];
                    var existingMessages = this._localMessageCache || this.data.messages || [];
                    var existingIdSet = new Set();
                    existingMessages.forEach(function(m) {
                      if (!m) return;
                      if (m.id) existingIdSet.add(m.id);
                      if (m._id) existingIdSet.add(m._id);
                    });
                    var bSide = this.data.isFromInvite === true;
                    var _self = this;

                    snapshot.docChanges.forEach(function(change) {
                      var ct = change.dataType || change.type || '';
                      if (ct === 'remove' || ct === 'update' || ct === 'replace') return;
                      var newMessage;
                      if (change.doc && typeof change.doc.data === 'function') {
                        newMessage = change.doc.data();
                      } else if (change.doc && change.doc._data) {
                        newMessage = change.doc._data;
                      } else if (change.doc) {
                        newMessage = change.doc;
                      } else if (typeof change.data === 'function') {
                        newMessage = change.data();
                      } else { return; }

                      var resolvedId = (newMessage && (newMessage._id || newMessage.id))
                        || (change.doc && (change.doc._id || change.doc.id))
                        || change.id
                        || '';
                      if (!resolvedId) {
                        console.warn('🔔 [新消息处理] 跳过无ID消息，避免列表key冲突导致覆盖');
                        return;
                      }
                      if (existingIdSet.has(resolvedId)) return;

                      var isMyMessageStrict = Boolean(currentUserId) && newMessage.senderId === currentUserId;
                      if (isMyMessageStrict) return;

                      var rawContent = (newMessage && newMessage.content) || '';
                      if (isPlaceholderJoinMessage(rawContent)) {
                        return;
                      }
                      if (bSide) {
                        var isASideSystem = (
                          rawContent.includes('您创建了私密聊天') ||
                          rawContent.includes('可点击右上角菜单分享链接邀请朋友加入') ||
                          rawContent.includes('私密聊天已创建') ||
                          rawContent.includes('分享链接邀请朋友') ||
                          (rawContent.includes('创建') && rawContent.includes('聊天')) ||
                          (/^.+加入聊天$/.test(rawContent) && !/^加入.+的聊天$/.test(rawContent))
                        );
                        if (isASideSystem) return;
                      }

                      var normalizedTimestamp = Date.now();
                      var rawTs = newMessage.timestamp || newMessage.sendTime || newMessage._createTime;
                      if (typeof rawTs === 'number') {
                        normalizedTimestamp = rawTs;
                      } else if (rawTs && rawTs._date) {
                        var parsedDate = new Date(rawTs._date).getTime();
                        if (!isNaN(parsedDate)) normalizedTimestamp = parsedDate;
                      } else if (rawTs && rawTs.getTime) {
                        var parsedObjDate = rawTs.getTime();
                        if (!isNaN(parsedObjDate)) normalizedTimestamp = parsedObjDate;
                      } else if (rawTs) {
                        var parsedStrDate = new Date(rawTs).getTime();
                        if (!isNaN(parsedStrDate)) normalizedTimestamp = parsedStrDate;
                      }

                      var systemLike = isSystemLikeMessage(newMessage);
                      batchNewMessages.push({
                        id: resolvedId,
                        senderId: newMessage.senderId,
                        content: newMessage.content,
                        timestamp: normalizedTimestamp,
                        sendTime: normalizedTimestamp,
                        isSelf: isMyMessageStrict,
                        type: newMessage.type || (systemLike ? 'system' : newMessage.type),
                        duration: newMessage.duration || 0,
                        isSystem: systemLike,
                        isSystemMessage: systemLike,
                        destroyTimeout: newMessage.destroyTimeout || _self.data.destroyTimeout || DEFAULT_DESTROY_TIMEOUT,
                        isDestroyed: newMessage.destroyed || false
                      });
                      existingIdSet.add(resolvedId);
                    });

                    if (batchNewMessages.length > 0) {
                      var merged = existingMessages.concat(batchNewMessages);
                      this._localMessageCache = merged;
                      this.setData({ messages: merged }, () => {
                        this.scheduleScrollToBottom();
                      });
                      this._watcherDirectAddSuccess = true;
                      console.log('🔔 [新消息处理] ✅ 批量添加', batchNewMessages.length, '条新消息');

                      if (!this._watcherPendingIds) this._watcherPendingIds = new Set();
                      var ctx = this;
                      batchNewMessages.forEach(function(fm) {
                        if (!fm.isSystem && fm.senderId !== 'system') {
                          ctx._watcherPendingIds.add(fm.id);
                          setTimeout(function() {
                            ctx._watcherPendingIds && ctx._watcherPendingIds.delete(fm.id);
                            ctx.startDestroyCountdown(fm.id);
                          }, 150);
                        }
                      });
                    }
                  } else {
                    console.log('🔔 [调试] snapshot.docChanges 为空，尝试备用方案');
                    
                    // 🔥 备用方案：直接从 snapshot.docs 获取最新消息（批量处理）
                    if (snapshot.docs && snapshot.docs.length > 0) {
                      var fbExisting = this._localMessageCache || this.data.messages || [];
                      var fbIdSet = new Set();
                      fbExisting.forEach(function(msg) {
                        if (!msg) return;
                        if (msg.id) fbIdSet.add(msg.id);
                        if (msg._id) fbIdSet.add(msg._id);
                      });
                      var fbBatch = [];
                      var fbSelf = this;
                      var fbIsB = this.data.isFromInvite === true;

                      snapshot.docs.forEach(function(doc) {
                        var message;
                        if (typeof doc.data === 'function') {
                          message = doc.data();
                        } else if (doc._data) {
                          message = doc._data;
                        } else {
                          message = doc;
                        }

                        var fbMessageId = (message && (message._id || message.id))
                          || (doc && (doc._id || doc.id))
                          || '';
                        if (!fbMessageId) {
                          console.warn('🔔 [备用方案] 跳过无ID消息，避免列表key冲突导致覆盖');
                          return;
                        }
                        if (fbIdSet.has(fbMessageId)) return;

                        var isMyMsg = fbSelf.isMessageFromCurrentUser(message.senderId, currentUser?.openId);
                        if (isMyMsg) return;

                        var mc = (message && message.content) || '';
                        if (isPlaceholderJoinMessage(mc)) {
                          return;
                        }
                        if (fbIsB) {
                          var aSys = (
                            mc.includes('您创建了私密聊天') ||
                            mc.includes('可点击右上角菜单分享链接邀请朋友加入') ||
                            mc.includes('私密聊天已创建') ||
                            mc.includes('分享链接邀请朋友') ||
                            (mc.includes('创建') && mc.includes('聊天')) ||
                            (/^.+加入聊天$/.test(mc) && !/^加入.+的聊天$/.test(mc))
                          );
                          if (aSys) return;
                        }

                        var fbTimestamp = Date.now();
                        var fbRawTs = message.timestamp || message.sendTime || message._createTime;
                        if (typeof fbRawTs === 'number') {
                          fbTimestamp = fbRawTs;
                        } else if (fbRawTs && fbRawTs._date) {
                          var fbParsedDate = new Date(fbRawTs._date).getTime();
                          if (!isNaN(fbParsedDate)) fbTimestamp = fbParsedDate;
                        } else if (fbRawTs && fbRawTs.getTime) {
                          var fbParsedObjDate = fbRawTs.getTime();
                          if (!isNaN(fbParsedObjDate)) fbTimestamp = fbParsedObjDate;
                        } else if (fbRawTs) {
                          var fbParsedStrDate = new Date(fbRawTs).getTime();
                          if (!isNaN(fbParsedStrDate)) fbTimestamp = fbParsedStrDate;
                        }

                        var sysLike = isSystemLikeMessage(message);
                        fbBatch.push({
                          id: fbMessageId,
                          senderId: message.senderId,
                          content: message.content,
                          timestamp: fbTimestamp,
                          sendTime: fbTimestamp,
                          isSelf: isMyMsg,
                          type: message.type || (sysLike ? 'system' : message.type),
                          duration: message.duration || 0,
                          isSystem: sysLike,
                          isSystemMessage: sysLike,
                          destroyTimeout: message.destroyTimeout || fbSelf.data.destroyTimeout || DEFAULT_DESTROY_TIMEOUT,
                          isDestroyed: message.destroyed || false
                        });
                        fbIdSet.add(fbMessageId);
                      });

                      if (fbBatch.length > 0) {
                        var fbMerged = fbExisting.concat(fbBatch);
                        this._localMessageCache = fbMerged;
                        this.setData({ messages: fbMerged }, () => {
                          this.scheduleScrollToBottom();
                        });
                        this._watcherDirectAddSuccess = true;
                        console.log('🔔 [备用方案] ✅ 批量添加', fbBatch.length, '条新消息');

                        if (!this._watcherPendingIds) this._watcherPendingIds = new Set();
                        var fbCtx = this;
                        fbBatch.forEach(function(fm) {
                          if (!fm.isSystem && fm.senderId !== 'system') {
                            fbCtx._watcherPendingIds.add(fm.id);
                            setTimeout(function() {
                              fbCtx._watcherPendingIds && fbCtx._watcherPendingIds.delete(fm.id);
                              fbCtx.startDestroyCountdown(fm.id);
                            }, 150);
                          }
                        });
                      }
                    }
                  }
                  
                  // 🔥 【FIX-v2.1】仅当 direct-add 完全失败时，才 fallback 到 fetchMessages
                  if (!this._watcherDirectAddSuccess) {
                    console.log('🔔 [消息同步] direct-add未成功，使用fetchMessages兜底');
                    setTimeout(() => {
                      this.fetchMessages();
                      console.log('🔔 [消息同步] 兜底fetchMessages完成');
                    }, 500);
                  }
                  
                  return;
                }
                
                // 🔥 【HOTFIX-v1.3.38】接收方避免重新获取全部消息，防止已销毁消息重新出现
                console.log('🔔 [接收方处理] 检测到新消息，但不重新获取全部消息以保护已销毁的消息');
                // 不调用 fetchMessages() 避免已销毁消息重新出现
              }
            }
          },
          onError: err => {
            console.error('🔔 消息监听出错:', err);
            this._watcherInitialized = false;
            
            setTimeout(() => {
              console.log('🔔 尝试重新启动消息监听');
              this.startMessageListener();
            }, 3000);
          }
        });
        
      console.log('🔔 实时消息监听启动成功');
    } catch (err) {
      console.error('🔔 设置消息监听失败:', err);
      
      // 🔥 启动失败时，使用轮询作为备用方案
      this.startPollingMessages();
    }
  },

  /**
   * 🔥 轮询消息（作为实时监听的备用方案）
   */
  startPollingMessages: function() {
    console.log('🔔 启动消息轮询作为备用方案');
    
    // 🔥 如果正在阅后即焚清理中，跳过轮询启动
    if (this.data.isBurnAfterReadingCleaning) {
      console.log('🔔 阅后即焚清理中，跳过轮询启动');
      return;
    }
    
    // 清除可能存在的旧轮询
    if (this.messagePollingTimer) {
      clearInterval(this.messagePollingTimer);
    }
    
    // 🔧 【消息收发修复】每15秒轮询一次新消息，避免过于频繁
    this.messagePollingTimer = setInterval(() => {
      // 🔥 在轮询前检查是否正在清理
      if (this.data.isBurnAfterReadingCleaning) {
        console.log('🔔 阅后即焚清理中，跳过本次轮询');
        return;
      }
      
      // 轮询不再被清理冷却期阻断，确保对方消息始终可达
      const currentTime = Date.now();
      
      // 🔥 【智能轮询优化】避免不必要的重复调用（缩短冷却期以提高消息到达率）
      const lastFetchTime = this.lastFetchTime || 0;
      if (currentTime - lastFetchTime < 4000) {
        console.log('🔔 [智能轮询] 距离上次获取消息不足4秒，跳过轮询避免频繁调用');
        return;
      }
      
      // 🔥 B端轮询不再跳过，确保消息始终可达（移除30秒优化，防止B端漏收消息）
      
      // 🔥 【HOTFIX-v1.3.44】修复轮询身份判断逻辑 - 使用实例属性作为fallback
      const currentUser = this.data.currentUser || this.actualCurrentUser;
      const participants = this.data.participants || [];
      let isFromInvite = this.data.isFromInvite;
      
      // 🔥 如果data中的isFromInvite是undefined，使用实例属性作为fallback
      if (isFromInvite === undefined && this.finalIsFromInvite !== undefined) {
        isFromInvite = this.finalIsFromInvite;
        console.log('🔔 [轮询修复] 使用实例属性fallback，isFromInvite:', isFromInvite);
      }
      
      // 🔥 检查是否为发送方：使用更准确的身份判断
      const isSender = !isFromInvite;
      
      console.log('🔔 [轮询身份判断] isFromInvite:', isFromInvite, 'isSender:', isSender);
      console.log('🔔 [轮询身份判断] 当前用户:', currentUser?.openId);
      console.log('🔔 [轮询身份判断] 参与者数量:', participants.length);
      
      // 🔥 【URGENT-FIX】简化轮询逻辑，确保双方都能正常接收消息
      // 移除复杂的参与者检测，确保消息同步的可靠性
      
      if (isSender) {
        // 🔥 【关键修复】发送方也必须轮询来接收对方的消息
        console.log('🔔 [发送方轮询] 启用轮询接收对方消息');
      } else {
        // 🔥 接收方正常轮询
        console.log('🔔 [接收方轮询] 启用轮询接收消息');
      }
      
      // 🔥 【关键修复】所有用户都需要轮询来确保消息同步
      console.log('🔔 [消息同步] 开始轮询检查新消息 - 身份:', isSender ? '发送方' : '接收方');
      this.fetchMessages();
    }, 5000); // 🔥 缩短至5秒：watcher 可能因微信SDK问题漏消息，短间隔确保对方消息不被遗漏
  },

  /**
   * 🔥 启动消息轮询（新增方法，用于清理完成后重启）
   */
  startMessagePolling: function() {
    console.log('🔔 启动消息轮询');
    
    // 🔥 检查是否在清理状态
    if (this.data.isBurnAfterReadingCleaning) {
      console.log('🔔 正在清理中，延迟启动轮询');
      setTimeout(() => {
        this.startMessagePolling();
      }, 5000);
      return;
    }
    
    // 🔥 检查是否在冷却期
    const currentTime = Date.now();
    const lastCleanupTime = this.data.lastCleanupTime;
    const cooldownPeriod = this.data.cleanupCooldownPeriod;
    
    if (lastCleanupTime && (currentTime - lastCleanupTime) < cooldownPeriod) {
      const remainingTime = Math.ceil((cooldownPeriod - (currentTime - lastCleanupTime)) / 1000);
      console.log(`🔔 仍在冷却期内，剩余${remainingTime}秒，延迟启动轮询`);
      setTimeout(() => {
        this.startMessagePolling();
      }, remainingTime * 1000);
      return;
    }
    
    // 🔥 检查用户身份，发送方不启动轮询
    const isFromInvite = this.data.isFromInvite;
    if (!isFromInvite) {
      console.log('🔔 发送方身份，不启动轮询以避免获取历史消息');
      return;
    }
    
    console.log('🔔 条件满足，启动消息轮询');
    this.startPollingMessages();
  },

  /**
   * 🔥 停止实时消息监听
   */
  stopMessageListener: function() {
    if (this.messageWatcher) {
      console.log('🔔 停止消息监听');
      this.messageWatcher.close();
      this.messageWatcher = null;
      this._watcherInitialized = false;
    }
    
    // 🔥 同时停止轮询
    if (this.messagePollingTimer) {
      clearInterval(this.messagePollingTimer);
      this.messagePollingTimer = null;
    }
  },

  /**
   * 创建会话记录
   */
  createConversationRecord: function(chatId) {
    return new Promise((resolve, reject) => {
      console.log('🔥 创建会话记录，chatId:', chatId);
      
      wx.cloud.callFunction({
        name: 'createChat',
        data: {
          chatId: chatId,
          message: '您创建了私密聊天，可点击右上角菜单分享链接邀请朋友加入'
        },
        success: res => {
          console.log('🔥 创建会话记录成功:', res);
          if (res.result && res.result.success) {
            resolve(res.result);
          } else {
            reject(new Error(res.result?.error || '创建会话记录失败'));
          }
        },
        fail: err => {
          console.error('🔥 创建会话记录失败:', err);
          reject(err);
        }
      });
    });
  },

  /**
   * 手动修复连接 - 当检测到有消息但参与者未正确连接时调用
   */
  manuallyFixConnection: function() {
    console.log('🔧 [手动修复] 开始修复连接问题');
    
    const chatId = this.data.contactId;
    const currentUserOpenId = this.data.currentUser?.openId;
    
    if (!chatId || !currentUserOpenId) {
      console.log('🔧 [手动修复] 缺少必要参数，无法修复');
      return;
    }
    
    // 重新获取参与者信息
    wx.cloud.callFunction({
      name: 'getChatParticipants',
      data: { chatId: chatId },
      success: (res) => {
        console.log('🔧 [手动修复] 获取参与者结果:', res.result);
        
        if (res.result && res.result.success && res.result.participants && res.result.participants.length > 0) {
          const participants = res.result.participants;
          console.log('🔧 [手动修复] 所有参与者详情:', JSON.stringify(participants, null, 2));
          console.log('🔧 [手动修复] 当前用户OpenId:', currentUserOpenId);
          
          const otherParticipants = participants.filter(p => 
            (p.id || p.openId) !== currentUserOpenId
          );
          
          console.log('🔧 [手动修复] 其他参与者数量:', otherParticipants.length);
          console.log('🔧 [手动修复] 其他参与者详情:', JSON.stringify(otherParticipants, null, 2));
          
          if (otherParticipants.length > 0) {
            console.log('🔧 [手动修复] 发现其他参与者，开始数据处理');
            
            const processedParticipants = participants.map(p => {
              const participantOpenId = p.id || p.openId;
              let nickName = p.nickName || p.name || '用户';
              
              return {
                id: participantOpenId,
                openId: participantOpenId,
                nickName: nickName,
                avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
                isCreator: p.isCreator || false,
                isJoiner: p.isJoiner || false,
                isSelf: participantOpenId === currentUserOpenId
              };
            });
            
            console.log('🔧 [手动修复] 处理后的参与者详情:', JSON.stringify(processedParticipants, null, 2));
            
            // 🔥 强制更新UI，确保数据真的被设置了
            this.setData({
              participants: processedParticipants
            }, () => {
              // 在setData回调中验证数据是否真的更新了
              console.log('🔧 [手动修复] setData回调 - 验证参与者数量:', this.data.participants.length);
              console.log('🔧 [手动修复] setData回调 - 参与者详情:', JSON.stringify(this.data.participants, null, 2));
              
              // 🔥 延迟更新标题，确保participants已真正更新
              setTimeout(() => {
                console.log('🔧 [手动修复] 开始更新标题 - 当前参与者数量:', this.data.participants.length);
                this.updateDynamicTitleWithRealNames();
                
                // 🔧 手动修复完成的最终验证
                setTimeout(() => {
                  console.log('🔧 [手动修复] 连接修复完成，最终参与者数量:', this.data.participants.length);
                  console.log('🔧 [手动修复] 连接修复完成，最终标题:', this.data.dynamicTitle);
                  
                  // 如果参与者数量还是1，强制触发消息推断
                  if (this.data.participants.length <= 1) {
                    console.log('🔧 [手动修复] 参与者数量仍异常，强制触发消息推断');
                    this.inferParticipantsFromMessages();
                  }
                }, 300);
              }, 200);
            });
            
          } else {
            console.log('🔧 [手动修复] 没有发现其他参与者，尝试通过消息推断');
            this.inferParticipantsFromMessages();
          }
        } else {
          console.log('🔧 [手动修复] 数据库中没有参与者信息，尝试通过消息推断');
          this.inferParticipantsFromMessages();
        }
      },
      fail: (err) => {
        console.error('🔧 [手动修复] 获取参与者失败:', err);
        // 网络失败时也尝试通过消息推断
        console.log('🔧 [手动修复] 网络失败，尝试通过消息推断');
        this.inferParticipantsFromMessages();
      }
    });
  },

  /**
   * 通过消息推断参与者 - 当无法从数据库获取参与者时的备用方案
   */
  inferParticipantsFromMessages: function() {
    console.log('🔧 [推断参与者] ==================== 开始通过消息推断参与者 ====================');
    
    const messages = this.data.messages || [];
    const app = getApp();
    const currentUserOpenId = app.globalData.userInfo.openId;
    const uniqueParticipants = new Map();
    
    console.log('🔧 [推断参与者] 当前消息数量:', messages.length);
    console.log('🔧 [推断参与者] 当前用户OpenId:', currentUserOpenId);
    
    // 添加当前用户
    uniqueParticipants.set(currentUserOpenId, {
      id: currentUserOpenId,
      openId: currentUserOpenId,
      nickName: app.globalData.userInfo.nickName,
      avatarUrl: app.globalData.userInfo.avatarUrl,
      isSelf: true
    });
    
    // 收集所有非自己的发送者ID
    const otherSenderIds = [];
    messages.forEach(msg => {
      if (msg.senderId && 
          msg.senderId !== currentUserOpenId && 
          msg.senderId !== 'system' && 
          msg.senderId !== 'self' &&
          otherSenderIds.indexOf(msg.senderId) === -1) {
        otherSenderIds.push(msg.senderId);
      }
    });
    
    console.log('🔧 [推断参与者] 发现的其他发送者IDs:', otherSenderIds);
    
    // 为每个其他发送者推断参与者信息
    otherSenderIds.forEach((senderId, index) => {
      // 🔥 智能推断参与者昵称
      let inferredNickName = '朋友';
      
      // 🔥 尝试从URL参数推断邀请者昵称
      try {
        const pages = getCurrentPages();
        if (pages.length > 0) {
          const currentPage = pages[pages.length - 1];
          const options = currentPage.options || {};
          
          console.log('🔧 [推断参与者] URL参数:', options);
          
          // 优先从inviter参数获取
          if (options.inviter) {
            try {
              const decodedInviter = decodeURIComponent(decodeURIComponent(options.inviter));
              if (decodedInviter && decodedInviter !== '朋友' && decodedInviter !== '邀请者' && decodedInviter !== '好友') {
                inferredNickName = decodedInviter;
                console.log('🔧 [推断参与者] 从inviter参数推断昵称:', inferredNickName);
              }
            } catch (e) {
              // 如果双重解码失败，尝试单次解码
              try {
                const singleDecoded = decodeURIComponent(options.inviter);
                if (singleDecoded && singleDecoded !== '朋友' && singleDecoded !== '邀请者' && singleDecoded !== '好友') {
                  inferredNickName = singleDecoded;
                  console.log('🔧 [推断参与者] 从inviter参数单次解码推断昵称:', inferredNickName);
                }
              } catch (e2) {
                console.log('🔧 [推断参与者] inviter参数解码失败');
              }
            }
          }
          
          // 备选：从userName参数获取
          if (inferredNickName === '朋友' && options.userName) {
            try {
              const decodedUserName = decodeURIComponent(decodeURIComponent(options.userName));
              if (decodedUserName && decodedUserName !== '用户' && decodedUserName !== '朋友' && decodedUserName !== '好友') {
                inferredNickName = decodedUserName;
                console.log('🔧 [推断参与者] 从userName参数推断昵称:', inferredNickName);
              }
            } catch (e) {
              // 如果双重解码失败，尝试单次解码
              try {
                const singleDecoded = decodeURIComponent(options.userName);
                if (singleDecoded && singleDecoded !== '用户' && singleDecoded !== '朋友' && singleDecoded !== '好友') {
                  inferredNickName = singleDecoded;
                  console.log('🔧 [推断参与者] 从userName参数单次解码推断昵称:', inferredNickName);
                }
              } catch (e2) {
                console.log('🔧 [推断参与者] userName参数解码失败');
              }
            }
          }
        }
      } catch (e) {
        console.log('🔧 [推断参与者] 从URL推断昵称失败，使用默认值:', e);
      }
      
      // 推断参与者信息
      uniqueParticipants.set(senderId, {
        id: senderId,
        openId: senderId,
        nickName: inferredNickName,
        avatarUrl: '/assets/images/default-avatar.png',
        isSelf: false
      });
      
      console.log('🔧 [推断参与者] 推断出新参与者:', senderId, '->', inferredNickName);
    });
    
    const inferredParticipants = Array.from(uniqueParticipants.values());
    console.log('🔧 [推断参与者] 推断出的参与者列表详情:', JSON.stringify(inferredParticipants, null, 2));
    
    // 🔥 【关键修复】确保当前用户在推断的参与者列表中
    const currentUserExists = inferredParticipants.some(p => 
      (p.id || p.openId) === currentUserOpenId
    );
    
    if (!currentUserExists) {
      console.log('🔧 [推断参与者] 当前用户不在推断列表中，添加当前用户');
      inferredParticipants.push({
        id: currentUserOpenId,
        openId: currentUserOpenId,
        nickName: app.globalData.userInfo.nickName,
        avatarUrl: app.globalData.userInfo.avatarUrl,
        isSelf: true
      });
    }
    
    console.log('🔧 [推断参与者] 最终推断的参与者列表:', JSON.stringify(inferredParticipants, null, 2));
    
    if (inferredParticipants.length > 1) {
      console.log('🔧 [推断参与者] ✅ 成功推断出', inferredParticipants.length, '个参与者，开始更新UI');
      
      // 🔥 立即更新参与者列表
      this.setData({
        participants: inferredParticipants
      }, () => {
        console.log('🔧 [推断参与者] setData回调 - 验证参与者已更新，数量:', this.data.participants.length);
        
        // 🔥 强制更新标题并显示双人模式
        setTimeout(() => {
          console.log('🔧 [推断参与者] 开始更新标题');
          this.updateDynamicTitleWithRealNames();
          
          // 🔗 [连接提示修复] 移除Toast提示，避免干扰用户体验
          // wx.showToast({
          //   title: '🎉 连接已恢复',
          //   icon: 'success',
          //   duration: 2000
          // });
          console.log('🔗 [连接提示修复] ✅ 连接已恢复，静默记录结果');
          
          console.log('🔧 [推断参与者] ✅ 通过消息推断完成，参与者数量:', this.data.participants.length);
          console.log('🔧 [推断参与者] ✅ 标题应已更新:', this.data.dynamicTitle);
        }, 100);
      });
      
      // 🔥 同步推断结果到数据库conversations集合
      this.syncInferredParticipantsToDatabase(inferredParticipants);
      
    } else {
      console.log('🔧 [推断参与者] ❌ 未能推断出其他参与者，可能消息都是自己发的');
      console.log('🔧 [推断参与者] 消息发送者统计:');
      messages.forEach((msg, index) => {
        console.log(`🔧 [推断参与者] 消息${index + 1}: 发送者=${msg.senderId}, 内容="${msg.content}"`);
      });
    }
    
    console.log('🔧 [推断参与者] ==================== 推断参与者流程结束 ====================');
  },
  
  /**
   * 🔥 同步推断的参与者信息到数据库
   */
  syncInferredParticipantsToDatabase: function(participants) {
    const chatId = this.data.contactId;
    if (!chatId) return;
    
    console.log('🔧 [数据库同步] 开始同步推断的参与者到数据库');
    
    // 调用云函数更新conversations集合的participants字段
    wx.cloud.callFunction({
      name: 'updateConversationParticipants',
      data: {
        chatId: chatId,
        participants: participants
      },
      success: (res) => {
        if (res.result && res.result.success) {
          console.log('🔧 [数据库同步] ✅ 参与者信息同步成功');
        } else {
          console.log('🔧 [数据库同步] ❌ 参与者信息同步失败:', res.result?.error);
        }
      },
      fail: (err) => {
        console.error('🔧 [数据库同步] ❌ 调用同步云函数失败:', err);
      }
    });
  },

   /**
    * 检测并修复连接问题
    */
   checkAndFixConnection: function(messages) {
     console.log('🔧 [连接检测] 开始检测连接问题');
     
     // 🔥 防重复触发：如果正在清理中，跳过检测
     if (this.data.isBurnAfterReadingCleaning) {
       console.log('🔥 [阅后即焚] 正在清理中，跳过重复检测');
       return;
     }
     
     // 🔥 检查是否在清理冷却期内
     const currentTime = Date.now();
     const lastCleanupTime = this.data.lastCleanupTime;
     const cooldownPeriod = this.data.cleanupCooldownPeriod;
     
     if (lastCleanupTime && (currentTime - lastCleanupTime) < cooldownPeriod) {
       const remainingTime = Math.ceil((cooldownPeriod - (currentTime - lastCleanupTime)) / 1000);
       console.log(`🔥 [清理冷却期] 仍在冷却期内，剩余${remainingTime}秒，跳过检测`);
       return;
     }
     
     const participants = this.data.participants || [];
     const currentUser = this.data.currentUser;
     
     // 【HOTFIX-v1.3.0】移除发送方保护，所有用户都执行阅后即焚检查
     
     // 检查参与者数量
     if (participants.length <= 1) {
       console.log('🔧 [连接检测] 参与者数量异常，只有', participants.length, '个参与者');
       
       // 检查消息中是否有其他发送者
       const currentUserOpenId = this.data.currentUser?.openId;
       const hasOtherSenders = messages.some(msg => 
         msg.senderId && 
         msg.senderId !== currentUserOpenId && 
         msg.senderId !== 'system' && 
         msg.senderId !== 'self'
       );
       
       if (hasOtherSenders) {
         console.log('🔧 [连接检测] 检测到有其他发送者的消息，但参与者列表不完整');
         
         // 🔥 【智能判断】检查是否是刚登录就遇到残留数据
         const chatId = this.data.contactId;
         const currentUserOpenId = this.data.currentUser?.openId;
         const pageLoadTime = Date.now();
         
         // 🚨 【修复时间错误】检查最近消息的时间
         const recentMessages = messages.filter(msg => {
           try {
             if (!msg.sendTime) return false;
             
             let msgTime;
             if (typeof msg.sendTime === 'string') {
               msgTime = new Date(msg.sendTime);
             } else if (msg.sendTime._date) {
               msgTime = new Date(msg.sendTime._date);
             } else if (msg.sendTime.getTime) {
               msgTime = msg.sendTime;
             } else {
               msgTime = new Date(msg.sendTime);
             }
             
             if (isNaN(msgTime.getTime())) {
               console.warn('🚨 [连接检测] 消息时间格式错误:', msg.sendTime);
               return false;
             }
             
             const timeDiff = pageLoadTime - msgTime.getTime();
           return timeDiff < 10 * 60 * 1000; // 10分钟内的消息
           } catch (error) {
             console.error('🚨 [连接检测] 时间处理错误:', error, msg);
             return false;
           }
         });
         
         const hasRecentActivity = recentMessages.length > 0;
         const isLikelyStaleData = messages.length > 2 && !hasRecentActivity;
         
         console.log('🔧 [连接检测] 消息总数:', messages.length);
         console.log('🔧 [连接检测] 最近10分钟消息数:', recentMessages.length);
         console.log('🔧 [连接检测] 疑似残留数据:', isLikelyStaleData);
         
         if (isLikelyStaleData) {
           console.log('🔥 [阅后即焚] ⚠️ 检测到历史聊天数据，作为阅后即焚应用自动清理');
           console.log('🔥 [阅后即焚] 自动清理历史消息，确保阅后即焚体验');
           this.forceBurnAfterReadingCleanup();
         } else {
           console.log('🔧 [连接检测] 检测到活跃聊天，开始自动修复');
           
           // 延迟1秒执行修复，确保页面初始化完成
           setTimeout(() => {
             this.manuallyFixConnection();
           }, 1000);
         }
       } else {
         console.log('🔧 [连接检测] 没有其他发送者，可能是新聊天');
       }
     } else {
       console.log('🔧 [连接检测] 参与者数量正常:', participants.length);
     }
   },

   /**
   * 🛠️ 【系统性修复】生命周期函数--监听页面卸载
    */
   onUnload: function() {
    console.log('🛠️ [系统修复] 页面卸载，开始全面清理');
    this.uninstallMessageSetDataDebugHook();

    try {
      if (typeof wx.offKeyboardHeightChange === 'function' && this._keyboardHeightChangeHandler) {
        wx.offKeyboardHeightChange(this._keyboardHeightChangeHandler);
      }
    } catch (kbOffErr) {}

    this._kbTransitionGuard = false;
    if (this._kbResetTimer) { clearTimeout(this._kbResetTimer); this._kbResetTimer = null; }
    if (this._kbFocusProbeTimer) { clearTimeout(this._kbFocusProbeTimer); this._kbFocusProbeTimer = null; }
    if (this._scrollBottomTimer) { clearTimeout(this._scrollBottomTimer); this._scrollBottomTimer = null; }

    if (this._recordingTimer) { clearInterval(this._recordingTimer); this._recordingTimer = null; }
    if (this._innerAudioCtx) { this._innerAudioCtx.destroy(); this._innerAudioCtx = null; }
    
    // 🔥 清理B端标题重试定时器
    if (this.bEndTitleRetryTimer) {
      clearInterval(this.bEndTitleRetryTimer);
      this.bEndTitleRetryTimer = null;
    }
    
    // 🛠️ 使用资源管理器统一清理所有资源
    if (this.resourceManager) {
      this.resourceManager.cleanup();
    }
    
    // 🛠️ 清理销毁消息相关的定时器映射
    if (this.destroyTimers) {
      this.destroyTimers.forEach((timer, messageId) => {
        clearTimeout(timer);
        clearInterval(timer);
      });
      this.destroyTimers.clear();
    }
    
    // 🛠️ 清理原有的直接定时器引用（向后兼容）
    const legacyTimers = [
      'participantWatcher', 'messageWatcher', 'messagePollingTimer', 
      'chatCreationTimer', 'titleUpdateTimer', 'connectionCheckTimer',
      'nicknameUpdateTimer', 'identityFixTimer'
    ];
    
    legacyTimers.forEach(timerName => {
      if (this[timerName]) {
        try {
          if (typeof this[timerName].close === 'function') {
            this[timerName].close();
          } else {
            clearTimeout(this[timerName]);
            clearInterval(this[timerName]);
          }
          this[timerName] = null;
        } catch (error) {
          ErrorHandler.handle(error, `清理遗留定时器[${timerName}]`);
        }
      }
    });
    
    // 🔥 停止消息监听器
    this.stopMessageListener();
    
    // 🔥 【阅后即焚增强】清理所有资源
    this.stopOnlineStatusMonitor();
    this.clearAllDestroyTimers();
    this.updateUserOnlineStatus(false);
    
    // 🔧 清除接收方标题锁定标记
    this.receiverTitleLocked = false;
    
    // 🛠️ 强制清理所有可能的定时器ID（应急方案）
    if (this.data.isDebugMode) {
      for (let i = 1; i < 10000; i++) {
        clearTimeout(i);
        clearInterval(i);
      }
    }
    
    // 🛠️ 标记页面为已销毁状态
    this._isPageDestroyed = true;
    
    console.log('🛠️ [系统修复] ✅ 页面卸载清理完成');
   },

   /**
    * 生命周期函数--监听页面隐藏
    */
   onHide: function() {
     console.log('[聊天页面] 页面隐藏，暂停监听');

     if (this._recorderManager && this.data.isRecording) {
       if (this._recordingTimer) {
         clearInterval(this._recordingTimer);
         this._recordingTimer = null;
       }
       this.setData({ voiceCancelMove: true });
       try {
         this._recorderManager.stop();
       } catch (recErr) {
         console.warn('🎙️ 页面隐藏时停止录音:', recErr);
       }
     }
     
    // 🔥 页面隐藏时重置键盘状态，keyboardVisible=false 让 CSS bottom:0 兜底全屏
    var winH = 700;
    try {
      var wInfo = wx.getWindowInfo();
      if (wInfo && wInfo.windowHeight > 0) winH = wInfo.windowHeight;
    } catch (_e) {}
    if (!winH || winH <= 0) winH = (this._layoutInfo && this._layoutInfo.windowHeight) || this.data.windowHeight || 700;
    this.setData({
      isPageActive: false,
      backgroundTime: Date.now(),
      inputFocus: false,
      keyboardHeight: 0,
      keyboardVisible: false,
      containerHeight: winH
    });

     this._kbTransitionGuard = false;
     if (this._kbResetTimer) { clearTimeout(this._kbResetTimer); this._kbResetTimer = null; }
     if (this._kbFocusProbeTimer) { clearTimeout(this._kbFocusProbeTimer); this._kbFocusProbeTimer = null; }
     if (this._scrollBottomTimer) { clearTimeout(this._scrollBottomTimer); this._scrollBottomTimer = null; }
     
     // 🔥 【阅后即焚增强】停止在线状态监听
     this.stopOnlineStatusMonitor();
     
     // 🔥 【阅后即焚增强】更新用户离线状态到云端
     this.updateUserOnlineStatus(false);
     
     // 🔥 页面隐藏时停止消息监听，节省资源
     this.stopMessageListener();

     try {
       if (typeof wx.offKeyboardHeightChange === 'function' && this._keyboardHeightChangeHandler) {
         wx.offKeyboardHeightChange(this._keyboardHeightChangeHandler);
       }
     } catch (e) {}
   },

  /**
   * 🔧 强制修复特定用户的昵称问题
   */
  forceFixSpecificUserNicknames: function() {
    console.log('🔧 [强制修复] 开始修复特定用户昵称问题');
    
    const participants = this.data.participants || [];
    const currentUserOpenId = this.data.currentUser?.openId;
    
    // 定义所有用户的正确信息
    const userCorrections = {
      'ojtOs7bmxy-8M5wOTcgrqlYedgyY': {
        nickName: 'Y.',
        avatarUrl: '/assets/images/default-avatar.png'
      },
      'ojtOs7bA8w-ZdS1G_o5rdoeLzWDc': {
        nickName: '向冬',
        avatarUrl: '/assets/images/default-avatar.png'
      },
      // 添加所有相关的本地ID
      'local_1749385086984': {
        nickName: '向冬',
        avatarUrl: '/assets/images/default-avatar.png'
      },
      'local_1749386034798': {
        nickName: '向冬',
        avatarUrl: '/assets/images/default-avatar.png'
      },
      'local_1749386462833': {
        nickName: '向冬',
        avatarUrl: '/assets/images/default-avatar.png'
      },
      'local_1749386777168': {
        nickName: '向冬',
        avatarUrl: '/assets/images/default-avatar.png'
      }
    };
    
    let hasUpdated = false;
    
    // 检查并修复参与者昵称
    const updatedParticipants = participants.map(p => {
      const participantOpenId = p.openId || p.id;
      
      if (userCorrections[participantOpenId]) {
        const correction = userCorrections[participantOpenId];
        console.log(`🔧 [强制修复] 修复用户 ${participantOpenId} 昵称: ${p.nickName} -> ${correction.nickName}`);
        
        hasUpdated = true;
        
        // 同时更新数据库
        this.updateSpecificUserInfo(participantOpenId, correction.nickName);
        
        return {
          ...p,
          nickName: correction.nickName,
          name: correction.nickName,
          avatarUrl: correction.avatarUrl
        };
      }
      
      return p;
    });
    
    if (hasUpdated) {
      // 更新页面数据
      this.setData({
        participants: updatedParticipants
      });
      
      // 更新标题
      setTimeout(() => {
        this.updateDynamicTitleWithRealNames();
        console.log('🔧 [强制修复] 昵称修复完成，标题已更新');
        
        // 显示修复结果
        wx.showToast({
          title: '昵称修复完成',
          icon: 'success'
        });
      }, 100);
    } else {
      console.log('🔧 [强制修复] 未发现需要修复的用户');
      wx.showToast({
        title: '未发现需要修复的用户',
        icon: 'none'
      });
    }
  },

  /**
   * 🚨 【热修复】检查并清除连接状态
   */
  checkAndClearConnectionStatus: function() {
    console.log('🚨 [热修复] ==================== 开始检查连接状态 ====================');
    
    const data = this.data;
    console.log('🚨 [热修复] 当前状态:', {
      isCreatingChat: data.isCreatingChat,
      chatCreationStatus: data.chatCreationStatus,
      isLoading: data.isLoading,
      messages: data.messages?.length || 0,
      participants: data.participants?.length || 0
    });
    
    // 检查是否应该清除连接状态
    const shouldClearConnectionStatus = (
      data.isCreatingChat && // 当前显示连接状态
      (
        (data.messages && data.messages.length > 0) || // 已有消息
        (data.participants && data.participants.length > 1) || // 已有多个参与者
        (data.contactId && data.contactId.length > 0) // 已有聊天ID
      )
    );
    
    if (shouldClearConnectionStatus) {
      console.log('🚨 [热修复] 检测到异常连接状态，强制清除');
      
      this.setData({
        isCreatingChat: false,
        chatCreationStatus: '',
        isLoading: false
      });
      
      console.log('🚨 [热修复] ✅ 连接状态已清除');
      
      // 添加成功提示
      // wx.showToast({
      //   title: '连接已建立',
      //   icon: 'success',
      //   duration: 1500
      // });
      console.log('✅ [连接状态] 连接已建立，后台静默完成');
      
    } else if (data.isCreatingChat) {
      console.log('🚨 [热修复] 仍在连接状态，但无异常数据，设置超时清除');
      
      // 设置超时清除，防止无限等待
      setTimeout(() => {
        if (this.data.isCreatingChat) {
          console.log('🚨 [热修复] 超时强制清除连接状态');
          this.setData({
            isCreatingChat: false,
            chatCreationStatus: '连接已建立'
          });
        }
      }, 3000);
      
    } else {
      console.log('🚨 [热修复] 连接状态正常，无需清除');
    }
    
    console.log('🚨 [热修复] ==================== 连接状态检查完成 ====================');
  },

  /**
   * 🆘 【强制参与者修复】强制修复参与者重复问题
   */
  forceFixParticipantDuplicates: function() {
    console.log('🆘 [强制修复] ==================== 开始强制修复参与者重复 ====================');
    
    const { participants, currentUser } = this.data;
    const userOpenId = currentUser?.openId;
    
    if (!participants || participants.length <= 2) {
      console.log('🆘 [强制修复] 参与者数量正常，无需强制修复');
      return;
    }
    
    console.log('🆘 [强制修复] 检测到严重的参与者重复问题，参与者数量:', participants.length);
    console.log('🆘 [强制修复] 详细参与者信息:', participants);
    
    // 🔥 【终极去重】使用更严格的去重逻辑
    const finalParticipants = [];
    const processedIds = new Map(); // 使用Map来跟踪处理过的ID
    
    participants.forEach((p, index) => {
      const id1 = p.openId;
      const id2 = p.id;
      
      console.log(`🆘 [强制修复] 处理参与者${index}: openId=${id1}, id=${id2}, nickName=${p.nickName}`);
      
      // 检查所有可能的ID字段
      const possibleIds = [id1, id2].filter(id => id && id.length > 0);
      let shouldAdd = true;
      let finalId = null;
      
      for (const pid of possibleIds) {
        if (processedIds.has(pid)) {
          console.log(`🆘 [强制修复] ID ${pid} 已存在，跳过重复参与者`);
          shouldAdd = false;
          break;
        } else {
          finalId = pid;
        }
      }
      
      if (shouldAdd && finalId) {
        processedIds.set(finalId, true);
        
        // 创建标准化的参与者对象
        const standardizedParticipant = {
          id: finalId,
          openId: finalId,
          nickName: p.nickName || p.name || '用户',
          avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
          isSelf: finalId === userOpenId,
          isCreator: p.isCreator || false,
          isJoiner: p.isJoiner || false
        };
        
        finalParticipants.push(standardizedParticipant);
        console.log(`🆘 [强制修复] ✅ 添加唯一参与者: ${finalId} -> ${standardizedParticipant.nickName}`);
      }
    });
    
    console.log('🆘 [强制修复] 强制去重完成，从', participants.length, '减少到', finalParticipants.length);
    console.log('🆘 [强制修复] 最终参与者列表:', finalParticipants);
    
    // 🔥 【强制更新】立即更新页面数据
    this.setData({
      participants: finalParticipants
    }, () => {
      console.log('🆘 [强制修复] 页面数据更新完成，验证参与者数量:', this.data.participants.length);
      
      // 🔥 【立即更新标题】
      if (finalParticipants.length === 2) {
        const otherParticipant = finalParticipants.find(p => !p.isSelf);
        if (otherParticipant) {
          const newTitle = `我和${otherParticipant.nickName}（2）`;
          console.log('🆘 [强制修复] 更新标题为:', newTitle);
          
          this.setData({
            dynamicTitle: newTitle,
            contactName: newTitle
          });
          
      wx.setNavigationBarTitle({
            title: newTitle,
        success: () => {
              console.log('🆘 [强制修复] ✅ 标题更新成功');
              
              // wx.showToast({
              //   title: '✅ 参与者修复完成',
              //   icon: 'success',
              //   duration: 2000
              // });
              console.log('✅ [参与者修复] 参与者修复完成，后台静默完成');
            }
          });
        }
      } else if (finalParticipants.length === 1) {
        const title = currentUser?.nickName || '我';
        this.setData({
          dynamicTitle: title,
          contactName: title
        });
        wx.setNavigationBarTitle({ title: title });
      }
    });
    
    console.log('🆘 [强制修复] ==================== 强制修复完成 ====================');
  },
  /**
   * 🔥 【消息同步修复】检查并修复消息同步问题
   */
  checkAndFixMessageSync: function() {
    console.log('🔄 [消息同步修复] ==================== 开始检查消息同步 ====================');
    
    const { participants, messages, contactId } = this.data;
    
    // 检查是否为双人聊天
    if (participants.length !== 2) {
      console.log('🔄 [消息同步修复] 非双人聊天，跳过消息同步检查');
      return;
    }
    
    // 检查是否有对方发送的消息但自己发送的消息对方收不到
    const userMessages = messages.filter(msg => msg.isSelf && !msg.isSystem);
    const otherMessages = messages.filter(msg => !msg.isSelf && !msg.isSystem);
    
    console.log('🔄 [消息同步修复] 自己的消息数量:', userMessages.length);
    console.log('🔄 [消息同步修复] 对方的消息数量:', otherMessages.length);
    
    if (userMessages.length > 0 && otherMessages.length > 0) {
      console.log('🔄 [消息同步修复] 双方都有消息，同步正常');
      
      // 但是需要检查消息监听器是否正常工作
      if (!this.messageWatcher) {
        console.log('🔄 [消息同步修复] 消息监听器未启动，重新启动');
        this.startMessageListener();
      }
      
      return;
    }
    
    if (userMessages.length > 0 && otherMessages.length === 0) {
      console.log('🔄 [消息同步修复] ⚠️ 检测到消息同步问题：自己有消息但收不到对方消息');
      
      // 重新启动消息监听器
      this.restartMessageListener();
      
      // 重新获取消息
      setTimeout(() => {
        this.fetchMessages();
      }, 1000);
      
    } else if (userMessages.length === 0 && otherMessages.length > 0) {
      console.log('🔄 [消息同步修复] ⚠️ 检测到消息同步问题：收到对方消息但自己发送的消息可能有问题');
      
      // 检查发送消息功能
      this.checkSendMessageFunction();
    }
    
    console.log('🔄 [消息同步修复] ==================== 消息同步检查完成 ====================');
  },

  /**
   * 🔄 重新启动消息监听器
   */
  restartMessageListener: function() {
    console.log('🔄 [重启监听器] 重新启动消息监听器');
    
    // 停止当前监听器
    if (this.messageWatcher) {
      this.messageWatcher.close();
      this.messageWatcher = null;
      console.log('🔄 [重启监听器] 已停止旧的消息监听器');
    }
    
    // 延迟重新启动
    setTimeout(() => {
      this.startMessageListener();
      console.log('🔄 [重启监听器] 消息监听器已重新启动');
    }, 500);
  },

  /**
   * 🔄 检查发送消息功能
   */
  checkSendMessageFunction: function() {
    console.log('🔄 [发送检查] 检查发送消息功能');
    
    const { contactId, currentUser } = this.data;
    
    if (!contactId) {
      console.log('🔄 [发送检查] 缺少聊天ID');
      return;
    }
    
    if (!currentUser || !currentUser.openId) {
      console.log('🔄 [发送检查] 缺少用户信息');
      return;
    }
    
    console.log('🔄 [发送检查] 发送消息功能检查完成，基本参数正常');
    
    // 可以添加测试消息发送功能
    // this.sendTestMessage();
  },


  /**
   * 🔧 修复消息发送问题
   */
  fixMessageSending: function() {
    console.log('🔧 [消息发送修复] ==================== 开始修复消息发送问题 ====================');
    
    const chatId = this.data.contactId;
    const currentUser = this.data.currentUser;
    const participants = this.data.participants || [];
    const messages = this.data.messages || [];
    
    console.log('🔧 [消息发送修复] 当前聊天ID:', chatId);
    console.log('🔧 [消息发送修复] 当前用户:', currentUser);
    console.log('🔧 [消息发送修复] 参与者数量:', participants.length);
    console.log('🔧 [消息发送修复] 消息数量:', messages.length);
    console.log('🔧 [消息发送修复] 参与者详情:', JSON.stringify(participants, null, 2));
    
    // 🔥 【新聊天检测】如果只有系统消息，说明是新聊天
    const hasUserMessages = messages.some(msg => msg.senderId !== 'system');
    const isNewChat = !hasUserMessages && participants.length === 1;
    
    if (isNewChat) {
      console.log('🔧 [消息发送修复] ✅ 检测到这是新聊天，消息发送功能正常');
      // wx.showToast({
      //   title: '✅ 新聊天状态正常',
      //   icon: 'success'
      // });
      console.log('✅ [新聊天检测] 新聊天状态正常，后台静默完成');
      return;
    }
    
    // 检查参与者数据完整性
    const currentUserInParticipants = participants.find(p => 
      (p.id || p.openId) === currentUser.openId
    );
    
    if (!currentUserInParticipants) {
      console.log('🔧 [消息发送修复] 当前用户不在参与者列表中，这可能导致消息发送问题');
      
      // 强制添加当前用户到参与者列表
      const updatedParticipants = [...participants];
      updatedParticipants.push({
        id: currentUser.openId,
        openId: currentUser.openId,
        nickName: currentUser.nickName,
        avatarUrl: currentUser.avatarUrl,
        isSelf: true,
        isCreator: true
      });
      
      this.setData({
        participants: updatedParticipants
      }, () => {
        console.log('🔧 [消息发送修复] 已添加当前用户到参与者列表');
        this.syncParticipantsToDatabase(updatedParticipants);
      });
    }
    
    // 检查聊天记录是否存在
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        chatId: chatId,
        limit: 1
      },
      success: (res) => {
        console.log('🔧 [消息发送修复] 聊天记录检查结果:', res.result);
        
        if (!res.result || !res.result.success) {
          console.log('🔧 [消息发送修复] 聊天记录可能不存在，尝试重新创建');
          this.recreateChatRecord();
        } else {
          console.log('🔧 [消息发送修复] 聊天记录存在，检查参与者权限');
          this.checkMessagePermissions();
        }
        },
        fail: (err) => {
        console.error('🔧 [消息发送修复] 检查聊天记录失败:', err);
        this.recreateChatRecord();
      }
    });
  },
  
  /**
   * 🔧 重新创建聊天记录
   */
  recreateChatRecord: function() {
    console.log('🔧 [重新创建] 开始重新创建聊天记录');
    
    const chatId = this.data.contactId;
    const currentUser = this.data.currentUser;
    
    wx.cloud.callFunction({
      name: 'createChat',
      data: {
        chatId: chatId,
        creatorOpenId: currentUser.openId,
        creatorInfo: {
          nickName: currentUser.nickName,
          avatarUrl: currentUser.avatarUrl
        }
      },
      success: (res) => {
        console.log('🔧 [重新创建] 聊天记录创建成功:', res.result);
        
        // wx.showToast({
        //   title: '🔧 聊天记录已修复',
        //   icon: 'success'
        // });
        console.log('🔧 [聊天记录修复] 聊天记录已修复，后台静默完成');
        
        // 重新获取消息
        setTimeout(() => {
          this.fetchMessages();
        }, 1000);
      },
      fail: (err) => {
        console.error('🔧 [重新创建] 聊天记录创建失败:', err);
        // wx.showToast({
        //   title: '修复失败，请重试',
        //   icon: 'error'
        // });
        console.log('❌ [聊天记录修复] 修复失败，后台静默记录');
      }
    });
  },
  
  /**
   * 🔧 检查消息权限
   */
  checkMessagePermissions: function() {
    console.log('🔧 [权限检查] 开始检查消息发送权限');
    
    // 尝试发送一条测试消息
    const testMessage = {
      chatId: this.data.contactId,
      content: '[系统测试消息]',
      senderId: this.data.currentUser.openId,
      senderInfo: {
        nickName: this.data.currentUser.nickName,
        avatarUrl: this.data.currentUser.avatarUrl
      },
      sendTime: new Date(),
      type: 'system'
    };
    
    wx.cloud.callFunction({
      name: 'sendMessage',
      data: testMessage,
      success: (res) => {
        console.log('🔧 [权限检查] 测试消息发送成功:', res.result);
        
        // 立即删除测试消息
        if (res.result && res.result.messageId) {
          wx.cloud.callFunction({
            name: 'destroyMessage',
            data: {
              messageId: res.result.messageId
            },
            success: () => {
              console.log('🔧 [权限检查] 测试消息已删除');
            }
          });
        }
        
        // wx.showToast({
        //   title: '✅ 消息发送权限正常',
        //   icon: 'success'
        // });
        console.log('✅ [权限检查] 消息发送权限正常，后台静默完成');
      },
      fail: (err) => {
        console.error('🔧 [权限检查] 测试消息发送失败:', err);
        
        // wx.showModal({
        //   title: '消息发送异常',
        //   content: `检测到消息发送权限问题：\n${err.message || '未知错误'}\n\n是否尝试修复？`,
        //   confirmText: '修复',
        //   cancelText: '稍后',
        //   success: (res) => {
        //     if (res.confirm) {
        //       this.recreateChatRecord();
        //     }
        //   }
        // });
        console.log('❌ [权限检查] 消息发送权限异常，后台静默记录:', err.message || '未知错误');
        // 后台静默自动尝试修复
        this.recreateChatRecord();
      }
    });
  },
  
  /**
   * 🔧 同步参与者到数据库
   */
  syncParticipantsToDatabase: function(participants) {
    console.log('🔧 [数据库同步] 开始同步参与者到数据库');
    
    wx.cloud.callFunction({
      name: 'updateConversationParticipants',
      data: {
        chatId: this.data.contactId,
        participants: participants
      },
      success: (res) => {
        console.log('🔧 [数据库同步] 参与者同步成功:', res.result);
      },
      fail: (err) => {
        console.error('🔧 [数据库同步] 参与者同步失败:', err);
      }
    });
  },

   /**
    * 🔥 检查是否需要阅后即焚清理
    */
   /**
 * 🔥 检查是否需要阅后即焚清理
 * @description 【HOTFIX-v1.3.2】智能检测历史消息，避免清理正常聊天消息
 * @returns {void}
 */
checkBurnAfterReadingCleanup: function() {
  console.log('🔥 [阅后即焚检查] 开始检查是否需要清理历史数据');
  
  // 🔥 检查是否在清理冷却期内
  const currentTime = Date.now();
  const lastCleanupTime = this.data.lastCleanupTime;
  const cooldownPeriod = this.data.cleanupCooldownPeriod;
  
  if (lastCleanupTime && (currentTime - lastCleanupTime) < cooldownPeriod) {
    const remainingTime = Math.ceil((cooldownPeriod - (currentTime - lastCleanupTime)) / 1000);
    console.log(`🔥 [清理冷却期] 仍在冷却期内，剩余${remainingTime}秒，跳过检查`);
    return;
  }
  
  const messages = this.data.messages || [];
  const participants = this.data.participants || [];
  const currentUser = this.data.currentUser;
  const isFromInvite = this.data.isFromInvite;

  // 🔥 【HOTFIX-v2.0】发送方紧急保护 — 仅在极端情况下清理本地残留
  // 不再调用 permanentDeleteAllMessages，避免误删云端消息导致对方收不到
  if (!isFromInvite) {
    console.log('🔥 [发送方紧急保护] 检测到发送方身份，开始历史消息检查');
    
    const userMessages = messages.filter(msg => 
      !msg.isSystem && 
      msg.senderId !== 'system' &&
      !msg.content.includes('您创建了私密聊天') &&
      !msg.content.includes('建立了聊天')
    );
    
    console.log('🔥 [发送方紧急保护] 用户消息数量:', userMessages.length);
    console.log('🔥 [发送方紧急保护] 总消息数量:', messages.length);
    
    if (userMessages.length > 0) {
      const AGE_THRESHOLD = 300000; // 5分钟：远大于阅后即焚的最长生命周期
      const activeMessages = userMessages.filter(msg => {
        // 正在销毁/淡出/有定时器的消息属于正常生命周期，不是"历史消息"
        if (msg.destroying || msg.fading) return true;
        if (this.destroyTimers && this.destroyTimers.has(msg.id)) return true;
        let msgTimeValue = Date.now();
        if (msg.timestamp && typeof msg.timestamp === 'number') {
          msgTimeValue = msg.timestamp;
        } else if (msg.sendTime && typeof msg.sendTime === 'number') {
          msgTimeValue = msg.sendTime;
        } else if (msg._createTime) {
          msgTimeValue = typeof msg._createTime === 'number' ? msg._createTime : new Date(msg._createTime).getTime();
        }
        const age = currentTime - msgTimeValue;
        console.log('🔥 [时间戳检查] 消息:', msg.content, 'age:', age, 'destroying:', msg.destroying, 'fading:', msg.fading);
        return age < AGE_THRESHOLD;
      });

      const staleMessages = userMessages.filter(msg => !activeMessages.includes(msg));
      
      console.log('🔥 [发送方紧急保护] 活跃/正常消息数量:', activeMessages.length);
      console.log('🔥 [发送方紧急保护] 真正过期消息数量:', staleMessages.length);

      if (staleMessages.length > 0) {
        console.log('🔥 [发送方紧急保护] 仅清理本地过期消息（不删云端），保障对方可接收');
        const staleIds = new Set(staleMessages.map(m => m.id));
        const cleanMessages = messages.filter(msg => !staleIds.has(msg.id));
        this._localMessageCache = cleanMessages;
        this.setData({ messages: cleanMessages });
        // 注意：不调用 permanentDeleteAllMessages，不设 lastCleanupTime
      }

      // 为尚无定时器的活跃消息启动销毁倒计时
      activeMessages.forEach(msg => {
        if (!msg.destroyed && !msg.destroying && !msg.fading) {
          const hasTimer = this.destroyTimers && this.destroyTimers.has(msg.id);
          if (!hasTimer) {
            console.log('🔥 [自动销毁] 为消息启动销毁倒计时:', msg.content);
            this.startDestroyCountdown(msg.id);
          }
        }
      });

      if (staleMessages.length > 0) {
        return;
      }
    } else {
      console.log('🔥 [发送方紧急保护] ✅ 发送方环境纯净，无历史消息');
    }
  }

  // 🔥 【修复】避免重复检查，只在页面初始化时执行一次
  if (this.data.hasCheckedBurnAfterReading) {
    console.log('🔥 [阅后即焚检查] 已完成初始检查，跳过重复清理');
    return;
  }
  
  // 🔥 检查是否正在清理中
  if (this.data.isBurnAfterReadingCleaning) {
    console.log('🔥 [阅后即焚检查] 正在清理中，跳过检查');
    return;
  }

  // 🔥 过滤出用户消息（非系统消息），排除建立聊天的系统消息
  const userMessages = messages.filter(msg => 
    msg.senderId && 
    msg.senderId !== 'system' && 
    !msg.content.includes('您创建了私密聊天') &&
    !msg.content.includes('欢迎使用阅后即焚聊天') &&
    !msg.content.includes('建立了聊天')
  );

  console.log('🔥 [阅后即焚检查] 用户消息数量:', userMessages.length);
  console.log('🔥 [阅后即焚检查] 总消息数量:', messages.length);
  console.log('🔥 [阅后即焚检查] 参与者数量:', participants.length);

  // 🔥 【修复】只有在双方连接且检测到历史消息时才清理
  const shouldCleanup = userMessages.length > 0 && 
                       participants.length >= 2 && 
                       !this.data.isNewChatSession;

  if (shouldCleanup) {
    // 🔥 检查消息时间戳，如果都是最近发送的，可能是正常聊天
    const recentMessages = userMessages.filter(msg => {
      const msgTime = msg.timestamp || 0;
      return (currentTime - msgTime) < 60000; // 1分钟内的消息
    });

    if (recentMessages.length === userMessages.length) {
      console.log('🔥 [阅后即焚检查] 检测到的都是最近消息，可能是正常聊天，跳过清理');
      this.setData({ hasCheckedBurnAfterReading: true });
      return;
    }

    console.log('🔥 [阅后即焚] ⚠️ 检测到历史聊天数据，作为阅后即焚应用自动清理');
    console.log('🔥 [阅后即焚] 历史消息详情:', userMessages.map(m => ({
      senderId: m.senderId,
      content: m.content?.substring(0, 20),
      timestamp: m.timestamp,
      age: currentTime - (m.timestamp || 0)
    })));
    
    // 🔥 标记已检查，避免重复清理
    this.setData({ hasCheckedBurnAfterReading: true });
    
    // 🔥 立即强制清理
    this.forceBurnAfterReadingCleanup();
    
    // 🔥 显示清理提示
    wx.showToast({
      title: '🔥 历史消息已清理',
      icon: 'success',
      duration: 2000
    });
    
  } else {
    console.log('🔥 [阅后即焚检查] ✅ 未检测到需要清理的历史消息，聊天环境纯净');
    // 🔥 标记已检查
    this.setData({ hasCheckedBurnAfterReading: true });
  }
},
/**
 * 🔧 清理残留数据
 */
cleanupStaleData: function() {
  console.log('🔧 [清理残留] 开始清理残留聊天数据');
     
     const messages = this.data.messages || [];
     const currentTime = Date.now();
     
     // 🔥 过滤出用户消息（非系统消息）
     const userMessages = messages.filter(msg => 
       msg.senderId && 
       msg.senderId !== 'system' && 
       !msg.content.includes('您创建了私密聊天')
     );
     
     console.log('🔥 [阅后即焚检查] 用户消息数量:', userMessages.length);
     
     // 🔥 如果有任何历史用户消息，立即清理
     if (userMessages.length > 0) {
       console.log('🔥 [阅后即焚检查] ⚠️ 检测到历史用户消息，违反阅后即焚原则，立即清理');
       this.burnAfterReadingCleanup();
     } else {
       console.log('🔥 [阅后即焚检查] ✅ 未检测到历史用户消息，聊天环境纯净');
     }
  },

   // 🔥 ==================== 阅后即焚增强功能 ====================


   /**
    * @private 实际执行云端删除
    */
   _doCloudDelete: function(messageId) {
     wx.cloud.callFunction({
       name: 'permanentDeleteMessage',
       data: { messageId: messageId },
       success: (res) => {
         console.log('🗑️ [彻底删除] 云端延迟删除成功:', messageId, res.result);
       },
       fail: (err) => {
         console.error('🗑️ [彻底删除] 云端延迟删除失败:', messageId, err);
       }
     });
   },
  /**
   * 🧪 【开发调试】添加测试方法到页面实例
   */
  addTestMethods: function() {
    TestMethods.attach(this);
  },
  
  /**
   * 🔥 【HOTFIX-v1.3.57】清理重复的B端系统消息
   */
  removeDuplicateBEndMessages: function() {
    console.log('🔥 [清理重复消息-v57] 开始清理重复的B端系统消息');
    
    const messages = this.data.messages || [];
    const isFromInvite = !!this.data.isFromInvite;
    if (!isFromInvite) {
      console.log('🛡️ [清理重复消息-v57] A端环境，跳过B端去重');
      return;
    }
    const joinMessages = [];
    const otherMessages = [];
    
    // 分离加入消息和其他消息
    messages.forEach(msg => {
      if (msg && msg.isSystem && typeof msg.content === 'string' && msg.content.includes('加入') && msg.content.includes('的聊天')) {
        joinMessages.push(msg);
      } else if (msg && msg.isSystem && typeof msg.content === 'string' && /^.+加入聊天$/.test(msg.content)) {
        // 始终移除 A 端样式“XX加入聊天”（B端不应出现）
        console.log('🧹 [清理重复消息-v57] 移除A端样式系统消息:', msg.content);
        // 不加入otherMessages
      } else {
        otherMessages.push(msg);
      }
    });
    
    if (joinMessages.length <= 1) {
      console.log('🔥 [清理重复消息-v57] 没有重复的B端加入消息');
      return;
    }
    
    console.log(`🔥 [清理重复消息-v57] 发现${joinMessages.length}条重复的B端加入消息，保留最新的一条`);
    
    // 只保留最新的加入消息（通常是最后一个）
    const latestJoinMessage = joinMessages[joinMessages.length - 1];
    
    // 重新组合消息列表
    const cleanedMessages = [...otherMessages, latestJoinMessage];
    
    // 按时间排序（如果有时间戳的话）
    cleanedMessages.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return 0;
    });
    
    this.setData({
      messages: cleanedMessages
    });
    
    console.log(`🔥 [清理重复消息-v57] ✅ 重复消息清理完成，从${messages.length}条减少到${cleanedMessages.length}条`);
  }
});