/**
 * 🧪 连接修复功能自动测试脚本
 * 
 * 使用方法：
 * 1. 在聊天页面控制台执行：
 *    const testScript = require('./test_connection_fix.js');
 *    testScript.runAllTests();
 * 
 * 2. 或者直接在聊天页面执行：
 *    getCurrentPages()[getCurrentPages().length - 1].testConnectionFix();
 */

const ConnectionFixTester = {
  
  /**
   * 运行所有测试
   */
  runAllTests: function() {
    console.log('🧪 [自动测试] ==================== 开始连接修复自动测试 ====================');
    
    const currentPage = getCurrentPages()[getCurrentPages().length - 1];
    
    if (!currentPage || !currentPage.testConnectionFix) {
      console.error('🧪 [自动测试] ❌ 无法找到聊天页面或测试函数');
      return;
    }
    
    // 测试1：基础连接修复
    this.testBasicConnectionFix(currentPage);
    
    // 延迟执行其他测试
    setTimeout(() => {
      // 测试2：消息推断修复
      this.testMessageInferenceFix(currentPage);
    }, 5000);
    
    setTimeout(() => {
      // 测试3：紧急修复
      this.testEmergencyFix(currentPage);
    }, 10000);
    
    setTimeout(() => {
      // 测试4：最终验证
      this.finalVerification(currentPage);
    }, 15000);
  },
  
  /**
   * 测试1：基础连接修复
   */
  testBasicConnectionFix: function(page) {
    console.log('🧪 [测试1] 开始基础连接修复测试...');
    
    const beforeParticipants = page.data.participants.length;
    const beforeTitle = page.data.dynamicTitle;
    
    console.log('🧪 [测试1] 修复前状态:', {
      participants: beforeParticipants,
      title: beforeTitle
    });
    
    // 触发基础修复
    page.testConnectionFix();
  },
  
  /**
   * 测试2：消息推断修复
   */
  testMessageInferenceFix: function(page) {
    console.log('🧪 [测试2] 开始消息推断修复测试...');
    
    if (page.data.participants.length <= 1) {
      console.log('🧪 [测试2] 基础修复未成功，尝试消息推断...');
      page.inferParticipantsFromMessages();
      
      setTimeout(() => {
        const afterParticipants = page.data.participants.length;
        const afterTitle = page.data.dynamicTitle;
        
        console.log('🧪 [测试2] 消息推断后状态:', {
          participants: afterParticipants,
          title: afterTitle
        });
        
        if (afterParticipants > 1) {
          console.log('🧪 [测试2] ✅ 消息推断修复成功！');
        } else {
          console.log('🧪 [测试2] ❌ 消息推断修复失败');
        }
      }, 2000);
    } else {
      console.log('🧪 [测试2] ✅ 基础修复已成功，跳过消息推断测试');
    }
  },
  
  /**
   * 测试3：紧急修复
   */
  testEmergencyFix: function(page) {
    console.log('🧪 [测试3] 开始紧急修复测试...');
    
    if (page.data.participants.length <= 1) {
      console.log('🧪 [测试3] 前面的修复都未成功，尝试紧急修复...');
      page.emergencyFixConnection();
      
      setTimeout(() => {
        const afterParticipants = page.data.participants.length;
        const afterTitle = page.data.dynamicTitle;
        
        console.log('🧪 [测试3] 紧急修复后状态:', {
          participants: afterParticipants,
          title: afterTitle
        });
        
        if (afterParticipants > 1) {
          console.log('🧪 [测试3] ✅ 紧急修复成功！');
        } else {
          console.log('🧪 [测试3] ❌ 紧急修复失败');
        }
      }, 2000);
    } else {
      console.log('🧪 [测试3] ✅ 之前的修复已成功，跳过紧急修复测试');
    }
  },
  
  /**
   * 测试4：最终验证
   */
  finalVerification: function(page) {
    console.log('🧪 [最终验证] ==================== 开始最终验证 ====================');
    
    const finalParticipants = page.data.participants.length;
    const finalTitle = page.data.dynamicTitle;
    const messages = page.data.messages || [];
    
    console.log('🧪 [最终验证] 最终状态:', {
      participants: finalParticipants,
      title: finalTitle,
      messages: messages.length
    });
    
    // 分析消息中的发送者
    const senderIds = new Set();
    messages.forEach(msg => {
      if (msg.senderId && msg.senderId !== 'system' && msg.senderId !== 'self') {
        senderIds.add(msg.senderId);
      }
    });
    
    console.log('🧪 [最终验证] 消息中的发送者数量:', senderIds.size);
    console.log('🧪 [最终验证] 发送者IDs:', Array.from(senderIds));
    
    // 判断测试结果
    if (finalParticipants >= 2 && senderIds.size >= 2) {
      console.log('🧪 [最终验证] ✅ 所有测试通过！连接修复成功！');
      console.log('🧪 [最终验证] ✅ 参与者数量正确:', finalParticipants);
      console.log('🧪 [最终验证] ✅ 标题显示正确:', finalTitle);
      
      wx.showModal({
        title: '🎉 测试通过',
        content: `连接修复成功！\n\n参与者数量: ${finalParticipants}\n标题: ${finalTitle}`,
        showCancel: false,
        confirmText: '太好了！'
      });
      
    } else if (senderIds.size < 2) {
      console.log('🧪 [最终验证] ⚠️ 消息中只有一个发送者，这是正常的新聊天状态');
      console.log('🧪 [最终验证] 💡 需要等待对方加入聊天后才能测试连接修复');
      
      wx.showModal({
        title: '⚠️ 测试说明',
        content: '当前是新聊天状态，只有您一个人。\n\n请分享链接给朋友，等朋友加入后再测试连接修复功能。',
        showCancel: false,
        confirmText: '明白了'
      });
      
    } else {
      console.log('🧪 [最终验证] ❌ 测试失败！连接修复未成功');
      console.log('🧪 [最终验证] ❌ 参与者数量异常:', finalParticipants);
      console.log('🧪 [最终验证] ❌ 但消息中有多个发送者:', senderIds.size);
      
      wx.showModal({
        title: '❌ 测试失败',
        content: `连接修复失败！\n\n参与者数量: ${finalParticipants}\n消息发送者: ${senderIds.size}\n\n请检查修复逻辑或手动修复。`,
        confirmText: '手动修复',
        cancelText: '稍后再试',
        success: (res) => {
          if (res.confirm) {
            // 手动触发紧急修复
            page.emergencyFixConnection();
          }
        }
      });
    }
    
    console.log('🧪 [最终验证] ==================== 测试完成 ====================');
  }
};

// 导出测试器
module.exports = ConnectionFixTester;

// 如果在浏览器环境中直接运行
if (typeof window !== 'undefined') {
  window.ConnectionFixTester = ConnectionFixTester;
  
  // 自动运行测试（延迟3秒，确保页面加载完成）
  setTimeout(() => {
    ConnectionFixTester.runAllTests();
  }, 3000);
} 