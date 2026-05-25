# 设计文档: chat-system-message 模块抽离

## 背景与目标

`chat.js` 当前 11922 行,其中"系统消息子系统"散布在 12 个方法、约 1089 行。这套子系统负责:

- 创建/添加/淡出系统消息(A 端"您创建了私密聊天"、B 端"加入 X 的聊天")
- 清理错误添加的系统消息(A/B 端误添加场景)
- 在加载完聊天记录后归一化系统消息
- B 端安全二次确认

P2 的第一刀目标是把这一组方法搬到 `app/pages/chat/modules/system-message.js`,**保持行为零变化**,让 chat.js 进一步瘦身。

### 范围(In Scope)

抽离以下 11 个独立方法(注:`addCreatorSystemMessage` 在 chat.js 中重复定义两次,合并为一个):

| 方法名 | 当前位置 | 行数 | 角色 |
|---|---|---:|---|
| `addSystemMessage(content, options)` | 6084-6226 | 143 | 核心:写入一条系统消息(去重 + setData) |
| `startSystemMessageFade(messageId, stay, fade)` | 6234-6294 | 61 | 核心:启动单条消息淡出动画 |
| `addCreatorSystemMessage()` | 2049 / 2898 | 45(合并后 ~25) | A 端:添加"您创建了私密聊天"消息 |
| `clearIncorrectSystemMessages()` | 2014-2044 | 31 | B 端确认后:清理错误的 A 端消息 |
| `cleanupWrongSystemMessages()` | 2454-2558 | 105 | 全面清理"垃圾"系统消息 |
| `fixAEndSystemMessage()` | 1898-1951 | 54 | A 端:用真实昵称重写消息 |
| `fixBEndSystemMessage(realInviterName)` | 1956-2008 | 53 | B 端:用真实邀请者昵称重写 |
| `updateSystemMessageAfterJoin(inviterName)` | 2120-2417 | 298 | B 端加入后:核心修复路径 |
| `enforceSystemMessages()` | 3061-3118 | 58 | 兜底:按 A/B 角色强制只保留正确消息 |
| `normalizeSystemMessagesAfterLoad()` | 3126-3226 | 101 | 加载完聊天记录后:归一化 |
| `performBEndSystemMessageCheck()` | 11742-11881 | 140 | B 端安全二次确认 |

### 范围外(Out of Scope)

以下属于"调用方/业务流程",这次不动:

- `onLoad` / `onShow` 中对这些方法的调用点
- B/A 端身份判定(归 P2 后续 `identity-resolver.js`)
- 标题刷新(归 P2 后续 `title-controller.js`)
- 销毁定时器(已有 `destroyed-store.js`,归 P2 后续 `burn-after-read.js`)

## 当前状态分析

### 隐藏 bug:`addCreatorSystemMessage` 重复定义

`chat.js` 第 2049 与 2898 行**重复定义同名方法**。JavaScript 对象字面量后定义的覆盖前者,因此实际生效的是 2898 版。两个版本的差异:

- **2049 版**:仅检查"已有创建者消息",存在则跳过,否则调用 `addSystemMessage`
- **2898 版**:检查"已有创建或加入消息",且对消息内容做了更宽的匹配(包含"您创建了私密聊天"或"加入...的聊天")

抽离时**只保留 2898 版**,2049 版属于死代码,删除即可,无行为变化。

### 调用图

```
onLoad / 各种 join 路径
  │
  ├── addCreatorSystemMessage()
  │     └── addSystemMessage(content, options)
  │           └── (内部) startSystemMessageFade(...)
  │
  ├── updateSystemMessageAfterJoin(inviterName)
  │     ├── addSystemMessage(...)
  │     └── this.fetchChatParticipantsWithRealNames(...)  ← 跨模块依赖
  │
  ├── enforceSystemMessages()
  │     └── this.isReceiverEnvironment()  ← 已在 IdentityUtils
  │
  ├── normalizeSystemMessagesAfterLoad()
  │     └── (与上同)
  │
  ├── fixAEndSystemMessage() / fixBEndSystemMessage()
  │     └── addSystemMessage(...)
  │
  ├── clearIncorrectSystemMessages() / cleanupWrongSystemMessages()
  │     └── (纯 setData 清理,无外调)
  │
  └── performBEndSystemMessageCheck()
        └── addSystemMessage(...) / clearIncorrectSystemMessages()
```

跨模块依赖:
- `this.isReceiverEnvironment()` → 已迁到 `IdentityUtils.isReceiverEnvironment(page)`
- `this.fetchChatParticipantsWithRealNames(...)` → 仍在 chat.js 内,本期保持 `page.xxx()` 调用
- `this.startSystemMessageFade(...)` → 同模块内调用,抽离后变内部互调

### 与 page.data 的耦合

所有方法都依赖以下数据:
- `page.data.messages` — 读 + setData
- `page.data.contactName` / `page.data.dynamicTitle` — 仅 fix* 方法读
- `page.data.isFromInvite` / `page.data.isSender` — 角色判断
- `page.data.contactId` — 仅日志

**实例属性**(用作"防重复"标志位):
- `page.bEndSystemMessageAdded`
- `page.bEndSystemMessageProcessed`
- `page.globalBEndMessageAdded`
- `page.aEndJoinMessageAdded`
- `page.needsCreatorMessage`

这些属性 onLoad 中初始化,系统消息方法读写。**抽离后保留这种"读写 page 实例属性"的模式**,不引入新的状态容器,降低风险。

## 模块设计

### 文件:`app/pages/chat/modules/system-message.js`

采用与 `test-methods.js` / `voice-recorder.js` 相同的"attach + 跨模块互调"模式:

```js
/**
 * 聊天页系统消息子系统
 *
 * 职责:
 * - 系统消息的添加/淡出
 * - A/B 端系统消息的修复与清理
 * - 加载后归一化与安全二次确认
 *
 * 设计原则:
 * - 函数体内 `this` 仍指向 page(运行时由调用方决定)
 * - 不引入新的状态容器,继续读写 page 实例属性
 * - 跨模块依赖通过 page 上的方法调用(如 page.isReceiverEnvironment())
 */

const ChatHelpers = require('./chat-helpers.js');

function addSystemMessage(content, options) { /* 原 chat.js 6084-6226 函数体 */ }
function startSystemMessageFade(messageId, staySeconds, fadeSeconds) { /* ... */ }
function addCreatorSystemMessage() { /* 原 2898 版函数体 */ }
function clearIncorrectSystemMessages() { /* ... */ }
function cleanupWrongSystemMessages() { /* ... */ }
function fixAEndSystemMessage() { /* ... */ }
function fixBEndSystemMessage(realInviterName) { /* ... */ }
function updateSystemMessageAfterJoin(inviterName) { /* ... */ }
function enforceSystemMessages() { /* ... */ }
function normalizeSystemMessagesAfterLoad() { /* ... */ }
function performBEndSystemMessageCheck() { /* ... */ }

/**
 * 把所有系统消息相关方法挂到 page 实例上
 * @param {Object} page - Page 实例
 */
function attach(page) {
  page.addSystemMessage = addSystemMessage;
  page.startSystemMessageFade = startSystemMessageFade;
  page.addCreatorSystemMessage = addCreatorSystemMessage;
  page.clearIncorrectSystemMessages = clearIncorrectSystemMessages;
  page.cleanupWrongSystemMessages = cleanupWrongSystemMessages;
  page.fixAEndSystemMessage = fixAEndSystemMessage;
  page.fixBEndSystemMessage = fixBEndSystemMessage;
  page.updateSystemMessageAfterJoin = updateSystemMessageAfterJoin;
  page.enforceSystemMessages = enforceSystemMessages;
  page.normalizeSystemMessagesAfterLoad = normalizeSystemMessagesAfterLoad;
  page.performBEndSystemMessageCheck = performBEndSystemMessageCheck;
}

module.exports = { attach };
```

### chat.js 改造

**顶部 require**:

```js
const SystemMessage = require('./modules/system-message.js');
```

**Page() 内 onLoad 起始处或更早(在第一次调用任何 system-message 方法之前)**:

```js
SystemMessage.attach(this);
```

**删除原 11 + 1 重复 = 12 处方法定义**(2049 版 `addCreatorSystemMessage` 是死代码,直接删,不留薄壳)。

### 为什么用 `attach` 而不是导出函数 + 显式调用

`test-methods.js` 与 `voice-recorder.js` 已验证 attach 模式可行,关键好处:

1. **薄壳数量为零**——`page.addSystemMessage(...)` 仍然能正常调用,内部 `this` 自然指向 page
2. **跨模块互调零成本**——`startSystemMessageFade` 在 `addSystemMessage` 内部调用时,直接 `this.startSystemMessageFade(...)` 即可
3. **chat.js 调用点零修改**——上千处 `this.addSystemMessage(...)` / `this.addCreatorSystemMessage()` 完全不动

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| `addCreatorSystemMessage` 误用 2049 版而非 2898 版 | 设计文档显式标注、抽离后单独 commit 并写明"删除 2049 版死代码" |
| 跨模块函数中 `this` 指向错误 | attach 模式 + 不使用箭头函数,实测可行 |
| `node --check` 通过但运行时缺方法 | 集成测试在每次抽离后跑一次 |
| 实例属性命名打字错 | 抽离时用直接复制粘贴而非手敲;diff 时只看 chat.js 的方法删除 |

## 任务拆解(tasks.md 的预先草案)

按"低风险 → 高风险"顺序,每完成一项跑一次集成测试:

1. 创建 `modules/system-message.js` 骨架(只含 require + 空 attach + module.exports)
2. 抽离最纯的 `addSystemMessage` + `startSystemMessageFade`(不依赖其他系统消息方法)
3. 抽离独立清理类:`clearIncorrectSystemMessages` + `cleanupWrongSystemMessages`
4. 抽离 fix 类:`fixAEndSystemMessage` + `fixBEndSystemMessage`
5. 抽离 add 类:`addCreatorSystemMessage`(**只保留 2898 版**,删除 2049 版)
6. 抽离 enforce/normalize:`enforceSystemMessages` + `normalizeSystemMessagesAfterLoad`
7. 抽离最大头:`updateSystemMessageAfterJoin`(298 行)
8. 抽离 B 端二次确认:`performBEndSystemMessageCheck`
9. 在 chat.js 顶部 require + onLoad 调用 `SystemMessage.attach(this)`
10. `node --check` + 集成测试 6/6 通过 + 在模拟器跑一次 P0 路径

每完成一项做一个 commit,出问题立刻 `git revert`。

## 验证策略

### 自动化

- `node --check app/pages/chat/chat.js` 每次抽离后跑
- `.tools/integration_test.js` 必须保持 6/6 通过(它会 require chat.js 验证 Page 对象完整性)

### 手动(在模拟器)

A 端流程(同号自测,用上次的真机/模拟器组合):
- 创建聊天 → "您创建了私密聊天..."系统消息出现 + 3 秒停留 + 5 秒淡出
- 等 B 端加入 → 收到"X 加入聊天"

B 端流程:
- 通过分享链接进入 → 直接显示"加入 X 的聊天"
- 不再出现"您创建了私密聊天..."(误添加)

### 预期收益

- chat.js: 11922 → 约 10833(-1089 行,-9.1%)
- 新增模块: `system-message.js` 约 1100 行(含注释)
- 子系统首次具备独立可读性,后续修 bug 不需要在 11922 行里搜索
