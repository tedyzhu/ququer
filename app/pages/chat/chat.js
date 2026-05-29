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
const MessageListener = require('./modules/message-listener.js');
const MessageFetch = require('./modules/message-fetch.js');
const ParticipantInfer = require('./modules/participant-infer.js');
const JoinByInvite = require('./modules/join-by-invite.js');
const RecoveryTools = require('./modules/recovery-tools.js');
const MessagePolling = require('./modules/message-polling.js');
const DbHelpers = require('./modules/db-helpers.js');
const Keyboard = require('./modules/keyboard.js');

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
    // 挂载实时消息监听子系统(详见 modules/message-listener.js)
    MessageListener.attach(this);
    // 挂载消息拉取子系统(详见 modules/message-fetch.js)
    MessageFetch.attach(this);
    // 挂载参与者推断子系统(详见 modules/participant-infer.js)
    ParticipantInfer.attach(this);
    // 挂载接收方加入子系统(详见 modules/join-by-invite.js)
    JoinByInvite.attach(this);
    // 挂载调试/应急修复工具子系统(详见 modules/recovery-tools.js)
    RecoveryTools.attach(this);
    // 挂载消息轮询子系统(详见 modules/message-polling.js)
    MessagePolling.attach(this);
    // 挂载数据库写入辅助(详见 modules/db-helpers.js)
    DbHelpers.attach(this);
    // 挂载键盘监听子系统(详见 modules/keyboard.js)
    Keyboard.attach(this);

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
    
    // 阶段 3a:决议最终身份(详见 modules/identity-resolver.js#resolveFinalIdentity)
    const identity = IdentityResolver.resolveFinalIdentity(this, {
      isNewChat,
      skipCreatorCheck,
      inviteInfo,
      inviter,
      isFromInvite,
      options,
      userInfo,
    });
    let finalIsFromInvite = identity.finalIsFromInvite;
    
    // 设置聊天标题
    let chatTitle = '秘信聊天';
    if (isNewChat) {
      chatTitle = `${userName || userInfo?.nickName || '用户'}的聊天`;
    } else if (inviter) {
      chatTitle = `与${decodeURIComponent(decodeURIComponent(inviter))}的聊天`; // 🔧 双重解码修复
    }
    
    // 阶段 3b:基于最终身份设置初始标题(详见 modules/identity-resolver.js#setupInitialTitle)
    // 注:actualCurrentUser 此时仍未声明,与原 chat.js 行为一致(那段对 actualCurrentUser
    // 的引用本就是 undefined fallback,保留作为已死兼容)
    const initialTitle = IdentityResolver.setupInitialTitle(this, {
      finalIsFromInvite,
      inviter,
      userInfo,
      actualCurrentUser: undefined, // 与原 chat.js 等价(setupInitialTitle 时 actualCurrentUser 还没声明)
    });
    
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
    
    // 阶段 4:基于已确认身份执行分支动作(详见 modules/identity-resolver.js#runIdentityBranchActions)
    IdentityResolver.runIdentityBranchActions(this, {
      finalIsFromInvite,
      chatId,
      inviter,
      userName,
      isNewChat,
    });
    
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
   * 记录聊天访问历史(详见 modules/share-utils.js#recordChatVisit)
   * @param {string} chatId
   * @param {string} userId
   */
  recordChatVisit: function(chatId, userId) {
    ShareUtils.recordChatVisit(chatId, userId);
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
  
});