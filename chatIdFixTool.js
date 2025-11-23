/**
 * 🔧 HOTFIX-v1.3.31 - chatId冲突修复工具
 * 
 * 问题：页面数据中设置了正确的chatId，但轮询仍在使用错误的chatId
 * 解决方案：完全重置轮询监听器，使用正确的chatId
 */

/**
 * 🔧 修复chatId冲突问题
 */
function fixChatIdConflict() {
  console.log('🔧 === 开始修复chatId冲突问题 ===');
  
  const currentPage = getCurrentPages()[getCurrentPages().length - 1];
  if (!currentPage) {
    console.error('❌ 无法获取当前页面');
    return;
  }
  
  const correctChatId = 'chat_1751717858982_w0egq6bp9';
  const pageData = currentPage.data;
  
  console.log('📊 当前状态检查:', {
    页面chatId: pageData.chatId,
    目标chatId: correctChatId,
    isFromInvite: pageData.isFromInvite,
    isSender: pageData.isSender,
    currentUser: pageData.currentUser?.openId
  });
  
  // 步骤1：停止所有现有的轮询和监听器
  console.log('🔧 步骤1: 停止现有轮询和监听器');
  
  // 清理轮询定时器
  if (currentPage.pollingTimer) {
    clearInterval(currentPage.pollingTimer);
    currentPage.pollingTimer = null;
    console.log('✅ 轮询定时器已清理');
  }
  
  // 清理消息监听器
  if (currentPage.messageListener) {
    currentPage.messageListener.close();
    currentPage.messageListener = null;
    console.log('✅ 消息监听器已清理');
  }
  
  // 清理参与者监听器
  if (currentPage.participantListener) {
    currentPage.participantListener.close();
    currentPage.participantListener = null;
    console.log('✅ 参与者监听器已清理');
  }
  
  // 步骤2：强制设置正确的chatId
  console.log('🔧 步骤2: 强制设置正确的chatId');
  
  currentPage.setData({
    chatId: correctChatId,
    isFromInvite: true,
    isSender: false,
    currentUser: {
      openId: 'ojtOs7cY5C-ik0I3J2__1lmwyCzE',
      nickName: 'jerala',
      avatarUrl: wx.getStorageSync('userInfo')?.avatarUrl || ''
    }
  }, () => {
    console.log('✅ 页面数据强制更新完成');
    
    // 步骤3：重新启动正确的轮询监听器
    console.log('🔧 步骤3: 重新启动正确的轮询监听器');
    
    // 启动正确的接收方轮询
    const pollingInterval = 3000; // 3秒轮询一次
    currentPage.pollingTimer = setInterval(() => {
      console.log('🔔 [修复后轮询] 使用正确的chatId进行轮询:', correctChatId);
      
      // 调用云函数获取消息
      wx.cloud.callFunction({
        name: 'getMessages',
        data: {
          chatId: correctChatId,
          limit: 20
        }
      }).then(res => {
        if (res.result && res.result.success) {
          const messages = res.result.messages || [];
          console.log('🔔 [修复后轮询] 获取到消息:', messages.length, '条');
          
          // 处理消息
          const currentUserOpenId = pageData.currentUser?.openId;
          const formattedMessages = messages.map(msg => {
            const isFromSelf = msg.senderId === currentUserOpenId;
            console.log('🔔 [修复后轮询] 消息处理:', {
              messageId: msg._id,
              senderId: msg.senderId,
              currentUserId: currentUserOpenId,
              isFromSelf: isFromSelf,
              content: msg.content?.substring(0, 20) + '...'
            });
            
            return {
              id: msg._id,
              senderId: msg.senderId,
              content: msg.content,
              timestamp: msg.sendTime ? msg.sendTime.getTime() : Date.now(),
              isSelf: isFromSelf,
              isSystem: msg.senderId === 'system',
              destroyTimeout: msg.destroyTimeout || 30,
              isDestroyed: false,
              type: 'text'
            };
          });
          
          // 更新消息列表
          currentPage.setData({
            messages: formattedMessages
          }, () => {
            console.log('✅ [修复后轮询] 消息列表已更新');
            if (currentPage.scrollToBottom) {
              currentPage.scrollToBottom();
            }
          });
        } else {
          console.warn('⚠️ [修复后轮询] 获取消息失败:', res.result);
        }
      }).catch(err => {
        console.error('❌ [修复后轮询] 云函数调用失败:', err);
      });
    }, pollingInterval);
    
    console.log('✅ 修复后轮询监听器已启动，间隔:', pollingInterval, 'ms');
    
    // 步骤4：启动实时监听器
    console.log('🔧 步骤4: 启动实时监听器');
    
    const db = wx.cloud.database();
    currentPage.messageListener = db.collection('messages').where({
      chatId: correctChatId
    }).watch({
      onChange: function(snapshot) {
        console.log('🔔 [修复后监听器] 检测到消息变化:', snapshot);
        
        if (!snapshot.docChanges || snapshot.docChanges.length === 0) {
          return;
        }
        
        snapshot.docChanges.forEach(change => {
          if (change.dataType === 'add') {
            const newMessage = change.doc.data();
            const isFromSelf = newMessage.senderId === currentUserOpenId;
            
            console.log('🔔 [修复后监听器] 新消息:', {
              id: newMessage._id,
              senderId: newMessage.senderId,
              isFromSelf: isFromSelf,
              content: newMessage.content?.substring(0, 20) + '...'
            });
            
            if (!isFromSelf) {
              // 检查消息是否已存在
              const existingMessages = currentPage.data.messages || [];
              const messageExists = existingMessages.some(msg => msg.id === newMessage._id);
              
              if (!messageExists) {
                const formattedMessage = {
                  id: newMessage._id,
                  senderId: newMessage.senderId,
                  content: newMessage.content,
                  timestamp: newMessage.sendTime ? newMessage.sendTime.getTime() : Date.now(),
                  isSelf: false,
                  isSystem: newMessage.senderId === 'system',
                  destroyTimeout: newMessage.destroyTimeout || 30,
                  isDestroyed: false,
                  type: 'text'
                };
                
                const updatedMessages = [...existingMessages, formattedMessage];
                currentPage.setData({
                  messages: updatedMessages
                }, () => {
                  console.log('✅ [修复后监听器] 新消息已添加');
                  if (currentPage.scrollToBottom) {
                    currentPage.scrollToBottom();
                  }
                });
              }
            }
          }
        });
      },
      onError: function(err) {
        console.error('❌ [修复后监听器] 错误:', err);
      }
    });
    
    console.log('✅ 修复后实时监听器已启动');
    
    // 步骤5：初始化获取消息
    console.log('🔧 步骤5: 初始化获取消息');
    
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        chatId: correctChatId,
        limit: 20
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const messages = res.result.messages || [];
        console.log('✅ 初始化获取消息成功:', messages.length, '条');
        
        const formattedMessages = messages.map(msg => {
          const isFromSelf = msg.senderId === currentUserOpenId;
          return {
            id: msg._id,
            senderId: msg.senderId,
            content: msg.content,
            timestamp: msg.sendTime ? msg.sendTime.getTime() : Date.now(),
            isSelf: isFromSelf,
            isSystem: msg.senderId === 'system',
            destroyTimeout: msg.destroyTimeout || 30,
            isDestroyed: false,
            type: 'text'
          };
        });
        
        currentPage.setData({
          messages: formattedMessages
        }, () => {
          console.log('✅ 初始化消息列表已设置');
          if (currentPage.scrollToBottom) {
            currentPage.scrollToBottom();
          }
        });
      }
    }).catch(err => {
      console.error('❌ 初始化获取消息失败:', err);
    });
    
    console.log('🔧 === chatId冲突修复完成 ===');
    console.log('📊 修复后状态:', {
      chatId: correctChatId,
      isFromInvite: true,
      isSender: false,
      轮询状态: '已启动',
      监听器状态: '已启动'
    });
  });
}

/**
 * 🧪 测试修复后的消息接收
 */
function testFixedMessageReceive() {
  console.log('🧪 === 测试修复后的消息接收 ===');
  
  const currentPage = getCurrentPages()[getCurrentPages().length - 1];
  if (!currentPage) {
    console.error('❌ 无法获取当前页面');
    return;
  }
  
  const pageData = currentPage.data;
  const correctChatId = 'chat_1751717858982_w0egq6bp9';
  
  console.log('📊 测试前状态检查:', {
    chatId: pageData.chatId,
    预期chatId: correctChatId,
    isFromInvite: pageData.isFromInvite,
    isSender: pageData.isSender,
    轮询器状态: !!currentPage.pollingTimer,
    监听器状态: !!currentPage.messageListener
  });
  
  if (pageData.chatId !== correctChatId) {
    console.error('❌ chatId不匹配，请先运行 fixChatIdConflict()');
    return;
  }
  
  console.log('🧪 开始30秒消息接收测试...');
  console.log('🧪 请在a端(openId: ojtOs7bA8w-ZdS1G_o5rdoeLzWDc)发送一条消息');
  
  let receivedCount = 0;
  const startTime = Date.now();
  
  // 监听消息变化
  const testInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`🧪 测试进行中... ${elapsed}/30秒 (已接收: ${receivedCount}条)`);
    
    if (elapsed >= 30) {
      clearInterval(testInterval);
      if (receivedCount > 0) {
        console.log('🧪 ✅ 测试成功！b端可以正常接收消息');
      } else {
        console.log('🧪 ❌ 测试失败：未接收到任何消息');
        console.log('🧪 建议检查：1. a端是否正常发送 2. chatId是否正确');
      }
    }
  }, 5000);
  
  // 记录消息数量变化
  const initialMessageCount = pageData.messages?.length || 0;
  const messageCountChecker = setInterval(() => {
    const currentMessageCount = currentPage.data.messages?.length || 0;
    if (currentMessageCount > initialMessageCount) {
      receivedCount = currentMessageCount - initialMessageCount;
      console.log(`🧪 ✅ 检测到新消息！当前总数: ${currentMessageCount}, 新增: ${receivedCount}`);
    }
  }, 1000);
  
  // 30秒后清理
  setTimeout(() => {
    clearInterval(testInterval);
    clearInterval(messageCountChecker);
  }, 30000);
}

console.log('🔧 chatId冲突修复工具已加载');
console.log('🔧 使用步骤：');
console.log('🔧 1. 运行: fixChatIdConflict()     // 修复chatId冲突');
console.log('🔧 2. 运行: testFixedMessageReceive() // 测试修复效果'); 