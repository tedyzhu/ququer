# 云函数部署问题修复指南

## 问题描述

从日志中发现以下错误：
```
Error: errCode: -501000 | errMsg: FunctionName parameter could not be found
```

这个错误表示云函数 `getChatParticipants` 没有被正确部署到云端。

## 问题原因

虽然云函数在本地目录中存在，但是没有在 `cloudfunctions/project.config.json` 中注册，导致微信开发者工具不会自动部署这些云函数。

## 修复步骤

### 1. 更新云函数配置文件

已更新 `cloudfunctions/project.config.json`，添加了以下云函数的配置：
- getChatParticipants
- getMessages  
- sendMessage
- destroyMessage
- login
- joinByInvite
- getConversations
- createChat

### 2. 部署云函数

请按照以下步骤部署云函数：

1. **打开微信开发者工具**
2. **进入云开发控制台**
   - 点击工具栏中的"云开发"按钮
   - 确保选择了正确的云环境：`ququer-env-6g35f0nv28c446e7`

3. **批量部署云函数**
   - 在微信开发者工具左侧目录中，右键点击 `cloudfunctions` 文件夹
   - 选择"上传并部署：全部"
   - 等待所有云函数部署完成

4. **验证部署状态**
   - 在云开发控制台的"云函数"页面中确认以下函数已成功部署：
     - ✅ getChatParticipants
     - ✅ getMessages  
     - ✅ sendMessage
     - ✅ destroyMessage
     - ✅ login
     - ✅ joinByInvite
     - ✅ getConversations
     - ✅ createChat
     - ✅ testDeploy
     - ✅ createInvite

### 3. 测试修复结果

部署完成后，重新运行小程序：
1. 编译并运行小程序
2. 登录后进入聊天页面
3. 查看控制台日志，确认 `getChatParticipants` 云函数调用成功
4. 验证聊天参与者信息能正常显示

## 预期结果

修复后，聊天页面应该能够：
- ✅ 成功调用 `getChatParticipants` 云函数
- ✅ 正确显示聊天参与者信息
- ✅ 动态更新聊天标题
- ✅ 不再出现 "FunctionName parameter could not be found" 错误

## 注意事项

1. **云环境确认**：确保所有操作都在正确的云环境 `ququer-env-6g35f0nv28c446e7` 中进行
2. **网络连接**：部署过程需要稳定的网络连接
3. **权限检查**：确保小程序有足够的云开发权限
4. **缓存清理**：如果问题仍然存在，可以尝试清理开发者工具缓存后重新部署

## 备注

这个问题的根本原因是云函数配置管理不完善。为了避免类似问题再次发生，建议：
1. 每次新增云函数时，同时更新 `project.config.json` 配置
2. 定期检查云开发控制台中的云函数部署状态
3. 在测试环境中验证所有云函数都正常工作后再部署到生产环境 