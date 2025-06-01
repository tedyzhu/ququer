// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
})

const db = cloud.database()

/**
 * 获取聊天信息云函数
 * @param {Object} event - 云函数调用参数
 * @param {string} event.chatId - 聊天ID
 * @returns {Object} 处理结果，包含聊天信息
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { chatId } = event
  
  console.log('[云函数] 获取聊天信息，参数:', event)
  console.log('[云函数] wxContext:', wxContext)
  
  try {
    if (!chatId) {
      return {
        success: false,
        error: '聊天ID不能为空'
      }
    }
    
    // 从conversations集合中查找聊天信息
    const chatResult = await db.collection('conversations')
      .doc(chatId)
      .get()
    
    if (chatResult.data) {
      console.log('[云函数] 找到聊天信息:', chatResult.data)
      
      return {
        success: true,
        chat: chatResult.data,
        exists: true
      }
    } else {
      console.log('[云函数] 未找到聊天信息:', chatId)
      
      return {
        success: true,
        chat: null,
        exists: false
      }
    }
    
  } catch (error) {
    console.error('[云函数] 获取聊天信息失败:', error)
    
    return {
      success: false,
      error: error.message,
      errorType: error.constructor.name
    }
  }
} 