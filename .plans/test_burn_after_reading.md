# 🔥 阅后即焚增强功能测试指南

## 功能概述

实现了全面的阅后即焚机制优化，包括：
1. **双方在线时实时销毁**：当双方同时在聊天界面时，消息自动执行阅后即焚
2. **离线通知机制**：一方退出时新消息使用微信默认通知，重新进入后执行销毁
3. **彻底删除机制**：已销毁消息不保留任何历史记录和痕迹

## 测试场景

### 场景1：双方同时在线的实时阅后即焚

**测试步骤：**
1. 用户A和用户B同时进入聊天界面
2. 用户A发送消息
3. 观察用户B接收到消息的处理流程

**预期结果：**
- ✅ 消息显示"点击查看（阅后即焚）"提示
- ✅ 用户B点击消息后立即开始销毁倒计时
- ✅ 10秒后消息从双方设备彻底删除
- ✅ 消息显示为"🔥 消息已销毁"

### 场景2：一方离线时的通知机制

**测试步骤：**
1. 用户A在聊天界面，用户B退出到微信消息列表
2. 用户A发送消息
3. 用户B重新进入聊天界面

**预期结果：**
- ✅ 用户B收到"收到 X 条新消息"的通知
- ✅ 进入聊天后显示离线期间的消息
- ✅ 3秒后自动开始销毁倒计时
- ✅ 销毁后消息彻底删除

### 场景3：消息彻底删除验证

**测试步骤：**
1. 发送包含文本和图片的消息
2. 触发阅后即焚机制
3. 等待销毁完成后检查数据库

**预期结果：**
- ✅ 消息从`messages`集合中彻底删除
- ✅ 关联的媒体文件从云存储中删除
- ✅ 消息状态记录从`messageStatus`集合中清理
- ✅ 本地消息列表中移除该消息

## 测试命令

在聊天页面的调试控制台中执行以下测试命令：

### 1. 测试在线状态监听
```javascript
// 在聊天页面执行
this.startOnlineStatusMonitor();
console.log('当前在线用户:', this.data.onlineUsers);
```

### 2. 模拟双方在线环境
```javascript
// 模拟双方都在线
this.setData({
  onlineUsers: [
    this.data.currentUser.openId,
    'other_user_openid'  // 替换为对方的openId
  ]
});
this.checkMutualOnlineStatus();
```

### 3. 测试离线消息处理
```javascript
// 模拟后台时间
this.setData({
  backgroundTime: Date.now() - 5 * 60 * 1000  // 5分钟前
});
this.processOfflineMessages();
```

### 4. 测试消息彻底删除
```javascript
// 获取消息ID后执行
const messageId = 'your_message_id';
this.permanentlyDeleteMessage(messageId);
```

## 云函数部署

确保以下云函数已正确部署：

### 1. updateOnlineStatus
```bash
# 进入云函数目录
cd cloudfunctions/updateOnlineStatus

# 安装依赖
npm install

# 部署云函数
右键 -> 上传并部署：云端安装依赖
```

### 2. permanentDeleteMessage
```bash
# 进入云函数目录
cd cloudfunctions/permanentDeleteMessage

# 安装依赖  
npm install

# 部署云函数
右键 -> 上传并部署：云端安装依赖
```

## 数据库集合

确保云数据库中存在以下集合：

### 1. onlineStatus（在线状态）
```json
{
  "_id": "auto_generated",
  "chatId": "chat_id",
  "userId": "user_openid", 
  "isOnline": true,
  "timestamp": 1234567890,
  "lastActiveTime": 1234567890,
  "offlineTime": 1234567890
}
```

### 2. messageStatus（消息状态，可选）
```json
{
  "_id": "auto_generated",
  "messageId": "message_id",
  "chatId": "chat_id",
  "readBy": ["user1", "user2"],
  "readTime": 1234567890
}
```

## 注意事项

### 安全性
- 消息彻底删除后无法恢复
- 媒体文件同步删除，节省存储空间
- 在线状态定期清理，避免数据累积

### 性能优化
- 在线状态监听器自动处理连接异常
- 销毁定时器在页面卸载时自动清理
- 过期的在线状态记录定期清理

### 用户体验
- 消息销毁过程有明确的视觉反馈
- 点击查看提示清晰易懂
- 销毁倒计时提供充足的查看时间

## 故障排除

### 1. 在线状态检测失败
- 检查云函数`updateOnlineStatus`是否正确部署
- 确认数据库权限设置正确
- 验证网络连接状态

### 2. 消息无法彻底删除  
- 检查云函数`permanentDeleteMessage`权限
- 确认文件删除权限已开启
- 查看云函数日志排查错误

### 3. 销毁倒计时不显示
- 检查消息数据结构是否正确
- 确认CSS样式文件已更新
- 验证`remainTime`字段是否正确设置

## 测试完成标准

- ✅ 双方在线时消息能实时销毁
- ✅ 离线时能正确显示通知并处理消息
- ✅ 消息销毁后数据库中无残留
- ✅ 媒体文件能同步删除
- ✅ 页面切换和重新进入功能正常
- ✅ 用户界面反馈清晰明确 