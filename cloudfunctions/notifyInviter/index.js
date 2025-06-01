// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
})

/**
 * 通知邀请者有新用户加入
 * @param {Object} event - 云函数调用参数
 * @param {string} event.chatId - 聊天ID
 * @param {string} event.joinerName - 加入者昵称
 * @param {string} event.inviterOpenId - 邀请者的openId
 * @returns {Object} 处理结果
 */
exports.main = async (event, context) => {
  console.log('[云函数] 通知邀请者，参数:', event);
  
  try {
    const { chatId, joinerName, inviterOpenId } = event;
    
    if (!chatId || !joinerName || !inviterOpenId) {
      return {
        success: false,
        error: '缺少必要参数'
      };
    }
    
    // 发送订阅消息通知邀请者（如果有权限）
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: inviterOpenId,
        templateId: 'your_template_id', // 需要在微信公众平台配置
        data: {
          thing1: {
            value: joinerName
          },
          thing2: {
            value: '有人加入了您的聊天'
          }
        }
      });
      
      console.log('[云函数] 订阅消息发送成功');
    } catch (msgError) {
      console.log('[云函数] 订阅消息发送失败（可能未配置或用户未订阅）:', msgError.message);
    }
    
    return {
      success: true,
      message: '通知发送完成'
    };
    
  } catch (error) {
    console.error('[云函数] 通知邀请者失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}; 