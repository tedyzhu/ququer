/**
 * identity-utils.js 行为测试
 *
 * 这是 P3 阶段(onLoad 拆 identity-resolver)的回归基础:
 * 拆分前测出当前行为基准,拆分后必须保持一致。
 *
 * 测试覆盖:
 *  - isReceiverEnvironment:9 条决策路径(短路返回的优先级)
 *  - isMessageFromCurrentUser:严格相等判定 + 取自 page/app 的 fallback
 *  - hasBEndJoinEver / markBEndJoinEver:本地存储读写
 */

const path = require('path');

// ====== 模拟 wx 全局(本测试需要 storage 与 console.warn) ======
const mockStorage = {};
global.wx = {
  getStorageSync: (k) => mockStorage[k],
  setStorageSync: (k, v) => { mockStorage[k] = v; }
};

let mockApp = { globalData: {} };
global.getApp = () => mockApp;

const IdentityUtils = require(path.join(__dirname, '../app/pages/chat/modules/identity-utils.js'));

let pass = 0;
let fail = 0;

function assert(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${detail || ''}`);
  }
}

function assertEqual(name, got, expected) {
  assert(name, got === expected, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

function makePage(data, instanceProps) {
  // 静默 console.warn / log,避免淹没测试输出
  const origWarn = console.warn;
  const origLog = console.log;
  return Object.assign({
    data: data || {},
    actualCurrentUser: null,
    finalIsFromInvite: undefined,
    isSender: undefined,
    options: {},
    _silenceLogs: () => {
      console.warn = () => {};
      console.log = () => {};
    },
    _restoreLogs: () => {
      console.warn = origWarn;
      console.log = origLog;
    }
  }, instanceProps || {});
}

// ============ isReceiverEnvironment ============
console.log('--- isReceiverEnvironment ---');

// 路径 1: data.isFromInvite === true 直接返回 true
assertEqual('1.isFromInvite=true', IdentityUtils.isReceiverEnvironment(makePage({ isFromInvite: true })), true);

// 路径 2: data.isSender === false 直接返回 true
assertEqual('2.isSender=false', IdentityUtils.isReceiverEnvironment(makePage({ isSender: false })), true);

// 路径 3: page.finalIsFromInvite 已确定
assertEqual('3.finalIsFromInvite=true', IdentityUtils.isReceiverEnvironment(makePage({}, { finalIsFromInvite: true })), true);
assertEqual('3.finalIsFromInvite=false', IdentityUtils.isReceiverEnvironment(makePage({}, { finalIsFromInvite: false })), false);

// 路径 4: page.isSender 已确定(取反)
assertEqual('4.isSender=true 推为 false', IdentityUtils.isReceiverEnvironment(makePage({}, { isSender: true })), false);
assertEqual('4.isSender=false 推为 true', IdentityUtils.isReceiverEnvironment(makePage({}, { isSender: false })), true);

// 路径 5: 自己在 participants 中且带 receiver 标记
{
  const page = makePage({
    currentUser: { openId: 'user_self' },
    participants: [
      { openId: 'user_self', isJoiner: true }
    ]
  });
  assertEqual('5a.isJoiner=true', IdentityUtils.isReceiverEnvironment(page), true);
}
{
  const page = makePage({
    currentUser: { openId: 'user_self' },
    participants: [
      { openId: 'user_self', isReceiver: true }
    ]
  });
  assertEqual('5b.isReceiver=true', IdentityUtils.isReceiverEnvironment(page), true);
}
{
  const page = makePage({
    currentUser: { openId: 'user_self' },
    participants: [
      { openId: 'user_self', role: 'receiver' }
    ]
  });
  assertEqual('5c.role=receiver', IdentityUtils.isReceiverEnvironment(page), true);
}

// 路径 6: 自己在 participants 中且带 creator 标记
{
  const page = makePage({
    currentUser: { openId: 'user_self' },
    participants: [
      { openId: 'user_self', isCreator: true }
    ]
  });
  assertEqual('6a.isCreator=true', IdentityUtils.isReceiverEnvironment(page), false);
}
{
  const page = makePage({
    currentUser: { openId: 'user_self' },
    participants: [
      { openId: 'user_self', role: 'creator' }
    ]
  });
  assertEqual('6b.role=creator', IdentityUtils.isReceiverEnvironment(page), false);
}

// 路径 7: 自己无明确标记,但其他人是 creator
{
  const page = makePage({
    currentUser: { openId: 'user_self' },
    participants: [
      { openId: 'user_self' },
      { openId: 'user_other', isCreator: true }
    ]
  });
  assertEqual('7.其他 isCreator,自己推为接收方', IdentityUtils.isReceiverEnvironment(page), true);
}

// 路径 8: storage 中 creator_<chatId> 不是当前用户
{
  mockStorage['creator_chat123'] = 'user_other';
  const page = makePage({
    contactId: 'chat123',
    currentUser: { openId: 'user_self' }
  });
  assertEqual('8.storage creator 不是自己', IdentityUtils.isReceiverEnvironment(page), true);
  delete mockStorage['creator_chat123'];
}

// 路径 9: 都不满足 → false(默认发送方)
assertEqual('9.无任何线索默认 false', IdentityUtils.isReceiverEnvironment(makePage({})), false);

// 短路优先级:isFromInvite 优先于 finalIsFromInvite
{
  const page = makePage({ isFromInvite: true }, { finalIsFromInvite: false });
  assertEqual('优先级.data.isFromInvite 短路', IdentityUtils.isReceiverEnvironment(page), true);
}

// ============ isMessageFromCurrentUser ============
console.log('\n--- isMessageFromCurrentUser ---');

// 有效用户判断
{
  const page = makePage({ currentUser: { openId: 'user_a' } });
  assertEqual('senderId == currentUser.openId', IdentityUtils.isMessageFromCurrentUser(page, 'user_a'), true);
  assertEqual('senderId != currentUser.openId', IdentityUtils.isMessageFromCurrentUser(page, 'user_b'), false);
}

// 显式传入 currentUserOpenId 优先
{
  const page = makePage({ currentUser: { openId: 'user_a' } });
  assertEqual('显式 openId 优先 page.data', IdentityUtils.isMessageFromCurrentUser(page, 'user_b', 'user_b'), true);
}

// fallback 到 app.globalData.userInfo.openId
{
  mockApp = { globalData: { userInfo: { openId: 'app_user' } } };
  const page = makePage({});
  assertEqual('fallback 到 app.globalData.userInfo', IdentityUtils.isMessageFromCurrentUser(page, 'app_user'), true);
  mockApp = { globalData: {} };
}

// fallback 到 app.globalData.openId
{
  mockApp = { globalData: { openId: 'app_openid_only' } };
  const page = makePage({});
  assertEqual('fallback 到 app.globalData.openId', IdentityUtils.isMessageFromCurrentUser(page, 'app_openid_only'), true);
  mockApp = { globalData: {} };
}

// 无效场景 → false
{
  const page = makePage({ currentUser: { openId: 'user_a' } });
  assertEqual('senderId 为空', IdentityUtils.isMessageFromCurrentUser(page, ''), false);
  assertEqual('senderId 为 system', IdentityUtils.isMessageFromCurrentUser(page, 'system'), false);
  assertEqual('senderId null', IdentityUtils.isMessageFromCurrentUser(page, null), false);
}

// 完全无 currentUser/openId 时返回 false
{
  mockApp = { globalData: {} };
  const page = makePage({});
  assertEqual('无 currentUser 与 app uid', IdentityUtils.isMessageFromCurrentUser(page, 'user_a'), false);
}

// 字符串/数字混合(strict equality 后字符串化)
{
  const page = makePage({ currentUser: { openId: '12345' } });
  assertEqual('数字 senderId 字符串归一', IdentityUtils.isMessageFromCurrentUser(page, 12345), true);
}

// ============ hasBEndJoinEver / markBEndJoinEver ============
console.log('\n--- hasBEndJoinEver / markBEndJoinEver ---');

// 干净环境:返回 false
{
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  const page = makePage({ contactId: 'chat_x' });
  assertEqual('未标记时 hasBEndJoinEver 返回 false', IdentityUtils.hasBEndJoinEver(page), false);
}

// markBEndJoinEver 写入存储 + 同步内存标志
{
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  const page = makePage({ contactId: 'chat_y' });
  IdentityUtils.markBEndJoinEver(page);
  assertEqual('mark 后 storage 命中', mockStorage['bEndJoinEver_chat_y'], true);
  assertEqual('mark 后 page.bEndSystemMessageProcessed', page.bEndSystemMessageProcessed, true);
  assertEqual('mark 后 page.globalBEndMessageAdded', page.globalBEndMessageAdded, true);
  assertEqual('mark 后 hasBEndJoinEver 返回 true', IdentityUtils.hasBEndJoinEver(page), true);
}

// 显式传入 chatId 优先于 page.data.contactId
{
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  const page = makePage({ contactId: 'chat_default' });
  IdentityUtils.markBEndJoinEver(page, 'chat_explicit');
  assertEqual('显式 chatId 命中正确 storage key', mockStorage['bEndJoinEver_chat_explicit'], true);
  assert('未影响默认 chatId', !mockStorage['bEndJoinEver_chat_default']);
}

// 没有 chatId 时,markBEndJoinEver 安全跳过
{
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  const page = makePage({});
  IdentityUtils.markBEndJoinEver(page);
  assertEqual('无 chatId 时 mark 不写 storage', Object.keys(mockStorage).length, 0);
}

// ============ P5 边缘场景补充 ============
console.log('\n--- P5 边缘场景补充 ---');

// 边缘 1: 自己根本不在 participants 里,但其他人是 creator → 推为接收方
{
  const page = makePage({
    currentUser: { openId: 'lurker' },
    participants: [
      { openId: 'someone_else', isCreator: true },
      { openId: 'another', isJoiner: true }
    ]
  });
  assertEqual('e1.自己不在 list,他人是 creator → 接收方', IdentityUtils.isReceiverEnvironment(page), true);
}

// 边缘 2: storage 中 creator 就是当前用户自己 → 不返回 true,继续走默认 false
{
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  mockStorage['creator_chat_self'] = 'user_self';
  const page = makePage({
    contactId: 'chat_self',
    currentUser: { openId: 'user_self' }
  });
  assertEqual('e2.storage creator 就是自己,不推为接收方', IdentityUtils.isReceiverEnvironment(page), false);
  delete mockStorage['creator_chat_self'];
}

// 边缘 3: wx.getStorageSync 抛异常时被吞,返回 false(默认发送方)
{
  const origGet = global.wx.getStorageSync;
  global.wx.getStorageSync = function() { throw new Error('storage broken'); };
  const page = makePage({
    contactId: 'chat_x',
    currentUser: { openId: 'me' }
  });
  // 静默 console.warn
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    assertEqual('e3.storage 抛异常时安全返回 false', IdentityUtils.isReceiverEnvironment(page), false);
  } finally {
    console.warn = origWarn;
    global.wx.getStorageSync = origGet;
  }
}

// 边缘 4: 短路优先级 - data.isSender === false 优先于 finalIsFromInvite=false
{
  const page = makePage({ isSender: false }, { finalIsFromInvite: false });
  // data.isSender=false 应短路返回 true,不会进 finalIsFromInvite 分支
  assertEqual('e4.data.isSender=false 短路优先', IdentityUtils.isReceiverEnvironment(page), true);
}

// 边缘 5: finalIsFromInvite 不是 boolean(undefined / null / string)时跳过该路径
{
  const page = makePage({}, { finalIsFromInvite: undefined });
  assertEqual('e5a.finalIsFromInvite=undefined 跳过', IdentityUtils.isReceiverEnvironment(page), false);
}
{
  const page = makePage({}, { finalIsFromInvite: null });
  assertEqual('e5b.finalIsFromInvite=null 跳过', IdentityUtils.isReceiverEnvironment(page), false);
}
{
  const page = makePage({}, { finalIsFromInvite: 'true' }); // 字符串不算 boolean
  assertEqual('e5c.finalIsFromInvite=string 跳过', IdentityUtils.isReceiverEnvironment(page), false);
}

// 边缘 6: isSender 不是 boolean 时跳过该路径
{
  const page = makePage({}, { isSender: undefined });
  assertEqual('e6.isSender=undefined 跳过', IdentityUtils.isReceiverEnvironment(page), false);
}

// 边缘 7: isMessageFromCurrentUser - getApp 抛异常时整体 try/catch 兜底返回 false
{
  const origGetApp = global.getApp;
  global.getApp = function() { throw new Error('app broken'); };
  const page = makePage({ currentUser: { openId: 'me' } });
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    // try 块内 getApp() 抛错,整个 catch 兜底 → 返回 false(即使 currentUser 可读)
    assertEqual('e7.getApp 抛错时整体兜底返回 false', IdentityUtils.isMessageFromCurrentUser(page, 'me'), false);
  } finally {
    console.warn = origWarn;
    global.getApp = origGetApp;
  }
}

// 边缘 8: isMessageFromCurrentUser - senderId 是 0 / false / undefined
{
  const page = makePage({ currentUser: { openId: 'me' } });
  assertEqual('e8a.senderId=0 → false', IdentityUtils.isMessageFromCurrentUser(page, 0), false);
  assertEqual('e8b.senderId=false → false', IdentityUtils.isMessageFromCurrentUser(page, false), false);
  assertEqual('e8c.senderId=undefined → false', IdentityUtils.isMessageFromCurrentUser(page, undefined), false);
}

// 边缘 9: hasBEndJoinEver - wx.getStorageSync 抛异常被吞
{
  const origGet = global.wx.getStorageSync;
  global.wx.getStorageSync = function() { throw new Error('storage broken'); };
  const page = makePage({ contactId: 'chat_z' });
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    assertEqual('e9.hasBEndJoinEver 异常时安全返回 false', IdentityUtils.hasBEndJoinEver(page), false);
  } finally {
    console.warn = origWarn;
    global.wx.getStorageSync = origGet;
  }
}

// 边缘 10: markBEndJoinEver - wx.setStorageSync 抛异常被吞,不冒泡
{
  const origSet = global.wx.setStorageSync;
  global.wx.setStorageSync = function() { throw new Error('storage broken'); };
  const page = makePage({ contactId: 'chat_w' });
  const origWarn = console.warn;
  console.warn = () => {};
  let threw = false;
  try {
    IdentityUtils.markBEndJoinEver(page);
  } catch (e) {
    threw = true;
  } finally {
    console.warn = origWarn;
    global.wx.setStorageSync = origSet;
  }
  assertEqual('e10.markBEndJoinEver 异常被吞', threw, false);
}

// 边缘 11: 自己在 participants 中但既不是 creator 也不是 receiver 标记,
// 且其他人也不是 creator → 走 storage 兜底,无命中则默认 false
{
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  const page = makePage({
    contactId: 'chat_clean',
    currentUser: { openId: 'me' },
    participants: [
      { openId: 'me', nickName: 'Me' },
      { openId: 'other', nickName: 'Other' } // 都没标记
    ]
  });
  assertEqual('e11.无线索时默认 false', IdentityUtils.isReceiverEnvironment(page), false);
}

// 边缘 12: data.isFromInvite=false 不应被当作"true 短路"(检查严格 === true)
{
  const page = makePage({ isFromInvite: false });
  // 应该跳过路径 1,继续后续判断 → 默认 false
  assertEqual('e12.isFromInvite=false 不短路', IdentityUtils.isReceiverEnvironment(page), false);
}

console.log(`\n--- ${pass} pass / ${fail} fail ---`);
process.exit(fail > 0 ? 1 : 0);
