// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
})

const db = cloud.database()
const _ = db.command

/**
 * 通知聊天创建者加入状态
 * @param {Object} event - 云函数调用参数
 * @param {string} event.chatId - 聊天ID
 * @param {string} event.joinerName - 加入者名称
 * @param {string} event.joinerAvatar - 加入者头像
 * @returns {Object} 处理结果
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID
  
  console.log('[云函数] 通知创建者，参数:', event);
  
  // 检查必要参数
  if (!event.chatId) {
    return {
      success: false,
      error: '缺少聊天ID参数'
    }
  }
  
  try {
    // 查询聊天信息
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
    
    // 获取聊天创建者信息
    const chat = chatResult.data
    const creator = chat.creator || ''
    
    // 如果没有创建者信息，无法发送通知
    if (!creator) {
      return {
        success: false,
        error: '找不到聊天创建者信息'
      }
    }
    
    // 更新聊天状态为active并标记为已开始
    await db.collection('conversations')
      .doc(event.chatId)
      .update({
        data: {
          status: 'active',
          chatStarted: true,
          lastActive: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    
    // 添加系统消息，通知创建者有人加入
    const joinerName = event.joinerName || '用户'
    await db.collection('messages').add({
      data: {
        chatId: event.chatId,
        type: 'system',
        content: `${joinerName} 已加入聊天，聊天开始`,
        sendTime: db.serverDate(),
        status: 'sent',
        important: true // 标记为重要消息，确保在UI中高亮显示
      }
    })
    
    // 尝试发送模板消息给创建者（如果配置了）
    // 注意：实际发送模板消息需要额外配置，这里仅作为示例
    try {
      // TODO: 实现模板消息推送
      // 这里需要额外实现或者使用微信官方的消息推送机制
    } catch (e) {
      console.error('发送通知失败:', e)
      // 不影响主流程，所以只记录错误不抛出
    }
    
    return {
      success: true,
      message: '已通知创建者',
      chatId: event.chatId
    }
    
  } catch (error) {
    console.error('通知创建者失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
} 