# 设计文档: chat-title-controller 模块抽离

## 背景与目标

P2 第一刀(`system-message`)已落地,chat.js 当前 10790 行。
本次 P2 第二刀目标: 把"标题刷新子系统"集中到 `app/pages/chat/modules/title-controller.js`,**保持行为零变化**。

### 范围(In Scope)

抽离以下 8 个方法到新模块:

| 方法名 | 行号范围 | 行数 | 角色 |
|---|---|---:|---|
| `fetchRealInviterNameAndUpdateTitle()` | 1902-1944 | 43 | B 端: 从云端拿真实邀请者昵称后刷标题 |
| `updateReceiverTitleWithRealNames()` | 1982-2112 | 131 | B 端: 用参与者真实昵称刷标题 |
| `updateTitleForReceiver(inviterNickName)` | 2117-2221 | 105 | B 端: 设置"我和[A端昵称](2)"格式 |
| `protectReceiverTitle(correctTitle)` | 2226-2263 | 38 | B 端: 标题保护(防被覆盖) |
| `updateDynamicTitleWithRealNames()` | 2624-2762 | 139 | A 端: 真实昵称版动态标题 |
| `updateTitleWithRealNickname(participantId, realNickname)` | 5329-5386 | 58 | 通用: 单个参与者真实昵称刷标题 |
| `updateDynamicTitle()` | 6563-6758 | 196 | A 端: 核心动态标题 |
| (补抽) `replaceCreatorMessageWithJoinMessage(participantName)` | 2327-2442 | 116 | A 端: 把"创建消息"替换为"加入消息" |

**注意 `replaceCreatorMessageWithJoinMessage`**:这是上一刀 system-message 漏抽的一个方法。它的核心职责是**操作 messages 数组**,属于系统消息子系统。本次会先做一个"补抽"的小 commit 把它挪到 `system-message.js`,然后再正式开始 title-controller。

实际归入 title-controller 的是 7 个方法,合计 ~710 行。

### 范围外(Out of Scope)

- 5 个调试入口方法(`testReceiverTitle / quickTitleTest / fullReceiverSimulation / realShareLinkTest / diagnosisCurrentState`),从 `showChatMenu` 触发,合计 ~900 行 — 它们应该归入未来的"调试方法整理"任务,不属于标题刷新职责
- onLoad 中对这些方法的调用点
- 标题判定逻辑的设计变更(本次只迁移)

## 当前状态分析

### 标题路径有 4 套互相覆盖

通过代码扫描,标题字段(`dynamicTitle / chatTitle / contactName`)被以下入口写入:

```
1. updateDynamicTitle (A 端核心,196 行)
   ├─ 单人 → "[A端昵称]"
   └─ 双人 → "我和[B端昵称]（2）"

2. updateDynamicTitleWithRealNames (A 端真实昵称版,139 行)
   └─ 与 updateDynamicTitle 走同一逻辑,但优先用从参与者列表拿到的真实昵称

3. updateTitleForReceiver / updateReceiverTitleWithRealNames (B 端,236 行)
   └─ "我和[A端昵称]（2）"

4. updateTitleWithRealNickname (单参与者更新,58 行)
   └─ 收到某个参与者的真实昵称后局部刷新
```

所有路径最后都会:
- 写 `this.data.dynamicTitle / chatTitle / contactName`
- 调用 `wx.setNavigationBarTitle({ title: ... })`

### 与 page.data 的耦合

读取的字段:
- `data.participants` — 找对方
- `data.currentUser.openId` — 排除自己
- `data.isFromInvite / isSender` — 角色判断
- `data.dynamicTitle` — 当前标题

写入的字段:
- `data.dynamicTitle / chatTitle / contactName`
- `data.titleProtected`(标题保护标志)

实例属性(读写):
- `this.data._titleProtectionUntil`(防覆盖时间戳,protectReceiverTitle 用)
- `this.data.titleProtectionTimer`(保护定时器)

### 跨模块依赖

- `this.isReceiverEnvironment()` — IdentityUtils 已挂
- `this.fetchChatParticipantsWithRealNames()` — chat.js 内方法,保持 `this.` 调用
- `this.formatTime()` — chat-helpers 已挂

## 模块设计

### 文件: `app/pages/chat/modules/title-controller.js`

继续用与 `system-message.js` 相同的 attach 模式:

```js
/**
 * 聊天页标题刷新子系统
 *
 * 职责:
 * - A/B 端动态标题计算与设置
 * - 标题保护(防被参与者监听等异步路径覆盖)
 * - 真实昵称从云端获取后刷新标题
 *
 * 设计原则:
 * - 函数体内 `this === page`(由 attach 时绑定保证)
 * - 不引入新的状态容器,继续读写 page.data 与实例属性
 * - 所有跨模块依赖经 page 调用
 */

const ChatHelpers = require('./chat-helpers.js');

function fetchRealInviterNameAndUpdateTitle() { /* ... */ }
function updateReceiverTitleWithRealNames() { /* ... */ }
function updateTitleForReceiver(inviterNickName) { /* ... */ }
function protectReceiverTitle(correctTitle) { /* ... */ }
function updateDynamicTitleWithRealNames() { /* ... */ }
function updateTitleWithRealNickname(participantId, realNickname) { /* ... */ }
function updateDynamicTitle() { /* ... */ }

function attach(page) {
  page.fetchRealInviterNameAndUpdateTitle = fetchRealInviterNameAndUpdateTitle;
  page.updateReceiverTitleWithRealNames = updateReceiverTitleWithRealNames;
  page.updateTitleForReceiver = updateTitleForReceiver;
  page.protectReceiverTitle = protectReceiverTitle;
  page.updateDynamicTitleWithRealNames = updateDynamicTitleWithRealNames;
  page.updateTitleWithRealNickname = updateTitleWithRealNickname;
  page.updateDynamicTitle = updateDynamicTitle;
}

module.exports = { attach };
```

### chat.js 改造

**顶部 require**(加在 SystemMessage 后):
```js
const TitleController = require('./modules/title-controller.js');
```

**onLoad 起始处**(紧跟 SystemMessage.attach):
```js
SystemMessage.attach(this);
TitleController.attach(this);
```

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| `quickTitleTest` 等调试方法依赖标题方法 | 它们以 `this.updateTitleForReceiver(...)` 形式调用,attach 后仍可用 |
| protectReceiverTitle 的定时器 / 保护机制丢失 | 把整个函数体原样搬迁,不动定时器逻辑 |
| 标题更新涉及多种 setData 路径 | 集成测试 + 模拟器手动验证 P0 |

## 任务拆解

按"低风险 → 高风险"顺序,每完成一项跑一次集成测试:

0. (前置) 把 `replaceCreatorMessageWithJoinMessage` 补抽到 `system-message.js`
1. 创建 `modules/title-controller.js` 骨架
2. 抽离 4 个 B 端方法: `fetchRealInviterNameAndUpdateTitle`, `updateReceiverTitleWithRealNames`, `updateTitleForReceiver`, `protectReceiverTitle`
3. 抽离 3 个 A 端方法: `updateDynamicTitleWithRealNames`, `updateTitleWithRealNickname`, `updateDynamicTitle`
4. chat.js 顶部 require + onLoad 调用 `TitleController.attach(this)`
5. `node --check` + 集成测试 + 更新 docs

每完成一项做一个 commit。

## 验证策略

- `node --check app/pages/chat/chat.js` 每次抽离后跑
- `.tools/integration_test.js` 必须保持通过
- 集成测试新增检查: `TitleController.attach` 挂上 7 个方法

### 预期收益

- chat.js: 10790 → 约 10080(-710,-6.6%)
- 累计 chat.js: 15500 → 10080(-35.0%)
- 标题子系统首次具备独立可读性
