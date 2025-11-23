/**
 * 极简版 sendMessage 云函数
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
});

exports.main = async (event, context) => {
  console.log('🔥 [sendMessage] 云函数被调用，参数:', event);
  
  if (!event.chatId || !event.content || !event.type) {
    return {
      success: false,
      error: '参数不完整，需要chatId、content和type'
    };
  }
  
  const wxContext = cloud.getWXContext();
  
  // 🔥 优先使用前端传递的senderId
  const senderId = event.senderId || wxContext.OPENID;
  console.log('🔥 [sendMessage] 发送者ID:', {
    frontendSenderId: event.senderId,
    wxContextOpenId: wxContext.OPENID,
    finalSenderId: senderId
  });
  
  const db = cloud.database();
  const messagesCollection = db.collection('messages');
  const conversationsCollection = db.collection('conversations');
  
  try {
    const messageId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    const messageData = {
      _id: messageId,
      chatId: event.chatId,
      senderId: senderId,
      receiverId: event.receiverId || 'group',
      type: event.type,
      content: event.content,
      sendTime: db.serverDate(),
      status: 'sent',
      destroyed: false,
      viewTime: null,
      destroyTime: null,
      destroyTimeout: event.destroyTimeout || 30
    };
    
    console.log('🔥 [sendMessage] 准备保存消息:', messageData);
    
    await messagesCollection.add({
      data: messageData
    });
    
    console.log('🔥 [sendMessage] 消息保存成功');
    
    const lastMessagePreview = event.type === 'text' ? 
      event.content.substring(0, 20) : 
      `[${event.type === 'image' ? '图片' : (event.type === 'voice' ? '语音' : (event.type === 'video' ? '视频' : '消息'))}]`;
    
    // 🚨 【HOTFIX-v1.3.27】确保发送者在participants列表中
    try {
      console.log('🔥 [sendMessage] 检查并更新participants列表');
      
      // 先获取当前conversation
      const conversationResult = await conversationsCollection.doc(event.chatId).get();
      
      if (conversationResult.data) {
        const conversation = conversationResult.data;
        const participants = conversation.participants || [];
        
        console.log('🔥 [sendMessage] 当前participants:', participants.length, '人');
        
        // 检查发送者是否已在participants中
        const isInParticipants = participants.some(p => 
          (typeof p === 'object' && (p.id === senderId || p.openId === senderId)) || 
          p === senderId
        );
        
        console.log('🔥 [sendMessage] 发送者是否在participants中:', isInParticipants);
        
        if (!isInParticipants) {
          console.log('🔥 [sendMessage] 🆘 发送者不在participants中，自动添加');
          
          // 🔥 【HOTFIX-v1.3.29】强化用户信息获取逻辑，防止身份混淆
          let senderInfo = null;
          
          // 策略1：严格验证并使用前端传递的当前用户信息
          if (event.currentUserInfo && event.currentUserInfo.nickName) {
            console.log('🔥 [sendMessage] 前端传递的用户信息:', {
              senderId: senderId,
              frontendNickName: event.currentUserInfo.nickName,
              frontendAvatarUrl: event.currentUserInfo.avatarUrl
            });
            
            // 🔥 严格验证：确保前端传递的信息与senderId一致
            if (event.currentUserInfo.nickName && event.currentUserInfo.nickName !== '用户') {
              senderInfo = {
                id: senderId,
                openId: senderId,
                nickName: event.currentUserInfo.nickName,
                name: event.currentUserInfo.nickName,
                avatarUrl: event.currentUserInfo.avatarUrl || '/assets/images/default-avatar.png',
                isCreator: participants.length === 0,
                isJoiner: participants.length > 0,
                joinTime: db.serverDate()
              };
              console.log('🔥 [sendMessage] ✅ 使用前端传递的当前用户信息:', senderInfo);
            } else {
              console.log('🔥 [sendMessage] ⚠️ 前端传递的昵称无效，跳过使用');
            }
          } else {
            console.log('🔥 [sendMessage] ⚠️ 前端未传递有效的currentUserInfo');
          }
          
          // 策略2：从users集合获取发送者信息（加强验证）
          if (!senderInfo) {
            try {
              console.log('🔥 [sendMessage] 尝试从users集合获取用户信息，openId:', senderId);
              const userResult = await db.collection('users').where({ openId: senderId }).limit(1).get();
              console.log('🔥 [sendMessage] users集合查询结果:', userResult);
              
              if (userResult.data && userResult.data.length > 0) {
                const userData = userResult.data[0];
                console.log('🔥 [sendMessage] 从users集合获取的原始数据:', userData);
                
                // 🔥 严格验证：确保获取的数据确实属于当前senderId
                if (userData.openId === senderId) {
                  const dbNickName = userData.nickName || userData.userInfo?.nickName || '用户';
                  const dbAvatarUrl = userData.avatarUrl || userData.userInfo?.avatarUrl || '/assets/images/default-avatar.png';
                  
                  senderInfo = {
                    id: senderId,
                    openId: senderId,
                    nickName: dbNickName,
                    name: dbNickName,
                    avatarUrl: dbAvatarUrl,
                    isCreator: participants.length === 0,
                    isJoiner: participants.length > 0,
                    joinTime: db.serverDate()
                  };
                  console.log('🔥 [sendMessage] ✅ 从users集合获取发送者信息:', senderInfo);
                } else {
                  console.log('🔥 [sendMessage] ❌ 数据库返回的openId不匹配，可能存在数据污染');
                  console.log('🔥 [sendMessage] 期望openId:', senderId);
                  console.log('🔥 [sendMessage] 实际openId:', userData.openId);
                }
              } else {
                console.log('🔥 [sendMessage] ⚠️ users集合中未找到用户信息');
              }
            } catch (userErr) {
              console.log('🔥 [sendMessage] 获取users信息失败:', userErr.message);
            }
          }
          
          // 策略3：如果没有获取到用户信息，使用默认信息
          if (!senderInfo) {
            senderInfo = {
              id: senderId,
              openId: senderId,
              nickName: '用户',
              name: '用户',
              avatarUrl: '/assets/images/default-avatar.png',
              isCreator: participants.length === 0,
              isJoiner: participants.length > 0,
              joinTime: db.serverDate()
            };
            console.log('🔥 [sendMessage] 使用默认发送者信息:', senderInfo);
          }
          
          // 添加到participants列表
          const updatedParticipants = [...participants, senderInfo];
          console.log('🔥 [sendMessage] 更新后participants数量:', updatedParticipants.length);
          
          // 更新conversation
          await conversationsCollection.doc(event.chatId).update({
            data: {
              participants: updatedParticipants,
              lastMessage: lastMessagePreview,
              lastMessageTime: db.serverDate(),
              lastMessageSender: senderId,
              updateTime: db.serverDate(),
              status: 'active',
              chatStarted: true
            }
          });
          
          console.log('🔥 [sendMessage] ✅ participants列表已更新，发送者已添加');
        } else {
          // 发送者已在列表中，只更新基本信息
          await conversationsCollection.doc(event.chatId).update({
            data: {
              lastMessage: lastMessagePreview,
              lastMessageTime: db.serverDate(),
              lastMessageSender: senderId,
              updateTime: db.serverDate()
            }
          });
          console.log('🔥 [sendMessage] 会话更新成功，发送者已在participants中');
        }
      } else {
        console.log('🔥 [sendMessage] 会话不存在，跳过participants更新');
      }
    } catch (updateErr) {
      console.log('🔥 [sendMessage] 更新会话失败:', updateErr.message);
    }
    
    return {
      success: true,
      messageId: messageId,
      chatId: event.chatId,
      senderId: senderId
    };
    
  } catch (error) {
    console.error('🔥 [sendMessage] 错误:', error);
    return {
      success: false,
      error: error.message
    };
  }
}; 