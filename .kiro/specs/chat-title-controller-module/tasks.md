# 实现任务: chat-title-controller 模块抽离

> 基于 design.md。每完成一项做一个 commit,出问题立刻 `git revert`。
> 工作分支: `refactor/p2-title-controller`

## 任务清单

- [ ] 0. (前置)补抽 `replaceCreatorMessageWithJoinMessage` 到 `system-message.js`
  - 这是 P2 第一刀漏抽的纯系统消息方法(行 2327-2442,116 行)
  - 移到 system-message.js,attach 时绑定到 page
  - chat.js 中删除原方法
  - `node --check` + 集成测试

- [ ] 1. 创建 `modules/title-controller.js` 骨架
  - 文件头注释 + `require('./chat-helpers.js')`(可能用 formatTime 等)
  - 空 attach + module.exports

- [ ] 2. 抽离 4 个 B 端方法
  - `fetchRealInviterNameAndUpdateTitle` (43 行)
  - `updateReceiverTitleWithRealNames` (131 行)
  - `updateTitleForReceiver` (105 行)
  - `protectReceiverTitle` (38 行)
  - `node --check` + 集成测试

- [ ] 3. 抽离 3 个 A 端方法
  - `updateDynamicTitleWithRealNames` (139 行)
  - `updateTitleWithRealNickname` (58 行)
  - `updateDynamicTitle` (196 行)
  - `node --check` + 集成测试

- [ ] 4. 整理 attach 调用点
  - 在 onLoad 中加 `TitleController.attach(this)`,紧跟 `SystemMessage.attach(this)`
  - 集成测试新增检查 TitleController.attach

- [ ] 5. 更新 docs 与最终验证
  - 更新 `docs/P1-Progress.md`
  - 推送 + 创建 PR

## 验证基线

- `.tools/integration_test.js` 保持通过
- chat.js 行数从 10790 降到 ~10080(-710 行)
- 新增 `app/pages/chat/modules/title-controller.js` ~750 行(含注释)

## 出错回滚

每个 commit 都是单一职责,失败立即 `git revert HEAD` 或 `git reset --hard HEAD~1`。
