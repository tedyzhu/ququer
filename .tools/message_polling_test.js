/**
 * message-polling.js 关键路径行为测试
 *
 * 覆盖消息轮询子系统 2 个对外方法:
 * - startPollingMessages: 5s 周期 setInterval + 4s 冷却 + 阅后即焚清理跳过
 * - startMessagePolling: 清理状态延迟 / 冷却期延迟 / 发送方不启动 / B 端 OK
 *
 * 技术要点:
 * - fake setInterval / setTimeout 只记录,可手动 invoke 模拟周期回调
 * - 通过控制 Date.now() 模拟冷却期/冷却期外
 */

const path = require('path');

// ====== fake timers(只记录) ======
const intervalTasks = [];
const timeoutTasks = [];
let intervalCounter = 0;
let timeoutCounter = 0;
const origSetInterval = global.setInterval;
const origClearInterval = global.clearInterval;
const origSetTimeout = global.setTimeout;
const origClearTimeout = global.clearTimeout;

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
function resetTimers() {
  intervalTasks.length = 0;
  timeoutTasks.length = 0;
}

// ====== 可控 Date.now() ======
const origDateNow = Date.now;
let mockedNow = null;
function setNow(t) { mockedNow = t; }
Date.now = function() { return mockedNow !== null ? mockedNow : origDateNow.call(Date); };

// ====== mock wx 全局 ======
global.wx = { setStorageSync: () => {}, getStorageSync: () => undefined };
global.getApp = () => ({ globalData: {} });

// ====== 加载模块 ======
const MessagePolling = require(path.join(__dirname, '../app/pages/chat/modules/message-polling.js'));

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
  const page = Object.assign({
    data: {
      isBurnAfterReadingCleaning: false,
      isFromInvite: false,
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 0,
      cleanupCooldownPeriod: 30000, // 30 秒冷却
    },
    fetchMessages() { this._fetchCalls = (this._fetchCalls || 0) + 1; },
  }, overrides || {});
  MessagePolling.attach(page);
  return page;
}

// 静默 console
const origLog = console.log;
const origWarn = console.warn;
function silenceLogs() { console.log = () => {}; console.warn = () => {}; }
function restoreLogs() { console.log = origLog; console.warn = origWarn; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

// ============ startPollingMessages ============
origLog('--- startPollingMessages ---');

// 用例 1:阅后即焚清理时跳过启动
{
  resetTimers();
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: true,
      isFromInvite: false,
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 0,
      cleanupCooldownPeriod: 30000,
    },
  });
  withSilence(() => page.startPollingMessages());
  assertEqual('1.清理中跳过 setInterval', intervalTasks.length, 0);
  assertEqual('1.messagePollingTimer 不被设', page.messagePollingTimer, undefined);
}

// 用例 2:已有 timer 时先 clear 再重建
{
  resetTimers();
  const page = makeFakePage();
  page.messagePollingTimer = 'iv_old_999';
  withSilence(() => page.startPollingMessages());
  assertEqual('2.新 setInterval 被注册', intervalTasks.length, 1);
  // 旧 timer 应被 clearInterval 调用(虽然 fake 实现里它不在 intervalTasks 中,所以不会真的标记 cleared)
  // 重要的是新 timer 被赋值
  assert('2.messagePollingTimer 被覆盖为新值', page.messagePollingTimer && page.messagePollingTimer !== 'iv_old_999');
}

// 用例 3:setInterval 周期为 5000ms
{
  resetTimers();
  const page = makeFakePage();
  withSilence(() => page.startPollingMessages());
  assertEqual('3.周期 5000ms', intervalTasks[0].delay, 5000);
}

// 用例 4:回调中清理状态时跳过 fetchMessages
{
  resetTimers();
  const page = makeFakePage();
  withSilence(() => page.startPollingMessages());
  // 模拟一次 tick:期间 page 进入清理状态
  page.data.isBurnAfterReadingCleaning = true;
  withSilence(() => intervalTasks[0].fn());
  assertEqual('4.清理中不调 fetchMessages', page._fetchCalls, undefined);
}

// 用例 5:回调中 4 秒冷却期内跳过
{
  resetTimers();
  setNow(10000);
  const page = makeFakePage();
  page.lastFetchTime = 8000; // 距今 2 秒,在 4 秒冷却内
  withSilence(() => page.startPollingMessages());
  withSilence(() => intervalTasks[0].fn());
  assertEqual('5.冷却期内不调 fetchMessages', page._fetchCalls, undefined);
  setNow(null);
}

// 用例 6:冷却期外 + 发送方(isFromInvite=false)调 fetchMessages
{
  resetTimers();
  setNow(20000);
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: false,
      isFromInvite: false, // 发送方
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 0,
      cleanupCooldownPeriod: 30000,
    },
  });
  page.lastFetchTime = 10000; // 距今 10 秒,超过 4 秒冷却
  withSilence(() => page.startPollingMessages());
  withSilence(() => intervalTasks[0].fn());
  assertEqual('6.发送方在冷却期外调 fetchMessages', page._fetchCalls, 1);
  setNow(null);
}

// 用例 7:冷却期外 + 接收方(isFromInvite=true)也调 fetchMessages
{
  resetTimers();
  setNow(20000);
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: false,
      isFromInvite: true, // B 端
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 0,
      cleanupCooldownPeriod: 30000,
    },
  });
  page.lastFetchTime = 10000;
  withSilence(() => page.startPollingMessages());
  withSilence(() => intervalTasks[0].fn());
  assertEqual('7.接收方在冷却期外也调 fetchMessages', page._fetchCalls, 1);
  setNow(null);
}

// 用例 8:isFromInvite=undefined 时 fallback 到 finalIsFromInvite
{
  resetTimers();
  setNow(20000);
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: false,
      isFromInvite: undefined, // 主数据缺
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 0,
      cleanupCooldownPeriod: 30000,
    },
  });
  page.finalIsFromInvite = true; // 实例属性 fallback
  page.lastFetchTime = 10000;
  withSilence(() => page.startPollingMessages());
  withSilence(() => intervalTasks[0].fn());
  // 不会因 fallback 失败而崩溃,fetch 正常调
  assertEqual('8.fallback 后正常调 fetchMessages', page._fetchCalls, 1);
  setNow(null);
}

// ============ startMessagePolling ============
origLog('\n--- startMessagePolling ---');

// 用例 9:清理状态时延迟 5000ms 重启
{
  resetTimers();
  setNow(10000);
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: true,
      isFromInvite: true,
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 0,
      cleanupCooldownPeriod: 30000,
    },
  });
  withSilence(() => page.startMessagePolling());
  // 应注册 5000ms 的 setTimeout
  const t = timeoutTasks.find(x => x.delay === 5000);
  assert('9.注册 5000ms 延迟 setTimeout', !!t);
  // 不应启动 setInterval
  assertEqual('9.不启动 setInterval', intervalTasks.length, 0);
  setNow(null);
}

// 用例 10:冷却期内时按剩余时间延迟重启
{
  resetTimers();
  setNow(15000);
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: false,
      isFromInvite: true,
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 10000, // 距今 5 秒
      cleanupCooldownPeriod: 30000, // 冷却 30 秒
    },
  });
  withSilence(() => page.startMessagePolling());
  // 剩余 25 秒,delay 应是 25000ms
  const t = timeoutTasks.find(x => x.delay === 25000);
  assert('10.按剩余时间(25s)延迟', !!t);
  assertEqual('10.不启动 setInterval', intervalTasks.length, 0);
  setNow(null);
}

// 用例 11:发送方(isFromInvite=false)时不启动轮询
{
  resetTimers();
  setNow(50000);
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: false,
      isFromInvite: false, // 发送方
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 0,
      cleanupCooldownPeriod: 30000,
    },
  });
  withSilence(() => page.startMessagePolling());
  assertEqual('11.发送方不启动 setInterval', intervalTasks.length, 0);
  assertEqual('11.发送方不注册 setTimeout', timeoutTasks.length, 0);
  setNow(null);
}

// 用例 12:B 端 + 冷却期外 + 非清理时调 startPollingMessages
{
  resetTimers();
  setNow(60000);
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: false,
      isFromInvite: true, // B 端
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 10000, // 距今 50 秒,远超 30 秒冷却
      cleanupCooldownPeriod: 30000,
    },
  });
  withSilence(() => page.startMessagePolling());
  // 应启动轮询(setInterval)
  assertEqual('12.B 端 + 冷却外启动 setInterval', intervalTasks.length, 1);
  assertEqual('12.周期 5000ms', intervalTasks[0].delay, 5000);
  setNow(null);
}

// 用例 13:lastCleanupTime=0(无冷却记录)+ B 端时直接启动
{
  resetTimers();
  setNow(60000);
  const page = makeFakePage({
    data: {
      isBurnAfterReadingCleaning: false,
      isFromInvite: true,
      currentUser: { openId: 'me' },
      participants: [],
      lastCleanupTime: 0, // 没冷却过
      cleanupCooldownPeriod: 30000,
    },
  });
  withSilence(() => page.startMessagePolling());
  assertEqual('13.无冷却记录时直接启动', intervalTasks.length, 1);
  setNow(null);
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`message-polling 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

// 还原全局
global.setInterval = origSetInterval;
global.clearInterval = origClearInterval;
global.setTimeout = origSetTimeout;
global.clearTimeout = origClearTimeout;
Date.now = origDateNow;

if (fail > 0) process.exit(1);
