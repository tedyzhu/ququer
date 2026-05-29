# P4 阶段总结

> 完成时间:2026-05-29
> 状态:✅ 主要工作完成
> 上一阶段:[P3-Summary.md](./P3-Summary.md)

## 一句话总结

P4 把焦点从"砍 chat.js 行数"转移到"加固静态测试 + CI 自动化"。
chat.js **不动一行**,测试套件从 P3 末的 217 用例 → **559 PASS**(7 个新测试 / +342 PASS),
CI 在 GitHub Actions 上 ~10-13 秒跑通全套,每次 PR 自动验证。

## 累计成果

```
chat.js:           2237 行(P3 末状态,P4 不动)
模块数:            20(不变)
P4 阶段 PR 数量:   7 个独立 PR(#22-#28)
测试数量:          7 → 11(+4 个全新测试 + 1 个加固)
PASS 总数:         217 → 559(+342)
CI 跑时:           ~10-13 秒(GitHub Actions)
业务代码改动:      仅 1 处(normalizeTimestamp 提取,纯重构无行为变化)
```

## P4 阶段 PR 清单

按时间顺序:

| PR | 标题 | 类型 | 新增 PASS | 备注 |
| --- | --- | --- | --- | --- |
| #22 | CI 接入 GitHub Actions | 基础设施 | — | 10-13s 跑全套 217 用例 |
| #23 | system-message 关键方法测试 | 测试新增 | +30 | 5 个对外方法 / B 端去重路径 |
| #24 | normalizeTimestamp 提取 + 测试 | 重构+测试 | +9 | message-fetch / message-listener 4-5 处重复抽到 chat-helpers |
| #25 | burn-after-read 测试 | 测试新增 | +36 | 5 个核心方法 / 350ms collapse 路径 |
| #26 | message-fetch 测试 | 测试新增 | +35 | 3 个对外方法 / 闸门 / B 端过滤 / 失败回退 |
| #27 | message-listener 测试 | 测试新增 | +31 | watch 链 / onChange direct-add / 兜底 / onError |
| #28 | participant-listener 测试 | 测试新增 | +34 | 5/8 核心方法 / 1904 行最大模块 |

## P4 关键工作

### 1. CI 集成(PR #22)

- `.github/workflows/ci.yml` 接入 `bash .tools/run_all_tests.sh`
- 每次 push / PR 自动跑全套静态测试
- macOS / ubuntu runner 验证通过
- 在 ~10-13s 内完成,反馈极快

### 2. 测试套件加固(PR #23 / #25 / #26 / #27 / #28)

P3 末测试主要集中在 identity-resolver(50 用例)和 chat-helpers(101 用例),其它大模块覆盖薄弱。
P4 把覆盖面拓宽到全部主要业务模块:

**P3 抽出的核心模块测试覆盖矩阵**:

| 模块 | 行数 | P4 前 | P4 后 |
| --- | --- | --- | --- |
| message-fetch | 870 | ⏸ | ✅ 35 PASS |
| message-listener | 444 | ⏸ | ✅ 31 PASS |
| participant-listener | 1904 | ⏸ | ✅ 34 PASS(5/8 方法) |
| burn-after-read | 433 | ⏸ | ✅ 36 PASS |
| system-message | 1396 | ⏸ | ✅ 30 PASS |
| identity-resolver | 856 | ✅ 50 | ✅ 187 PASS |
| identity-utils | 166 | ✅ 33 | ✅ 33 PASS |
| chat-helpers | 281 | ✅ 101 | ✅ 110 PASS |
| **小结** | — | 184 | **496 PASS**(+312) |

### 3. normalizeTimestamp 抽取(PR #24)

P3 抽 message-fetch 时记下技术债:`sendTime` 时间戳归一化逻辑(4 个分支)在 fetchMessages /
fetchMessagesAndMerge / message-listener 等 4-5 处重复。P4 抽到 `chat-helpers.normalizeTimestamp`,
9 个边界用例(string / Date / `_date` / number / 异常)全过。纯重构,业务行为零变化。

## 测试设计模式沉淀

P4 在多个测试文件中沉淀出可复用的"小程序静态测试模板":

### 模板:fakePage + attach 模式

```javascript
function makeFakePage(overrides) {
  const setDataCalls = [];
  const page = Object.assign({
    data: { /* 测试场景的初始 state */ },
    setData(patch, cb) {
      // 支持 messages[i].xxx 路径(嵌套字段)
      for (const k in patch) {
        const m = k.match(/^messages\[(\d+)\]\.(.+)$/);
        if (m) {
          const idx = parseInt(m[1], 10);
          const field = m[2];
          if (!this.data.messages[idx]) this.data.messages[idx] = {};
          this.data.messages[idx][field] = patch[k];
        } else {
          this.data[k] = patch[k];
        }
      }
      setDataCalls.push(patch);
      if (cb) cb();
    },
    /* 业务依赖的其它 page 方法 mock */
  }, overrides || {});
  Module.attach(page);
  return page;
}
```

### 模板:fake setTimeout / setInterval

```javascript
const timeoutTasks = [];
let timeoutCounter = 0;
const origSetTimeout = global.setTimeout;
global.setTimeout = function(fn, delay) {
  timeoutCounter++;
  const id = 'to_' + timeoutCounter;
  timeoutTasks.push({ id, fn, delay, cleared: false });
  return id;
};
// 按 delay 字段定位特定回调
const cb = timeoutTasks.find(t => t.delay === 1000);
withSilence(() => cb.fn());
```

支持嵌套 setTimeout:`runAllTimeouts` 用排序循环处理(参见 burn-after-read 测试)。

### 模板:可重写 wx.cloud mock

```javascript
let cloudResponse = { success: true };
let cloudShouldFail = false;
let lastCloudCall = null;
global.wx.cloud.callFunction = ({ name, data, success, fail }) => {
  lastCloudCall = { name, data };
  if (cloudShouldFail) fail && fail(new Error('mock fail'));
  else success && success({ result: cloudResponse });
};
```

每用例独立切换 success/fail/success=false 三种分支,验证不同回退路径。

### 模板:mock wx.cloud.database watch 链

```javascript
let lastWatchArgs = null;
global.wx.cloud.database = () => ({
  collection: () => ({
    where: function(arg) { return this; },
    orderBy: function() { return this; },
    limit: function() { return this; },
    watch: function(args) {
      lastWatchArgs = args;  // 捕获 onChange / onError 回调
      return { close: () => {} };
    },
  }),
});
// 启动监听后,从 lastWatchArgs 拿到 onChange,手动 invoke 模拟实时事件
```

## 主动放弃的 P4 候选

| 项 | 原因 |
| --- | --- |
| chat-debug-tools / recovery-tools 边界整理 | 评估后两者职责实际清晰:chat-debug-tools 是 console-only 调试 vs recovery-tools 是 chat.js 业务路径调用,合并反而模糊 |
| title-controller 完整覆盖 | 依赖太多 page 上下文,完整覆盖工作量大,降级 |
| onLoad 阶段 2d 抽离 | 仍需要先有真机调试通道,不在 P4 范围 |
| participant-listener 余 3 方法测试 | cleanupDuplicateParticipants(showModal 弹窗)/ startWatchingForNewParticipants(与 startParticipantListener 重叠)/ fetchChatParticipantsWithRealNames(async + 频率限制状态机)ROI 偏低 |

## P5 候选(若续)

| 候选 | 价值 |
| --- | --- |
| recovery-tools 测试 | -877 行单 PR,12 个应急方法,覆盖价值高但工作量重 |
| message-polling 测试 | 小模块,polling 时序可测,工作量轻 |
| identity-utils 边缘补充 | 已 33 PASS,加 B 端 / temp_user / fallback 决策路径 |
| voice-recorder 测试 | 录音状态机,业务上较独立 |
| 真机调试通道恢复 | 真正的双端测试一直无法做,任何动态行为只能依赖静态测试推断 |

## 当前测试套件全景

`bash .tools/run_all_tests.sh` — **11 个测试,共 559 个 PASS,~10-13 秒**:

```
1/11  integration_test.js          结构性    chat.js + 20 模块 require/attach 校验
2/11  chat_helpers_test.js         110       8 纯函数 + normalizeTimestamp
3/11  identity_utils_test.js       33        身份判定 9 条决策
4/11  sanitize_participants_test   53        joinByInvite + cleanTempUserData
5/11  login_race_test.js           10        app.ensureLogin 4 种时序
6/11  identity_resolver_test.js    187       parseLoadOptions / cleanupStaleInviteInfo
7/11  system_message_test.js       30        5 对外方法 / B 端去重(P4)
8/11  burn_after_read_test.js      36        5 核心方法(P4)
9/11  message_fetch_test.js        35        3 对外方法 / 闸门 / 过滤 / 回退(P4)
10/11 message_listener_test.js     31        watch / onChange / 兜底 / onError(P4)
11/11 participant_listener_test.js 34        5 核心方法(P4)
                                  ───
                                  559 PASS
```

## 一句话回顾

P4 不动 chat.js,把 P3 留下的"测试覆盖薄弱"问题彻底补上 — **核心模块全部有专测保障**,
**每次 PR 都有 ~10s 的 CI 兜底**。这意味着以后不论是 P5 继续抽离,还是日常 bugfix,
重构后都能用静态测试快速回归,真机调试通道缺失的痛点被大幅缓解。

---

> **后续阶段**:[P5-Summary.md](./P5-Summary.md) — P5 继续测试加固,把覆盖面扩展到 13 个有专测保障的模块,
> 测试套件从 559 → 790 PASS,新增 6 个测试 + 8 个独立 PR。
