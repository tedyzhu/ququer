/**
 * 验证 joinByInvite 和 cleanTempUserData 中的 sanitize 逻辑
 *
 * 因为这两个函数都用了相同的清理规则,任何一处的逻辑变化都需要保证另一处一致
 */

// 把 joinByInvite 和 cleanTempUserData 里的 sanitize 函数同步抽出来测试
const path = require('path');
const fs = require('fs');

// 通过文本匹配抽出两个云函数里的 isPlaceholderId 和 sanitize/sanitizeParticipants
function extractFn(filePath, fnName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // 匹配 function name(...)\n{ ... } 块,通过括号配对
  const startMarker = `function ${fnName}(`;
  const startIdx = content.indexOf(startMarker);
  if (startIdx < 0) throw new Error(`${fnName} not found in ${filePath}`);
  const braceStart = content.indexOf('{', startIdx);
  let depth = 0;
  let endIdx = -1;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) { endIdx = i + 1; break; }
    }
  }
  return content.substring(startIdx, endIdx);
}

const joinByInvitePath = path.resolve(__dirname, '../cloudfunctions/joinByInvite/index.js');
const cleanTempPath = path.resolve(__dirname, '../cloudfunctions/cleanTempUserData/index.js');

// 编译 joinByInvite 的 isPlaceholderId 和 sanitizeParticipants
const joinSrc = extractFn(joinByInvitePath, 'isPlaceholderId') + '\n' +
                extractFn(joinByInvitePath, 'sanitizeParticipants');
const joinFns = new Function(joinSrc + '\nreturn { isPlaceholderId, sanitizeParticipants };')();

// 编译 cleanTempUserData 的 isPlaceholderId 和 sanitize
const cleanSrc = extractFn(cleanTempPath, 'isPlaceholderId') + '\n' +
                 extractFn(cleanTempPath, 'sanitize');
const cleanFns = new Function(cleanSrc + '\nreturn { isPlaceholderId, sanitize };')();

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail || ''}`); }
}

// ===== isPlaceholderId 测试 =====
console.log('--- isPlaceholderId ---');
const placeholderCases = [
  ['null', null, true],
  ['undefined', undefined, true],
  ['空串', '', true],
  ['temp_user 字面量', 'temp_user', true],
  ['temp_xxx 前缀', 'temp_abc123', true],
  ['local_xxx 前缀', 'local_msg_001', true],
  ['短串', 'abcd', true],
  ['真实 openId', 'ojtOs7bmxy-8M5wOTcgrqlYedgyY', false],
  ['长 ID', 'cloud1-d8g0b5fni24b9cb89', false]
];

for (const fnsName of ['joinFns', 'cleanFns']) {
  const fns = fnsName === 'joinFns' ? joinFns : cleanFns;
  console.log(`\n[${fnsName}]`);
  for (const [name, input, expected] of placeholderCases) {
    const got = fns.isPlaceholderId(input);
    assert(`${fnsName}.isPlaceholderId(${name})`, got === expected, `got ${got}, expected ${expected}`);
  }
}

// ===== sanitize 测试 =====
console.log('\n--- sanitize 双实现一致性 ---');

const sanitizeCases = [
  {
    name: '空数组',
    input: [],
    expectedCleanedLen: 0,
    expectedRemoved: 0
  },
  {
    name: 'null 输入',
    input: null,
    expectedCleanedLen: 0,
    expectedRemoved: 0
  },
  {
    name: '只有真实用户',
    input: [
      { id: 'ojtOs7bmxy-realA', nickName: '向冬' },
      { id: 'ojtOs7bmxy-realB', nickName: 'B 用户' }
    ],
    expectedCleanedLen: 2,
    expectedRemoved: 0
  },
  {
    name: 'temp_user 残留',
    input: [
      { id: 'ojtOs7bmxy-realA', nickName: '向冬' },
      { id: 'temp_user', nickName: '我' }
    ],
    expectedCleanedLen: 1,
    expectedRemoved: 1
  },
  {
    name: '混合脏数据',
    input: [
      { id: 'ojtOs7bmxy-realA', nickName: '向冬' },
      { id: 'temp_user', nickName: '占位' },
      { id: 'temp_xyz', nickName: '其他占位' },
      { id: 'local_abc', nickName: '本地' },
      'short',
      null
    ],
    expectedCleanedLen: 1,
    expectedRemoved: 5
  },
  {
    name: '重复参与者',
    input: [
      { id: 'ojtOs7bmxy-A', nickName: 'A' },
      { id: 'ojtOs7bmxy-A', nickName: 'A duplicated' }
    ],
    expectedCleanedLen: 1,
    expectedRemoved: 1
  },
  {
    name: '字符串与对象混合',
    input: [
      'ojtOs7bmxy-realA',
      { id: 'ojtOs7bmxy-realB', nickName: 'B' },
      'temp_user'
    ],
    expectedCleanedLen: 2,
    expectedRemoved: 1
  }
];

for (const c of sanitizeCases) {
  // join 端
  const r1 = joinFns.sanitizeParticipants(c.input);
  assert(`join.sanitize ${c.name} cleaned len`, r1.cleaned.length === c.expectedCleanedLen, `got ${r1.cleaned.length}, expected ${c.expectedCleanedLen}`);
  assert(`join.sanitize ${c.name} removed`, r1.removed === c.expectedRemoved, `got ${r1.removed}, expected ${c.expectedRemoved}`);

  // clean 端
  const r2 = cleanFns.sanitize(c.input);
  assert(`clean.sanitize ${c.name} cleaned len`, r2.cleaned.length === c.expectedCleanedLen);
  assert(`clean.sanitize ${c.name} removed`, r2.removed === c.expectedRemoved);

  // 两端一致
  assert(`双端一致 ${c.name}`, r1.cleaned.length === r2.cleaned.length && r1.removed === r2.removed);
}

console.log(`\n--- ${pass} pass / ${fail} fail ---`);
process.exit(fail > 0 ? 1 : 0);
