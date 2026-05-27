/**
 * identity-resolver.js 阶段 1 行为测试
 *
 * 目标:在抽离 onLoad 头部 55 行参数解析逻辑前,先把现有行为固化为测试基线;
 * 抽离后跑同样测试,保证零行为变化。
 *
 * 阶段 1 覆盖:
 *  - parseLoadOptions:7 种 options 输入
 *  - cleanupStaleInviteInfo:5 种 inviteInfo 状态
 *  - prepareLoadContext:3 种典型场景的集成
 */

const path = require('path');

// ====== 模拟 wx / app 全局 ======
let clearInviteInfoCallCount = 0;
const mockApp = {
  globalData: {},
  _storedInvite: null,
  getStoredInviteInfo() { return this._storedInvite; },
  clearInviteInfo() { clearInviteInfoCallCount++; this._storedInvite = null; },
};

global.wx = global.wx || {
  getStorageSync: () => undefined,
  setStorageSync: () => {},
};
global.getApp = () => mockApp;

// 静默 console.log 避免淹没结果
const origLog = console.log;
function silenceLogs() { console.log = () => {}; }
function restoreLogs() { console.log = origLog; }

// ====== 加载被测模块 ======
silenceLogs();
const Resolver = require(path.join(__dirname, '../app/pages/chat/modules/identity-resolver.js'));
restoreLogs();

let pass = 0;
let fail = 0;

function assert(name, cond, detail) {
  if (cond) {
    pass++;
    origLog(`PASS  ${name}`);
  } else {
    fail++;
    origLog(`FAIL  ${name}  ${detail || ''}`);
  }
}

function assertEqual(name, got, expected) {
  assert(name, got === expected, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

// 工具:跑一段被测代码,期间静默日志
function withSilence(fn) {
  silenceLogs();
  try { return fn(); }
  finally { restoreLogs(); }
}

// ============ parseLoadOptions ============
origLog('--- parseLoadOptions ---');

{
  const r = withSilence(() => Resolver.parseLoadOptions({}));
  assert('1.options 完全空 → isNewChat=true', r.isNewChat === true);
  assert('1.options 完全空 → chatId 为 fallback 格式', /^chat_\d+_[a-z0-9]+$/.test(r.chatId), r.chatId);
  assertEqual('1.options 完全空 → inviter ""', r.inviter, '');
  assertEqual('1.options 完全空 → userName ""', r.userName, '');
}

{
  const r = withSilence(() => Resolver.parseLoadOptions({ isNewChat: 'true' }));
  assertEqual('2.isNewChat=\'true\' 字符串', r.isNewChat, true);
}

{
  const r = withSilence(() => Resolver.parseLoadOptions({ isNewChat: true }));
  assertEqual('3.isNewChat=true 布尔', r.isNewChat, true);
}

{
  const r = withSilence(() => Resolver.parseLoadOptions({ action: 'create' }));
  assertEqual('4.action=create', r.isNewChat, true);
}

{
  const r = withSilence(() => Resolver.parseLoadOptions({ id: 'chat_abc' }));
  assertEqual('5.已有聊天 chatId', r.chatId, 'chat_abc');
  assertEqual('5.已有聊天 isNewChat', r.isNewChat, false);
}

{
  const r = withSilence(() => Resolver.parseLoadOptions({ id: 'chat_x', inviter: '向冬', userName: 'X%2E' }));
  assertEqual('6.带邀请者 inviter', r.inviter, '向冬');
  assertEqual('6.带邀请者 userName 保持编码', r.userName, 'X%2E');
}

{
  const r = withSilence(() => Resolver.parseLoadOptions({ contactId: 'chat_y' }));
  assertEqual('7.fallback contactId', r.chatId, 'chat_y');
  assertEqual('7.fallback contactId isNewChat', r.isNewChat, true);
}

{
  // 当 options 同时提供 isNewChat=false(字符串) + 已有 id 时,应识别为现有聊天
  const r = withSilence(() => Resolver.parseLoadOptions({ id: 'chat_z', isNewChat: 'false' }));
  assertEqual('8.显式 isNewChat=\'false\'', r.isNewChat, false);
}

// ============ cleanupStaleInviteInfo ============
origLog('\n--- cleanupStaleInviteInfo ---');

const NOW = 1700000000000; // 固定基准时间戳

// 场景 1:inviteInfo 为 null → 直接返回
{
  clearInviteInfoCallCount = 0;
  const r = withSilence(() => Resolver.cleanupStaleInviteInfo({}, null, {}, '', NOW));
  assertEqual('s1.null inviteInfo 不调 clearInviteInfo', clearInviteInfoCallCount, 0);
  assertEqual('s1.null inviteInfo 返回 null', r.inviteInfo, null);
}

// 场景 2:无 inviteId 字段 → 直接返回
{
  clearInviteInfoCallCount = 0;
  const r = withSilence(() => Resolver.cleanupStaleInviteInfo({}, { timestamp: NOW }, {}, '', NOW));
  assertEqual('s2.无 inviteId 不调 clearInviteInfo', clearInviteInfoCallCount, 0);
  assertEqual('s2.无 inviteId 返回 null', r.inviteInfo, null);
}

// 场景 3:过期(11 分钟前)
{
  clearInviteInfoCallCount = 0;
  const inv = { inviteId: 'chat_x', timestamp: NOW - 11 * 60 * 1000, inviter: 'X' };
  const r = withSilence(() => Resolver.cleanupStaleInviteInfo({}, inv, {}, 'X', NOW));
  assertEqual('s3.过期 调 clearInviteInfo', clearInviteInfoCallCount, 1);
  assertEqual('s3.过期 inviteInfo=null', r.inviteInfo, null);
  assertEqual('s3.过期 inviter=null', r.inviter, null);
}

// 场景 4:有效期内但 options 无邀请参数 → 残留清理
{
  clearInviteInfoCallCount = 0;
  const inv = { inviteId: 'chat_x', timestamp: NOW - 5 * 60 * 1000, inviter: 'X' };
  const r = withSilence(() => Resolver.cleanupStaleInviteInfo({}, inv, {}, 'X', NOW));
  assertEqual('s4.无 URL 邀请参数 调 clearInviteInfo', clearInviteInfoCallCount, 1);
  assertEqual('s4.无 URL 邀请参数 inviter=null', r.inviter, null);
}

// 场景 5:有效期内 + options.inviter 存在 → 保留
{
  clearInviteInfoCallCount = 0;
  const inv = { inviteId: 'chat_x', timestamp: NOW - 5 * 60 * 1000, inviter: 'X' };
  const r = withSilence(() => Resolver.cleanupStaleInviteInfo({}, inv, { inviter: 'X' }, 'X', NOW));
  assertEqual('s5.有效保留 不调 clearInviteInfo', clearInviteInfoCallCount, 0);
  assert('s5.有效保留 inviteInfo 不为 null', r.inviteInfo !== null);
  assertEqual('s5.有效保留 inviter 保留', r.inviter, 'X');
}

// 场景 6:有效期内 + options.fromInvite 存在 → 保留
{
  clearInviteInfoCallCount = 0;
  const inv = { inviteId: 'chat_x', timestamp: NOW - 5 * 60 * 1000, inviter: 'X' };
  const r = withSilence(() => Resolver.cleanupStaleInviteInfo({}, inv, { fromInvite: 'true' }, '', NOW));
  assertEqual('s6.有效 fromInvite 不调 clearInviteInfo', clearInviteInfoCallCount, 0);
  assert('s6.有效 fromInvite 保留 inviteInfo', r.inviteInfo !== null);
}

// ============ prepareLoadContext 集成 ============
origLog('\n--- prepareLoadContext 集成 ---');

// 集成 1:新聊天进入,无 stored invite
{
  mockApp._storedInvite = null;
  clearInviteInfoCallCount = 0;
  const ctx = withSilence(() => Resolver.prepareLoadContext({}, { isNewChat: 'true' }));
  assertEqual('i1.新聊天 isNewChat', ctx.isNewChat, true);
  assertEqual('i1.新聊天 inviter 空', ctx.inviter, '');
  assertEqual('i1.新聊天 forceReceiverMode 始终 false', ctx.forceReceiverMode, false);
  assertEqual('i1.新聊天 inviteInfo 为 null', ctx.inviteInfo, null);
  assertEqual('i1.新聊天 不调 clearInviteInfo', clearInviteInfoCallCount, 0);
}

// 集成 2:邀请进入(URL 真实)
{
  mockApp._storedInvite = { inviteId: 'chat_x', timestamp: Date.now() - 1000, inviter: '向冬' };
  clearInviteInfoCallCount = 0;
  const ctx = withSilence(() => Resolver.prepareLoadContext({}, { id: 'chat_x', inviter: '向冬', fromInvite: 'true' }));
  assertEqual('i2.邀请进入 chatId', ctx.chatId, 'chat_x');
  assertEqual('i2.邀请进入 inviter 来自 options', ctx.inviter, '向冬');
  assertEqual('i2.邀请进入 isNewChat=false', ctx.isNewChat, false);
  assert('i2.邀请进入 inviteInfo 保留', ctx.inviteInfo !== null);
  assertEqual('i2.邀请进入 不调 clearInviteInfo', clearInviteInfoCallCount, 0);
}

// 集成 3:过期残留邀请被清理
{
  mockApp._storedInvite = { inviteId: 'chat_old', timestamp: Date.now() - 11 * 60 * 1000, inviter: '过期' };
  clearInviteInfoCallCount = 0;
  const ctx = withSilence(() => Resolver.prepareLoadContext({}, {}));
  assertEqual('i3.过期 inviteInfo=null', ctx.inviteInfo, null);
  assertEqual('i3.过期 inviter=null(与原 chat.js 行为等价)', ctx.inviter, null);
  assertEqual('i3.过期 调 clearInviteInfo', clearInviteInfoCallCount, 1);
  assertEqual('i3.过期 isNewChat=true(无 id)', ctx.isNewChat, true);
}

// 集成 4:options 兜底 chatId
{
  mockApp._storedInvite = null;
  const ctx = withSilence(() => Resolver.prepareLoadContext({}, { contactId: 'chat_fallback' }));
  assertEqual('i4.fallback chatId', ctx.chatId, 'chat_fallback');
}

// 集成 5:LoadContext 字段完整性
{
  mockApp._storedInvite = null;
  const ctx = withSilence(() => Resolver.prepareLoadContext({}, {}));
  const requiredKeys = ['chatId', 'inviter', 'userName', 'isNewChat', 'forceReceiverMode', 'inviteInfo', 'options'];
  for (const k of requiredKeys) {
    assert(`i5.LoadContext 含 ${k}`, k in ctx);
  }
}

origLog(`\n--- ${pass} pass / ${fail} fail ---`);
process.exit(fail > 0 ? 1 : 0);
