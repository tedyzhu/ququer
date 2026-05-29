# Requirements Document

## Introduction

本规格针对微信小程序"秘信(蛐曲儿)"阅后即焚聊天 App 的聊天页标题显示逻辑做**根因性治理**,而非继续打补丁。

标题显示模块(`title-controller.js`)从 v1.3.1 一路 hotfix 到 v1.3.94,累计约 30 个标题相关修复文档,反复回归。三层根因已确认:

- **根因 1(可低风险收敛)**:占位符昵称黑名单在 5 处散落硬编码、各不相同(`title-controller.js` 3 处、`join-by-invite.js` 1 处、`participant-listener.js` 1 处),与权威定义 `chat-helpers.isPlaceholderNickname()` 不一致,导致同一昵称在不同代码路径被分别判为占位符与真名,标题在两套逻辑间抖动。
- **根因 2(本规格不直接改)**:身份判定与标题刷新是两套时序耦合状态机,当前靠 `protectReceiverTitle` 轮询兜底。本规格不修改该业务决策逻辑(高风险、无真机验证)。
- **根因 3(本规格核心)**:`title-controller.js` 是唯一没有专测的核心模块,P4/P5 测试加固时因"依赖太多 page 上下文"被降级跳过,每次改动只能靠真机验证,而真机调试通道不通,因此反复回归。

本规格聚焦三个目标,所有改动以"**业务行为零变化**"为硬约束:

1. 为 `title-controller.js` 的 6 个对外方法建立**标题决策行为回归测试覆盖矩阵**(单人/双人/多人 × A 端/B 端 × 真名/占位符),把 P4/P5 跳过的那块固化下来。
2. 把 5 处散落的占位符黑名单**收敛**到权威的 `chat-helpers.isPlaceholderNickname()`。
3. 提供**零行为变化保证**机制:先用测试固化现状,再做收敛,收敛后测试仍须全绿。

本规格明确**不包含**:修改任何标题业务决策逻辑、移除或重写 `protectReceiverTitle` 轮询机制、调整身份判定时序、新增标题显示功能。

## Glossary

- **Title_Controller**: 聊天页标题刷新子系统,即 `app/pages/chat/modules/title-controller.js`,通过 `attach(page)` 把 6 个方法绑定到 Page 实例,运行时 `this === page`。
- **Title_Decision**: Title_Controller 某个方法在给定输入(参与者列表、当前用户、身份标记、URL 参数等)下计算出的最终标题字符串(写入 `dynamicTitle` / 导航栏的值)。
- **Title_Decision_Matrix**: 标题决策的输入维度组合及其对应期望输出的集合,维度为「参与者人数(单人/双人/多人)× 端身份(A 端发送方/B 端接收方)× 对方昵称类型(真名/占位符)」。
- **Placeholder_Detector**: 权威占位符判定纯函数 `chat-helpers.isPlaceholderNickname(name)` 及其黑名单常量 `PLACEHOLDER_NICKNAMES`。
- **Placeholder_Nickname**: 不应进入最终标题的昵称,由 Placeholder_Detector 判定为 true 的昵称(包括空值、`PLACEHOLDER_NICKNAMES` 列表项、形如 `用户_xxx` / `user_xxx` 的模式)。
- **Real_Nickname**: Placeholder_Detector 判定为 false 的昵称,即用户的真实昵称。
- **Divergent_Blacklist**: 散落在 Title_Controller、`join-by-invite.js`、`participant-listener.js` 中、独立于 Placeholder_Detector 的硬编码占位符判定代码(数组 `includes` 比较、逐项 `===` 比较、或对标题字符串的 `includes` 子串判断),本规格需收敛的 5 处。
- **Authoritative_Title_Rules**: 权威标题显示规则(来源 `.plans/archive/聊天标题显示规则说明.md`):单人态显示用户自己昵称;双人态显示「我和[对方真实昵称](2)」;多人态(3+)显示「群聊(N)」;占位符昵称不进入标题。
- **Title_Regression_Suite**: 本规格新增的 Title_Controller 行为回归测试文件,放置于 `.tools/`,采用项目既有的 fakePage + `attach` 纯 Node 静态测试模式。
- **Test_Runner**: 一键测试入口脚本 `.tools/run_all_tests.sh`,以及接入的 CI(`.github/workflows/ci.yml`)。
- **Behavior_Change**: 在相同输入下,Title_Controller 产出的 Title_Decision 相对收敛前发生的可观测变化。
- **A_Side**: 聊天创建者(发送方),`isFromInvite` 为假。
- **B_Side**: 通过邀请链接加入者(接收方),`isFromInvite` 为真。

## Requirements

### Requirement 1: 标题决策行为基线固化(回归测试覆盖矩阵)

**User Story:** 作为维护该 App 的开发者,我希望把 Title_Controller 当前的标题决策行为用回归测试固化成基线,以便后续任何改动都能在纯 Node 测试中被验证,不再依赖不通的真机调试通道。

#### Acceptance Criteria

1. THE Title_Regression_Suite SHALL 覆盖 Title_Controller 的 6 个对外方法:`updateDynamicTitle`、`updateDynamicTitleWithRealNames`、`updateTitleForReceiver`、`updateReceiverTitleWithRealNames`、`fetchRealInviterNameAndUpdateTitle`、`protectReceiverTitle`。
2. THE Title_Regression_Suite SHALL 采用项目既有的 fakePage + `attach(page)` 模式,以纯 Node 静态测试运行,不依赖微信小程序真机或模拟器运行时。
3. WHEN 参与者为单人态且环境为 A_Side,THE Title_Regression_Suite SHALL 断言 `updateDynamicTitle` 与 `updateDynamicTitleWithRealNames` 产出的 Title_Decision 为当前用户昵称(无昵称时为「我」)。
4. WHEN 参与者为单人态且环境为 B_Side,THE Title_Regression_Suite SHALL 断言产出的 Title_Decision 为「我和[兜底昵称](2)」格式。
5. WHEN 参与者为双人态且对方昵称为 Real_Nickname,THE Title_Regression_Suite SHALL 断言产出的 Title_Decision 为「我和[对方真实昵称](2)」。
6. WHEN 参与者为双人态且对方昵称为 Placeholder_Nickname,THE Title_Regression_Suite SHALL 断言 A_Side 保持当前用户昵称、B_Side 使用「我和[兜底昵称](2)」,并断言触发真名异步获取调用。
7. WHEN 参与者为多人态(3 人及以上且未超过去重阈值)且未命中其它前置分支(如双人态保持、去重),THE Title_Regression_Suite SHALL 断言产出的 Title_Decision 为「群聊(N)」格式,其中 N 为参与者人数。
8. WHEN 参与者人数超过去重阈值(当前实现 `updateDynamicTitleWithRealNames` 的阈值为 2、`updateDynamicTitle` 的阈值为 3),THE Title_Regression_Suite SHALL 断言触发去重处理;在去重过程中产出临时标题格式属于当前实现的允许行为,固化时以当前实现实际产出为基线。
8.1 WHERE 去重阈值为 1 的代码路径,THE Title_Regression_Suite SHALL 允许去重在双人态(2 人)即触发,并以当前实现实际产出为固化基线,而非假定去重仅对 3 人及以上生效。
9. WHEN B_Side 标题被锁定(`receiverTitleLocked` 为真)后调用 `updateDynamicTitleWithRealNames`,THE Title_Regression_Suite SHALL 断言转交 `updateReceiverTitleWithRealNames` 处理。
10. WHEN `updateTitleForReceiver` 接收到经 URL 编码的邀请者昵称,THE Title_Regression_Suite SHALL 断言完成 URL 解码并产出「我和[解码后昵称](2)」格式的 Title_Decision。
11. WHEN `fetchRealInviterNameAndUpdateTitle` 收到云函数 `getChatParticipants` 返回的对方 Real_Nickname,THE Title_Regression_Suite SHALL 断言以该真名更新 Title_Decision。
12. WHEN `protectReceiverTitle` 检测到标题被改成不符合「我和X(2)」格式的值,THE Title_Regression_Suite SHALL 断言其将标题恢复为传入的正确标题。
13. WHERE 某个对外方法依赖外部异步链或 page 上下文无法在纯 Node 环境完整复现,THE Title_Regression_Suite SHALL 在测试文件注释中记录该方法被部分覆盖或跳过的范围与原因。

### Requirement 2: 标题决策矩阵以权威规则为期望基准

**User Story:** 作为开发者,我希望回归测试的期望值锚定到权威标题显示规则,以便测试既能固化正确行为,又能暴露出当前实现里偏离权威规则的边界差异。

#### Acceptance Criteria

1. THE Title_Regression_Suite SHALL 以 Authoritative_Title_Rules 作为各 Title_Decision 期望输出的判定基准。
2. WHERE Title_Controller 当前实现产出的 Title_Decision 与 Authoritative_Title_Rules 一致,THE Title_Regression_Suite SHALL 将该结果固化为通过用例。
3. IF Title_Controller 当前实现在某输入组合下产出的 Title_Decision 与 Authoritative_Title_Rules 不一致,THEN THE Title_Regression_Suite SHALL 记录该差异,并在 requirements 评审或设计阶段交由用户决定该差异是固化为现状还是纳入修正范围。
4. THE Title_Decision_Matrix SHALL 显式枚举「参与者人数(单人/双人/多人)× 端身份(A_Side/B_Side)× 对方昵称类型(Real_Nickname/Placeholder_Nickname)」的全部有效组合及其期望输出。
5. WHEN 对方昵称为 Placeholder_Nickname,THE Title_Regression_Suite SHALL 断言该占位符不出现在最终 Title_Decision 中(应被兜底昵称替换或触发真名获取)。

### Requirement 3: 占位符黑名单收敛到权威定义

**User Story:** 作为开发者,我希望把 5 处散落且互不一致的占位符黑名单统一收敛到 `chat-helpers.isPlaceholderNickname()`,以便消除"同一昵称在不同路径判定不同"的根因。

#### Acceptance Criteria

1. THE Placeholder_Detector(`chat-helpers.isPlaceholderNickname`)SHALL 作为占位符昵称判定的唯一权威来源。
2. WHERE 代码需要判定一个昵称是否为占位符,THE Title_Controller SHALL 调用 Placeholder_Detector,而非内联硬编码数组或逐项比较。
3. WHEN 收敛 `join-by-invite.js` 中的 Divergent_Blacklist,THE join-by-invite 模块 SHALL 改为调用 Placeholder_Detector 完成占位符判定。
4. WHEN 收敛 `participant-listener.js` 中逐项 `===` 比较形式的 Divergent_Blacklist,THE participant-listener 模块 SHALL 改为调用 Placeholder_Detector 完成占位符判定。
5. THE 治理范围 SHALL 覆盖全部 5 处 Divergent_Blacklist:`title-controller.js` 的 3 处(含 1 处对标题字符串的子串 `includes` 判断)、`join-by-invite.js` 的 1 处、`participant-listener.js` 的 1 处。
5.1 IF 代码库实际存在多于 5 处占位符判定位置,但其中部分已调用 Placeholder_Detector,THEN THE 收敛 SHALL 仅处理 5 处 Divergent_Blacklist,已使用权威检测器的位置保持不变。
6. IF 某处 Divergent_Blacklist 是对**已组合标题字符串**(如「我和用户(2)」)而非单一昵称做判断,THEN THE 收敛方案 SHALL 采用与 Placeholder_Detector 语义对齐的方式处理(例如先从标题中提取对方昵称再判定),而非将整段标题直接传入面向单一昵称的 Placeholder_Detector。
7. WHEN 收敛完成,THE 代码库 SHALL 不再保留独立于 Placeholder_Detector 的占位符判定常量数组或内联比较。
7.1 WHEN 全部 5 处 Divergent_Blacklist 均已移除并改调 Placeholder_Detector,THE 收敛 SHALL 即视为完成,不要求黑名单移除以外的额外步骤作为完成前提。
8. WHERE 收敛后某处的占位符识别范围相对收敛前发生变化(例如原数组遗漏「新用户」而权威定义包含),THE 设计文档 SHALL 显式列出该变化点,交由用户确认其属于"修正根因 1 的预期收敛"还是需要保留旧行为。

### Requirement 4: 业务行为零变化保证

**User Story:** 作为对历史回归高度警惕的维护者,我希望收敛黑名单与新增测试都不改变 Title_Controller 的标题决策结果,以便这次治理不引入新的回归。

#### Acceptance Criteria

1. THE 本规格的所有改动 SHALL 限定在「新增测试」与「占位符判定收敛」两类,不修改 Title_Controller 的标题决策分支结构与判定阈值。
2. WHEN 占位符黑名单收敛完成,THE Title_Controller 对每个 Title_Decision_Matrix 组合产出的 Title_Decision SHALL 与 Authoritative_Title_Rules 保持一致,不引入未经用户确认的 Behavior_Change。
3. THE 工作顺序 SHALL 为:先建立 Title_Regression_Suite 固化基线并全部通过,再执行黑名单收敛。
4. WHEN 黑名单收敛完成后重跑 Title_Regression_Suite,THE Title_Regression_Suite SHALL 全部通过。
4.1 THE Title_Regression_Suite SHALL 作为 Behavior_Change 的判据:WHEN 收敛后全部回归用例通过,THE 治理流程 SHALL 视为未引入受测矩阵范围内的 Behavior_Change 并允许继续推进。
5. IF 收敛改动导致任一已固化的 Title_Decision 用例失败,THEN THE 治理流程 SHALL 停止收敛改动并将该差异上报用户决策,而非直接修改测试期望值使其通过。
6. THE 本规格 SHALL 不修改 `protectReceiverTitle` 的轮询兜底机制、身份判定时序逻辑及任何标题以外的业务行为。

### Requirement 5: 测试接入一键脚本与 CI

**User Story:** 作为开发者,我希望新增的标题回归测试接入既有测试套件与 CI,以便它在每次提交时自动运行,持续守护标题行为。

#### Acceptance Criteria

1. WHEN Title_Regression_Suite 创建完成,THE Test_Runner 脚本 `.tools/run_all_tests.sh` SHALL 包含对该测试文件的执行调用。
2. THE Test_Runner SHALL 在其测试计数(当前为 18 个测试)与编号中纳入 Title_Regression_Suite。
3. WHEN CI 流水线运行 `.tools/run_all_tests.sh`,THE CI SHALL 执行 Title_Regression_Suite 并在其断言失败时标记构建失败。
3.1 WHERE CI 因非断言原因失败(如脚本错误、依赖缺失、环境/基础设施问题或超时),THE CI SHALL 允许构建失败;但本规格仅强制要求"断言实际失败时构建失败",不要求把所有非断言失败都归类为断言失败。
4. WHEN 全部静态测试运行结束,THE Test_Runner SHALL 输出包含 Title_Regression_Suite 在内的全部测试通过结果。
5. THE Title_Regression_Suite 的输出格式 SHALL 与既有测试文件保持一致(PASS/FAIL 逐用例打印,便于在 CI 日志中定位失败用例)。
