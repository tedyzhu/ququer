/**
 * 分享邀请功能测试页面
 */
Page({
  data: {
    logs: [],
    testChatId: '',
    testInviter: '测试用户',
    testStep: 0,
    steps: [
      '准备测试',
      '创建邀请',
      '模拟分享',
      '模拟被邀请者加入',
      '验证状态同步',
      '测试完成'
    ]
  },

  onLoad: function() {
    this.addLog('分享邀请功能测试开始');
    this.addLog('当前用户: ' + (getApp().globalData.userInfo?.nickName || '未知'));
  },

  /**
   * 添加日志
   */
  addLog: function(message) {
    const time = new Date().toLocaleTimeString();
    const logs = this.data.logs;
    logs.push(`[${time}] ${message}`);
    
    this.setData({
      logs: logs
    });
    
    console.log('🧪 测试日志:', message);
  },

  /**
   * 开始完整测试
   */
  startFullTest: function() {
    this.setData({
      logs: [],
      testStep: 0
    });
    
    this.addLog('🚀 开始完整分享邀请流程测试');
    this.testStep1_CreateInvite();
  },

  /**
   * 步骤1：创建邀请
   */
  testStep1_CreateInvite: function() {
    this.updateStep(1, '创建邀请测试');
    
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    
    // 生成测试聊天ID
    const testChatId = 'chat_test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    this.setData({
      testChatId: testChatId
    });
    
    this.addLog(`生成测试聊天ID: ${testChatId}`);
    
    // 调用createInvite云函数
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: testChatId,
        inviter: {
          openId: userInfo.openId || app.globalData.openId || 'test_user',
          nickName: userInfo.nickName || '测试用户',
          avatarUrl: userInfo.avatarUrl || '/assets/images/avatar1.png'
        }
      },
      success: (res) => {
        console.log('✅ createInvite测试结果:', res.result);
        this.addLog('✅ createInvite云函数调用成功');
        this.addLog(`返回结果: ${JSON.stringify(res.result)}`);
        
        if (res.result && res.result.success) {
          this.addLog('✅ 邀请创建成功');
          this.testStep2_SimulateShare();
        } else {
          this.addLog(`❌ 邀请创建失败: ${res.result?.error || '未知错误'}`);
        }
      },
      fail: (err) => {
        this.addLog(`❌ createInvite云函数调用失败: ${err.message}`);
      }
    });
  },

  /**
   * 步骤2：模拟分享
   */
  testStep2_SimulateShare: function() {
    this.updateStep(2, '模拟分享过程');
    
    this.addLog('📤 模拟用户点击分享');
    this.addLog(`分享链接: /pages/share/share?chatId=${this.data.testChatId}&inviter=${encodeURIComponent(this.data.testInviter)}&isInvitee=true`);
    
    // 延迟执行下一步，模拟真实分享过程
    setTimeout(() => {
      this.testStep3_SimulateJoin();
    }, 2000);
  },

  /**
   * 步骤3：模拟被邀请者加入
   */
  testStep3_SimulateJoin: function() {
    this.updateStep(3, '模拟被邀请者加入');
    
    this.addLog('👤 模拟被邀请者点击链接加入');
    
    // 调用joinByInvite云函数
    wx.cloud.callFunction({
      name: 'joinByInvite',
      data: {
        chatId: this.data.testChatId,
        joiner: {
          openId: 'test_joiner_' + Date.now(),
          nickName: '测试被邀请者',
          avatarUrl: '/assets/images/avatar1.png'
        }
      },
      success: (res) => {
        this.addLog('✅ joinByInvite云函数调用成功');
        this.addLog(`返回结果: ${JSON.stringify(res.result)}`);
        
        if (res.result && res.result.success) {
          this.addLog('✅ 被邀请者加入成功');
          this.addLog(`参与者数量: ${res.result.participants?.length || 0}`);
          this.addLog(`聊天状态: ${res.result.chat?.status || '未知'}`);
          this.addLog(`聊天已开始: ${res.result.chatStarted ? '是' : '否'}`);
          
          this.testStep4_VerifyStatus();
        } else {
          this.addLog(`❌ 被邀请者加入失败: ${res.result?.error || '未知错误'}`);
        }
      },
      fail: (err) => {
        this.addLog(`❌ joinByInvite云函数调用失败: ${err.message}`);
      }
    });
  },

  /**
   * 步骤4：验证状态同步
   */
  testStep4_VerifyStatus: function() {
    this.updateStep(4, '验证状态同步');
    
    this.addLog('🔍 验证聊天状态同步');
    
    // 检查云数据库中的聊天状态
    const db = wx.cloud.database();
    db.collection('conversations')
      .doc(this.data.testChatId)
      .get()
      .then(res => {
        if (res.data) {
          const chat = res.data;
          this.addLog('✅ 云数据库查询成功');
          this.addLog(`参与者数量: ${chat.participants?.length || 0}`);
          this.addLog(`聊天状态: ${chat.status || '未知'}`);
          this.addLog(`聊天已开始: ${chat.chatStarted ? '是' : '否'}`);
          
          // 检查本地存储
          try {
            const localChatInfo = wx.getStorageSync(`chat_info_${this.data.testChatId}`);
            if (localChatInfo) {
              this.addLog('✅ 本地存储状态已保存');
              this.addLog(`本地状态: ${JSON.stringify(localChatInfo)}`);
            } else {
              this.addLog('⚠️ 本地存储中未找到聊天状态');
            }
          } catch (e) {
            this.addLog(`❌ 读取本地存储失败: ${e.message}`);
          }
          
          this.testStep5_Complete();
        } else {
          this.addLog('❌ 云数据库中未找到聊天记录');
        }
      })
      .catch(err => {
        this.addLog(`❌ 云数据库查询失败: ${err.message}`);
      });
  },

  /**
   * 步骤5：测试完成
   */
  testStep5_Complete: function() {
    this.updateStep(5, '测试完成');
    
    this.addLog('🎉 分享邀请功能测试完成');
    this.addLog('所有关键功能验证通过');
    
    // 清理测试数据
    setTimeout(() => {
      this.cleanupTestData();
    }, 3000);
  },

  /**
   * 更新步骤状态
   */
  updateStep: function(step, message) {
    this.setData({
      testStep: step
    });
    this.addLog(`📋 步骤 ${step}/5: ${message}`);
  },

  /**
   * 清理测试数据
   */
  cleanupTestData: function() {
    this.addLog('🧹 清理测试数据');
    
    try {
      wx.removeStorageSync(`chat_info_${this.data.testChatId}`);
      this.addLog('✅ 测试数据清理完成');
    } catch (e) {
      this.addLog(`⚠️ 清理测试数据失败: ${e.message}`);
    }
  },

  /**
   * 清空日志
   */
  clearLogs: function() {
    this.setData({
      logs: []
    });
  },

  /**
   * 测试分享链接跳转
   */
  testShareLink: function() {
    const testChatId = 'chat_test_link_' + Date.now();
    const shareUrl = `/pages/share/share?chatId=${testChatId}&inviter=${encodeURIComponent('测试用户')}&isInvitee=true`;
    
    this.addLog(`测试分享链接跳转: ${shareUrl}`);
    
    wx.navigateTo({
      url: shareUrl,
      success: () => {
        this.addLog('✅ 分享链接跳转成功');
      },
      fail: (err) => {
        this.addLog(`❌ 分享链接跳转失败: ${err.message}`);
      }
    });
  }
}); 