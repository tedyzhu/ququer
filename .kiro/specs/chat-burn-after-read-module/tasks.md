# 实现任务: chat-burn-after-read 模块抽离 — ✅ 完成

> 基于 design.md。
> 工作分支: `refactor/p2-burn-after-read`
> **完成时间: 2026-05-26**

## 任务清单

- [x] 1. 创建 `modules/burn-after-read.js` 骨架
- [x] 2-6. 一并抽离 7 个方法(因互相调用紧密)
  - destroyMessage (4 行)
  - markMessageAsReadAndDestroy (13 行)
  - processOfflineMessages (49 行)
  - permanentlyDeleteMessage (85 行)
  - startDestroyCountdown (84 行)
  - startFadingDestroy (95 行)
  - clearAllDestroyTimers (9 行)
- [x] 7. chat.js 顶部 require + onLoad 调用 `BurnAfterRead.attach(this)`
- [x] 8. 集成测试新增 BurnAfterRead.attach 检查项
- [x] 9. 更新 docs

## 实际成效

| 项 | 起点 | 终点 | 变化 |
| --- | --- | --- | --- |
| chat.js 行数 | 9926 | 9561 | **-365 (-3.7%)** |
| 新模块 | — | `modules/burn-after-read.js` 433 行 | 含完整注释 |
| 抽离方法数 | — | **7 个** | |
| 缩进风格统一 | 3 空格(原) | 2 空格(模块) | 项目风格统一 |

附加收益:
- 新模块统一为 2 空格缩进,与项目其他模块一致
- 阅后即焚子系统首次具备独立可读性

## 验证基线

- ✅ `node --check` 通过
- ✅ `.tools/integration_test.js` 6/6 通过(新增 `BurnAfterRead.attach 挂上 8 个方法` 检查项)
- ⏳ 模拟器 P0 路径验证 — 留给 PR 合并前(发消息 → 倒计时 → 渐隐 → 删除)
