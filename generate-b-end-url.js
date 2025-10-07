/**
 * B端测试URL生成工具
 * 使用方法: node generate-b-end-url.js
 */

// 配置区域 - 请修改这里的值
const config = {
  chatId: 'chat_1759821214735_ikyy8g9u6',  // 从A端日志中获取
  inviter: '向冬',                          // A端用户昵称
  scene: '1044'                              // 场景值,一般使用1044(分享)
};

// URL编码函数
function encodeInviter(name) {
  return encodeURIComponent(name);
}

// 生成完整的启动参数
function generateLaunchParams() {
  const encodedInviter = encodeInviter(config.inviter);
  return `scene=${config.scene}&chatId=${config.chatId}&inviter=${encodedInviter}&fromInvite=true`;
}

// 生成微信小程序路径
function generateFullPath() {
  const params = generateLaunchParams();
  return `app/pages/login/login?${params}`;
}

// 打印结果
console.log('\n========================================');
console.log('🔧 B端测试URL生成器');
console.log('========================================\n');

console.log('配置信息:');
console.log('  chatId:', config.chatId);
console.log('  inviter:', config.inviter);
console.log('  scene:', config.scene);
console.log('');

console.log('========================================');
console.log('📋 微信开发者工具配置');
console.log('========================================\n');

console.log('1. 在开发者工具中点击"编译" → "添加编译模式"');
console.log('');
console.log('2. 填写以下信息:');
console.log('');
console.log('   模式名称: B端加入测试');
console.log('   启动页面: app/pages/login/login');
console.log('   启动参数:');
console.log('   ┌─────────────────────────────────────┐');
console.log('   │ ' + generateLaunchParams());
console.log('   └─────────────────────────────────────┘');
console.log('');

console.log('3. 点击"确定"保存');
console.log('');
console.log('4. 选择"B端加入测试"模式并编译');
console.log('');
console.log('5. 使用不同的账号登录(不要用A端账号!)');
console.log('');

console.log('========================================');
console.log('🔍 验证清单');
console.log('========================================\n');

console.log('在Console中搜索以下内容,确认是B端:');
console.log('');
console.log('✅ isFromInvite: true');
console.log('✅ isSender: false');
console.log('✅ [B端系统消息] 加入' + config.inviter + '的聊天');
console.log('');
console.log('❌ 不应该看到:');
console.log('   - isFromInvite: false');
console.log('   - [a端系统消息] 您创建了私密聊天');
console.log('');

console.log('========================================');
console.log('📝 完整路径(调试用)');
console.log('========================================\n');
console.log(generateFullPath());
console.log('');

console.log('========================================');
console.log('✅ 配置完成!');
console.log('========================================\n');

