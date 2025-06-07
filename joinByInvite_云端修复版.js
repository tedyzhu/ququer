const cloud = require('wx-server-sdk')

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
})

const db = cloud.database()

/**
 * 通过邀请加入聊天
 */
exports.main = async (event, context) => {
  console.log('[joinByInvite] 输入参数:', event)
  
  try {
    const wxContext = cloud.getWXContext()
    const userId = event.joiner?.openId || wxContext.OPENID
    const userName = event.joiner?.nickName || '用户'
    const userAvatar = event.joiner?.avatarUrl || '/assets/images/avatar1.png'
    
    // 检查必要参数
    if (!event.chatId) {
      return {
        success: false,
        error: '缺少聊天ID参数'
      }
    }
    
    // 查询聊天是否存在
    const chatResult = await db.collection('conversations')
      .doc(event.chatId)
      .get()
      .catch(err => {
        console.log('[joinByInvite] 聊天查询失败:', err.message)
        return { data: null }
      })
    
    if (!chatResult.data) {
      return {
        success: false,
        error: '聊天不存在或已过期'
      }
    }
    
    const chat = chatResult.data
    const participants = chat.participants || []
    
    // 检查用户是否已在参与者列表中
    const isUserInChat = participants.some(p => 
      (typeof p === 'object' && p.id === userId) || p === userId
    )
    
    // 构建用户信息对象
    const userInfo = {
      id: userId,
      nickName: userName,
      avatarUrl: userAvatar,
      joinTime: db.serverDate(),
      isJoiner: true
    }
    
    let newParticipants = participants
    
    // 如果用户不在列表中，添加到参与者列表
    if (!isUserInChat) {
      newParticipants = [...participants, userInfo]
      
      // 添加系统消息
      await db.collection('messages').add({
        data: {
          chatId: event.chatId,
          type: 'system',
          content: `${userName}加入了私密聊天`,
          sendTime: db.serverDate(),
          status: 'sent'
        }
      })
    }
    
    // 更新聊天记录
    await db.collection('conversations')
      .doc(event.chatId)
      .update({
        data: {
          participants: newParticipants,
          status: 'active',
          chatStarted: true,
          updateTime: db.serverDate()
        }
      })
    
    // 通知邀请者（如果有）
    if (chat.inviter && chat.inviter.openId) {
      try {
        await cloud.callFunction({
          name: 'notifyInviter',
          data: {
            chatId: event.chatId,
            joinerName: userName,
            inviterOpenId: chat.inviter.openId
          }
        })
        console.log('[joinByInvite] 邀请者通知发送成功')
      } catch (notifyError) {
        console.log('[joinByInvite] 邀请者通知发送失败:', notifyError.message)
      }
    }
    
    // 返回成功结果 - 重要：必须包含success字段
    return {
      success: true,
      chatId: event.chatId,
      message: isUserInChat ? '用户已在聊天中' : '成功加入聊天',
      participants: newParticipants,
      chatStarted: true,
      needsNavigation: true,
      chat: {
        ...chat,
        participants: newParticipants,
        status: 'active',
        chatStarted: true
      }
    }
    
  } catch (error) {
    console.error('[joinByInvite] 错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
} 