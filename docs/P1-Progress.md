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
拆为 4 个子阶段渐进抽离。已完成 3 个子阶段:

- **2a**: `detectInvitePresence(options)` — URL 参数预检测,纯函数,18 行
- **2b**: `collectCreatorEvidence(page, options, inviteInfo, userInfo, preliminaryInviteDetected)` — stored invite 内的 14 个证据收集,弱状态(只读),70 行
- **2c**: `computeCreatorByEvidence(evidence)` — 基于 evidence 合成 isChatCreator 决策,**纯计算**,17 行

抽离后:
- chat.js: 5682 → 5590 (-92 行)
- 新增 60 个测试用例(2a 9 + 2b 34 + 2c 17),共 109 个,全过

### 阶段 5 已完成(2026-05-28)

抽离 onLoad 末尾 4 个延迟副作用 hooks 为模块函数 `runPostLoadHooks(page)`:
- 1500ms B 端系统消息安全检查(嵌套 500ms 去重)
- 同步:重置 `needsJoinMessage` / `inviterDisplayName` / `globalBEndMessageAdded` / `bEndSystemMessageAdded` 等 4 个标志
- 500ms 清除 loading 状态(`isLoading` / `isCreatingChat` / `chatCreationStatus`)
- 2000ms 阅后即焚检查(带 60s 冷却期)

抽离后:
- chat.js: 5590 → 5537 (-53 行)
- 新增 19 个测试用例,共 128 个,全过

### 阶段 4 已完成(2026-05-28)

抽离 onLoad 中身份分支动作 132 行(行 1147-1278)为模块函数 `runIdentityBranchActions(page, ctx)`:

三大主路径:
1. B 端(finalIsFromInvite=true):调 joinChatByInvite,不走 A 端
2. A 端 + 新聊天:存创建者 → createConversationRecord → 启动监听
3. A 端 + 已有聊天:根据参与者数量分单人 / 多人两子路径

副作用范围:
- wx.setStorageSync('creator_<chatId>') 创建者信息
- joinChatByInvite / addCreatorSystemMessage / updateUserInfoInDatabase /
  createConversationRecord(Promise)/ startParticipantListener
- setData 清 loading
- needsCreatorMessage 标志位读写

抽离后:
- chat.js: 5537 → 5421 (-116 行,P3 单次最大削减)
- 新增 30 个测试用例(覆盖 B 端 / A 端三子路径 / Promise then & catch / 边界),共 158 个,全过

### 阶段 3 已完成(2026-05-28)

抽离 onLoad 中身份决议 + 标题策略 ~161 行(原行 876-1075)为两个模块函数:

**3a `resolveFinalIdentity(page, ctx)`** — 决议 finalIsFromInvite + isActualCreator
- 决策树 4 个早返回 + 完整邀请证据/创建者证据综合判断
- 副作用:读 wx.storage(creator_<chatId> / chat_visit_<chatId>_<openId> / inviteInfo);
  仅在"强接收方证据击败弱创建者证据 + URL 强证据"时清 creator 缓存
- 还原一个有趣的事实:`if (isActualCreator && finalIsFromInvite)` 是死分支(`hasValidInviteEvidence` 已 `&& !isActualCreator`)
  本次保留行为不修

**3b `setupInitialTitle(page, ctx)`** — 设置初始标题
- B 端策略:`我和<昵称>(2)` / 占位符走 `我和新用户(2)` + 500ms 后异步 fetchRealInviterNameAndUpdateTitle
- A 端策略:`userInfo.nickName` fallback 链
- 副作用:wx.setNavigationBarTitle / setData / page.isAEndUser 等标记位

抽离后:
- chat.js: 5421 → 5260 (-161 行,**P3 单次最大削减再创新高**)
- 新增 29 个测试用例(3a 8 个 / 3b 7 个,含强接收方击败弱创建者 / 占位符邀请者 / fallback 链),共 187 个,全过

### 阶段 2d 待实施

| 阶段 | 内容 | 风险 |
| --- | --- | --- |
| 2d | 云端验证(`await wx.cloud`)+ 强制 B 端副作用 | 高 |

## 二线大方法拆分

P3#1 阶段告一段落后,转向二线大方法。

### `message-listener` 已完成(2026-05-28)

抽离 `startMessageListener` (390 行) + `stopMessageListener` (14 行) 到 `modules/message-listener.js`,
采用与 voice-recorder/test-methods 一致的 attach 模式。

抽离后:
- chat.js: 5260 → 4853 (-407 行,**P3 单次最大削减新纪录**)
- 新增 `modules/message-listener.js`(424 行,含 JSDoc 与已知技术债说明)
- integration_test 更新:`startMessageListener`/`stopMessageListener` 从 REQUIRED_PAGE_METHODS 移除,
  加入第 8 个 attach 检查
- `bash run_all_tests.sh` 6 个测试全过(187 用例)

已知技术债(本次保留不修):
- 主路径(docChanges) 与备用路径(docs) 几乎是复制粘贴,后续可提取共用过滤函数

### `message-fetch` 已完成(2026-05-28)

抽离 `fetchMessagesAndMerge` (310 行) + `fetchMessages` (465 行) 到 `modules/message-fetch.js`,
attach 模式。两者构成消息拉取子系统。

抽离后:
- chat.js: 4853 → 4078 (-775 行,**P3 单次最大削减再创新高**)
- 新增 `modules/message-fetch.js`(803 行,含 JSDoc 与已知技术债说明)
- integration_test:`fetchMessages` 从 REQUIRED_PAGE_METHODS 移除,加入第 9 个 attach 检查
- `bash run_all_tests.sh` 6 个测试全过(187 用例)

已知技术债(本次保留不修):
- 两方法的 B 端系统消息过滤逻辑高度重复
- 时间戳归一化逻辑在两处都有副本,可提取 normalizeTimestamp(rawTs)

### `participant-infer` 已完成(2026-05-28)

抽离 `inferParticipantsFromMessages` (172 行) + `syncInferredParticipantsToDatabase` (28 行)
到 `modules/participant-infer.js`,attach 模式。两者构成云端 participants 缺失/不完整时的兜底逻辑。

抽离后:
- chat.js: 4081 → 3884 (-197 行)
- 新增 `modules/participant-infer.js`(222 行)
- integration_test:加入第 10 个 attach 检查

**重要边界发现**:wxml 中 `bindXxx="methodName"` 绑定的方法**不能用 attach 模式**,
因为小程序 Page 注册时会快照属性,attach 是 onLoad 时才挂,wxml 找不到。
本次抽离前曾尝试抽 `sendMessage`(wxml 通过 `bindconfirm="sendMessage"` 绑定),
集成测试立即报错。回滚后改抽 `inferParticipants` 系列(无 wxml 绑定)。

后续遇到 wxml 绑定的方法须保留薄壳或留在 chat.js。

### `join-by-invite` 已完成(2026-05-28)

抽离 `joinChatByInvite` 338 行(B 端从邀请链接进入入口)到 `modules/join-by-invite.js`,
attach 模式。该方法职责:
- 兜底用户信息(从 wx.storage / app.globalData 恢复)
- 调云函数 joinByInvite 加入聊天
- 加入成功:确认 B 端身份,设置标题(立即 + 800ms 保险),清理错误 A 端消息,
  重启消息监听,更新参与者列表,延迟拉取消息合并
- 加入失败:走 addSystemMessage 显示错误

抽离后:
- chat.js: 3884 → 3549 (-335 行,累计 -77.1%)
- 新增 `modules/join-by-invite.js`(367 行)
- integration_test 加第 11 个 attach 检查
- bash run_all_tests.sh 6 个测试全过(187 用例)

### 剩余二线大方法

| 方法 | 行数 | 风险 | 备注 |
| --- | --- | --- | --- |
| `sendMessage` | 259 | 不可抽 | wxml `bindconfirm` 绑定 |
| `showMessageError` | 48 | 低 | 与 sendMessage 紧耦合,留 chat.js |

### `recovery-tools` 已完成(2026-05-28) — P3 单 PR 最大削减纪录

附带删除死代码 `tryCreateChat`(60 行,无任何调用)。

抽离 12 个 fix/check/restart/recreate 类应急修复方法到 `modules/recovery-tools.js`,attach 模式:
- fixBEndDisplayImmediately / checkAndFixNicknames / manuallyFixConnection /
  forceFixSpecificUserNicknames / checkAndClearConnectionStatus /
  forceFixParticipantDuplicates / checkAndFixMessageSync /
  restartMessageListener / checkSendMessageFunction /
  fixMessageSending / recreateChatRecord / checkMessagePermissions

抽离后:
- chat.js: 3549 → 2672 (**-877 行,P3 单 PR 最大削减纪录**,累计 **-82.8%**)
- 新增 `modules/recovery-tools.js`(854 行)
- integration_test 加第 12 个 attach 检查
- bash run_all_tests.sh 6 个测试全过(187 用例)

注:这些方法跟 chat-debug-tools.js 边界模糊,后续可能合并:
- chat-debug-tools.js: console-only 调试工具(33 个),给开发者排错
- recovery-tools.js: chat.js 内部业务路径调用的应急修复

### 后续小型抽离(PR #15-17,2026-05-28)

为接近边际收益,做了 3 个小幅度模块化:

- **PR #15** `message-polling`:轮询备用方案 110 行 → `modules/message-polling.js`,
  chat.js 2672 → 2565
- **PR #16** `system-message-cleanup`:`removeWrongCreatorMessages` + `removeDuplicateBEndMessages`
  80 行合并到现有 `modules/system-message.js`,chat.js 2565 → 2485
- **PR #17** `db-helpers`:4 个云数据库写入辅助 100 行 → `modules/db-helpers.js`,
  chat.js 2485 → 2385

### P3 当前总览(2026-05-28)

```
chat.js:    15500 → 2385  (-84.6%)
模块数:     12 → 18 (+identity-resolver / message-listener / message-fetch /
                       participant-infer / join-by-invite / recovery-tools /
                       message-polling / db-helpers)
测试用例:   ~200 → ~187 (集成测试 + 静态测试)
```

剩余 chat.js 主要由 wxml 绑定方法(sendMessage/onShow/onMessageTap 等)和 onLoad 主流程(644 行)构成,
继续抽边际收益已显著降低。

P3 候选转向:
- 云函数模块化(joinByInvite 478 行 / debugUserDatabase 335 行)
- onLoad 阶段 2d(云端验证 + 副作用,~215 行,高风险)
- 模块内部技术债清理(message-fetch 主路径与备用路径重复 / 时间戳归一化提取)

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
