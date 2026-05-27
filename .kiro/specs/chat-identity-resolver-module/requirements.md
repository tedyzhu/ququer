# identity-resolver 模块抽离 — Requirements

## 背景

这是 P3 阶段最大头工作:`onLoad` 1096 行身份判定主流程的拆分。
P2 时刻意绕开,因风险高、状态分散。

经评估,直接抽离整个 onLoad 风险极大(异步副作用、setData 时序、相互推翻的 hotfix 逻辑)。
本 spec 采用**渐进式抽离**:分多次 PR,每次只抽一段语义独立的子流程。

## 阶段划分

| 阶段 | 行数 | 内容 | 风险 |
| --- | --- | --- | --- |
| **1** | 471-525(55 行) | URL 参数解析 + 邀请信息清理 | 低 |
| 2 | 526-1010(485 行) | 身份判定核心 | 高 |
| 3 | 1011-1280(270 行) | 身份决议 + 标题/系统消息 | 中 |
| 4 | 1281-1410(130 行) | 分支动作(邀请进入 / 新聊天 / 已存在) | 中 |
| 5 | 1411-1477(67 行) | 后处理(B 端补充消息 / 阅后即焚检查) | 低 |

**本 spec 仅覆盖阶段 1**。其他阶段在后续 spec 中处理。

## 阶段 1 涉及代码

`chat.js` 行 471-525,共 55 行,包含:

1. 从 `options` 解析 7 个变量:`chatId` / `inviter` / `userName` / `isNewChat` / `forceReceiverMode`
2. fallback chatId 生成(无 id 时生成 `chat_<timestamp>_<rand>`)
3. 读取 `app.getStoredInviteInfo()` 并清理:
   - 过期(>10min)→ `clearInviteInfo()`,`inviter=null`
   - 无真实 URL 邀请参数 → `clearInviteInfo()`,`inviter=null`
   - 否则保留

## 功能需求(EARS 格式)

### 需求 1 — 业务行为零变化

**用户故事**: 作为重构维护者,我希望抽离后 onLoad 解析参数与清理邀请的行为完全一致。

#### 验收标准

1. WHEN onLoad 接收 `options = { id: 'chat_x', inviter: '向冬', isNewChat: 'false' }` THEN `chatId === 'chat_x'`、`inviter === '向冬'`、`isNewChat === false`。
2. WHEN onLoad 接收 `options = {}` THEN `chatId` 应是新生成的 `chat_<timestamp>_<rand>` 格式,`isNewChat === true`。
3. WHEN `options.isNewChat` 为 `'true'`(字符串)、`true`(布尔)、`options.action === 'create'`、或 options 中无 id 时 THEN `isNewChat === true`(任一满足即为 true)。
4. WHEN options 没有 `id` 但有 `contactId` 或 `chatId` THEN 应使用它们作为 fallback。
5. WHEN `inviteInfo` 存在但时间差 > 10 分钟 THEN `app.clearInviteInfo()` 被调用,且 `inviter = null`。
6. WHEN `inviteInfo` 存在且 < 10 分钟,但 `options.inviter` 与 `options.fromInvite` 都缺失 THEN 同样清理。
7. WHEN `inviteInfo` 存在 < 10 分钟且 `options.inviter` 或 `options.fromInvite` 至少一个有值 THEN 不清理。

### 需求 2 — 接口设计遵循模块规范

**用户故事**: 作为模块设计者,我希望 identity-resolver 接口与已抽出的 11 个模块风格一致。

#### 验收标准

1. WHEN 创建 `modules/identity-resolver.js` THEN 模块导出函数应接受 `page` / `options` 参数。
2. WHEN 函数返回结构化对象 THEN 应包含:`{ chatId, inviter, userName, isNewChat, forceReceiverMode, inviteInfo }`(以及任何阶段 2-5 后续需要的派生字段)。
3. WHEN 设计接口 THEN 必须考虑后续阶段的扩展点(后续 `resolveIdentity(page, parsed) → IdentityDecision` 会基于本阶段输出工作)。

### 需求 3 — 静态测试覆盖

**用户故事**: 作为本次拆分的回归保障,我希望阶段 1 抽离的代码有充分静态测试。

#### 验收标准

1. WHEN 抽离完成 THEN 必须新增 `.tools/identity_resolver_test.js`,覆盖至少:
   - 6 种 options 输入(新聊天 / 邀请 / 各种 isNewChat 值 / fallback chatId / 双重编码邀请者)
   - 3 种 inviteInfo 状态(过期 / 无 URL 参数 / 有效)
   - 边界:options 完全为空 / inviter 为 'undefined' 字符串
2. WHEN 测试运行 THEN 全部通过。
3. WHEN `bash .tools/run_all_tests.sh` THEN 包含新增测试,全过。

### 需求 4 — 抽离后必须验证

#### 验收标准

1. WHEN 抽离完成 THEN `node --check chat.js` + `node --check identity-resolver.js` 必须通过。
2. WHEN `bash .tools/run_all_tests.sh` THEN 6 个测试全过。
3. WHEN 提交 commit THEN 必须独立 commit,中文 message,前缀 `refactor(P3/identity-resolver-stage1)`。

## 非功能要求

- chat.js 减幅:本阶段 ~55 行下降。
- 业务行为零变化是硬约束。
- 任何疑似变化必须立即停止并向用户说明。
- 后续阶段 2-5 的接口在本阶段就要预留,避免来回返工。

## 不在本 spec 范围

- 阶段 2-5 抽离(在后续 spec 中处理)
- 删除 onLoad 内的过时 console.log(保留以便后续 hotfix 排错)
