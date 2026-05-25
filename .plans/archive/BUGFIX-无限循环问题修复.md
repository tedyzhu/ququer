# 秘信小程序聊天页面无限循环问题修复

## 问题描述

从用户日志中发现聊天页面陷入无限循环，同一个聊天ID `chat_1748655310101_7ga096a24` 被重复加载了几十次，输出的日志不断重复：

```
[邀请流程] 处理聊天状态: active
开始加载聊天记录，chatId: chat_1748655310101_7ga096a24
[邀请流程] 开始加载聊天信息: chat_1748655310101_7ga096a24
[邀请流程] 从全局数据获取到聊天信息: {_id: "...", status: "active", chatStarted: true, ...}
```

## 问题原因分析

1. **页面重复加载**: `onLoad` 生命周期函数被重复触发，没有防重复执行的保护机制
2. **消息获取重复调用**: `fetchMessages` 方法缺少防重复调用的保护
3. **全局数据循环引用**: 全局的 `currentChatInfo` 数据可能导致页面逻辑判断错误
4. **定时器未清理**: 页面切换时定时器没有被正确清理
5. **状态标志未重置**: 页面卸载时加载状态标志没有重置

## 修复方案

### 1. 添加页面加载防重复机制

在 `onLoad` 方法开头添加 `_isLoading` 标志检查：

```javascript
onLoad: function (options) {
  // 防止重复执行
  if (this._isLoading) {
    console.log('[邀请流程] 页面正在加载中，跳过重复执行');
    return;
  }
  this._isLoading = true;
  
  // ... 现有代码 ...
  
  // 页面加载完成，重置加载标志
  this._isLoading = false;
}
```

### 2. 添加消息获取防重复机制

在 `fetchMessages` 方法中添加 `_isFetchingMessages` 标志：

```javascript
fetchMessages: function () {
  // 防止重复调用
  if (this._isFetchingMessages) {
    console.log('[邀请流程] 消息加载中，跳过重复调用');
    return;
  }
  this._isFetchingMessages = true;
  
  // 检查全局数据，避免不必要的云函数调用
  const app = getApp();
  if (app.globalData.currentChatInfo && 
      app.globalData.currentChatInfo._id === this.data.contactId &&
      app.globalData.currentChatInfo.status === 'active' &&
      app.globalData.currentChatInfo.chatStarted) {
    this._isFetchingMessages = false;
    this.showMockMessages();
    return;
  }
  
  // ... 云函数调用 ...
}
```

### 3. 完善页面生命周期管理

添加 `onUnload`、`onHide`、`onShow` 生命周期函数：

```javascript
onUnload: function () {
  // 清理定时器
  this.stopChatCreationCheck();
  
  // 重置所有加载标志
  this._isLoading = false;
  this._isFetchingMessages = false;
  
  // 清理其他定时器
  if (this.refreshTimer) {
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }
},

onHide: function () {
  // 暂停定时器
  if (this.chatCreationTimer) {
    clearInterval(this.chatCreationTimer);
    this.chatCreationTimer = null;
  }
},

onShow: function () {
  // 恢复必要的定时器
  if (this.data.isCreatingChat && !this.chatCreationTimer) {
    this.startChatCreationCheck();
  }
}
```

### 4. 添加定时器清理方法

创建专门的定时器清理方法：

```javascript
stopChatCreationCheck: function() {
  console.log('[邀请流程] 停止聊天创建状态检查');
  
  if (this.chatCreationTimer) {
    clearInterval(this.chatCreationTimer);
    this.chatCreationTimer = null;
  }
  
  this.setData({
    isCreatingChat: false,
    chatCreationStatus: '',
    createChatRetryCount: 0
  });
}
```

### 5. 增强测试页面功能

在测试页面添加无限循环检测和修复功能：

- `testInfiniteLoop()`: 检测可能导致循环的数据
- `clearAllChatCache()`: 清理所有聊天缓存
- `restartChatTest()`: 重启聊天页面测试

## 部署步骤

1. **更新聊天页面代码**
   - 修改 `app/pages/chat/chat.js`
   - 添加防重复执行机制
   - 完善生命周期管理

2. **更新测试页面**
   - 修改 `app/pages/test/test.js`
   - 添加循环检测功能
   - 更新UI界面

3. **测试验证**
   - 使用测试页面的"检测无限循环"功能
   - 清理可能的缓存数据
   - 重新测试聊天流程

## 预期效果

1. **消除无限循环**: 页面不再重复加载
2. **提升性能**: 减少不必要的云函数调用
3. **更好的用户体验**: 页面加载更快，响应更及时
4. **稳定的状态管理**: 页面切换时状态正确清理

## 使用方法

1. 进入测试页面 `app/pages/test/test`
2. 点击"检测无限循环"按钮检查当前状态
3. 点击"清理聊天缓存"清除可能的问题数据
4. 点击"重启聊天测试"验证修复效果

## 注意事项

- 如果问题仍然存在，可能是其他页面或组件导致的循环调用
- 建议在真机上测试，模拟器可能有不同的行为
- 定期清理本地存储中的聊天缓存数据
- 监控云函数调用量，避免超出配额 