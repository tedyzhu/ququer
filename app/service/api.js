/**
 * API服务模块
 * 集中处理前端与云函数的交互
 */

/**
 * 初始化云环境
 */
function initCloud() {
  if (!wx.cloud) {
    console.error('请使用2.2.3或以上的基础库以使用云能力');
    return false;
  }
  
  // 初始化云开发
  wx.cloud.init({
    env: 'ququer-env-6g35f0nv28c446e7', // 使用提供的云环境ID
    traceUser: true,
    // 添加安全相关配置，解决SharedArrayBuffer警告
    securityHeaders: {
      enableCrossOriginIsolation: true
    }
  });
  
  return true;
}

/**
 * 调用云函数的通用方法
 * @param {String} name - 云函数名称
 * @param {Object} data - 参数
 * @returns {Promise<Object>} 返回Promise对象
 */
function callFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: res => {
        if (res.result && res.result.success) {
          resolve(res.result);
        } else {
          const error = (res.result && res.result.error) || '请求失败';
          console.error(`调用云函数${name}失败:`, error);
          reject(error);
        }
      },
      fail: err => {
        console.error(`调用云函数${name}失败:`, err);
        reject(err);
      }
    });
  });
}

/**
 * 用户登录
 * @param {Object} userInfo - 用户信息
 * @returns {Promise<Object>} 登录结果
 */
function login(userInfo) {
  return callFunction('login', { userInfo });
}

/**
 * 获取会话列表
 * @returns {Promise<Array>} 会话列表
 */
function getConversations() {
  return callFunction('getConversations');
}

/**
 * 获取消息列表
 * @param {String} targetUserId - 目标用户ID
 * @returns {Promise<Array>} 消息列表
 */
function getMessages(targetUserId) {
  return callFunction('getMessages', { targetUserId });
}

/**
 * 发送消息
 * @param {String} receiverId - 接收者ID
 * @param {String} content - 消息内容
 * @param {String} type - 消息类型 text/image/voice/video
 * @param {String} fileId - 媒体文件ID（非文本消息）
 * @param {Number} destroyTimeout - 销毁倒计时（秒）
 * @returns {Promise<Object>} 发送结果
 */
function sendMessage(receiverId, content, type = 'text', fileId = '', destroyTimeout = 10) {
  return callFunction('sendMessage', {
    receiverId,
    content,
    type,
    fileId,
    destroyTimeout
  });
}

/**
 * 销毁消息
 * @param {String} messageId - 消息ID
 * @returns {Promise<Object>} 销毁结果
 */
function destroyMessage(messageId) {
  return callFunction('destroyMessage', { messageId });
}

/**
 * 上传文件到云存储
 * @param {String} filePath - 文件本地路径
 * @param {String} folder - 存储文件夹
 * @returns {Promise<String>} 文件ID
 */
function uploadFile(filePath, folder = 'images') {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const extension = filePath.substring(filePath.lastIndexOf('.'));
    const cloudPath = `${folder}/${timestamp}${extension}`;
    
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: res => {
        resolve(res.fileID);
      },
      fail: err => {
        console.error('上传文件失败:', err);
        reject(err);
      }
    });
  });
}

// 导出API
module.exports = {
  initCloud,
  login,
  getConversations,
  getMessages,
  sendMessage,
  destroyMessage,
  uploadFile
}; 