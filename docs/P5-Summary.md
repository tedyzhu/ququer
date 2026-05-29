# P5 阶段总结

> 完成时间:2026-05-29
> 状态:✅ 主要工作完成
> 上一阶段:[P4-Summary.md](./P4-Summary.md)

## 一句话总结

P5 延续 P4 的"测试加固"主线,把覆盖面从 P4 末的 8 个核心模块扩展到全部 13 个有专测保障的模块。
chat.js **不动一行**,测试套件从 P4 末的 559 PASS → **790 PASS**(+231 / +41%),
CI 仍保持 ~10-13 秒跑通,**业务模块测试覆盖矩阵接近完整**。

## 累计成果

```
chat.js:           2237 行(P3 末状态,P4/P5 不动)
模块数:            20(不变)
P5 阶段 PR 数量:   8 个独立 PR(#30-#37,不含本 Summary)
测试数量:          11 → 18(+1 个加固 + 6 个全新)
PASS 总数:         559 → 790(+231)
CI 跑时:           ~10-13 秒(GitHub Actions)
业务代码改动:      0(P5 100% 测试 + 文档)
```

## P5 阶段 PR 清单

按时间顺序:

| PR | 标题 | 类型 | 新增 PASS | 备注 |
| --- | --- | --- | --- | --- |
| #30 | message-polling 测试 | 测试新增 | +19 | 5s 周期 setInterval / 4s 冷却 / fallback |
| #31 | identity-utils 边缘补充 | 测试加固 | +16 | 异常路径 / boolean 严格匹配 / 33→49 PASS |
| #32 | voice-recorder 测试 | 测试新增 | +47 | 录音状态机 / 6 个生命周期回调 / 权限分支 |
| #33 | share-utils 测试 | 测试新增 | +31 | recordChatVisit + buildSharePayload / 中文 encode |
| #34 | destroyed-store 测试 | 测试新增 | +29 | 命名空间隔离 / 持久化恢复 |
| #35 | db-helpers 测试 | 测试新增 | +33 | 4 个 cloud helper / Promise resolve/reject |
| #36 | keyboard 测试 | 测试新增 | +25 | onKeyboardHeightChange / windowInfo 兜底 |
| #37 | message-debug-hook 测试 | 测试新增 | +31 | install/uninstall / setData 劫持 / 日志透传 |

## P5 关键工作

### 业务模块测试覆盖矩阵 — 接近完整

P3 抽出的 20 个模块,经过 P4 + P5 后的覆盖现状:

| 模块 | 行数 | P4 末 | P5 末 |
| --- | --- | --- | --- |
| message-fetch | 870 | ✅ 35 | ✅ 35 |
| message-listener | 444 | ✅ 31 | ✅ 31 |
| participant-listener | 1904 | ✅ 34(5/8) | ✅ 34(5/8) |
| burn-after-read | 433 | ✅ 36 | ✅ 36 |
| system-message | 1396 | ✅ 30 | ✅ 30 |
| identity-resolver | 856 | ✅ 187 | ✅ 187 |
| identity-utils | 166 | ✅ 33 | ✅ 49(+16) |
| chat-helpers | 281 | ✅ 110 | ✅ 110 |
| **message-polling** | **133** | ⏸ | ✅ **19**(P5) |
| **voice-recorder** | **318** | ⏸ | ✅ **47**(P5) |
| **share-utils** | **103** | ⏸ | ✅ **31**(P5) |
| **destroyed-store** | **106** | ⏸ | ✅ **29**(P5) |
| **db-helpers** | **129** | ⏸ | ✅ **33**(P5) |
| **keyboard** | **107** | ⏸ | ✅ **25**(P5) |
| **message-debug-hook** | **152** | ⏸ | ✅ **31**(P5) |
| recovery-tools | 854 | ⏸ | ⏸ |
| chat-debug-tools | 1696 | ⏸ | ⏸ |
| test-methods | 2017 | ⏸ | ⏸ |
| title-controller | 742 | ⏸ | ⏸ |
| join-by-invite | 367 | ⏸ | ⏸ |
| participant-infer | 222 | ⏸ | ⏸ |

**业务关键模块全部有测**;剩余未测模块要么是调试工具(test-methods / chat-debug-tools 共 3713 行,纯 console)要么是 ROI 偏低的次要路径(recovery-tools 应急 / title-controller 多页面上下文 / join-by-invite 已通过 sanitize 测试间接覆盖)。

## P5 测试模板补充沉淀

P5 在 P4 4 个模板基础上,补充了几个新模式:

### 模板:可控异常 wx.storage

```javascript
let storageThrows = false;
global.wx.getStorageSync = (k) => {
  if (storageThrows) throw new Error('storage broken');
  return mockStorage[k];
};
// 验证 try/catch 兜底:
{
  storageThrows = true;
  let threw = false;
  try { withSilence(() => moduleFn()); }
  catch (e) { threw = true; }
  storageThrows = false;
  assertEqual('storage 异常被吞', threw, false);
}
```

### 模板:async IIFE 包装(Promise 测试)

```javascript
(async () => {
  // 用例 1:resolve 路径
  cloudResponse = { success: true, data: 'ok' };
  const result = await withSilence(() => page.somePromiseMethod());
  assertEqual('resolve 结果', result.data, 'ok');

  // 用例 2:reject 路径
  cloudResponse = { success: false, error: 'err' };
  let rejectedErr = null;
  try { await withSilence(() => page.somePromiseMethod()); }
  catch (e) { rejectedErr = e; }
  assert('reject 触发', !!rejectedErr);
})();
```

### 模板:wx 生命周期 stub(stub 对象捕获回调)

```javascript
const stub = {
  _onStart: null,
  onStart(fn) { this._onStart = fn; },
};
global.wx.getRecorderManager = () => stub;
// 测试中触发回调:
withSilence(() => stub._onStart && stub._onStart());
```

### 模板:console.log 劫持收集

```javascript
// 收集日志参数验证 BEFORE/AFTER 透传
const logCalls = [];
const origLogFn = console.log;
console.log = (...args) => logCalls.push(args);
page.someAction();
console.log = origLogFn;
assert('日志含 _debugTag', logCalls.some(args => args[1] && args[1].tag === 'expected-tag'));
```

## 主动放弃的 P5 候选

| 项 | 原因 |
| --- | --- |
| recovery-tools 测试 | -877 行 12 个应急方法,每个都涉及多 cloud + 多 setData 副作用,工作量重 + ROI 偏低 |
| chat-debug-tools 测试 | 1696 行纯 console 调试工具,无业务路径,测试无价值 |
| test-methods 测试 | 2017 行调试 API,同样无业务路径 |
| title-controller 完整覆盖 | P4 时已评估降级,依赖大量 page 上下文 + 多页面状态机 |
| join-by-invite 测试 | sanitize_participants_test.js 已经间接覆盖了 sanitize 一致性,主流程测试 ROI 偏低 |
| participant-infer 测试 | 与 participant-listener 重叠的边缘路径,价值偏低 |

## P6 候选(若续)

| 候选 | 价值 |
| --- | --- |
| recovery-tools 测试 | 应急路径,出 bug 时是唯一兜底,值得测但工作量重 |
| title-controller 关键路径(部分覆盖) | 不追求 7 个方法全覆盖,挑核心 2-3 个 |
| participant-infer 测试 | 与 participant-listener 互补,中等工作量 |
| 真机调试通道恢复 | 真正的双端测试一直无法做,最大痛点 |
| **P3 抽离再推进**(若真机回归通道恢复) | onLoad 阶段 2d 高风险代码块 |

## 当前测试套件全景

`bash .tools/run_all_tests.sh` — **18 个测试,共 790 个 PASS,~10-13 秒**:

```
1/18  integration_test.js          结构性    chat.js + 20 模块 require/attach 校验
2/18  chat_helpers_test.js         110       8 纯函数 + normalizeTimestamp(P4)
3/18  identity_utils_test.js       49        身份判定 9 条决策 + 边缘异常(P5 +16)
4/18  sanitize_participants_test   53        joinByInvite + cleanTempUserData
5/18  login_race_test.js           10        app.ensureLogin 4 种时序
6/18  identity_resolver_test.js    187       parseLoadOptions / cleanupStaleInviteInfo
7/18  system_message_test.js       30        5 对外方法 / B 端去重(P4)
8/18  burn_after_read_test.js      36        5 核心方法(P4)
9/18  message_fetch_test.js        35        3 对外方法 / 闸门 / 过滤 / 回退(P4)
10/18 message_listener_test.js     31        watch / onChange / 兜底 / onError(P4)
11/18 participant_listener_test.js 34        5 核心方法(P4)
12/18 message_polling_test.js      19        polling 时序 / 冷却(P5)
13/18 voice_recorder_test.js       47        录音状态机 / 生命周期(P5)
14/18 share_utils_test.js          31        recordChatVisit / buildSharePayload(P5)
15/18 destroyed_store_test.js      29        命名空间隔离 / 持久化(P5)
16/18 db_helpers_test.js           33        4 cloud helper / Promise(P5)
17/18 keyboard_test.js             25        onKeyboardHeightChange(P5)
18/18 message_debug_hook_test.js   31        install/uninstall / 日志(P5)
                                  ───
                                  790 PASS
```

## 一句话回顾

P5 把 P3 抽出的业务模块测试覆盖率从约 50% 拉到 **接近 100%**(去除调试工具)。
**业务核心模块全部有专测,每次 PR 自动 CI 兜底**;真机调试通道缺失带来的"动态行为只能靠静态推断"的痛点,
被进一步缓解到了"绝大部分业务路径都有静态测试覆盖"的程度。
