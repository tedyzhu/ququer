# 实现任务: chat-system-message 模块抽离

> 基于 design.md。每完成一项做一个 commit,出问题立刻 `git revert`。
> 工作分支: `refactor/p2-system-message`

## 任务清单

- [ ] 1. 创建 `modules/system-message.js` 骨架
  - 文件头注释 + `require('./chat-helpers.js')`(后面可能用到 isPlaceholderJoinMessage 等)
  - 空 `attach(page) { /* TODO */ }` + `module.exports = { attach }`
  - 跑 `node --check app/pages/chat/modules/system-message.js`

- [ ] 2. 抽离 `addSystemMessage` 与 `startSystemMessageFade`
  - 复制函数体到 system-message.js,改为 `function xxx(...)` 顶层函数
  - 内部 `this.startSystemMessageFade(...)` 等保持原样
  - 在 attach() 中绑定到 page
  - 在 chat.js 中**删除原方法定义**(6084-6294 行)
  - 在 chat.js onLoad 第一次进入处加 `SystemMessage.attach(this)`(临时位置,后面统一)
  - `node --check chat.js` + 集成测试

- [ ] 3. 抽离 `clearIncorrectSystemMessages` 与 `cleanupWrongSystemMessages`
  - 同上模式
  - chat.js 中删除原方法定义(2014-2044, 2454-2558)
  - `node --check` + 集成测试

- [ ] 4. 抽离 `fixAEndSystemMessage` 与 `fixBEndSystemMessage`
  - 同上模式
  - chat.js 中删除原方法定义(1898-2008)
  - `node --check` + 集成测试

- [ ] 5. 抽离 `addCreatorSystemMessage` 并合并重复定义
  - 仅保留 2898 版(2049 版是死代码)
  - 在 system-message.js 中只放一份
  - chat.js 中删除两处定义(2049-2068 + 2898-2922)
  - 提交信息明确:"refactor: 抽离 addCreatorSystemMessage 并删除 2049 行重复定义"
  - `node --check` + 集成测试

- [ ] 6. 抽离 `enforceSystemMessages` 与 `normalizeSystemMessagesAfterLoad`
  - 同上模式
  - chat.js 中删除原方法定义(3061-3226)
  - `node --check` + 集成测试

- [ ] 7. 抽离 `updateSystemMessageAfterJoin`(最大头,298 行)
  - 同上模式;函数内会调用 `this.fetchChatParticipantsWithRealNames(...)` 等其他 chat.js 方法,**保持 this 调用不变**
  - chat.js 中删除原方法定义(2120-2417)
  - `node --check` + 集成测试

- [ ] 8. 抽离 `performBEndSystemMessageCheck`(140 行)
  - 同上模式
  - chat.js 中删除原方法定义(11742-11881)
  - `node --check` + 集成测试

- [ ] 9. 整理 attach 调用点
  - 把 step 2 临时加的 `SystemMessage.attach(this)` 移到 onLoad 起始(在身份判定之前)
  - 移除 chat.js 顶部 require 区可能多余的旧引用
  - `node --check` + 集成测试

- [ ] 10. 更新 docs 与最终验证
  - 更新 `docs/P1-Progress.md`(移除 system-message 项,新增"已完成"段)
  - 在模拟器跑 P0 路径(创建聊天 + 收发消息 + 阅后即焚)
  - 提交 PR `refactor/p2-system-message → main`

## 验证基线

- `.tools/integration_test.js` 必须保持 6/6 通过
- chat.js 行数预期从 11922 下降到约 10833(-9.1%)
- 新增 `app/pages/chat/modules/system-message.js` 约 1100 行(含注释)

## 出错回滚

每个 commit 都是单一职责。如果某步集成测试失败:
1. `git diff HEAD~1` 看 diff
2. 修不动就 `git reset --hard HEAD~1` 回到上一步
3. 重新做这一步,把 chunk 拆得更小
