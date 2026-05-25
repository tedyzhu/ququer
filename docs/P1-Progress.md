# P1 进度记录

> 目标:在不动业务逻辑的前提下,改善代码维护性与运行性能。
> 分支:`chore/p0-cleanup`(P0/P1 同分支推进,合并前会重命名)。

## 已完成

### 1. `getConversations` 云函数:N+1 → 1+1 查询

详见 commit `916e725`。

### 2. `debugUserDatabase` 加开发环境 guard

详见 commit `916e725`。需要在云函数环境变量中设 `DEBUG_TOOLS_ENABLED=true` 才生效,生产环境不设即返回 disabled。

### 3. chat.js 拆分(已抽出 7 个模块 + 删除 23 个死方法)

#### 已抽出的 7 个模块

| 模块 | 文件 | 内容 |
| --- | --- | --- |
| `chat-helpers` | `modules/chat-helpers.js` | 7 常量 + 8 纯函数 |
| `message-debug-hook` | `modules/message-debug-hook.js` | setData 调试钩子 |
| `destroyed-store` | `modules/destroyed-store.js` | 已销毁消息记录的全局存储 |
| `identity-utils` | `modules/identity-utils.js` | 4 个轻量身份工具 |
| `test-methods` | `modules/test-methods.js` | 21 个调试 API,attach 模式 |
| `voice-recorder` | `modules/voice-recorder.js` | 8 个语音方法 + init 模式 |
| `share-utils` | `modules/share-utils.js` | recordChatVisit + buildSharePayload |

#### 已删除的死代码方法(共 23 个,通过全项目引用扫描确认无任何调用)

调试方法:
- generateRealShareLink, simulateRealShare(share-utils 抽离时确认)
- testFixedLogic, testUnifiedLogic, testSenderListener, testBEndTitleFix, unlockAndResetTitle(本地调试用)

无用薄壳:
- parseDebugBoolean, extractMessageIdsForDebug, summarizeMessageIdDiff(已在 ChatHelpers 模块导出)
- getDestroyedStorageKey(已在 DestroyedStore 模块导出)

无生产路径调用的方法:
- ensureNavbarPosition, refreshToolbarHeightPadding, getOtherParticipantNames,
  replacePlaceholderWithRealName, addJoinSystemMessage, updateTitleUnified,
  addJoinMessageForReceiver, fallbackTitleUpdate, addInviteSystemMessage,
  simulateMessageRead, fetchRealNicknameAndUpdateTitle, startChatCreationCheck,
  updateChatTitle, testConnectionFix

(均可从 git 历史恢复)

#### 行数变化

| 阶段 | chat.js 行数 | 累计减幅 |
| --- | --- | --- |
| 起点 | 15500 | - |
| 抽 chat-helpers | 15405 | -95 |
| 抽 message-debug-hook | 15307 | -193 |
| 抽 destroyed-store | 15278 | -222 |
| chat-helpers v2(smartNicknameMatch + registerMessageKeys) | 15218 | -282 |
| 抽 identity-utils | 15129 | -371 |
| 抽 test-methods | 13140 | -2360 |
| 抽 voice-recorder + 修 TestMethods 历史 require 遗漏 | 12857 | -2643 |
| 抽 share-utils + 删 2 个调试方法 | 12716 | -2784 |
| 删 5 个死调试 + 修 test-methods 一致性 | 12516 | -2984 |
| 批量删 18 个无引用方法 | **11865** | **-3635 (-23.5%)** |
| **P2/system-message** | **10790** | **-4710 (-30.4%)** |
| **P2/title-controller** | **9926** | **-5574 (-36.0%)** |
| **P2/burn-after-read** | **9561** | **-5939 (-38.3%)** |
| **P2/participant-listener** | **7719** | **-7781 (-50.2%)** |

## 未完成

按职责优先级,接下来可继续推进的核心业务模块:

1. **`modules/identity-resolver.js`** ⚠️ 最大头
   - 入口:`onLoad` 中 1900 行身份判定逻辑
   - 涉及方法:已抽部分到 identity-utils.js;主流程仍在 onLoad 中
   - **难点**:状态分散在 `this.data` 与多个实例属性,需先抽象出 IdentityState 对象再做迁移

2. **`modules/participant-listener.js`**
   - 入口:`startParticipantListener` (584 行) / `startWatchingForNewParticipants` / `fetchChatParticipantsWithRealNames` (646 行)
   - **难点**:大量 setState 与 wx 云监听 API 耦合,先做接口设计再拆

3. ~~**`modules/system-message.js`**~~  ✅ **已完成 (P2 第一刀)**
   - 详见 `.kiro/specs/chat-system-message-module/{design,tasks}.md`
   - 抽离 11 个方法 (~1100 行) + 修复 `addCreatorSystemMessage` 双定义死代码
   - chat.js: 11922 → 10790 (-1132 行,-9.5%)

4. ~~**`modules/title-controller.js`**~~  ✅ **已完成 (P2 第二刀)**
   - 详见 `.kiro/specs/chat-title-controller-module/{design,tasks}.md`
   - 抽离 7 个方法 + 补抽 system-message 漏掉的 `replaceCreatorMessageWithJoinMessage`
   - chat.js: 10790 → 9926 (-864 行,-8.0%)
   - 突破万行大关

5. ~~**`modules/burn-after-read.js`**~~  ✅ **已完成 (P2 第三刀)**
   - 详见 `.kiro/specs/chat-burn-after-read-module/{design,tasks}.md`
   - 抽离 7 个方法(destroyMessage / permanentlyDeleteMessage / startDestroyCountdown / startFadingDestroy / clearAllDestroyTimers / markMessageAsReadAndDestroy / processOfflineMessages)
   - chat.js: 9926 → 9561 (-365 行,-3.7%)
   - 阅后即焚定时器子系统首次集中可读

## P2 第四刀

6. ~~**`modules/participant-listener.js`**~~  ✅ **已完成 (P2 第四刀)**
   - 详见 `.kiro/specs/chat-participant-listener-module/{design,tasks}.md`
   - 抽离 8 个方法(getOtherParticipantRealName / retryGetRealInviterName / startParticipantListener / startWatchingForNewParticipants / fetchChatParticipants / cleanupDuplicateParticipants / deduplicateParticipants / **fetchChatParticipantsWithRealNames** 642 行)
   - chat.js: 9561 → 7719 (-1842 行,-19.3%) — P2 单刀最大削减
   - **chat.js 累计已减 50.2%,不到原始一半**

## P2 进度

```
✅ system-message      (11 方法, 1132 行)
✅ title-controller    (7 方法, 864 行)
✅ burn-after-read     (7 方法, 365 行)
✅ participant-listener (8 方法, 1842 行)
⏳ identity-resolver  — 1 个剩余,onLoad 内 ~1900 行身份判定
```

## 抽离策略备忘

**步骤 1**: 创建 `modules/<name>.js`,只做 require + 函数搬迁,不动业务逻辑
**步骤 2**: 在 chat.js 顶部 require 新模块
**步骤 3**: 把 Page 内对应方法体替换为薄壳(`return Module.fn(this, ...);`),保留方法名
**步骤 4**: `node --check chat.js` 确认语法过 + 在小程序里冒烟一次
**步骤 5**: 提交,只标 refactor 类型,绝不混 fix/feat

### 大段抽离的"猴补 attach"模式(test-methods.js / voice-recorder.js 验证可行)

当一个方法内部以 `this.foo = function() {...}` 形式挂载多个子方法,或一组方法构成完整子系统时:

1. 把整段函数体搬到 `modules/<name>.js` 内的 `function attach(page) { ... }` 里(或直接 init/export attach API)
2. **只把外层 `this.xxx = function` 改为 `page.xxx = function`,函数体内 `this` 不动**
   - 因为函数被赋值到 page 上,运行时 `this === page`,行为零差异
3. 原方法薄壳化为 `Module.attach(this)` 或直接由 onLoad 调用

### 死代码扫描

`/.tools/scan_dead_methods.py` 是个可复用的脚本,扫描候选方法在全项目的引用情况,
帮助决定哪些可以直接删除。后续如发现更多无引用方法可继续删除。

待 5 个核心业务模块抽完,再做"调用方迁移"——把 `this.xxx()` 改为 `Module.xxx(this, ...)`,删掉薄壳。这一步可以拆分为多个独立 PR。
