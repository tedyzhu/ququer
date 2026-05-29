/**
 * system-message.js 关键方法行为测试
 *
 * 覆盖核心去重 / 清理 / 防重复路径,采用 fake page 模式:
 * - 通过 attach(page) 把所有方法挂到 fakePage
 * - mock setData 只写入 page.data,不真做 wx 渲染
 * - mock formatTime/scheduleScrollToBottom 等被调到的 page 方法
 *
 * 测试范围:
 * - addSystemMessage:去重路径(同内容已存在)+ B 端 ever 防护 + 添加流程
 * - removeWrongCreatorMessages:B 端清理"您创建了私密聊天"
 * - removeDuplicateBEndMessages:B 端只保留最新加入消息
 * - clearIncorrectSystemMessages:清 A 端创建消息 + 加入消息
 */

const path = require('path');

// ====== mock wx 全局 ======
global.wx = {
  setNavigationBarTitle: () => {},
  showToast: () => {},
  setStorageSync: () => {},
  getStorageSync: () => undefined,
};

global.getApp = () => ({
  globalData: {},
});

// ====== 加载模块 ======
const SystemMessage = require(path.join(__dirname, '../app/pages/chat/modules/system-message.js'));

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

/** 创建 fakePage 实例,attach 所有 system-message 方法 */
function makeFakePage(overrides) {
  const setDataCalls = [];
  const page = Object.assign({
    data: {
      messages: [],
      isFromInvite: false,
      contactId: 'chat_x',
      inputFocus: false,
      keyboardVisible: false,
      keyboardHeight: 0,
      scrollTop: 0,
    },
    setData(patch, cb) {
      // 应用 patch
      for (const k in patch) {
        this.data[k] = patch[k];
      }
      setDataCalls.push(patch);
      if (cb) cb();
    },
    formatTime: () => '14:00',
    scheduleScrollToBottom: () => {},
    hasBEndJoinEver: () => false,
    markBEndJoinEver: () => {},
    removeDuplicateBEndMessages: () => {},
    startSystemMessageFade: () => {},
    startFadingDestroy: () => {},
    startDestroyCountdown: () => {},
    permanentlyDeleteMessage: () => {},
    _localMessageCache: null,
  }, overrides || {});
  page._setDataCalls = setDataCalls;

  SystemMessage.attach(page);
  return page;
}

// 静默 console.log
const origLog = console.log;
function silenceLogs() { console.log = () => {}; }
function restoreLogs() { console.log = origLog; }

function withSilence(fn) {
  silenceLogs();
  try { return fn(); }
  finally { restoreLogs(); }
}


// ============ addSystemMessage ============
origLog('--- addSystemMessage ---');

// 用例 1:首次添加普通系统消息
{
  const page = makeFakePage();
  const id = withSilence(() => page.addSystemMessage('聊天已成功创建,可以开始交流了'));
  assert('1.返回新增消息 ID', !!id);
  assertEqual('1.messages 长度=1', page.data.messages.length, 1);
  assertEqual('1.消息内容', page.data.messages[0].content, '聊天已成功创建,可以开始交流了');
  assertEqual('1.isSystem=true', page.data.messages[0].isSystem, true);
  assertEqual('1.senderId=system', page.data.messages[0].senderId, 'system');
}

// 用例 2:同内容去重
{
  const existing = { id: 'sys_existing', isSystem: true, content: '聊天已就绪' };
  const page = makeFakePage({ data: { messages: [existing], isFromInvite: false, contactId: 'chat_x', inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0 } });
  const id = withSilence(() => page.addSystemMessage('聊天已就绪'));
  assertEqual('2.去重返回已有 ID', id, 'sys_existing');
  assertEqual('2.messages 长度仍为 1', page.data.messages.length, 1);
}

// 用例 3:B 端 ever 标记 → 跳过添加
{
  const page = makeFakePage({
    data: { messages: [], isFromInvite: true, contactId: 'chat_x', inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0 },
    hasBEndJoinEver: () => true,  // 已显示过
  });
  const id = withSilence(() => page.addSystemMessage('加入向冬的聊天'));
  assertEqual('3.B端 ever 命中返回 null', id, null);
  assertEqual('3.B端 ever 命中 messages 仍为空', page.data.messages.length, 0);
  assertEqual('3.B端 ever 命中标记已处理', page.bEndSystemMessageProcessed, true);
}

// 用例 4:B 端首次加入,会清理已有 A/B 端样式加入消息
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'old_b1', isSystem: true, content: '加入旧朋友的聊天' },
        { id: 'old_a1', isSystem: true, content: '小明加入聊天' },
        { id: 'normal', isSystem: false, content: '你好' },
      ],
      isFromInvite: true, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.addSystemMessage('加入向冬的聊天'));
  const sysMessages = page.data.messages.filter(m => m.isSystem);
  assertEqual('4.清理旧加入消息,只剩新加入', sysMessages.length, 1);
  assertEqual('4.新加入消息内容', sysMessages[0].content, '加入向冬的聊天');
  // 普通消息保留
  assert('4.保留普通消息', page.data.messages.some(m => !m.isSystem && m.content === '你好'));
}


// ============ removeWrongCreatorMessages ============
origLog('\n--- removeWrongCreatorMessages ---');

// 用例 1:B 端清理"您创建了"消息
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'wrong', isSystem: true, content: '您创建了私密聊天,可点击右上角菜单分享链接邀请朋友加入' },
        { id: 'right', isSystem: true, content: '加入向冬的聊天' },
        { id: 'normal', isSystem: false, content: '你好' },
      ],
      isFromInvite: true, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.removeWrongCreatorMessages());
  const ids = page.data.messages.map(m => m.id);
  assert('5.B端 移除"您创建了"', !ids.includes('wrong'));
  assert('5.B端 保留正确加入消息', ids.includes('right'));
  assert('5.B端 保留普通消息', ids.includes('normal'));
}

// 用例 2:A 端不动消息
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'creator', isSystem: true, content: '您创建了私密聊天' },
      ],
      isFromInvite: false, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.removeWrongCreatorMessages());
  assertEqual('6.A端不动消息', page.data.messages.length, 1);
}


// ============ removeDuplicateBEndMessages ============
origLog('\n--- removeDuplicateBEndMessages ---');

// 用例 1:B 端有 3 条加入消息,只保留最新一条
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'j1', isSystem: true, content: '加入向冬的聊天', timestamp: 1000 },
        { id: 'normal', isSystem: false, content: '消息 A', timestamp: 1500 },
        { id: 'j2', isSystem: true, content: '加入向冬的聊天', timestamp: 2000 },
        { id: 'j3', isSystem: true, content: '加入向冬的聊天', timestamp: 3000 },
      ],
      isFromInvite: true, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.removeDuplicateBEndMessages());
  const joinMessages = page.data.messages.filter(m => m.isSystem && m.content.includes('加入'));
  assertEqual('7.B端 加入消息只剩 1 条', joinMessages.length, 1);
  assertEqual('7.B端 保留最新一条', joinMessages[0].id, 'j3');
  // 普通消息保留
  assert('7.B端 保留普通消息', page.data.messages.some(m => !m.isSystem));
}

// 用例 2:B 端如果只有 1 条加入消息,不动
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'j1', isSystem: true, content: '加入向冬的聊天', timestamp: 1000 },
      ],
      isFromInvite: true, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.removeDuplicateBEndMessages());
  assertEqual('8.B端 单条加入不动', page.data.messages.length, 1);
}

// 用例 3:A 端跳过去重
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'j1', isSystem: true, content: '加入向冬的聊天', timestamp: 1000 },
        { id: 'j2', isSystem: true, content: '加入向冬的聊天', timestamp: 2000 },
      ],
      isFromInvite: false, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.removeDuplicateBEndMessages());
  assertEqual('9.A端不去重', page.data.messages.length, 2);
}

// 用例 4:B 端单条 B 样式加入 + A 端样式被识别但不触发 setData(因 joinMessages.length<=1 early return)
//   注:这是原代码已知行为 — 当 joinMessages 不足以触发去重时,即便 forEach 识别了 A 端样式,
//   也会因 early return 不写回 data。该 case 用于固化此行为(避免无意改动)。
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'a1', isSystem: true, content: '小明加入聊天', timestamp: 1000 },
        { id: 'b1', isSystem: true, content: '加入向冬的聊天', timestamp: 2000 },
      ],
      isFromInvite: true, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  page._setDataCalls.length = 0;
  withSilence(() => page.removeDuplicateBEndMessages());
  // 因为 joinMessages.length === 1(只有 b1 是"加入...的聊天"),触发 early return
  assertEqual('10.B端 单 B 样式触发 early return,不调 setData', page._setDataCalls.length, 0);
  assertEqual('10.B端 数据未变,a1+b1 都还在', page.data.messages.length, 2);
}


// ============ clearIncorrectSystemMessages ============
origLog('\n--- clearIncorrectSystemMessages ---');

// 用例 1:清"您创建了"
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'creator', isSystem: true, content: '您创建了私密聊天' },
        { id: 'normal', isSystem: false, content: '你好' },
      ],
      isFromInvite: true, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.clearIncorrectSystemMessages());
  const ids = page.data.messages.map(m => m.id);
  assert('11.清 您创建了 消息', !ids.includes('creator'));
  assert('11.保留普通消息', ids.includes('normal'));
}

// 用例 2:也清"加入...的聊天"(等待重新添加)
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'old_join', isSystem: true, content: '加入旧朋友的聊天' },
      ],
      isFromInvite: true, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.clearIncorrectSystemMessages());
  assertEqual('12.清旧加入消息', page.data.messages.length, 0);
}

// 用例 3:无错误消息时不调 setData
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'normal', isSystem: false, content: '你好' },
      ],
      isFromInvite: false, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  // 重置 setData 计数(模块 attach 时可能调过 setData)
  page._setDataCalls.length = 0;
  withSilence(() => page.clearIncorrectSystemMessages());
  assertEqual('13.无错误消息时不调 setData', page._setDataCalls.length, 0);
}


// ============ addCreatorSystemMessage ============
origLog('\n--- addCreatorSystemMessage ---');

// 用例 1:首次添加创建者消息
{
  const page = makeFakePage({
    data: {
      messages: [],
      isFromInvite: false, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.addCreatorSystemMessage());
  const creatorMsg = page.data.messages.find(m => m.content && m.content.includes('您创建了私密聊天'));
  assert('14.首次添加创建者消息', !!creatorMsg);
}

// 用例 2:已存在创建者消息 → 不重复添加
{
  const page = makeFakePage({
    data: {
      messages: [
        { id: 'existing', isSystem: true, content: '您创建了私密聊天,可点击右上角菜单分享链接邀请朋友加入' },
      ],
      isFromInvite: false, contactId: 'chat_x',
      inputFocus: false, keyboardVisible: false, keyboardHeight: 0, scrollTop: 0,
    },
  });
  withSilence(() => page.addCreatorSystemMessage());
  const creatorMessages = page.data.messages.filter(m => m.isSystem && m.content && m.content.includes('您创建了私密聊天'));
  assertEqual('15.已存在创建者消息时不重复添加', creatorMessages.length, 1);
}


origLog(`\n--- ${pass} pass / ${fail} fail ---`);
process.exit(fail > 0 ? 1 : 0);
