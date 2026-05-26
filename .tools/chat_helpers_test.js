/**
 * chat-helpers.js 纯函数行为测试
 *
 * 这些函数是 P0 抽离后用作"事实标准"的纯工具,不应有副作用。
 * 测试用例覆盖:
 *  - isPlaceholderJoinMessage / isPlaceholderNickname:占位文案/昵称识别
 *  - isSystemLikeMessage / ensureSystemFlags:系统消息标记
 *  - parseDebugBoolean:多种布尔表示解析
 *  - extractMessageIdsForDebug / summarizeMessageIdDiff:差异分析
 *  - formatTime / smartNicknameMatch / registerMessageKeys
 */

const path = require('path');
const helpers = require(path.join(__dirname, '../app/pages/chat/modules/chat-helpers.js'));

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
  const ok = got === expected;
  assert(name, ok, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

function assertDeepEqual(name, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  assert(name, ok, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

// ===== isPlaceholderJoinMessage =====
console.log('--- isPlaceholderJoinMessage ---');
const placeholderJoinCases = [
  ['加入朋友的聊天', true],
  ['加入好友的聊天', true],
  ['加入用户的聊天', true],
  ['加入邀请者的聊天', true],
  ['加入发送方的聊天', true],
  ['加入a端用户的聊天', true],
  ['加入A端发送方的聊天', true],
  ['加入朋友的聊天!', true],
  ['加入朋友的聊天!', true],
  // 真实昵称不算占位
  ['加入向冬的聊天', false],
  ['加入张三的聊天', false],
  // 其他形式
  ['', false],
  [null, false],
  [undefined, false],
  ['您创建了私密聊天', false],
  ['你加入了张三的聊天', false]
];
for (const [input, expected] of placeholderJoinCases) {
  assertEqual(`isPlaceholderJoinMessage(${JSON.stringify(input)})`, helpers.isPlaceholderJoinMessage(input), expected);
}

// ===== isPlaceholderNickname =====
console.log('\n--- isPlaceholderNickname ---');
const placeholderNicknameCases = [
  ['', true],
  [null, true],
  [undefined, true],
  ['  ', true],
  ['用户', true],
  ['新用户', true],
  ['朋友', true],
  ['好友', true],
  ['邀请者', true],
  ['发送方', true],
  ['a端用户', true],
  ['A端用户', true],
  ['用户_abc123', true],
  ['用户-XYZ', true],
  ['user', true],
  ['user_001', true],
  ['User_abc', true],
  // 真实昵称
  ['向冬', false],
  ['张三', false],
  ['Y.', false],
  ['Joe', false]
];
for (const [input, expected] of placeholderNicknameCases) {
  assertEqual(`isPlaceholderNickname(${JSON.stringify(input)})`, helpers.isPlaceholderNickname(input), expected);
}

// ===== isSystemLikeMessage =====
console.log('\n--- isSystemLikeMessage ---');
const systemLikeCases = [
  [null, false],
  [undefined, false],
  [{}, false],
  [{ isSystem: true }, true],
  [{ isSystemMessage: true }, true],
  [{ fromSystem: true }, true],
  [{ type: 'system' }, true],
  [{ type: 'SYSTEM' }, true],
  [{ senderId: 'system' }, true],
  [{ senderId: 'System' }, true],
  [{ sender: 'system' }, true],
  [{ type: 'text', senderId: 'user_a' }, false]
];
for (let i = 0; i < systemLikeCases.length; i++) {
  const [input, expected] = systemLikeCases[i];
  assertEqual(`isSystemLikeMessage[${i}]`, helpers.isSystemLikeMessage(input), expected);
}

// ===== ensureSystemFlags =====
console.log('\n--- ensureSystemFlags ---');
{
  const r = helpers.ensureSystemFlags({ type: 'system' });
  assertEqual('ensureSystemFlags 标记 isSystem', r.isSystem, true);
  assertEqual('ensureSystemFlags 标记 isSystemMessage', r.isSystemMessage, true);
}
{
  const r = helpers.ensureSystemFlags({ senderId: 'system' });
  assertEqual('ensureSystemFlags senderId=system 加 type=system', r.type, 'system');
}
{
  // 普通消息不被加标记
  const r = helpers.ensureSystemFlags({ senderId: 'user_a', content: 'hi' });
  assertEqual('ensureSystemFlags 普通消息不加 isSystem', r.isSystem, undefined);
}
{
  // null 安全
  const r = helpers.ensureSystemFlags(null);
  assertEqual('ensureSystemFlags(null) 返回 null', r, null);
}

// ===== parseDebugBoolean =====
console.log('\n--- parseDebugBoolean ---');
const boolCases = [
  [true, true],
  [false, false],
  [1, true],
  [0, false],
  ['1', true],
  ['0', false],
  ['true', true],
  ['false', false],
  ['TRUE', true],
  ['FALSE', false],
  ['yes', true],
  ['no', false],
  ['on', true],
  ['off', false],
  ['  yes  ', true],
  // 兜底:其他值按 !!value 走
  [null, false],
  [undefined, false],
  ['random', true],
  [{}, true]
];
for (const [input, expected] of boolCases) {
  assertEqual(`parseDebugBoolean(${JSON.stringify(input)})`, helpers.parseDebugBoolean(input), expected);
}

// ===== extractMessageIdsForDebug =====
console.log('\n--- extractMessageIdsForDebug ---');
{
  const r = helpers.extractMessageIdsForDebug([
    { id: 'a' },
    { _id: 'b' },
    { id: 'c', _id: 'cc' }, // id 优先
    { content: 'no id' }, // 占位
    null
  ]);
  assertDeepEqual('extractMessageIdsForDebug 多种 id 形式', r, ['a', 'b', 'c', 'NO_ID#3', 'NULL_ITEM#4']);
}
{
  const r = helpers.extractMessageIdsForDebug(null);
  assertDeepEqual('extractMessageIdsForDebug(null) 返回空数组', r, []);
}

// ===== summarizeMessageIdDiff =====
console.log('\n--- summarizeMessageIdDiff ---');
{
  const r = helpers.summarizeMessageIdDiff(['a', 'b', 'c'], ['b', 'c', 'd']);
  assertDeepEqual('summarizeDiff added', r.added, ['d']);
  assertDeepEqual('summarizeDiff removed', r.removed, ['a']);
  // b 从 1->0,c 从 2->1,都移位了
  assertEqual('summarizeDiff movedCount', r.movedCount, 2);
  assertDeepEqual('summarizeDiff duplicateIds', r.duplicateIds, []);
}
{
  // 检测重复
  const r = helpers.summarizeMessageIdDiff([], ['a', 'a', 'b']);
  assertDeepEqual('summarizeDiff 重复 ID', r.duplicateIds, ['a']);
}
{
  // 空入参
  const r = helpers.summarizeMessageIdDiff(null, null);
  assertDeepEqual('summarizeDiff(null,null) added', r.added, []);
  assertDeepEqual('summarizeDiff(null,null) removed', r.removed, []);
  assertEqual('summarizeDiff(null,null) movedCount', r.movedCount, 0);
}

// ===== formatTime =====
console.log('\n--- formatTime ---');
{
  const d = new Date(2026, 4, 26, 9, 5);
  assertEqual('formatTime 个位小时分钟补 0', helpers.formatTime(d), '09:05');
}
{
  const d = new Date(2026, 4, 26, 23, 59);
  assertEqual('formatTime 双位数', helpers.formatTime(d), '23:59');
}
{
  const d = new Date(2026, 4, 26, 0, 0);
  assertEqual('formatTime 边界 00:00', helpers.formatTime(d), '00:00');
}

// ===== smartNicknameMatch =====
console.log('\n--- smartNicknameMatch ---');
const matchCases = [
  // 占位昵称一律 false
  ['用户', '用户', false],
  ['朋友', '朋友', false],
  ['我', '我', false],
  ['PLACEHOLDER_INVITER', 'PLACEHOLDER_INVITER', false],
  // 真实匹配
  ['向冬', '向冬', true],
  ['张三', '张三', true],
  // 大小写归一
  ['Joe', 'joe', true],
  // 单字符不算
  ['A', 'A', false],
  // 不同字符
  ['向冬', '张三', false],
  // 空值
  [null, '向冬', false],
  ['', '向冬', false]
];
for (const [a, b, expected] of matchCases) {
  // 由于 smartNicknameMatch 内部有 console.log,先吞掉
  const origLog = console.log;
  console.log = () => {};
  const got = helpers.smartNicknameMatch(a, b);
  console.log = origLog;
  assertEqual(`smartNicknameMatch(${JSON.stringify(a)}, ${JSON.stringify(b)})`, got, expected);
}

// ===== registerMessageKeys =====
console.log('\n--- registerMessageKeys ---');
{
  const set = new Set();
  helpers.registerMessageKeys(set, { id: 'a', _id: 'b' });
  assert('registerMessageKeys 注册 id 与 _id', set.has('a') && set.has('b'));
}
{
  const set = new Set();
  helpers.registerMessageKeys(set, 'plain_string_id');
  assert('registerMessageKeys 字符串入参', set.has('plain_string_id'));
}
{
  const set = new Set();
  helpers.registerMessageKeys(null, { id: 'a' });
  assertEqual('registerMessageKeys null collection 不抛错', set.size, 0);
}
{
  const set = new Set();
  helpers.registerMessageKeys(set, null);
  assertEqual('registerMessageKeys null message 不抛错', set.size, 0);
}

console.log(`\n--- ${pass} pass / ${fail} fail ---`);
process.exit(fail > 0 ? 1 : 0);
