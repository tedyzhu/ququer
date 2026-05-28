# 秘信(蛐曲儿) - 阅后即焚小程序

阅后即焚的微信小程序。一对一私密聊天,接收方查看消息后自动销毁,从双方设备和服务器一并删除。

## 当前版本

**v1.3.96**(主版本号见 `app/pages/chat/chat.js` 内 `HOTFIX-v1.3.96` 标记)

完整变更记录见 `.plans/archive/`,最新若干个修复要点:

- v1.3.96 A 端最终防护——出现接收方强证据时,忽略本地创建者弱证据,并清理旧创建者缓存
- v1.3.94 修复参与者监听器内 `isPlaceholderNickname` 引用未定义的回归问题
- v1.3.93 监听器中加入实时 placeholder 昵称检测与延迟添加系统消息
- v1.3.92 标题刷新触发条件修正
- v1.3.90 双端连接失败修复 + 真机验证
- v1.3.89 A 端身份多重证据判定(聊天 ID 片段、访问历史、昵称冲突、creatorKey 存储)
- v1.3.86 联通 createChat 与 joinByInvite,统一系统消息文案

## 模块化重构

P0/P1/P2 重构已完成,`app/pages/chat/chat.js` 从 15500 → 5421 行(-65.0%)。
12 个模块下沉到 `app/pages/chat/modules/`:

| 模块 | 行数 | 职责 |
| --- | --- | --- |
| `chat-helpers.js` | 281 | 常量与纯函数(占位符判定、消息 ID 差异、昵称匹配等) |
| `identity-utils.js` | 166 | 轻量身份工具(B 端识别、ever 标记) |
| `destroyed-store.js` | 106 | 已销毁消息记录的全局 + 本地存储 |
| `message-debug-hook.js` | 152 | setData 调试钩子 |
| `share-utils.js` | 103 | 分享卡片 payload + 访问记录 |
| `voice-recorder.js` | 318 | 语音录制 / 播放子系统 |
| `test-methods.js` | 2017 | 23 个调试 API,仅在开关启用时挂载 |
| `system-message.js` | 1310 | 系统消息添加 / 淡出 / 校正(13 方法) |
| `title-controller.js` | 809 | A/B 端标题控制(8 方法) |
| `burn-after-read.js` | 433 | 阅后即焚定时器子系统(8 方法) |
| `participant-listener.js` | 1904 | 参与者实时监听 + 真实昵称获取(9 方法) |
| `chat-debug-tools.js` | 1696 | 33 个调试工具方法(身份切换、强制修复、批量删除等) |

详细抽离过程与策略见 `docs/P1-Progress.md`,各模块独立 spec 在 `.kiro/specs/chat-*-module/`。

## 核心功能

- 微信登录,以 openId 作唯一标识
- 文本/图片/语音/视频多媒体消息
- 阅后即焚:接收方查看后启动倒计时,到点本地与云端同时清理
- 邀请链接分享,B 端通过 `joinByInvite` 加入
- A/B 端身份识别:多重证据综合判定,处理回访、过期邀请等边界场景

## 技术栈

- 微信小程序原生框架(WXML / WXSS / JS)
- 后端:微信云开发(云函数 + 云数据库 + 云存储)
- AppID:`wx1848888960aefcb5`
- 云环境 ID:`cloud1-d8g0b5fni24b9cb89`

## 项目结构

```
ququer/
├── app.js / app.json / app.wxss        # 真实入口(根目录)
├── project.config.json                 # 微信开发者工具项目配置
├── sitemap.json                        # 收录配置
├── app/                                # 业务代码主目录
│   ├── pages/
│   │   ├── login/                      # 登录页(入口)
│   │   ├── index/                      # 索引页
│   │   ├── chat/                       # 聊天页 + 详情页(主战场)
│   │   ├── home/                       # 首页/会话列表(分包)
│   │   └── share/                      # 分享落地页(分包)
│   ├── components/
│   │   └── message/                    # 消息气泡组件
│   ├── service/
│   │   └── api.js                      # 云函数 API 封装
│   └── utils/                          # 业务工具
├── utils/                              # 通用工具
│   ├── resource-manager.js             # 资源生命周期管理
│   ├── error-handler.js                # 统一错误处理
│   └── ...
├── cloudfunctions/                     # 云函数(每个独立 package.json)
├── docs/                               # 当前生效的修复文档
├── .plans/archive/                     # 历史规划与 hotfix 记录归档
└── assets/                             # 静态资源
```

## 云函数清单

| 名称 | 职责 |
| --- | --- |
| `login` | 微信登录,返回 openId 等用户信息 |
| `createChat` | 创建会话 |
| `createInvite` | 生成邀请 |
| `joinByInvite` | 通过邀请加入会话,处理参与者去重和系统消息 |
| `sendMessage` | 发送消息,顺带补齐发送者参与者信息 |
| `getMessages` | 拉取历史消息 |
| `getConversations` | 获取会话列表(已优化参与者真实昵称查询) |
| `destroyMessage` | 单条消息销毁 |
| `permanentDeleteMessage` | 永久删除消息(支持单条或整聊天) |
| `getChatInfo` | 获取会话基础信息 |
| `getChatParticipants` | 获取/刷新参与者 |
| `checkChatStatus` | 会话状态查询 |
| `updateChatStatus` | 会话状态更新 |
| `updateConversationParticipants` | 修复或同步参与者列表 |
| `updateOnlineStatus` | 在线状态更新 |
| `updateUserInfo` | 用户资料更新(昵称、头像等) |
| `notifyJoined` / `notifyInviter` / `notifyCreator` | 加入通知系列 |
| `startConversation` | 启动会话 |
| `debugUserDatabase` | 用户数据排错(仍在前端调用,后续应限制为开发环境) |

## 数据库集合

- `users` 用户信息(头像、昵称、登录时间等)
- `messages` 消息记录
- `conversations` 会话信息

## 本地开发

1. 用微信开发者工具打开项目根目录
2. 工具中切换为自己的 AppID(或保留 `wx1848888960aefcb5` 直接调试)
3. 开通云开发,创建/绑定环境 `cloud1-d8g0b5fni24b9cb89`(也可改为自有环境,改 `app.js` 中 `wx.cloud.init` 的 `env`)
4. 在云开发面板上传部署 `cloudfunctions/` 下所有云函数
5. 创建数据库集合 `users` `messages` `conversations`,并按需配置权限

## 安全提示

- 用户查看消息后会自动销毁,无法找回
- 小程序无法 100% 防截屏,仅能在检测到 `wx.onUserCaptureScreen` 时弹窗提醒
- 请勿在应用中传递敏感信息

## 已知技术债

记录在此以便后续迭代取舍。**P2 重构(2026-05)后状态**:

- `app/pages/chat/chat.js` 已从 15500 → 5421 行(-65.0%),12 个模块下沉到 `app/pages/chat/modules/`(详见 `docs/P1-Progress.md`)
- ✅ `getConversations` 已从 N+1 改为 1+1 in 查询(commit `916e725`)
- ✅ `debugUserDatabase` 已加 `DEBUG_TOOLS_ENABLED` 环境变量 guard,但前端 `this.debugUserDatabase()` 入口仍暴露,后续应彻底移除
- ⚠️ 剩余大方法待评估:`onLoad` 1096 行(身份判定主流程,`identity-resolver` 模块的目标)、`fetchMessages` 462 行、`startMessageListener` 390 行、`joinChatByInvite` 335 行、`fetchMessagesAndMerge` 307 行
- ⚠️ 云函数 `joinByInvite` 478 行,可考虑按职责拆 helper
- ⚠️ 自动化测试仅有 `.tools/integration_test.js` 单元覆盖关键 require / attach 路径,业务流程仍需补静态用例(因真机测试通道不稳)

## 联系方式

contact@example.com
