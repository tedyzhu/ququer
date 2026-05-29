/**
 * voice-recorder.js 关键路径行为测试
 *
 * 覆盖语音录制 / 播放子系统主要交互方法:
 * - toggleVoiceInput: 语音/键盘模式切换
 * - onVoiceTouchStart: 录音权限处理(已授权 / 已拒绝 / 未询问)
 * - _startRecording: 调 recorderManager.start
 * - onVoiceTouchMove: 上滑取消检测(状态变化才 setData)
 * - onVoiceTouchEnd / onVoiceTouchCancel: 停止录音
 * - playVoice: 播放控制(再次点击停止 / 切换 / 非语音跳过)
 * - init: 重复 init 防护 + 录音器/播放器生命周期回调
 *
 * 跳过 _sendVoiceMessage: 双异步链(cloud.uploadFile + cloud.callFunction)+ 大量 setData 副作用,ROI 偏低。
 */

const path = require('path');

// ====== mock wx 全局 ======
let lastShowToast = null;
let getSettingResult = { authSetting: {} };
let openSettingResult = { authSetting: {} };
let authorizeBehavior = 'success'; // 'success' | 'fail'

const recorderManagerStub = {
  _onStart: null,
  _onStop: null,
  _onError: null,
  onStart: function(fn) { this._onStart = fn; },
  onStop: function(fn) { this._onStop = fn; },
  onError: function(fn) { this._onError = fn; },
  start: function(args) { this._lastStartArgs = args; },
  stop: function() { this._stopCalls = (this._stopCalls || 0) + 1; },
};

const innerAudioCtxStub = {
  _onEnded: null,
  _onError: null,
  src: '',
  _stopCalls: 0,
  _playCalls: 0,
  onEnded: function(fn) { this._onEnded = fn; },
  onError: function(fn) { this._onError = fn; },
  stop: function() { this._stopCalls++; },
  play: function() { this._playCalls++; },
};

global.wx = {
  showToast: (o) => { lastShowToast = o; },
  showLoading: () => {},
  hideLoading: () => {},
  getSetting: ({ success }) => { success && success(getSettingResult); },
  openSetting: ({ success }) => { success && success(openSettingResult); },
  authorize: ({ success, fail }) => {
    if (authorizeBehavior === 'success') success && success();
    else fail && fail(new Error('denied'));
  },
  getRecorderManager: () => recorderManagerStub,
  createInnerAudioContext: () => innerAudioCtxStub,
  cloud: {
    uploadFile: () => {}, // 测 _sendVoiceMessage 时不会调到这里(本测跳过)
    callFunction: () => {},
  },
  nextTick: (fn) => fn && fn(),
};

global.getApp = () => ({ globalData: {} });

// ====== fake setInterval / clearInterval ======
const intervalTasks = [];
let intervalCounter = 0;
const origSetInterval = global.setInterval;
const origClearInterval = global.clearInterval;
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
function resetTimers() { intervalTasks.length = 0; }

// ====== 加载模块 ======
const VoiceRecorder = require(path.join(__dirname, '../app/pages/chat/modules/voice-recorder.js'));

let pass = 0;
let fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail || ''}`); }
}
function assertEqual(name, got, expected) {
  assert(name, got === expected, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

/** 创建 fakePage 并 init 模块(包含 attachMethods + recorder 绑定) */
function makeFakePage(overrides) {
  const setDataCalls = [];
  const page = Object.assign({
    data: {
      isVoiceMode: false,
      isRecording: false,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me', avatarUrl: '/me.png', nickName: 'Me' },
      contactId: 'chat_x',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
    setData(patch, cb) {
      for (const k in patch) this.data[k] = patch[k];
      setDataCalls.push(patch);
      if (cb) cb();
    },
    formatTime: () => '14:00',
    scrollToBottom() {},
    _localMessageCache: null,
  }, overrides || {});
  page._setDataCalls = setDataCalls;
  VoiceRecorder.init(page);
  return page;
}

/** 创建 fakePage 但不绑定生命周期(用于专门测 attachMethods 行为) */
function makeFakePageNoBind(overrides) {
  const page = makeFakePage(overrides);
  // 重置生命周期 hook 标志,以便部分测试可以重复 init
  return page;
}

// 静默 console
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
function silenceLogs() { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
function restoreLogs() { console.log = origLog; console.warn = origWarn; console.error = origError; }
function withSilence(fn) { silenceLogs(); try { return fn(); } finally { restoreLogs(); } }

// ============ toggleVoiceInput ============
origLog('--- toggleVoiceInput ---');

// 用例 1:从键盘模式切换到语音模式
{
  const page = makeFakePage();
  withSilence(() => page.toggleVoiceInput());
  assertEqual('1.isVoiceMode=true', page.data.isVoiceMode, true);
  assertEqual('1.inputFocus=false', page.data.inputFocus, false);
}

// 用例 2:从语音模式切换回键盘模式
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: false,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  withSilence(() => page.toggleVoiceInput());
  assertEqual('2.isVoiceMode=false', page.data.isVoiceMode, false);
  assertEqual('2.inputFocus=true', page.data.inputFocus, true);
}

// ============ onVoiceTouchStart 权限分支 ============
origLog('\n--- onVoiceTouchStart 权限 ---');

// 用例 3:已授权 → 直接调 _startRecording
{
  const page = makeFakePage();
  let startCalls = 0;
  // 替换 _startRecording 监测调用
  page._startRecording = function() { startCalls++; };
  getSettingResult = { authSetting: { 'scope.record': true } };
  withSilence(() => page.onVoiceTouchStart({ touches: [{ clientY: 100 }] }));
  assertEqual('3.已授权时调 _startRecording', startCalls, 1);
  assertEqual('3.touchStart Y 被记录', page._voiceTouchStartY, 100);
}

// 用例 4:已拒绝(false)→ 弹 openSetting,授权后再调 _startRecording
{
  const page = makeFakePage();
  let startCalls = 0;
  page._startRecording = function() { startCalls++; };
  getSettingResult = { authSetting: { 'scope.record': false } };
  openSettingResult = { authSetting: { 'scope.record': true } }; // 用户授权了
  withSilence(() => page.onVoiceTouchStart({ touches: [{ clientY: 100 }] }));
  assertEqual('4.已拒绝时通过 openSetting 重新授权调 _startRecording', startCalls, 1);
}

// 用例 5:未询问(undefined)→ 调 wx.authorize 成功后启动
{
  const page = makeFakePage();
  let startCalls = 0;
  page._startRecording = function() { startCalls++; };
  getSettingResult = { authSetting: {} };
  authorizeBehavior = 'success';
  withSilence(() => page.onVoiceTouchStart({ touches: [{ clientY: 100 }] }));
  assertEqual('5.未询问时通过 authorize 成功调 _startRecording', startCalls, 1);
}

// 用例 6:未询问 + authorize 失败 → 提示需要权限,不启动录音
{
  const page = makeFakePage();
  let startCalls = 0;
  page._startRecording = function() { startCalls++; };
  getSettingResult = { authSetting: {} };
  authorizeBehavior = 'fail';
  lastShowToast = null;
  withSilence(() => page.onVoiceTouchStart({ touches: [{ clientY: 100 }] }));
  assertEqual('6.authorize 失败不启动录音', startCalls, 0);
  assert('6.提示需要权限', lastShowToast && lastShowToast.title.includes('录音权限'));
  authorizeBehavior = 'success';
}

// ============ _startRecording ============
origLog('\n--- _startRecording ---');

// 用例 7:有 recorderManager 时调 start,参数含 60s duration
{
  const page = makeFakePage();
  recorderManagerStub._lastStartArgs = null;
  withSilence(() => page._startRecording());
  assert('7.recorderManager.start 被调', !!recorderManagerStub._lastStartArgs);
  assertEqual('7.duration=60000', recorderManagerStub._lastStartArgs.duration, 60000);
  assertEqual('7.format=mp3', recorderManagerStub._lastStartArgs.format, 'mp3');
}

// 用例 8:无 recorderManager 时安全返回
{
  const page = makeFakePage();
  page._recorderManager = null;
  let threw = false;
  try { withSilence(() => page._startRecording()); }
  catch (e) { threw = true; }
  assertEqual('8.无 recorderManager 时不抛错', threw, false);
}

// ============ onVoiceTouchMove ============
origLog('\n--- onVoiceTouchMove ---');

// 用例 9:非录音状态时跳过
{
  const page = makeFakePage({
    data: {
      isVoiceMode: false,
      isRecording: false, // 非录音
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  page._setDataCalls.length = 0;
  withSilence(() => page.onVoiceTouchMove({ touches: [{ clientY: 0 }] }));
  assertEqual('9.非录音时不 setData', page._setDataCalls.length, 0);
}

// 用例 10:录音中上滑超过 50px → cancel=true
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: true,
      recordingDuration: 5,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  page._voiceTouchStartY = 200;
  withSilence(() => page.onVoiceTouchMove({ touches: [{ clientY: 100 }] })); // 向上滑 100 > 50
  assertEqual('10.上滑触发 voiceCancelMove=true', page.data.voiceCancelMove, true);
}

// 用例 11:状态不变时跳过 setData(防止 touchmove 高频)
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: true,
      recordingDuration: 5,
      voiceCancelMove: true, // 已 cancel
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  page._voiceTouchStartY = 200;
  page._setDataCalls.length = 0;
  // 仍上滑超过 50,新算出 cancel=true,与当前一致 → 不 setData
  withSilence(() => page.onVoiceTouchMove({ touches: [{ clientY: 100 }] }));
  assertEqual('11.状态相同时不 setData', page._setDataCalls.length, 0);
}

// ============ onVoiceTouchEnd ============
origLog('\n--- onVoiceTouchEnd ---');

// 用例 12:非录音时跳过
{
  const page = makeFakePage({
    data: {
      isVoiceMode: false,
      isRecording: false,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  recorderManagerStub._stopCalls = 0;
  withSilence(() => page.onVoiceTouchEnd());
  assertEqual('12.非录音时不调 stop', recorderManagerStub._stopCalls, 0);
}

// 用例 13:录音中调 stop
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: true,
      recordingDuration: 5,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  recorderManagerStub._stopCalls = 0;
  withSilence(() => page.onVoiceTouchEnd());
  assertEqual('13.录音中调 stop', recorderManagerStub._stopCalls, 1);
}

// ============ onVoiceTouchCancel ============
origLog('\n--- onVoiceTouchCancel ---');

// 用例 14:非录音时跳过
{
  const page = makeFakePage({
    data: {
      isVoiceMode: false,
      isRecording: false,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  recorderManagerStub._stopCalls = 0;
  withSilence(() => page.onVoiceTouchCancel());
  assertEqual('14.非录音时不调 stop', recorderManagerStub._stopCalls, 0);
}

// 用例 15:录音中设 cancel=true 并调 stop
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: true,
      recordingDuration: 5,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  recorderManagerStub._stopCalls = 0;
  withSilence(() => page.onVoiceTouchCancel());
  assertEqual('15.voiceCancelMove=true', page.data.voiceCancelMove, true);
  assertEqual('15.调 stop', recorderManagerStub._stopCalls, 1);
}

// ============ playVoice ============
origLog('\n--- playVoice ---');

// 用例 16:无 msgId 跳过
{
  const page = makeFakePage();
  innerAudioCtxStub._stopCalls = 0;
  innerAudioCtxStub._playCalls = 0;
  withSilence(() => page.playVoice({ currentTarget: { dataset: {} } }));
  assertEqual('16.无 msgId 时不调 play/stop', innerAudioCtxStub._playCalls, 0);
}

// 用例 17:点击当前正在播放的语音 → stop + 清 playingVoiceId
{
  const page = makeFakePage({
    data: {
      isVoiceMode: false,
      isRecording: false,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [{ id: 'voice_1', type: 'voice', content: 'cloud://path.mp3' }],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: 'voice_1', // 当前正在播放
      scrollTop: 0,
      inputFocus: false,
    },
  });
  innerAudioCtxStub._stopCalls = 0;
  withSilence(() => page.playVoice({ currentTarget: { dataset: { msgid: 'voice_1' } } }));
  assertEqual('17.再次点击调 stop', innerAudioCtxStub._stopCalls, 1);
  assertEqual('17.playingVoiceId 清空', page.data.playingVoiceId, '');
}

// 用例 18:播放新语音 → src 设置 + play
{
  const page = makeFakePage({
    data: {
      isVoiceMode: false,
      isRecording: false,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [
        { id: 'voice_1', type: 'voice', content: 'cloud://a.mp3' },
        { id: 'voice_2', type: 'voice', content: 'cloud://b.mp3' },
      ],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  innerAudioCtxStub._stopCalls = 0;
  innerAudioCtxStub._playCalls = 0;
  withSilence(() => page.playVoice({ currentTarget: { dataset: { msgid: 'voice_2' } } }));
  assertEqual('18.先 stop 旧的', innerAudioCtxStub._stopCalls, 1);
  assertEqual('18.设 src', innerAudioCtxStub.src, 'cloud://b.mp3');
  assertEqual('18.调 play', innerAudioCtxStub._playCalls, 1);
  assertEqual('18.playingVoiceId=voice_2', page.data.playingVoiceId, 'voice_2');
}

// 用例 19:消息不存在或非 voice 类型时跳过
{
  const page = makeFakePage({
    data: {
      isVoiceMode: false,
      isRecording: false,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [{ id: 'text_1', type: 'text', content: 'hello' }],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  innerAudioCtxStub._playCalls = 0;
  withSilence(() => page.playVoice({ currentTarget: { dataset: { msgid: 'text_1' } } }));
  assertEqual('19.非 voice 类型不调 play', innerAudioCtxStub._playCalls, 0);
}

// ============ init 防重复 ============
origLog('\n--- init 防重复 ---');

// 用例 20:已 init 过的 page 再次 init 不会重新挂载 _recorderManager
{
  const page = makeFakePage(); // 已 init
  const firstManager = page._recorderManager;
  const firstAudioCtx = page._innerAudioCtx;
  // 标记已绑定,init 应直接返回
  assertEqual('20.首次 init 设 _recorderHooksBound=true', page._recorderHooksBound, true);
  // 重复 init
  withSilence(() => VoiceRecorder.init(page));
  assertEqual('20.重复 init 后 _recorderManager 引用不变', page._recorderManager, firstManager);
  assertEqual('20.重复 init 后 _innerAudioCtx 引用不变', page._innerAudioCtx, firstAudioCtx);
}

// ============ recorder 生命周期回调 ============
origLog('\n--- recorder 生命周期 ---');

// 用例 21:onStart 回调设 isRecording=true 并启动 1s 计时器
{
  resetTimers();
  const page = makeFakePage();
  withSilence(() => recorderManagerStub._onStart && recorderManagerStub._onStart());
  assertEqual('21.isRecording=true', page.data.isRecording, true);
  assertEqual('21.recordingDuration=0', page.data.recordingDuration, 0);
  assert('21.启动 setInterval 1000ms', intervalTasks.some(t => t.delay === 1000));
}

// 用例 22:onStop 回调:被取消时不发消息
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: true,
      recordingDuration: 5,
      voiceCancelMove: true, // 已取消
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  let sendCalls = 0;
  page._sendVoiceMessage = function() { sendCalls++; };
  withSilence(() => recorderManagerStub._onStop && recorderManagerStub._onStop({ duration: 3000, tempFilePath: 'tmp/x.mp3' }));
  assertEqual('22.cancel 时不发消息', sendCalls, 0);
  assertEqual('22.isRecording=false', page.data.isRecording, false);
}

// 用例 23:onStop 回调:duration < 1s 提示太短
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: true,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  let sendCalls = 0;
  page._sendVoiceMessage = function() { sendCalls++; };
  lastShowToast = null;
  withSilence(() => recorderManagerStub._onStop && recorderManagerStub._onStop({ duration: 500, tempFilePath: 'tmp/x.mp3' }));
  assertEqual('23.太短不发消息', sendCalls, 0);
  assert('23.提示太短', lastShowToast && lastShowToast.title.includes('太短'));
}

// 用例 24:onStop 回调:正常 duration → 调 _sendVoiceMessage
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: true,
      recordingDuration: 3,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  let sendArgs = null;
  page._sendVoiceMessage = function(file, dur) { sendArgs = { file, dur }; };
  withSilence(() => recorderManagerStub._onStop && recorderManagerStub._onStop({ duration: 3500, tempFilePath: 'tmp/y.mp3' }));
  assert('24.调 _sendVoiceMessage', !!sendArgs);
  assertEqual('24.传入 tempFilePath', sendArgs.file, 'tmp/y.mp3');
  assertEqual('24.传入秒数(向上取整)', sendArgs.dur, 4); // ceil(3500/1000)=4
}

// 用例 25:onError 回调:重置状态 + 提示
{
  const page = makeFakePage({
    data: {
      isVoiceMode: true,
      isRecording: true,
      recordingDuration: 5,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: '',
      scrollTop: 0,
      inputFocus: false,
    },
  });
  lastShowToast = null;
  withSilence(() => recorderManagerStub._onError && recorderManagerStub._onError({ errMsg: 'fail' }));
  assertEqual('25.isRecording=false', page.data.isRecording, false);
  assertEqual('25.recordingDuration=0', page.data.recordingDuration, 0);
  assert('25.提示录音失败', lastShowToast && lastShowToast.title.includes('录音失败'));
}

// 用例 26:innerAudioCtx.onEnded 回调:清 playingVoiceId
{
  const page = makeFakePage({
    data: {
      isVoiceMode: false,
      isRecording: false,
      recordingDuration: 0,
      voiceCancelMove: false,
      messages: [],
      currentUser: { openId: 'me' },
      contactId: 'c',
      destroyTimeout: 10,
      playingVoiceId: 'voice_5', // 正在播放
      scrollTop: 0,
      inputFocus: false,
    },
  });
  withSilence(() => innerAudioCtxStub._onEnded && innerAudioCtxStub._onEnded());
  assertEqual('26.播放结束清 playingVoiceId', page.data.playingVoiceId, '');
}

// ============ 收尾 ============
origLog('\n================================================================');
origLog(`voice-recorder 测试完成: ${pass} 通过, ${fail} 失败`);
origLog('================================================================');

// 还原全局
global.setInterval = origSetInterval;
global.clearInterval = origClearInterval;

if (fail > 0) process.exit(1);
