/**
 * 云函数部署检查脚本
 * 在小程序中运行此代码检查云函数是否正常
 */

const functions = ['login', 'sendMessage', 'getConversations', 'createChat'];

async function checkCloudFunctions() {
  console.log('🔍 开始检查云函数状态...');
  
  for (const funcName of functions) {
    try {
      console.log(`📞 测试云函数: ${funcName}`);
      
      const res = await wx.cloud.callFunction({
        name: funcName,
        data: { test: true, timestamp: Date.now() }
      });
      
      console.log(`✅ ${funcName} 测试成功`, res);
      
    } catch (error) {
      console.error(`❌ ${funcName} 测试失败`, error);
    }
  }
  
  console.log('🔍 云函数检查完成');
}

// 在小程序控制台中运行: checkCloudFunctions()
checkCloudFunctions();
