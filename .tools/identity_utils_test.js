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

console.log(`\n--- ${pass} pass / ${fail} fail ---`);
process.exit(fail > 0 ? 1 : 0);
