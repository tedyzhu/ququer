# 实现任务: chat-system-message 模块抽离 — ✅ 完成

> 基于 design.md。每完成一项做一个 commit,出问题立刻 `git revert`。
> 工作分支: `refactor/p2-system-message`
> **完成时间: 2026-05-25**

## 任务清单

- [x] 1. 创建 `modules/system-message.js` 骨架
- [x] 2. 抽离 `addSystemMessage` 与 `startSystemMessageFade` (commit d290626)
- [x] 3. 抽离 `clearIncorrectSystemMessages` 与 `cleanupWrongSystemMessages` (commit 2dfc865)
- [x] 4. 抽离 `fixAEndSystemMessage` 与 `fixBEndSystemMessage` (commit c300f57)
- [x] 5. 抽离 `addCreatorSystemMessage` 并合并重复定义 (commit 5ae53cc)
- [x] 6. 抽离 `enforceSystemMessages` 与 `normalizeSystemMessagesAfterLoad` (commit d18979d)
- [x] 7. 抽离 `updateSystemMessageAfterJoin` (298 行,commit 9ba416c)
- [x] 8. 抽离 `performBEndSystemMessageCheck` (140 行,commit 28c9482)
- [x] 9. 整理 attach 调用点 — `SystemMessage.attach(this)` 已位于 onLoad 第 381 行
- [x] 10. 更新 docs 与最终验证

## 实际成效

| 项 | 起点 | 终点 | 变化 |
| --- | --- | --- | --- |
| chat.js 行数 | 11922 | 10790 | **-1132 (-9.5%)** |
| 新模块 | — | `modules/system-message.js` 1183 行 | 含完整注释 |
| 抽离方法数 | — | **11 个** | 含合并 1 处死代码 |

附加收益:**修复了 `addCreatorSystemMessage` 在 chat.js 中被定义两次的隐藏 bug** — 实际生效的是 v1.3.83 版,前者(行 ~2049)在原文件中被覆盖,等同死代码,本次抽离时已删除。

## 验证基线

- ✅ `node --check` 每步通过
- ✅ `.tools/integration_test.js` 6/6 通过(已更新支持 attach 模式)
- ⏳ 模拟器 P0 路径验证 — 留给下一次合并 PR 前手动跑一遍

## Commits 链(7 个)

```
28c9482 refactor(P2/system-message): 抽离 performBEndSystemMessageCheck
9ba416c refactor(P2/system-message): 抽离 updateSystemMessageAfterJoin
d18979d refactor(P2/system-message): 抽离 enforce + normalize 校正方法
5ae53cc refactor(P2/system-message): 抽离 addCreatorSystemMessage 并删除重复定义
c300f57 refactor(P2/system-message): 抽离 fixA/fixB 端修复方法
2dfc865 refactor(P2/system-message): 抽离两个清理方法
d290626 refactor(P2/system-message): 抽离 addSystemMessage 与 startSystemMessageFade
```
