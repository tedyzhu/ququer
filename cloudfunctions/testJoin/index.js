// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
})

const db = cloud.database()

/**
 * 测试云函数，验证基本功能
 * @param {Object} event - 云函数调用参数
 * @returns {Object} 测试结果
 */
exports.main = async (event, context) => {
  console.log('[测试云函数] 开始执行');
  console.log('[测试云函数] 输入参数:', JSON.stringify(event, null, 2));
  
  try {
    const wxContext = cloud.getWXContext()
    
    console.log('[测试云函数] 微信上下文:', {
      OPENID: wxContext.OPENID,
      APPID: wxContext.APPID,
      UNIONID: wxContext.UNIONID
    });
    
    // 测试数据库连接
    console.log('[测试云函数] 测试数据库连接...');
    
    const testQuery = await db.collection('conversations').limit(1).get();
    console.log('[测试云函数] 数据库查询成功，返回记录数:', testQuery.data.length);
    
    // 返回测试结果
    const result = {
      success: true,
      message: '测试云函数执行成功',
      timestamp: new Date().toISOString(),
      wxContext: {
        OPENID: wxContext.OPENID,
        APPID: wxContext.APPID,
        UNIONID: wxContext.UNIONID
      },
      databaseTest: {
        success: true,
        recordCount: testQuery.data.length
      },
      inputEvent: event
    };
    
    console.log('[测试云函数] 返回结果:', result);
    return result;
    
  } catch (error) {
    console.error('[测试云函数] 执行过程中发生错误:', error);
    console.error('[测试云函数] 错误堆栈:', error.stack);
    
    const errorResult = {
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      errorStack: error.stack,
      timestamp: new Date().toISOString()
    };
    
    console.log('[测试云函数] 返回错误结果:', errorResult);
    return errorResult;
  }
} 