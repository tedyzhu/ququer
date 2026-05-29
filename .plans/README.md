# `.plans/` 历史文档归档

> 本目录是项目早期(P0 之前)的零散修复 / 调试 / 部署文档归档。
> **所有文件都是只读历史足迹,不再维护。**

## 不要在这里找当前文档

正式的工程文档与阶段交付都在 [`/docs/`](../docs/) 下,从 `docs/README.md` 入口:

- 当前 chat.js 状态、模块全景、关键边界:[`/docs/P3-Summary.md`](../docs/P3-Summary.md)
- 测试套件全景与设计模式:[`/docs/P5-Summary.md`](../docs/P5-Summary.md)
- 跨阶段索引与速查:[`/docs/README.md`](../docs/README.md)

## 这里有什么

`.plans/archive/` 共 **176 个历史 markdown 文档**,按主题大致分布如下(同一文件可能涉及多个主题):

### 按修复主题分组

| 主题 | 大致数量 | 说明 |
| --- | --- | --- |
| **身份识别 / 身份误判**(A 端 / B 端区分) | ~20 | 邀请方与接收方在同一微信号测试时的身份混淆问题。**已在 P3 抽离 `identity-resolver` + `identity-utils` 后稳定**,关键决策见 P3-Summary § 关键边界发现 |
| **聊天标题显示** | ~30 | 双端标题昵称、占位符替换、动态刷新等。**已抽离 `title-controller` 模块** |
| **系统消息**(创建/加入/重复/B 端过滤) | ~25 | "您创建了私密聊天" / "XX 加入聊天" / "加入 XX 的聊天" 三种格式的去重与 B 端过滤。**已抽离 `system-message` 模块** |
| **阅后即焚 / 消息销毁** | ~15 | 倒计时、淡出、彻底删除、历史消息回流。**已抽离 `burn-after-read` 模块** |
| **消息收发 / 监听器**(watcher / polling) | ~20 | 实时监听漏消息、轮询冷却、双端同步。**已抽离 `message-listener` + `message-fetch` + `message-polling` 模块** |
| **参与者列表 / 去重** | ~10 | 重复参与者、字符串/对象格式混存、智能选择对方。**已抽离 `participant-listener` 模块** |
| **邀请链接 / 分享流程** | ~15 | createInvite 弃用、URL 参数解析、邀请匹配。**已抽离 `share-utils` + `join-by-invite` 模块** |
| **云函数部署 / 修复** | ~25 | createChat / sendMessage / getMessages / joinByInvite / updateConversationParticipants 等部署指南 |
| **真机调试 / 启动失败 / 死循环** | ~10 | 紧急启动修复、模拟器死循环、真机调试通道。**真机调试通道目前仍未恢复,是最大痛点(见 P5-Summary § P6 候选)** |
| **测试 / 验证** | ~10 | 测试用例、验证方案、控制台测试 |

### 命名前缀含义

- `HOTFIX-v1.3.X-...` — 旧版本 hotfix 补丁记录(共 70+ 个)
- `BUGFIX-...` — 一般 bug 修复
- `CRITICAL-...` / `URGENT-...` / `EMERGENCY-...` / `ULTIMATE-...` — 紧急修复(标题语气强烈)
- `FINAL-...` — 当时认为是最终版本(实际后续仍有 hotfix 跟进)
- `FEATURE-...` — 功能新增 / 优化
- `DEBUG-...` — 调试方案
- `PLAN-...` — 早期方案规划
- 中文命名(无前缀) — 早期临时记录

## 为什么不删除

P0 阶段已经把这些文件归档到 `archive/` 而不是删除,理由是:

1. 它们记录了 v1.3.x 系列每一次紧急修复的**问题分析与决策路径**,是排查回归问题的历史证据
2. 这些 hotfix 在 P3 模块化时被全部消化为 `app/pages/chat/modules/*` 中的稳定实现
3. 即使将来有相似的 bug 出现,也可以通过这里的历史报告快速定位"上一次是怎么解决的"

如果未来确认某主题确实彻底过时,可以**整个主题批量删除**(而不是逐条删)。

## 找不到想要的?

- 当前的设计文档:`docs/P*-Summary.md`
- 模块源码注释:`app/pages/chat/modules/*.js`(P3 抽离时每个模块都加了详细 JSDoc)
- 静态测试用例:`.tools/*_test.js`(描述了每个模块的预期行为)
- git 历史:`backup/before-p0-cleanup` 分支保留了 P0 清理前的所有原始内容
