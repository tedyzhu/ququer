const cloud = require('wx-server-sdk')

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
})

const db = cloud.database()

exports.main = async (event, context) => {
  console.log('[createInvite] 输入参数:', event)
  
  try {
    const wxContext = cloud.getWXContext()
    const userId = event.inviter?.openId || wxContext.OPENID
    
    const chatId = event.chatId || 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    
    const inviterInfo = {
      id: userId,
      openId: userId,
      nickName: event.inviter?.nickName || '邀请者',
      avatarUrl: event.inviter?.avatarUrl || '/assets/images/avatar1.png',
      isCreator: true,
      joinTime: db.serverDate()
    }
    
    const chatData = {
      status: 'waiting',
      inviter: inviterInfo,
      participants: [inviterInfo],
      chatStarted: false,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
    
    console.log('[createInvite] 准备创建聊天:', chatId)
    
    await db.collection('conversations').doc(chatId).set({
      data: chatData
    })
    
    console.log('[createInvite] 创建成功')
    
    return {
      success: true,
      chatId: chatId,
      inviter: inviterInfo,
      chat: chatData
    }
    
  } catch (error) {
    console.error('[createInvite] 错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
} 