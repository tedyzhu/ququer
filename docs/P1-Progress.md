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
| **P2/chat-debug-tools** | **5948** | **-9552 (-61.6%)** |

## P2 已全部完成

5 个核心业务模块全部抽离合并,chat.js 累计减幅 61.6%。

```
✅ system-message      (13 方法,1310 行模块, chat.js -1132)
✅ title-controller    (8 方法,809 行模块,  chat.js -864)
✅ burn-after-read     (8 方法,433 行模块,  chat.js -365)
✅ participant-listener (9 方法,1904 行模块, chat.js -1842)
✅ chat-debug-tools     (33 方法,1696 行模块, chat.js -1771)
```

合并后,chat.js 还剩 5725 行(死代码清理后,见下),主要由以下大方法构成(待后续迭代取舍):

| 方法 | 行数 | 说明 |
| --- | --- | --- |
| `onLoad` | 1096 | 身份判定主流程(`identity-resolver` 模块的目标),P2 时因风险高有意跳过 |
| `fetchMessages` | 462 | 历史消息拉取 + B 端过滤逻辑 |
| `startMessageListener` | 390 | wx.cloud.database watch 监听器 |
| `joinChatByInvite` | 335 | 被邀请者加入流程 |
| `fetchMessagesAndMerge` | 307 | 加入后合并新增消息 |
| `sendMessage` | 259 | 发送文本/图片消息(语音独立) |
| `inferParticipantsFromMessages` | 169 | 从消息倒推参与者(兜底逻辑) |

## P3 准备工作

### 1. 文档同步(2026-05-26)

P0/P1/P2 后,readme.md 与本文件均更新到真实状态。

### 2. 死代码清理 + 扫描器升级(2026-05-26)

删除 chat.js 中 5 个真正零引用的死方法(177 行):
- `goBack` (11 行) — wxml 未绑定,外部无引用
- `handleInputChange` (5 行) — 与 `onInputChange` 重复
- `handleMessageTap` (9 行) — 与 `onMessageTap` 重复
- `fetchParticipantRealName` (24 行) — 调用已删除的 `updateTitleWithRealNickname`
- `checkChatCreationStatus` (128 行) — 创建流程旧路径

`.tools/scan_dead_methods.py` 升级为自动扫描 chat.js + 所有模块的方法,
而非固定候选列表。后续可继续运行检测新死代码。

chat.js: 5948 → 5759 (-189 行)。

### 3. 静态测试基础设施(2026-05-26)

`.tools/` 目录原本整目录 ignore,实际包含两类脚本:
- 一次性抽离脚本(`chat_*.py` / `extract_*.py`):用完即丢
- 可复用回归测试(`*_test.js`):应入仓

调整 `.gitignore` 为细粒度,把测试与扫描器入仓,共 5 个测试文件 + 1 个扫描器 + 1 个总入口:

| 测试 | 用例数 | 覆盖 |
| --- | --- | --- |
| `integration_test.js` | 结构性 | chat.js require / Page / wxml 绑定 / 模块导出 / attach |
| `chat_helpers_test.js` | 101 | 8 个纯工具函数全部行为(占位识别 / 系统消息标记 / 布尔解析 / 差异分析 / 时间格式化 / 昵称匹配 / Set 注册) |
| `identity_utils_test.js` | 33 | `isReceiverEnvironment` 9 条决策路径 + `isMessageFromCurrentUser` + ever 标记读写 |
| `sanitize_participants_test.js` | 53 | `joinByInvite` 与 `cleanTempUserData` 双 sanitize 实现一致性 |
| `login_race_test.js` | 10 | `app.ensureLogin()` 4 种登录态时序场景 |

总入口 `bash .tools/run_all_tests.sh` 一键跑全部。

### 4. 移除 `debugUserDatabase` 前端入口(2026-05-26)

云函数 `debugUserDatabase` 已加 `DEBUG_TOOLS_ENABLED` dev guard,但前端仍暴露:
- `chat.js` 上 `debugUserDatabase` 方法定义(27 行)
- `showMoreMenu` actionSheet "调试用户数据库" 菜单项

均已删除。chat.js: 5759 → 5725 (-34 行)。

`modules/test-methods.js` 里 4 个直接调云函数的引用保留(它们只在 console 调用,
且云函数 guard 已经会返回 disabled,行为安全)。

## P3#1 阶段 1 — identity-resolver 渐进式抽离

**目标**:把 onLoad 1096 行身份判定主流程拆出到 `modules/identity-resolver.js`。
**策略**:分 5 个阶段(详见 `.kiro/specs/chat-identity-resolver-module/`),每阶段独立 PR 控风险。

### 阶段 1 已完成(2026-05-27)

- 抽离 onLoad 头部 URL 参数解析 + 邀请信息清理(原行 471-525,55 行)
- 接口设计:`prepareLoadContext(page, options) → LoadContext`(纯函数 + 副作用函数分离)
- chat.js: 5725 → 5682 (-43 行)
- 新增 `.tools/identity_resolver_test.js` 50 用例(parseLoadOptions / cleanupStaleInviteInfo / prepareLoadContext 集成 3 类)
- `bash run_all_tests.sh` 6 个测试全过(共 252 用例)

### 阶段 2(部分)已完成(2026-05-28)

阶段 2 原计划 485 行身份判定核心一刀抽离,经评估**风险极高**(异步副作用、多 let 变量重写、矛盾 hotfix 历史),
拆为 4 个子阶段渐进抽离。本次完成前 2 个子阶段:

- **2a**: `detectInvitePresence(options)` — URL 参数预检测,纯函数,18 行
- **2b**: `collectCreatorEvidence(page, options, inviteInfo, userInfo, preliminaryInviteDetected)` — stored invite 内的 14 个证据收集,弱状态(只读),70 行

抽离后:
- chat.js: 5682 → 5602 (-80 行)
- 新增 43 个测试用例(2a 9 个 + 2b 34 个),共 93 个,全过

后续 2c/2d 子阶段:
- **2c**: 决策合成(`isChatCreator` 判定逻辑)— 中风险,需保留副作用
- **2d**: 云端验证 + 副作用调用 — 暂留 onLoad,等阶段 4 重新设计后再考虑

### 阶段 3-5 待实施

| 阶段 | 行数 | 内容 | 风险 |
| --- | --- | --- | --- |
| 3 | 1011-1280 | 身份决议 + 标题/系统消息 270 行 | 中 |
| 4 | 1281-1410 | 分支动作(邀请进入 / 新聊天 / 已存在)130 行 | 中 |
| 5 | 1411-1477 | 后处理(B 端补充消息 / 阅后即焚检查)67 行 | 低 |

后续阶段由独立 spec 与 PR 推进,每阶段必须先有静态测试基线再抽离。

## P3 候选(尚未启动)

按 risk/benefit 排序:

1. **`identity-resolver`(高风险高收益)**:把 `onLoad` 的 1096 行身份判定主流程拆出。需先抽象 IdentityState 对象,保证业务行为零变化。是 P2 时刻意绕开的最大头。**已有静态测试基础设施作为回归保障**(见 P3 准备工作 #3)。
2. **二线大方法继续拆**:`fetchMessages` / `startMessageListener` 等可能加入 modules 中的合适模块(如 `message-fetch.js`、`message-listener.js`)
3. **云函数模块化**:`joinByInvite` 478 行 / `debugUserDatabase` 335 行可拆 helper
4. ~~**静态测试覆盖**~~ ✅ 已完成,见 P3 准备工作 #3
5. ~~**彻底移除 `debugUserDatabase` 前端入口**~~ ✅ 已完成,见 P3 准备工作 #4

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
