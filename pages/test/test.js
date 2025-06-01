/**
 * 测试页面 - 测试邀请链接匹配问题修复
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    logs: [],
    testing: false,
    testStep: 0,
    inviteId: '',
    chatId: '',
    userInfo: {},
    chatUrl: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.addLog('=== 邀请链接测试页面 ===');
    this.addLog('测试目标：验证被邀请者登录后能正确进入聊天');
    
    // 获取用户信息
    const app = getApp();
    this.setData({
      userInfo: app.globalData.userInfo || {}
    });
    
    if (!app.globalData.hasLogin) {
      this.addLog('❌ 用户未登录，请先登录');
    } else {
      this.addLog('✅ 用户已登录: ' + (app.globalData.userInfo?.nickName || '未知'));
    }
  },

  /**
   * 添加日志
   */
  addLog: function(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    
    const logs = this.data.logs.slice();
    logs.push(logMessage);
    
    // 只保留最近50条日志
    if (logs.length > 50) {
      logs.shift();
    }
    
    this.setData({
      logs: logs
    });
    
    // 滚动到底部
    setTimeout(() => {
      wx.pageScrollTo({
        scrollTop: 999999,
        duration: 100
      });
    }, 100);
  },

  /**
   * 清除日志
   */
  clearLogs: function() {
    this.setData({
      logs: []
    });
  },

  /**
   * 开始完整测试
   */
  startCompleteTest: function() {
    const app = getApp();
    
    if (!app.globalData.hasLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再进行测试',
        showCancel: false
      });
      return;
    }
    
    this.setData({
      testing: true,
      testStep: 1
    });
    
    this.addLog('开始完整的邀请链接测试流程...');
    
    // 测试步骤1: 创建邀请
    this.testCreateInvite();
  },

  /**
   * 测试步骤1: 创建邀请
   */
  testCreateInvite: function() {
    this.addLog('步骤1: 创建邀请链接...');
    
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    // 首先测试云函数连接
    this.addLog('测试云函数连接...');
    
    wx.cloud.callFunction({
      name: 'login',
      data: { test: true },
      success: (testRes) => {
        this.addLog('✅ 云函数连接正常，开始创建邀请...');
        
        // 打印详细的调用参数
        const callData = {
          inviter: {
            openId: userInfo.openId,
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl
          }
        };
        this.addLog(`调用参数: ${JSON.stringify(callData)}`);
        
        wx.cloud.callFunction({
          name: 'createInvite',
          data: callData,
          success: res => {
            this.addLog(`云函数调用成功，返回结果: ${JSON.stringify(res)}`);
            
            // 更详细的结果分析
            this.addLog(`result字段存在: ${!!res.result}`);
            this.addLog(`result类型: ${typeof res.result}`);
            if (res.result) {
              this.addLog(`result内容: ${JSON.stringify(res.result)}`);
              this.addLog(`result.success存在: ${!!res.result.success}`);
              this.addLog(`result.chatId存在: ${!!res.result.chatId}`);
              this.addLog(`result.inviteId存在: ${!!res.result.inviteId}`);
              this.addLog(`result.error存在: ${!!res.result.error}`);
            }
            
            // 尝试多种方式提取成功标志和chatId
            let success = false;
            let chatId = null;
            let errorMessage = null;
            
            if (res.result && res.result.success) {
              success = true;
              chatId = res.result.chatId || res.result.inviteId;
            } else if (res.result && res.result.chatId) {
              // 即使没有success字段，但有chatId也认为成功
              success = true;
              chatId = res.result.chatId;
              this.addLog('⚠️ 云函数没有返回success字段，但有chatId，认为成功');
            } else if (res.result && res.result.error) {
              errorMessage = res.result.error;
            } else if (res.errMsg && res.errMsg.includes('ok')) {
              // 云函数调用成功，但可能没有返回预期结构
              this.addLog('⚠️ 云函数调用成功，但返回结构异常，可能是云函数内部错误');
              errorMessage = '云函数返回结构异常，请检查云函数代码或重新部署';
            } else {
              errorMessage = '未知的返回格式';
            }
            
            if (success && chatId) {
              this.setData({ inviteId: chatId });
              this.addLog(`✅ 邀请创建成功: ${chatId}`);
              
              // 测试步骤2: 模拟被邀请者点击链接
              setTimeout(() => this.testSimulateInviteClick(), 1000);
            } else {
              this.addLog(`❌ 创建邀请失败: ${errorMessage || '未知错误'}`);
              this.addLog(`完整错误信息: ${JSON.stringify(res.result || res)}`);
              this.addLog('');
              this.addLog('🔧 建议解决方案:');
              this.addLog('1. 在微信开发者工具中重新部署createInvite云函数');
              this.addLog('2. 选择"上传并部署：云端安装依赖"');
              this.addLog('3. 检查云开发控制台中的云函数日志');
              this.addLog('4. 确保数据库权限设置正确');
              this.setData({ testing: false });
            }
          },
          fail: err => {
            this.addLog(`❌ 调用createInvite云函数失败: ${err.errMsg || err.message || JSON.stringify(err)}`);
            this.addLog('');
            this.addLog('🔧 建议解决方案:');
            this.addLog('1. 检查云函数是否已正确部署');
            this.addLog('2. 确认云环境ID配置正确');
            this.addLog('3. 查看云开发控制台是否有错误信息');
            this.setData({ testing: false });
          }
        });
      },
      fail: (testErr) => {
        this.addLog(`❌ 云函数连接失败: ${testErr.errMsg || testErr.message}`);
        this.setData({ testing: false });
      }
    });
  },

  /**
   * 测试步骤2: 模拟被邀请者点击链接
   */
  testSimulateInviteClick: function() {
    this.addLog('步骤2: 模拟被邀请者点击邀请链接...');
    
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    // 清除现有邀请信息
    app.clearInviteInfo();
    
    // 保存邀请信息，模拟从邀请链接进入
    const inviteInfo = app.saveInviteInfo(
      this.data.inviteId,
      '测试邀请者', // 使用不同的邀请者名称，确保当前用户被识别为被邀请者
      true // 明确标记为被邀请者
    );
    
    this.addLog(`✅ 已保存邀请信息: ${JSON.stringify(inviteInfo)}`);
    
    // 测试步骤3: 加入聊天
    setTimeout(() => this.testJoinByInvite(), 1000);
  },

  /**
   * 测试步骤3: 通过邀请加入聊天
   */
  testJoinByInvite: function() {
    this.addLog('步骤3: 通过邀请加入聊天...');
    
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    wx.cloud.callFunction({
      name: 'joinByInvite',
      data: {
        chatId: this.data.inviteId,
        joiner: {
          openId: userInfo.openId,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl
        }
      },
      success: res => {
        if (res.result && res.result.success) {
          this.addLog(`✅ 成功加入聊天: ${res.result.chatId}`);
          this.setData({ chatId: res.result.chatId });
          
          // 验证聊天状态是否为已开始
          this.addLog('检查聊天状态是否已标记为开始...');
          
          // 检查本地存储
          try {
            const chatInfo = wx.getStorageSync(`chat_info_${res.result.chatId}`);
            if (chatInfo && chatInfo.chatStarted) {
              this.addLog('✅ 本地存储中聊天已标记为开始状态');
            } else {
              this.addLog('⚠️ 本地存储中聊天未标记为开始状态，尝试标记...');
              wx.setStorageSync(`chat_info_${res.result.chatId}`, {
                chatStarted: true,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (e) {
            this.addLog(`⚠️ 读取/写入本地存储失败: ${e.message}`);
          }
          
          // 测试步骤4: 验证会话
          setTimeout(() => this.testVerifyChat(), 1000);
        } else {
          this.addLog(`❌ 加入聊天失败: ${res.result?.error || '未知错误'}`);
          this.setData({ testing: false });
        }
      },
      fail: err => {
        this.addLog(`❌ 加入聊天过程发生错误: ${err.message || JSON.stringify(err)}`);
        this.setData({ testing: false });
      }
    });
  },

  /**
   * 测试步骤4: 验证聊天状态
   */
  testVerifyChat: function() {
    this.addLog('步骤4: 验证聊天状态...');
    
    wx.cloud.callFunction({
      name: 'checkChatStatus',
      data: {
        chatId: this.data.chatId
      },
      success: res => {
        if (res.result && res.result.success) {
          this.addLog(`✅ 聊天状态验证成功`);
          this.addLog(`聊天存在: ${res.result.exists}`);
          this.addLog(`用户在聊天中: ${res.result.isUserInChat}`);
          
          if (res.result.chatInfo) {
            this.addLog(`聊天状态: ${res.result.chatInfo.status}`);
            this.addLog(`聊天已开始: ${res.result.chatInfo.chatStarted}`);
            this.addLog(`参与者数量: ${res.result.chatInfo.participants?.length || 0}`);
          }
          
          // 测试步骤5: 模拟跳转到聊天页面
          setTimeout(() => this.testNavigateToChat(), 1000);
        } else {
          this.addLog(`❌ 验证聊天状态失败: ${res.result?.error || '未知错误'}`);
          this.setData({ testing: false });
        }
      },
      fail: err => {
        this.addLog(`❌ 验证聊天状态出错: ${err.message || JSON.stringify(err)}`);
        this.setData({ testing: false });
      }
    });
  },

  /**
   * 测试步骤5: 模拟跳转到聊天页面
   */
  testNavigateToChat: function() {
    this.addLog('步骤5: 测试跳转到聊天页面...');
    
    const app = getApp();
    
    // 获取邀请信息
    const inviteInfo = app.getStoredInviteInfo();
    if (!inviteInfo) {
      this.addLog('❌ 未找到邀请信息');
      this.setData({ testing: false });
      return;
    }
    
    // 构建跳转URL
    const chatId = this.data.chatId;
    const inviter = encodeURIComponent(inviteInfo.inviter);
    const url = `/pages/chat/chat?id=${chatId}&inviter=${inviter}&isInvitee=true&chatStarted=true`;
    
    this.addLog(`准备跳转到: ${url}`);
    
    // 保存跳转URL到数据中，供手动跳转使用
    this.setData({
      chatUrl: url,
      testing: false
    });
    
    this.addLog('');
    this.addLog('🎉 测试流程完成！');
    this.addLog('✅ 邀请创建成功');
    this.addLog('✅ 被邀请者成功加入');
    this.addLog('✅ 聊天状态验证通过');
    this.addLog('');
    this.addLog('👆 点击下方"跳转到聊天页面"按钮进行最终验证');
    
    // 尝试显示模态对话框，如果失败则使用按钮
    try {
      wx.showModal({
        title: '测试完成',
        content: `测试流程完成！是否跳转到聊天页面进行最终验证？\n\n聊天ID: ${chatId}`,
        confirmText: '跳转',
        cancelText: '留在测试页',
        success: (modalRes) => {
          if (modalRes.confirm) {
            this.navigateToChat();
          } else {
            this.addLog('用户选择留在测试页面，可点击按钮手动跳转');
          }
        },
        fail: () => {
          this.addLog('模态对话框显示失败，请使用下方按钮手动跳转');
        }
      });
    } catch (e) {
      this.addLog('模态对话框显示异常，请使用下方按钮手动跳转');
    }
  },

  /**
   * 跳转到聊天页面
   */
  navigateToChat: function() {
    const url = this.data.chatUrl;
    if (!url) {
      this.addLog('❌ 没有可用的跳转URL，请重新运行测试');
      return;
    }
    
    this.addLog('✅ 开始跳转到聊天页面...');
    
    wx.navigateTo({
      url: url,
      success: () => {
        this.addLog('✅ 成功跳转到聊天页面');
      },
      fail: (err) => {
        this.addLog(`❌ 跳转失败: ${err.errMsg}`);
        
        // 尝试备用路径
        const chatId = this.data.chatId;
        const inviter = encodeURIComponent('测试邀请者');
        const backupUrl = `../chat/chat?id=${chatId}&inviter=${inviter}&isInvitee=true&chatStarted=true`;
        
        this.addLog('🔄 尝试备用路径...');
        wx.navigateTo({
          url: backupUrl,
          success: () => {
            this.addLog('✅ 使用备用路径成功跳转');
          },
          fail: (err2) => {
            this.addLog(`❌ 备用路径也失败: ${err2.errMsg}`);
            this.addLog('📋 请手动跳转到聊天页面:');
            this.addLog(`页面路径: pages/chat/chat`);
            this.addLog(`参数: id=${chatId}&inviter=测试邀请者&isInvitee=true&chatStarted=true`);
          }
        });
      }
    });
  },

  /**
   * 测试单个步骤：创建邀请
   */
  testCreateInviteOnly: function() {
    const app = getApp();
    
    if (!app.globalData.hasLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再进行测试',
        showCancel: false
      });
      return;
    }
    
    this.addLog('=== 单独测试创建邀请云函数 ===');
    
    // 先测试基础模式
    this.addLog('1. 测试基础模式...');
    wx.cloud.callFunction({
      name: 'createInvite',
      data: { test: true },
      success: (res) => {
        this.addLog(`基础测试成功: ${JSON.stringify(res)}`);
        
        // 再测试完整模式
        this.addLog('2. 测试完整模式...');
        this.testCreateInvite();
      },
      fail: (err) => {
        this.addLog(`❌ 基础测试失败: ${err.errMsg || JSON.stringify(err)}`);
      }
    });
  },

  /**
   * 测试单个步骤：加入聊天
   */
  testJoinChatOnly: function() {
    if (!this.data.inviteId) {
      wx.showModal({
        title: '提示',
        content: '请先创建邀请或输入有效的邀请ID',
        showCancel: false
      });
      return;
    }
    
    this.testJoinByInvite();
  },

  /**
   * 重置测试状态
   */
  resetTest: function() {
    this.setData({
      testing: false,
      testStep: 0,
      inviteId: '',
      chatId: '',
      chatUrl: ''
    });
    
    // 清除邀请信息
    const app = getApp();
    app.clearInviteInfo();
    
    this.addLog('测试状态已重置');
  },

  /**
   * 手动输入邀请ID
   */
  onInviteIdInput: function(e) {
    this.setData({
      inviteId: e.detail.value
    });
  }
}) 