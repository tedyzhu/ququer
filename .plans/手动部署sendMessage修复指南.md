# 手动部署sendMessage云函数修复指南

## 🚨 紧急修复：sendMessage云函数participants自动更新

### 问题说明
当前b发送消息时，不会自动添加到participants列表，导致a的标题无法更新为"我和xx(2)"格式。

### 修复内容
已在`cloudfunctions/sendMessage/index.js`中添加自动检测和添加participants的逻辑。

## 📋 手动部署步骤

### 方式1：使用微信开发者工具（推荐）

1. **打开微信开发者工具**
   - 打开项目根目录

2. **进入云开发控制台**
   - 点击工具栏中的"云开发"按钮
   - 选择环境：`ququer-env-6g35f0nv28c446e7`

3. **上传云函数**
   - 在左侧文件列表中找到 `cloudfunctions/sendMessage`
   - 右键点击 `sendMessage` 文件夹
   - 选择"上传并部署：云端安装依赖（不上传node_modules）"
   - 等待部署完成

4. **验证部署**
   - 在云开发控制台的"云函数"页面
   - 确认`sendMessage`函数显示"部署成功"
   - 查看函数代码，确认包含最新的participants更新逻辑

### 方式2：使用云开发控制台

1. **打开腾讯云云开发控制台**
   - 访问：https://console.cloud.tencent.com/tcb
   - 选择环境：`ququer-env-6g35f0nv28c446e7`

2. **进入云函数管理**
   - 点击左侧菜单"云函数"
   - 找到`sendMessage`函数

3. **更新函数代码**
   - 点击函数名进入详情页
   - 点击"函数代码"标签
   - 将本地的`cloudfunctions/sendMessage/index.js`内容复制粘贴
   - 点击"保存并部署"

### 方式3：使用命令行（需要配置）

如果你想使用命令行，需要先配置环境：

```bash
# 1. 创建配置文件
cat > .cloudbaserc << EOF
{
  "version": "2.0",
  "envId": "ququer-env-6g35f0nv28c446e7"
}
EOF

# 2. 登录（需要扫码）
npx @cloudbase/cli login

# 3. 部署函数
cd cloudfunctions/sendMessage
npx @cloudbase/cli functions:deploy sendMessage -e ququer-env-6g35f0nv28c446e7
```

## ✅ 验证部署成功

### 1. 检查云函数日志
- 在云开发控制台查看`sendMessage`函数的调用日志
- 确认有类似这样的日志：
  ```
  🔥 [sendMessage] 检查并更新participants列表
  🔥 [sendMessage] 🆘 发送者不在participants中，自动添加
  🔥 [sendMessage] ✅ participants列表已更新，发送者已添加
  ```

### 2. 功能测试
1. **a创建新聊天**并分享邀请链接
2. **b加入聊天**并发送消息
3. **验证效果**：
   - a的标题应立即更新为"我和b昵称(2)"
   - 双方消息传递正常
   - 参与者列表显示2人

## 🚨 如果部署后仍有问题

### 检查清单
- [ ] 确认`sendMessage`云函数部署成功
- [ ] 检查云函数调用日志是否有错误
- [ ] 确认环境ID正确：`ququer-env-6g35f0nv28c446e7`
- [ ] 清除小程序缓存重新测试

### 快速验证修复
在聊天页面控制台运行：
```javascript
// 查看当前participants数量
console.log('当前participants数量:', getCurrentPages()[getCurrentPages().length-1].data.participants.length);
```

## 📞 需要帮助？

如果手动部署仍有问题，请提供：
1. 部署过程的截图或错误信息
2. 云函数调用日志
3. 测试时的控制台日志

## 🎯 修复原理

此修复在`sendMessage`云函数中添加了智能检测：
1. 每次发送消息时检查发送者是否在participants中
2. 如果不在，自动获取用户信息并添加到列表
3. 更新conversation记录，触发前端监听器
4. 前端检测到participants变化，立即更新标题

这样确保任何用户发送消息时都会被正确添加到参与者列表，解决标题更新问题。 