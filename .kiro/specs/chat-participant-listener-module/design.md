# 设计文档: chat-participant-listener 模块抽离

## 背景与目标

P2 第三刀(`burn-after-read`)已落地,chat.js 当前 9561 行(累计减 -38.3%)。
本次 P2 第四刀目标:把"参与者监听 + 真实昵称获取 + 去重"子系统集中到 `app/pages/chat/modules/participant-listener.js`,**保持行为零变化**。

这是 P2 内最大的一刀:7 个方法 ~1166 行。

## 范围(In Scope)

抽离以下 7 个方法到新模块:

| 方法 | 行号 | 行数 | 角色 |
|---|---|---:|---|
| `getOtherParticipantRealName()` | 1909-1935 | 27 | 从参与者列表中取对方真实昵称 |
| `retryGetRealInviterName()` | 1941-1982 | 42 | 重试获取真实邀请者昵称(B 端兜底) |
| `startParticipantListener(chatId)` | 2176-2757 | 582 | **核心**:发送方实时监听参与者变化(wx 云 watch) |
| `startWatchingForNewParticipants(chatId)` | 2762-2843 | 82 | 备用监听器(发送方备用方案) |
| `fetchChatParticipants()` | 5922-6001 | 80 | 一次性获取参与者(callFunction) |
| `cleanupDuplicateParticipants()` | 6833-6911 | 79 | 弹窗:用户主动触发的清理 |
| `deduplicateParticipants()` | 7760-8033 | 274 | 自动去重(在标题/监听路径中被多处调用) |

合计 ~1166 行。

## 重要修正:`fetchChatParticipantsWithRealNames` 是个 642 行的 async 方法

⚠️ **design 阶段的判断错误**: 最初 grep 没匹配 `async function` 格式,误判此方法不存在。实际上它**确实存在**于 chat.js 第 2850 行,是 642 行的 async 方法。

**正确处理**: 本次抽离已经把这个方法**一并抽到 `participant-listener.js`**(它本就属于这个职责)。最终抽离了 8 个方法。

## 当前状态分析

### 与 page.data 的耦合

读取的字段:
- `data.participants` — 主参与者数组
- `data.contactId` — chatId
- `data.currentUser` — 区分自己
- `data.isFromInvite / isSender` — 角色判断

写入的字段:
- `data.participants` — 增删改
- `data.dynamicTitle / contactName / chatTitle` — 标题(通过 `this.update*` 间接)

实例属性:
- `this.participantWatcher` — wx.cloud.database().watch 返回的监听器
- `this.participantWatcherReady` — 监听器是否就绪
- `this.participantPollingTimer` — 备用轮询定时器
- `this._lastParticipantsUpdateTime`
- `this._hasUpdatedTitleAfterJoin`

### 跨模块依赖(经 page 调用)

- `this.isReceiverEnvironment()` — IdentityUtils
- `this.isPlaceholderNickname()` — ChatHelpers
- `this.updateDynamicTitleWithRealNames()` — TitleController
- `this.updateTitleWithRealNickname(...)` — TitleController
- `this.updateDynamicTitle()` — TitleController
- `this.replaceCreatorMessageWithJoinMessage(...)` — SystemMessage
- `this.addCreatorSystemMessage()` — SystemMessage
- `this.fetchChatParticipantsWithRealNames()` — **死引用,见上**

### `startParticipantListener` 是 chat.js 单方法行数之最(582 行)

它做了:
1. 启动 wx.cloud.database().collection('conversations').where(...).watch()
2. 监听 onChange 事件
3. 比较 newParticipants vs currentParticipants
4. 检测到新参与者时:更新 participants → 调用标题更新 → 触发系统消息 → 启动监听就绪
5. 内部含大量 HOTFIX 的特判分支(v1.3.55/v1.3.71/v1.3.92 等)

虽然庞大,但**搬迁时整体迁移即可**,不动业务逻辑。

## 模块设计

### 文件:`app/pages/chat/modules/participant-listener.js`

继续 attach 模式:

```js
/**
 * 聊天页参与者监听子系统
 *
 * 职责:
 * - 启动/停止参与者实时监听(wx.cloud.database().watch)
 * - 获取参与者列表(callFunction)
 * - 获取/重试真实邀请者昵称
 * - 参与者去重(主动 + 自动)
 */

const ChatHelpers = require('./chat-helpers.js');

function getOtherParticipantRealName() { /* ... */ }
function retryGetRealInviterName() { /* ... */ }
function startParticipantListener(chatId) { /* ... */ }
function startWatchingForNewParticipants(chatId) { /* ... */ }
function fetchChatParticipants() { /* ... */ }
function cleanupDuplicateParticipants() { /* ... */ }
function deduplicateParticipants() { /* ... */ }

function attach(page) {
  page.getOtherParticipantRealName = getOtherParticipantRealName;
  page.retryGetRealInviterName = retryGetRealInviterName;
  page.startParticipantListener = startParticipantListener;
  page.startWatchingForNewParticipants = startWatchingForNewParticipants;
  page.fetchChatParticipants = fetchChatParticipants;
  page.cleanupDuplicateParticipants = cleanupDuplicateParticipants;
  page.deduplicateParticipants = deduplicateParticipants;
}

module.exports = { attach };
```

### chat.js 改造

```js
const ParticipantListener = require('./modules/participant-listener.js');
// onLoad:
ParticipantListener.attach(this);
```

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 582 行的 startParticipantListener 内部包含 wx.cloud watch 回调 | 整体搬迁,onChange 回调内的 `this` 是 page 实例(因为 attach 后函数赋值到 page) |
| 死引用 `fetchChatParticipantsWithRealNames` 调用穿过新旧边界 | 不动这些调用,既然之前已经被静默吞掉,搬迁后行为依然一致 |
| 标题/系统消息回调被穿插调用 | 这些都是 `this.xxx()` 形式,attach 后 this===page 不变 |

## 任务拆解

按"低风险 → 高风险":

1. 创建 `modules/participant-listener.js` 骨架 + chat.js 顶部 require + onLoad attach
2. 抽离 2 个小工具:`getOtherParticipantRealName` + `retryGetRealInviterName`(69 行)
3. 抽离 `fetchChatParticipants`(80 行)
4. 抽离 `cleanupDuplicateParticipants`(79 行)
5. 抽离 `deduplicateParticipants`(274 行)
6. 抽离 `startWatchingForNewParticipants`(82 行)
7. 抽离 `startParticipantListener`(582 行,最大头)
8. 集成测试新增 ParticipantListener.attach 检查项
9. 更新 docs

每完成一项做一个 commit。

## 验证策略

- `node --check` 每步通过
- `.tools/integration_test.js` 6/6 通过 + 新增 `ParticipantListener.attach 挂上 7+ 方法`

### 预期收益

- chat.js: 9561 → 约 8395(-1166 行,-12.2%)
- 累计 chat.js: 15500 → 8395(-45.8%)
- **接近一半的 chat.js 已经被拆出来**
