/**
 * chat.js 集成测试:模拟微信小程序运行时,验证 Page 对象能完整加载
 *
 * 检查点:
 * 1. chat.js 整体加载无错(require 链路完整)
 * 2. Page() 调用收到完整对象 — 含 onLoad / onShow / onUnload 等核心生命周期
 * 3. 所有核心模块能被 require 且导出完整
 * 4. 关键方法在 Page 对象上存在(薄壳没有失踪)
 */

const path = require('path');

// ============ 模拟 wx 全局 ============
const mockStorage = {};
let mockAppData = {
  globalData: {
    userInfo: { openId: 'test_uA', nickName: '测试用户A' },
    openId: 'test_uA',
    hasLogin: true,
    cloudInitialized: true,
    SAFE_MODE: true
  },
  saveInviteInfo: () => {},
  getStoredInviteInfo: () => null,
  globalDestroyedMessageStore: {}
};

global.wx = {
  cloud: {
    callFunction: ({ success }) => success && success({ result: { success: false } }),
    init: () => {},
    database: () => ({}),
    uploadFile: () => {}
  },
  getStorageSync: (k) => mockStorage[k],
  setStorageSync: (k, v) => { mockStorage[k] = v; },
  removeStorageSync: (k) => { delete mockStorage[k]; },
  getRecorderManager: () => ({
    onStart: () => {}, onStop: () => {}, onError: () => {},
    start: () => {}, stop: () => {}
  }),
  createInnerAudioContext: () => ({
    onEnded: () => {}, onError: () => {},
    stop: () => {}, play: () => {}, src: ''
  }),
  onKeyboardHeightChange: () => {},
  offKeyboardHeightChange: () => {},
  onUserCaptureScreen: () => {},
  onNetworkStatusChange: () => {},
  onPageNotFound: () => {},
  getWindowInfo: () => ({ windowHeight: 700, safeArea: { top: 44 } }),
  getAppBaseInfo: () => ({ platform: 'devtools' }),
  createSelectorQuery: () => ({
    select: () => ({
      boundingClientRect: () => ({ exec: () => {} })
    })
  }),
  pageScrollTo: () => {},
  showToast: () => {},
  showModal: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  showActionSheet: () => {},
  setNavigationBarTitle: () => {},
  setClipboardData: () => {},
  navigateBack: () => {},
  redirectTo: () => {},
  reLaunch: () => {},
  navigateTo: () => {},
  nextTick: (cb) => cb && cb(),
  getSetting: () => {},
  authorize: () => {},
  openSetting: () => {}
};

global.getApp = () => mockAppData;
global.getCurrentPages = () => [{ options: {} }];

// ============ 截获 Page 调用 ============
let pageOpts = null;
global.Page = (opts) => {
  pageOpts = opts;
};

// ============ 加载 chat.js ============
console.log('[1] 加载 chat.js...');
try {
  require(path.join(__dirname, '../app/pages/chat/chat.js'));
  console.log('   ✅ chat.js 加载成功');
} catch (e) {
  console.error('   ❌ chat.js 加载失败:', e.message);
  process.exit(1);
}

if (!pageOpts) {
  console.error('   ❌ Page() 未被调用');
  process.exit(1);
}
console.log(`   ✅ Page() 收到对象,包含 ${Object.keys(pageOpts).length} 个 key`);

// ============ 检查关键生命周期 ============
console.log('\n[2] 检查生命周期方法...');
const REQUIRED_HOOKS = ['onLoad', 'onShow', 'onUnload', 'onHide', 'onShareAppMessage', 'onPullDownRefresh', 'data'];
let missing = [];
for (const k of REQUIRED_HOOKS) {
  if (!(k in pageOpts)) missing.push(k);
}
if (missing.length === 0) {
  console.log('   ✅ 所有生命周期/必需 key 齐全');
} else {
  console.error('   ❌ 缺失:', missing);
  process.exit(1);
}

// ============ 检查 wxml 绑定的事件方法 ============
console.log('\n[3] 检查 wxml 事件绑定方法...');
// 从 chat.wxml 抽取所有 bind* / catch* 绑定的方法名
const fs = require('fs');
const wxml = fs.readFileSync(path.join(__dirname, '../app/pages/chat/chat.wxml'), 'utf-8');
const eventBindings = new Set();
const re = /(?:bind|catch)\w+\s*=\s*"(\w+)"/g;
let m;
while ((m = re.exec(wxml)) !== null) {
  eventBindings.add(m[1]);
}
console.log(`   chat.wxml 中绑定 ${eventBindings.size} 个事件方法:`, [...eventBindings].join(', '));

let missingBind = [];
for (const name of eventBindings) {
  if (!(name in pageOpts)) missingBind.push(name);
}
if (missingBind.length === 0) {
  console.log('   ✅ 所有 wxml 事件方法都在 Page 对象上');
} else {
  console.error('   ❌ wxml 绑定但 Page 上缺失:', missingBind);
  process.exit(1);
}

// ============ 检查模块导入完整性 ============
console.log('\n[4] 模块导出完整性...');
const modules = {
  'chat-helpers': ['SYSTEM_MESSAGE_DEFAULTS', 'DEBUG_FLAGS', 'isPlaceholderJoinMessage', 'isPlaceholderNickname', 'parseDebugBoolean', 'formatTime', 'smartNicknameMatch'],
  'message-debug-hook': ['shouldEnable', 'install', 'uninstall'],
  'destroyed-store': ['getStorageKey', 'initialize', 'ensure'],
  'identity-utils': ['isReceiverEnvironment', 'isMessageFromCurrentUser', 'hasBEndJoinEver', 'markBEndJoinEver'],
  'test-methods': ['attach'],
  'voice-recorder': ['init'],
  'share-utils': ['recordChatVisit', 'buildSharePayload']
};
for (const [name, keys] of Object.entries(modules)) {
  const mod = require(path.join(__dirname, `../app/pages/chat/modules/${name}.js`));
  const missingKeys = keys.filter(k => !(k in mod));
  if (missingKeys.length === 0) {
    console.log(`   ✅ ${name}: 导出 ${Object.keys(mod).length} 项,关键 API 齐全`);
  } else {
    console.error(`   ❌ ${name} 缺失:`, missingKeys);
    process.exit(1);
  }
}

// ============ 检查 Page 上的关键方法 ============
console.log('\n[5] Page 关键方法存在性...');
const REQUIRED_PAGE_METHODS = [
  // 模块薄壳
  'isReceiverEnvironment', 'isMessageFromCurrentUser', 'isPlaceholderNickname',
  'hasBEndJoinEver', 'markBEndJoinEver', 'initializeDestroyedMessageStore',
  // 业务核心
  'fetchMessages', 'sendMessage',
  // wxml 事件入口
  ...[...eventBindings]
];
const missingMethods = REQUIRED_PAGE_METHODS.filter(m => !(m in pageOpts));
if (missingMethods.length === 0) {
  console.log(`   ✅ ${REQUIRED_PAGE_METHODS.length} 个关键方法全部存在`);
} else {
  console.error('   ❌ 缺失:', missingMethods);
  process.exit(1);
}

// ============ 触发 attach 模式 ============
console.log('\n[6] 触发模块 attach...');
const fakePage = { data: {}, setData: () => {} };

const TestMethods = require(path.join(__dirname, '../app/pages/chat/modules/test-methods.js'));
TestMethods.attach(fakePage);
const tmCount = Object.keys(fakePage).filter(k => typeof fakePage[k] === 'function').length;
console.log(`   ✅ TestMethods.attach 挂上 ${tmCount} 个方法`);

const VoiceRecorder = require(path.join(__dirname, '../app/pages/chat/modules/voice-recorder.js'));
const fakePage2 = { data: {}, setData: () => {} };
VoiceRecorder.init(fakePage2);
const vrCount = Object.keys(fakePage2).filter(k => typeof fakePage2[k] === 'function').length;
console.log(`   ✅ VoiceRecorder.init 挂上 ${vrCount} 个方法`);

const SystemMessage = require(path.join(__dirname, '../app/pages/chat/modules/system-message.js'));
const fakePage3 = { data: {}, setData: () => {} };
SystemMessage.attach(fakePage3);
const smRequired = ['addSystemMessage', 'startSystemMessageFade'];
const smMissing = smRequired.filter(k => typeof fakePage3[k] !== 'function');
if (smMissing.length === 0) {
  const smCount = Object.keys(fakePage3).filter(k => typeof fakePage3[k] === 'function').length;
  console.log(`   ✅ SystemMessage.attach 挂上 ${smCount} 个方法`);
} else {
  console.error('   ❌ SystemMessage 缺失:', smMissing);
  process.exit(1);
}

const TitleController = require(path.join(__dirname, '../app/pages/chat/modules/title-controller.js'));
const fakePage4 = { data: {}, setData: () => {} };
TitleController.attach(fakePage4);
const tcRequired = ['updateTitleForReceiver', 'protectReceiverTitle', 'updateReceiverTitleWithRealNames', 'fetchRealInviterNameAndUpdateTitle', 'updateDynamicTitle', 'updateDynamicTitleWithRealNames', 'updateTitleWithRealNickname'];
const tcMissing = tcRequired.filter(k => typeof fakePage4[k] !== 'function');
if (tcMissing.length === 0) {
  const tcCount = Object.keys(fakePage4).filter(k => typeof fakePage4[k] === 'function').length;
  console.log(`   ✅ TitleController.attach 挂上 ${tcCount} 个方法`);
} else {
  console.error('   ❌ TitleController 缺失:', tcMissing);
  process.exit(1);
}

const BurnAfterRead = require(path.join(__dirname, '../app/pages/chat/modules/burn-after-read.js'));
const fakePage5 = { data: {}, setData: () => {} };
BurnAfterRead.attach(fakePage5);
const barRequired = ['destroyMessage', 'permanentlyDeleteMessage', 'startDestroyCountdown', 'startFadingDestroy', 'clearAllDestroyTimers', 'markMessageAsReadAndDestroy', 'processOfflineMessages'];
const barMissing = barRequired.filter(k => typeof fakePage5[k] !== 'function');
if (barMissing.length === 0) {
  const barCount = Object.keys(fakePage5).filter(k => typeof fakePage5[k] === 'function').length;
  console.log(`   ✅ BurnAfterRead.attach 挂上 ${barCount} 个方法`);
} else {
  console.error('   ❌ BurnAfterRead 缺失:', barMissing);
  process.exit(1);
}

const ParticipantListener = require(path.join(__dirname, '../app/pages/chat/modules/participant-listener.js'));
const fakePage6 = { data: {}, setData: () => {} };
ParticipantListener.attach(fakePage6);
const plRequired = ['startParticipantListener', 'startWatchingForNewParticipants', 'fetchChatParticipants', 'fetchChatParticipantsWithRealNames', 'getOtherParticipantRealName', 'retryGetRealInviterName', 'cleanupDuplicateParticipants', 'deduplicateParticipants'];
const plMissing = plRequired.filter(k => typeof fakePage6[k] !== 'function');
if (plMissing.length === 0) {
  const plCount = Object.keys(fakePage6).filter(k => typeof fakePage6[k] === 'function').length;
  console.log(`   ✅ ParticipantListener.attach 挂上 ${plCount} 个方法`);
} else {
  console.error('   ❌ ParticipantListener 缺失:', plMissing);
  process.exit(1);
}

const ChatDebugTools = require(path.join(__dirname, '../app/pages/chat/modules/chat-debug-tools.js'));
const fakePage7 = { data: {}, setData: () => {} };
ChatDebugTools.attach(fakePage7);
const cdtRequired = ['showIdentityFixDialog', 'fixIdentityToSender', 'quickTitleTest', 'testReceiverTitle', 'switchUserForTesting', 'emergencyFixUserIdentity', 'emergencyFixConnection', 'burnAfterReadingCleanup', 'cleanupStaleData', 'startOnlineStatusMonitor'];
const cdtMissing = cdtRequired.filter(k => typeof fakePage7[k] !== 'function');
if (cdtMissing.length === 0) {
  const cdtCount = Object.keys(fakePage7).filter(k => typeof fakePage7[k] === 'function').length;
  console.log(`   ✅ ChatDebugTools.attach 挂上 ${cdtCount} 个方法`);
} else {
  console.error('   ❌ ChatDebugTools 缺失:', cdtMissing);
  process.exit(1);
}

const MessageListener = require(path.join(__dirname, '../app/pages/chat/modules/message-listener.js'));
const fakePage8 = { data: {}, setData: () => {} };
MessageListener.attach(fakePage8);
const mlRequired = ['startMessageListener', 'stopMessageListener'];
const mlMissing = mlRequired.filter(k => typeof fakePage8[k] !== 'function');
if (mlMissing.length === 0) {
  const mlCount = Object.keys(fakePage8).filter(k => typeof fakePage8[k] === 'function').length;
  console.log(`   ✅ MessageListener.attach 挂上 ${mlCount} 个方法`);
} else {
  console.error('   ❌ MessageListener 缺失:', mlMissing);
  process.exit(1);
}

console.log('\n[完成] chat.js 集成测试全部通过!');
