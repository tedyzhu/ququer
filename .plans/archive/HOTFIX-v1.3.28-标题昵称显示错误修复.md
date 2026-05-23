# HOTFIX-v1.3.28 - 标题昵称显示错误修复

## 问题描述
a的标题更新了，但是显示的格式有误。当前显示的是"我和向冬（2）"，即显示的是a自己的昵称，应该是"我和xx（2）"，xx为b的真实昵称。

## 问题分析

### 关键日志分析
```
chat.js? [sm]:1854 🔥 [发送方监听] ✅ 添加对方参与者: ojtOs7bA8w-ZdS1G_o5rdoeLzWDc 向冬
chat.js? [sm]:1873 🔥 [发送方监听] 🎯 强制更新双人聊天标题: 我和向冬（2）
chat.js? [sm]:1874 🔥 [发送方监听] 对方参与者信息: {id: "ojtOs7bA8w-ZdS1G_o5rdoeLzWDc", openId: "ojtOs7bA8w-ZdS1G_o5rdoeLzWDc", nickName: "向冬", avatarUrl: "/assets/images/default-avatar.png", isCreator: , …}
```

### 问题原因
1. **用户身份信息**：
   - a的openId: `ojtOs7bmxy-8M5wOTcgrqlYedgyY` (昵称：向冬)
   - b的openId: `ojtOs7bA8w-ZdS1G_o5rdoeLzWDc` (昵称：显示为"向冬"，但这是错误的)

2. **根本原因**：
   - 在`sendMessage`云函数中，当b发送消息时会自动添加到participants列表
   - 但获取b的用户信息时，从users集合获取的昵称是错误的
   - 可能是：
     - users集合中b的数据本身就错误
     - 或者获取用户信息的逻辑有问题

## 修复方案

### 方案1：修复sendMessage云函数获取用户信息逻辑
在`sendMessage`云函数中，当无法获取到准确的用户信息时，使用当前用户的登录信息：

```javascript
// 在sendMessage云函数中，优先使用当前登录的用户信息
if (!senderInfo) {
  // 尝试从当前登录上下文获取用户信息
  const currentUserInfo = event.currentUserInfo; // 前端传递的当前用户信息
  
  if (currentUserInfo && currentUserInfo.nickName) {
    senderInfo = {
      id: senderId,
      openId: senderId,
      nickName: currentUserInfo.nickName,
      name: currentUserInfo.nickName,
      avatarUrl: currentUserInfo.avatarUrl || '/assets/images/default-avatar.png',
      isCreator: participants.length === 0,
      isJoiner: participants.length > 0,
      joinTime: db.serverDate()
    };
    console.log('🔥 [sendMessage] 使用当前登录用户信息:', senderInfo);
  }
}
```

### 方案2：前端修复用户信息传递
在前端发送消息时，同时传递当前用户的正确信息：

```javascript
// 在chat.js的sendMessage函数中
sendMessage: function(content, type = 'text') {
  const currentUser = this.data.currentUser || getApp().globalData.userInfo;
  
  wx.cloud.callFunction({
    name: 'sendMessage',
    data: {
      chatId: this.data.chatId,
      content: content,
      type: type,
      senderId: currentUser.openId,
      currentUserInfo: { // 🆕 传递当前用户信息
        nickName: currentUser.nickName,
        avatarUrl: currentUser.avatarUrl
      },
      destroyTimeout: 10
    },
    // ... 其他代码
  });
}
```

## 实施步骤

### 步骤1：修复sendMessage云函数
1. 修改`cloudfunctions/sendMessage/index.js`
2. 在获取用户信息时，优先使用前端传递的当前用户信息
3. 确保participants中的用户信息是正确的

### 步骤2：修复前端传递逻辑
1. 修改`app/pages/chat/chat.js`中的sendMessage函数
2. 在调用sendMessage云函数时，传递当前用户的正确信息

### 步骤3：验证修复效果
1. 重新部署sendMessage云函数
2. 测试b发送消息时，是否正确添加到participants
3. 验证a的标题是否正确显示为"我和[b的真实昵称]（2）"

## 预期效果
- b发送消息时，正确获取b的真实昵称
- a的标题正确显示为"我和[b的真实昵称]（2）"
- 不再显示"我和向冬（2）"的错误格式

## 部署说明
1. 修复完成后，需要重新部署sendMessage云函数
2. 可以使用微信开发者工具或云开发控制台进行部署
3. 部署完成后，进行端到端测试验证

---

**修复时间**: 2024-01-04
**修复版本**: HOTFIX-v1.3.28
**影响范围**: sendMessage云函数、聊天页面标题显示
**测试要求**: 双方消息收发测试 + 标题显示验证 