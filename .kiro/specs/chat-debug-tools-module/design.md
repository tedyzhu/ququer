# 设计文档: chat-debug-tools 模块抽离

## 背景与目标

P2 前 4 刀已让 chat.js 从 15500 → 7719 (-50.2%)。剩 1 个候选 `identity-resolver`(onLoad 内 1095 行身份判定)。但**硬抽 onLoad 风险极高**:
- onLoad 内大量 setData 副作用,无法做"零行为变化"抽离
- 身份判定逻辑包含 ~20 个 HOTFIX 分支,任何改动都可能触发误判 A/B 端

经代码扫描发现 **chat.js 中存在 31 个调试/工具方法,~2000 行**。这些方法:
- 仅由调试菜单(showChatMenu / showMoreMenu / showTestPanel)触发
- 不在生产业务路径上
- 删除即可,但有兼容性顾虑(键盘弹出可能调用 wx.showActionSheet 进入)

P2 第五刀目标:**把 31 个调试/工具方法集中到 `app/pages/chat/modules/chat-debug-tools.js`**,让 chat.js 的剩余部分成为纯生产路径。

## 范围(In Scope)

抽离以下 **31 个方法**到新模块 `chat-debug-tools.js`(估计 ~2000 行):

### A. 调试菜单入口与子菜单(7 个)
- `showIdentityFixDialog()` — 身份检测异常弹窗
- `fixIdentityToSender()` — 修复身份为发送方
- `fixSpecificUserNickname()` — 专项昵称修复
- `quickTitleTest()` — 快速标题测试
- `testReceiverTitle()` — 接收方标题测试主菜单(子菜单展开为下面 4 个)
- `fullReceiverSimulation()` — 完整接收方模拟
- `realShareLinkTest()` — 真实分享链接测试

### B. 状态诊断与切换(5 个)
- `diagnosisCurrentState()` — 当前状态诊断
- `switchUserForTesting(targetUserInfo)` — 切换用户身份
- `testAsReceiver()` — 切换到接收方身份
- `testAsSender()` — 切换到发送方身份
- `simulateTwoPersonChat()` — 模拟双方对话

### C. 调试用加入聊天(3 个)
- `manualJoinExistingChat()` — 手动加入现有聊天
- `showChatIdInput()` — 显示聊天 ID 输入框
- `joinSpecificChat(chatId, inviterName)` — 加入指定聊天

### D. 编译模式工具(2 个)
- `generateCompileModeConfig(chatId, nickName)` — 生成编译模式配置
- `directJumpTest(chatId, nickName)` — 直接跳转测试

### E. 紧急修复工具(2 个)
- `emergencyFixUserIdentity()` — 紧急修复身份信息混乱
- `emergencyFixConnection()` — 紧急修复连接

### F. 强制清理工具(5 个)
- `burnAfterReadingCleanup()` — 阅后即焚强制清理(用户主动触发)
- `forceBurnAfterReadingCleanup()` — 强制清理变体
- `permanentDeleteAllMessages(chatId)` — 删除聊天所有消息
- `batchDeleteMessages(chatId)` — 分批删除
- `localClearMessages(chatId)` — 本地清理

### G. 残留数据测试工具(3 个)
- `cleanupStaleData()` — 清理残留聊天数据
- `testNewChatMessageSending()` — 新聊天消息发送测试
- `testCleanupStaleData()` — 残留数据清理测试

### H. 在线状态(4 个)
- `startOnlineStatusMonitor()` — 启动在线状态监听
- `stopOnlineStatusMonitor()` — 停止在线状态监听
- `updateUserOnlineStatus(isOnline)` — 更新用户在线状态
- `startOnlineUsersWatcher()` — 启动在线用户监听
- `checkMutualOnlineStatus()` — 检查双方在线
- `enableRealTimeDestroy()` — 启用实时阅后即焚

(H 类合计 6 个,共 31 个)

### 范围外(Out of Scope)

- `showChatMenu` / `showMoreMenu` / `showChatIdInput` 中的 wx.showActionSheet 调用代码本身(它们仍在 chat.js 中,通过 `this.xxx` 形式调用调试方法)
- 生产路径方法(fetchMessages / sendMessage / 等)
- onLoad 内身份判定逻辑(本次明确不动)

## 当前状态分析

### 这些调试方法的发现路径

通过 grep 全项目扫描,这些方法只在 chat.js 内被以下两种方式调用:
1. `wx.showActionSheet({ itemList: ... })` 的回调中通过 `this.xxx()` 调用
2. 部分方法互相调用(如 `testReceiverTitle` 内调用 `quickTitleTest`)

**没有任何 wxml / 其他 .js 文件直接调用**,确认为调试入口。

### 与 page.data 的耦合

调试方法读写的字段与生产方法相同:
- `data.participants / messages / contactId / currentUser`
- `wx.cloud.callFunction` / `wx.showModal` / `wx.setNavigationBarTitle`

无新的 page.data 字段被这些方法独占,搬迁后通过 `this.xxx` 访问完全等价。

### 重复定义警告

代码扫描发现 **`manuallyFixConnection` 被定义两次**:
- 行 4525(在生产路径附近)
- 行 5075(在调试方法群附近)

这是历史遗留 bug(类似之前发现的 `addCreatorSystemMessage` 双定义)。
**本次抽离时**:
- 把第二个定义(5075)归类为调试工具,搬到 `chat-debug-tools.js`
- 但这样会让运行时仍然走第二个定义(被覆盖那个)
- **正确做法**:仅保留 4525 这个生产路径的定义,删除 5075 的死代码版本

## 模块设计

### 文件:`app/pages/chat/modules/chat-debug-tools.js`

继续 attach 模式:

```js
/**
 * 聊天页调试与工具方法集
 *
 * 这里收纳的所有方法都是"非生产路径"的:
 * - 仅由调试菜单(showChatMenu / showMoreMenu / wx.showActionSheet)触发
 * - 部分由用户主动操作触发(如清理重复参与者弹窗确认后)
 *
 * 设计原则:
 * - attach 模式: 函数体内 `this === page`
 * - 不引入新状态,通过 page 实例属性 / page.data 与 wx.cloud 交互
 */

const ChatHelpers = require('./chat-helpers.js');

function showIdentityFixDialog() { /* ... */ }
function fixIdentityToSender() { /* ... */ }
// ... 其他 29 个方法

function attach(page) {
  page.showIdentityFixDialog = showIdentityFixDialog;
  page.fixIdentityToSender = fixIdentityToSender;
  // ... 其他绑定
}

module.exports = { attach };
```

### chat.js 改造

```js
const ChatDebugTools = require('./modules/chat-debug-tools.js');
// onLoad:
ChatDebugTools.attach(this);
```

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 31 个方法之间互相调用 | 全部走 `this.xxx`,attach 后行为不变 |
| 部分调试方法调用生产方法(如 fetchChatParticipantsWithRealNames) | 这些都已在 ParticipantListener.attach 后挂在 page 上,可以正常调用 |
| `manuallyFixConnection` 双定义 | 抽离时显式删除 5075 的版本(它本就是死代码),保留 4525 |

## 任务拆解

按"低风险 → 高风险":

1. 创建 `modules/chat-debug-tools.js` 骨架 + chat.js 顶部 require + onLoad attach
2. 抽离 A 类(7 个调试菜单入口)
3. 抽离 B 类(5 个状态诊断)
4. 抽离 C+D 类(5 个加入聊天 + 编译模式工具)
5. 抽离 E+F 类(2 紧急修复 + 5 强制清理)
6. 抽离 G+H 类(3 残留数据 + 6 在线状态)
7. 删除 `manuallyFixConnection` 5075 处的重复定义
8. 集成测试新增 ChatDebugTools 检查项
9. 更新 docs

每完成一项做一个 commit。

## 验证策略

- `node --check` 每步通过
- `.tools/integration_test.js` 6/6 通过 + 新增 `ChatDebugTools.attach 挂上 31+ 方法`

### 预期收益

- chat.js: 7719 → 约 5700(-2000 行,-26%)
- 累计 chat.js: 15500 → 5700(-63%)
- chat.js 已基本只剩生产路径
- 修复 `manuallyFixConnection` 双定义死代码 bug
