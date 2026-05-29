/**
 * message-fetch.js 关键路径行为测试
 *
 * 覆盖 fetchMessages / fetchMessagesAndMerge / showMockMessages 三个对外方法的核心分支:
 * - fakePage 模式 + setData 路径解析
 * - fake setTimeout(只记录,不执行)避免延迟逻辑干扰断言
 * - 可配置的 wx.cloud.callFunction mock(每用例自定义返回)
 *
 * 测试范围:
 * - showMockMessages: 3 条占位 + setData 写入
 * - fetchMessages: isLoading 闸门 / success+messages 路径 / B 端过滤 / 失败 → showMockMessages
 * - fetchMessagesAndMerge: 合并本地系统消息 / B 端过滤 / fail 不破坏现有消息
 */

const path = require('path');

// ====== fake setTimeout(只记录) ======
const timeoutTasks = [];
let timeoutCounter = 0;
const origSetTimeout = global.setTimeout;
const origClearTimeout = global.clearTimeout;
global.setTimeout = function(fn, delay) {
  timeoutCounter++;
  const id = 'to_' + timeoutCounter;
  timeoutTasks.push({ id, fn, delay, cleared: false });
  return id;
};
global.clearTimeout = function(id) {
  const t = timeoutTasks.find(x => x.id === id);
  if (t) t.cleared = true;
};
function resetTimers() {
  timeoutTasks.length = 0;
}

// ====== 可重写的 wx.cloud mock ======
let cloudResponse = { success: true, messages: [] };
let cloudShouldFail = false;
let lastCloudCall = null;

global.wx = {
  cloud: {
    callFunction: ({ name, data, success, fail }) => {
      lastCloudCall = { name, data };
      // 同步返回(测试中 setTimeout 已被 fake 化,不能依赖异步)
      if (cloudShouldFail) {
        fail && fail(new Error('mock cloud fail'));
      } else {
        success && success({ result: cloudResponse });
      }
    },
    init: () => {},
    database: () => ({}),
  },
  showLoading: () => {},
  hideLoading: () => {},
  showToast: () => {},
  setStorageSync: () => {},
  getStorageSync: () => undefined,
};

global.getApp = () => ({
  globalData: {
    userInfo: { openId: 'me' },
    openId: 'me',
  },
});

// 跨模块 getCurrentPages 占位(B 端 isFromInvite 路径里有调用)
global.getCurrentPages = () => [{ options: {} }];

// ====== 加载模块 ======
const MessageFetch = require(path.join(__dirname, '../app/pages/chat/modules/message-fetch.js'));

let pass = 0;
let fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail || ''}`); }
}
function assertEqual(name, got, expected) {
  assert(name, got === expected, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

/** 创建 fakePage 并 attach 模块方法 */
function makeFakePage(overrides) {
  const setDataCalls = [];
  const page = Object.assign({
    data: {
      messages: [],
      contactId: 'chat_x',
      currentUser: { openId: 'me', avatarUrl: '/me.png' },
      participants: [],
      isLoading: false,
      isFromInvite: false,
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
    setData(patch, cb) {
      for (const k in patch) {
        const m = k.match(/^messages\[(\d+)\]\.(.+)$/);
        if (m) {
          const idx = parseInt(m[1], 10);
          const field = m[2];
          if (!this.data.messages[idx]) this.data.messages[idx] = {};
          this.data.messages[idx][field] = patch[k];
        } else {
          this.data[k] = patch[k];
        }
      }
      setDataCalls.push(patch);
      if (cb) cb();
    },
    formatTime: (d) => '14:20',
    isMessageFromCurrentUser: function(senderId, currentOpenId) {
      return senderId === currentOpenId;
    },
    isReceiverEnvironment: function() { return !!this.data.isFromInvite; },
    ensureDestroyedMessageStore: function() {
      if (!this.globalDestroyedMessageIds) this.globalDestroyedMessageIds = new Set();
    },
    scheduleScrollToBottom: () => {},
    scrollToBottom: () => {},
    startDestroyCountdown: () => {},
    startSystemMessageFade: () => {},
    cleanupWrongSystemMessages: () => {},
    normalizeSystemMessagesAfterLoad: () => {},
    checkBurnAfterReadingCleanup: () => {},
    checkAndFixConnection: () => {},
    destroyTimers: new Map(),
    globalDestroyedMessageIds: new Set(),
    _localMessageCache: null,
    _watcherInitialized: false,
  }, overrides || {});
  page._setDataCalls = setDataCalls;
  MessageFetch.attach(page);
  return page;
}

// 静默 console
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
function silenceLogs() {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}
function restoreLogs() {
  console.log = origLog;
  console.warn = origWarn;
  console.error = origError;
}
function withSilence(fn) {
  silenceLogs();
  try { return fn(); }
  finally { restoreLogs(); }
}

// ============ showMockMessages ============
origLog('--- showMockMessages ---');

// 用例 1:setData 写入 3 条占位消息
{
  resetTimers();
  const page = makeFakePage();
  withSilence(() => page.showMockMessages());
  assertEqual('1.messages 长度=3', page.data.messages.length, 3);
  assertEqual('1.isLoading=false', page.data.isLoading, false);
}

// 用例 2:占位消息含基本字段
{
  resetTimers();
  const page = makeFakePage();
  withSilence(() => page.showMockMessages());
  const m = page.data.messages[0];
  assert('2.第 1 条有 id', !!m.id);
  assert('2.第 1 条有 content', !!m.content);
  assertEqual('2.第 1 条 isSystem=false', m.isSystem, false);
}

// ============ fetchMessages: 闸门 ============
origLog('\n--- fetchMessages: 闸门 ---');

// 用例 3:isLoading=true 时跳过(不调 cloud)
{
  resetTimers();
  lastCloudCall = null;
  const page = makeFakePage({
    data: {
      messages: [],
      contactId: 'c1',
      currentUser: { openId: 'me' },
      participants: [],
      isLoading: true, // 闸门已开
      isFromInvite: false,
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
  });
  withSilence(() => page.fetchMessages());
  assertEqual('3.isLoading 时跳过 cloud 调用', lastCloudCall, null);
}

// 用例 4:lastFetchTime 被记录
{
  resetTimers();
  lastCloudCall = null;
  cloudResponse = { success: true, messages: [] };
  cloudShouldFail = false;
  const page = makeFakePage();
  const before = Date.now();
  withSilence(() => page.fetchMessages());
  assert('4.lastFetchTime 被设置且不早于调用前', page.lastFetchTime >= before);
}

// ============ fetchMessages: 成功路径 ============
origLog('\n--- fetchMessages: 成功路径 ---');

// 用例 5:cloud 返回 messages,setData 应包含转换后的消息
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 'msg1', senderId: 'other', content: 'hello', type: 'text', sendTime: Date.now(), status: 'sent' },
    ],
  };
  const page = makeFakePage();
  withSilence(() => page.fetchMessages());
  assertEqual('5.cloud 名 = getMessages', lastCloudCall.name, 'getMessages');
  assertEqual('5.传入 chatId', lastCloudCall.data.chatId, 'chat_x');
  assertEqual('5.messages 长度=1', page.data.messages.length, 1);
  assertEqual('5.消息 id 正确', page.data.messages[0].id, 'msg1');
  assertEqual('5.isLoading=false', page.data.isLoading, false);
}

// 用例 6:server 返回的 destroyed=true 消息被过滤
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 'a', senderId: 'other', content: 'live', type: 'text', sendTime: Date.now() },
      { _id: 'b', senderId: 'other', content: 'dead', type: 'text', sendTime: Date.now(), destroyed: true },
    ],
  };
  const page = makeFakePage();
  withSilence(() => page.fetchMessages());
  assertEqual('6.destroyed 消息被过滤,只剩 1 条', page.data.messages.length, 1);
  assertEqual('6.剩下的是 live', page.data.messages[0].id, 'a');
}

// 用例 7:无 _id/id 的消息被跳过(避免 key 冲突)
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 'has_id', senderId: 'other', content: 'ok', type: 'text', sendTime: Date.now() },
      { senderId: 'other', content: 'no_id', type: 'text', sendTime: Date.now() }, // 无 id
    ],
  };
  const page = makeFakePage();
  withSilence(() => page.fetchMessages());
  assertEqual('7.无 id 消息被跳过', page.data.messages.length, 1);
  assertEqual('7.剩下的是 has_id', page.data.messages[0].id, 'has_id');
}

// 用例 8:globalDestroyedMessageIds 中的消息被跳过
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 'survivor', senderId: 'other', content: 'a', type: 'text', sendTime: Date.now() },
      { _id: 'banned', senderId: 'other', content: 'b', type: 'text', sendTime: Date.now() },
    ],
  };
  const page = makeFakePage();
  page.globalDestroyedMessageIds = new Set(['banned']);
  withSilence(() => page.fetchMessages());
  assertEqual('8.全局销毁记录中的消息被过滤', page.data.messages.length, 1);
  assertEqual('8.剩下的是 survivor', page.data.messages[0].id, 'survivor');
}

// ============ fetchMessages: B 端过滤 ============
origLog('\n--- fetchMessages: B 端过滤 ---');

// 用例 9:B 端过滤 A 端创建消息("您创建了私密聊天")
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 's1', senderId: 'system', content: '您创建了私密聊天，可点击右上角菜单分享链接邀请朋友加入', type: 'system', sendTime: Date.now() },
      { _id: 's2', senderId: 'system', content: '加入小明的聊天', type: 'system', sendTime: Date.now() }, // B 端正确格式
    ],
  };
  const page = makeFakePage({
    data: {
      messages: [],
      contactId: 'c1',
      currentUser: { openId: 'me' },
      participants: [],
      isLoading: false,
      isFromInvite: true, // B 端
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
  });
  withSilence(() => page.fetchMessages());
  assertEqual('9.B 端只剩 1 条系统消息', page.data.messages.length, 1);
  assertEqual('9.保留 B 端格式', page.data.messages[0].content, '加入小明的聊天');
}

// 用例 10:B 端过滤 A 端"XX加入聊天"格式
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 's1', senderId: 'system', content: '小红加入聊天', type: 'system', sendTime: Date.now() }, // A 端格式
      { _id: 's2', senderId: 'system', content: '加入小明的聊天', type: 'system', sendTime: Date.now() }, // B 端格式
    ],
  };
  const page = makeFakePage({
    data: {
      messages: [],
      contactId: 'c1',
      currentUser: { openId: 'me' },
      participants: [],
      isLoading: false,
      isFromInvite: true,
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
  });
  withSilence(() => page.fetchMessages());
  assertEqual('10.B 端只剩 B 端格式', page.data.messages.length, 1);
  assertEqual('10.内容是 B 端格式', page.data.messages[0].content, '加入小明的聊天');
}

// ============ fetchMessages: 失败路径 ============
origLog('\n--- fetchMessages: 失败路径 ---');

// 用例 11:cloud success=false 时调 showMockMessages
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = { success: false };
  let mockCalled = 0;
  const page = makeFakePage();
  // 替换 attach 后的 showMockMessages,验证被触发
  page.showMockMessages = function() { mockCalled++; };
  withSilence(() => page.fetchMessages());
  assertEqual('11.success=false 时调 showMockMessages', mockCalled, 1);
}

// 用例 12:cloud fail 时调 showMockMessages
{
  resetTimers();
  cloudShouldFail = true;
  let mockCalled = 0;
  const page = makeFakePage();
  page.showMockMessages = function() { mockCalled++; };
  withSilence(() => page.fetchMessages());
  assertEqual('12.cloud fail 时调 showMockMessages', mockCalled, 1);
  assertEqual('12.失败时 isLoading=false', page.data.isLoading, false);
}

// ============ fetchMessagesAndMerge ============
origLog('\n--- fetchMessagesAndMerge ---');

// 用例 13:本地 sys_xxx 系统消息被合并保留
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 'cloud_msg', senderId: 'other', content: 'from cloud', type: 'text', sendTime: Date.now() },
    ],
  };
  const localSys = {
    id: 'sys_local_1',
    isSystem: true,
    senderId: 'system',
    content: '本地系统消息',
    type: 'system',
    time: '14:30',
  };
  const page = makeFakePage({
    data: {
      messages: [localSys],
      contactId: 'c1',
      currentUser: { openId: 'me' },
      participants: [],
      isLoading: false,
      isFromInvite: false,
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
  });
  withSilence(() => page.fetchMessagesAndMerge());
  // 应包含云端 1 条 + 本地系统 1 条
  assertEqual('13.合并后总数=2', page.data.messages.length, 2);
  const ids = page.data.messages.map(m => m.id);
  assert('13.含云端消息', ids.includes('cloud_msg'));
  assert('13.含本地系统消息', ids.includes('sys_local_1'));
}

// 用例 14:本地系统消息排在最后
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 'cloud_a', senderId: 'other', content: 'a', type: 'text', sendTime: Date.now() },
    ],
  };
  const localSys = {
    id: 'sys_last',
    isSystem: true,
    senderId: 'system',
    content: '本地',
    type: 'system',
    time: '00:00',
  };
  const page = makeFakePage({
    data: {
      messages: [localSys],
      contactId: 'c1',
      currentUser: { openId: 'me' },
      participants: [],
      isLoading: false,
      isFromInvite: false,
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
  });
  withSilence(() => page.fetchMessagesAndMerge());
  // 排序逻辑:本地 sys_xxx 应在最后(即使时间早)
  const last = page.data.messages[page.data.messages.length - 1];
  assertEqual('14.本地系统消息排最后', last.id, 'sys_last');
}

// 用例 15:B 端在合并阶段过滤 A 端"XX加入聊天"
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    messages: [
      { _id: 's_aend', senderId: 'system', content: '小红加入聊天', type: 'system', sendTime: Date.now() },
      { _id: 's_bend', senderId: 'system', content: '加入小红的聊天', type: 'system', sendTime: Date.now() },
    ],
  };
  const page = makeFakePage({
    data: {
      messages: [],
      contactId: 'c1',
      currentUser: { openId: 'me' },
      participants: [],
      isLoading: false,
      isFromInvite: true, // B 端
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
  });
  withSilence(() => page.fetchMessagesAndMerge());
  // B 端只保留 B 端格式
  const contents = page.data.messages.map(m => m.content);
  assert('15.B 端不含 A 端格式', !contents.includes('小红加入聊天'));
  assert('15.B 端含 B 端格式', contents.includes('加入小红的聊天'));
}

// 用例 16:cloud fail 时不破坏现有消息(只 setData isLoading=false)
{
  resetTimers();
  cloudShouldFail = true;
  const existing = [
    { id: 'keep1', senderId: 'me', content: 'a', type: 'text', isSystem: false },
    { id: 'keep2', senderId: 'other', content: 'b', type: 'text', isSystem: false },
  ];
  const page = makeFakePage({
    data: {
      messages: existing,
      contactId: 'c1',
      currentUser: { openId: 'me' },
      participants: [],
      isLoading: false,
      isFromInvite: false,
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
  });
  withSilence(() => page.fetchMessagesAndMerge());
  assertEqual('16.fail 时保留原 messages 长度', page.data.messages.length, 2);
  assertEqual('16.fail 时 isLoading=false', page.data.isLoading, false);
}

// 用例 17:fetchMessagesAndMerge 调 cloud 用 chatId
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = { success: true, messages: [] };
  lastCloudCall = null;
  const page = makeFakePage({
    data: {
      messages: [],
      contactId: 'merge_chat_id',
      currentUser: { openId: 'me' },
      participants: [],
      isLoading: false,
      isFromInvite: false,
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
    },
  });
  withSilence(() => page.fetchMessagesAndMerge());
  assertEqual('17.cloud 名 = getMessages', lastCloudCall.name, 'getMessages');
  assertEqual('17.传入正确 chatId', lastCloudCall.data.chatId, 'merge_chat_id');
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`message-fetch 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

// 还原全局
global.setTimeout = origSetTimeout;
global.clearTimeout = origClearTimeout;

if (fail > 0) process.exit(1);
