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


// ============ detectInvitePresence(阶段 2a) ============
origLog('\n--- detectInvitePresence ---');

{
  const r = withSilence(() => Resolver.detectInvitePresence({}));
  assertEqual('2a.空 options 全 false', r.preliminaryInviteDetected, false);
  assertEqual('2a.空 options hasExplicitInviterParam', r.hasExplicitInviterParam, false);
  assertEqual('2a.空 options hasJoinAction', r.hasJoinAction, false);
  assertEqual('2a.空 options hasFromInviteFlag', r.hasFromInviteFlag, false);
}
{
  const r = withSilence(() => Resolver.detectInvitePresence({ inviter: '向冬' }));
  assertEqual('2a.inviter=向冬 hasExplicit', r.hasExplicitInviterParam, true);
  assertEqual('2a.inviter=向冬 preliminary', r.preliminaryInviteDetected, true);
}
{
  const r = withSilence(() => Resolver.detectInvitePresence({ inviter: 'undefined' }));
  assertEqual('2a.inviter="undefined" 字符串视为无效', r.hasExplicitInviterParam, false);
}
{
  const r = withSilence(() => Resolver.detectInvitePresence({ action: 'join' }));
  assertEqual('2a.action=join hasJoinAction', r.hasJoinAction, true);
  assertEqual('2a.action=join preliminary', r.preliminaryInviteDetected, true);
}
{
  const r = withSilence(() => Resolver.detectInvitePresence({ action: 'create' }));
  assertEqual('2a.action=create hasJoinAction false', r.hasJoinAction, false);
}
{
  const r = withSilence(() => Resolver.detectInvitePresence({ fromInvite: 'true' }));
  assertEqual("2a.fromInvite='true' 字符串", r.hasFromInviteFlag, true);
}
{
  const r = withSilence(() => Resolver.detectInvitePresence({ fromInvite: true }));
  assertEqual('2a.fromInvite=true 布尔', r.hasFromInviteFlag, true);
}
{
  const r = withSilence(() => Resolver.detectInvitePresence({ fromInvite: '1' }));
  assertEqual("2a.fromInvite='1' 字符串", r.hasFromInviteFlag, true);
}
{
  const r = withSilence(() => Resolver.detectInvitePresence({ fromInvite: 'false' }));
  assertEqual("2a.fromInvite='false' 不是 truthy", r.hasFromInviteFlag, false);
}

// ============ collectCreatorEvidence(阶段 2b) ============
origLog('\n--- collectCreatorEvidence ---');

// 注意:collectCreatorEvidence 仅在 inviteInfo 存在时被 chat.js 调用
// 测试也保证传入 truthy inviteInfo

// 准备:扩展 wx mock 以支持 storage 读
const mockStorage2 = {};
const origGetStorageSync = global.wx.getStorageSync;
global.wx.getStorageSync = (k) => mockStorage2[k];

// 工具:重置 mock state
function resetMocks() {
  Object.keys(mockStorage2).forEach(k => delete mockStorage2[k]);
  mockApp.globalData = {};
}

// 用例 1:典型 B 端(无任何创建者证据)
{
  resetMocks();
  const inviteInfo = { inviteId: 'chat_xxx', inviter: '向冬', timestamp: Date.now() - 60 * 1000 };
  const userInfo = { nickName: '小明', openId: 'user_b_openid' };
  const r = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo, userInfo, false));
  assertEqual('2b.B端 chatIdContainsUserId false', r.chatIdContainsUserId, false);
  assertEqual('2b.B端 isSameUser false', r.isSameUser, false);
  // hasCreateAction 在所有 falsy 来源下,与原 chat.js 等价为 undefined(三个 || 都未命中)
  assert('2b.B端 hasCreateAction falsy', !r.hasCreateAction);
  assertEqual('2b.B端 isInShareMode false', r.isInShareMode, false);
  assertEqual('2b.B端 hasHistoricalEvidence false', r.hasHistoricalEvidence, false);
  assertEqual('2b.B端 hasOwnershipMarkers false', r.hasOwnershipMarkers, false);
  assertEqual('2b.B端 isFrequentVisitor false', r.isFrequentVisitor, false);
  assertEqual('2b.B端 chatVisitCount 0', r.chatVisitCount, 0);
  assertEqual('2b.B端 inviterNickname=向冬', r.inviterNickname, '向冬');
  assertEqual('2b.B端 userNickname=小明', r.userNickname, '小明');
  assertEqual('2b.B端 currentUserOpenId 来自 userInfo', r.currentUserOpenId, 'user_b_openid');
}

// 用例 2:chatIdContainsUserId(聊天 ID 含用户 ID 片段)
{
  resetMocks();
  const inviteInfo = { inviteId: 'chat_user_a_openid_abc_123', inviter: '向冬', timestamp: Date.now() - 60 * 1000 };
  const userInfo = { nickName: '向冬', openId: 'user_a_openid' };
  const r = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo, userInfo, false));
  assertEqual('2b.A端 chatIdContainsUserId true', r.chatIdContainsUserId, true);
  assertEqual('2b.A端 isSameUser true', r.isSameUser, true);
}

// 用例 3:isVeryRecentInvite / isRecentInvite 时间维度
{
  resetMocks();
  const now = Date.now();
  const inviteInfo = { inviteId: 'chat_x', inviter: 'X', timestamp: now - 60 * 1000 }; // 1 分钟前
  const r = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo, { openId: 'u' }, false));
  assertEqual('2b.1 分钟内 isVeryRecentInvite=true', r.isVeryRecentInvite, true);
  assertEqual('2b.1 分钟内 isRecentInvite=true', r.isRecentInvite, true);
}
{
  resetMocks();
  const inviteInfo = { inviteId: 'chat_x', inviter: 'X', timestamp: Date.now() - 5 * 60 * 1000 }; // 5 分钟前
  const r = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo, { openId: 'u' }, false));
  assertEqual('2b.5 分钟前 isVeryRecentInvite=false(>2min)', r.isVeryRecentInvite, false);
  assertEqual('2b.5 分钟前 isRecentInvite=true(<24h)', r.isRecentInvite, true);
}

// 用例 4:URL 参数 inviter 优先级
{
  resetMocks();
  const inviteInfo = { inviteId: 'chat_x', inviter: '朋友', timestamp: Date.now() - 60 * 1000 };
  const userInfo = { nickName: '小明', openId: 'u' };
  const r = withSilence(() => Resolver.collectCreatorEvidence(
    { data: {} },
    { inviter: '%E5%90%91%E5%86%AC' }, // 向冬 URL 编码
    inviteInfo,
    userInfo,
    true,
  ));
  assertEqual('2b.URL inviter 优先,解码后用作 inviterNickname', r.inviterNickname, '向冬');
}

// 用例 5:URL 参数 inviter='朋友' 不覆盖原有 inviterNickname(占位符过滤)
{
  resetMocks();
  const inviteInfo = { inviteId: 'chat_x', inviter: '原始邀请者', timestamp: Date.now() - 60 * 1000 };
  const userInfo = { nickName: '小明', openId: 'u' };
  const r = withSilence(() => Resolver.collectCreatorEvidence(
    { data: {} },
    { inviter: encodeURIComponent('朋友') },
    inviteInfo,
    userInfo,
    true,
  ));
  assertEqual('2b.URL inviter=朋友 占位符不覆盖', r.inviterNickname, '原始邀请者');
}

// 用例 6:hasCreateAction 三种来源
{
  resetMocks();
  const inviteInfo = { inviteId: 'chat_x', inviter: 'X', timestamp: Date.now() };
  // 来源 1:options.action='create'
  const r1 = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, { action: 'create' }, inviteInfo, { openId: 'u' }, false));
  assertEqual('2b.action=create → hasCreateAction', r1.hasCreateAction, true);
  // 来源 2:page.data.isNewChat
  const r2 = withSilence(() => Resolver.collectCreatorEvidence({ data: { isNewChat: true } }, {}, inviteInfo, { openId: 'u' }, false));
  assertEqual('2b.page.data.isNewChat → hasCreateAction', r2.hasCreateAction, true);
  // 来源 3:app.globalData.recentCreateActions
  mockApp.globalData = { recentCreateActions: ['chat_x'] };
  const r3 = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo, { openId: 'u' }, false));
  assertEqual('2b.recentCreateActions → hasCreateAction', r3.hasCreateAction, true);
}

// 用例 7:isFrequentVisitor 阈值(>=2)
{
  resetMocks();
  const inviteInfo = { inviteId: 'chat_x', inviter: 'X', timestamp: Date.now() };
  // 0 次
  const r0 = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo, { openId: 'u' }, false));
  assertEqual('2b.访问 0 次 isFrequentVisitor=false', r0.isFrequentVisitor, false);
  // 1 次
  mockStorage2['chat_visit_history'] = { chat_x: 1 };
  const r1 = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo, { openId: 'u' }, false));
  assertEqual('2b.访问 1 次 isFrequentVisitor=false', r1.isFrequentVisitor, false);
  // 2 次
  mockStorage2['chat_visit_history'] = { chat_x: 2 };
  const r2 = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo, { openId: 'u' }, false));
  assertEqual('2b.访问 2 次 isFrequentVisitor=true', r2.isFrequentVisitor, true);
  assertEqual('2b.访问 2 次 chatVisitCount=2', r2.chatVisitCount, 2);
}

// 用例 8:hasOwnershipMarkers 三种字段
{
  resetMocks();
  const inviteInfo1 = { inviteId: 'chat_x', inviter: 'X', timestamp: Date.now(), createdBy: 'u' };
  const r1 = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo1, { openId: 'u' }, false));
  assertEqual('2b.createdBy 命中', r1.hasOwnershipMarkers, true);
  const inviteInfo2 = { inviteId: 'chat_x', inviter: 'X', timestamp: Date.now(), creator: 'u' };
  const r2 = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo2, { openId: 'u' }, false));
  assertEqual('2b.creator 命中', r2.hasOwnershipMarkers, true);
  const inviteInfo3 = { inviteId: 'chat_x', inviter: 'X', timestamp: Date.now(), owner: 'u' };
  const r3 = withSilence(() => Resolver.collectCreatorEvidence({ data: {} }, {}, inviteInfo3, { openId: 'u' }, false));
  assertEqual('2b.owner 命中', r3.hasOwnershipMarkers, true);
}

// 还原 mock
global.wx.getStorageSync = origGetStorageSync;


// ============ computeCreatorByEvidence(阶段 2c) ============
origLog('\n--- computeCreatorByEvidence ---');

function buildEvidence(overrides) {
  // 默认全 false / 空
  return Object.assign({
    chatIdContainsUserId: false,
    isSameUser: false,
    hasCreateAction: false,
    isInShareMode: false,
    hasHistoricalEvidence: false,
    hasOwnershipMarkers: false,
    isFrequentVisitor: false,
    isRecentInvite: false,
    smartNicknameMatch: false,
    userNickname: '',
  }, overrides || {});
}

// 全 false → 非创建者
{
  const r = Resolver.computeCreatorByEvidence(buildEvidence());
  assertEqual('2c.全 false 非创建者', r, false);
}

// 7 个独立证据,任一为 true 都判为创建者
const independentEvidenceKeys = [
  'chatIdContainsUserId', 'isSameUser', 'hasCreateAction',
  'isInShareMode', 'hasHistoricalEvidence', 'hasOwnershipMarkers',
  'isFrequentVisitor',
];
for (const key of independentEvidenceKeys) {
  const r = Resolver.computeCreatorByEvidence(buildEvidence({ [key]: true }));
  assertEqual(`2c.${key} 单独命中 → 创建者`, r, true);
}

// (isRecentInvite && smartNicknameMatch) 组合
{
  const r1 = Resolver.computeCreatorByEvidence(buildEvidence({ isRecentInvite: true }));
  assertEqual('2c.仅 isRecentInvite 不足', r1, false);
  const r2 = Resolver.computeCreatorByEvidence(buildEvidence({ smartNicknameMatch: true }));
  assertEqual('2c.仅 smartNicknameMatch 不足', r2, false);
  const r3 = Resolver.computeCreatorByEvidence(buildEvidence({ isRecentInvite: true, smartNicknameMatch: true }));
  assertEqual('2c.两者组合 → 创建者', r3, true);
}

// 频繁访问者备用提升:isFrequentVisitor=true 已经命中主决策,不进备用分支
// 备用分支:主决策全 false,但 isFrequentVisitor=true(已经被主决策覆盖,所以备用永远不进)
// 真正测试备用分支:主决策全 false 且 userNickname 非空非占位
{
  // isFrequentVisitor 已经包含在主决策中,主决策若 true 这里也 true
  const r = Resolver.computeCreatorByEvidence(buildEvidence({
    isFrequentVisitor: true,
    userNickname: '向冬',
  }));
  assertEqual('2c.frequent + 真实昵称 → 创建者', r, true);
}
{
  const r = Resolver.computeCreatorByEvidence(buildEvidence({
    isFrequentVisitor: true,
    userNickname: '朋友',
  }));
  // isFrequentVisitor 已经触发主决策,无论昵称如何都是 true
  assertEqual('2c.frequent + 朋友昵称 仍然主决策命中 → 创建者', r, true);
}
{
  // 备用分支被触发的唯一路径:主决策全 false 但 isFrequentVisitor=true,然而 isFrequentVisitor 已在主决策
  // 所以备用分支理论上永远不会真正生效。这是原 chat.js 代码的现状。
  // 我们仅测:无任何主决策证据,即使 userNickname 真实,也不应误判
  const r = Resolver.computeCreatorByEvidence(buildEvidence({
    userNickname: '向冬',
  }));
  assertEqual('2c.无任何主证据,即使 userNickname 真实,也是 false', r, false);
}

// 边界:返回值始终是 boolean
{
  const r = Resolver.computeCreatorByEvidence(buildEvidence({ chatIdContainsUserId: 'truthy_string' }));
  assertEqual('2c.返回值是布尔(被 !!转换)', typeof r, 'boolean');
  assertEqual('2c.truthy 输入 → true', r, true);
}
// ============ runPostLoadHooks(阶段 5) ============
origLog('\n--- runPostLoadHooks ---');

// runPostLoadHooks 内部用 setTimeout,我们用 sinon 风格的同步替代
function makeFakeTimers() {
  const tasks = [];
  const origSetTimeout = global.setTimeout;
  global.setTimeout = function(fn, delay) {
    tasks.push({ fn, delay });
    return tasks.length;
  };
  return {
    runAll: () => {
      // 嵌套 setTimeout(fn 执行时再注册新任务)需要循环处理:
      // 每轮取出当前所有未跑的 task,按 delay 升序执行;新 task 进 next 轮
      let processed = 0;
      while (processed < tasks.length) {
        const batch = tasks.slice(processed).sort((a, b) => a.delay - b.delay);
        processed = tasks.length;
        for (const t of batch) {
          try { t.fn(); } catch (e) { /* swallow */ }
        }
      }
    },
    restore: () => { global.setTimeout = origSetTimeout; },
    tasks,
  };
}

// 用例 1:同步部分立即生效
{
  const setDataCalls = [];
  const page = {
    data: {},
    setData: (patch) => { Object.assign(page.data, patch); setDataCalls.push(patch); },
  };
  const timers = makeFakeTimers();
  withSilence(() => Resolver.runPostLoadHooks(page));
  timers.restore();
  // 同步:needsJoinMessage / inviterDisplayName 立即重置
  assertEqual('5.同步.needsJoinMessage 重置', page.needsJoinMessage, false);
  assertEqual('5.同步.inviterDisplayName 重置', page.inviterDisplayName, '');
  // 同步:globalBEndMessageAdded / bEndSystemMessageAdded 立即重置
  assertEqual('5.同步.globalBEndMessageAdded 重置', page.globalBEndMessageAdded, false);
  assertEqual('5.同步.bEndSystemMessageAdded 重置', page.bEndSystemMessageAdded, false);
  // 同步:setData 调用包含三个标志
  assert('5.同步.setData 重置 hasCheckedBurnAfterReading',
    setDataCalls.some(p => p.hasCheckedBurnAfterReading === false));
  assert('5.同步.setData 重置 hasAddedConnectionMessage',
    setDataCalls.some(p => p.hasAddedConnectionMessage === false));
  assert('5.同步.setData 重置 isNewChatSession',
    setDataCalls.some(p => p.isNewChatSession === true));
  // 异步 timers 注册了 3 个顶层 + 1 个嵌套
  // (1500/500/2000 三个外层。1500ms 内部嵌套 500ms 在 fn 执行时才注册)
  assertEqual('5.同步.外层注册了 3 个 setTimeout', timers.tasks.length, 3);
}

// 用例 2:1500ms B 端检查 — isFromInvite=true 时调用 performBEndSystemMessageCheck
{
  let perfCalled = 0;
  let dedupeCalled = 0;
  const page = {
    data: { isFromInvite: true },
    setData: () => {},
    performBEndSystemMessageCheck: () => { perfCalled++; },
    removeDuplicateBEndMessages: () => { dedupeCalled++; },
  };
  const timers = makeFakeTimers();
  withSilence(() => Resolver.runPostLoadHooks(page));
  withSilence(() => timers.runAll());
  timers.restore();
  assertEqual('5.B端 perf 被调用', perfCalled, 1);
  assertEqual('5.B端 dedupe 被调用', dedupeCalled, 1);
}

// 用例 3:1500ms B 端检查 — isFromInvite=false 时跳过
{
  let perfCalled = 0;
  let dedupeCalled = 0;
  const page = {
    data: { isFromInvite: false },
    setData: () => {},
    performBEndSystemMessageCheck: () => { perfCalled++; },
    removeDuplicateBEndMessages: () => { dedupeCalled++; },
  };
  const timers = makeFakeTimers();
  withSilence(() => Resolver.runPostLoadHooks(page));
  withSilence(() => timers.runAll());
  timers.restore();
  assertEqual('5.A端 perf 不被调用', perfCalled, 0);
  assertEqual('5.A端 dedupe 不被调用', dedupeCalled, 0);
}

// 用例 4:2000ms 阅后即焚 — 冷却期外正常调用
{
  let cleanupCalled = 0;
  const page = {
    data: {
      lastCleanupTime: Date.now() - 120000, // 2 分钟前
      cleanupCooldownPeriod: 60000, // 60 秒冷却
    },
    setData: () => {},
    checkBurnAfterReadingCleanup: () => { cleanupCalled++; },
  };
  const timers = makeFakeTimers();
  withSilence(() => Resolver.runPostLoadHooks(page));
  withSilence(() => timers.runAll());
  timers.restore();
  assertEqual('5.冷却期外 cleanup 调用', cleanupCalled, 1);
}

// 用例 5:2000ms 阅后即焚 — 冷却期内跳过
{
  let cleanupCalled = 0;
  const page = {
    data: {
      lastCleanupTime: Date.now() - 30000, // 30 秒前
      cleanupCooldownPeriod: 60000,
    },
    setData: () => {},
    checkBurnAfterReadingCleanup: () => { cleanupCalled++; },
  };
  const timers = makeFakeTimers();
  withSilence(() => Resolver.runPostLoadHooks(page));
  withSilence(() => timers.runAll());
  timers.restore();
  assertEqual('5.冷却期内 cleanup 跳过', cleanupCalled, 0);
}

// 用例 6:2000ms 阅后即焚 — 无 lastCleanupTime 时正常调用(首次进入)
{
  let cleanupCalled = 0;
  const page = {
    data: { lastCleanupTime: null, cleanupCooldownPeriod: 60000 },
    setData: () => {},
    checkBurnAfterReadingCleanup: () => { cleanupCalled++; },
  };
  const timers = makeFakeTimers();
  withSilence(() => Resolver.runPostLoadHooks(page));
  withSilence(() => timers.runAll());
  timers.restore();
  assertEqual('5.首次进入 cleanup 正常调用', cleanupCalled, 1);
}

// 用例 7:500ms loading 清除
{
  const setDataCalls = [];
  const page = {
    data: {},
    setData: (patch) => { setDataCalls.push(patch); },
  };
  const timers = makeFakeTimers();
  withSilence(() => Resolver.runPostLoadHooks(page));
  withSilence(() => timers.runAll());
  timers.restore();
  // setData 至少被调一次清除 isLoading
  assert('5.500ms isLoading 被清除',
    setDataCalls.some(p => p.isLoading === false));
  assert('5.500ms isCreatingChat 被清除',
    setDataCalls.some(p => p.isCreatingChat === false));
  assert('5.500ms chatCreationStatus 清空',
    setDataCalls.some(p => p.chatCreationStatus === ''));
}

// 用例 8:page 缺方法时 typeof 守卫不抛错
{
  const page = {
    data: { isFromInvite: true, lastCleanupTime: null, cleanupCooldownPeriod: 60000 },
    setData: () => {},
    // 故意不提供 performBEndSystemMessageCheck / removeDuplicateBEndMessages / checkBurnAfterReadingCleanup
  };
  const timers = makeFakeTimers();
  let threw = false;
  try {
    withSilence(() => Resolver.runPostLoadHooks(page));
    withSilence(() => timers.runAll());
  } catch (e) {
    threw = true;
  }
  timers.restore();
  assert('5.page 缺方法时不抛错', !threw);
}





origLog(`\n--- ${pass} pass / ${fail} fail ---`);
process.exit(fail > 0 ? 1 : 0);
