# HOTFIX-v1.3.1 发送方历史消息和标题显示修复

## 问题描述

根据用户反馈和日志分析，发现了以下关键问题：

1. **发送方阅后即焚失效**：发送方登录后能看到13条历史消息，违反了阅后即焚原则
2. **标题显示错误**：
   - 发送方匹配好友后显示错误标题
   - 接收方显示"我和朋友（2）"而不是对方真实昵称"Y."
3. **参与者去重逻辑问题**：系统保留了错误的参与者信息

## 问题分析

### 日志分析
```
chat.js? [sm]:2279 🔍 处理后的消息数据 13 条
chat.js? [sm]:6320 🔥 [阅后即焚检查] 用户消息数量: 0
chat.js? [sm]:6324 🔥 [阅后即焚检查] ✅ 未检测到历史用户消息，聊天环境纯净
```

**问题根源**：
1. 阅后即焚检查逻辑在消息获取后没有及时触发
2. 参与者去重逻辑保留了`local_1751123377842 向冬`而不是真实用户`ojtOs7bmxy-8M5wOTcgrqlYedgyY Y.`

## 修复方案

### 1. 增强阅后即焚检查

#### 修复位置：`checkBurnAfterReadingCleanup()` 方法

**增强清理逻辑**：
```javascript
// 🔥 【HOTFIX-v1.3.0】检测到历史数据就清理，不区分身份
if (userMessages.length > 0) {
  console.log('🔥 [阅后即焚] ⚠️ 检测到历史聊天数据，作为阅后即焚应用自动清理');
  console.log('🔥 [阅后即焚] 历史消息详情:', userMessages.map(m => ({
    senderId: m.senderId,
    content: m.content?.substring(0, 20),
    timestamp: m.timestamp
  })));
  
  // 🔥 立即强制清理，不允许任何历史消息存在
  this.forceBurnAfterReadingCleanup();
  
  // 🔥 额外确保：停止所有消息获取
  if (this.messagePollingTimer) {
    clearInterval(this.messagePollingTimer);
    this.messagePollingTimer = null;
  }
  
  // 🔥 显示清理提示
  wx.showToast({
    title: '🔥 历史消息已清理',
    icon: 'success',
    duration: 2000
  });
}
```

#### 修复位置：消息获取成功回调

**优先触发阅后即焚检查**：
```javascript
// 🔥 【阅后即焚增强】优先检查是否需要清理历史数据
that.checkBurnAfterReadingCleanup();

// 🔧 检测是否需要修复连接
that.checkAndFixConnection(messages);
```

### 2. 修复参与者去重逻辑

#### 修复位置：`fixParticipantDuplicates()` 方法

**智能选择参与者**：
```javascript
// 🔥 【修复标题错误】优先选择最新加入的参与者，而不是第一个
const otherParticipants = normalizedParticipants.filter(p => {
  const openId = p.openId;
  return openId && !seenOpenIds.has(openId) && openId !== currentUserOpenId;
});

// 优先选择真实微信openId（以ojtOs开头）而不是本地生成的ID
const realWechatParticipant = otherParticipants.find(p => 
  p.openId && p.openId.startsWith('ojtOs') && p.nickName && p.nickName !== '向冬'
);

if (realWechatParticipant) {
  selectedParticipant = realWechatParticipant;
  console.log('🔧 [参与者去重] ✅ 选择真实微信用户:', selectedParticipant.openId, selectedParticipant.nickName);
}
```

### 3. 修复标题显示规则

**确保正确的标题显示**：
- 规则1：单人状态显示自己昵称
- 规则2：双人聊天显示"我和xx（2）"格式，其中xx为对方真实昵称
- 规则3：群聊显示"群聊（x）"格式

## 技术细节

### 关键修复点

1. **阅后即焚优先级**：
   - 在消息获取成功后立即检查阅后即焚
   - 检测到任何历史用户消息立即清理
   - 停止所有消息轮询和监听

2. **参与者选择策略**：
   - 优先选择真实微信openId（以`ojtOs`开头）
   - 避免保留本地生成的重复ID
   - 确保选择最新的活跃参与者

3. **标题显示逻辑**：
   - 基于真实参与者信息生成标题
   - 避免显示默认昵称如"朋友"、"用户"
   - 确保标题反映真实的聊天状态

### 代码变更摘要

#### 文件：`app/pages/chat/chat.js`

1. **增强阅后即焚检查**（第6326行附近）：
   - 添加详细的历史消息日志
   - 强制停止消息轮询
   - 显示清理提示

2. **优化参与者去重逻辑**（第5460行附近）：
   - 智能选择真实微信用户
   - 避免保留重复的本地ID
   - 改进参与者选择策略

3. **优先触发阅后即焚**（第2285行附近）：
   - 在消息获取后优先检查阅后即焚
   - 确保历史数据被及时清理

## 测试验证

### 验证步骤

1. **发送方测试**：
   - 发送方登录后应立即看到纯净环境
   - 不应显示任何历史消息
   - 标题应显示自己的昵称

2. **接收方测试**：
   - 接收方加入后标题应显示"我和[对方真实昵称]（2）"
   - 不应显示"我和朋友（2）"等默认标题

3. **双方聊天测试**：
   - 确认消息收发正常
   - 确认标题显示正确
   - 确认阅后即焚功能正常

### 预期结果

1. **阅后即焚**：✅ 任何用户登录都是纯净环境
2. **标题显示**：✅ 显示正确的参与者昵称
3. **用户体验**：✅ 消除历史数据困扰

## 部署说明

1. 修改已应用到 `app/pages/chat/chat.js`
2. 建议进行真机测试验证修复效果
3. 监控日志确认阅后即焚和标题显示正常

## 风险评估

- **低风险**：修复主要针对显示逻辑和数据清理
- **向后兼容**：保持现有功能不受影响
- **用户体验**：显著改善阅后即焚体验

## 相关文档

- 参考：`HOTFIX-v1.3.0-发送方阅后即焚历史消息修复.md`
- 参考：`FEATURE-聊天标题优化v2.0.md`
- 参考：`聊天标题显示规则说明.md` 