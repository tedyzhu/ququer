/**
 * 🔥 彻底删除消息云函数
 * 用于处理阅后即焚消息的彻底删除，不保留任何痕迹
 */

const cloud = require('wx-server-sdk');

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 彻底删除消息云函数入口
 * @param {Object} event - 云函数参数
 * @param {string} event.messageId - 要删除的消息ID
 * @returns {Promise<Object>} 返回删除结果
 */
exports.main = async (event, context) => {
  console.log('🗑️ [彻底删除云函数] 收到请求:', event);
  
  const { messageId } = event;
  
  // 参数验证
  if (!messageId) {
    console.error('🗑️ [彻底删除云函数] 缺少消息ID参数');
    return {
      success: false,
      error: '缺少消息ID参数'
    };
  }
  
  try {
    console.log('🗑️ [彻底删除云函数] 准备彻底删除消息:', messageId);
    
    // 🔥 第一步：获取消息详情（用于删除关联的媒体文件）
    const messageQuery = await db.collection('messages')
      .where({
        _id: messageId
      })
      .get();
    
    if (messageQuery.data.length === 0) {
      console.log('🗑️ [彻底删除云函数] 消息不存在，可能已被删除');
      return {
        success: true,
        message: '消息不存在，可能已被删除'
      };
    }
    
    const messageData = messageQuery.data[0];
    console.log('🗑️ [彻底删除云函数] 找到消息:', messageData);
    
    // 🔥 第二步：如果消息包含媒体文件，也要删除
    if (messageData.fileId) {
      try {
        console.log('🗑️ [彻底删除云函数] 删除关联的媒体文件:', messageData.fileId);
        await cloud.deleteFile({
          fileList: [messageData.fileId]
        });
        console.log('🗑️ [彻底删除云函数] 媒体文件删除成功');
      } catch (fileDeleteError) {
        console.warn('🗑️ [彻底删除云函数] 媒体文件删除失败:', fileDeleteError);
        // 继续执行，不因为文件删除失败而中断
      }
    }
    
    // 🔥 第三步：从数据库中彻底删除消息记录
    const deleteResult = await db.collection('messages')
      .where({
        _id: messageId
      })
      .remove();
    
    console.log('🗑️ [彻底删除云函数] 数据库删除结果:', deleteResult);
    
    if (deleteResult.stats.removed > 0) {
      console.log('🗑️ [彻底删除云函数] ✅ 消息彻底删除成功');
      
      // 🔥 第四步：清理可能的关联数据（比如消息状态记录等）
      try {
        // 删除消息阅读状态记录
        await db.collection('messageStatus')
          .where({
            messageId: messageId
          })
          .remove();
        
        console.log('🗑️ [彻底删除云函数] 关联状态数据清理完成');
      } catch (cleanupError) {
        console.warn('🗑️ [彻底删除云函数] 关联数据清理失败:', cleanupError);
        // 不影响主要删除流程
      }
      
      return {
        success: true,
        message: '消息已彻底删除，不保留任何痕迹',
        deletedCount: deleteResult.stats.removed
      };
    } else {
      console.log('🗑️ [彻底删除云函数] ❌ 消息删除失败');
      return {
        success: false,
        error: '消息删除失败'
      };
    }
    
  } catch (err) {
    console.error('🗑️ [彻底删除云函数] 删除过程出错:', err);
    return {
      success: false,
      error: err.message || '彻底删除消息失败'
    };
  }
}; 