# P0 仓库清理总结

> 执行日期:2025-05-23 / 分支:`chore/p0-cleanup` / 备份分支:`backup/before-p0-cleanup`

本次清理只整理仓库结构,不改业务逻辑。所有删除项的原始内容仍可通过 `backup/before-p0-cleanup` 分支取回。

## 一、删除清单

### 根目录一次性脚本(约 25 个)

`NUCLEAR-FIX.js` / `emergency-fix.js` / `emergency-system-fix.js` / `emergency-stop-infinite-loop.js` / `ultimate-fix.js` / `ultimate-emergency-fix.js` / `force-fix.js` / `fix-encoding-error.js` / `fix-startup-failure.js` / `fix-real-device-debug.js` / `fix-cloud-function-errors.js` / `fix-cloud-function-errors-safe.js` / `messageReceiveFix.js` / `chatIdFixTool.js` / `getBUserRealNickname.js` / `system-verification.js` / `page-level-status-check.js` / `check-cloud-functions.js` / `check-fix-status.js` / `generate-b-end-url.js` / `joinByInvite_云端修复版.js` / `test_new_chat.js` / `test_message_sending.js` / `test_connection_fix.js` / `test.txt` / `diagnostic-report-20250927_231339.txt`

清理依据:全部互不依赖,无任何 `require` 引用。

### 根目录部署脚本(约 18 个)

清理掉所有单次发版用 hotfix shell 脚本以及指向死路径的批量脚本:

`deploy-cloud.sh` / `deploy-critical-functions.sh` / `deploy-missing-functions.sh` / `deploy-cloud-functions-manual.sh` / `deploy-createChat-hotfix-v1.3.86.sh` / `deploy-getConversations-hotfix.sh` / `deploy-sendMessage-hotfix.sh` / `deploy-sendMessage-hotfix-v1.3.28.sh` / `deploy-updateConversationParticipants.sh` / `部署getConversations修复.sh` / `重新部署sendMessage云函数.sh` / `setup-cloud-functions.sh` / `setup-b-end-test.sh` / `update-cloud-env.sh` / `quick-fix-launcher.sh` / `clear-cache.sh` / `clear-all-cache.sh` / `install-dependencies.sh`

后续部署直接走微信开发者工具的"上传并部署"功能即可。

### 死代码目录

| 目录 | 处置 | 理由 |
| --- | --- | --- |
| `pages/` | 删除 | 老旧重复版本,真实入口在 `app/pages/` |
| `app/app.js` | 删除 | 死的二重入口,真实入口是根目录 `app.js` |
| `app/app.json` | 删除 | 死配置,真实配置是根目录 `app.json` |
| `app/pages/chat/chat-backup.js` | 删除 | chat 副本 |
| `app/pages/chat/chat-safe.js` | 删除 | chat 副本 |
| `app/pages/chat/chat.disabled.js` | 删除 | chat 副本 |
| `app/pages/chat-new/` | 删除 | 烂尾重构,无任何代码跳转引用 |
| `app/pages/test/` | 删除 | 无引用的测试分包 |
| `app/pages/test-fix/` | 删除 | 未在 `app.json` 声明 |
| `app/pages/test-message/` | 删除 | 未在 `app.json` 声明 |
| `.cloudbase/container/` | 删除 | 本地容器调试遗留 |

### 死云函数

`cloudfunctions/all/` / `cloudfunctions/cloud1-9gmp8bcn2dc3576a/` / `cloudfunctions/debugUser/` / `cloudfunctions/testDeploy/` / `cloudfunctions/testJoin/`

清理依据:前端代码无任何 `wx.cloud.callFunction({ name: ... })` 引用。

`debugUserDatabase` 仍在 `chat.js` 中调用,本轮保留;后续应改为只在开发环境注册或加权限。

### 散落资源 / 配置

- `headers.config.json` 无引用
- `avatar1.png` / `emoji.png` / `mic.png` / `more.png` 在 `assets/images/` 已有副本

### .plans 历史归档

176 份历史 `BUGFIX / HOTFIX / CRITICAL / FEATURE` 文档全部移至 `.plans/archive/`,根目录留空,等待后续新增。

## 二、修改清单

### `app.json`(根目录,真入口)

- `subpackages` 移除已删的 `app/pages/test`、`app/pages/chat-new`,保留真实使用的 `home` 和 `share`

### `project.config.json`

- `packOptions.ignore` 移除大量已不存在的条目,只保留通用 `temp_*.js` glob

### `cloudfunctions/project.config.json`

- 移除 `testDeploy` 函数声明

### `.gitignore`

- 补充 `**/node_modules/`、`cloudfunctions/**/node_modules/`、`.cloudbase/`、日志、临时文件
- 加入 `project.private.config.json`(包含本机路径,不应入库),并从 git 索引中移除

### `readme.md`

完整重写:

- 版本号同步至 `v1.3.96`(代码内最高)
- 重写"近期重要修复"段,只列 v1.3.86 之后核心修复
- 补充完整云函数清单与职责对照表
- 增加"已知技术债"章节,作为后续 P1/P2 的备忘

## 三、验收

- 根目录文件数:由 70+ 降至 16
- 业务代码 0 改动
- `getDiagnostics` 在所有改动的配置文件上返回无错
- `app.json` `subpackages` 与磁盘真实分包一一对应,微信开发者工具不会报"未注册分包"

## 四、回滚方式

```bash
git checkout backup/before-p0-cleanup -- <path>   # 单文件回滚
git checkout backup/before-p0-cleanup             # 整体回滚
```

## 五、下一步(P1 建议)

1. 拆分 `app/pages/chat/chat.js`(约 15500 行,219 处 HOTFIX 注释)为
   - `identity-resolver.js`
   - `participant-listener.js`
   - `burn-after-read.js`
   - `system-message.js`
   - `title-controller.js`
2. `getConversations` 由 N+1 改为一次性 `db.collection('users').where({openId: db.command.in([...])})`
3. `debugUserDatabase` 加开发环境 guard
4. 将 `app/service/api.js` 与各页面云函数调用统一,作为模块拆分的过渡层
