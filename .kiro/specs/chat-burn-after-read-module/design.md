# 设计文档: chat-burn-after-read 模块抽离

## 背景与目标

P2 第二刀(`title-controller`)已落地,chat.js 当前 9926 行(突破万行大关)。
本次 P2 第三刀目标:把"消息销毁定时器子系统"集中到 `app/pages/chat/modules/burn-after-read.js`,**保持行为零变化**。

阅后即焚是项目核心特性,其复杂度集中在:
- 多种销毁路径(普通消息倒计时 / 系统消息淡出 / 离线消息追赶 / 强制兜底)
- 销毁定时器的清理(`destroyTimers` Map)
- 全局已销毁记录(已抽到 `destroyed-store.js`)

## 范围(In Scope)

抽离以下 7 个方法到新模块:

| 方法名 | 行号 | 行数 | 角色 |
|---|---|---:|---|
| `destroyMessage(msgId)` | 5216-5219 | 4 | 入口薄壳,统一委托给 permanentlyDeleteMessage |
| `markMessageAsReadAndDestroy(messageId, messageIndex)` | 9388-9400 | 13 | 标记消息已读并启动倒计时 |
| `processOfflineMessages()` | 9405-9453 | 49 | 处理离线期间收到的消息(重新进入应用时) |
| `permanentlyDeleteMessage(messageId)` | 9458-9542 | 85 | 彻底删除消息(本地 + 云端 + 全局记录) |
| `startDestroyCountdown(messageId)` | 9563-9646 | 84 | 增强销毁倒计时(基于字数计算停留时长) |
| `startFadingDestroy(messageId, messageIndex, fadeDuration)` | 9652-9746 | 95 | 透明度渐变销毁 |
| `clearAllDestroyTimers()` | 9752-9863 | 112 | 清理所有销毁定时器(setInterval + setTimeout) |

合计 ~442 行。

### 范围外(Out of Scope)

下列与"销毁"相关但属于不同职责的方法,**不在本次范围**:

- `burnAfterReadingCleanup / forceBurnAfterReadingCleanup` — "整个会话历史强制清理"专项工具
- `permanentDeleteAllMessages / batchDeleteMessages / localClearMessages` — 同上,会话级清理
- `enableRealTimeDestroy` — "启用模式"开关,与 startOnlineUsersWatcher 等绑定
- `onMessageTap` — wxml 事件入口,涉及 voice / image / system 多种消息类型,职责跨多模块

## 当前状态分析

### 与 page.data 的耦合

读取的字段:
- `data.messages` — 主消息数组
- `data.destroyTimeout` — 默认销毁倒计时(秒)
- `data.contactId` — 用于云端删除
- `data.currentUser.openId` — 区分谁的消息
- `data.backgroundTime` — 离线时间
- `_localMessageCache` — 本地消息缓存(轮询合并防丢)

写入的字段:
- `data.messages` — 删除/更新元素
- `data.scrollTop` / `scrollIntoView` — 滚动行为

实例属性:
- `this.destroyTimers` — `Map<messageId, timer>`,所有销毁定时器
- `this.destroyTimeoutTimers` — `Map<messageId, timeoutId>`,所有 setTimeout(在 clearAllDestroyTimers 中读)

### 跨模块依赖

- `this.formatTime()` — chat-helpers 已挂
- `DestroyedStore` — 通过 `globalThis.app.globalDestroyedMessageStore[chatId][userOpenId]` 访问
- `wx.cloud.callFunction({ name: 'destroyMessage', data: ... })` — 云函数

### startSystemMessageFade 内部调用 startFadingDestroy

`system-message.js` 中 `addSystemMessage / startSystemMessageFade` 在淡出/兜底路径会通过 `this.startFadingDestroy / this.permanentlyDeleteMessage / this.startDestroyCountdown` 调用本模块,迁移后这些 `this.xxx` 调用仍然有效(attach 后 `this === page`)。

### destroyMessage 已经是薄壳

```js
destroyMessage: function(msgId) {
  // 统一走彻底删除,避免二义性残留
  try { this.permanentlyDeleteMessage(msgId); } catch (e) {}
}
```

迁移时整个搬过去即可(无业务逻辑)。

## 模块设计

### 文件: `app/pages/chat/modules/burn-after-read.js`

继续用 attach 模式:

```js
/**
 * 聊天页阅后即焚子系统
 *
 * 职责:
 * - 消息销毁倒计时与定时器管理
 * - 透明度渐变销毁
 * - 离线消息处理(重新进入应用时)
 * - 彻底删除(本地 + 云端 + 全局记录)
 * - 销毁定时器统一清理
 */

const ChatHelpers = require('./chat-helpers.js');
const DestroyedStore = require('./destroyed-store.js');

function destroyMessage(msgId) { /* ... */ }
function markMessageAsReadAndDestroy(messageId, messageIndex) { /* ... */ }
function processOfflineMessages() { /* ... */ }
function permanentlyDeleteMessage(messageId) { /* ... */ }
function startDestroyCountdown(messageId) { /* ... */ }
function startFadingDestroy(messageId, messageIndex, fadeDuration) { /* ... */ }
function clearAllDestroyTimers() { /* ... */ }

function attach(page) {
  page.destroyMessage = destroyMessage;
  page.markMessageAsReadAndDestroy = markMessageAsReadAndDestroy;
  page.processOfflineMessages = processOfflineMessages;
  page.permanentlyDeleteMessage = permanentlyDeleteMessage;
  page.startDestroyCountdown = startDestroyCountdown;
  page.startFadingDestroy = startFadingDestroy;
  page.clearAllDestroyTimers = clearAllDestroyTimers;
}

module.exports = { attach };
```

### chat.js 改造

**顶部 require**:
```js
const BurnAfterRead = require('./modules/burn-after-read.js');
```

**onLoad 起始处**(紧跟 TitleController.attach):
```js
SystemMessage.attach(this);
TitleController.attach(this);
BurnAfterRead.attach(this);
```

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 缩进不一致(原文是 3 空格) | 搬迁时统一改为 2 空格 |
| destroyTimers Map 在多个方法间共享 | 仍然挂在 page 实例上,跨方法访问行为不变 |
| permanentlyDeleteMessage 内部 wx.cloud 调用 | 保留原 success/fail 回调结构 |
| 销毁路径错综(setInterval + setTimeout 混用) | 清理逻辑整体搬迁,不动定时器存储结构 |

## 任务拆解

按"低风险 → 高风险"顺序:

1. 创建 `modules/burn-after-read.js` 骨架
2. 抽离 `destroyMessage`(4 行薄壳,起步)
3. 抽离 `clearAllDestroyTimers`(112 行,纯清理逻辑)
4. 抽离 `permanentlyDeleteMessage`(85 行,核心删除)
5. 抽离 `startDestroyCountdown` + `startFadingDestroy`(179 行,定时器主体)
6. 抽离 `markMessageAsReadAndDestroy` + `processOfflineMessages`(62 行,处理路径)
7. chat.js 顶部 require + onLoad 调用 `BurnAfterRead.attach(this)`
8. 集成测试新增检查 BurnAfterRead.attach
9. 更新 docs

每完成一项做一个 commit。

## 验证策略

### 自动化

- `node --check` 每次抽离后跑
- `.tools/integration_test.js` 必须保持通过,新增 `BurnAfterRead.attach 挂上 7 个方法` 检查项

### 预期收益

- chat.js: 9926 → 约 9484(-442 行,-4.5%)
- 累计 chat.js: 15500 → 9484(-38.8%)
