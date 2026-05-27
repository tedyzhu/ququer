# identity-resolver 模块抽离 — Tasks

阶段 1 实施顺序(从下到上):

- [ ] 1. 创建 `modules/identity-resolver.js` 骨架
  - 1.1 文件头 JSDoc 说明本模块为多阶段拆分,本文件先承载阶段 1
  - 1.2 require chat-helpers
  - 1.3 module.exports 占位 3 个空函数

- [ ] 2. 实现 `parseLoadOptions(options)` 纯函数
  - 2.1 解析 `chatId / inviter / userName`(直接取 options 对应字段)
  - 2.2 计算 `isNewChat`:`isNewChat === 'true' || isNewChat === true || action === 'create' || (!options.id && !chatId)`
  - 2.3 fallback chatId:`options.contactId || options.chatId || \`chat_${Date.now()}_<rand>\``
  - 2.4 保留所有 console.log 与原 chat.js 一致

- [ ] 3. 实现 `cleanupStaleInviteInfo(page, inviteInfo, options, inviter)` 副作用函数
  - 3.1 当 inviteInfo 不存在或无 inviteId 时,直接返回 `{ inviteInfo: null, inviter }`
  - 3.2 计算时间差,>10min 时调 `app.clearInviteInfo()` 并返回 `{ inviteInfo: null, inviter: null }`
  - 3.3 时间差 ≤10min 但 `options.inviter` 与 `options.fromInvite` 都缺失时同样清理
  - 3.4 否则保留

- [ ] 4. 实现 `prepareLoadContext(page, options)` 入口函数
  - 4.1 调 `parseLoadOptions(options)` 取得基础字段
  - 4.2 读 `app.getStoredInviteInfo()`
  - 4.3 调 `cleanupStaleInviteInfo(...)` 处理 inviteInfo
  - 4.4 返回完整 LoadContext 对象,字段命名与 chat.js 现有 `let` 变量一致

- [ ] 5. 改造 chat.js onLoad
  - 5.1 顶部 require `IdentityResolver`
  - 5.2 替换行 471-525 为对 `prepareLoadContext` 的一次调用
  - 5.3 用 `let` 解构以保留后续 if 分支重新赋值的能力
  - 5.4 保留 `userInfo` 行不动(后续阶段需要)
  - 5.5 `node --check` 验证

- [ ] 6. 新增测试 `.tools/identity_resolver_test.js`
  - 6.1 覆盖 parseLoadOptions 7 种 options
  - 6.2 覆盖 cleanupStaleInviteInfo 5 种场景
  - 6.3 集成 prepareLoadContext 3 种典型路径
  - 6.4 单独运行通过

- [ ] 7. 更新 `.tools/run_all_tests.sh` 包含新测试

- [ ] 8. 全面验证
  - 8.1 `bash .tools/run_all_tests.sh` 全过(6 个测试)
  - 8.2 `node --check chat.js` + 模块语法过

- [ ] 9. 提交与文档更新
  - 9.1 更新 `docs/P1-Progress.md` 加入 P3 阶段记录
  - 9.2 独立 commit,中文 message:`refactor(P3/identity-resolver-stage1): 抽离 onLoad 参数解析与邀请清理(55 行)`

## 完成标准

- chat.js 减 ~55 行(预计 5725 → 5670)
- `identity-resolver.js` 新增 ~150 行(含 JSDoc)
- `.tools/identity_resolver_test.js` 新增,>20 用例
- run_all_tests.sh 全过(6 个测试)
- 单独 commit,行为等价

## 后续阶段(不在本 spec 范围)

- **阶段 2**:抽 onLoad 行 526-1010(身份判定核心 485 行)
- **阶段 3**:抽 onLoad 行 1011-1280(身份决议 + 标题 270 行)
- **阶段 4**:抽 onLoad 行 1281-1410(分支动作 130 行)
- **阶段 5**:抽 onLoad 行 1411-1477(后处理 67 行)
