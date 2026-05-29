/**
 * participant-listener.js 关键路径行为测试
 *
 * 覆盖参与者监听子系统 8 个对外方法中 5 个核心方法的关键分支。
 * 余下 3 个方法(cleanupDuplicateParticipants / startWatchingForNewParticipants /
 * fetchChatParticipantsWithRealNames)依赖大量 page 上下文与异步链,
 * 性价比偏低,本次保留不测。
 *
 * 测试范围:
 * - getOtherParticipantRealName: 纯函数式参与者过滤(4 用例)
 * - retryGetRealInviterName: 立即调 fetch + 1000ms 后回调 setData(3 用例)
 * - deduplicateParticipants: ≤2 不去重 / >2 去重 / 当前用户不在列表时补入(4 用例)
 * - fetchChatParticipants: 无 chatId 闸门 / success 标准化 / success=false 备用 / fail 兜底(4 用例)
 * - startParticipantListener: 启动 watch / 旧 watcher 关闭 / try 异常吞错(3 用例)
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
function resetTimers() { timeoutTasks.length = 0; }

// ====== 可控 wx.cloud ======
let cloudResponse = { success: true };
let cloudShouldFail = false;
let lastCloudCall = null;
let watchShouldThrow = false;
let lastWatchArgs = null;
let lastWatchedDocId = null;
const watchedHandle = { closed: false, close: function() { this.closed = true; } };

global.wx = {
  cloud: {
    callFunction: ({ name, data, success, fail }) => {
      lastCloudCall = { name, data };
      if (cloudShouldFail) fail && fail(new Error('mock fail'));
      else success && success({ result: cloudResponse });
    },
    database: () => ({
      collection: () => ({
        doc: function(docId) {
          lastWatchedDocId = docId;
          return this;
        },
        watch: function(args) {
          if (watchShouldThrow) throw new Error('mock watch fail');
          lastWatchArgs = args;
          watchedHandle.closed = false;
          return watchedHandle;
        },
      }),
    }),
    init: () => {},
  },
  setNavigationBarTitle: ({ success }) => { success && success(); },
  showToast: () => {},
  showModal: () => {},
  getStorageSync: () => undefined,
  setStorageSync: () => {},
};

global.getApp = () => ({
  globalData: { userInfo: { openId: 'me' }, openId: 'me' },
});

// ====== 加载模块 ======
const ParticipantListener = require(path.join(__dirname, '../app/pages/chat/modules/participant-listener.js'));

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
      participants: [],
      currentUser: { openId: 'me', nickName: 'Me', avatarUrl: '/me.png' },
      contactId: 'chat_x',
      isFromInvite: false,
    },
    setData(patch, cb) {
      for (const k in patch) this.data[k] = patch[k];
      setDataCalls.push(patch);
      if (cb) cb();
    },
    updateDynamicTitle() { this._titleUpdates = (this._titleUpdates || 0) + 1; },
    inferParticipantsFromMessages() { this._inferCalls = (this._inferCalls || 0) + 1; },
    updateUserInfoInDatabase() {},
    fetchMessages() {},
    startMessageListener() {},
  }, overrides || {});
  page._setDataCalls = setDataCalls;
  ParticipantListener.attach(page);
  // 注意:attach 会覆盖 fetchChatParticipantsWithRealNames 为真实实现,
  // 这里在 attach 之后再覆盖回 mock,避免测试调到真实云函数路径
  page.fetchChatParticipantsWithRealNames = function() {
    this._realFetchCalls = (this._realFetchCalls || 0) + 1;
  };
  return page;
}

// 静默 console
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
function silenceLogs() { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
function restoreLogs() { console.log = origLog; console.warn = origWarn; console.error = origError; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

// ============ getOtherParticipantRealName ============
origLog('--- getOtherParticipantRealName ---');

// 用例 1:无 currentUser openId 时返回 null
{
  const page = makeFakePage({
    data: {
      participants: [{ openId: 'a' }, { openId: 'b' }],
      currentUser: { openId: '' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  const r = withSilence(() => page.getOtherParticipantRealName());
  assertEqual('1.无 currentUser openId 时返回 null', r, null);
}

// 用例 2:参与者 < 2 时返回 null
{
  const page = makeFakePage({
    data: {
      participants: [{ openId: 'me' }],
      currentUser: { openId: 'me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  const r = withSilence(() => page.getOtherParticipantRealName());
  assertEqual('2.参与者 < 2 时返回 null', r, null);
}

// 用例 3:找到对方,返回 nickName
{
  const page = makeFakePage({
    data: {
      participants: [
        { openId: 'me', nickName: 'Me' },
        { openId: 'friend', nickName: 'Bob' },
      ],
      currentUser: { openId: 'me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  const r = withSilence(() => page.getOtherParticipantRealName());
  assertEqual('3.返回对方 nickName', r, 'Bob');
}

// 用例 4:对方无 nickName 时 fallback 到 name
{
  const page = makeFakePage({
    data: {
      participants: [
        { openId: 'me' },
        { openId: 'other', name: 'Alice' },
      ],
      currentUser: { openId: 'me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  const r = withSilence(() => page.getOtherParticipantRealName());
  assertEqual('4.fallback 到 name 字段', r, 'Alice');
}

// ============ retryGetRealInviterName ============
origLog('\n--- retryGetRealInviterName ---');

// 用例 5:立即触发 fetchChatParticipantsWithRealNames + 注册 1000ms 回调
{
  resetTimers();
  const page = makeFakePage();
  withSilence(() => page.retryGetRealInviterName());
  assertEqual('5.立即调 fetchChatParticipantsWithRealNames', page._realFetchCalls, 1);
  const cb = timeoutTasks.find(t => t.delay === 1000);
  assert('5.注册 1000ms 回调', !!cb);
}

// 用例 6:1000ms 回调中拿到真实昵称 → setData 更新标题
{
  resetTimers();
  const page = makeFakePage({
    data: {
      participants: [],
      currentUser: { openId: 'me', nickName: 'Me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  withSilence(() => page.retryGetRealInviterName());
  // 在回调执行前注入参与者(模拟 fetch 完成)
  page.data.participants = [
    { openId: 'me', nickName: 'Me' },
    { openId: 'friend', nickName: '小明', isSelf: false },
  ];
  const cb = timeoutTasks.find(t => t.delay === 1000);
  withSilence(() => cb.fn());
  assertEqual('6.dynamicTitle 含真实昵称', page.data.dynamicTitle, '我和小明（2）');
}

// 用例 7:1000ms 回调中只拿到占位昵称("用户")→ 不更新标题
{
  resetTimers();
  const page = makeFakePage({
    data: {
      participants: [],
      currentUser: { openId: 'me', nickName: 'Me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  withSilence(() => page.retryGetRealInviterName());
  page.data.participants = [
    { openId: 'me', nickName: 'Me', isSelf: true },
    { openId: 'friend', nickName: '用户', isSelf: false },
  ];
  const cb = timeoutTasks.find(t => t.delay === 1000);
  const setDataCallsBefore = page._setDataCalls.length;
  withSilence(() => cb.fn());
  // dynamicTitle 不应被设置
  assertEqual('7.占位昵称时不设 dynamicTitle', page.data.dynamicTitle, undefined);
}

// ============ deduplicateParticipants ============
origLog('\n--- deduplicateParticipants ---');

// 用例 8:参与者 ≤ 2 时不去重(直接 return)
{
  const before = [
    { openId: 'me', nickName: 'Me' },
    { openId: 'friend', nickName: 'Bob' },
  ];
  const page = makeFakePage({
    data: {
      participants: before,
      currentUser: { openId: 'me', nickName: 'Me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  withSilence(() => page.deduplicateParticipants());
  assertEqual('8.≤2 人时 setData 不被调', page._setDataCalls.length, 0);
  assertEqual('8.participants 不变', page.data.participants.length, 2);
}

// 用例 9:>2 人时去重为 2 人(当前用户 + 1 个对方)
{
  const before = [
    { openId: 'me', nickName: 'Me' },
    { openId: 'friend', nickName: 'Bob' },
    { openId: 'friend', nickName: 'Bob_dup' }, // 重复
    { openId: 'me', nickName: 'Me_dup' }, // 重复
  ];
  const page = makeFakePage({
    data: {
      participants: before,
      currentUser: { openId: 'me', nickName: 'Me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  withSilence(() => page.deduplicateParticipants());
  assertEqual('9.去重后 2 人', page.data.participants.length, 2);
  const ids = page.data.participants.map(p => p.openId);
  assert('9.含当前用户', ids.includes('me'));
  assert('9.含对方', ids.includes('friend'));
}

// 用例 10:当前用户不在列表中时,手动补入
{
  const before = [
    { openId: 'a', nickName: 'A' },
    { openId: 'b', nickName: 'B' },
    { openId: 'c', nickName: 'C' }, // 3 人触发去重
  ];
  const page = makeFakePage({
    data: {
      participants: before,
      currentUser: { openId: 'me', nickName: 'Me', avatarUrl: '/me.png' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  withSilence(() => page.deduplicateParticipants());
  const ids = page.data.participants.map(p => p.openId);
  assert('10.当前用户被补入', ids.includes('me'));
  assertEqual('10.总数=2(自己+1 对方)', page.data.participants.length, 2);
}

// 用例 11:isSelf 标记正确
{
  const before = [
    { openId: 'me', nickName: 'Me' },
    { openId: 'a', nickName: 'A' },
    { openId: 'b', nickName: 'B' }, // 3 人触发
  ];
  const page = makeFakePage({
    data: {
      participants: before,
      currentUser: { openId: 'me', nickName: 'Me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  withSilence(() => page.deduplicateParticipants());
  const me = page.data.participants.find(p => p.openId === 'me');
  const other = page.data.participants.find(p => p.openId !== 'me');
  assertEqual('11.当前用户 isSelf=true', me && me.isSelf, true);
  assertEqual('11.对方 isSelf=false', other && other.isSelf, false);
}

// ============ fetchChatParticipants ============
origLog('\n--- fetchChatParticipants ---');

// 用例 12:无 chatId 时跳过
{
  resetTimers();
  lastCloudCall = null;
  const page = makeFakePage({
    data: {
      participants: [],
      currentUser: { openId: 'me' },
      contactId: '', // 空
      isFromInvite: false,
    },
  });
  withSilence(() => page.fetchChatParticipants());
  assertEqual('12.无 chatId 时不调 cloud', lastCloudCall, null);
}

// 用例 13:cloud success 时标准化参与者并 setData
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = {
    success: true,
    participants: [
      { openId: 'me', nickName: 'Me' },
      { id: 'friend', name: 'Bob', avatar: '/bob.png' },
    ],
  };
  const page = makeFakePage();
  withSilence(() => page.fetchChatParticipants());
  assertEqual('13.cloud 名 = getChatParticipants', lastCloudCall.name, 'getChatParticipants');
  assertEqual('13.传入 chatId', lastCloudCall.data.chatId, 'chat_x');
  assertEqual('13.participants 长度=2', page.data.participants.length, 2);
  // 字段标准化:id/openId/nickName/avatarUrl 都齐
  const friend = page.data.participants.find(p => p.openId === 'friend');
  assertEqual('13.字段标准化 nickName(name fallback)', friend.nickName, 'Bob');
  assertEqual('13.字段标准化 avatarUrl(avatar fallback)', friend.avatarUrl, '/bob.png');
  // updateDynamicTitle 被调
  assertEqual('13.updateDynamicTitle 被调', page._titleUpdates, 1);
}

// 用例 14:cloud success=false + 当前用户被补入 + 触发 inferParticipantsFromMessages
{
  resetTimers();
  cloudShouldFail = false;
  cloudResponse = { success: false };
  const page = makeFakePage({
    data: {
      participants: [],
      currentUser: { openId: 'me', nickName: 'Me' },
      contactId: 'c',
      isFromInvite: false,
    },
  });
  withSilence(() => page.fetchChatParticipants());
  assertEqual('14.success=false 时补入当前用户', page.data.participants.length, 1);
  // 注册 1000ms inferParticipantsFromMessages
  const cb = timeoutTasks.find(t => t.delay === 1000);
  assert('14.注册 1000ms infer 回调', !!cb);
  withSilence(() => cb.fn());
  assertEqual('14.inferParticipantsFromMessages 被调', page._inferCalls, 1);
}

// 用例 15:cloud fail 时直接调 inferParticipantsFromMessages
{
  resetTimers();
  cloudShouldFail = true;
  const page = makeFakePage();
  withSilence(() => page.fetchChatParticipants());
  cloudShouldFail = false;
  assertEqual('15.fail 时直接 infer', page._inferCalls, 1);
}

// ============ startParticipantListener ============
origLog('\n--- startParticipantListener ---');

// 用例 16:启动 watch 监听 conversations.doc(chatId)
{
  resetTimers();
  watchShouldThrow = false;
  lastWatchArgs = null;
  lastWatchedDocId = null;
  const page = makeFakePage();
  withSilence(() => page.startParticipantListener('chat_abc'));
  assertEqual('16.watch 的 doc id', lastWatchedDocId, 'chat_abc');
  assert('16.watch onChange 已注册', !!(lastWatchArgs && typeof lastWatchArgs.onChange === 'function'));
  assert('16.participantWatcher 被赋值', !!page.participantWatcher);
}

// 用例 17:已有 watcher 时先关闭再重建
{
  resetTimers();
  const page = makeFakePage();
  const oldWatcher = { closed: false, close: function() { this.closed = true; } };
  page.participantWatcher = oldWatcher;
  withSilence(() => page.startParticipantListener('c2'));
  assertEqual('17.旧 watcher 被关闭', oldWatcher.closed, true);
  assert('17.新 watcher 被赋值', page.participantWatcher && page.participantWatcher !== oldWatcher);
}

// 用例 18:watch 抛异常时被 try 捕获,不冒泡
{
  resetTimers();
  watchShouldThrow = true;
  const page = makeFakePage();
  let threw = false;
  try { withSilence(() => page.startParticipantListener('c3')); }
  catch (e) { threw = true; }
  watchShouldThrow = false;
  assertEqual('18.异常被吞,不冒泡', threw, false);
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`participant-listener 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

// 还原全局
global.setTimeout = origSetTimeout;
global.clearTimeout = origClearTimeout;

if (fail > 0) process.exit(1);
