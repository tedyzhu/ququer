# P3 阶段总结

> 完成时间:2026-05-28
> 状态:✅ 主要工作完成,转入 P4 候选评估

## 一句话总结

把 `app/pages/chat/chat.js` 从 P2 末的 5948 行进一步压缩到 **2237 行**(P3 减 -3711 行,**-62.4%**)。
整体相比 P0 起点 15500 行减少 **-85.6%**。新增 8 个模块,共有 20 个子模块,合计 13296 行可读性大幅改善。

## 累计成果

```
chat.js:    15500 → 2237  (-13263 行,整体 -85.6%)
P3 阶段:     5948 → 2237  (-3711 行,-62.4%)
模块数:     12 → 20
PR 数量:    18 个独立 PR(#3-#20)
测试用例:   ~187(集成测试 6 套 + 静态测试)
```

## P3 阶段 PR 清单

按时间顺序:

| PR | 标题 | chat.js | 备注 |
| --- | --- | --- | --- |
| #3 | 准备工作:文档同步 + 死代码 + 测试基础设施 | 5948 → 5725 | 测试基线建立 |
| #4 | identity-resolver 阶段 1(URL 参数解析) | 5725 → 5682 | 渐进抽离开端 |
| #5 | identity-resolver 阶段 2ab(URL 预检测 + 创建者证据) | 5682 → 5602 | |
| #6 | identity-resolver 阶段 2c(isChatCreator 决策合成) | 5602 → 5590 | |
| #7 | identity-resolver 阶段 5(onLoad 后处理 hooks) | 5590 → 5537 | 跳过阶段 4,先做阶段 5(更稳) |
| #8 | identity-resolver 阶段 4(身份分支动作) | 5537 → 5421 | |
| #9 | identity-resolver 阶段 3(身份决议 + 标题) | 5421 → 5260 | identity-resolver 大头收尾 |
| #10 | message-listener 抽离(实时消息监听) | 5260 → 4853 | |
| #11 | message-fetch 抽离(消息拉取 fetchMessages + fetchMessagesAndMerge) | 4853 → 4078 | -775,二线最大削减 |
| #12 | participant-infer 抽离(参与者推断兜底) | 4078 → 3884 | 边界发现:wxml 绑定不可抽 |
| #13 | join-by-invite 抽离(B 端加入流程) | 3884 → 3549 | |
| #14 | recovery-tools 抽离(12 应急修复方法) | 3549 → 2672 | **-877,P3 单 PR 最大** |
| #15 | message-polling 抽离(消息轮询备用) | 2672 → 2565 | |
| #16 | system-message-cleanup(2 清理方法合并) | 2565 → 2485 | |
| #17 | db-helpers 抽离(4 db 写入 helper) | 2485 → 2385 | |
| #18 | docs 同步 + 死代码 updateTitleWithRealNickname | 2385 | 文档收尾 |
| #19 | keyboard 抽离(软键盘监听) | 2385 → 2303 | |
| #20 | mock-messages 合并到 message-fetch | 2303 → 2237 | 接近极限 |

## 关键边界发现

### wxml `bindXxx` 绑定的方法不能用 attach 模式

PR #12 时尝试抽 `sendMessage`(wxml `bindconfirm` 绑定)失败,原因:
- 小程序 Page 注册时会快照属性
- attach 是 onLoad 时挂载,wxml 绑定运行时找不到方法

**后续对策**:
- 抽离前先 `grep -E '"(\w+)"' app/pages/chat/chat.wxml` 检查
- wxml 绑定的方法保留在 chat.js Page 对象中
- 当前不可抽方法列表:`sendMessage` / `onShow` / `onMessageTap` / `onMessageLongTap` / `onInputFocus` / `onInputBlur` / `onInputChange` / `showChatMenu` / `openEmojiPicker` / `preventPageScroll`

### 死分支保留(不修业务)

PR #9 抽 `resolveFinalIdentity` 时发现 `if (isActualCreator && finalIsFromInvite)` 是死分支
(因 `hasValidInviteEvidence` 计算中已 `&& !isActualCreator`,`isActualCreator=true` 时 `finalIsFromInvite` 必为 false)。
P3 原则保持业务行为零变化,该死分支保留。

### `attach` 模式 + JSDoc 多行 `*/` 转义陷阱

PR #14 时 `recovery-tools` 模块 JSDoc 中含 `restart*/recreate*` 字符,被 JS 解析器当作 `*/` 终结 JSDoc。
排查 1 次后用 `restart_/recreate_` 替代。

## 接近极限:为什么 P3 在此停手

剩余 chat.js 2237 行的构成:
- `onLoad` 646 行 — P3#1 阶段 2d 内 ~80 行(异步副作用 + 多 let 重写 + 矛盾 hotfix)主动放弃
- wxml 绑定方法 ~660 行 — 不可抽
- 与 wxml 绑定方法紧耦合的 `showMessageError` 48 行
- 杂项小方法 ~50 行(<20 行 / 个,3 行薄壳等)
- Page data 与配置(头部 ~180 行)

继续抽边际收益已显著降低,且 wxml 边界限制硬约束。

## 主动放弃的项

| 项 | 原因 |
| --- | --- |
| `identity-resolver` 阶段 2d | 高风险:async wx.cloud + 多个 `this.xxx` 副作用 + 多 let 重写,收益不抵成本 |
| 云函数 `joinByInvite` 478 行模块化 | 独立部署单位,模块化收益小;sanitize 双实现一致性已通过测试保证 |
| `debugUserDatabase` 云函数模块化 | 已加 dev guard 且前端入口已移除(PR #5) |

## P4 候选

| 候选 | 价值 |
| --- | --- |
| 静态测试加强 | 现 187 用例集中在 identity-resolver 与 chat-helpers,其他大模块覆盖薄弱 |
| 模块内技术债清理 | message-fetch 重复路径合并 / 时间戳归一化工具提取 |
| chat-debug-tools / recovery-tools 边界整理 | 两者职责模糊,可合并 |
| onLoad 阶段 2d(高风险) | 未抽的最后一块烂账,需要先有真机调试通道 |
| CI 集成 | run_all_tests.sh 接入 GitHub Actions,PR 自动跑 |

## 模块全景

```
app/pages/chat/modules/
├── chat-helpers.js         (281)  常量+纯函数
├── identity-utils.js       (166)  身份工具
├── destroyed-store.js      (106)  销毁存储
├── message-debug-hook.js   (152)  调试钩子
├── share-utils.js          (103)  分享
├── voice-recorder.js       (318)  语音
├── test-methods.js        (2017)  调试 API 23 个
├── system-message.js      (1396)  系统消息 15 方法
├── title-controller.js     (742)  标题控制 7 方法
├── burn-after-read.js      (433)  阅后即焚
├── participant-listener.js(1904)  参与者实时监听
├── chat-debug-tools.js    (1696)  调试工具 33 个
├── identity-resolver.js    (856)  onLoad 渐进抽离
├── message-listener.js     (444)  实时监听
├── message-fetch.js        (870)  消息拉取
├── participant-infer.js    (222)  参与者推断
├── join-by-invite.js       (367)  B 端加入
├── recovery-tools.js       (854)  12 应急修复
├── message-polling.js      (133)  消息轮询
├── db-helpers.js           (129)  db 写入
└── keyboard.js             (107)  软键盘
                          ───────
                          13296  总
```

## 测试套件

`bash .tools/run_all_tests.sh` — 6 个测试,共 187 用例:

| 测试 | 用例数 | 覆盖 |
| --- | --- | --- |
| `integration_test.js` | 结构性 | chat.js + 15 个 attach 模块的 require/attach 校验 |
| `chat_helpers_test.js` | 101 | 8 个纯函数 |
| `identity_resolver_test.js` | 50 | parseLoadOptions / cleanupStaleInviteInfo / 集成 |
| `identity_utils_test.js` | 33 | 身份判定 9 条决策路径 |
| `sanitize_participants_test.js` | 53 | joinByInvite + cleanTempUserData 双实现一致性 |
| `login_race_test.js` | 10 | app.ensureLogin 4 种时序场景 |
