/**
 * burn-after-read.js 关键方法行为测试
 *
 * 覆盖阅后即焚子系统的核心路径,采用 fake page 模式 + fake timers:
 * - 通过 attach(page) 把所有方法挂到 fakePage
 * - mock setData 只写入 page.data,不真做 wx 渲染
 * - mock wx.setStorageSync 收集存储写入
 * - fake setInterval / setTimeout 防止真定时器触发
 *
 * 测试范围:
 * - destroyMessage:委托 permanentlyDeleteMessage
 * - markMessageAsReadAndDestroy:isDestroying / remainTime / 调 startDestroyCountdown
 * - permanentlyDeleteMessage:清定时器 + 写 globalDestroyedMessageIds + setStorageSync + collapsing
 * - clearAllDestroyTimers:clear 所有定时器并清空 Map
 * - processOfflineMessages:离线消息识别(senderId / sendTime > backgroundTime)
 */

const path = require('path');

// ====== fake setInterval / setTimeout(全局,加载模块前替换) ======
const intervalTasks = [];
const timeoutTasks = [];
const origSetInterval = global.setInterval;
const origClearInterval = global.clearInterval;
const origSetTimeout = global.setTimeout;
const origClearTimeout = global.clearTimeout;

let intervalCounter = 0;
let timeoutCounter = 0;

global.setInterval = function(fn, delay) {
  intervalCounter++;
  const id = 'iv_' + intervalCounter;
  intervalTasks.push({ id, fn, delay, cleared: false });
  return id;
};
global.clearInterval = function(id) {
  const t = intervalTasks.find(x => x.id === id);
  if (t) t.cleared = true;
};
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

/** 跑所有未清的 timeout(按 delay 升序,支持嵌套注册) */
function runAllTimeouts() {
  let processed = 0;
  while (processed < timeoutTasks.length) {
    const batch = timeoutTasks.slice(processed).filter(t => !t.cleared).sort((a, b) => a.delay - b.delay);
    processed = timeoutTasks.length;
    for (const t of batch) {
      if (t.cleared) continue;
      try { t.fn(); } catch (e) { /* 静默 */ }
      t.cleared = true;
    }
  }
}
/** 跑一次所有未清 interval(模拟一次 tick) */
function tickAllIntervals() {
  const snapshot = intervalTasks.slice();
  for (const t of snapshot) {
    if (t.cleared) continue;
    try { t.fn(); } catch (e) {}
  }
}
function resetTimers() {
  intervalTasks.length = 0;
  timeoutTasks.length = 0;
}

// ====== mock wx 全局 ======
const storageWrites = [];
global.wx = {
  setStorageSync: (k, v) => { storageWrites.push({ k, v }); },
  getStorageSync: () => undefined,
};

global.getApp = () => ({ globalData: {} });

// ====== 加载模块 ======
const BurnAfterRead = require(path.join(__dirname, '../app/pages/chat/modules/burn-after-read.js'));

let pass = 0;
let fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail || ''}`); }
}
function assertEqual(name, got, expected) {
  assert(name, got === expected, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

/** 创建 fakePage 并 attach burn-after-read 方法 */
function makeFakePage(overrides) {
  const setDataCalls = [];
  const page = Object.assign({
    data: {
      messages: [],
      destroyTimeout: 10,
      backgroundTime: 0,
      currentUser: { openId: 'me' },
    },
    setData(patch, cb) {
      for (const k in patch) {
        // 支持 messages[i].xxx 路径
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
    ensureDestroyedMessageStore() { /* no-op,测试中已手动管理 */ },
    _doCloudDelete() { /* 静默云端删除 */ },
    _localMessageCache: null,
    destroyTimers: new Map(),
    globalDestroyedMessageIds: new Set(),
    destroyedStoreKey: 'destroyedMessageIds_test',
  }, overrides || {});
  page._setDataCalls = setDataCalls;
  BurnAfterRead.attach(page);
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

// ============ destroyMessage ============
origLog('--- destroyMessage ---');

// 用例 1:destroyMessage 委托 permanentlyDeleteMessage
{
  resetTimers();
  const page = makeFakePage();
  let calledWith = null;
  page.permanentlyDeleteMessage = function(id) { calledWith = id; };
  withSilence(() => page.destroyMessage('msg_1'));
  assertEqual('1.destroyMessage 委托 permanentlyDeleteMessage', calledWith, 'msg_1');
}

// 用例 2:permanentlyDeleteMessage 抛错时 destroyMessage 不冒泡
{
  resetTimers();
  const page = makeFakePage();
  page.permanentlyDeleteMessage = function() { throw new Error('boom'); };
  let threw = false;
  try { withSilence(() => page.destroyMessage('msg_2')); }
  catch (e) { threw = true; }
  assertEqual('2.destroyMessage 吞错不冒泡', threw, false);
}

// ============ markMessageAsReadAndDestroy ============
origLog('\n--- markMessageAsReadAndDestroy ---');

// 用例 3:设置 isDestroying + remainTime
{
  resetTimers();
  const page = makeFakePage({
    data: {
      messages: [{ id: 'm1', content: 'hello' }],
      destroyTimeout: 8,
      currentUser: { openId: 'me' },
    },
  });
  let countdownCalledWith = null;
  page.startDestroyCountdown = function(id) { countdownCalledWith = id; };
  withSilence(() => page.markMessageAsReadAndDestroy('m1', 0));
  assertEqual('3.isDestroying=true', page.data.messages[0].isDestroying, true);
  assertEqual('3.remainTime=destroyTimeout', page.data.messages[0].remainTime, 8);
  assertEqual('3.触发 startDestroyCountdown', countdownCalledWith, 'm1');
}

// 用例 4:不同 messageIndex 写入对应消息
{
  resetTimers();
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'a', content: 'a' },
        { id: 'b', content: 'b' },
        { id: 'c', content: 'c' },
      ],
      destroyTimeout: 5,
      currentUser: { openId: 'me' },
    },
  });
  page.startDestroyCountdown = function() {};
  withSilence(() => page.markMessageAsReadAndDestroy('b', 1));
  assertEqual('4.目标索引被标记', page.data.messages[1].isDestroying, true);
  assertEqual('4.其它索引不被影响', !!page.data.messages[0].isDestroying, false);
  assertEqual('4.其它索引不被影响 2', !!page.data.messages[2].isDestroying, false);
}

// ============ permanentlyDeleteMessage ============
origLog('\n--- permanentlyDeleteMessage ---');

// 用例 5:清理已存在的定时器
{
  resetTimers();
  storageWrites.length = 0;
  const page = makeFakePage({
    data: {
      messages: [{ id: 'm1', content: 'x' }],
      destroyTimeout: 5,
      currentUser: { openId: 'me' },
    },
  });
  page.destroyTimers.set('m1', 'iv_fake_1');
  withSilence(() => page.permanentlyDeleteMessage('m1'));
  assert('5.destroyTimers 中清掉了对应项', !page.destroyTimers.has('m1'));
}

// 用例 6:写入 globalDestroyedMessageIds
{
  resetTimers();
  storageWrites.length = 0;
  const page = makeFakePage({
    data: {
      messages: [{ id: 'm2', content: 'x' }],
      destroyTimeout: 5,
      currentUser: { openId: 'me' },
    },
  });
  withSilence(() => page.permanentlyDeleteMessage('m2'));
  assert('6.globalDestroyedMessageIds 包含 id', page.globalDestroyedMessageIds.has('m2'));
}

// 用例 7:写入 wx.setStorageSync
{
  resetTimers();
  storageWrites.length = 0;
  const page = makeFakePage({
    data: {
      messages: [{ id: 'm3', content: 'x' }],
      destroyTimeout: 5,
      currentUser: { openId: 'me' },
    },
  });
  withSilence(() => page.permanentlyDeleteMessage('m3'));
  assert('7.setStorageSync 被调用', storageWrites.length >= 1);
  const last = storageWrites[storageWrites.length - 1];
  assertEqual('7.使用自定义 destroyedStoreKey', last.k, 'destroyedMessageIds_test');
  assert('7.写入数组包含 m3', Array.isArray(last.v) && last.v.includes('m3'));
}

// 用例 8:超过 MAX_DESTROY_RECORDS 时截断
{
  resetTimers();
  storageWrites.length = 0;
  const ChatHelpers = require(path.join(__dirname, '../app/pages/chat/modules/chat-helpers.js'));
  const MAX = ChatHelpers.SYSTEM_MESSAGE_DEFAULTS.MAX_DESTROY_RECORDS;
  const existing = new Set();
  // 预先填到上限,再删一条新的应触发截断
  for (let i = 0; i < MAX; i++) existing.add('old_' + i);
  const page = makeFakePage({
    data: {
      messages: [{ id: 'newest', content: 'x' }],
      destroyTimeout: 5,
      currentUser: { openId: 'me' },
    },
    globalDestroyedMessageIds: existing,
  });
  withSilence(() => page.permanentlyDeleteMessage('newest'));
  const last = storageWrites[storageWrites.length - 1];
  assertEqual('8.写入数组长度=MAX_DESTROY_RECORDS', last.v.length, MAX);
  assert('8.最早的记录被截断', !last.v.includes('old_0'));
  assert('8.最新记录被保留', last.v.includes('newest'));
}

// 用例 9:设置目标消息 collapsing=true
{
  resetTimers();
  storageWrites.length = 0;
  const page = makeFakePage({
    data: {
      messages: [{ id: 'm4', content: 'x' }],
      destroyTimeout: 5,
      currentUser: { openId: 'me' },
    },
  });
  withSilence(() => page.permanentlyDeleteMessage('m4'));
  assertEqual('9.目标消息 collapsing=true', page.data.messages[0].collapsing, true);
}

// 用例 10:350ms 后从 messages 数组移除
{
  resetTimers();
  storageWrites.length = 0;
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'keep1', content: 'a' },
        { id: 'gone', content: 'b' },
        { id: 'keep2', content: 'c' },
      ],
      destroyTimeout: 5,
      currentUser: { openId: 'me' },
    },
  });
  withSilence(() => page.permanentlyDeleteMessage('gone'));
  // 跑 350ms 那个 setTimeout
  withSilence(() => runAllTimeouts());
  assertEqual('10.剩余 2 条', page.data.messages.length, 2);
  assert('10.gone 被移除', !page.data.messages.find(m => m.id === 'gone'));
  assert('10.keep1 保留', !!page.data.messages.find(m => m.id === 'keep1'));
  assert('10.keep2 保留', !!page.data.messages.find(m => m.id === 'keep2'));
}

// 用例 11:目标消息不存在时直接 filter 移除(非 collapsing 路径)
{
  resetTimers();
  storageWrites.length = 0;
  const page = makeFakePage({
    data: {
      messages: [{ id: 'other', content: 'x' }],
      destroyTimeout: 5,
      currentUser: { openId: 'me' },
    },
  });
  withSilence(() => page.permanentlyDeleteMessage('not_exist'));
  // 不应崩溃,messages 不变(filter 后还是 1 条)
  assertEqual('11.目标不存在时 messages 长度不变', page.data.messages.length, 1);
}

// ============ clearAllDestroyTimers ============
origLog('\n--- clearAllDestroyTimers ---');

// 用例 12:clear 所有定时器并清空 Map
{
  resetTimers();
  const page = makeFakePage();
  // 用 fake interval / timeout 各注册一个,记录 id
  const intervalId = global.setInterval(() => {}, 1000);
  const timeoutId = global.setTimeout(() => {}, 1000);
  page.destroyTimers.set('m1', intervalId);
  page.destroyTimers.set('m2', timeoutId);
  withSilence(() => page.clearAllDestroyTimers());
  assertEqual('12.destroyTimers Map 被清空', page.destroyTimers.size, 0);
  // 校验 fake timer 被标记 cleared
  const ivCleared = intervalTasks.find(t => t.id === intervalId);
  const toCleared = timeoutTasks.find(t => t.id === timeoutId);
  assert('12.interval 被 clearInterval', ivCleared && ivCleared.cleared);
  assert('12.timeout 被 clearTimeout', toCleared && toCleared.cleared);
}

// 用例 13:无 destroyTimers 时不报错
{
  resetTimers();
  const page = makeFakePage();
  page.destroyTimers = null;
  let threw = false;
  try { withSilence(() => page.clearAllDestroyTimers()); }
  catch (e) { threw = true; }
  assertEqual('13.无 destroyTimers 时安全返回', threw, false);
}

// ============ processOfflineMessages ============
origLog('\n--- processOfflineMessages ---');

// 用例 14:无 backgroundTime 时跳过
{
  resetTimers();
  const page = makeFakePage({
    data: {
      messages: [{ id: 'x', content: 'x', senderId: 'other', sendTime: 9999 }],
      backgroundTime: 0,
      currentUser: { openId: 'me' },
    },
  });
  let markCalled = 0;
  page.markMessageAsReadAndDestroy = function() { markCalled++; };
  withSilence(() => page.processOfflineMessages());
  assertEqual('14.无 backgroundTime 不调 mark', markCalled, 0);
}

// 用例 15:离线期间收到的他人消息触发销毁
{
  resetTimers();
  const past = 1000;
  const future = 2000;
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'old', content: 'a', senderId: 'other', sendTime: past },
        { id: 'new', content: 'b', senderId: 'other', sendTime: future },
      ],
      backgroundTime: 1500,
      currentUser: { openId: 'me' },
    },
  });
  const marked = [];
  page.markMessageAsReadAndDestroy = function(id, idx) { marked.push({ id, idx }); };
  withSilence(() => page.processOfflineMessages());
  assertEqual('15.只销毁 sendTime > backgroundTime 的消息', marked.length, 1);
  assertEqual('15.销毁的是 new', marked[0].id, 'new');
  assertEqual('15.索引正确', marked[0].idx, 1);
}

// 用例 16:自己的消息不销毁
{
  resetTimers();
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'mine', content: 'a', senderId: 'me', sendTime: 9999 },
        { id: 'theirs', content: 'b', senderId: 'other', sendTime: 9999 },
      ],
      backgroundTime: 1000,
      currentUser: { openId: 'me' },
    },
  });
  const marked = [];
  page.markMessageAsReadAndDestroy = function(id) { marked.push(id); };
  withSilence(() => page.processOfflineMessages());
  assertEqual('16.自己的消息不销毁', marked.length, 1);
  assertEqual('16.只销毁对方', marked[0], 'theirs');
}

// 用例 17:系统消息不销毁
{
  resetTimers();
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'sys', content: 'a', senderId: 'system', sendTime: 9999 },
        { id: 'normal', content: 'b', senderId: 'other', sendTime: 9999 },
      ],
      backgroundTime: 1000,
      currentUser: { openId: 'me' },
    },
  });
  const marked = [];
  page.markMessageAsReadAndDestroy = function(id) { marked.push(id); };
  withSilence(() => page.processOfflineMessages());
  assertEqual('17.系统消息不销毁', marked.length, 1);
  assertEqual('17.只销毁普通消息', marked[0], 'normal');
}

// 用例 18:已销毁/正在销毁的不重复处理
{
  resetTimers();
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'dead', content: 'a', senderId: 'other', sendTime: 9999, isDestroyed: true },
        { id: 'dying', content: 'b', senderId: 'other', sendTime: 9999, isDestroying: true },
        { id: 'fresh', content: 'c', senderId: 'other', sendTime: 9999 },
      ],
      backgroundTime: 1000,
      currentUser: { openId: 'me' },
    },
  });
  const marked = [];
  page.markMessageAsReadAndDestroy = function(id) { marked.push(id); };
  withSilence(() => page.processOfflineMessages());
  assertEqual('18.只处理 fresh 一条', marked.length, 1);
  assertEqual('18.处理的是 fresh', marked[0], 'fresh');
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`burn-after-read 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

// 还原全局
global.setInterval = origSetInterval;
global.clearInterval = origClearInterval;
global.setTimeout = origSetTimeout;
global.clearTimeout = origClearTimeout;

if (fail > 0) process.exit(1);
