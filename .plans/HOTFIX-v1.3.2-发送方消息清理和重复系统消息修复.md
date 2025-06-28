# HOTFIX-v1.3.2 发送方消息清理和重复系统消息修复

## 问题描述

根据用户反馈和日志分析，发现了以下关键问题：

1. **发送方消息被误清理**：发送方发送消息后立即被阅后即焚逻辑清理，导致消息消失
2. **重复系统消息**：每次有消息变化都会添加"和xx建立了聊天"系统消息
3. **阅后即焚过度触发**：每次获取消息都触发清理检查，包括正常聊天消息

## 问题分析

### 日志分析
```
chat.js? [sm]:6351 🔥 [阅后即焚] ⚠️ 检测到历史聊天数据，作为阅后即焚应用自动清理
chat.js? [sm]:6356 🔥 [阅后即焚] 历史消息详情: (20) [Object, Object, ...]
chat.js? [sm]:6237 🔥 [强制清理] ==================== 开始强制阅后即焚清理 ====================
chat.js? [sm]:2667 📝 添加系统消息: {id: "sys_1751132555255_8d4l8", content: "和向冬建立了聊天"}
```

**问题根源**：
1. 阅后即焚逻辑将所有用户消息都视为"历史消息"进行清理
2. 发送方监听器每次触发都会添加系统消息
3. 缺乏时间戳判断和重复检查机制

## 修复方案

### 1. 智能阅后即焚检查

#### 修复位置：`checkBurnAfterReadingCleanup()` 方法

**关键改进**：
```javascript
// 🔥 【修复】避免重复检查，只在页面初始化时执行一次
if (this.data.hasCheckedBurnAfterReading) {
  console.log('🔥 [阅后即焚检查] 已完成初始检查，跳过重复清理');
  return;
}

// 🔥 【修复】只有在双方连接且检测到历史消息时才清理
const shouldCleanup = userMessages.length > 0 && 
                     participants.length >= 2 && 
                     !this.data.isNewChatSession;

// 🔥 检查消息时间戳，如果都是最近发送的，可能是正常聊天
const recentMessages = userMessages.filter(msg => {
  const msgTime = msg.timestamp || 0;
  return (currentTime - msgTime) < 60000; // 1分钟内的消息
});

if (recentMessages.length === userMessages.length) {
  console.log('🔥 [阅后即焚检查] 检测到的都是最近消息，可能是正常聊天，跳过清理');
  this.setData({ hasCheckedBurnAfterReading: true });
  return;
}
```

**修复效果**：
- 只在页面初始化时检查一次
- 区分历史消息和正常聊天消息
- 避免清理刚发送的消息

### 2. 防重复系统消息

#### 修复位置：发送方监听器 `startParticipantListener()` 方法

**关键改进**：
```javascript
// 🔥 【修复】避免重复添加系统消息
if (!this.data.hasAddedConnectionMessage) {
  const newJoiner = newParticipants.find(p => {
    return !currentParticipants.some(cp => (cp.openId || cp.id) === (p.openId || p.id));
  });
  
  if (newJoiner) {
    const joinerName = newJoiner.nickName || newJoiner.name || '好友';
    this.addSystemMessage(`和${joinerName}建立了聊天`);
    console.log('🔥 [发送方监听] ✅ 已添加"和好友建立了聊天"系统消息');
    
    // 🔥 标记已添加，防止重复
    this.setData({ hasAddedConnectionMessage: true });
  }
} else {
  console.log('🔥 [发送方监听] 防重复：已添加过连接消息，跳过');
}
```

**修复效果**：
- 使用标记位防止重复添加系统消息
- 确保"和xx建立了聊天"消息只显示一次

### 3. 页面初始化标记重置

#### 修复位置：`onLoad()` 方法

**关键改进**：
```javascript
// 🔥 【修复】重置阅后即焚和系统消息标记
this.setData({
  hasCheckedBurnAfterReading: false,
  hasAddedConnectionMessage: false,
  isNewChatSession: true
});
```

**修复效果**：
- 每次进入页面重置所有标记
- 确保新会话的正确处理

## 修复内容总结

### 🔥 阅后即焚逻辑优化

1. **时间戳判断**：区分历史消息和最近消息
2. **一次性检查**：避免重复清理正常消息
3. **条件限制**：只在双方连接且有真正历史数据时清理

### 🏷️ 系统消息去重

1. **标记机制**：使用`hasAddedConnectionMessage`防重复
2. **条件检查**：只在首次检测到参与者加入时添加
3. **状态管理**：页面初始化时重置标记

### 📋 关键修复点

1. **文件**：`app/pages/chat/chat.js`
2. **修复行数**：
   - 第6333行：智能阅后即焚检查
   - 第1633行：防重复系统消息
   - 第405行：页面初始化标记重置

3. **新增标记变量**：
   - `hasCheckedBurnAfterReading`: 是否已检查阅后即焚
   - `hasAddedConnectionMessage`: 是否已添加连接消息
   - `isNewChatSession`: 是否为新聊天会话

## 预期效果

### 🎯 发送方体验

1. **正常消息发送**：发送的消息不会被误清理
2. **系统提示优化**：只显示一次"和xx建立了聊天"消息
3. **标题显示正确**：显示"我和Y.（2）"格式

### 🎯 接收方体验

1. **历史消息清理**：真正的历史数据会被清理
2. **正常消息保留**：最近的聊天消息正常显示
3. **标题显示正确**：显示对方真实昵称

### 🎯 整体优化

1. **性能提升**：减少不必要的清理操作
2. **用户体验**：消除重复提示和错误清理
3. **逻辑清晰**：明确区分历史数据和正常聊天

## 技术细节

### 消息过滤逻辑
```javascript
const userMessages = messages.filter(msg => 
  msg.senderId && 
  msg.senderId !== 'system' && 
  !msg.content.includes('您创建了私密聊天') &&
  !msg.content.includes('欢迎使用阅后即焚聊天') &&
  !msg.content.includes('建立了聊天')
);
```

### 时间戳检查逻辑
```javascript
const recentMessages = userMessages.filter(msg => {
  const msgTime = msg.timestamp || 0;
  return (currentTime - msgTime) < 60000; // 1分钟内的消息
});
```

### 重复检查机制
```javascript
if (!this.data.hasAddedConnectionMessage) {
  // 添加系统消息
  this.setData({ hasAddedConnectionMessage: true });
}
```

## 兼容性说明

- 保持与现有阅后即焚功能的兼容性
- 不影响真正的历史数据清理
- 确保新用户和老用户的一致体验

## 测试建议

1. **发送方测试**：创建聊天 → 等待对方加入 → 发送消息 → 验证消息不被清理
2. **接收方测试**：通过邀请加入 → 发送消息 → 验证标题显示正确
3. **历史清理测试**：重新进入有历史数据的聊天 → 验证历史数据被清理 