/**
 * title-controller.js 标题决策行为回归测试
 *
 * 这是 title-display-hardening spec 的安全网:把 title-controller 6 个对外方法
 * 在收敛占位符黑名单【之前】的标题决策行为固化为基线,收敛后重跑须保持一致
 * (Tier A 严格零变化;Tier B 边界翻转用例接受更正并标注"收敛前→收敛后")。
 *
 * 设计要点(详见 .kiro/specs/title-display-hardening/design.md):
 * - 纯 node 静态测试,fakePage + attach 模式,无测试框架/PBT 依赖
 * - fake setInterval/setTimeout 替换全局,避免 protectReceiverTitle 轮询 / 2s 重试悬挂
 * - 关键:fakePage.isPlaceholderNickname 绑定为【真权威实现】ChatHelpers.isPlaceholderNickname
 *   (真机上 chat.js 恒这么绑),否则会误判哪些收敛点会翻转
 *
 * 被测 6 个方法:
 *   updateDynamicTitle / updateDynamicTitleWithRealNames / updateTitleForReceiver /
 *   updateReceiverTitleWithRealNames / fetchRealInviterNameAndUpdateTitle / protectReceiverTitle
 *
 * ===== Tier B 收敛前→收敛后行为更正清单(本次治理的行为变化记录)=====
 * 收敛占位符黑名单到权威 isPlaceholderNickname() 后,以下用例发生预期翻转
 * (占位符不再泄漏进标题,与权威标题规则一致;已按用户确认"接受更正"更新基线):
 *   - D14 双人A端「新用户」: 我和新用户（2） → 我自己
 *   - D15 双人B端「新用户」: 我和新用户（2） → 我和朋友（2）(兜底)
 * 以下用例收敛前后产出一致(路径切换但结果相同,无可观测变化):
 *   - D16 双人B端真名含占位子串「用户体验师」: 我和用户体验师（2）(收敛前走重算,
 *     收敛后走早退保护,均得对方真名标题)
 *   - R7c 双人A端「发送方」: 真机本就走权威检测(inline 数组是死兜底),收敛零影响
 * 其余 49 个 Tier A 用例严格零变化。
 */

const path = require('path');

// ====== fake timers(加载模块前替换全局) ======
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
/** 模拟一次所有未清 interval 的 tick */
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

// ====== 可控 wx 全局 ======
let navTitleCalls = [];
let cloudResponse = { participants: [] };
let cloudShouldFail = false;
let mockStorage = {};

global.wx = {
  setNavigationBarTitle: ({ title, success, fail }) => {
    navTitleCalls.push(title);
    if (success) success();
  },
  cloud: {
    callFunction: ({ name, data, success, fail }) => {
      if (cloudShouldFail) { fail && fail(new Error('mock fail')); }
      else { success && success({ result: cloudResponse }); }
    },
  },
  getStorageSync: (k) => mockStorage[k],
  setStorageSync: (k, v) => { mockStorage[k] = v; },
};

let mockApp = { globalData: {} };
global.getApp = () => mockApp;

let mockPagesOptions = {};
global.getCurrentPages = () => [{ options: mockPagesOptions }];

// ====== 加载模块 ======
const TitleController = require(path.join(__dirname, '../app/pages/chat/modules/title-controller.js'));
const ChatHelpers = require(path.join(__dirname, '../app/pages/chat/modules/chat-helpers.js'));

let pass = 0;
let fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail || ''}`); }
}
function assertEqual(name, got, expected) {
  assert(name, got === expected, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

/**
 * 创建挂载了 title-controller 全部方法的 fakePage
 * @param {Object} overrides - 覆盖 data / 实例属性 / 协作方法替身
 */
function makeTitlePage(overrides) {
  const o = overrides || {};
  const setDataCalls = [];
  const spies = {
    deduplicateParticipants: 0,
    fetchChatParticipants: 0,
    fetchChatParticipantsWithRealNames: [],
    retryGetRealInviterName: 0,
    updateReceiverTitleWithRealNames: 0,
  };
  const page = Object.assign({
    data: Object.assign({
      participants: [],
      currentUser: { openId: 'self', nickName: '我自己' },
      isFromInvite: false,
      hasJoinedAsReceiver: false,
      dynamicTitle: '',
      contactId: 'chat_x',
      chatId: 'chat_x',
    }, o.data || {}),
    setData(patch, cb) {
      for (const k in patch) this.data[k] = patch[k];
      setDataCalls.push(patch);
      if (cb) cb();
    },
    // 协作方法替身(可被 overrides 覆盖)
    isReceiverEnvironment() { return !!this.data.isFromInvite; },
    // 关键:绑定真权威实现(真机上 chat.js 恒这么绑)
    isPlaceholderNickname(name) { return ChatHelpers.isPlaceholderNickname(name); },
    deduplicateParticipants() { spies.deduplicateParticipants++; },
    fetchChatParticipants() { spies.fetchChatParticipants++; },
    fetchChatParticipantsWithRealNames(flag) { spies.fetchChatParticipantsWithRealNames.push(flag); },
    retryGetRealInviterName() { spies.retryGetRealInviterName++; },
  }, o.instance || {});

  page._setDataCalls = setDataCalls;
  page._spies = spies;

  TitleController.attach(page);

  // updateReceiverTitleWithRealNames 既是被测方法也被 updateDynamicTitleWithRealNames 调用,
  // 默认包成 spy(记录调用次数后转调真实实现,以便既能验证转交又能验证产出)。
  // 用例如需纯 spy(不执行真实逻辑),通过 o.stubReceiverRealNames=true 控制。
  if (o.stubReceiverRealNames) {
    page.updateReceiverTitleWithRealNames = function() { spies.updateReceiverTitleWithRealNames++; };
  } else {
    const realReceiverRealNames = page.updateReceiverTitleWithRealNames;
    page.updateReceiverTitleWithRealNames = function() {
      spies.updateReceiverTitleWithRealNames++;
      return realReceiverRealNames.call(this);
    };
  }

  return page;
}

// 静默 console
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
function silenceLogs() { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
function restoreLogs() { console.log = origLog; console.warn = origWarn; console.error = origError; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

/** 每个用例前重置全局可变状态 */
function resetEnv() {
  resetTimers();
  navTitleCalls = [];
  cloudResponse = { participants: [] };
  cloudShouldFail = false;
  mockStorage = {};
  mockApp = { globalData: {} };
  mockPagesOptions = {};
}

// ============ 探针:逐方法逐用例固化基线(阶段一) ============
// 任务 2-5 的矩阵在此填充。当前为骨架自检。

origLog('--- 骨架自检 ---');
{
  resetEnv();
  const page = makeTitlePage();
  assert('0.attach 挂载 updateDynamicTitle', typeof page.updateDynamicTitle === 'function');
  assert('0.attach 挂载 updateDynamicTitleWithRealNames', typeof page.updateDynamicTitleWithRealNames === 'function');
  assert('0.attach 挂载 updateTitleForReceiver', typeof page.updateTitleForReceiver === 'function');
  assert('0.attach 挂载 updateReceiverTitleWithRealNames', typeof page.updateReceiverTitleWithRealNames === 'function');
  assert('0.attach 挂载 fetchRealInviterNameAndUpdateTitle', typeof page.fetchRealInviterNameAndUpdateTitle === 'function');
  assert('0.attach 挂载 protectReceiverTitle', typeof page.protectReceiverTitle === 'function');
  assert('0.isPlaceholderNickname 绑定权威实现(朋友→true)', page.isPlaceholderNickname('朋友') === true);
  assert('0.isPlaceholderNickname 绑定权威实现(小明→false)', page.isPlaceholderNickname('小明') === false);
}

// ============ Task 2: updateDynamicTitle 决策矩阵(去重阈值 >3) ============
origLog('--- updateDynamicTitle ---');

// D1 单人 A 端 → 自己昵称
{
  resetEnv();
  const page = makeTitlePage({ data: { isFromInvite: false, participants: [{ openId: 'self', nickName: '我自己' }], dynamicTitle: '' } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D1.单人A端→自己昵称', page.data.dynamicTitle, '我自己');
}

// D2 单人 A 端 + 前置含（2） → 早退保持
{
  resetEnv();
  const page = makeTitlePage({ data: { isFromInvite: false, participants: [{ openId: 'self', nickName: '我自己' }], dynamicTitle: '我和小明（2）' } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D2.单人A端+前置双人标题→早退保持', page.data.dynamicTitle, '我和小明（2）');
}

// D3 单人 B 端 + URL inviter → 我和[inviter]（2）
{
  resetEnv();
  mockPagesOptions = { inviter: '小红' };
  const page = makeTitlePage({ data: { isFromInvite: true, participants: [{ openId: 'self', nickName: '我自己' }], dynamicTitle: '' } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D3.单人B端+URL inviter', page.data.dynamicTitle, '我和小红（2）');
}

// D4 单人 B 端 + 无 URL/storage → 兜底 朋友
{
  resetEnv();
  const page = makeTitlePage({ data: { isFromInvite: true, participants: [{ openId: 'self', nickName: '我自己' }], dynamicTitle: '' } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D4.单人B端兜底→我和朋友（2）', page.data.dynamicTitle, '我和朋友（2）');
}

// D5 双人 A 端 真名 → 我和小明（2）
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '小明' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D5.双人A端真名', page.data.dynamicTitle, '我和小明（2）');
}

// D6 双人 A 端 占位(朋友) → 保持自己昵称
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '朋友' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D6.双人A端占位→保持自己昵称', page.data.dynamicTitle, '我自己');
}

// D7 双人 A 端 真名但 temp_user → 保持自己昵称
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'temp_user', nickName: '小明' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D7.双人A端temp_user→保持自己昵称', page.data.dynamicTitle, '我自己');
}

// D8 双人 B 端 真名 → 我和小明（2）
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: true,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '小明' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D8.双人B端真名', page.data.dynamicTitle, '我和小明（2）');
}

// D9 双人 B 端 占位(用户) + 无 URL/storage → 兜底 朋友
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: true,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '用户' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D9.双人B端占位兜底→我和朋友（2）', page.data.dynamicTitle, '我和朋友（2）');
}

// D10 双人 A+invite参数 真名 → 我和小明（2）
{
  resetEnv();
  mockPagesOptions = { inviter: '小明' };
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '小明' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D10.双人A+invite参数真名', page.data.dynamicTitle, '我和小明（2）');
}

// D11 多人(3) → 群聊（3）
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'b', nickName: '小明' }, { openId: 'c', nickName: '小红' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D11.多人(3)→群聊（3）', page.data.dynamicTitle, '群聊（3）');
}

// D12 超阈值(4) → 触发 deduplicateParticipants,不直接设标题
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self' }, { openId: 'b' }, { openId: 'c' }, { openId: 'd' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D12.超阈值(4)触发去重', page._spies.deduplicateParticipants, 1);
}

// D13 双人 B 端 真名 + hasJoinedAsReceiver + 前置真名标题 → 早退保护
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: true,
    hasJoinedAsReceiver: true,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '小明' }],
    dynamicTitle: '我和小明（2）',
  } });
  withSilence(() => page.updateDynamicTitle());
  assertEqual('D13.B端真名保护早退', page.data.dynamicTitle, '我和小明（2）');
}

// D14 [Tier B] 双人 A 端 边界占位「新用户」
//   收敛前: L652 数组漏判「新用户」→ 视为真名 → 我和新用户（2）
//   收敛后(S2 已收敛): isPlaceholderNickname('新用户')=true → 保持自己昵称 我自己
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '新用户' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  // TIER_B 已更正(收敛前 '我和新用户（2）' → 收敛后 '我自己'):占位符不再泄漏进标题
  assertEqual('D14.[TierB]双人A端「新用户」(收敛后=我自己)', page.data.dynamicTitle, '我自己');
}

// D15 [Tier B] 双人 B 端 边界占位「新用户」+ 无 URL/storage
//   收敛前: L663 数组漏判「新用户」→ 视为真名 → 我和新用户（2）
//   收敛后(S3 已收敛): 判占位 → 兜底 我和朋友（2）
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: true,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '新用户' }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateDynamicTitle());
  // TIER_B 已更正(收敛前 '我和新用户（2）' → 收敛后 '我和朋友（2）'):占位符被兜底替换
  assertEqual('D15.[TierB]双人B端「新用户」(收敛后=我和朋友（2）)', page.data.dynamicTitle, '我和朋友（2）');
}

// D16 [Tier B] 双人 B 端 真名含占位子串「用户体验师」+ hasJoinedAsReceiver + 前置该标题
//   收敛前: L539 子串 includes('用户') 命中 → hasPlaceholder=true → 不早退保护 → 重算
//   收敛后: 提取昵称「用户体验师」isPlaceholderNickname=false → hasPlaceholder=false → 早退保护
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: true,
    hasJoinedAsReceiver: true,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '用户体验师' }],
    dynamicTitle: '我和用户体验师（2）',
  } });
  withSilence(() => page.updateDynamicTitle());
  // TIER_B: 收敛前重算后仍应为「我和用户体验师（2）」(对方真名),收敛后早退也是同值 → 标题相同
  // 此处固化收敛前的【重算路径产出】,并在阶段三核对收敛后路径切换为早退但产出一致
  assertEqual('D16.[TierB]双人B端真名含占位子串', page.data.dynamicTitle, '我和用户体验师（2）');
}

// ============ Task 3: updateDynamicTitleWithRealNames 矩阵(去重阈值 >2 + 锁定转交) ============
origLog('\n--- updateDynamicTitleWithRealNames ---');

// R1c receiverTitleLocked → 转交 updateReceiverTitleWithRealNames
{
  resetEnv();
  const page = makeTitlePage({
    data: { isFromInvite: true, participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '小明' }] },
    instance: { receiverTitleLocked: true },
    stubReceiverRealNames: true,
  });
  withSilence(() => page.updateDynamicTitleWithRealNames());
  assertEqual('R1c.锁定转交 updateReceiverTitleWithRealNames', page._spies.updateReceiverTitleWithRealNames, 1);
}

// R2c 单人 A 端 → 自己昵称
{
  resetEnv();
  const page = makeTitlePage({ data: { isFromInvite: false, participants: [{ openId: 'self', nickName: '我自己' }] } });
  withSilence(() => page.updateDynamicTitleWithRealNames());
  assertEqual('R2c.单人A端→自己昵称', page.data.dynamicTitle, '我自己');
}

// R3c 单人 B 端 + 无 URL/storage → 兜底朋友
{
  resetEnv();
  const page = makeTitlePage({ data: { isFromInvite: true, participants: [{ openId: 'self', nickName: '我自己' }] } });
  withSilence(() => page.updateDynamicTitleWithRealNames());
  assertEqual('R3c.单人B端兜底→我和朋友（2）', page.data.dynamicTitle, '我和朋友（2）');
}

// R4c 双人 A 端 真名 → 我和小明（2）
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '小明' }],
  } });
  withSilence(() => page.updateDynamicTitleWithRealNames());
  assertEqual('R4c.双人A端真名', page.data.dynamicTitle, '我和小明（2）');
}

// R5c 双人 A 端 占位(朋友) → 触发 fetchChatParticipantsWithRealNames(true) + 兜底朋友
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '朋友' }],
  } });
  withSilence(() => page.updateDynamicTitleWithRealNames());
  assert('R5c.占位触发 fetchChatParticipantsWithRealNames(true)', page._spies.fetchChatParticipantsWithRealNames.indexOf(true) !== -1);
  assertEqual('R5c.占位兜底标题', page.data.dynamicTitle, '我和朋友（2）');
}

// R6c 超阈值(3) → 触发去重
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self' }, { openId: 'b' }, { openId: 'c' }],
  } });
  withSilence(() => page.updateDynamicTitleWithRealNames());
  assertEqual('R6c.超阈值(3)触发去重', page._spies.deduplicateParticipants, 1);
}

// R7c [验证替身精确性] 双人 A 端 边界占位「发送方」
//   真机上 L460 走 this.isPlaceholderNickname(权威)→ 判占位 → 触发 fetch + 兜底
//   收敛后一致(L461 inline 数组是死兜底,真机不走)→ 实际 Tier A
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: false,
    participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '发送方' }],
  } });
  withSilence(() => page.updateDynamicTitleWithRealNames());
  assert('R7c.边界「发送方」走权威判占位→触发 fetch', page._spies.fetchChatParticipantsWithRealNames.indexOf(true) !== -1);
  assertEqual('R7c.边界「发送方」兜底标题', page.data.dynamicTitle, '我和朋友（2）');
}

// ============ Task 4: updateTitleForReceiver 矩阵(仅 B 端 + URL 解码 + 兜底重试) ============
origLog('\n--- updateTitleForReceiver ---');

// T1 A 端守卫 → 直接 return,不设标题、不锁定
{
  resetEnv();
  const page = makeTitlePage({ data: { isFromInvite: false, dynamicTitle: '' } });
  withSilence(() => page.updateTitleForReceiver('小明'));
  assertEqual('T1.A端守卫不设标题', page.data.dynamicTitle, '');
  assert('T1.A端守卫不锁定', !page.receiverTitleLocked);
}

// T2 B 端 入参真名 → 我和小明（2）+ 锁定 + protectReceiverTitle 启动(注册 interval)
{
  resetEnv();
  const page = makeTitlePage({ data: { isFromInvite: true, participants: [], dynamicTitle: '' } });
  withSilence(() => page.updateTitleForReceiver('小明'));
  assertEqual('T2.B端入参真名标题', page.data.dynamicTitle, '我和小明（2）');
  assertEqual('T2.receiverTitleLocked 置真', page.receiverTitleLocked, true);
  assert('T2.protectReceiverTitle 启动(注册 interval)', intervalTasks.length >= 1);
}

// T3 B 端 URL inviter 双重编码 → 双重解码后 我和张三（2）
{
  resetEnv();
  // 双重编码「张三」
  mockPagesOptions = { inviter: encodeURIComponent(encodeURIComponent('张三')) };
  const page = makeTitlePage({ data: { isFromInvite: true, participants: [], dynamicTitle: '' } });
  withSilence(() => page.updateTitleForReceiver(''));
  assertEqual('T3.B端URL双重解码', page.data.dynamicTitle, '我和张三（2）');
}

// T4 B 端 全占位 → 兜底「a端用户」+ 2s 后 retryGetRealInviterName
{
  resetEnv();
  const page = makeTitlePage({ data: { isFromInvite: true, participants: [], dynamicTitle: '' } });
  withSilence(() => page.updateTitleForReceiver('朋友'));
  assertEqual('T4.B端全占位兜底→我和a端用户（2）', page.data.dynamicTitle, '我和a端用户（2）');
  withSilence(() => runAllTimeouts());
  assertEqual('T4.2s 后 retryGetRealInviterName 被调', page._spies.retryGetRealInviterName, 1);
}

// ============ Task 5a: updateReceiverTitleWithRealNames 矩阵 ============
origLog('\n--- updateReceiverTitleWithRealNames ---');

// RR1 空参与者 → return,标题不变
{
  resetEnv();
  const page = makeTitlePage({ data: { participants: [], dynamicTitle: '原标题' } });
  withSilence(() => page.updateReceiverTitleWithRealNames());
  assertEqual('RR1.空参与者标题不变', page.data.dynamicTitle, '原标题');
}

// RR2 双人真名 → 我和小明（2）
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: true,
    participants: [{ openId: 'self', nickName: '我自己', isSelf: true }, { openId: 'other', nickName: '小明', isSelf: false }],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateReceiverTitleWithRealNames());
  assertEqual('RR2.双人真名', page.data.dynamicTitle, '我和小明（2）');
}

// RR3 双人占位(用户) → 保持当前标题(不更新)
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: true,
    participants: [{ openId: 'self', nickName: '我自己', isSelf: true }, { openId: 'other', nickName: '用户', isSelf: false }],
    dynamicTitle: '我和朋友（2）',
  } });
  withSilence(() => page.updateReceiverTitleWithRealNames());
  assertEqual('RR3.双人占位保持当前标题', page.data.dynamicTitle, '我和朋友（2）');
}

// RR4 3 人(去重后含真名邀请者) → 去重并强制真名标题
{
  resetEnv();
  const page = makeTitlePage({ data: {
    isFromInvite: true,
    participants: [
      { openId: 'self', nickName: '我自己', isSelf: true },
      { openId: 'other', nickName: '小明', isSelf: false },
      { openId: 'other', nickName: '小明', isSelf: false },
    ],
    dynamicTitle: '',
  } });
  withSilence(() => page.updateReceiverTitleWithRealNames());
  assertEqual('RR4.去重后强制真名标题', page.data.dynamicTitle, '我和小明（2）');
}

// ============ Task 5b: fetchRealInviterNameAndUpdateTitle 矩阵 ============
origLog('\n--- fetchRealInviterNameAndUpdateTitle ---');

// F1 云函数返回真名 → 更新标题 + setNavigationBarTitle
{
  resetEnv();
  cloudResponse = { participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '小明' }] };
  const page = makeTitlePage({ data: { chatId: 'chat_x', currentUser: { openId: 'self', nickName: '我自己' } } });
  withSilence(() => page.fetchRealInviterNameAndUpdateTitle());
  assertEqual('F1.云函数真名更新标题', page.data.dynamicTitle, '我和小明（2）');
  assertEqual('F1.setNavigationBarTitle 收到标题', navTitleCalls[navTitleCalls.length - 1], '我和小明（2）');
}

// F2 云函数返回占位 → 不更新标题
{
  resetEnv();
  cloudResponse = { participants: [{ openId: 'self', nickName: '我自己' }, { openId: 'other', nickName: '朋友' }] };
  const page = makeTitlePage({ data: { chatId: 'chat_x', currentUser: { openId: 'self' }, dynamicTitle: '原标题' } });
  withSilence(() => page.fetchRealInviterNameAndUpdateTitle());
  assertEqual('F2.云函数占位不更新标题', page.data.dynamicTitle, '原标题');
}

// F3 云函数 fail → 不抛、不改标题
{
  resetEnv();
  cloudShouldFail = true;
  const page = makeTitlePage({ data: { chatId: 'chat_x', dynamicTitle: '原标题' } });
  let threw = false;
  try { withSilence(() => page.fetchRealInviterNameAndUpdateTitle()); } catch (e) { threw = true; }
  assertEqual('F3.云函数fail不抛', threw, false);
  assertEqual('F3.云函数fail不改标题', page.data.dynamicTitle, '原标题');
}

// ============ Task 5c: protectReceiverTitle 矩阵 ============
origLog('\n--- protectReceiverTitle ---');

// P1 标题被改成不合法 → tick 后恢复
{
  resetEnv();
  const page = makeTitlePage({ data: { dynamicTitle: '我和小明（2）', currentUser: { openId: 'self', nickName: '我自己' } } });
  withSilence(() => page.protectReceiverTitle('我和小明（2）'));
  // 模拟标题被其他逻辑改坏
  page.data.dynamicTitle = '我自己';
  withSilence(() => tickAllIntervals());
  assertEqual('P1.错误标题被恢复', page.data.dynamicTitle, '我和小明（2）');
}

// P2 标题仍合法 → tick 不动
{
  resetEnv();
  const page = makeTitlePage({ data: { dynamicTitle: '我和小明（2）', currentUser: { openId: 'self', nickName: '我自己' } } });
  withSilence(() => page.protectReceiverTitle('我和小明（2）'));
  navTitleCalls = [];
  withSilence(() => tickAllIntervals());
  assertEqual('P2.合法标题不动', page.data.dynamicTitle, '我和小明（2）');
}

// P3 30s 后 clearInterval 停止轮询
{
  resetEnv();
  const page = makeTitlePage({ data: { dynamicTitle: '我和小明（2）', currentUser: { openId: 'self' } } });
  withSilence(() => page.protectReceiverTitle('我和小明（2）'));
  const ivBefore = intervalTasks.filter(t => !t.cleared).length;
  withSilence(() => runAllTimeouts()); // 触发 30s 的 setTimeout → clearInterval
  const ivAfter = intervalTasks.filter(t => !t.cleared).length;
  assert('P3.30s 后 interval 被清', ivBefore >= 1 && ivAfter < ivBefore);
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`title-controller 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

// 还原全局
global.setInterval = origSetInterval;
global.clearInterval = origClearInterval;
global.setTimeout = origSetTimeout;
global.clearTimeout = origClearTimeout;

if (fail > 0) process.exit(1);
