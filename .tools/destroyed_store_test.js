/**
 * destroyed-store.js 行为测试
 *
 * 覆盖销毁消息记录"全局存储"3 个对外方法:
 * - getStorageKey: 命名空间策略 + 多源 fallback 优先级
 * - initialize: 全局 Map + Set + 本地恢复 + 重复初始化防护
 * - ensure: 防御性兜底
 */

const path = require('path');

// ====== mock wx storage(可控异常) ======
const mockStorage = {};
let storageThrows = false;
global.wx = {
  getStorageSync: (k) => {
    if (storageThrows) throw new Error('storage broken');
    return mockStorage[k];
  },
  setStorageSync: (k, v) => { mockStorage[k] = v; },
};

let mockApp = { globalData: {} };
global.getApp = () => mockApp;

// ====== 加载模块 ======
const Store = require(path.join(__dirname, '../app/pages/chat/modules/destroyed-store.js'));

let pass = 0;
let fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail || ''}`); }
}
function assertEqual(name, got, expected) {
  assert(name, got === expected, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

function reset() {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  mockApp = { globalData: {} };
  storageThrows = false;
}

// 静默 console
const origLog = console.log;
function silenceLogs() { console.log = () => {}; }
function restoreLogs() { console.log = origLog; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

function makePage(overrides) {
  return Object.assign({
    data: { contactId: 'chat_x', currentUser: { openId: 'me' } },
    options: {},
    actualCurrentUser: null,
  }, overrides || {});
}

// ============ getStorageKey ============
origLog('--- getStorageKey ---');

// 用例 1:标准从 page.data 取 chatId+openId
{
  reset();
  const page = makePage();
  const key = Store.getStorageKey(page);
  assertEqual('1.标准 key', key, 'destroyedMessageIds_me_chat_x');
}

// 用例 2:chatIdOverride 优先于 page.data
{
  reset();
  const page = makePage();
  const key = Store.getStorageKey(page, 'override_chat');
  assertEqual('2.chatIdOverride 优先', key, 'destroyedMessageIds_me_override_chat');
}

// 用例 3:userOpenIdOverride 优先
{
  reset();
  const page = makePage();
  const key = Store.getStorageKey(page, null, 'override_user');
  assertEqual('3.userOpenIdOverride 优先', key, 'destroyedMessageIds_override_user_chat_x');
}

// 用例 4:都缺失时 fallback 到 unknownChat / anonymous
{
  reset();
  const page = makePage({ data: {}, options: {}, actualCurrentUser: null });
  const key = Store.getStorageKey(page);
  assertEqual('4.fallback 全为默认', key, 'destroyedMessageIds_anonymous_unknownChat');
}

// 用例 5:fallback 优先级:page.data > page.options(chatId)
{
  reset();
  const page = makePage({
    data: {}, // 没 contactId
    options: { id: 'from_options' },
    actualCurrentUser: null,
  });
  const key = Store.getStorageKey(page);
  assert('5.fallback 到 options.id', key.includes('from_options'));
}

// 用例 6:fallback 优先级:page.data.currentUser > actualCurrentUser > app.globalData.openId
{
  reset();
  mockApp.globalData.openId = 'app_openid';
  const page = makePage({
    data: { contactId: 'c' }, // 无 currentUser
    options: {},
    actualCurrentUser: null,
  });
  const key = Store.getStorageKey(page);
  assert('6.fallback 到 app.globalData.openId', key.includes('app_openid'));
}

// 用例 7:actualCurrentUser 优先于 app.globalData.openId
{
  reset();
  mockApp.globalData.openId = 'app_openid';
  const page = makePage({
    data: { contactId: 'c' },
    options: {},
    actualCurrentUser: { openId: 'actual_user' },
  });
  const key = Store.getStorageKey(page);
  assert('7.actualCurrentUser 优先', key.includes('actual_user'));
  assert('7.不含 app_openid', !key.includes('app_openid'));
}

// ============ initialize ============
origLog('\n--- initialize ---');

// 用例 8:首次创建 globalDestroyedMessageStore + Set
{
  reset();
  const page = makePage();
  withSilence(() => Store.initialize(page));
  assert('8.app.globalDestroyedMessageStore 被建', !!mockApp.globalDestroyedMessageStore);
  assert('8.对应 key 是 Set', mockApp.globalDestroyedMessageStore['destroyedMessageIds_me_chat_x'] instanceof Set);
  assert('8.page.globalDestroyedMessageIds 被赋值', page.globalDestroyedMessageIds instanceof Set);
  assertEqual('8.page.destroyedStoreKey 被设置', page.destroyedStoreKey, 'destroyedMessageIds_me_chat_x');
}

// 用例 9:同 key 重复 init 不重复创建,引用相同
{
  reset();
  const page1 = makePage();
  const page2 = makePage();
  withSilence(() => Store.initialize(page1));
  withSilence(() => Store.initialize(page2));
  // 两个 page 应共享同一 Set 引用
  assertEqual('9.两个 page 共享同 Set 引用', page1.globalDestroyedMessageIds, page2.globalDestroyedMessageIds);
}

// 用例 10:从 wx.storage 恢复 savedDestroyedIds 到 Set
{
  reset();
  mockStorage['destroyedMessageIds_me_chat_x'] = ['msg_1', 'msg_2', 'msg_3'];
  const page = makePage();
  withSilence(() => Store.initialize(page));
  assertEqual('10.恢复 3 条记录', page.globalDestroyedMessageIds.size, 3);
  assert('10.含 msg_1', page.globalDestroyedMessageIds.has('msg_1'));
  assert('10.含 msg_2', page.globalDestroyedMessageIds.has('msg_2'));
  assert('10.含 msg_3', page.globalDestroyedMessageIds.has('msg_3'));
}

// 用例 11:storage 中是非数组(数据损坏)时不破坏 Set
{
  reset();
  mockStorage['destroyedMessageIds_me_chat_x'] = 'corrupted';
  const page = makePage();
  withSilence(() => Store.initialize(page));
  assertEqual('11.数据损坏时 Set 仍为空', page.globalDestroyedMessageIds.size, 0);
}

// 用例 12:wx.storage 抛错时被吞,不冒泡
{
  reset();
  storageThrows = true;
  const page = makePage();
  let threw = false;
  try {
    withSilence(() => Store.initialize(page));
  } catch (e) {
    threw = true;
  }
  storageThrows = false;
  assertEqual('12.storage 异常被吞', threw, false);
  assert('12.Set 仍被建', page.globalDestroyedMessageIds instanceof Set);
}

// 用例 13:不同 chatId 命名空间隔离
{
  reset();
  const pageA = makePage({ data: { contactId: 'chat_a', currentUser: { openId: 'me' } } });
  const pageB = makePage({ data: { contactId: 'chat_b', currentUser: { openId: 'me' } } });
  withSilence(() => Store.initialize(pageA));
  withSilence(() => Store.initialize(pageB));
  pageA.globalDestroyedMessageIds.add('msg_only_in_a');
  assert('13a.A 含 msg_only_in_a', pageA.globalDestroyedMessageIds.has('msg_only_in_a'));
  assert('13b.B 不含 msg_only_in_a', !pageB.globalDestroyedMessageIds.has('msg_only_in_a'));
}

// 用例 14:不同 openId 命名空间隔离
{
  reset();
  const pageMe = makePage({ data: { contactId: 'chat_x', currentUser: { openId: 'me' } } });
  const pageOther = makePage({ data: { contactId: 'chat_x', currentUser: { openId: 'other' } } });
  withSilence(() => Store.initialize(pageMe));
  withSilence(() => Store.initialize(pageOther));
  pageMe.globalDestroyedMessageIds.add('msg_me_only');
  assert('14.不同用户命名空间隔离', !pageOther.globalDestroyedMessageIds.has('msg_me_only'));
}

// 用例 15:initialize 显式传 chatId/userOpenId 覆盖 page.data
{
  reset();
  const page = makePage();
  withSilence(() => Store.initialize(page, 'explicit_chat', 'explicit_user'));
  assertEqual('15.使用显式 chatId+userOpenId', page.destroyedStoreKey, 'destroyedMessageIds_explicit_user_explicit_chat');
}

// ============ ensure ============
origLog('\n--- ensure ---');

// 用例 16:未初始化时调 initialize
{
  reset();
  const page = makePage();
  withSilence(() => Store.ensure(page));
  assert('16.ensure 后 globalDestroyedMessageIds 存在', page.globalDestroyedMessageIds instanceof Set);
  assertEqual('16.destroyedStoreKey 被设', page.destroyedStoreKey, 'destroyedMessageIds_me_chat_x');
}

// 用例 17:已初始化时不重复(引用不变)
{
  reset();
  const page = makePage();
  withSilence(() => Store.initialize(page));
  const firstSet = page.globalDestroyedMessageIds;
  firstSet.add('preserve_me');
  withSilence(() => Store.ensure(page));
  assertEqual('17.ensure 后 Set 引用不变', page.globalDestroyedMessageIds, firstSet);
  assert('17.preserve_me 仍在', page.globalDestroyedMessageIds.has('preserve_me'));
}

// 用例 18:ensure 通过 page.data 提取 chatId/openId
{
  reset();
  const page = makePage({ data: { contactId: 'ensure_chat', currentUser: { openId: 'ensure_user' } } });
  withSilence(() => Store.ensure(page));
  assertEqual('18.ensure 用 page.data 算 key', page.destroyedStoreKey, 'destroyedMessageIds_ensure_user_ensure_chat');
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`destroyed-store 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

if (fail > 0) process.exit(1);
