/**
 * 调试页面 - 真机调试邀请链接问题
 */
Page({
  data: {
    debugInfo: {},
    logs: []
  },

  /**
   * 页面加载
   */
  onLoad: function(options) {
    console.log('[调试页面] 页面加载参数:', options);
    this.addLog('调试页面加载', options);
    this.collectDebugInfo();
  },

  /**
   * 收集调试信息
   */
  collectDebugInfo: function() {
    const app = getApp();
    
    // 收集各种来源的参数信息
    const debugInfo = {
      timestamp: new Date().toLocaleString(),
      
      // 全局数据
      globalData: {
        launchOptions: app.globalData.launchOptions,
        pendingInvite: app.globalData.pendingInvite,
        hasLogin: app.globalData.hasLogin,
        userInfo: app.globalData.userInfo ? {
          nickName: app.globalData.userInfo.nickName,
          openId: app.globalData.userInfo.openId
        } : null
      },
      
      // 本地存储
      localStorage: {},
      
      // 系统信息
      systemInfo: {}
    };
    
    // 获取本地存储信息
    try {
      debugInfo.localStorage = {
        pendingInvite: wx.getStorageSync('pendingInvite'),
        entryOptions: wx.getStorageSync('entryOptions'),
        userInfo: wx.getStorageSync('userInfo') ? {
          nickName: wx.getStorageSync('userInfo').nickName
        } : null,
        openId: wx.getStorageSync('openId')
      };
    } catch (e) {
      debugInfo.localStorage.error = e.message;
    }
    
    // 获取系统信息
    try {
      const appBaseInfo = wx.getAppBaseInfo();
      debugInfo.systemInfo = {
        platform: appBaseInfo.platform,
        version: appBaseInfo.version,
        SDKVersion: appBaseInfo.SDKVersion
      };
    } catch (e) {
      debugInfo.systemInfo.error = e.message;
    }
    
    this.setData({
      debugInfo: debugInfo
    });
    
    this.addLog('调试信息收集完成', debugInfo);
  },

  /**
   * 添加日志
   */
  addLog: function(message, data) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      time: timestamp,
      message: message,
      data: data ? JSON.stringify(data, null, 2) : ''
    };
    
    const logs = this.data.logs;
    logs.unshift(logEntry);
    
    // 只保留最近20条日志
    if (logs.length > 20) {
      logs.splice(20);
    }
    
    this.setData({
      logs: logs
    });
    
    console.log(`[调试页面] ${timestamp} ${message}`, data);
  },

  /**
   * 刷新调试信息
   */
  refreshDebugInfo: function() {
    this.addLog('刷新调试信息');
    this.collectDebugInfo();
  },

  /**
   * 清除本地存储
   */
  clearStorage: function() {
    wx.showModal({
      title: '确认清除',
      content: '确定要清除所有本地存储数据吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
            this.addLog('已清除本地存储');
            
            // 重置全局数据
            const app = getApp();
            app.globalData.userInfo = null;
            app.globalData.hasLogin = false;
            app.globalData.openId = '';
            app.globalData.pendingInvite = null;
            
            this.addLog('已重置全局数据');
            this.collectDebugInfo();
            
            wx.showToast({
              title: '已清除',
              icon: 'success'
            });
          } catch (e) {
            this.addLog('清除存储失败', e);
            wx.showToast({
              title: '清除失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  /**
   * 测试邀请链接处理
   */
  testInviteProcessing: function() {
    const testOptions = {
      chatId: 'chat_test_' + Date.now(),
      inviter: '测试用户',
      isInvitee: 'true',
      scene: 'invite'
    };
    
    this.addLog('开始测试邀请参数处理', testOptions);
    
    // 模拟处理邀请参数
    const app = getApp();
    if (app.handleInviteParams) {
      const result = app.handleInviteParams(testOptions);
      this.addLog('邀请参数处理结果', result);
      
      // 重要：清除测试生成的缓存，避免干扰真实流程
      setTimeout(() => {
        try {
          wx.removeStorageSync('pendingInvite');
          app.globalData.pendingInvite = null;
          this.addLog('已清除测试生成的邀请缓存');
        } catch (e) {
          this.addLog('清除测试缓存失败:', e);
        }
      }, 1000);
      
    } else {
      this.addLog('app.handleInviteParams 方法不存在');
    }
    
    this.collectDebugInfo();
  },

  /**
   * 跳转到聊天页面测试
   */
  testNavigateToChat: function() {
    const testChatId = 'chat_debug_' + Date.now();
    this.addLog('测试跳转聊天页面', { chatId: testChatId });
    
    wx.navigateTo({
      url: `/pages/chat/chat?id=${testChatId}&inviter=测试用户&isInvitee=true&debug=true`,
      success: () => {
        this.addLog('跳转聊天页面成功');
      },
      fail: (err) => {
        this.addLog('跳转聊天页面失败', err);
      }
    });
  },

  /**
   * 跳转到首页测试
   */
  testNavigateToHome: function() {
    const testParams = {
      chatId: 'chat_home_test_' + Date.now(),
      inviter: '首页测试用户',
      isInvitee: 'true'
    };
    
    this.addLog('测试跳转首页', testParams);
    
    const url = `/pages/home/home?chatId=${testParams.chatId}&inviter=${encodeURIComponent(testParams.inviter)}&isInvitee=${testParams.isInvitee}`;
    
    wx.navigateTo({
      url: url,
      success: () => {
        this.addLog('跳转首页成功');
      },
      fail: (err) => {
        this.addLog('跳转首页失败', err);
      }
    });
  },

  /**
   * 复制调试信息
   */
  copyDebugInfo: function() {
    const debugText = JSON.stringify(this.data.debugInfo, null, 2);
    
    wx.setClipboardData({
      data: debugText,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
        this.addLog('调试信息已复制到剪贴板');
      },
      fail: (err) => {
        this.addLog('复制失败', err);
      }
    });
  },

  /**
   * 测试joinByInvite云函数
   */
  testJoinByInviteFunction: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    if (!userInfo) {
      this.addLog('测试失败：用户未登录');
      return;
    }
    
    const testChatId = 'chat_debug_test_' + Date.now();
    
    this.addLog('=== 开始测试joinByInvite云函数 ===');
    this.addLog('测试聊天ID:', testChatId);
    this.addLog('用户信息:', userInfo);
    
    // 首先创建一个测试聊天
    this.addLog('步骤1: 创建测试聊天...');
    
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: testChatId,
        inviter: {
          openId: userInfo.openId,
          nickName: userInfo.nickName || '测试用户',
          avatarUrl: userInfo.avatarUrl || ''
        }
      },
      success: (createRes) => {
        this.addLog('创建聊天成功:', createRes);
        
        if (createRes.result && createRes.result.success) {
          // 步骤2: 测试加入聊天
          this.addLog('步骤2: 测试加入聊天...');
          
          wx.cloud.callFunction({
            name: 'joinByInvite',
            data: {
              chatId: testChatId,
              joiner: {
                openId: userInfo.openId,
                nickName: userInfo.nickName || '测试用户',
                avatarUrl: userInfo.avatarUrl || ''
              }
            },
            success: (joinRes) => {
              this.addLog('joinByInvite调用成功:', joinRes);
              
              if (joinRes.result) {
                if (joinRes.result.success) {
                  this.addLog('✅ joinByInvite执行成功');
                  this.addLog('返回数据:', joinRes.result);
                } else {
                  this.addLog('❌ joinByInvite执行失败:', joinRes.result.error);
                }
              } else {
                this.addLog('⚠️ joinByInvite返回result为空，可能云函数有异常');
                this.addLog('完整响应:', joinRes);
              }
            },
            fail: (joinErr) => {
              this.addLog('❌ joinByInvite调用失败:', joinErr);
            }
          });
        } else {
          this.addLog('❌ 创建聊天失败，无法继续测试');
        }
      },
      fail: (createErr) => {
        this.addLog('❌ 创建聊天失败:', createErr);
      }
    });
  },

  /**
   * 测试基础云函数功能
   */
  testCloudFunction: function() {
    this.addLog('=== 开始测试基础云函数功能 ===');
    
    wx.cloud.callFunction({
      name: 'testJoin',
      data: {
        testParam: 'hello world',
        timestamp: Date.now()
      },
      success: (res) => {
        this.addLog('✅ testJoin云函数调用成功');
        this.addLog('返回数据:', res.result);
        
        if (res.result && res.result.success) {
          this.addLog('✅ 云函数内部执行成功');
          this.addLog('数据库连接测试:', res.result.databaseTest);
        } else {
          this.addLog('❌ 云函数内部执行失败:', res.result?.error);
        }
      },
      fail: (err) => {
        this.addLog('❌ testJoin云函数调用失败:', err);
        this.addLog('错误详情:', err.errMsg);
      }
    });
  },

  /**
   * 测试完整邀请流程
   */
  testCompleteInviteFlow: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    if (!userInfo) {
      this.addLog('测试失败：用户未登录');
      return;
    }
    
    this.addLog('=== 开始测试完整邀请流程 ===');
    
    // 步骤1: 创建邀请（模拟用户A创建邀请）
    const testChatId = 'chat_invite_test_' + Date.now();
    this.addLog('步骤1: 创建邀请链接...');
    this.addLog('测试聊天ID:', testChatId);
    
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: testChatId,
        inviter: {
          openId: userInfo.openId,
          nickName: userInfo.nickName || '邀请者',
          avatarUrl: userInfo.avatarUrl || ''
        }
      },
      success: (createRes) => {
        if (createRes.result && createRes.result.success) {
          this.addLog('✅ 邀请创建成功');
          this.addLog('聊天信息:', createRes.result);
          
          // 步骤2: 模拟被邀请者加入（使用不同的用户信息）
          this.addLog('步骤2: 模拟被邀请者加入聊天...');
          
          wx.cloud.callFunction({
            name: 'joinByInvite',
            data: {
              chatId: testChatId,
              joiner: {
                openId: 'mock_invitee_' + Date.now(), // 模拟不同的用户ID
                nickName: '被邀请者',
                avatarUrl: '/assets/images/default-avatar.png'
              }
            },
            success: (joinRes) => {
              this.addLog('被邀请者加入结果:', joinRes.result);
              
              if (joinRes.result && joinRes.result.success) {
                this.addLog('✅ 被邀请者成功加入聊天');
                this.addLog('最终参与者列表:');
                
                if (joinRes.result.participants) {
                  joinRes.result.participants.forEach((p, index) => {
                    this.addLog(`参与者${index + 1}: ${p.nickName} (${p.isCreator ? '创建者' : '被邀请者'})`);
                  });
                }
                
                // 步骤3: 验证聊天状态
                this.addLog('步骤3: 验证聊天状态...');
                this.addLog('聊天状态:', joinRes.result.chat.status);
                this.addLog('聊天是否开始:', joinRes.result.chat.chatStarted);
                
                if (joinRes.result.chat.status === 'active' && joinRes.result.chat.chatStarted) {
                  this.addLog('✅ 完整邀请流程测试成功！');
                  this.addLog('🎉 邀请链接功能已完全修复');
                } else {
                  this.addLog('⚠️ 聊天状态未正确更新');
                }
              } else {
                this.addLog('❌ 被邀请者加入失败:', joinRes.result?.error);
              }
            },
            fail: (joinErr) => {
              this.addLog('❌ 被邀请者加入调用失败:', joinErr);
            }
          });
        } else {
          this.addLog('❌ 邀请创建失败:', createRes.result?.error);
        }
      },
      fail: (createErr) => {
        this.addLog('❌ 创建邀请调用失败:', createErr);
      }
    });
  },

  /**
   * 测试真实邀请链接流程
   */
  testRealInviteLink: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    if (!userInfo) {
      this.addLog('测试失败：用户未登录');
      return;
    }
    
    this.addLog('=== 开始测试真实邀请链接流程 ===');
    
    // 步骤1: 创建真实邀请
    const testChatId = 'chat_real_test_' + Date.now();
    this.addLog('步骤1: 创建真实邀请链接...');
    this.addLog('聊天ID:', testChatId);
    
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: testChatId,
        inviter: {
          openId: userInfo.openId,
          nickName: userInfo.nickName || '邀请者',
          avatarUrl: userInfo.avatarUrl || ''
        }
      },
      success: (createRes) => {
        if (createRes.result && createRes.result.success) {
          this.addLog('✅ 真实邀请创建成功');
          
          // 步骤2: 模拟分享链接点击
          this.addLog('步骤2: 模拟分享链接点击...');
          
          // 构造真实的分享链接参数
          const realInviteParams = {
            chatId: testChatId,
            inviter: encodeURIComponent(userInfo.nickName || '邀请者'),
            isInvitee: 'true',
            scene: 'invite'
          };
          
          this.addLog('分享链接参数:', realInviteParams);
          
          // 步骤3: 保存到缓存并测试首页流程
          wx.setStorageSync('pendingInvite', {
            chatId: testChatId,
            inviter: userInfo.nickName || '邀请者',
            isInvitee: true
          });
          
          this.addLog('✅ 邀请参数已保存到缓存');
          this.addLog('现在可以测试跳转首页功能');
          
          // 提示用户
          wx.showModal({
            title: '测试准备完成',
            content: '真实邀请已创建并保存。现在可以点击"测试跳转首页"来验证完整流程。',
            showCancel: false
          });
          
        } else {
          this.addLog('❌ 创建真实邀请失败:', createRes.result?.error);
        }
      },
      fail: (createErr) => {
        this.addLog('❌ 创建真实邀请调用失败:', createErr);
      }
    });
  },

  /**
   * 测试真实分享链接
   */
  testRealShareLink: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    if (!userInfo) {
      this.addLog('测试失败：用户未登录');
      return;
    }
    
    this.addLog('=== 开始测试真实分享链接 ===');
    
    // 步骤1: 创建真实邀请
    const testChatId = 'chat_share_test_' + Date.now();
    this.addLog('步骤1: 创建分享聊天...');
    this.addLog('聊天ID:', testChatId);
    
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: testChatId,
        inviter: {
          openId: userInfo.openId,
          nickName: userInfo.nickName || '邀请者',
          avatarUrl: userInfo.avatarUrl || ''
        }
      },
      success: (createRes) => {
        if (createRes.result && createRes.result.success) {
          this.addLog('✅ 分享聊天创建成功');
          
          // 步骤2: 构造真实分享链接
          const nickName = userInfo.nickName || '邀请者';
          const shareLink = `/pages/home/home?chatId=${testChatId}&inviter=${encodeURIComponent(nickName)}&isInvitee=true&scene=invite`;
          
          this.addLog('步骤2: 生成分享链接');
          this.addLog('分享链接:', shareLink);
          
          // 步骤3: 启动聊天状态监听
          this.addLog('步骤3: 启动聊天状态监听...');
          this.startChatStatusMonitor(testChatId);
          
          // 步骤4: 模拟点击分享链接
          this.addLog('步骤4: 模拟点击分享链接...');
          
          // 延迟一下，让监听器先启动
          setTimeout(() => {
            // 直接跳转测试分享链接
            wx.navigateTo({
              url: shareLink,
              success: () => {
                this.addLog('✅ 成功模拟分享链接点击');
                this.addLog('现在应该能看到直接加入聊天的过程');
              },
              fail: (err) => {
                this.addLog('❌ 分享链接跳转失败:', err);
              }
            });
          }, 1000);
          
        } else {
          this.addLog('❌ 创建分享聊天失败:', createRes.result?.error);
        }
      },
      fail: (createErr) => {
        this.addLog('❌ 创建分享聊天调用失败:', createErr);
      }
    });
  },

  /**
   * 启动聊天状态监听
   */
  startChatStatusMonitor: function(chatId) {
    this.addLog('🔍 启动聊天状态监听:', chatId);
    
    // 清除之前的监听器
    if (this.chatStatusWatcher) {
      this.chatStatusWatcher.close();
    }
    
    try {
      const db = wx.cloud.database();
      this.chatStatusWatcher = db.collection('conversations')
        .doc(chatId)
        .watch({
          onChange: snapshot => {
            this.addLog('📢 监听到聊天状态变化:', snapshot);
            
            if (snapshot.docChanges && snapshot.docChanges.length > 0) {
              const chatData = snapshot.docChanges[0].doc;
              
              this.addLog('聊天数据:', {
                status: chatData.status,
                chatStarted: chatData.chatStarted,
                participantsCount: chatData.participants?.length || 0
              });
              
              // 检查聊天是否已开始
              const participants = chatData.participants || [];
              const chatStatus = chatData.status;
              const chatStarted = chatData.chatStarted;
              
              const chatHasStarted = participants.length > 1 || 
                                   chatStatus === 'active' || 
                                   chatStarted === true;
              
              if (chatHasStarted) {
                this.addLog('🎉 检测到聊天已开始！');
                this.addLog('参与者列表:', participants.map(p => p.nickName || p.name || '未知'));
                
                // 关闭监听
                this.chatStatusWatcher.close();
                this.chatStatusWatcher = null;
                
                this.addLog('✅ 分享链接测试成功完成！');
              }
            }
          },
          onError: err => {
            this.addLog('❌ 聊天状态监听出错:', err);
          }
        });
        
      this.addLog('✅ 聊天状态监听器已启动');
      
      // 设置监听超时
      setTimeout(() => {
        if (this.chatStatusWatcher) {
          this.chatStatusWatcher.close();
          this.chatStatusWatcher = null;
          this.addLog('⏰ 聊天状态监听超时');
        }
      }, 60000); // 1分钟超时
      
    } catch (err) {
      this.addLog('❌ 启动聊天状态监听失败:', err);
    }
  },

  /**
   * 页面卸载时清理监听器
   */
  onUnload: function() {
    if (this.chatStatusWatcher) {
      this.chatStatusWatcher.close();
      this.chatStatusWatcher = null;
    }
    if (this.sharerWatcher) {
      this.sharerWatcher.close();
      this.sharerWatcher = null;
    }
  },

  /**
   * 测试分享者监听功能
   */
  testSharerListening: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    if (!userInfo) {
      this.addLog('测试失败：用户未登录');
      return;
    }
    
    this.addLog('=== 开始测试分享者监听功能 ===');
    
    // 步骤1: 创建邀请
    const testChatId = 'chat_listener_test_' + Date.now();
    this.addLog('步骤1: 创建测试聊天...');
    this.addLog('聊天ID:', testChatId);
    
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: testChatId,
        inviter: {
          openId: userInfo.openId,
          nickName: userInfo.nickName || '邀请者',
          avatarUrl: userInfo.avatarUrl || ''
        }
      },
      success: (createRes) => {
        if (createRes.result && createRes.result.success) {
          this.addLog('✅ 测试聊天创建成功');
          
          // 步骤2: 启动分享者监听（模拟首页的监听逻辑）
          this.addLog('步骤2: 启动分享者监听...');
          this.startSharerListening(testChatId);
          
          // 步骤3: 延迟模拟被邀请者加入
          this.addLog('步骤3: 5秒后模拟被邀请者加入...');
          setTimeout(() => {
            this.simulateInviteeJoin(testChatId);
          }, 5000);
          
        } else {
          this.addLog('❌ 创建测试聊天失败:', createRes.result?.error);
        }
      },
      fail: (createErr) => {
        this.addLog('❌ 创建测试聊天调用失败:', createErr);
      }
    });
  },

  /**
   * 启动分享者监听
   */
  startSharerListening: function(chatId) {
    this.addLog('🔍 启动分享者监听模式:', chatId);
    
    // 清除之前的监听器
    if (this.sharerWatcher) {
      this.sharerWatcher.close();
    }
    
    this.shareStartTime = Date.now();
    
    try {
      const db = wx.cloud.database();
      this.sharerWatcher = db.collection('conversations')
        .doc(chatId)
        .watch({
          onChange: snapshot => {
            this.addLog('📢 分享者监听到变化:', snapshot);
            
            if (snapshot.docChanges && snapshot.docChanges.length > 0) {
              const chatData = snapshot.docChanges[0].doc;
              
              // 检查多个条件：参与者数量、聊天状态、chatStarted标志
              const participants = chatData.participants || [];
              const chatStatus = chatData.status;
              const chatStarted = chatData.chatStarted;
              
              this.addLog('📊 状态检查:', {
                participantsCount: participants.length,
                chatStatus: chatStatus,
                chatStarted: chatStarted
              });
              
              // 如果满足以下任一条件，说明聊天已开始：
              const chatHasStarted = participants.length > 1 || 
                                   chatStatus === 'active' || 
                                   chatStarted === true;
              
              if (chatHasStarted) {
                this.addLog('🎉 分享者检测到聊天已开始！');
                this.addLog('参与者:', participants.map(p => p.nickName || p.name || '未知'));
                
                // 关闭监听
                this.sharerWatcher.close();
                this.sharerWatcher = null;
                
                this.addLog('✅ 分享者监听测试成功！');
                this.addLog('🚀 现在应该自动跳转到聊天页面');
              } else {
                // 更新等待状态
                const elapsed = Math.floor((Date.now() - this.shareStartTime) / 1000);
                this.addLog(`⏳ 等待被邀请者加入中 (${elapsed}秒)...`);
              }
            }
          },
          onError: err => {
            this.addLog('❌ 分享者监听出错:', err);
          }
        });
        
      this.addLog('✅ 分享者监听器已启动');
      
      // 设置超时
      setTimeout(() => {
        if (this.sharerWatcher) {
          this.sharerWatcher.close();
          this.sharerWatcher = null;
          this.addLog('⏰ 分享者监听超时');
        }
      }, 30000); // 30秒超时
      
    } catch (err) {
      this.addLog('❌ 启动分享者监听失败:', err);
    }
  },

  /**
   * 模拟被邀请者加入
   */
  simulateInviteeJoin: function(chatId) {
    this.addLog('👤 模拟被邀请者加入聊天...');
    
    wx.cloud.callFunction({
      name: 'joinByInvite',
      data: {
        chatId: chatId,
        joiner: {
          openId: 'mock_invitee_' + Date.now(),
          nickName: '测试被邀请者',
          avatarUrl: '/assets/images/default-avatar.png'
        }
      },
      success: (joinRes) => {
        this.addLog('被邀请者加入结果:', joinRes.result);
        
        if (joinRes.result && joinRes.result.success) {
          this.addLog('✅ 被邀请者成功加入聊天');
          this.addLog('现在分享者应该能监听到变化并自动跳转');
        } else {
          this.addLog('❌ 被邀请者加入失败:', joinRes.result?.error);
        }
      },
      fail: (joinErr) => {
        this.addLog('❌ 被邀请者加入调用失败:', joinErr);
      }
    });
  },

  /**
   * 测试首页分享功能
   */
  testHomePageShare: function() {
    this.addLog('=== 开始测试首页分享功能 ===');
    
    // 跳转到首页，然后模拟分享操作
    this.addLog('步骤1: 跳转到首页');
    
    wx.navigateTo({
      url: '/pages/home/home',
      success: () => {
        this.addLog('✅ 成功跳转到首页');
        this.addLog('请在首页通过右上角菜单进行分享测试');
        this.addLog('分享后返回调试页面查看结果');
      },
      fail: (err) => {
        this.addLog('❌ 跳转首页失败: ' + JSON.stringify(err));
      }
    });
  },

  /**
   * 直接测试分享逻辑
   */
  testDirectShare: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    
    if (!userInfo) {
      this.addLog('测试失败：用户未登录');
      return;
    }
    
    this.addLog('=== 开始直接测试分享逻辑 ===');
    
    // 模拟 onShareAppMessage 逻辑
    const nickName = userInfo.nickName || '好友';
    const shareCreatedChatId = 'chat_direct_test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    this.addLog('步骤1: 创建测试聊天ID:', shareCreatedChatId);
    
    // 步骤2: 调用 createInvite 云函数
    this.addLog('步骤2: 调用 createInvite 云函数...');
    
    wx.cloud.callFunction({
      name: 'createInvite',
      data: {
        chatId: shareCreatedChatId,
        inviter: {
          openId: app.globalData.openId,
          nickName: nickName,
          avatarUrl: userInfo.avatarUrl
        }
      },
      success: (res) => {
        this.addLog('✅ createInvite 调用成功:', res.result);
        
        if (res.result && res.result.success) {
          this.addLog('✅ 邀请创建成功');
          
          // 步骤3: 构造分享链接
          const shareLink = `/pages/home/home?chatId=${shareCreatedChatId}&inviter=${encodeURIComponent(nickName)}&isInvitee=true&scene=invite`;
          this.addLog('步骤3: 分享链接:', shareLink);
          
          // 步骤4: 测试分享链接
          this.addLog('步骤4: 测试点击分享链接...');
          
          setTimeout(() => {
            wx.navigateTo({
              url: shareLink,
              success: () => {
                this.addLog('✅ 分享链接跳转成功');
                this.addLog('现在应该能看到被邀请者加入流程');
              },
              fail: (err) => {
                this.addLog('❌ 分享链接跳转失败:', err);
              }
            });
          }, 1000);
          
        } else {
          this.addLog('❌ 邀请创建失败:', res.result?.error);
        }
      },
      fail: (err) => {
        this.addLog('❌ createInvite 调用失败:', err);
      }
    });
  }
}); 