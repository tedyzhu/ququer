# 实现任务: chat-debug-tools 模块抽离 — ✅ 完成

> 基于 design.md。
> 工作分支: `refactor/p2-chat-debug-tools`
> **完成时间: 2026-05-26**

## 任务清单

- [x] 1. 创建 `modules/chat-debug-tools.js` 骨架 + chat.js 顶部 require + onLoad attach
- [x] 2-6. 一并通过自动化脚本抽离 33 个调试方法
  - 写 `.tools/extract_debug_tools.py` 用精确 brace 配对识别方法范围
  - 批量提取并删除原方法
- [x] 7. 删除 `manuallyFixConnection` 第 5072 处死代码(双定义)
- [x] 8. 集成测试新增 ChatDebugTools 检查项
- [x] 9. 更新 docs

## 抽离的方法清单(33 个)

按类别:
- A. 调试菜单入口与子菜单(7): showIdentityFixDialog / fixIdentityToSender / fixSpecificUserNickname / quickTitleTest / testReceiverTitle / fullReceiverSimulation / realShareLinkTest
- B. 状态诊断与切换(5): diagnosisCurrentState / switchUserForTesting / testAsReceiver / testAsSender / simulateTwoPersonChat
- C. 调试用加入聊天(3): manualJoinExistingChat / showChatIdInput / joinSpecificChat
- D. 编译模式工具(2): generateCompileModeConfig / directJumpTest
- E. 紧急修复工具(2): emergencyFixUserIdentity / emergencyFixConnection
- F. 强制清理工具(5): burnAfterReadingCleanup / forceBurnAfterReadingCleanup / permanentDeleteAllMessages / batchDeleteMessages / localClearMessages
- G. 残留数据测试工具(3): cleanupStaleData / testNewChatMessageSending / testCleanupStaleData
- H. 在线状态(6): startOnlineStatusMonitor / stopOnlineStatusMonitor / updateUserOnlineStatus / startOnlineUsersWatcher / checkMutualOnlineStatus / enableRealTimeDestroy

## 实际成效

| 项 | 起点 | 终点 | 变化 |
| --- | --- | --- | --- |
| chat.js 行数 | 7719 | 5948 | **-1771 (-22.9%)** |
| 累计变化 | 15500 | 5948 | **-61.6%** |
| 新模块 | — | `modules/chat-debug-tools.js` 1696 行 | |
| 抽离方法数 | — | **33 个** | |

附加收益:
- **修复 manuallyFixConnection 双定义死代码 bug**(行 5072 处的版本被覆盖,本次删除)
- 写了一个可复用的 `extract_debug_tools.py` 脚本(精确 brace 配对),今后类似批量抽离可复用
- chat.js 调试入口 (showChatMenu / showMoreMenu) 中的 wx.showActionSheet 仍然有效:它们的 `this.xxx()` 回调在 attach 后照常工作

## 关键决策

**放弃硬抽 onLoad 身份判定逻辑**:
- onLoad 内 1095 行身份判定包含 ~20 个 HOTFIX 分支
- setData 副作用密集,无法做"零行为变化"抽离
- 改抽 33 个调试方法,收益相当(-1771 vs 预估 -1900)且风险极低

## 验证基线

- ✅ `node --check` 通过
- ✅ `.tools/integration_test.js` 6/6 通过(新增 `ChatDebugTools.attach 挂上 34 个方法` 检查项)
- ⏳ 模拟器 P0 路径验证 — 留给 PR 合并前
