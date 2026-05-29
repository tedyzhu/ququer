/**
 * share-utils.js 行为测试
 *
 * 覆盖 2 个对外方法:
 * - recordChatVisit: storage 累加 / chatCreators 候选 / 异常吞错
 * - buildSharePayload: title 含昵称 / path 含 chatId+inviter+fromInvite+action / 监听器触发
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
  setStorageSync: (k, v) => {
    if (storageThrows) throw new Error('storage broken');
    mockStorage[k] = v;
  },
};

let mockGlobalData = {};
global.getApp = () => ({ globalData: mockGlobalData });

// ====== 加载模块 ======
const ShareUtils = require(path.join(__dirname, '../app/pages/chat/modules/share-utils.js'));

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
  mockGlobalData = {};
  storageThrows = false;
}

// 静默 console
const origLog = console.log;
const origError = console.error;
function silenceLogs() { console.log = () => {}; console.error = () => {}; }
function restoreLogs() { console.log = origLog; console.error = origError; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

// ============ recordChatVisit ============
origLog('--- recordChatVisit ---');

// 用例 1:无 chatId 时跳过
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('', 'user_a'));
  assertEqual('1.无 chatId 时不写 storage', Object.keys(mockStorage).length, 0);
}

// 用例 2:无 userId 时跳过
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('chat_x', ''));
  assertEqual('2.无 userId 时不写 storage', Object.keys(mockStorage).length, 0);
}

// 用例 3:首次访问 history[chatId]=1
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  assertEqual('3.访问次数=1', mockStorage['chat_visit_history']['chat_x'], 1);
  assert('3.visited_chats 含 chat_x', mockStorage['visited_chats'].includes('chat_x'));
}

// 用例 4:重复访问累加
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  assertEqual('4.访问次数累加到 3', mockStorage['chat_visit_history']['chat_x'], 3);
}

// 用例 5:visited_chats 去重(同一 chatId 多次访问只保留 1 条)
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  assertEqual('5.visited_chats 长度=1', mockStorage['visited_chats'].length, 1);
}

// 用例 6:多个 chatId 都被收录
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('chat_a', 'user_a'));
  withSilence(() => ShareUtils.recordChatVisit('chat_b', 'user_a'));
  assertEqual('6.visited_chats 长度=2', mockStorage['visited_chats'].length, 2);
  assert('6.含 chat_a', mockStorage['visited_chats'].includes('chat_a'));
  assert('6.含 chat_b', mockStorage['visited_chats'].includes('chat_b'));
}

// 用例 7:访问 ≥ 2 次时加入 chatCreators
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a')); // 1 次,不加入
  assert('7a.第 1 次访问不加入 chatCreators', !(mockGlobalData.chatCreators || []).includes('user_a_chat_x'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a')); // 2 次,加入
  assert('7b.第 2 次访问加入 chatCreators', mockGlobalData.chatCreators.includes('user_a_chat_x'));
}

// 用例 8:已存在的 chatCreators 不重复加入
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  assertEqual('8.chatCreators 不重复加入', mockGlobalData.chatCreators.filter(k => k === 'user_a_chat_x').length, 1);
}

// 用例 9:不同 user 同 chatId → 不同 creatorKey
{
  reset();
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_b'));
  withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_b'));
  assert('9.user_a_chat_x 已加入', mockGlobalData.chatCreators.includes('user_a_chat_x'));
  assert('9.user_b_chat_x 已加入', mockGlobalData.chatCreators.includes('user_b_chat_x'));
  assertEqual('9.chatCreators 长度=2', mockGlobalData.chatCreators.length, 2);
}

// 用例 10:wx.storage 抛错时被 try/catch 吞,不冒泡
{
  reset();
  storageThrows = true;
  let threw = false;
  try {
    withSilence(() => ShareUtils.recordChatVisit('chat_x', 'user_a'));
  } catch (e) {
    threw = true;
  }
  storageThrows = false;
  assertEqual('10.storage 异常被吞', threw, false);
}

// ============ buildSharePayload ============
origLog('\n--- buildSharePayload ---');

function makeFakePage(overrides) {
  return Object.assign({
    data: { contactId: 'chat_share_x' },
    startWatchingForNewParticipants(chatId) { this._watchedChatId = chatId; },
  }, overrides || {});
}

// 用例 11:正常昵称返回 title / path / imageUrl
{
  reset();
  mockGlobalData.userInfo = { openId: 'me', nickName: 'Bob' };
  const page = makeFakePage();
  const payload = withSilence(() => ShareUtils.buildSharePayload(page));
  assertEqual('11.title 含昵称', payload.title, 'Bob邀请你加入私密聊天');
  assertEqual('11.imageUrl 是 logo', payload.imageUrl, '/assets/images/logo.png');
  assert('11.path 起始正确', payload.path.startsWith('/app/pages/chat/chat?'));
}

// 用例 12:path 含 chatId / inviter / fromInvite / action
{
  reset();
  mockGlobalData.userInfo = { openId: 'me', nickName: 'Bob' };
  const page = makeFakePage({ data: { contactId: 'specific_chat' } });
  const payload = withSilence(() => ShareUtils.buildSharePayload(page));
  assert('12.path 含 chatId', payload.path.includes('id=specific_chat'));
  assert('12.path 含 inviter', payload.path.includes('inviter=Bob'));
  assert('12.path 含 fromInvite=true', payload.path.includes('fromInvite=true'));
  assert('12.path 含 action=join', payload.path.includes('action=join'));
}

// 用例 13:中文昵称被 encodeURIComponent
{
  reset();
  mockGlobalData.userInfo = { openId: 'me', nickName: '小明' };
  const page = makeFakePage();
  const payload = withSilence(() => ShareUtils.buildSharePayload(page));
  // encodeURIComponent('小明') === '%E5%B0%8F%E6%98%8E'
  assert('13.中文昵称被 encode', payload.path.includes('inviter=%E5%B0%8F%E6%98%8E'));
  // title 中保留原始中文(未 encode)
  assertEqual('13.title 保留中文', payload.title, '小明邀请你加入私密聊天');
}

// 用例 14:调 page.startWatchingForNewParticipants(chatId)
{
  reset();
  mockGlobalData.userInfo = { openId: 'me', nickName: 'Bob' };
  const page = makeFakePage({ data: { contactId: 'monitor_me' } });
  withSilence(() => ShareUtils.buildSharePayload(page));
  assertEqual('14.startWatching 被调,带正确 chatId', page._watchedChatId, 'monitor_me');
}

// 用例 15:nickName 缺失时 fallback 到 "好友"
{
  reset();
  mockGlobalData.userInfo = { openId: 'me' }; // 无 nickName
  const page = makeFakePage();
  const payload = withSilence(() => ShareUtils.buildSharePayload(page));
  assertEqual('15.fallback 昵称为"好友"', payload.title, '好友邀请你加入私密聊天');
  assert('15.path inviter=好友(已 encode)', payload.path.includes('inviter=' + encodeURIComponent('好友')));
}

// 用例 16:userInfo 完全缺失也安全
{
  reset();
  mockGlobalData = {}; // 没有 userInfo
  const page = makeFakePage();
  let threw = false;
  try {
    const payload = withSilence(() => ShareUtils.buildSharePayload(page));
    assertEqual('16.userInfo 缺失时 fallback 昵称', payload.title, '好友邀请你加入私密聊天');
  } catch (e) {
    threw = true;
  }
  assertEqual('16.不抛错', threw, false);
}

// 用例 17:page.startWatchingForNewParticipants 不是函数时不报错
{
  reset();
  mockGlobalData.userInfo = { openId: 'me', nickName: 'Bob' };
  const page = makeFakePage();
  page.startWatchingForNewParticipants = null;
  let threw = false;
  try {
    withSilence(() => ShareUtils.buildSharePayload(page));
  } catch (e) {
    threw = true;
  }
  assertEqual('17.无监听方法时安全返回', threw, false);
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`share-utils 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

if (fail > 0) process.exit(1);
