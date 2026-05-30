/**
 * realtime-logger.js 行为测试
 *
 * 覆盖实时日志封装的核心契约:
 * - init: 拿到 manager / 开关关闭 / API 不存在三种情况
 * - isReady: 反映开关与 manager 状态
 * - log/warn/error/setFilter: 就绪时转调 manager,未就绪时 no-op 不抛
 * - 语义化埋点 logIdentity/logJoin/logTitle 转调 info
 * - 任何情况下绝不抛错(日志失败不能影响业务)
 */

const path = require('path');

let pass = 0;
let fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail || ''}`); }
}
function assertEqual(name, got, expected) {
  assert(name, got === expected, `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

// 构造可记录调用的 fake RealtimeLogManager
function makeFakeMgr(opts) {
  const o = opts || {};
  const calls = { info: [], warn: [], error: [], setFilterMsg: [], addFilterMsg: [] };
  const mgr = {
    info: (...a) => { calls.info.push(a); if (o.throwOnInfo) throw new Error('boom'); },
    warn: (...a) => { calls.warn.push(a); },
    error: (...a) => { calls.error.push(a); },
  };
  if (!o.noFilter) {
    mgr.setFilterMsg = (m) => { calls.setFilterMsg.push(m); };
    mgr.addFilterMsg = (m) => { calls.addFilterMsg.push(m); };
  }
  return { mgr, calls };
}

function loadFresh() {
  // 清缓存,保证模块级单例状态干净
  delete require.cache[require.resolve('../app/utils/realtime-logger.js')];
  return require(path.join(__dirname, '../app/utils/realtime-logger.js'));
}

// ============ init / isReady ============
console.log('--- init / isReady ---');

// 1. API 存在 + enabled → 就绪
{
  const { mgr } = makeFakeMgr();
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  const ok = L.init({ enabled: true });
  assertEqual('1.API 存在+enabled → init 返回 true', ok, true);
  assertEqual('1.isReady=true', L.isReady(), true);
}

// 2. enabled=false → 不就绪
{
  const { mgr } = makeFakeMgr();
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  const ok = L.init({ enabled: false });
  assertEqual('2.enabled=false → init 返回 false', ok, false);
  assertEqual('2.isReady=false', L.isReady(), false);
}

// 3. API 不存在 → 安全降级
{
  global.wx = {}; // 无 getRealtimeLogManager
  const L = loadFresh();
  const ok = L.init({ enabled: true });
  assertEqual('3.API 不存在 → init 返回 false', ok, false);
  assertEqual('3.isReady=false', L.isReady(), false);
}

// 4. getRealtimeLogManager 抛错 → 安全降级,不冒泡
{
  global.wx = { getRealtimeLogManager: () => { throw new Error('fail'); } };
  const L = loadFresh();
  let threw = false;
  let ok = null;
  try { ok = L.init({ enabled: true }); } catch (e) { threw = true; }
  assertEqual('4.API 抛错时 init 不冒泡', threw, false);
  assertEqual('4.API 抛错 → init 返回 false', ok, false);
}

// 5. 默认 enabled(不传 options)→ 视为启用
{
  const { mgr } = makeFakeMgr();
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  const ok = L.init();
  assertEqual('5.默认 enabled → init 返回 true', ok, true);
}

// ============ log / warn / error ============
console.log('\n--- log / warn / error ---');

// 6. 就绪时 log 转调 mgr.info,tag 带方括号
{
  const { mgr, calls } = makeFakeMgr();
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  L.init({ enabled: true });
  L.log('身份判定', { a: 1 });
  assertEqual('6.log 转调 info 一次', calls.info.length, 1);
  assertEqual('6.info tag 带方括号', calls.info[0][0], '[身份判定]');
  assertEqual('6.info payload 透传', calls.info[0][1].a, 1);
}

// 7. warn / error 转调对应级别
{
  const { mgr, calls } = makeFakeMgr();
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  L.init({ enabled: true });
  L.warn('警告');
  L.error('错误');
  assertEqual('7.warn 转调一次', calls.warn.length, 1);
  assertEqual('7.error 转调一次', calls.error.length, 1);
}

// 8. 未就绪时 log 是 no-op,不抛
{
  global.wx = {};
  const L = loadFresh();
  L.init({ enabled: true }); // API 不存在,未就绪
  let threw = false;
  try { L.log('x', {}); L.warn('y'); L.error('z'); } catch (e) { threw = true; }
  assertEqual('8.未就绪时日志 no-op 不抛', threw, false);
}

// 9. payload 缺省时不抛
{
  const { mgr, calls } = makeFakeMgr();
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  L.init({ enabled: true });
  L.log('无 payload');
  assertEqual('9.无 payload 时 info 第二参为空对象', JSON.stringify(calls.info[0][1]), '{}');
}

// 10. mgr.info 抛错时被吞,不影响业务
{
  const { mgr } = makeFakeMgr({ throwOnInfo: true });
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  L.init({ enabled: true });
  let threw = false;
  try { L.log('会抛错的'); } catch (e) { threw = true; }
  assertEqual('10.mgr.info 抛错被吞', threw, false);
}

// ============ setFilter ============
console.log('\n--- setFilter ---');

// 11. 就绪 + 有 filter API → 转调
{
  const { mgr, calls } = makeFakeMgr();
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  L.init({ enabled: true });
  L.setFilter('openId', 'user_a');
  assertEqual('11.setFilterMsg 被调', calls.setFilterMsg.length, 1);
  assertEqual('11.addFilterMsg 含 key:value', calls.addFilterMsg[0], 'openId:user_a');
}

// 12. mgr 无 filter API 时不抛
{
  const { mgr } = makeFakeMgr({ noFilter: true });
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  L.init({ enabled: true });
  let threw = false;
  try { L.setFilter('k', 'v'); } catch (e) { threw = true; }
  assertEqual('12.无 filter API 时 setFilter 不抛', threw, false);
}

// ============ 语义化埋点 ============
console.log('\n--- 语义化埋点 ---');

// 13. logIdentity / logJoin / logTitle 各转调 info 并带对应 tag
{
  const { mgr, calls } = makeFakeMgr();
  global.wx = { getRealtimeLogManager: () => mgr };
  const L = loadFresh();
  L.init({ enabled: true });
  L.logIdentity({ finalIsFromInvite: true });
  L.logJoin({ chatId: 'c' });
  L.logTitle({ title: '我和X（2）' });
  assertEqual('13.三次埋点共 3 条 info', calls.info.length, 3);
  assertEqual('13.logIdentity tag', calls.info[0][0], '[身份判定]');
  assertEqual('13.logJoin tag', calls.info[1][0], '[B端加入]');
  assertEqual('13.logTitle tag', calls.info[2][0], '[标题决策]');
}

// 14. 未就绪时语义化埋点也是 no-op 不抛
{
  global.wx = {};
  const L = loadFresh();
  L.init({ enabled: true });
  let threw = false;
  try { L.logIdentity({}); L.logJoin({}); L.logTitle({}); } catch (e) { threw = true; }
  assertEqual('14.未就绪时语义埋点 no-op 不抛', threw, false);
}

console.log(`\n--- ${pass} pass / ${fail} fail ---`);
process.exit(fail > 0 ? 1 : 0);
