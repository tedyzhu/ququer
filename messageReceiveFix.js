/**
 * 🔧 HOTFIX-v1.3.30 - b端消息接收问题诊断和修复工具
 * 
 * 问题：b端始终无法接收到a端发送的消息，但a端能正常接收b端发送的消息
 * 解决方案：诊断并修复b端消息监听和身份识别问题
 */

/**
 * 🔍 第1步：诊断b端消息接收状态
 * 在b端小程序控制台中运行此函数
 */
function diagnoseBMessageReceive() {
  console.log('🔍 === b端消息接收问题诊断开始 ===');
  
  // 获取当前页面实例
  const currentPage = getCurrentPages()[getCurrentPages().length - 1];
  if (!currentPage) {
    console.error('❌ 无法获取当前页面实例');
    return;
  }
  
  // 检查基本状态
  const pageData = currentPage.data;
  console.log('📊 页面基本状态:', {
    chatId: pageData.chatId,
    isFromInvite: pageData.isFromInvite,
    isSender: pageData.isSender,
    currentUser: pageData.currentUser,
    participants: pageData.participants?.length || 0,
    messages: pageData.messages?.length || 0
  });
  
  // 检查身份信息
  const currentUser = pageData.currentUser;
  if (!currentUser) {
    console.error('❌ currentUser为空，这是严重问题！');
    return;
  }
  
  console.log('👤 当前用户身份:', {
    openId: currentUser.openId,
    nickName: currentUser.nickName,
    isFromInvite: pageData.isFromInvite,
    isSender: pageData.isSender
  });
  
  // 检查参与者信息
  const participants = pageData.participants || [];
  console.log('👥 参与者列表:');
  participants.forEach((participant, index) => {
    console.log(`参与者${index + 1}:`, {
      id: participant.id || participant.openId,
      nickName: participant.nickName,
      isSelf: participant.id === currentUser.openId || participant.openId === currentUser.openId
    });
  });
  
  // 检查消息监听器状态
  if (currentPage.messageListener) {
    console.log('✅ 消息监听器已启动');
  } else {
    console.error('❌ 消息监听器未启动！');
  }
  
  // 检查参与者监听器状态
  if (currentPage.participantListener) {
    console.log('✅ 参与者监听器已启动');
  } else {
    console.error('❌ 参与者监听器未启动！');
  }
  
  console.log('🔍 === 诊断完成，请查看上述信息 ===');
}

/**
 * 🔧 第2步：修复b端消息接收问题
 * 在b端小程序控制台中运行此函数
 */
function fixBMessageReceive() {
  console.log('🔧 === 开始修复b端消息接收问题 ===');
  
  const currentPage = getCurrentPages()[getCurrentPages().length - 1];
  if (!currentPage) {
    console.error('❌ 无法获取当前页面实例');
    return;
  }
  
  const pageData = currentPage.data;
  const currentUser = pageData.currentUser;
  
  if (!currentUser) {
    console.error('❌ currentUser为空，无法修复');
    return;
  }
  
  console.log('🔧 步骤1: 重新启动消息监听器');
  
  // 清理现有监听器
  if (currentPage.messageListener) {
    console.log('🔧 清理现有消息监听器');
    currentPage.messageListener.close();
    currentPage.messageListener = null;
  }
  
  // 重新启动消息监听器（增强版）
  const chatId = pageData.chatId;
  if (!chatId) {
    console.error('❌ chatId为空，无法启动监听器');
    return;
  }
  
  console.log('🔧 启动增强版消息监听器，chatId:', chatId);
  
  const db = wx.cloud.database();
  currentPage.messageListener = db.collection('messages').where({
    chatId: chatId
  }).watch({
    onChange: function(snapshot) {
      console.log('🔔 [增强监听器] 检测到消息变化:', snapshot);
      
      if (!snapshot.docChanges || snapshot.docChanges.length === 0) {
        console.log('🔔 [增强监听器] 无消息变化，跳过处理');
        return;
      }
      
      // 处理每个消息变化
      snapshot.docChanges.forEach((change, index) => {
        console.log(`🔔 [增强监听器] 处理变化${index + 1}:`, change);
        
        if (change.dataType === 'add') {
          const newMessage = change.doc.data();
          console.log('🔔 [增强监听器] 检测到新消息:', {
            id: newMessage._id,
            senderId: newMessage.senderId,
            content: newMessage.content.substring(0, 20) + '...',
            timestamp: newMessage.sendTime
          });
          
          // 增强的身份判断逻辑
          const isFromSelf = isMessageFromCurrentUser(newMessage.senderId, currentUser.openId);
          console.log('🔔 [增强监听器] 身份判断结果:', {
            senderId: newMessage.senderId,
            currentUserId: currentUser.openId,
            isFromSelf: isFromSelf
          });
          
          if (!isFromSelf) {
            console.log('🔔 [增强监听器] 这是对方发送的新消息，准备添加到界面');
            
            // 检查消息是否已存在
            const existingMessages = pageData.messages || [];
            const messageExists = existingMessages.some(msg => msg.id === newMessage._id);
            
            if (!messageExists) {
              // 格式化新消息
              const formattedMessage = {
                id: newMessage._id,
                senderId: newMessage.senderId,
                content: newMessage.content,
                timestamp: newMessage.sendTime ? newMessage.sendTime.getTime() : Date.now(),
                isSelf: false,
                isSystem: newMessage.senderId === 'system',
                destroyTimeout: newMessage.destroyTimeout || 10,
                isDestroyed: false,
                type: 'text'
              };
              
              // 添加到消息列表
              const updatedMessages = [...existingMessages, formattedMessage];
              
              currentPage.setData({
                messages: updatedMessages
              }, () => {
                console.log('✅ [增强监听器] 新消息已添加到界面');
                // 滚动到底部
                if (currentPage.scrollToBottom) {
                  currentPage.scrollToBottom();
                }
              });
            } else {
              console.log('ℹ️ [增强监听器] 消息已存在，跳过添加');
            }
          } else {
            console.log('🔔 [增强监听器] 这是自己发送的消息，跳过处理');
          }
        }
      });
    },
    onError: function(err) {
      console.error('❌ [增强监听器] 监听错误:', err);
    }
  });
  
  console.log('✅ 增强版消息监听器启动成功');
  
  console.log('🔧 步骤2: 刷新消息列表');
  // 获取最新消息
  wx.cloud.callFunction({
    name: 'getMessages',
    data: {
      chatId: chatId,
      limit: 20
    }
  }).then(res => {
    if (res.result && res.result.success) {
      const messages = res.result.messages || [];
      console.log('✅ 获取到最新消息:', messages.length, '条');
      
      // 处理并显示消息
      const formattedMessages = messages.map(msg => {
        const isFromSelf = isMessageFromCurrentUser(msg.senderId, currentUser.openId);
        return {
          id: msg._id,
          senderId: msg.senderId,
          content: msg.content,
          timestamp: msg.sendTime ? msg.sendTime.getTime() : Date.now(),
          isSelf: isFromSelf,
          isSystem: msg.senderId === 'system',
          destroyTimeout: msg.destroyTimeout || 10,
          isDestroyed: false,
          type: 'text'
        };
      });
      
      currentPage.setData({
        messages: formattedMessages
      }, () => {
        console.log('✅ 消息列表已刷新');
        if (currentPage.scrollToBottom) {
          currentPage.scrollToBottom();
        }
      });
    } else {
      console.error('❌ 获取消息失败:', res.result);
    }
  }).catch(err => {
    console.error('❌ 调用getMessages云函数失败:', err);
  });
  
  console.log('🔧 === 修复完成 ===');
}

/**
 * 🔍 增强的身份判断函数
 */
function isMessageFromCurrentUser(senderId, currentUserId) {
  if (!senderId || !currentUserId) {
    return false;
  }
  
  // 精确匹配
  if (senderId === currentUserId) {
    return true;
  }
  
  // 处理不同格式的ID
  const senderNumeric = extractNumericId(senderId);
  const currentNumeric = extractNumericId(currentUserId);
  
  if (senderNumeric && currentNumeric && senderNumeric === currentNumeric) {
    return true;
  }
  
  return false;
}

/**
 * 🔍 提取ID中的数字部分
 */
function extractNumericId(id) {
  if (!id) return null;
  
  // 提取local_开头的数字
  const localMatch = id.match(/local_(\d+)/);
  if (localMatch) {
    return localMatch[1];
  }
  
  // 提取纯数字
  const numericMatch = id.match(/(\d+)/);
  if (numericMatch) {
    return numericMatch[1];
  }
  
  return null;
}

/**
 * 🧪 第3步：测试消息接收功能
 * 在b端小程序控制台中运行此函数
 */
function testBMessageReceive() {
  console.log('🧪 === 测试b端消息接收功能 ===');
  
  const currentPage = getCurrentPages()[getCurrentPages().length - 1];
  if (!currentPage || !currentPage.data.chatId) {
    console.error('❌ 无法获取聊天信息');
    return;
  }
  
  const chatId = currentPage.data.chatId;
  const currentUser = currentPage.data.currentUser;
  
  console.log('🧪 监听新消息，请在a端发送一条消息...');
  console.log('🧪 聊天ID:', chatId);
  console.log('🧪 当前用户:', currentUser.openId, currentUser.nickName);
  
  // 设置30秒监听
  let messageCount = 0;
  const startTime = Date.now();
  
  const testInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`🧪 等待新消息... ${elapsed}/30秒`);
    
    if (elapsed >= 30) {
      clearInterval(testInterval);
      console.log('🧪 测试超时，请检查a端是否发送了消息');
    }
  }, 5000);
  
  // 临时监听器用于测试
  const testListener = wx.cloud.database().collection('messages').where({
    chatId: chatId
  }).watch({
    onChange: function(snapshot) {
      if (snapshot.docChanges && snapshot.docChanges.length > 0) {
        snapshot.docChanges.forEach(change => {
          if (change.dataType === 'add') {
            const newMessage = change.doc.data();
            const isFromSelf = isMessageFromCurrentUser(newMessage.senderId, currentUser.openId);
            
            if (!isFromSelf) {
              messageCount++;
              console.log(`🧪 ✅ 成功接收到新消息${messageCount}:`, {
                id: newMessage._id,
                content: newMessage.content,
                senderId: newMessage.senderId
              });
              
              clearInterval(testInterval);
              testListener.close();
              console.log('🧪 === 测试成功！b端可以正常接收a端消息 ===');
            }
          }
        });
      }
    },
    onError: function(err) {
      console.error('🧪 ❌ 测试监听器错误:', err);
      clearInterval(testInterval);
    }
  });
  
  // 30秒后自动清理
  setTimeout(() => {
    clearInterval(testInterval);
    testListener.close();
    if (messageCount === 0) {
      console.log('🧪 ❌ 测试失败：未接收到任何新消息');
      console.log('🧪 建议：1. 检查a端是否正常发送 2. 运行 fixBMessageReceive() 修复');
    }
  }, 30000);
}

console.log('🔧 b端消息接收修复工具已加载');
console.log('🔧 使用步骤：');
console.log('🔧 1. 在b端运行: diagnoseBMessageReceive()  // 诊断问题');
console.log('🔧 2. 在b端运行: fixBMessageReceive()      // 修复问题');
console.log('🔧 3. 在b端运行: testBMessageReceive()     // 测试修复效果'); 