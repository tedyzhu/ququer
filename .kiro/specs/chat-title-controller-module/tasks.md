# 实现任务: chat-title-controller 模块抽离 — ✅ 完成

> 基于 design.md。每完成一项做一个 commit,出问题立刻 `git revert`。
> 工作分支: `refactor/p2-title-controller`
> **完成时间: 2026-05-26**

## 任务清单

- [x] 0. 补抽 `replaceCreatorMessageWithJoinMessage` 到 `system-message.js` (commit 7fc6fd8)
- [x] 1+2. 创建模块骨架 + 抽离 4 个 B 端方法 (commit a1dd911)
  - fetchRealInviterNameAndUpdateTitle (43 行)
  - updateReceiverTitleWithRealNames (131 行)
  - updateTitleForReceiver (105 行)
  - protectReceiverTitle (38 行)
- [x] 3. 抽离 3 个 A 端方法 (commit 7e76562)
  - updateDynamicTitleWithRealNames (139 行)
  - updateTitleWithRealNickname (58 行)
  - updateDynamicTitle (196 行)
- [x] 4. 整理 attach 调用点 — 在 onLoad 紧跟 SystemMessage.attach
- [x] 5. 更新 docs 与最终验证

## 实际成效

| 项 | 起点 | 终点 | 变化 |
| --- | --- | --- | --- |
| chat.js 行数 | 10790 | 9926 | **-864 (-8.0%)** |
| 新模块 | — | `modules/title-controller.js` 700+ 行 | 含完整注释 |
| 抽离方法数 | — | **7 个** | + 1 个补抽到 system-message |

附加收益:
- 把 P2 第一刀漏掉的 `replaceCreatorMessageWithJoinMessage` 补抽到 system-message,职责干净
- chat.js 突破万行大关(9926),累计减幅 -36.0%

## 验证基线

- ✅ `node --check` 每步通过
- ✅ `.tools/integration_test.js` 6/6 通过(已新增 `TitleController.attach 挂上 8 个方法` 检查项)
- ⏳ 模拟器 P0 路径验证 — 留给 PR 合并前

## Commits 链(3 个)

```
7e76562 refactor(P2/title-controller): 抽离 3 个 A 端标题方法
a1dd911 refactor(P2/title-controller): 抽离 4 个 B 端标题方法
7fc6fd8 refactor(P2/system-message): 补抽 replaceCreatorMessageWithJoinMessage
```
