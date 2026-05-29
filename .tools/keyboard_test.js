/**
 * keyboard.js 行为测试
 *
 * 覆盖软键盘监听 2 个对外方法:
 * - getEffectiveKeyboardHeight: 高度计算 + 窗口差值兜底 + 负值规整
 * - _registerKeyboardListener: handler 注册 + 重复注册的 off-then-on / 高度变化处理
 */

const path = require('path');

// ====== mock wx 全局 ======
let lastOnHandler = null;
let onCalls = 0;
let offCalls = 0;
let lastPageScrollTo = null;
let mockWindowInfo = { windowHeight: 700 };
let getWindowInfoExists = true;

global.wx = {
  onKeyboardHeightChange: function(fn) { lastOnHandler = fn; onCalls++; },
  offKeyboardHeightChange: function() { offCalls++; },
  pageScrollTo: function(opts) { lastPageScrollTo = opts; },
  get getWindowInfo() {
    return getWindowInfoExists ? function() { return mockWindowInfo; } : undefined;
  },
};

// ====== fake setTimeout / clearTimeout ======
const timeoutTasks = [];
let timeoutCounter = 0;
const origSetTimeout = global.setTimeout;
const origClearTimeout = global.clearTimeout;
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
function resetTimers() { timeoutTasks.length = 0; }

// ====== 加载模块 ======
const Keyboard = require(path.join(__dirname, '../app/pages/chat/modules/keyboard.js'));

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
  lastOnHandler = null;
  onCalls = 0;
  offCalls = 0;
  lastPageScrollTo = null;
  mockWindowInfo = { windowHeight: 700 };
  getWindowInfoExists = true;
  resetTimers();
}

function makeFakePage(overrides) {
  const setDataCalls = [];
  const page = Object.assign({
    data: {
      windowHeight: 700,
      containerHeight: 700,
      keyboardHeight: 0,
      keyboardVisible: false,
      inputFocus: false,
      isPageActive: true,
      isSender: true,
      scrollTop: 0,
    },
    setData(patch, cb) {
      for (const k in patch) this.data[k] = patch[k];
      setDataCalls.push(patch);
      if (cb) cb();
    },
    scheduleScrollToBottom: () => {},
    _layoutInfo: { windowHeight: 700 },
  }, overrides || {});
  page._setDataCalls = setDataCalls;
  Keyboard.attach(page);
  return page;
}

// 静默 console
const origLog = console.log;
function silenceLogs() { console.log = () => {}; }
function restoreLogs() { console.log = origLog; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

// ============ getEffectiveKeyboardHeight ============
origLog('--- getEffectiveKeyboardHeight ---');

// 用例 1:rawHeight > 0 直接返回 floor 值
{
  reset();
  const page = makeFakePage();
  // windowInfo 不变(700-700=0),所以走 raw
  const r = withSilence(() => page.getEffectiveKeyboardHeight(280.7));
  assertEqual('1.返回 floor(rawHeight)', r, 280);
}

// 用例 2:rawHeight=0 + 窗口差值推断
{
  reset();
  mockWindowInfo = { windowHeight: 400 }; // 当前窗口压缩了
  const page = makeFakePage();
  // baseWinH=700,currentWinH=400,差值 300
  const r = withSilence(() => page.getEffectiveKeyboardHeight(0));
  assertEqual('2.差值推断 kbH=300', r, 300);
}

// 用例 3:rawHeight 大于差值时取大者
{
  reset();
  mockWindowInfo = { windowHeight: 600 }; // 差值 100
  const page = makeFakePage();
  const r = withSilence(() => page.getEffectiveKeyboardHeight(280)); // raw 大于差值
  assertEqual('3.取大者', r, 280);
}

// 用例 4:差值大于 rawHeight 时取差值
{
  reset();
  mockWindowInfo = { windowHeight: 350 }; // 差值 350
  const page = makeFakePage();
  const r = withSilence(() => page.getEffectiveKeyboardHeight(100));
  assertEqual('4.差值更大时取差值', r, 350);
}

// 用例 5:rawHeight=0 + windowInfo 不可用 → 返回 0
{
  reset();
  getWindowInfoExists = false;
  const page = makeFakePage();
  const r = withSilence(() => page.getEffectiveKeyboardHeight(0));
  assertEqual('5.windowInfo 不可用时返回 0', r, 0);
}

// 用例 6:负值规整为 0
{
  reset();
  // 模拟差值为负(当前窗口反而更大)
  mockWindowInfo = { windowHeight: 800 }; // 差值 -100
  const page = makeFakePage();
  const r = withSilence(() => page.getEffectiveKeyboardHeight(0));
  // 差值 -100 < kbH=0,kbH 仍为 0;最后 < 0 处理保护
  assertEqual('6.负差值时返回 0', r, 0);
}

// 用例 7:windowInfo 抛错时被吞,返回 raw
{
  reset();
  Object.defineProperty(global.wx, 'getWindowInfo', {
    configurable: true,
    get: () => function() { throw new Error('broken'); },
  });
  const page = makeFakePage();
  const r = withSilence(() => page.getEffectiveKeyboardHeight(250));
  assertEqual('7.windowInfo 抛错时仍返回 raw', r, 250);
  // 还原
  Object.defineProperty(global.wx, 'getWindowInfo', {
    configurable: true,
    get() { return getWindowInfoExists ? function() { return mockWindowInfo; } : undefined; },
  });
}

// ============ _registerKeyboardListener ============
origLog('\n--- _registerKeyboardListener ---');

// 用例 8:wx.onKeyboardHeightChange 不存在时安全跳过
{
  reset();
  const origOn = global.wx.onKeyboardHeightChange;
  global.wx.onKeyboardHeightChange = undefined;
  const page = makeFakePage();
  let threw = false;
  try { withSilence(() => page._registerKeyboardListener()); }
  catch (e) { threw = true; }
  global.wx.onKeyboardHeightChange = origOn;
  assertEqual('8.无 API 时安全跳过', threw, false);
}

// 用例 9:首次注册创建 handler 并 on
{
  reset();
  const page = makeFakePage();
  withSilence(() => page._registerKeyboardListener());
  assert('9.handler 被创建', !!page._keyboardHeightChangeHandler);
  assertEqual('9.onKeyboardHeightChange 被调', onCalls, 1);
}

// 用例 10:重复调用都会先 off 再 on(注:首次 off 也会被调,因 handler 在判断 off 前已被赋值)
{
  reset();
  const page = makeFakePage();
  withSilence(() => page._registerKeyboardListener());
  withSilence(() => page._registerKeyboardListener());
  // 首次也会 off(handler 已赋值),所以总共 2 off + 2 on
  assertEqual('10.两次调用各 off 一次(共 2)', offCalls, 2);
  assertEqual('10.两次调用各 on 一次(共 2)', onCalls, 2);
}

// 用例 11:handler 收到 height > 0 → keyboardVisible=true / containerHeight 计算
{
  reset();
  const page = makeFakePage();
  withSilence(() => page._registerKeyboardListener());
  const handler = page._keyboardHeightChangeHandler;
  withSilence(() => handler({ height: 280 }));
  assertEqual('11.keyboardVisible=true', page.data.keyboardVisible, true);
  assertEqual('11.keyboardHeight=280', page.data.keyboardHeight, 280);
  assertEqual('11.containerHeight=windowHeight-kbH', page.data.containerHeight, 700 - 280);
  // pageScrollTo 被调
  assert('11.触发 pageScrollTo', !!lastPageScrollTo);
}

// 用例 12:handler height=0 + 非 inputFocus → keyboardHeight=0 + 注册重置 timer
{
  reset();
  const page = makeFakePage({
    data: {
      windowHeight: 700,
      containerHeight: 420, // 之前键盘是显示的
      keyboardHeight: 280,
      keyboardVisible: true,
      inputFocus: false,
      isPageActive: true,
      isSender: true,
      scrollTop: 0,
    },
  });
  withSilence(() => page._registerKeyboardListener());
  const handler = page._keyboardHeightChangeHandler;
  withSilence(() => handler({ height: 0 }));
  assertEqual('12.keyboardHeight 被清 0', page.data.keyboardHeight, 0);
  assertEqual('12.keyboardVisible=false', page.data.keyboardVisible, false);
  // 应注册 300ms 重置 timer
  assert('12.注册 300ms timer', timeoutTasks.some(t => t.delay === 300));
}

// 用例 13:handler height=0 + inputFocus 时跳过 setData
{
  reset();
  const page = makeFakePage({
    data: {
      windowHeight: 700,
      containerHeight: 420,
      keyboardHeight: 280,
      keyboardVisible: true,
      inputFocus: true, // 输入框聚焦中
      isPageActive: true,
      isSender: true,
      scrollTop: 0,
    },
  });
  withSilence(() => page._registerKeyboardListener());
  const handler = page._keyboardHeightChangeHandler;
  page._setDataCalls.length = 0;
  withSilence(() => handler({ height: 0 }));
  assertEqual('13.inputFocus 时不 setData(跳过)', page._setDataCalls.length, 0);
}

// 用例 14:handler 在 isPageActive=false 时强制清 0(不显示键盘)
{
  reset();
  const page = makeFakePage({
    data: {
      windowHeight: 700,
      containerHeight: 700,
      keyboardHeight: 0,
      keyboardVisible: false,
      inputFocus: false,
      isPageActive: false, // 页面不可见
      isSender: true,
      scrollTop: 0,
    },
  });
  withSilence(() => page._registerKeyboardListener());
  const handler = page._keyboardHeightChangeHandler;
  // 收到 height=280,但 isPageActive=false 应强制清 0
  withSilence(() => handler({ height: 280 }));
  // 因为 height 被强制清 0,走 else 分支(无变化)
  assertEqual('14.页面不活跃时 keyboardVisible 仍为 false', page.data.keyboardVisible, false);
  assertEqual('14.keyboardHeight 仍为 0', page.data.keyboardHeight, 0);
}

// 用例 15:handler 收到带 _kbResetTimer 时,显示键盘前先清掉 reset timer
{
  reset();
  const page = makeFakePage();
  withSilence(() => page._registerKeyboardListener());
  page._kbResetTimer = 'to_existing';
  const handler = page._keyboardHeightChangeHandler;
  withSilence(() => handler({ height: 280 }));
  assertEqual('15.显示键盘前 _kbResetTimer 被清空', page._kbResetTimer, null);
}

// 用例 16:300ms 后 timer 回调:若仍无键盘则修正 containerHeight
{
  reset();
  const page = makeFakePage({
    data: {
      windowHeight: 700,
      containerHeight: 420, // 还是缩小状态
      keyboardHeight: 0,
      keyboardVisible: false,
      inputFocus: false,
      isPageActive: true,
      isSender: true,
      scrollTop: 0,
    },
  });
  withSilence(() => page._registerKeyboardListener());
  const handler = page._keyboardHeightChangeHandler;
  // 触发 height=0(注册了 reset timer)
  withSilence(() => handler({ height: 0 }));
  const t = timeoutTasks.find(x => x.delay === 300);
  assert('16.300ms timer 被注册', !!t);
  // 触发 timer fn
  withSilence(() => t.fn());
  // containerHeight 应被修正为 700
  assertEqual('16.containerHeight 修正回 700', page.data.containerHeight, 700);
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`keyboard 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

// 还原全局
global.setTimeout = origSetTimeout;
global.clearTimeout = origClearTimeout;

if (fail > 0) process.exit(1);
