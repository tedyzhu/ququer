# Requirements Document

## Introduction

本规格对微信小程序"秘信(蛐曲儿)"阅后即焚聊天 App 的**系统消息格式判定与 B 端过滤逻辑**做根因性治理,延续 title-display-hardening 的同构手法(抽取权威判定 + 收敛散落实现 + 回归测试固化),目标是消除"系统消息格式判定散落复制、跨路径不一致"的根因。

系统消息相关 hotfix 在历史上反复出现(v1.3.67 / v1.3.68 系列等,见 `.plans/archive/`),根因与标题问题同构但范围更大:

- **根因 1(核心)**:两类判定逻辑在多个文件**完整复制粘贴**:
  - **A 端加入格式判定** `/^.+加入聊天$/.test(c) && !/^加入.+的聊天$/.test(c)`(区分 A 端"XX加入聊天"与 B 端"加入XX的聊天")——出现在 message-fetch(4 处)、message-listener(3 处)、chat.js onShow(1 处)等 8+ 处。
  - **A 端系统消息识别** `content.includes('您创建了私密聊天') || includes('可点击右上角菜单分享链接邀请朋友加入') || includes('私密聊天已创建') || includes('分享链接邀请朋友') || (includes('创建') && includes('聊天')) || [A端加入格式]`——出现在 message-fetch、message-listener(3 处)等多处,且各副本的 OR 项**可能不完全一致**。
  - 后果:一旦判定规则需要调整(如新增一种 A 端文案),要同步改 6+ 处;漏改一处即跨路径行为不一致 → 反复 hotfix。
- **根因 2(本规格核心)**:这些过滤逻辑分布在消息拉取/监听这类核心数据路径上,P4/P5 虽给 message-fetch / message-listener 建了测试,但**没有针对"A 端格式判定 / A 端系统消息识别"这两个判定本身的细粒度边界测试**,改动只能靠真机验证,而真机调试通道不通。

本规格聚焦三个目标,以"**业务行为零变化**"为硬约束:

1. 把"A 端加入格式判定"与"A 端系统消息识别"两个判定抽取为 `chat-helpers.js` 的**权威纯函数**,并为其建立**纯函数级回归测试**(覆盖 A 端格式 / B 端格式 / 创建文案 / 各类边界)。
2. 把散落在 message-fetch / message-listener / chat.js 等处的**复制粘贴判定收敛**到权威纯函数。
3. 提供**零行为变化保证**:先用纯函数测试固化抽取后的判定语义(以现状各副本的并集/实际语义为基准),再逐处收敛,收敛后既有测试(当前 843 PASS)与新增测试须全绿。

本规格明确**不包含**:修改系统消息的添加/淡出/去重业务逻辑(那是 system-message.js 的职责,已有 30 用例覆盖)、改变 B 端过滤的产品策略(过滤哪些、保留哪些)、调整身份判定时序、修改云函数。

## Glossary

- **A_Side_Join_Format**: A 端加入系统消息格式,形如"XX加入聊天"(非"加入XX的聊天"),判定式为 `/^.+加入聊天$/.test(c) && !/^加入.+的聊天$/.test(c)`。
- **B_Side_Join_Format**: B 端加入系统消息格式,形如"加入XX的聊天",判定式为 `/^加入.+的聊天$/.test(c)`。
- **A_Side_System_Message**: A 端专属系统消息(B 端应过滤掉),包括创建文案("您创建了私密聊天""可点击右上角菜单分享链接邀请朋友加入""私密聊天已创建""分享链接邀请朋友"、含"创建"且含"聊天"的内容)与 A_Side_Join_Format。
- **Format_Detector**: 本规格新增的权威格式判定纯函数集合,放置于 `chat-helpers.js`,作为 A_Side_Join_Format / B_Side_Join_Format / A_Side_System_Message 判定的唯一来源。
- **Divergent_Filter**: 散落在 message-fetch.js / message-listener.js / chat.js 等处、独立于 Format_Detector 的复制粘贴判定代码,本规格需收敛的对象。
- **Filter_Regression_Suite**: 本规格新增的 Format_Detector 纯函数行为回归测试文件,放置于 `.tools/`,纯 Node 静态测试。
- **Test_Runner**: 一键测试入口 `.tools/run_all_tests.sh` 及接入的 CI(`.github/workflows/ci.yml`)。
- **Behavior_Change**: 相同输入下,收敛后某过滤路径产出(保留/过滤的消息集合)相对收敛前的可观测变化。
- **A_Side / B_Side**: A 端(创建者/发送方,`isFromInvite` 假)/ B 端(接收方,`isFromInvite` 真)。

## Requirements

### Requirement 1: 抽取权威格式判定纯函数

**User Story:** 作为维护者,我希望把散落复制的 A 端加入格式判定与 A 端系统消息识别抽取为 chat-helpers 的权威纯函数,以便所有路径共用同一份判定逻辑,消除"漏改一处即不一致"的根因。

#### Acceptance Criteria

1. THE Format_Detector SHALL 在 `chat-helpers.js` 中提供 `isASideJoinMessage(content)`,返回 content 是否为 A_Side_Join_Format(语义等价于 `/^.+加入聊天$/.test(c) && !/^加入.+的聊天$/.test(c)`)。
2. THE Format_Detector SHALL 在 `chat-helpers.js` 中提供 `isBSideJoinMessage(content)`,返回 content 是否为 B_Side_Join_Format(语义等价于 `/^加入.+的聊天$/.test(c)`)。
3. THE Format_Detector SHALL 在 `chat-helpers.js` 中提供 `isASideSystemMessage(content)`,返回 content 是否为 A_Side_System_Message(语义等价于现有各副本 OR 条件的并集)。
4. THE Format_Detector 的所有函数 SHALL 为纯函数(仅依赖入参 content,不读 page/wx/全局),对非字符串入参 SHALL 安全返回 false。
5. THE Format_Detector SHALL 通过 `chat-helpers.js` 的 `module.exports` 导出,供其它模块 `require` 调用。

### Requirement 2: 权威判定语义以现状并集为基准并经测试固化

**User Story:** 作为对历史回归警惕的维护者,我希望权威纯函数的语义精确锚定到现状各散落副本的实际语义(取并集),以便抽取不改变任何路径的过滤结果。

#### Acceptance Criteria

1. THE Filter_Regression_Suite SHALL 覆盖 `isASideJoinMessage` / `isBSideJoinMessage` / `isASideSystemMessage` 三个函数。
2. WHEN 输入为 A_Side_Join_Format(如"小明加入聊天"),THE Filter_Regression_Suite SHALL 断言 `isASideJoinMessage` 返回 true、`isBSideJoinMessage` 返回 false。
3. WHEN 输入为 B_Side_Join_Format(如"加入小明的聊天"),THE Filter_Regression_Suite SHALL 断言 `isBSideJoinMessage` 返回 true、`isASideJoinMessage` 返回 false。
4. WHEN 输入为各类 A 端创建文案("您创建了私密聊天"等 5 类),THE Filter_Regression_Suite SHALL 断言 `isASideSystemMessage` 返回 true。
5. WHEN 输入为 B_Side_Join_Format 或普通文本消息,THE Filter_Regression_Suite SHALL 断言 `isASideSystemMessage` 返回 false。
6. WHEN 输入为非字符串(null / undefined / 数字 / 对象),THE Format_Detector SHALL 返回 false,且 Filter_Regression_Suite SHALL 断言之。
7. IF 现状各散落副本的 OR 条件存在不一致(某副本多/少一项),THEN 设计文档 SHALL 显式列出差异,并以"并集"为权威语义基准;若并集会改变某路径的过滤结果,SHALL 标注为 Behavior_Change 交用户确认。

### Requirement 3: 散落判定收敛到权威纯函数

**User Story:** 作为维护者,我希望把所有 Divergent_Filter 收敛到 Format_Detector,以便后续调整判定规则时只改一处。

#### Acceptance Criteria

1. WHERE 代码需要判定 A_Side_Join_Format,THE 相关模块 SHALL 调用 `isASideJoinMessage`,而非内联正则。
2. WHERE 代码需要判定 A_Side_System_Message,THE 相关模块 SHALL 调用 `isASideSystemMessage`,而非内联 OR 链。
3. THE 收敛范围 SHALL 覆盖 message-fetch.js、message-listener.js、chat.js 中的全部 Divergent_Filter。
4. WHEN 收敛完成,THE 上述文件 SHALL 不再保留独立于 Format_Detector 的 A 端加入格式内联正则与 A 端系统消息识别 OR 链。
5. WHERE 某处内联判定与权威语义存在差异(并集多出某项),THE 设计文档 SHALL 列出该差异点,交用户确认属于"预期收敛"还是"需保留旧行为"。

### Requirement 4: 业务行为零变化保证

**User Story:** 作为维护者,我希望收敛不改变任何消息过滤路径的产出。

#### Acceptance Criteria

1. THE 本规格改动 SHALL 限定在「新增权威纯函数 + 新增纯函数测试 + 散落判定收敛」三类,不修改消息过滤的产品策略与分支结构。
2. THE 工作顺序 SHALL 为:先建权威纯函数 + Filter_Regression_Suite 固化语义并全绿,再逐处收敛。
3. WHEN 收敛完成后重跑全部静态测试(当前 843 PASS + 新增),THE 测试 SHALL 全部通过。
4. IF 收敛导致 message-fetch / message-listener 等既有测试用例失败,THEN 治理流程 SHALL 停止收敛并将差异上报用户决策,而非直接修改测试期望值。
5. THE 本规格 SHALL 不修改 system-message.js 的添加/淡出/去重逻辑、不改 B 端过滤产品策略、不动身份判定时序与云函数。

### Requirement 5: 测试接入一键脚本与 CI

**User Story:** 作为维护者,我希望新增的格式判定测试接入既有测试套件与 CI。

#### Acceptance Criteria

1. WHEN Filter_Regression_Suite 创建完成,THE `.tools/run_all_tests.sh` SHALL 包含对该测试文件的执行调用,并同步更新测试计数与编号。
2. WHEN CI 运行 `.tools/run_all_tests.sh`,THE CI SHALL 执行 Filter_Regression_Suite 并在断言失败时标记构建失败。
3. THE Filter_Regression_Suite 输出格式 SHALL 与既有测试一致(逐用例 PASS/FAIL + 汇总)。
4. WHERE Format_Detector 的纯函数已可在 chat_helpers_test.js 体系内测试,THE 设计 SHALL 决定是并入 chat_helpers_test.js 还是新建独立测试文件,并说明理由。
