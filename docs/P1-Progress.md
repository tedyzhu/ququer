# P1 进度记录

> 目标:在不动业务逻辑的前提下,改善代码维护性与运行性能。
> 分支:`chore/p0-cleanup`(P0/P1 同分支推进,合并前会重命名)。

## 已完成

### 1. `getConversations` 云函数:N+1 → 1+1 查询

**问题**:每个会话的每个 participant 单独 `where({openId}).get()`,M*N 次往返。
**改造**:
- 提取 `extractParticipantId` / `pickInlineParticipantInfo` / `resolveParticipants` 等辅助
- 收集所有缺信息的 openId,一次性 `db.command.in([...])` 批量查询 users
- 三种 participants 形态(string / `{openId}` / `{id}`)合并查询,排序更可预测

**收益**:从 M*N 次查询降为最多 1 次会话查询 + 1 批 in 查询。

文件:`cloudfunctions/getConversations/index.js`

### 2. `debugUserDatabase` 加开发环境 guard

**问题**:此云函数包含数据库读写、清理、重建能力,生产环境仍可被前端调用。
**改造**:入口加 `process.env.DEBUG_TOOLS_ENABLED` guard,生产环境不设此变量则返回 disabled。
**前端兼容**:chat.js 现有 6 处调用收到失败响应即可优雅降级,无需改动。

部署提示:开发环境需在云开发控制台为 `debugUserDatabase` 函数手动配置环境变量 `DEBUG_TOOLS_ENABLED=true`。

文件:`cloudfunctions/debugUserDatabase/index.js`

### 3. chat.js 拆分(已抽出 5 个模块)

由于 `chat.js` 体量超过 15500 行、含 219 处 HOTFIX 注释,采用"小步抽离 + 薄壳兼容"策略:

- 抽出后保留 Page 方法名,内部委托模块,**调用方代码 0 改动**
- 每抽一组就跑一遍 `node --check` 与冒烟测试

#### 已抽出的 5 个模块

| 模块 | 文件 | 内容 |
| --- | --- | --- |
| `chat-helpers` | `modules/chat-helpers.js` | 7 常量 + 8 纯函数(占位昵称/系统消息识别/调试布尔/消息差异/智能昵称匹配等) |
| `message-debug-hook` | `modules/message-debug-hook.js` | 在 setData 上猴补的消息 Diff 调试钩子 |
| `destroyed-store` | `modules/destroyed-store.js` | 已销毁消息记录的全局存储管理 |
| `identity-utils` | `modules/identity-utils.js` | 4 个轻量身份工具(B 端环境/消息归属/B 端加入标记) |
| `test-methods` | `modules/test-methods.js` | 21 个调试/测试方法,通过 `attach(page)` 挂载 |

#### 行数变化

| 阶段 | chat.js 行数 | 累计减幅 |
| --- | --- | --- |
| 起点 | 15500 | - |
| 抽 chat-helpers | 15405 | -95 |
| 抽 message-debug-hook | 15307 | -193 |
| 抽 destroyed-store | 15278 | -222 |
| 抽 chat-helpers v2(smartNicknameMatch + registerMessageKeys) | 15218 | -282 |
| 抽 identity-utils | 15129 | -371 |
| 抽 test-methods | **13140** | **-2360 (-15.2%)** |

## 未完成(后续 session 继续)

按职责优先级,接下来要抽离的核心业务模块:

1. **`modules/identity-resolver.js`** ⚠️ 最大头
   - 入口:`onLoad` 中 1900 行身份判定逻辑
   - 涉及方法:已抽部分到 identity-utils.js;主流程仍在 onLoad 中
   - **难点**:状态分散在 `this.data` 与多个实例属性,需先抽象出 IdentityState 对象再做迁移

2. **`modules/participant-listener.js`**
   - 入口:`startParticipantListener` (584 行) / `startWatchingForNewParticipants` / `fetchChatParticipantsWithRealNames` (646 行)
   - **难点**:大量 setState 与 wx 云监听 API 耦合,先做接口设计再拆

3. **`modules/system-message.js`**
   - `addSystemMessage` / `startSystemMessageFade` / `addCreatorSystemMessage` / `addJoinSystemMessage` / `enforceSystemMessages` / `normalizeSystemMessagesAfterLoad` 等
   - **难点**:防重复机制涉及多个 this 标志位

4. **`modules/title-controller.js`**
   - `updateTitleUnified` / `updateDynamicTitle` / `updateDynamicTitleWithRealNames` / `protectReceiverTitle` / `unlockAndResetTitle` / `replacePlaceholderWithRealName` 等
   - **难点**:多个标题刷新路径互相覆盖,要先梳理优先级

5. **`modules/burn-after-read.js`**
   - `startFadingDestroy` / `clearAllDestroyTimers` / `simulateMessageRead` 等
   - **难点**:计时器与 wx 全局 store 耦合,要先抽 store(已部分完成 `destroyed-store.js`)

6. **`modules/voice-recorder.js`**(可选)
   - `_initRecorderManager` / `onVoiceTouchStart/Move/End/Cancel` / `_startRecording` / `_sendVoiceMessage` / `playVoice`
   - 语音子系统,大概 200 行,相对独立

## 抽离策略备忘

**步骤 1**: 创建 `modules/<name>.js`,只做 require + 函数搬迁,不动业务逻辑
**步骤 2**: 在 chat.js 顶部 require 新模块
**步骤 3**: 把 Page 内对应方法体替换为薄壳(`return Module.fn(this, ...);`),保留方法名
**步骤 4**: `node --check chat.js` 确认语法过 + 在小程序里冒烟一次
**步骤 5**: 提交,只标 refactor 类型,绝不混 fix/feat

### 大段抽离的"猴补 attach"模式(test-methods.js 验证可行)

当一个方法内部以 `this.foo = function() {...}` 形式挂载多个子方法(典型如 addTestMethods 的 21 个方法):

1. 把整段函数体搬到 `modules/<name>.js` 内的 `function attach(page) { ... }` 里
2. **只把外层 `this.xxx = function` 改为 `page.xxx = function`,函数体内 `this` 不动**
   - 因为函数被赋值到 page 上,运行时 `this === page`,行为零差异
3. 原方法薄壳化为 `Module.attach(this)`

这种模式适用于 voice-recorder.js 等子系统抽离。

待 5 个业务模块抽完,再做"调用方迁移"——把 `this.xxx()` 改为 `Module.xxx(this, ...)`,删掉薄壳。这一步可以拆分为多个独立 PR。
