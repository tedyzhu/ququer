/**
 * message-debug-hook.js 行为测试
 *
 * 覆盖 setData 调试钩子 3 个对外方法:
 * - shouldEnable: URL 参数 / storage / DEBUG_FLAGS / devtools 平台 决策
 * - install: setData 替换 / 日志输出 / 跳过路径
 * - uninstall: 还原 setData
 */

const path = require('path');

// ====== mock wx storage 与 baseInfo ======
const mockStorage = {};
let mockPlatform = 'ios'; // 默认非 devtools
global.wx = {
  getStorageSync: (k) => mockStorage[k],
  setStorageSync: (k, v) => { mockStorage[k] = v; },
  getAppBaseInfo: () => ({ platform: mockPlatform }),
};

// ====== 加载模块 ======
const Hook = require(path.join(__dirname, '../app/pages/chat/modules/message-debug-hook.js'));
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

function reset() {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  mockPlatform = 'ios';
}

function makeFakePage(overrides) {
  return Object.assign({
    data: { messages: [] },
    _messageDiffDebugEnabled: false,
    setData: function(patch, cb) {
      // 默认行为:把 patch 写到 data,触发 cb
      Object.keys(patch).forEach(k => { this.data[k] = patch[k]; });
      if (cb) cb();
    },
  }, overrides || {});
}

// 静默 console
const origLog = console.log;
const origWarn = console.warn;
function silenceLogs() { console.log = () => {}; console.warn = () => {}; }
function restoreLogs() { console.log = origLog; console.warn = origWarn; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

// ============ shouldEnable ============
origLog('--- shouldEnable ---');

// 用例 1:URL 参数 debugMsgDiff=true → true
{
  reset();
  const r = withSilence(() => Hook.shouldEnable({ debugMsgDiff: 'true' }));
  assertEqual('1.debugMsgDiff=true → true', r, true);
  // 同时写入了 storage
  assertEqual('1.写入 storage', mockStorage['chat_debug_message_diff'], true);
}

// 用例 2:URL 参数 debugMsgDiff=false → false
{
  reset();
  const r = withSilence(() => Hook.shouldEnable({ debugMsgDiff: 'false' }));
  assertEqual('2.debugMsgDiff=false → false', r, false);
}

// 用例 3:URL 参数 debugMessages 备选
{
  reset();
  const r = withSilence(() => Hook.shouldEnable({ debugMessages: '1' }));
  assertEqual('3.debugMessages=1 → true', r, true);
}

// 用例 4:URL 参数 msgDebug 备选
{
  reset();
  const r = withSilence(() => Hook.shouldEnable({ msgDebug: 'on' }));
  assertEqual('4.msgDebug=on → true', r, true);
}

// 用例 5:无 URL 参数 + storage 缓存 true → true
{
  reset();
  mockStorage['chat_debug_message_diff'] = true;
  const r = withSilence(() => Hook.shouldEnable());
  assertEqual('5.storage=true → true', r, true);
}

// 用例 6:无 URL + storage=false → false
{
  reset();
  mockStorage['chat_debug_message_diff'] = false;
  const r = withSilence(() => Hook.shouldEnable());
  assertEqual('6.storage=false → false', r, false);
}

// 用例 7:无 URL + 无 storage + DEBUG_FLAGS 默认值
{
  reset();
  // 无 storage,DEBUG_FLAGS.ENABLE_MESSAGE_DIFF_LOGS 默认值由 chat-helpers 决定
  const r = withSilence(() => Hook.shouldEnable());
  // 不强行假设 DEBUG_FLAGS 值,只断言返回是 boolean
  assert('7.返回布尔值', typeof r === 'boolean');
}

// 用例 8:无 URL + 无 storage + platform=devtools → true(若 DEBUG_FLAGS=false)
{
  reset();
  mockPlatform = 'devtools';
  const r = withSilence(() => Hook.shouldEnable());
  // DEBUG_FLAGS.ENABLE_MESSAGE_DIFF_LOGS 为 true 时 r=true,否则走 platform 判断也 = true
  assertEqual('8.devtools 平台 → true', r, true);
}

// 用例 9:URL 参数优先于 storage(URL=false 覆盖 storage=true)
{
  reset();
  mockStorage['chat_debug_message_diff'] = true;
  const r = withSilence(() => Hook.shouldEnable({ debugMsgDiff: 'false' }));
  assertEqual('9.URL 优先,覆盖 storage', r, false);
}

// 用例 10:storage 抛错时被吞,fallback 到 DEBUG_FLAGS / 平台
{
  reset();
  const origGet = global.wx.getStorageSync;
  global.wx.getStorageSync = () => { throw new Error('broken'); };
  const r = withSilence(() => Hook.shouldEnable());
  global.wx.getStorageSync = origGet;
  assert('10.storage 抛错时返回布尔不冒泡', typeof r === 'boolean');
}

// ============ install ============
origLog('\n--- install ---');

// 用例 11:install 后 setData 被替换
{
  reset();
  const page = makeFakePage();
  const origSetData = page.setData;
  withSilence(() => Hook.install(page));
  assert('11.setData 被替换', page.setData !== origSetData);
  assertEqual('11._messageSetDataHookInstalled=true', page._messageSetDataHookInstalled, true);
  assert('11._rawSetDataWithMessageDebug 保留原引用', page._rawSetDataWithMessageDebug === origSetData);
}

// 用例 12:重复 install 被忽略
{
  reset();
  const page = makeFakePage();
  const origSetData = page.setData;
  withSilence(() => Hook.install(page));
  const firstReplaced = page.setData;
  withSilence(() => Hook.install(page));
  assertEqual('12.重复 install 后 setData 引用不变', page.setData, firstReplaced);
}

// 用例 13:install 后无 messages patch → 直接调原 setData
{
  reset();
  const page = makeFakePage();
  page._messageDiffDebugEnabled = true;
  withSilence(() => Hook.install(page));
  withSilence(() => page.setData({ contactName: 'Test' }));
  // 不应抛错,数据正常更新
  assertEqual('13.无 messages patch 时正常 setData', page.data.contactName, 'Test');
}

// 用例 14:install 后 _messageDiffDebugEnabled=false → 走原路径
{
  reset();
  const page = makeFakePage();
  page._messageDiffDebugEnabled = false; // 关闭
  withSilence(() => Hook.install(page));
  withSilence(() => page.setData({ messages: [{ id: 'm1' }] }));
  // 数据被正常 set
  assertEqual('14.关闭时 messages 仍被 set', page.data.messages.length, 1);
}

// 用例 15:enabled + messages patch → BEFORE / AFTER 日志被打印
{
  reset();
  const page = makeFakePage();
  page._messageDiffDebugEnabled = true;
  withSilence(() => Hook.install(page));
  // 收集日志
  const logCalls = [];
  const origLogFn = console.log;
  console.log = (...args) => logCalls.push(args[0]);
  page.setData({ messages: [{ id: 'm1' }, { id: 'm2' }] });
  console.log = origLogFn;
  const beforeLog = logCalls.find(t => t && typeof t === 'string' && t.includes('BEFORE'));
  const afterLog = logCalls.find(t => t && typeof t === 'string' && t.includes('AFTER'));
  assert('15.BEFORE 日志被打印', !!beforeLog);
  assert('15.AFTER 日志被打印', !!afterLog);
}

// 用例 16:callback 被 wrapped 但仍被调用
{
  reset();
  const page = makeFakePage();
  page._messageDiffDebugEnabled = true;
  withSilence(() => Hook.install(page));
  let cbCalls = 0;
  withSilence(() => page.setData({ messages: [{ id: 'm1' }] }, function() { cbCalls++; }));
  assertEqual('16.callback 被调用', cbCalls, 1);
}

// 用例 17:_debugTag 在日志中透传
{
  reset();
  const page = makeFakePage();
  page._messageDiffDebugEnabled = true;
  withSilence(() => Hook.install(page));
  const logCalls = [];
  const origLogFn = console.log;
  // 收集第二个参数(对象)
  console.log = (...args) => logCalls.push(args);
  page.setData({ messages: [{ id: 'm1' }], _debugTag: 'my-test-tag' });
  console.log = origLogFn;
  const tagFound = logCalls.some(args => args[1] && args[1].tag === 'my-test-tag');
  assert('17._debugTag 透传到日志', tagFound);
}

// 用例 18:install 在没有 setData 的对象上安全跳过
{
  reset();
  const obj = { data: {} };
  let threw = false;
  try { withSilence(() => Hook.install(obj)); }
  catch (e) { threw = true; }
  assertEqual('18.无 setData 时不抛错', threw, false);
  // 不应被设置标志
  assertEqual('18._messageSetDataHookInstalled 不被设', obj._messageSetDataHookInstalled, undefined);
}

// 用例 19:install 在 page=null 时安全跳过
{
  let threw = false;
  try { withSilence(() => Hook.install(null)); }
  catch (e) { threw = true; }
  assertEqual('19.page=null 时不抛错', threw, false);
}

// ============ uninstall ============
origLog('\n--- uninstall ---');

// 用例 20:uninstall 后恢复原 setData
{
  reset();
  const page = makeFakePage();
  const origSetData = page.setData;
  withSilence(() => Hook.install(page));
  withSilence(() => Hook.uninstall(page));
  assertEqual('20.setData 还原', page.setData, origSetData);
  assertEqual('20._messageSetDataHookInstalled=false', page._messageSetDataHookInstalled, false);
  assertEqual('20._rawSetDataWithMessageDebug=null', page._rawSetDataWithMessageDebug, null);
}

// 用例 21:重复 uninstall 无副作用
{
  reset();
  const page = makeFakePage();
  withSilence(() => Hook.install(page));
  withSilence(() => Hook.uninstall(page));
  let threw = false;
  try { withSilence(() => Hook.uninstall(page)); }
  catch (e) { threw = true; }
  assertEqual('21.重复 uninstall 不抛错', threw, false);
}

// 用例 22:没安装过的 page 调 uninstall 也安全
{
  reset();
  const page = makeFakePage();
  let threw = false;
  try { withSilence(() => Hook.uninstall(page)); }
  catch (e) { threw = true; }
  assertEqual('22.未安装时 uninstall 不抛错', threw, false);
  assertEqual('22.状态字段保持 undefined', page._messageSetDataHookInstalled, undefined);
}

// 用例 23:uninstall(null) 安全
{
  let threw = false;
  try { withSilence(() => Hook.uninstall(null)); }
  catch (e) { threw = true; }
  assertEqual('23.page=null 时不抛错', threw, false);
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`message-debug-hook 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

if (fail > 0) process.exit(1);
