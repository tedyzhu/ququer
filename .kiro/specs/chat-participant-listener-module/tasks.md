# 实现任务: chat-participant-listener 模块抽离 — ✅ 完成

> 基于 design.md。
> 工作分支: `refactor/p2-participant-listener`
> **完成时间: 2026-05-26**

## 任务清单

- [x] 1. 创建 `modules/participant-listener.js` 骨架 + chat.js 顶部 require + onLoad attach
- [x] 2. 抽离 `getOtherParticipantRealName` + `retryGetRealInviterName`
- [x] 3. 抽离 `fetchChatParticipants`
- [x] 4. 抽离 `cleanupDuplicateParticipants`
- [x] 5. 抽离 `deduplicateParticipants`
- [x] 6. 抽离 `startWatchingForNewParticipants`
- [x] 7. 抽离 `startParticipantListener`(582 行)
- [x] **新增** 抽离 `fetchChatParticipantsWithRealNames`(async 函数 642 行)
- [x] 8. 集成测试新增 ParticipantListener 检查项
- [x] 9. 更新 docs

## 重要修正:`fetchChatParticipantsWithRealNames` 不是死引用

design 阶段误判此方法不存在(因为 grep 模式没匹配 `async function`),实际上它**确实存在**于 chat.js 第 2850 行,是个 642 行的 async 方法。本次抽离已正确处理。

## 实际成效

| 项 | 起点 | 终点 | 变化 |
| --- | --- | --- | --- |
| chat.js 行数 | 9561 | 7719 | **-1842 (-19.3%)** |
| 累计变化 | 15500 | 7719 | **-50.2%** |
| 新模块 | — | `modules/participant-listener.js` 1909 行 | 含完整注释 |
| 抽离方法数 | — | **8 个** | 含 642 行的 fetchChatParticipantsWithRealNames |

附加收益:
- **chat.js 突破 50% 减幅**,行数已不足原始一半
- 这是 P2 单刀最大幅度削减
- 参与者监听 + 真实昵称获取 + 去重 三个高度耦合的子系统首次完全独立

## 验证基线

- ✅ `node --check` 通过
- ✅ `.tools/integration_test.js` 6/6 通过(新增 `ParticipantListener.attach 挂上 9 个方法` 检查项)
- ⏳ 模拟器 P0 路径验证 — 留给 PR 合并前(创建聊天 → B 端加入 → 标题刷新 → 系统消息添加)
