// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
})

const db = cloud.database()
const _ = db.command

/**
 * 更新聊天状态
 * @param {Object} event - 云函数调用参数
 * @param {string} event.chatId - 聊天ID
 * @param {string} event.status - 聊天状态 (active/waiting/expired)
 * @param {boolean} event.chatStarted - 聊天是否已开始
 * @returns {Object} 处理结果
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID
  
  console.log('[云函数] 更新聊天状态，参数:', event);
  
  // 检查必要参数
  if (!event.chatId) {
    return {
      success: false,
      error: '缺少聊天ID参数'
    }
  }
  
  try {
    // 查询聊天是否存在
    const chatResult = await db.collection('conversations')
      .doc(event.chatId)
      .get()
      .catch(err => {
        console.log('聊天不存在:', err)
        return { data: null }
      })
    
    // 如果聊天不存在
    if (!chatResult.data) {
      return {
        success: false,
        error: '聊天不存在或已过期'
      }
    }
    
    // 准备更新数据
    const updateData = {
      updateTime: db.serverDate()
    }
    
    // 如果提供了状态参数，则更新状态
    if (event.status) {
      updateData.status = event.status
    }
    
    // 如果提供了chatStarted参数，则更新chatStarted
    if (event.chatStarted !== undefined) {
      updateData.chatStarted = !!event.chatStarted
    }
    
    // 更新聊天状态
    await db.collection('conversations')
      .doc(event.chatId)
      .update({
        data: updateData
      })
    
    // 如果状态变为active且标记为开始聊天，添加系统消息
    if (event.status === 'active' && event.chatStarted === true) {
      // 添加系统消息
      await db.collection('messages').add({
        data: {
          chatId: event.chatId,
          type: 'system',
          content: '聊天已开始',
          sendTime: db.serverDate(),
          status: 'sent'
        }
      })
    }
    
    return {
      success: true,
      message: '聊天状态已更新',
      updateData
    }
    
  } catch (error) {
    console.error('更新聊天状态失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
} 