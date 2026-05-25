# 系统消息模块抽离 — Requirements

## 背景

`app/pages/chat/chat.js` 当前 ~11922 行,P2 目标是把剩余 5 个核心业务模块拆出去。
本 spec 处理 5 个模块中**第 1 个破冰目标**:`system-message`。

选它先做的原因:
- 调用面清晰(主要 API 是 `addSystemMessage`)
- 与已抽出模块依赖少(只用到 `chat-helpers` 的 `SYSTEM_MESSAGE_DEFAULTS` 等常量、`identity-utils` 的 `markBEndJoinEver` / `hasBEndJoinEver`)
- 可独立测试

## 涉及方法清单

按重要性排序(均位于 `chat.js`,行号以当前 main 分支为准):

| # | 方法 | 行号 | 角色 |
| --- | --- | --- | --- |
| 1 | `addSystemMessage` | ~6084 | 入口 API,所有其他方法或外部调用方都经它 |
| 2 | `startSystemMessageFade` | ~6234 | 系统消息渐隐定时器 |
| 3 | `enforceSystemMessages` | ~3061 | A/B 端在加载/连接时校正系统消息列表 |
| 4 | `normalizeSystemMessagesAfterLoad` | ~3126 | 加载完后归一化 |
| 5 | `addCreatorSystemMessage` | ~2049 + ~2898 | A 端"您创建了私密聊天"。**注意:存在两个同名定义,需先合并**|
| 6 | `updateSystemMessageAfterJoin` | ~2120 | B 端"加入xx的聊天" |
| 7 | `removeWrongCreatorMessages` | ~3289 | B 端兜底清理 |

## 调用方分布

`addSystemMessage` 在 chat.js 内被调用 **20+ 次**(分布在 1803-11873),
在 `modules/test-methods.js` 中通过 `this.addSystemMessage` / `this.addCreatorSystemMessage` 等被调用 4 次。

调用方迁移**不在本 spec 范围**——本期采用"薄壳模式"保留同名 Page 方法,避免大面积修改调用点。

## 功能需求(EARS 格式)

### 需求 1 — 业务行为零变化

**用户故事**: 作为重构维护者,我希望抽离后所有系统消息相关用户可见行为完全一致。

#### 验收标准

1. WHEN 调用 `page.addSystemMessage(content, options)` THEN 系统消息插入位置、去重逻辑、淡出参数必须与抽离前完全一致。
2. WHEN A 端首次进入聊天 THEN 显示"您创建了私密聊天,可点击右上角菜单分享链接邀请朋友加入"系统消息,且仅显示一次。
3. WHEN B 端通过邀请链接加入 THEN 显示"加入<A 端昵称>的聊天"系统消息,且无论 ever 标记还是去重路径都不会重复添加。
4. WHEN 系统消息存在 `autoFadeStaySeconds > 0` THEN 自动淡出定时链路按 stay → fade → 销毁 顺序执行。
5. WHEN 加载完聊天记录 THEN `normalizeSystemMessagesAfterLoad` 行为不变,A 端清掉"加入"相关、B 端清掉"创建"相关。
6. WHEN 连接建立 / 参与者进入 THEN `enforceSystemMessages` 行为不变。

### 需求 2 — 修复 `addCreatorSystemMessage` 的双定义隐患

**用户故事**: 作为重构维护者,我希望解决 chat.js 中 `addCreatorSystemMessage` 被定义两次、第二次覆盖第一次的隐患。

#### 验收标准

1. WHEN 抽离到 `system-message.js` THEN 必须在 chat.js 中**只保留一个薄壳定义**。
2. WHEN 比较两个原始定义 THEN 第二个(行 2898)是当前实际生效的,逻辑应以它为准;第一个被覆盖,可删除。
3. IF 两个定义有差异 THEN 必须明确选用 v1.3.83 版本(第二个定义),保持当前用户实际看到的行为。

### 需求 3 — 模块接口设计遵循薄壳/attach 双模式

**用户故事**: 作为后续维护者,我希望系统消息模块接口与已抽出的 7 个模块风格一致。

#### 验收标准

1. WHEN 创建 `modules/system-message.js` THEN 模块导出函数应接受 `page` 实例作为第一个参数(模仿 `identity-utils.js` 的薄壳模式)。
2. WHEN chat.js 中保留 Page 方法 THEN 应使用薄壳形式: `methodName: function(...args) { return SystemMessage.fn(this, ...args); }`。
3. WHEN 抽离后跑 `node --check chat.js` THEN 必须语法通过。

### 需求 4 — 与已抽出模块依赖一致

**用户故事**: 作为模块设计者,我希望复用已有的纯函数与常量,而非重复定义。

#### 验收标准

1. WHEN 模块需要 `SYSTEM_MESSAGE_DEFAULTS` THEN 必须从 `./chat-helpers.js` import,不重复定义。
2. WHEN 模块需要判断 ever 标记 THEN 必须复用 `./identity-utils.js` 的 `hasBEndJoinEver` / `markBEndJoinEver`。
3. WHEN 模块用到 `formatTime` THEN 必须从 `./chat-helpers.js` 取。

### 需求 5 — 抽离后必须通过验证

**用户故事**: 作为本次拆分的最后一道防线,我希望抽离的代码经过自动化验证。

#### 验收标准

1. WHEN 抽离完成 THEN `node --check app/pages/chat/chat.js` 必须无错误。
2. WHEN 抽离完成 THEN `node --check app/pages/chat/modules/system-message.js` 必须无错误。
3. WHEN 抽离完成 THEN `node .tools/integration_test.js` 必须通过(若已有相关用例)。
4. WHEN 提交 commit THEN 必须独立 commit,不混任何 fix/feat,使用中文 commit message。

## 非功能要求

- chat.js 行数应有 -300 到 -500 行的下降(粗估)。
- 不修改任何现有调用点 — 全部通过 chat.js 内的薄壳兼容。
- 业务行为零变化是硬约束,任何疑似行为变化必须立即停止并向用户说明。

## 不在本 spec 范围

- 调用方迁移 (`this.addSystemMessage` → `SystemMessage.add(this, ...)`)
- 历史 bug 修复(如 B 端系统消息偶发重复 — 与重构解耦)
- 其他 4 个 P2 模块(`identity-resolver` / `participant-listener` / `title-controller` / `burn-after-read`)
