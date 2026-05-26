/**
 * 聊天页调试与工具方法集
 *
 * 这里收纳的所有方法都是"非生产路径"的:
 * - 仅由调试菜单(showChatMenu / showMoreMenu / wx.showActionSheet)触发
 * - 部分由用户主动操作触发(如清理重复参与者弹窗确认后)
 *
 * 设计原则(详见 .kiro/specs/chat-debug-tools-module/design.md):
 * - attach 模式: 函数体内 `this === page`
 * - 不引入新状态,通过 page 实例属性 / page.data 与 wx.cloud 交互
 */

const ChatHelpers = require('./chat-helpers.js');

/**
* 🚨 显示身份修复对话框
*/
function showIdentityFixDialog() {
  wx.showModal({
    title: '🚨 身份检测异常',
    content: `检测到您可能是聊天创建者，但被误判为接收方。\n\n当前用户：${this.data.currentUser?.nickName}\n邀请者记录：朋友\n\n是否修复为发送方身份？`,
    confirmText: '修复身份',
    cancelText: '保持现状',
    success: (res) => {
      if (res.confirm) {
        console.log('🚨 [身份修复] 用户选择修复身份');
        this.fixIdentityToSender();
      } else {
        console.log('🚨 [身份修复] 用户选择保持现状');
      }
    }
  });
}

/**
* 🔧 修复用户身份为发送方
*/
function fixIdentityToSender() {
  // 🔥 【HOTFIX-v1.3.21】移除强制接收方模式检查，恢复正常身份修复功能
  console.log('🔧 [身份修复] 开始执行身份修复');
  
  console.log('🔧 [身份修复] 开始修复用户身份为发送方');
  
  // 清除邀请信息
  const app = getApp();
  app.clearInviteInfo();
  
  // 重置页面状态为发送方
  this.setData({
    isFromInvite: false,
    isCreatingChat: false,
    chatCreationStatus: '',
    receiverTitleLocked: false, // 解除接收方标题锁定
    shouldShowIdentityFix: false
  });
  
  // 更新标题为发送方格式
  const senderTitle = this.data.currentUser?.nickName || '我';
  this.setData({
    dynamicTitle: senderTitle,
    contactName: senderTitle,
    chatTitle: senderTitle
  });
  
  // 更新导航栏标题
  wx.setNavigationBarTitle({
    title: senderTitle,
    success: () => {
      console.log('🔧 [身份修复] 发送方标题设置成功:', senderTitle);
      
      wx.showToast({
        title: '✅ 身份已修复为发送方',
        icon: 'success',
        duration: 2000
      });
      
      // 重新获取聊天数据
      setTimeout(() => {
        this.fetchMessages();
        this.fetchChatParticipantsWithRealNames();
      }, 500);
    }
  });
  
  console.log('🔧 [身份修复] 身份修复完成，当前为发送方');
}

/**
* 🔧 专门修复特定用户昵称问题
*/
function fixSpecificUserNickname() {
  console.log('🔧 [专项修复] 开始修复ojtOs7bA8w-ZdS1G_o5rdoeLzWDc用户昵称');
  
  const targetUserId = 'ojtOs7bA8w-ZdS1G_o5rdoeLzWDc';
  const correctNickname = '向冬';
  
  // 直接调用云函数更新用户信息
  wx.cloud.callFunction({
    name: 'updateUserInfo',
    data: {
      openId: targetUserId,
      userInfo: {
        nickName: correctNickname,
        avatarUrl: '/assets/images/default-avatar.png'
      }
    },
    success: res => {
      console.log('🔧 [专项修复] 用户信息更新成功:', res);
      
      // 更新本地参与者数据
      const participants = this.data.participants || [];
      const updatedParticipants = participants.map(p => {
        const participantOpenId = p.openId || p.id;
        if (participantOpenId === targetUserId) {
          return {
            ...p,
            nickName: correctNickname,
            name: correctNickname
          };
        }
        return p;
      });
      
      // 更新页面数据
      this.setData({
        participants: updatedParticipants
      });
      
      // 重新获取参与者信息并更新标题
      setTimeout(() => {
        this.fetchChatParticipantsWithRealNames();
        this.updateDynamicTitleWithRealNames();
      }, 500);
      
      wx.showToast({
        title: '昵称修复成功',
        icon: 'success'
      });
    },
    fail: err => {
      console.error('🔧 [专项修复] 用户信息更新失败:', err);
      wx.showToast({
        title: '修复失败',
        icon: 'error'
      });
    }
  });
}

/**
* 📱 快速标题测试
*/
function quickTitleTest() {
   console.log('📱 [快速测试] 开始快速标题测试');
   
   wx.showModal({
     title: '快速标题测试',
     content: '直接调用接收方标题更新逻辑\n期望结果：我和向冬（2）',
     confirmText: '开始测试',
     cancelText: '取消',
     success: (res) => {
       if (res.confirm) {
         console.log('📱 [快速测试] 开始执行...');
         
         // 🔥 【修复接收方标题】动态获取邀请者昵称进行测试
  const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
         let testInviterName = '邀请者';
  
  if (urlParams.inviter) {
    try {
             testInviterName = decodeURIComponent(decodeURIComponent(urlParams.inviter));
             if (!testInviterName || testInviterName === '朋友' || testInviterName === '好友') {
               testInviterName = '邀请者';
      }
    } catch (e) {
             testInviterName = '邀请者';
           }
         }
         
         // 直接调用接收方标题更新逻辑
         this.updateTitleForReceiver(testInviterName);
         
         // 延迟验证结果
         setTimeout(() => {
           const currentTitle = this.data.dynamicTitle;
           console.log('📱 [快速测试] 测试完成，当前标题:', currentTitle);
           
           wx.showModal({
             title: '测试结果',
             content: `当前标题: ${currentTitle}\n期望标题: 我和向冬（2）\n\n${currentTitle === '我和向冬（2）' ? '✅ 测试成功！' : '❌ 测试失败'}`,
             showCancel: false,
             confirmText: '知道了'
           });
         }, 1000);
       }
     }
   });
 }

/**
 * 🔗 专门测试接收方标题显示
 */
function testReceiverTitle() {
  console.log('🔗 [接收方测试] 开始专门测试接收方标题显示');
  
  wx.showActionSheet({
    itemList: ['📱 快速标题测试', '🔄 完整接收方模拟', '🔗 真实分享链接测试', '🔍 当前状态诊断'],
    success: (res) => {
      switch(res.tapIndex) {
        case 0: // 快速标题测试
          this.quickTitleTest();
          break;
        case 1: // 完整接收方模拟
          this.fullReceiverSimulation();
          break;
        case 2: // 真实分享链接测试
          this.realShareLinkTest();
          break;
        case 3: // 当前状态诊断
          this.diagnosisCurrentState();
          break;
      }
    },
    fail: (err) => {
      console.error('🔗 [接收方测试] 菜单显示失败:', err);
    }
  });
}

/**
 * 🔄 完整接收方模拟
 */
function fullReceiverSimulation() {
  console.log('🔄 [完整模拟] 开始完整接收方模拟');
  
  wx.showModal({
    title: '完整接收方模拟',
    content: '模拟接收方完整进入流程：\n1. 切换到Y.身份\n2. 模拟URL参数\n3. 应用接收方逻辑\n4. 验证标题显示',
    confirmText: '开始模拟',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        console.log('🔄 [完整模拟] 开始执行完整模拟...');
        
        // 1. 先切换到接收方身份
        const receiverInfo = {
          openId: 'ojtOs7bmxy-8M5wOTcgrqlYedgyY',
          nickName: 'Y.',
          avatarUrl: '/assets/images/default-avatar.png'
        };
        
        // 2. 模拟URL参数（接收方会有这些参数）
        const currentPage = getCurrentPages()[getCurrentPages().length - 1];
        if (currentPage && currentPage.options) {
          currentPage.options.inviter = encodeURIComponent('向冬');
          currentPage.options.fromInvite = 'true';
          console.log('🔄 [完整模拟] 已设置模拟URL参数:', currentPage.options);
        }
        
        // 3. 切换身份并应用接收方逻辑
        this.switchUserForTesting(receiverInfo);
        
        // 4. 延迟验证结果
        setTimeout(() => {
          const currentTitle = this.data.dynamicTitle;
          console.log('🔄 [完整模拟] 完整模拟完成，当前标题:', currentTitle);
          
          wx.showModal({
            title: '完整模拟结果',
            content: `身份: ${this.data.currentUser?.nickName}\n当前标题: ${currentTitle}\n期望标题: 我和向冬（2）\n\n${currentTitle === '我和向冬（2）' ? '✅ 模拟成功！' : '❌ 模拟失败，需要调试'}`,
            showCancel: false,
            confirmText: '知道了'
          });
        }, 2000);
      }
    }
  });
}

/**
 * 🔗 真实分享链接测试
 */
function realShareLinkTest() {
  console.log('🔗 [真实分享] 开始真实分享链接测试');
  
  const app = getApp();
  const userInfo = app.globalData.userInfo || {};
  const chatId = this.data.contactId;
  const nickName = userInfo.nickName || '用户';
  
  // 生成真实的分享链接（和onShareAppMessage中一致）
  const sharePath = `/app/pages/chat/chat?id=${chatId}&inviter=${encodeURIComponent(nickName)}&fromInvite=true`;
  
  console.log('🔗 [真实分享] 生成的分享链接:', sharePath);
  console.log('🔗 [真实分享] 分享者信息:', { nickName, openId: userInfo.openId });
  console.log('🔗 [真实分享] 编码后的昵称:', encodeURIComponent(nickName));
  
  wx.showActionSheet({
    itemList: ['📋 复制完整链接', '🔧 生成编译模式配置', '📱 直接跳转测试'],
    success: (res) => {
      switch(res.tapIndex) {
        case 0: // 复制完整链接
          wx.setClipboardData({
            data: sharePath,
            success: () => {
              wx.showToast({
                title: '链接已复制',
                icon: 'success'
              });
            }
          });
          break;
        case 1: // 生成编译模式配置
          this.generateCompileModeConfig(chatId, nickName);
          break;
        case 2: // 直接跳转测试
          this.directJumpTest(chatId, nickName);
          break;
      }
    }
  });
}

/**
 * 🔍 当前状态诊断
 */
function diagnosisCurrentState() {
  console.log('🔍 [状态诊断] 开始诊断当前状态');
  
  const currentUser = this.data.currentUser;
  const participants = this.data.participants;
  const currentTitle = this.data.dynamicTitle;
  const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
  
  const diagnosisInfo = {
    当前用户: currentUser,
    参与者列表: participants,
    当前标题: currentTitle,
    URL参数: urlParams,
    参与者数量: participants?.length || 0
  };
  
  console.log('🔍 [状态诊断] 诊断结果:', diagnosisInfo);
  
  // 同时显示分享链接信息
  const chatId = this.data.contactId;
  const nickName = currentUser?.nickName || '用户';
  const sharePath = `/app/pages/chat/chat?id=${chatId}&inviter=${encodeURIComponent(nickName)}&fromInvite=true`;
  console.log('🔍 [状态诊断] 当前用户的分享链接:', sharePath);
  
  wx.showModal({
    title: '当前状态诊断',
    content: `用户: ${currentUser?.nickName}\n标题: ${currentTitle}\n参与者: ${participants?.length || 0}个\n聊天ID: ${chatId}\n\n分享链接: ${sharePath}\n\n详细信息已输出到控制台`,
    showCancel: false,
    confirmText: '复制分享链接',
    success: (res) => {
      if (res.confirm) {
        wx.setClipboardData({
          data: sharePath,
          success: () => {
            wx.showToast({
              title: '分享链接已复制',
              icon: 'success'
            });
          }
        });
      }
    }
  });
}

/**
 * 🔧 开发者调试：切换用户身份
 */
function switchUserForTesting(targetUserInfo) {
  console.log('🔧 [调试] 切换用户身份进行测试:', targetUserInfo);
  
  const app = getApp();
  
  // 🔥 完整同步用户信息到所有存储位置
  app.globalData.userInfo = targetUserInfo;
  app.globalData.openId = targetUserInfo.openId;
  
  // 更新本地存储
  wx.setStorageSync('userInfo', targetUserInfo);
  wx.setStorageSync('openId', targetUserInfo.openId);
  
  // 🔥 完整更新页面当前用户信息
  this.setData({
    currentUser: targetUserInfo
  });
  
  // 🔧 检测是否是接收方身份（Y.）
  const isReceiver = targetUserInfo.nickName === 'Y.' || targetUserInfo.openId.includes('8M5wOT');
  
  console.log('🔧 [调试] 是否为接收方身份:', isReceiver);
  
  // 🔥 立即更新数据库中的用户信息，确保一致性
  wx.cloud.callFunction({
    name: 'updateUserInfo',
    data: {
      openId: targetUserInfo.openId,
      userInfo: {
        nickName: targetUserInfo.nickName,
        avatarUrl: targetUserInfo.avatarUrl
      }
    },
    success: res => {
      console.log('🔧 [调试] 数据库用户信息已同步:', res);
      
      if (isReceiver) {
        // 🔗 接收方：使用专门的接收方标题更新逻辑
        console.log('🔧 [调试] 应用接收方特殊逻辑');
        setTimeout(() => {
          // 🔥 【修复接收方标题】动态获取邀请者昵称，不使用硬编码
          const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
          let inviterName = '邀请者';
          
          if (urlParams.inviter) {
            try {
              inviterName = decodeURIComponent(decodeURIComponent(urlParams.inviter));
              if (!inviterName || inviterName === '朋友' || inviterName === '好友') {
                inviterName = '邀请者';
              }
            } catch (e) {
              inviterName = '邀请者';
            }
          }
          
          this.updateTitleForReceiver(inviterName);
          
          // 🔧 验证接收方切换结果
          setTimeout(() => {
            console.log('🔧 [调试验证] 接收方身份切换完成');
            console.log('🔧 [调试验证] 当前用户:', this.data.currentUser);
            console.log('🔧 [调试验证] 动态标题:', this.data.dynamicTitle);
            
            // 强制刷新参与者信息
            this.fetchChatParticipantsWithRealNames();
          }, 200);
        }, 300);
      } else {
        // 🔗 发送方：使用常规逻辑
        console.log('🔧 [调试] 应用发送方常规逻辑');
        setTimeout(() => {
          this.fetchChatParticipantsWithRealNames();
          this.updateDynamicTitleWithRealNames();
        }, 300);
      }
    },
    fail: err => {
      console.error('🔧 [调试] 同步数据库用户信息失败:', err);
      
      // 即使失败也要更新标题
      if (isReceiver) {
        setTimeout(() => {
          // 🔥 【修复接收方标题】动态获取邀请者昵称，不使用硬编码
          const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
          let inviterName = '邀请者';
          
          if (urlParams.inviter) {
            try {
              inviterName = decodeURIComponent(decodeURIComponent(urlParams.inviter));
              if (!inviterName || inviterName === '朋友' || inviterName === '好友') {
                inviterName = '邀请者';
              }
            } catch (e) {
              inviterName = '邀请者';
            }
          }
          
          this.updateTitleForReceiver(inviterName);
          this.fetchChatParticipantsWithRealNames();
        }, 300);
      } else {
        setTimeout(() => {
          this.fetchChatParticipantsWithRealNames();
          this.updateDynamicTitleWithRealNames();
        }, 300);
      }
    }
  });
  
  console.log('🔧 [调试] 用户身份切换完成，身份信息:', targetUserInfo);
}

/**
 * 🔧 开发者调试：切换到接收方Y.的身份
 */
function testAsReceiver() {
  const receiverInfo = {
    openId: 'ojtOs7bmxy-8M5wOTcgrqlYedgyY',
    nickName: 'Y.',
    avatarUrl: '/assets/images/default-avatar.png'
  };
  
  console.log('🔧 [调试] 切换到接收方Y.的身份');
  wx.showModal({
    title: '身份切换确认',
    content: '即将切换到用户"Y."的身份，以查看接收方视角\n\n切换后标题应显示："我和向冬（2）"',
    confirmText: '确认切换',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        this.switchUserForTesting(receiverInfo);
        
        // 🔥 延迟显示切换完成提示，确保同步完成
        setTimeout(() => {
          wx.showToast({
            title: '已切换到Y.身份',
            icon: 'success'
          });
        }, 500);
      }
    }
  });
}

/**
 * 🔧 开发者调试：切换到发送方向冬的身份
 */
function testAsSender() {
  const senderInfo = {
    openId: 'local_1749386034798', // 使用最新的openId
    nickName: '向冬',
    avatarUrl: 'wxfile://tmp_c2ee0092dc36e9a37acc76e1d85ec001.jpg'
  };
  
  console.log('🔧 [调试] 切换到发送方向冬的身份');
  wx.showModal({
    title: '身份切换确认',
    content: '即将切换到用户"向冬"的身份，以查看发送方视角\n\n切换后标题应显示："我和Y.（2）"',
    confirmText: '确认切换',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        this.switchUserForTesting(senderInfo);
        wx.showToast({
          title: '已切换到向冬身份',
          icon: 'success'
        });
      }
    }
  });
}

/**
 * 🔧 开发者调试：模拟双方对话
 */
function simulateTwoPersonChat() {
  console.log('🔧 [调试] 开始模拟双方对话');
  
  const chatId = this.data.contactId;
  if (!chatId) {
    console.log('🔧 [调试] 没有有效的聊天ID');
    return;
  }
  
  // 模拟向冬发送一条消息
  const xiangdongInfo = {
    openId: 'local_1749385086984',
    nickName: '向冬',
    avatarUrl: 'wxfile://tmp_7eb2fe7cbe5b52889edc489cd30e02ee.jpg'
  };
  
  // 切换到向冬身份
  this.switchUserForTesting(xiangdongInfo);
  
  // 发送一条测试消息
  setTimeout(() => {
    wx.cloud.callFunction({
      name: 'sendMessage',
      data: {
        chatId: chatId,
       content: '你好，我是向冬',
       type: 'text',
       destroyTimeout: DEFAULT_DESTROY_TIMEOUT
      },
      success: (res) => {
        console.log('🔧 [调试] 向冬的消息发送成功:', res);
        
        // 等待一秒后切换回Y.身份
        setTimeout(() => {
          this.testAsReceiver();
          console.log('🔧 [调试] 模拟双方对话完成，现在可以看到接收方视角');
        }, 1000);
      },
      fail: (err) => {
        console.error('🔧 [调试] 向冬的消息发送失败:', err);
      }
    });
  }, 500);
}

  /**
 * 🔗 手动加入现有聊天
 */
function manualJoinExistingChat() {
  console.log('🔗 [手动加入] 开始手动加入现有聊天');
  
  wx.showActionSheet({
    itemList: ['快速加入Y.和向冬聊天', '手动输入聊天ID', '取消'],
    success: (res) => {
      if (res.tapIndex === 0) {
        // 快速加入已知聊天
        const existingChatId = 'chat_1749387195464_x63npwmgz'; // 发送方创建的聊天ID
        
        console.log('🔗 [手动加入] 快速加入聊天:', existingChatId);
        
        // 切换到正确的接收方身份
        const receiverInfo = {
          openId: 'ojtOs7bmxy-8M5wOTcgrqlYedgyY',
          nickName: 'Y.',
          avatarUrl: '/assets/images/default-avatar.png'
        };
        
        // 先切换身份
        this.switchUserForTesting(receiverInfo);
        
        // 等待身份切换完成后加入聊天
        setTimeout(() => {
          this.joinSpecificChat(existingChatId, '向冬');
        }, 1000);
        
      } else if (res.tapIndex === 1) {
        // 手动输入聊天ID
        this.showChatIdInput();
      }
    }
  });
}

/**
 * 🔗 显示聊天ID输入框
 */
function showChatIdInput() {
  wx.showModal({
    title: '输入聊天ID',
    content: '请输入要加入的聊天ID:',
    editable: true,
    placeholderText: 'chat_xxxxxxxxx_xxxxxxx',
    success: (res) => {
      if (res.confirm && res.content) {
        const chatId = res.content.trim();
        if (chatId.startsWith('chat_')) {
          console.log('🔗 [手动加入] 用户输入聊天ID:', chatId);
          
          // 询问用户身份
          wx.showModal({
            title: '选择身份',
            content: '请选择您的身份:',
            confirmText: 'Y.',
            cancelText: '向冬',
            success: (identityRes) => {
              let userInfo, inviterName;
              
              if (identityRes.confirm) {
                // Y.身份
                userInfo = {
                  openId: 'ojtOs7bmxy-8M5wOTcgrqlYedgyY',
                  nickName: 'Y.',
                  avatarUrl: '/assets/images/default-avatar.png'
                };
                inviterName = '向冬';
              } else {
                // 向冬身份  
                userInfo = {
                  openId: 'ojtOs7bA8w-ZdS1G_o5rdoeLzWDc',
                  nickName: '向冬',
                  avatarUrl: '/assets/images/default-avatar.png'
                };
                inviterName = 'Y.';
              }
              
              // 切换身份并加入聊天
              this.switchUserForTesting(userInfo);
              setTimeout(() => {
                this.joinSpecificChat(chatId, inviterName);
              }, 1000);
            }
          });
        } else {
          wx.showToast({
            title: '聊天ID格式不正确',
            icon: 'error'
          });
        }
      }
    }
  });
}

/**
 * 🔗 加入指定的聊天
 */
function joinSpecificChat(chatId, inviterName) {
  console.log('🔗 [加入聊天] 开始加入指定聊天:', chatId, inviterName);
  
  // 显示加载
  // 🔥 修改：后台静默加入聊天，不显示加载气泡
  console.log('🔗 开始后台静默加入聊天...');
  
  // 调用加入聊天的云函数
  wx.cloud.callFunction({
    name: 'joinByInvite',
    data: {
      chatId: chatId,
      inviterNickName: inviterName
    },
    success: res => {
      console.log('🔗 [加入聊天] 加入成功:', res);
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        // 更新页面状态
        this.setData({
          contactId: chatId,
          isLoading: false
        });
        
        // 获取聊天记录和参与者
        this.fetchMessages();
        this.fetchChatParticipantsWithRealNames();
        
        // 🔧 移除立即添加的系统消息，等待fetchChatParticipantsWithRealNames中的智能判断
        // this.addSystemMessage(`您加入了${inviterName}的聊天！`);
        
        // 更新标题
        setTimeout(() => {
          this.updateDynamicTitleWithRealNames();
        }, 500);
        
        // 🔗 [连接提示修复] 移除Toast提示，避免干扰用户体验
        // wx.showToast({
        //   title: '成功加入聊天',
        //   icon: 'success'
        // });
        console.log('🔗 [连接提示修复] ✅ 成功加入聊天，静默记录结果');
      } else {
        wx.showToast({
          title: '加入聊天失败',
          icon: 'error'
        });
      }
    },
    fail: err => {
      console.error('🔗 [加入聊天] 加入失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '加入聊天失败',
        icon: 'error'
      });
    }
  });
}

/**
 * 🔧 生成编译模式配置
 */
function generateCompileModeConfig(chatId, nickName) {
  const config = {
    page: 'app/pages/chat/chat',
    query: `id=${chatId}&inviter=${encodeURIComponent(nickName)}&fromInvite=true`,
    scene: 1007
  };
  
  const configText = `编译模式配置：\n\n启动页面：${config.page}\n启动参数：${config.query}\n场景值：${config.scene}`;
  
  console.log('🔧 [编译模式] 生成的配置:', config);
  
  wx.showModal({
    title: '编译模式配置',
    content: configText,
    confirmText: '复制参数',
    cancelText: '知道了',
    success: (res) => {
      if (res.confirm) {
        wx.setClipboardData({
          data: config.query,
          success: () => {
            wx.showToast({
              title: '参数已复制',
              icon: 'success'
            });
          }
        });
      }
    }
  });
}

/**
 * 📱 直接跳转测试
 */
function directJumpTest(chatId, nickName) {
  console.log('📱 [直接跳转] 开始直接跳转测试');
  
  this._localMessageCache = [];
  this.setData({
    messages: [],
    participants: [],
    dynamicTitle: '聊天'
  });
  
  // 模拟从分享链接进入，重新调用onLoad
  const mockOptions = {
    id: chatId,
    inviter: encodeURIComponent(nickName),
    fromInvite: 'true'
  };
  
  console.log('📱 [直接跳转] 模拟onLoad参数:', mockOptions);
  
  // 先切换到接收方身份
  const receiverInfo = {
    openId: 'ojtOs7bmxy-8M5wOTcgrqlYedgyY',
    nickName: 'Y.',
    avatarUrl: '/assets/images/default-avatar.png'
  };
  
  this.switchUserForTesting(receiverInfo);
  
  // 延迟重新加载
  setTimeout(() => {
    this.onLoad(mockOptions);
    
    wx.showToast({
      title: '跳转测试已开始',
      icon: 'success'
    });
  }, 1000);
}

/**
 * 🔧 紧急修复：修复当前用户的身份信息混乱问题
 */
function emergencyFixUserIdentity() {
  console.log('🆘 [紧急修复] 开始修复用户身份信息混乱问题');
  
  wx.showModal({
    title: '身份修复',
    content: '检测到身份信息混乱，是否修复为正确的用户身份？\n\n如果您是Y.用户，选择"修复为Y."，\n如果您是向冬用户，选择"修复为向冬"',
    confirmText: '修复为Y.',
    cancelText: '修复为向冬',
    success: (res) => {
      if (res.confirm) {
        // 修复为Y.身份
        this.switchUserForTesting({
          openId: 'ojtOs7bmxy-8M5wOTcgrqlYedgyY',
          nickName: 'Y.',
          avatarUrl: '/assets/images/default-avatar.png'
        });
        
        // 🔥 延迟显示修复结果验证
        setTimeout(() => {
          wx.showModal({
            title: '修复完成',
            content: '身份已修复为Y.用户\n\n标题应显示："我和向冬（2）"',
            showCancel: false,
            confirmText: '知道了'
          });
        }, 800);
      } else if (res.cancel) {
        // 修复为向冬身份
        this.switchUserForTesting({
          openId: 'ojtOs7bA8w-ZdS1G_o5rdoeLzWDc',
          nickName: '向冬',
          avatarUrl: '/assets/images/default-avatar.png'
        });
        
        // 🔥 延迟显示修复结果验证
        setTimeout(() => {
          wx.showModal({
            title: '修复完成',
            content: '身份已修复为向冬用户\n\n标题应显示："我和Y.（2）"',
            showCancel: false,
            confirmText: '知道了'
          });
        }, 800);
      }
    }
  });
}

/**
 * 🔧 紧急修复：直接从消息推断并强制更新
 */
function emergencyFixConnection() {
 console.log('🆘 [紧急修复] ==================== 开始紧急连接修复 ====================');
 
 const messages = this.data.messages || [];
 const currentUserOpenId = this.data.currentUser?.openId;
 
 if (!currentUserOpenId) {
   console.log('🆘 [紧急修复] 缺少当前用户信息，无法修复');
   return;
 }
 
 // 分析消息中的发送者
 const senderIds = new Set();
 messages.forEach(msg => {
   if (msg.senderId && msg.senderId !== 'system' && msg.senderId !== 'self') {
     senderIds.add(msg.senderId);
   }
 });
 
 console.log('🆘 [紧急修复] 发现的发送者IDs:', Array.from(senderIds));
 
 if (senderIds.size >= 2) {
   // 有多个发送者，说明确实有对话
   const participants = [];
   
   senderIds.forEach(senderId => {
     if (senderId === currentUserOpenId) {
       // 当前用户
       participants.push({
         id: senderId,
         openId: senderId,
         nickName: this.data.currentUser.nickName,
         avatarUrl: this.data.currentUser.avatarUrl,
         isSelf: true
       });
     } else {
       // 其他用户 - 尝试从URL参数获取昵称
       let otherNickName = '朋友';
       
       try {
         const pages = getCurrentPages();
         if (pages.length > 0) {
           const options = pages[pages.length - 1].options || {};
           if (options.inviter) {
             const decoded = decodeURIComponent(decodeURIComponent(options.inviter));
             if (decoded && decoded !== '朋友' && decoded !== '好友') {
               otherNickName = decoded;
             }
           } else if (options.userName) {
             const decoded = decodeURIComponent(decodeURIComponent(options.userName));
             if (decoded && decoded !== '用户' && decoded !== '朋友') {
               otherNickName = decoded;
             }
           }
         }
             } catch (e) {
         console.log('🆘 [紧急修复] URL参数解析失败');
       }
       
       participants.push({
         id: senderId,
         openId: senderId,
         nickName: otherNickName,
         avatarUrl: '/assets/images/default-avatar.png',
         isSelf: false
       });
     }
   });
   
   console.log('🆘 [紧急修复] 构造的参与者列表:', JSON.stringify(participants, null, 2));
   
   // 强制更新
   this.setData({
     participants: participants
   }, () => {
     console.log('🆘 [紧急修复] 参与者更新完成，数量:', this.data.participants.length);
     
     // 更新标题
     setTimeout(() => {
       this.updateDynamicTitleWithRealNames();
       
       // wx.showToast({
       //   title: '🆘 紧急修复完成',
       //   icon: 'success'
       // });
       console.log('🆘 [紧急修复] 紧急修复完成，后台静默完成');
       
       console.log('🆘 [紧急修复] 修复完成，最终标题:', this.data.dynamicTitle);
     }, 200);
   });
   
           } else {
   console.log('🆘 [紧急修复] 消息中只有一个发送者，无法修复');
   // wx.showToast({
   //   title: '无法修复：只有一个发送者',
   //   icon: 'error'
   // });
   console.log('🆘 [紧急修复] 无法修复：只有一个发送者，后台静默记录');
 }
  }

/**
 * 🔥 阅后即焚强制清理 - 清理所有历史消息
 */
function burnAfterReadingCleanup() {
  console.log('🔥 [阅后即焚清理] ==================== 开始强制清理历史数据 ====================');
  
  // 🔥 设置清理状态，防止重复触发
  if (this.data.isBurnAfterReadingCleaning) {
    console.log('🔥 [阅后即焚清理] 已在清理中，跳过重复调用');
    return;
  }
  
  // 🔥 检查是否刚刚清理过（防止短期内重复清理）
  const currentTime = Date.now();
  const lastCleanupTime = this.data.lastCleanupTime;
  if (lastCleanupTime && (currentTime - lastCleanupTime) < 10000) { // 10秒内不重复清理
    console.log('🔥 [阅后即焚清理] 刚刚清理过，跳过重复清理');
    return;
  }
  
  console.log('🔥 [阅后即焚清理] 开始设置清理状态');
  this.setData({
    isBurnAfterReadingCleaning: true
  });
  console.log('🔥 [阅后即焚清理] 清理状态已设置');
  
  // 🔥 设置安全超时，防止清理状态卡死
  setTimeout(() => {
    if (this.data.isBurnAfterReadingCleaning) {
      console.log('🔥 [阅后即焚清理] 清理超时，强制重置状态');
      this.setData({
        isBurnAfterReadingCleaning: false,
        lastCleanupTime: Date.now()
      });
    }
  }, 30000); // 30秒超时
 
 const chatId = this.data.contactId;
  
 if (!chatId) {
    console.log('🔥 [阅后即焚清理] 无聊天ID，无法清理');
    this.setData({
      isBurnAfterReadingCleaning: false
    });
   return;
 }
 
  // 显示清理进度
  // 🔥 修改：后台静默清理历史消息，不显示加载气泡
  console.log('🔥 开始后台静默清理历史消息...');
  
  // 🔥 停止消息轮询，防止干扰清理过程
  if (this.messagePollingTimer) {
    clearInterval(this.messagePollingTimer);
    this.messagePollingTimer = null;
    console.log('🔥 [阅后即焚清理] 已停止消息轮询');
  }
  
  this._localMessageCache = [];
  this.setData({
    messages: [],
    participants: [this.data.currentUser ? {
      id: this.data.currentUser.openId,
      openId: this.data.currentUser.openId,
      nickName: this.data.currentUser.nickName,
      avatarUrl: this.data.currentUser.avatarUrl,
      isSelf: true,
      isCreator: true
    } : {}],
    dynamicTitle: this.data.currentUser?.nickName || '我'
  });
  
  // 🔥 第二步：更新导航栏标题
  wx.setNavigationBarTitle({
    title: this.data.currentUser?.nickName || '我'
  });
  
  // 🔥 第三步：真正删除云端数据
  this.permanentDeleteAllMessages(chatId);
  
  // 🔥 第四步：添加阅后即焚欢迎消息
  setTimeout(() => {
    this.addSystemMessage('🔥 欢迎使用阅后即焚聊天，消息将在阅读后自动销毁');
    wx.hideLoading();
    
    wx.showToast({
      title: '🔥 历史记录已清理',
      icon: 'success',
      duration: 2000
    });
    
    // 🔥 清理完成，设置冷却期，延迟重启消息轮询
    setTimeout(() => {
             this.setData({
      isBurnAfterReadingCleaning: false,
      lastCleanupTime: Date.now(), // 🔥 记录清理时间
      hasCheckedBurnAfterReading: false // 🔥 重置检查标志，允许下次检查
    });
      
      console.log('🔥 [阅后即焚清理] ✅ 历史数据清理完成，进入冷却期');
      
      // 🔥 重置检查标志，允许后续必要时重新检查
      this.setData({
        hasCheckedBurnAfterReading: false
      });
      
      // 🔥 延迟重启消息轮询，避免立即重新触发检测
      setTimeout(() => {
        console.log('🔥 [阅后即焚清理] 冷却期结束，检查是否需要重启轮询');
        
        // 🔥 只有在接收方状态下才重启轮询
        const isFromInvite = this.data.isFromInvite;
        if (isFromInvite) {
          console.log('🔥 [阅后即焚清理] 接收方身份，重启消息轮询');
          this.startMessagePolling();
        } else {
          console.log('🔥 [阅后即焚清理] 发送方身份，不重启轮询以避免获取历史消息');
        }
      }, 60000); // 60秒冷却期
    }, 2000);
  }, 1000);
}

/**
 * 🔥 强制执行阅后即焚清理
 * @description 根据HOTFIX-v1.3.0，强制清理所有历史消息，不区分发送方接收方
 * @returns {void}
 */
function forceBurnAfterReadingCleanup() {
  console.log('🔥 [强制清理] ==================== 开始强制阅后即焚清理 ====================');
  
  // 🔥 防重复触发
  if (this.data.isBurnAfterReadingCleaning) {
    console.log('🔥 [强制清理] 已在清理中，跳过重复调用');
    return;
  }
  
  // 🔥 检查是否刚刚清理过（防止短期内重复清理）
  const currentTime = Date.now();
  const lastCleanupTime = this.data.lastCleanupTime;
  if (lastCleanupTime && (currentTime - lastCleanupTime) < 5000) { // 5秒内不重复清理
    console.log('🔥 [强制清理] 刚刚清理过，跳过重复清理');
    return;
  }
  
  console.log('🔥 [强制清理] 开始设置清理状态');
  this.setData({
    isBurnAfterReadingCleaning: true
  });
  console.log('🔥 [强制清理] 清理状态已设置');
  
  // 🔥 设置安全超时，防止清理状态卡死
  setTimeout(() => {
    if (this.data.isBurnAfterReadingCleaning) {
      console.log('🔥 [强制清理] 清理超时，强制重置状态');
      this.setData({
        isBurnAfterReadingCleaning: false,
        lastCleanupTime: Date.now()
      });
    }
  }, 15000); // 15秒超时
  
  // 🔥 停止所有监听和轮询
  if (this.messagePollingTimer) {
    clearInterval(this.messagePollingTimer);
    this.messagePollingTimer = null;
  }
  
  this._localMessageCache = [];
  this.setData({
    messages: []
  });
  
  // 🔥 删除云端数据
  const chatId = this.data.contactId;
  if (chatId) {
    this.permanentDeleteAllMessages(chatId);
  }
  
  // 🔥 添加纯净环境提示
  setTimeout(() => {
    this.addSystemMessage('🔥 欢迎使用阅后即焚聊天，消息将在阅读后自动销毁');
    
    this.setData({
      isBurnAfterReadingCleaning: false,
      lastCleanupTime: Date.now(), // 🔥 记录清理时间
      hasCheckedBurnAfterReading: false // 🔥 重置检查标志
    });
    
    console.log('🔥 [强制清理] ✅ 强制清理完成，环境已纯净，进入冷却期');
  }, 500);
}

/**
 * 🔥 永久删除聊天中的所有消息
 */
function permanentDeleteAllMessages(chatId) {
  console.log('🔥 [永久删除] 开始删除聊天中的所有消息:', chatId);
  
  if (!chatId) {
    console.log('🔥 [永久删除] 无效的聊天ID，跳过删除');
    return;
  }
  
  // 🔥 方法1：使用云函数删除（推荐）
 wx.cloud.callFunction({
    name: 'permanentDeleteMessage',
    data: {
      action: 'deleteAllInChat',
      chatId: chatId
    },
   success: (res) => {
      console.log('🔥 [永久删除] 云函数删除成功:', res.result);
      if (res.result && res.result.deletedCount) {
        console.log('🔥 [永久删除] 删除了', res.result.deletedCount, '条消息');
      }
    },
    fail: (err) => {
      console.error('🔥 [永久删除] 云函数删除失败:', err);
      
      // 🔥 方法2：直接数据库删除（备用）
      wx.cloud.database().collection('messages')
        .where({
          chatId: chatId
        })
        .remove()
        .then(res => {
          console.log('🔥 [永久删除] 数据库直接删除成功:', res);
          console.log('🔥 [永久删除] 删除的记录数:', res.removed);
        })
        .catch(err => {
          console.error('🔥 [永久删除] 数据库直接删除也失败:', err);
          
          // 🔥 方法3：分批删除（最后的备用方案）
          this.batchDeleteMessages(chatId);
        });
    }
  });
}

/**
 * 🔥 分批删除消息（备用方案）
 */
function batchDeleteMessages(chatId) {
  console.log('🔥 [分批删除] 开始分批删除消息:', chatId);
  
  const db = wx.cloud.database();
  const batchSize = 20; // 每次删除20条
  
  const deleteBatch = () => {
    db.collection('messages')
      .where({
        chatId: chatId
      })
      .limit(batchSize)
      .get()
      .then(res => {
        if (res.data.length === 0) {
          console.log('🔥 [分批删除] 所有消息已删除完成');
          return;
        }
        
        console.log('🔥 [分批删除] 发现', res.data.length, '条消息待删除');
        
        // 删除这一批消息
        const deletePromises = res.data.map(msg => {
          return db.collection('messages').doc(msg._id).remove();
        });
        
        Promise.all(deletePromises)
          .then(() => {
            console.log('🔥 [分批删除] 本批次删除完成，继续下一批');
            setTimeout(deleteBatch, 1000); // 1秒后继续删除下一批
          })
          .catch(err => {
            console.error('🔥 [分批删除] 本批次删除失败:', err);
          });
      })
      .catch(err => {
        console.error('🔥 [分批删除] 获取消息失败:', err);
      });
  };
  
  deleteBatch();
}

/**
 * 🔥 本地清理消息（备用方案）
 */
function localClearMessages(chatId) {
  console.log('🔥 [本地清理] 使用本地方法清理消息');
  
  this._localMessageCache = [];
  this.setData({
    messages: []
  });
  
  console.log('🔥 [本地清理] 消息列表已清空');
}

  /**
 * 🔧 清理残留数据
 */
function cleanupStaleData() {
  console.log('🔧 [清理残留] 开始清理残留聊天数据');
  
  const chatId = this.data.contactId;
  const currentUser = this.data.currentUser;
  
  // 重置参与者为仅当前用户
  const cleanParticipants = [{
    id: currentUser.openId,
    openId: currentUser.openId,
    nickName: currentUser.nickName,
    avatarUrl: currentUser.avatarUrl,
    isSelf: true,
    isCreator: true
  }];
  
  this.setData({
    participants: cleanParticipants,
    dynamicTitle: currentUser.nickName
  }, () => {
    console.log('🔧 [清理残留] 已重置参与者和标题');
    
    // 更新导航栏标题
    wx.setNavigationBarTitle({
      title: currentUser.nickName
    });
    
    // 显示清理完成提示
    wx.showToast({
      title: '🔧 数据已清理',
      icon: 'success'
    });
  });
  
  // 同步清理数据库中的重复数据
  wx.cloud.callFunction({
    name: 'updateConversationParticipants',
    data: {
      chatId: chatId,
      participants: cleanParticipants,
      action: 'cleanup'
    },
    success: (res) => {
      console.log('🔧 [清理残留] 数据库清理成功:', res.result);
    },
    fail: (err) => {
      console.log('🔧 [清理残留] 数据库清理失败:', err);
    }
  });
}

/**
 * 🔧 新聊天消息发送测试
 */
function testNewChatMessageSending() {
 console.log('🧪 [新聊天测试] ==================== 开始测试新聊天消息发送 ====================');
 
 const messages = this.data.messages || [];
 const participants = this.data.participants || [];
 
 console.log('🧪 [新聊天测试] 当前消息数量:', messages.length);
 console.log('🧪 [新聊天测试] 当前参与者数量:', participants.length);
 
 // 检查是否是新聊天
 const hasUserMessages = messages.some(msg => msg.senderId !== 'system');
 const isNewChat = !hasUserMessages && participants.length === 1;
 
 if (isNewChat) {
   console.log('🧪 [新聊天测试] ✅ 确认这是新聊天，测试消息发送功能');
   
   // 模拟发送测试消息
   const testContent = `[测试消息] ${new Date().toLocaleTimeString()}`;
   
   console.log('🧪 [新聊天测试] 准备发送测试消息:', testContent);
   
   // 设置输入内容
   this.setData({
     inputValue: testContent
   });
   
   // 延迟发送消息
   setTimeout(() => {
     console.log('🧪 [新聊天测试] 触发消息发送...');
     this.sendMessage();
     
     // 验证发送结果
     setTimeout(() => {
       const newMessages = this.data.messages || [];
       const userMessages = newMessages.filter(msg => msg.senderId !== 'system');
       
       console.log('🧪 [新聊天测试] 发送后消息数量:', newMessages.length);
       console.log('🧪 [新聊天测试] 用户消息数量:', userMessages.length);
       
       if (userMessages.length > 0) {
         console.log('🧪 [新聊天测试] ✅ 消息发送成功！');
         // 🔗 [连接提示修复] 移除测试Toast，避免干扰用户体验
         // wx.showToast({
         //   title: '✅ 消息发送成功',
         //   icon: 'success'
         // });
         console.log('🔗 [连接提示修复] ✅ 测试通过，静默记录结果');
       } else {
         console.log('🧪 [新聊天测试] ❌ 消息发送失败');
         // 🔗 [连接提示修复] 移除测试Toast，避免干扰用户体验
         // wx.showToast({
         //   title: '❌ 消息发送失败',
         //   icon: 'error'
         // });
         console.log('🔗 [连接提示修复] ❌ 测试失败，静默记录结果');
       }
     }, 2000);
   }, 1000);
   
 } else {
   console.log('🧪 [新聊天测试] 这不是新聊天，使用常规修复方法');
   this.fixMessageSending();
 }
  }

  /**
 * 🔧 手动清理残留数据测试
 */
function testCleanupStaleData() {
  console.log('🧪 [残留数据测试] 开始测试残留数据清理功能');
  
  const messages = this.data.messages || [];
  const participants = this.data.participants || [];
  
  console.log('🧪 [残留数据测试] 当前状态:');
  console.log('- 消息数量:', messages.length);
  console.log('- 参与者数量:', participants.length);
  console.log('- 当前标题:', this.data.dynamicTitle);
  
  // 分析是否疑似残留数据
  const hasOtherSenders = messages.some(msg => 
    msg.senderId && 
    msg.senderId !== this.data.currentUser.openId && 
    msg.senderId !== 'system'
  );
  
  const pageLoadTime = Date.now();
  const recentMessages = messages.filter(msg => {
   try {
     if (!msg.sendTime) return false;
     
     let messageTime;
     if (typeof msg.sendTime === 'string') {
       messageTime = new Date(msg.sendTime).getTime();
     } else if (msg.sendTime.getTime) {
       messageTime = msg.sendTime.getTime();
     } else if (msg.sendTime._date) {
       messageTime = new Date(msg.sendTime._date).getTime();
     } else {
       messageTime = new Date(msg.sendTime).getTime();
     }
     
     const timeDiff = pageLoadTime - messageTime;
    return timeDiff < 10 * 60 * 1000;
   } catch (e) {
     console.warn('🔥 [时间检查] sendTime处理失败:', e, msg);
     return false;
   }
  });
  
  const isLikelyStaleData = messages.length > 2 && recentMessages.length === 0;
  
  console.log('🧪 [残留数据测试] 数据分析:');
  console.log('- 有其他发送者:', hasOtherSenders);
  console.log('- 最近10分钟消息:', recentMessages.length);
  console.log('- 疑似残留数据:', isLikelyStaleData);
  
  if (isLikelyStaleData && hasOtherSenders) {
    console.log('🧪 [残留数据测试] ✅ 确认是残留数据，开始清理');
    
    wx.showModal({
      title: '测试：清理残留数据',
      content: '检测到这是残留的聊天数据，是否要清理并重置为新聊天状态？',
      confirmText: '清理',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.cleanupStaleData();
        } else {
          console.log('🧪 [残留数据测试] 用户取消清理');
        }
      }
    });
  } else {
    console.log('🧪 [残留数据测试] ℹ️ 这不是残留数据或数据正常');
    wx.showToast({
      title: 'ℹ️ 数据状态正常',
      icon: 'none'
    });
  }
}

/**
 * 🔥 启动在线状态监听
 */
function startOnlineStatusMonitor() {
  console.log('👥 [在线状态] 启动在线状态监听');
  
  const chatId = this.data.contactId;
  // 🔥 【HOTFIX-v1.3.44】使用fallback机制获取currentUser
  const currentUser = this.data.currentUser || this.actualCurrentUser;
  var currentUserOpenId = currentUser?.openId
    || getApp().globalData.userInfo?.openId
    || getApp().globalData.openId
    || wx.getStorageSync('openId');
       
  if (!chatId || !currentUserOpenId) {
    console.log('👥 [在线状态] 缺少必要参数，无法启动监听');
    console.log('👥 [在线状态] chatId:', chatId, 'currentUserOpenId:', currentUserOpenId);
    return;
  }
  
  // 更新自己的在线状态
  this.updateUserOnlineStatus(true);
  
  // 监听其他用户的在线状态
  this.startOnlineUsersWatcher();
}

/**
 * 🔥 停止在线状态监听
 */
function stopOnlineStatusMonitor() {
  console.log('👥 [在线状态] 停止在线状态监听');
  
  if (this.onlineStatusWatcher) {
    this.onlineStatusWatcher.close();
    this.onlineStatusWatcher = null;
  }
}

/**
 * 🔥 更新用户在线状态到云端
 */
function updateUserOnlineStatus(isOnline) {
  const chatId = this.data.contactId;
  const currentUserOpenId = this.data.currentUser?.openId;
  
  if (!chatId || !currentUserOpenId) return;
  
  console.log('👥 [在线状态] 更新用户在线状态:', isOnline);
  
  // 调用云函数更新在线状态
  wx.cloud.callFunction({
    name: 'updateOnlineStatus',
    data: {
      chatId: chatId,
      userId: currentUserOpenId,
      isOnline: isOnline,
      timestamp: Date.now()
    },
    success: (res) => {
      console.log('👥 [在线状态] 更新成功:', res.result);
    },
    fail: (err) => {
      console.error('👥 [在线状态] 更新失败:', err);
    }
  });
}

/**
 * 🔥 启动在线用户监听器
 */
function startOnlineUsersWatcher() {
  const chatId = this.data.contactId;
  if (!chatId) return;
  
  try {
    const db = wx.cloud.database();
    this.onlineStatusWatcher = db.collection('onlineStatus')
      .where({
        chatId: chatId,
        isOnline: true,
        // 只监听5分钟内活跃的用户
        timestamp: db.command.gte(Date.now() - 5 * 60 * 1000)
      })
      .watch({
        onChange: snapshot => {
          console.log('👥 [在线状态] 监听到在线状态变化:', snapshot);
          
          if (snapshot.docs) {
            const onlineUsers = snapshot.docs.map(doc => doc.userId);
            this.setData({
              onlineUsers: onlineUsers
            });
            
            console.log('👥 [在线状态] 当前在线用户:', onlineUsers);
            
            // 🔥 检查是否所有参与者都在线（双方同时在聊天界面）
            this.checkMutualOnlineStatus();
          }
        },
        onError: err => {
          console.error('👥 [在线状态] 监听出错:', err);
        }
      });
  } catch (err) {
    console.error('👥 [在线状态] 启动监听器失败:', err);
  }
}

/**
 * 🔥 检查双方是否同时在线
 */
function checkMutualOnlineStatus() {
  const { onlineUsers, participants } = this.data;
  
  // 获取所有参与者的ID
  const participantIds = participants.map(p => p.openId || p.id);
  
  // 检查是否所有参与者都在线
  const allOnline = participantIds.every(id => onlineUsers.includes(id));
  
  console.log('👥 [双方在线检查] 参与者:', participantIds);
  console.log('👥 [双方在线检查] 在线用户:', onlineUsers);
  console.log('👥 [双方在线检查] 双方都在线:', allOnline);
  
  if (allOnline && participantIds.length >= 2) {
    console.log('🔥 [阅后即焚] 检测到双方同时在线，启用实时阅后即焚');
    
    // 🔥 【连接建立标题刷新】双方都在线时，确保B端标题及时刷新
    if (this.data.isFromInvite && !this.hasSyncedTitleOnConnection) {
      console.log('🔥 [连接标题同步] 双方在线，B端立即同步标题');
      setTimeout(() => {
        this.fetchChatParticipantsWithRealNames();
        this.hasSyncedTitleOnConnection = true; // 防止重复触发
      }, 200);
    }
    
    // 🔥 双方同时在线时，自动标记新消息为已读并开始销毁倒计时
    this.enableRealTimeDestroy();
  }
}

/**
 * 🔥 启用实时阅后即焚（双方同时在线时）
 */
function enableRealTimeDestroy() {
  console.log('🔥 [实时销毁] 启用实时阅后即焚模式');
  
  const messages = this.data.messages || [];
  const currentUserOpenId = this.data.currentUser?.openId;
  
  // 自动标记对方发送的未读消息为已读并开始销毁
  messages.forEach((msg, index) => {
    if (msg.senderId !== currentUserOpenId && 
        msg.senderId !== 'system' && 
        !msg.isDestroyed && 
        !msg.isDestroying) {
      
      console.log('🔥 [实时销毁] 自动标记消息为已读并开始销毁:', msg.content);
      
      // 延迟标记为已读，模拟用户查看
      setTimeout(() => {
        this.markMessageAsReadAndDestroy(msg.id, index);
      }, 1000 + index * 500); // 错开时间，避免同时销毁
    }
  });
}

/**
 * 把所有调试与工具方法挂到 page 实例上
 * @param {Object} page - Page 实例
 */
function attach(page) {
  page.showIdentityFixDialog = showIdentityFixDialog;
  page.fixIdentityToSender = fixIdentityToSender;
  page.fixSpecificUserNickname = fixSpecificUserNickname;
  page.quickTitleTest = quickTitleTest;
  page.testReceiverTitle = testReceiverTitle;
  page.fullReceiverSimulation = fullReceiverSimulation;
  page.realShareLinkTest = realShareLinkTest;
  page.diagnosisCurrentState = diagnosisCurrentState;
  page.switchUserForTesting = switchUserForTesting;
  page.testAsReceiver = testAsReceiver;
  page.testAsSender = testAsSender;
  page.simulateTwoPersonChat = simulateTwoPersonChat;
  page.manualJoinExistingChat = manualJoinExistingChat;
  page.showChatIdInput = showChatIdInput;
  page.joinSpecificChat = joinSpecificChat;
  page.generateCompileModeConfig = generateCompileModeConfig;
  page.directJumpTest = directJumpTest;
  page.emergencyFixUserIdentity = emergencyFixUserIdentity;
  page.emergencyFixConnection = emergencyFixConnection;
  page.burnAfterReadingCleanup = burnAfterReadingCleanup;
  page.forceBurnAfterReadingCleanup = forceBurnAfterReadingCleanup;
  page.permanentDeleteAllMessages = permanentDeleteAllMessages;
  page.batchDeleteMessages = batchDeleteMessages;
  page.localClearMessages = localClearMessages;
  page.cleanupStaleData = cleanupStaleData;
  page.testNewChatMessageSending = testNewChatMessageSending;
  page.testCleanupStaleData = testCleanupStaleData;
  page.startOnlineStatusMonitor = startOnlineStatusMonitor;
  page.stopOnlineStatusMonitor = stopOnlineStatusMonitor;
  page.updateUserOnlineStatus = updateUserOnlineStatus;
  page.startOnlineUsersWatcher = startOnlineUsersWatcher;
  page.checkMutualOnlineStatus = checkMutualOnlineStatus;
  page.enableRealTimeDestroy = enableRealTimeDestroy;
}

module.exports = { attach };
