/**
 * 编码测试页面
 */
Page({
  data: {
    logs: [],
    testResults: {}
  },

  onLoad: function() {
    this.addLog('编码测试开始');
    this.runAllTests();
  },

  addLog: function(message) {
    const time = new Date().toLocaleTimeString();
    const logs = this.data.logs;
    logs.push(`[${time}] ${message}`);
    
    this.setData({
      logs: logs
    });
    
    console.log('🧪 编码测试:', message);
  },

  runAllTests: function() {
    this.testChineseEncoding();
    this.testCreateInvite();
    this.testBase64();
  },

  /**
   * 测试中文编码
   */
  testChineseEncoding: function() {
    this.addLog('🔤 测试中文编码...');
    
    try {
      const chineseName = '向冬';
      const encoded = encodeURIComponent(chineseName);
      const decoded = decodeURIComponent(encoded);
      
      if (decoded === chineseName) {
        this.addLog(`✅ 中文编码测试通过: ${chineseName} -> ${encoded} -> ${decoded}`);
        this.updateResult('chineseEncoding', true);
      } else {
        this.addLog(`❌ 中文编码测试失败: 解码结果不匹配`);
        this.updateResult('chineseEncoding', false);
      }
    } catch (error) {
      this.addLog(`❌ 中文编码测试失败: ${error.message}`);
      this.updateResult('chineseEncoding', false);
    }
  },

  /**
   * 测试Base64编码
   */
  testBase64: function() {
    this.addLog('🔢 测试Base64编码...');
    
    try {
      const testString = 'Hello 向冬';
      
      if (typeof btoa !== 'undefined') {
        const encoded = btoa(unescape(encodeURIComponent(testString)));
        const decoded = decodeURIComponent(escape(atob(encoded)));
        
        if (decoded === testString) {
          this.addLog(`✅ Base64编码测试通过: ${testString} -> ${encoded} -> ${decoded}`);
          this.updateResult('base64', true);
        } else {
          this.addLog(`❌ Base64编码测试失败: 解码结果不匹配`);
          this.updateResult('base64', false);
        }
      } else {
        this.addLog(`⚠️ btoa函数不可用`);
        this.updateResult('base64', false);
      }
    } catch (error) {
      this.addLog(`❌ Base64编码测试失败: ${error.message}`);
      this.updateResult('base64', false);
    }
  },

  /**
   * 测试createInvite云函数
   */
  testCreateInvite: function() {
    this.addLog('☁️ 测试createInvite云函数...');
    
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        inviter: {
          openId: userInfo.openId || 'test_user',
          nickName: userInfo.nickName || '测试用户',
          avatarUrl: userInfo.avatarUrl || '/assets/images/avatar1.png'
        }
      },
      success: (res) => {
        this.addLog(`✅ createInvite调用成功`);
        this.addLog(`返回结果: ${JSON.stringify(res.result)}`);
        
        if (res.result && res.result.success) {
          this.addLog(`✅ createInvite功能正常，聊天ID: ${res.result.chatId}`);
          this.updateResult('createInvite', true);
        } else {
          this.addLog(`❌ createInvite返回格式错误: 缺少success字段`);
          this.updateResult('createInvite', false);
        }
      },
      fail: (err) => {
        this.addLog(`❌ createInvite调用失败: ${err.message}`);
        this.updateResult('createInvite', false);
      }
    });
  },

  updateResult: function(testName, passed) {
    const results = this.data.testResults;
    results[testName] = passed;
    this.setData({
      testResults: results
    });
  },

  clearLogs: function() {
    this.setData({
      logs: []
    });
  }
}); 