# HOTFIX-v1.3.7 测试验证指南

## 测试目标

验证发送方历史消息获取和昵称显示的全面修复效果。

## 测试场景

### 场景1：发送方阅后即焚验证

**测试步骤**：
1. 发送方（向冬）登录并创建聊天
2. 接收方（Y.）加入聊天
3. 发送方发送消息
4. 检查发送方是否获取历史消息

**预期结果**：
- 发送方发送消息后不应获取任何历史消息
- 控制台应显示"[阅后即焚保护] 发送方跳过历史消息获取，保持环境纯净"
- 聊天界面保持纯净，只显示当前会话的消息

**验证命令**：
```javascript
// 在发送方聊天页面控制台执行
getCurrentPages()[getCurrentPages().length - 1].testBurnAfterReading()
```

### 场景2：标题显示验证

**测试步骤**：
1. 双方完成匹配
2. 检查发送方标题显示
3. 检查接收方标题显示

**预期结果**：
- 发送方标题：`我和Y.（2）`
- 接收方标题：`我和向冬（2）`
- 不应显示"好友"等默认昵称

**验证方法**：
```javascript
// 检查当前标题
console.log('当前标题:', getCurrentPages()[getCurrentPages().length - 1].data.dynamicTitle);
console.log('参与者信息:', getCurrentPages()[getCurrentPages().length - 1].data.participants);
```

### 场景3：系统消息验证

**测试步骤**：
1. 双方完成匹配
2. 检查发送方系统消息
3. 检查接收方系统消息

**预期结果**：
- 发送方系统消息：`和Y.建立了聊天`
- 接收方系统消息：`您加入了向冬的聊天！`

**验证方法**：
```javascript
// 检查系统消息
const messages = getCurrentPages()[getCurrentPages().length - 1].data.messages;
const systemMessages = messages.filter(m => m.isSystem);
console.log('系统消息:', systemMessages.map(m => m.content));
```

### 场景4：消息收发验证

**测试步骤**：
1. 发送方发送消息给接收方
2. 接收方发送消息给发送方
3. 验证双方都能正常收到消息

**预期结果**：
- 双方消息能正常发送和接收
- 消息监听器正常工作
- 没有重复的监听器

**验证方法**：
```javascript
// 检查消息监听器状态
const page = getCurrentPages()[getCurrentPages().length - 1];
console.log('消息监听器状态:', !!page.messageWatcher);
console.log('轮询定时器状态:', !!page.messagePollingTimer);
```

## 关键日志检查

### 正常日志示例

**发送方发送消息后**：
```
🔔 检测到对方发送的新消息，准备刷新
🔔 [阅后即焚保护] 发送方跳过历史消息获取，保持环境纯净
```

**标题更新时**：
```
🔧 [参与者去重] 发送方获取接收方真实昵称: Y.
🔧 [参与者去重] 发送方最终显示昵称: Y.
🔧 [参与者去重] 更新标题为: 我和Y.（2）
```

**系统消息添加时**：
```
👥 [系统消息] 发送方获取接收方真实昵称: Y.
👥 [系统消息] ✅ 发送方消息已添加: 和Y.建立了聊天
```

### 异常日志排查

如果出现以下日志，说明修复未生效：

**历史消息获取（异常）**：
```
🔍 处理后的消息数据 26 条  // 发送方不应获取历史消息
```

**默认昵称显示（异常）**：
```
🔧 [参与者去重] 发送方使用默认接收方昵称: 好友
```

**错误的系统消息（异常）**：
```
👥 [系统消息] ✅ 发送方消息已添加: 和好友建立了聊天
```

## 测试工具

### 控制台测试命令

```javascript
// 1. 测试阅后即焚保护
getCurrentPages()[getCurrentPages().length - 1].testBurnAfterReading();

// 2. 强制消息同步测试
getCurrentPages()[getCurrentPages().length - 1].forceMessageSync();

// 3. 测试参与者修复
getCurrentPages()[getCurrentPages().length - 1].testParticipantFix();

// 4. 检查当前状态
const page = getCurrentPages()[getCurrentPages().length - 1];
console.log('=== 当前状态检查 ===');
console.log('用户信息:', page.data.currentUser);
console.log('参与者:', page.data.participants);
console.log('标题:', page.data.dynamicTitle);
console.log('消息数量:', page.data.messages?.length || 0);
console.log('系统消息:', page.data.messages?.filter(m => m.isSystem).map(m => m.content));
```

## 回归测试

### 基本功能验证

1. **聊天创建**：发送方能正常创建聊天
2. **邀请分享**：分享链接功能正常
3. **加入聊天**：接收方能正常加入
4. **消息发送**：双方能正常发送消息
5. **消息接收**：双方能正常接收消息
6. **阅后即焚**：消息销毁功能正常

### 边界情况测试

1. **网络异常**：网络不稳定时的表现
2. **重复操作**：快速重复发送消息
3. **页面刷新**：页面重新加载后的状态
4. **多次匹配**：多次创建和加入聊天

## 修复确认清单

- [ ] 发送方不获取历史消息
- [ ] 发送方标题显示"我和Y.（2）"
- [ ] 接收方标题显示"我和向冬（2）"
- [ ] 发送方系统消息显示"和Y.建立了聊天"
- [ ] 接收方系统消息显示"您加入了向冬的聊天！"
- [ ] 双方消息收发正常
- [ ] 消息监听器无重复启动
- [ ] 阅后即焚功能正常
- [ ] 页面性能正常
- [ ] 无控制台错误

## 性能监控

### 关键指标

1. **消息延迟**：消息发送到接收的时间
2. **内存使用**：页面内存占用情况
3. **监听器数量**：避免监听器泄露
4. **云函数调用**：减少不必要的调用

### 监控命令

```javascript
// 检查监听器状态
const page = getCurrentPages()[getCurrentPages().length - 1];
console.log('活跃监听器:', {
  messageWatcher: !!page.messageWatcher,
  participantWatcher: !!page.participantWatcher,
  onlineStatusWatcher: !!page.onlineStatusWatcher
});

// 检查定时器状态
console.log('活跃定时器:', {
  messagePollingTimer: !!page.messagePollingTimer,
  burnAfterReadingTimer: !!page.burnAfterReadingTimer
});
```

## 问题排查

### 常见问题

1. **标题仍显示"好友"**
   - 检查参与者去重逻辑是否执行
   - 验证昵称获取是否成功

2. **发送方仍获取历史消息**
   - 检查身份识别逻辑
   - 验证消息监听器保护是否生效

3. **消息收发异常**
   - 检查监听器启动状态
   - 验证云函数调用是否成功

### 调试技巧

1. **开启详细日志**：查看所有相关日志输出
2. **分步验证**：逐个功能点进行测试
3. **状态对比**：修复前后状态对比
4. **清除缓存**：必要时清除本地缓存重新测试

这个测试指南确保了HOTFIX-v1.3.7修复的全面验证，涵盖了所有关键功能点和边界情况。 