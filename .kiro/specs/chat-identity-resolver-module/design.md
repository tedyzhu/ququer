# identity-resolver 模块抽离 — Design

## 总体设计

新建 `app/pages/chat/modules/identity-resolver.js`,采用**纯函数 + 副作用函数分离**的设计:

- **纯函数 `parseLoadOptions(options)`**:从 URL options 提取 7 个变量,**无副作用**,易测试。
- **副作用函数 `cleanupStaleInviteInfo(page, parsed)`**:基于解析结果决定是否调 `app.clearInviteInfo()`,有副作用。
- **入口 `prepareLoadContext(page, options)`**:组合上述两步,返回最终的解析结果对象。

## 接口设计

```js
// modules/identity-resolver.js
const ChatHelpers = require('./chat-helpers.js');

/**
 * 阶段 1:从 onLoad options 解析得到结构化 LoadContext
 *
 * @typedef {Object} LoadContext
 * @property {string} chatId          解析或生成的 chatId
 * @property {string} inviter         邀请者昵称(可能是空串)
 * @property {string} userName        用户名(URL 编码状态)
 * @property {boolean} isNewChat      是否新聊天
 * @property {boolean} forceReceiverMode  始终 false(P2 起已禁用,保留字段兼容下游)
 * @property {?Object} inviteInfo     stored invite,可能被本函数清理为 null
 * @property {Object} options         原始 options(下游各阶段可能复用)
 *
 * @param {Object} page    - Page 实例
 * @param {Object} options - onLoad 收到的 URL 参数
 * @returns {LoadContext}
 */
function prepareLoadContext(page, options) { ... }

/**
 * 纯函数:解析 options 得到基础字段(无副作用)
 * @param {Object} options
 * @returns {{ chatId, inviter, userName, isNewChat }}
 */
function parseLoadOptions(options) { ... }

/**
 * 副作用函数:基于解析结果清理过期 / 不真实的 stored invite
 * 内部会调 getApp().clearInviteInfo() 与修改 inviter
 *
 * @param {Object} page    - Page 实例
 * @param {?Object} inviteInfo - 由 app.getStoredInviteInfo() 取得
 * @param {Object} options
 * @param {string} currentInviter
 * @returns {{ inviteInfo: ?Object, inviter: string }}  返回清理后的版本
 */
function cleanupStaleInviteInfo(page, inviteInfo, options, currentInviter) { ... }

module.exports = {
  prepareLoadContext,
  parseLoadOptions,
  cleanupStaleInviteInfo,
};
```

## chat.js 改造

把行 471-525 的解析逻辑替换为:

```js
const loadCtx = IdentityResolver.prepareLoadContext(this, options);
let chatId = loadCtx.chatId;
let inviter = loadCtx.inviter;
let userName = loadCtx.userName;
let isNewChat = loadCtx.isNewChat;
let forceReceiverMode = loadCtx.forceReceiverMode;
const inviteInfo = loadCtx.inviteInfo;
```

后续阶段 2-5 的代码继续使用这些 `let` 变量(行 526 之后的代码无须改动)。

> 注意:为兼容现有代码,所有变量名保持不变。`forceReceiverMode = false` 保留是因为 chat.js 后续仍读它(虽然没真的进入 if 分支)。

## 行为映射

| chat.js 原行号 | 原行为 | 抽离后位置 |
| --- | --- | --- |
| 472 | `userInfo = app.globalData.userInfo \|\| {}` | **不抽离**,保留在 onLoad 中(后续阶段需要) |
| 474-481 | 解析 chatId/inviter/userName/isNewChat | `parseLoadOptions` |
| 488-489 | fallback chatId 生成 | `parseLoadOptions` |
| 491-492 | `inviteInfo = app.getStoredInviteInfo()` | `prepareLoadContext` 内调用 |
| 494 | `forceReceiverMode = false` | `prepareLoadContext` 内常量 |
| 497-525 | inviteInfo 时效性 / 真实性清理 | `cleanupStaleInviteInfo` |

console.log 全部保留(line-by-line 等价),保留排错信息。

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| `let` 变量替换为 `const loadCtx` 后,后续 if 分支再赋值 `inviter = ...` 失效 | 高 — 大量后续逻辑读写 inviter | 在 chat.js 中保留 `let inviter = loadCtx.inviter` 等 5 个 `let` 解构,继续允许后续修改 |
| `app.clearInviteInfo()` 调用时机变化 | 中 — 可能影响后续读取 inviteInfo | 副作用函数仍在 onLoad 同步调用栈内,时机一致 |
| `Date.now()` 在测试中 mock 复杂 | 中 — 影响 10min 过期判断 | 测试中允许传入 `now` 时间戳作为可选参数(`now = Date.now()`) |

## 测试设计

`.tools/identity_resolver_test.js`,覆盖:

### parseLoadOptions(options)

| 用例 | options | 期望 |
| --- | --- | --- |
| 完全空 | `{}` | chatId 为 fallback 格式,isNewChat=true |
| 新聊天显式 | `{isNewChat: 'true'}` | isNewChat=true |
| 新聊天 boolean | `{isNewChat: true}` | isNewChat=true |
| action=create | `{action: 'create'}` | isNewChat=true |
| 已有聊天 | `{id: 'chat_abc'}` | chatId='chat_abc',isNewChat=false |
| 带邀请者 | `{id: 'chat_x', inviter: '向冬'}` | inviter='向冬' |
| fallback contactId | `{contactId: 'chat_y'}` | chatId='chat_y' |

### cleanupStaleInviteInfo(page, inviteInfo, options, inviter)

| 用例 | inviteInfo | options | now-inviteInfo.timestamp | 期望 |
| --- | --- | --- | --- | --- |
| 过期 | 有 | `{}` | 11min | inviteInfo=null,inviter=null,clearInviteInfo 被调 |
| 不真实 | 有 | `{}` | 5min | 同上 |
| 真实有效 | 有 | `{inviter: 'X'}` | 5min | 保留 |
| 真实有效(fromInvite) | 有 | `{fromInvite: 'true'}` | 5min | 保留 |
| 无 inviteInfo | null | `{}` | - | inviteInfo=null,无副作用 |

### prepareLoadContext(page, options) — 集成

| 用例 | 验证 |
| --- | --- |
| 新聊天进入 | 返回 isNewChat=true、inviter='' |
| 邀请进入(URL 真实) | inviter 来自 options |
| 过期邀请清理 | inviter=null、inviteInfo=null |

## 命名约定

- `LoadContext` 字段名与 chat.js 中的本地变量保持一致(`chatId`/`inviter`/`userName`/`isNewChat`/`forceReceiverMode`),便于解构。
- 模块导出 3 个函数,`prepareLoadContext` 是主入口,其他两个是子单元便于测试。
