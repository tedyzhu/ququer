/**
 * 测试云函数部署
 * 验证部署功能是否正常
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
});

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  
  return {
    success: true,
    message: '测试云函数部署成功',
    timestamp: new Date().toISOString(),
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
}; 