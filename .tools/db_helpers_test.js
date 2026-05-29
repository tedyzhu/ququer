/**
 * db-helpers.js 行为测试
 *
 * 覆盖 4 个对外方法:
 * - updateUserInfoInDatabase: 全局 userInfo 校验 + cloud 调用
 * - updateSpecificUserInfo: 参数校验(占位昵称过滤)+ cloud 调用
 * - createConversationRecord: Promise resolve/reject 双路径
 * - syncParticipantsToDatabase: 标准调用 + 失败不冒泡
 */

const path = require('path');

// ====== 可控 wx.cloud mock ======
let cloudResponse = { success: true };
let cloudShouldFail = false;
let lastCloudCall = null;

global.wx = {
  cloud: {
    callFunction: ({ name, data, success, fail }) => {
      lastCloudCall = { name, data };
      if (cloudShouldFail) fail && fail(new Error('mock cloud fail'));
      else success && success({ result: cloudResponse });
    },
  },
};

let mockApp = { globalData: {} };
global.getApp = () => mockApp;

// ====== 加载模块 ======
const DbHelpers = require(path.join(__dirname, '../app/pages/chat/modules/db-helpers.js'));

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
  cloudResponse = { success: true };
  cloudShouldFail = false;
  lastCloudCall = null;
  mockApp = { globalData: {} };
}

function makeFakePage(overrides) {
  const page = Object.assign({
    data: { contactId: 'chat_x' },
  }, overrides || {});
  DbHelpers.attach(page);
  return page;
}

// 静默 console
const origLog = console.log;
const origError = console.error;
function silenceLogs() { console.log = () => {}; console.error = () => {}; }
function restoreLogs() { console.log = origLog; console.error = origError; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

// 异步运行所有测试,因为 createConversationRecord 返回 Promise
(async () => {
  // ============ updateUserInfoInDatabase ============
  origLog('--- updateUserInfoInDatabase ---');

  // 用例 1:无 userInfo 时跳过
  {
    reset();
    const page = makeFakePage();
    withSilence(() => page.updateUserInfoInDatabase());
    assertEqual('1.无 userInfo 时不调 cloud', lastCloudCall, null);
  }

  // 用例 2:无 openId 时跳过
  {
    reset();
    mockApp.globalData.userInfo = { nickName: 'NoId' };
    const page = makeFakePage();
    withSilence(() => page.updateUserInfoInDatabase());
    assertEqual('2.无 openId 时不调 cloud', lastCloudCall, null);
  }

  // 用例 3:标准调用 + 正确参数
  {
    reset();
    mockApp.globalData.userInfo = { openId: 'me', nickName: 'Me', avatarUrl: '/me.png' };
    const page = makeFakePage();
    withSilence(() => page.updateUserInfoInDatabase());
    assert('3.cloud 被调', !!lastCloudCall);
    assertEqual('3.cloud 名 = updateUserInfo', lastCloudCall.name, 'updateUserInfo');
    assertEqual('3.传入 openId', lastCloudCall.data.openId, 'me');
    assertEqual('3.传入 nickName', lastCloudCall.data.userInfo.nickName, 'Me');
    assertEqual('3.传入 avatarUrl', lastCloudCall.data.userInfo.avatarUrl, '/me.png');
  }

  // 用例 4:cloud fail 时不冒泡
  {
    reset();
    mockApp.globalData.userInfo = { openId: 'me', nickName: 'Me' };
    cloudShouldFail = true;
    const page = makeFakePage();
    let threw = false;
    try { withSilence(() => page.updateUserInfoInDatabase()); }
    catch (e) { threw = true; }
    assertEqual('4.fail 时不冒泡', threw, false);
  }

  // ============ updateSpecificUserInfo ============
  origLog('\n--- updateSpecificUserInfo ---');

  // 用例 5:无 openId 时跳过
  {
    reset();
    const page = makeFakePage();
    withSilence(() => page.updateSpecificUserInfo('', 'Bob'));
    assertEqual('5.无 openId 时不调 cloud', lastCloudCall, null);
  }

  // 用例 6:无 nickName 时跳过
  {
    reset();
    const page = makeFakePage();
    withSilence(() => page.updateSpecificUserInfo('user_a', ''));
    assertEqual('6.无 nickName 时不调 cloud', lastCloudCall, null);
  }

  // 用例 7:占位昵称 "用户" 时跳过
  {
    reset();
    const page = makeFakePage();
    withSilence(() => page.updateSpecificUserInfo('user_a', '用户'));
    assertEqual('7.占位昵称时不调 cloud', lastCloudCall, null);
  }

  // 用例 8:标准调用 + 正确参数
  {
    reset();
    const page = makeFakePage();
    withSilence(() => page.updateSpecificUserInfo('user_a', 'Alice'));
    assert('8.cloud 被调', !!lastCloudCall);
    assertEqual('8.cloud 名 = updateUserInfo', lastCloudCall.name, 'updateUserInfo');
    assertEqual('8.传入 openId', lastCloudCall.data.openId, 'user_a');
    assertEqual('8.传入 nickName', lastCloudCall.data.userInfo.nickName, 'Alice');
    // 默认头像
    assertEqual('8.使用默认头像', lastCloudCall.data.userInfo.avatarUrl, '/assets/images/default-avatar.png');
  }

  // 用例 9:cloud fail 时不冒泡
  {
    reset();
    cloudShouldFail = true;
    const page = makeFakePage();
    let threw = false;
    try { withSilence(() => page.updateSpecificUserInfo('user_a', 'Alice')); }
    catch (e) { threw = true; }
    assertEqual('9.fail 时不冒泡', threw, false);
  }

  // ============ createConversationRecord ============
  origLog('\n--- createConversationRecord ---');

  // 用例 10:cloud success + result.success=true → resolve
  {
    reset();
    cloudResponse = { success: true, chatId: 'chat_new' };
    const page = makeFakePage();
    const result = await withSilence(() => page.createConversationRecord('chat_new'));
    assertEqual('10.cloud 名 = createChat', lastCloudCall.name, 'createChat');
    assertEqual('10.传入 chatId', lastCloudCall.data.chatId, 'chat_new');
    assert('10.传入默认 message', lastCloudCall.data.message.includes('您创建了私密聊天'));
    assertEqual('10.resolve 的 result.success=true', result.success, true);
    assertEqual('10.resolve 的 result.chatId 透传', result.chatId, 'chat_new');
  }

  // 用例 11:cloud success + result.success=false → reject 带 result.error 文本
  {
    reset();
    cloudResponse = { success: false, error: '已存在' };
    const page = makeFakePage();
    let rejectedErr = null;
    try {
      await withSilence(() => page.createConversationRecord('chat_dup'));
    } catch (e) {
      rejectedErr = e;
    }
    assert('11.reject 触发', !!rejectedErr);
    assertEqual('11.reject 错误信息含 result.error', rejectedErr.message, '已存在');
  }

  // 用例 12:cloud success + result.success=false 且无 error → reject 带默认信息
  {
    reset();
    cloudResponse = { success: false };
    const page = makeFakePage();
    let rejectedErr = null;
    try {
      await withSilence(() => page.createConversationRecord('chat_x'));
    } catch (e) {
      rejectedErr = e;
    }
    assert('12.无 error 时 reject 默认信息', rejectedErr && rejectedErr.message.includes('创建会话记录失败'));
  }

  // 用例 13:cloud fail → reject(原 err)
  {
    reset();
    cloudShouldFail = true;
    const page = makeFakePage();
    let rejectedErr = null;
    try {
      await withSilence(() => page.createConversationRecord('chat_x'));
    } catch (e) {
      rejectedErr = e;
    }
    cloudShouldFail = false;
    assert('13.cloud fail → reject', !!rejectedErr);
    assertEqual('13.reject 携带原错误信息', rejectedErr.message, 'mock cloud fail');
  }

  // ============ syncParticipantsToDatabase ============
  origLog('\n--- syncParticipantsToDatabase ---');

  // 用例 14:标准调用 + 传入 chatId + participants
  {
    reset();
    const page = makeFakePage({ data: { contactId: 'sync_chat' } });
    const participants = [
      { openId: 'a', nickName: 'A' },
      { openId: 'b', nickName: 'B' },
    ];
    withSilence(() => page.syncParticipantsToDatabase(participants));
    assertEqual('14.cloud 名 = updateConversationParticipants', lastCloudCall.name, 'updateConversationParticipants');
    assertEqual('14.传入 chatId', lastCloudCall.data.chatId, 'sync_chat');
    assertEqual('14.传入 participants 长度', lastCloudCall.data.participants.length, 2);
  }

  // 用例 15:cloud fail 时不冒泡
  {
    reset();
    cloudShouldFail = true;
    const page = makeFakePage();
    let threw = false;
    try { withSilence(() => page.syncParticipantsToDatabase([])); }
    catch (e) { threw = true; }
    assertEqual('15.fail 时不冒泡', threw, false);
  }

  // 用例 16:空 participants 数组也能调
  {
    reset();
    const page = makeFakePage();
    withSilence(() => page.syncParticipantsToDatabase([]));
    assert('16.空数组也调 cloud', !!lastCloudCall);
    assertEqual('16.传入空数组', lastCloudCall.data.participants.length, 0);
  }

  // ============ 收尾 ============
  origLog('\n================================================================');
  origLog(`db-helpers 测试完成: ${pass} 通过, ${fail} 失败`);
  origLog('================================================================');

  if (fail > 0) process.exit(1);
})();
