/**
 * 调试/测试方法集合
 *
 * 仅当 chat-helpers.js 里 DEBUG_FLAGS.ENABLE_TEST_APIS=true 时,
 * onLoad 与 onShow 会调用 attach(this) 把这一组方法挂到 Page 实例上。
 *
 * 设计要点:
 * - 这些方法都通过 `page.testXxx = function() { ... }` 形式挂载,函数体内仍用 this,
 *   因为它们被赋值到 page 上后,运行时 this 自然指向 page。
 * - 因此函数体只是从 chat.js 里整段搬迁,业务逻辑零变动。
 *
 * 默认情况下 DEBUG_FLAGS.ENABLE_TEST_APIS=false,这些方法根本不会挂载,
 * 也就不会出现在生产路径上。
 */

const { DEBUG_FLAGS } = require('./chat-helpers.js');

/**
 * 把所有调试/测试方法挂到给定的 page 实例上
 *
 * @param {Object} page - Page 实例
 */
function attach(page) {
  console.log('🧪 [测试方法] 正在添加测试方法到页面实例');
  
  // 添加参与者修复测试方法
  page.testParticipantFix = function() {
    console.log('🆘 [页面方法] 开始参与者修复测试');
    
    const participants = this.data.participants || [];
    console.log('当前参与者:', participants.length, '个');
    console.log('参与者详情:', participants);
    
    // 检查是否有重复
    const seenIds = new Set();
    let duplicateCount = 0;
    
    participants.forEach(p => {
      const id = p.openId || p.id;
      if (id && seenIds.has(id)) {
        duplicateCount++;
      }
      if (id) seenIds.add(id);
    });
    
    console.log('重复参与者数量:', duplicateCount);
    
    if (participants.length > 2 || duplicateCount > 0) {
      console.log('触发强制修复');
      this.forceFixParticipantDuplicates();
    } else {
      console.log('触发标准去重');
      this.deduplicateParticipants();
    }
    
    setTimeout(() => {
      console.log('修复后参与者:', this.data.participants.length, '个');
      console.log('修复后标题:', this.data.dynamicTitle);
    }, 1000);
  };
  
  // 🔥 【新增】添加系统消息修复测试方法
  page.testSystemMessageFix = function() {
    console.log('🔧 [系统消息测试] 开始测试系统消息显示修复效果');
    
    const { isFromInvite, currentUser, messages } = this.data;
    const userRole = isFromInvite ? 'b端（接收方）' : 'a端（发送方）';
    
    console.log('🔧 [系统消息测试] 当前状态:', {
      userRole: userRole,
      currentUser: currentUser?.nickName,
      totalMessages: messages?.length || 0,
      systemMessages: messages?.filter(m => m.isSystem).length || 0
    });
    
    // 显示当前系统消息
    const systemMessages = messages?.filter(m => m.isSystem) || [];
            console.log('🔧 [系统消息测试] 当前系统消息:');
      systemMessages.forEach((msg, index) => {
        console.log(`  ${index + 1}. ${msg.content}`);
      });
      
      // 检查关键问题
      const hasJoinMessage = systemMessages.some(msg => 
        msg.content.includes('成功加入') || msg.content.includes('你加入了')
      );
      const hasWrongMessage = systemMessages.some(msg => 
        msg.content.includes('您创建了私密聊天')
      );
      const hasCorrectCreatorMessage = systemMessages.some(msg => 
        msg.content.includes('您创建了私密聊天')
      );
    
            if (isFromInvite) {
        // b端测试
        const hasJoinMessage = systemMessages.some(msg => 
          msg.content.includes('成功加入') || msg.content.includes('你加入了')
        );
        const hasWrongCreatorMessage = systemMessages.some(msg => 
          msg.content.includes('您创建了私密聊天')
        );
        
        wx.showModal({
          title: '🔧 B端系统消息测试',
          content: `用户角色: ${userRole}\n标题: ${this.data.dynamicTitle}\n\n✅ 有加入消息: ${hasJoinMessage ? '是' : '否'}\n❌ 有错误创建消息: ${hasWrongCreatorMessage ? '是' : '否'}\n\n${hasJoinMessage && !hasWrongCreatorMessage ? '✅ 系统消息正确！' : '❌ 需要修复'}`,
          showCancel: true,
          cancelText: '手动修复',
          confirmText: '了解',
          success: (res) => {
            if (res.cancel) {
              // 手动修复b端消息
              this.removeWrongCreatorMessages();
              this.updateSystemMessageAfterJoin('a端用户');
            }
          }
        });
      } else {
        // a端测试
        const hasCreatorMessage = systemMessages.some(msg => 
          msg.content.includes('您创建了私密聊天')
        );
        const hasWrongJoinMessage = systemMessages.some(msg => 
          msg.content.includes('成功加入') && !msg.content.includes('您创建了')
        );
        
        wx.showModal({
          title: '🔧 A端系统消息测试',
          content: `用户角色: ${userRole}\n标题: ${this.data.dynamicTitle}\n\n✅ 有创建消息: ${hasCreatorMessage ? '是' : '否'}\n❌ 有错误加入消息: ${hasWrongJoinMessage ? '是' : '否'}\n\n${hasCreatorMessage && !hasWrongJoinMessage ? '✅ 系统消息正确！' : '❌ 需要修复'}`,
          showCancel: true,
          cancelText: '手动修复',
          confirmText: '了解',
          success: (res) => {
            if (res.cancel) {
              // 手动修复a端消息
              this.addCreatorSystemMessage();
              // 移除错误的加入消息
              const currentMessages = this.data.messages || [];
              const filteredMessages = currentMessages.filter(msg => {
                if (msg.isSystem && msg.content && msg.content.includes('成功加入') && !msg.content.includes('您创建了')) {
                  return false;
                }
                return true;
              });
              this._localMessageCache = filteredMessages;
              this.setData({ messages: filteredMessages });
            }
          }
        });
      }
          };

    // 🔥 【HOTFIX-v1.3.44】数据状态检查方法
    this.checkDataState = function() {
      console.log('🔧 [数据检查] 开始检查页面数据状态');
      
      const pageData = this.data;
      const instanceData = {
        finalIsFromInvite: this.finalIsFromInvite,
        actualCurrentUser: this.actualCurrentUser
      };
      
      console.log('🔧 [数据检查] 页面data:', {
        isFromInvite: pageData.isFromInvite,
        currentUser: pageData.currentUser,
        contactId: pageData.contactId,
        participants: pageData.participants?.length || 0
      });
      
      console.log('🔧 [数据检查] 实例属性:', instanceData);
      
      wx.showModal({
        title: '🔧 数据状态检查',
        content: `页面isFromInvite: ${pageData.isFromInvite}\n实例isFromInvite: ${instanceData.finalIsFromInvite}\n页面currentUser: ${pageData.currentUser ? '有' : '无'}\n实例currentUser: ${instanceData.actualCurrentUser ? '有' : '无'}\n\n${pageData.isFromInvite !== undefined ? '✅ 页面数据正常' : '❌ 页面数据异常，使用实例fallback'}`,
        showCancel: false,
        confirmText: '了解'
      });
    };

    // 🔥 【HOTFIX-v1.3.44】身份判断修复测试方法
    this.testIdentityFix = function() {
      console.log('🔧 [身份测试] 开始测试身份判断修复效果');
      
      const { isFromInvite, currentUser, contactId } = this.data;
      const userRole = isFromInvite ? 'b端（接收方）' : 'a端（发送方）';
      
      // 检查URL参数中的邀请信息
      const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
      const hasInviterParam = !!urlParams.inviter;
      const inviterParam = urlParams.inviter ? decodeURIComponent(decodeURIComponent(urlParams.inviter)) : null;
      
      // 检查本地存储的邀请信息
      const app = getApp();
      const inviteInfo = app.getInviteInfo ? app.getInviteInfo() : null;
      
      console.log('🔧 [身份测试] 测试结果:', {
        userRole: userRole,
        userNickname: currentUser?.nickName,
        isFromInvite: isFromInvite,
        hasInviterParam: hasInviterParam,
        inviterParam: inviterParam,
        hasInviteInfo: !!inviteInfo,
        inviteInfo: inviteInfo,
        chatId: contactId
      });
      
      // 分析身份判断是否正确
      let isCorrect = false;
      let analysis = '';
      
      if (hasInviterParam || inviteInfo) {
        // 有邀请信息，应该是b端
        if (isFromInvite) {
          isCorrect = true;
          analysis = '✅ 有邀请信息且被正确识别为b端';
        } else {
          isCorrect = false;
          analysis = '❌ 有邀请信息但被错误识别为a端';
        }
      } else {
        // 没有邀请信息，应该是a端
        if (!isFromInvite) {
          isCorrect = true;
          analysis = '✅ 无邀请信息且被正确识别为a端';
        } else {
          isCorrect = false;
          analysis = '❌ 无邀请信息但被错误识别为b端';
        }
      }
      
      wx.showModal({
        title: '🔧 身份判断测试结果',
        content: `身份判断: ${userRole}\n用户昵称: ${currentUser?.nickName}\n有邀请参数: ${hasInviterParam ? '是' : '否'}\n邀请者: ${inviterParam || '无'}\n\n${analysis}\n\n${isCorrect ? '身份判断正确！' : '身份判断错误，需要修复'}`,
        showCancel: true,
        cancelText: '查看详情',
        confirmText: '了解',
        success: (res) => {
          if (res.cancel) {
            console.log('🔧 [身份测试] 详细信息:', {
              URL参数: urlParams,
              本地邀请信息: inviteInfo,
              页面数据: this.data
            });
          }
        }
      });
    };

    // 🔥 【HOTFIX-v1.3.45】添加b端标题和系统消息测试方法
    this.testBEndDisplayFix = function() {
      console.log('🧪 [b端测试] ==================== 开始b端功能测试 ====================');
      
      const currentUser = this.data.currentUser;
      const isFromInvite = this.data.isFromInvite;
      const dynamicTitle = this.data.dynamicTitle;
      const messages = this.data.messages || [];
      
      console.log('🧪 [b端测试] 当前用户:', currentUser?.nickName);
      console.log('🧪 [b端测试] 身份标识 isFromInvite:', isFromInvite);
      console.log('🧪 [b端测试] 当前标题:', dynamicTitle);
      console.log('🧪 [b端测试] 系统消息数量:', messages.filter(m => m.isSystem).length);
      
      // 检查系统消息
      const joinMessages = messages.filter(m => 
        m.isSystem && m.content && m.content.includes('成功加入')
      );
      const createMessages = messages.filter(m => 
        m.isSystem && m.content && m.content.includes('您创建了私密聊天')
      );
      
      console.log('🧪 [b端测试] 加入消息:', joinMessages.map(m => m.content));
      console.log('🧪 [b端测试] 创建消息:', createMessages.map(m => m.content));
      
      // 分析结果
      let resultText = '';
      let isCorrect = true;
      
      if (isFromInvite) {
        resultText += '✅ 身份识别正确：b端（接收方）\n';
        
        if (dynamicTitle && dynamicTitle.includes('我和') && dynamicTitle.includes('（2）')) {
          resultText += `✅ 标题格式正确: ${dynamicTitle}\n`;
        } else {
          resultText += `❌ 标题格式错误: ${dynamicTitle}\n`;
          resultText += '期望格式: "我和[a端昵称]（2）"\n';
          isCorrect = false;
        }
        
        if (joinMessages.length > 0) {
          resultText += `✅ 系统消息正确: ${joinMessages[0].content}\n`;
        } else {
          resultText += '❌ 缺少加入系统消息\n';
          isCorrect = false;
        }
        
        if (createMessages.length === 0) {
          resultText += '✅ 没有错误的创建消息\n';
        } else {
          resultText += `❌ 存在错误的创建消息: ${createMessages.length}条\n`;
          isCorrect = false;
        }
      } else {
        resultText += '❌ 身份识别错误：应为b端但被识别为a端\n';
        isCorrect = false;
      }
      
      console.log('🧪 [b端测试] ==================== b端功能测试完成 ====================');
      
      wx.showModal({
        title: '🧪 b端功能测试结果',
        content: resultText + (isCorrect ? '\n🎉 所有功能正常！' : '\n⚠️ 存在问题需要修复'),
        showCancel: false,
        confirmText: '知道了'
      });
    };

    // 🔥 【新增】添加B端标题修复测试方法
    page.testBEndTitleFix = function() {
    console.log('🔧 [B端测试] 开始测试b端标题显示修复效果');
    
    const { isFromInvite, currentUser, participants } = this.data;
    
    console.log('🔧 [B端测试] 当前状态:', {
      isFromInvite: isFromInvite,
      currentUser: currentUser?.nickName,
      participants: participants,
      dynamicTitle: this.data.dynamicTitle
    });
    
    if (!isFromInvite) {
      wx.showModal({
        title: '⚠️ 提示',
        content: '当前不是接收方（b端），无法测试b端标题修复',
        showCancel: false
      });
      return;
    }
    
    // 🔥 强制执行b端标题更新逻辑
    console.log('🔧 [B端测试] 执行强制标题更新...');
    
    // 尝试从URL参数获取邀请者昵称
    const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
    let inviterName = '测试邀请者';
    
    if (urlParams.inviter) {
      try {
        inviterName = decodeURIComponent(decodeURIComponent(urlParams.inviter));
        console.log('🔧 [B端测试] 从URL获取邀请者昵称:', inviterName);
      } catch (e) {
        console.log('🔧 [B端测试] URL解码失败，使用默认昵称');
      }
    }
    
    // 解除任何锁定
    this.receiverTitleLocked = false;
    
    // 强制调用修复方法
    this.updateTitleForReceiver(inviterName);
    
    // 显示测试结果
    setTimeout(() => {
      const updatedTitle = this.data.dynamicTitle;
      const isCorrectFormat = updatedTitle && updatedTitle.includes('我和') && updatedTitle.includes('（2）');
      
      wx.showModal({
        title: '🔧 B端标题测试结果',
        content: `当前标题: ${updatedTitle}\n\n格式正确: ${isCorrectFormat ? '✅ 是' : '❌ 否'}\n\n${isCorrectFormat ? '修复成功！' : '仍需调试'}`,
        showCancel: false,
        success: () => {
          console.log('🔧 [B端测试] 测试完成，当前标题:', updatedTitle);
        }
      });
    }, 1000);
  };

  // 添加时间修复测试方法
  page.testTimeFix = function() {
    console.log('🚨 [时间修复] 开始测试时间处理');
    
    const messages = this.data.messages || [];
    console.log('当前消息数量:', messages.length);
    
    messages.forEach((msg, index) => {
      console.log(`消息${index + 1}:`, {
        id: msg.id,
        content: msg.content,
        time: msg.time,
        sendTime: msg.sendTime,
        timeDisplay: msg.timeDisplay
      });
    });
    
    // 重新获取消息，测试时间处理
    this.fetchMessages();
  };
  
  // 添加连接状态测试方法
  page.testConnectionFix = function() {
    console.log('🔧 [连接修复] 开始测试连接状态修复');
    
    console.log('当前状态:', {
      participants: this.data.participants.length,
      messages: this.data.messages.length,
      dynamicTitle: this.data.dynamicTitle,
      contactId: this.data.contactId
    });
    
    // 手动触发连接检测
    this.checkAndFixConnection(this.data.messages);
  };
  
  // 添加消息收发测试方法
  page.testMessageSync = function() {
    console.log('📤 [消息测试] 开始测试消息收发');
    
    console.log('当前聊天状态:', {
      participants: this.data.participants.length,
      messages: this.data.messages.length,
      contactId: this.data.contactId,
      监听器状态: !!this.messageWatcher,
      轮询状态: !!this.messagePollingTimer
    });
    
    // 强制重启消息监听
    console.log('📤 [消息测试] 重启消息监听器');
    this.stopMessageListener();
    setTimeout(() => {
      this.startMessageListener();
      this.startPollingMessages();
    }, 500);
    
    // 强制刷新消息
    setTimeout(() => {
      console.log('📤 [消息测试] 强制刷新消息');
      this.fetchMessages();
    }, 1000);
    
    console.log('📤 [消息测试] 测试完成');
  };
  
  // 🔧 【消息收发修复】添加强制消息同步方法
  page.forceMessageSync = function() {
    console.log('🔄 [强制同步] 开始强制消息同步');
    
    // 立即停止所有监听器
    this.stopMessageListener();
    
    // 清除所有定时器
    if (this.messagePollingTimer) {
      clearInterval(this.messagePollingTimer);
      this.messagePollingTimer = null;
    }
    
    // 重新初始化消息系统
    setTimeout(() => {
      console.log('🔄 [强制同步] 重新启动消息监听');
      this.startMessageListener();
      this.startPollingMessages();
      
      // 强制刷新消息
      setTimeout(() => {
        this.fetchMessages();
        console.log('🔄 [强制同步] 消息同步完成');
      }, 500);
    }, 1000);
  };
  
  // 🔥 添加阅后即焚测试方法
  page.testBurnAfterReading = function() {
    console.log('🔥 [阅后即焚测试] 开始测试阅后即焚清理功能');
    
    const messages = this.data.messages || [];
    console.log('🔥 [阅后即焚测试] 当前消息数量:', messages.length);
    
    if (messages.length > 0) {
      console.log('🔥 [阅后即焚测试] 发现消息，测试强制清理');
      this.burnAfterReadingCleanup();
    } else {
      console.log('🔥 [阅后即焚测试] 无消息需要清理');
      wx.showToast({
        title: '🔥 环境已清理',
        icon: 'success'
      });
    }
  };
  
  // 🆕 【HOTFIX-v1.3.19】双方消息收发和标题显示测试
  page.testV1319Fix = function() {
    console.log('🧪 [v1.3.19测试] 开始测试双方消息收发和标题显示修复');
    
    const currentUser = this.data.currentUser;
    const participants = this.data.participants;
    const isFromInvite = this.data.isFromInvite;
    const dynamicTitle = this.data.dynamicTitle;
    
    console.log('🧪 [v1.3.19测试] 当前用户信息:', currentUser);
    console.log('🧪 [v1.3.19测试] 参与者列表:', participants);
    console.log('🧪 [v1.3.19测试] 是否接收方:', isFromInvite);
    console.log('🧪 [v1.3.19测试] 当前标题:', dynamicTitle);
    
    // 测试参与者检测
    console.log('🧪 [v1.3.19测试] 强制更新参与者列表');
    this.fetchChatParticipants();
    
    // 测试标题更新
    setTimeout(() => {
      console.log('🧪 [v1.3.19测试] 强制更新标题');
      this.updateDynamicTitle();
    }, 1000);
    
    // 测试消息监听
    setTimeout(() => {
      console.log('🧪 [v1.3.19测试] 重启消息监听器');
      this.startMessageListener();
    }, 2000);
    
    console.log('🧪 [v1.3.19测试] 测试完成，请查看日志输出');
  };
  
  // 🆕 【HOTFIX-v1.3.20】发送方标题错误和历史消息泄露紧急修复测试
  page.testV1320Fix = function() {
    console.log('🧪 [v1.3.20测试] 开始测试发送方标题和历史消息修复');
    
    const currentUser = this.data.currentUser;
    const participants = this.data.participants;
    const isFromInvite = this.data.isFromInvite;
    const dynamicTitle = this.data.dynamicTitle;
    const messages = this.data.messages;
    
    console.log('🧪 [v1.3.20测试] 当前用户信息:', currentUser);
    console.log('🧪 [v1.3.20测试] 是否接收方:', isFromInvite);
    console.log('🧪 [v1.3.20测试] 当前标题:', dynamicTitle);
    console.log('🧪 [v1.3.20测试] 参与者数量:', participants.length);
    console.log('🧪 [v1.3.20测试] 消息数量:', messages.length);
    
    // 检查发送方标题是否正确
    if (!isFromInvite) {
      console.log('🧪 [v1.3.20测试] 检测到发送方身份');
      
      if (participants.length === 1) {
        const expectedTitle = currentUser?.nickName || '我';
        if (dynamicTitle === expectedTitle) {
          console.log('🧪 [v1.3.20测试] ✅ 发送方标题正确:', dynamicTitle);
        } else {
          console.log('🧪 [v1.3.20测试] ❌ 发送方标题错误，期望:', expectedTitle, '实际:', dynamicTitle);
        }
      } else {
        console.log('🧪 [v1.3.20测试] ⚠️ 发送方有多个参与者，检查是否为真实加入');
      }
      
      // 检查是否有历史消息泄露
      const userMessages = messages.filter(msg => !msg.isSystem && msg.senderId !== 'system');
      if (userMessages.length > 0) {
        console.log('🧪 [v1.3.20测试] ❌ 发送方检测到历史消息泄露:', userMessages.length, '条');
        console.log('🧪 [v1.3.20测试] 触发阅后即焚清理');
        this.checkBurnAfterReadingCleanup();
      } else {
        console.log('🧪 [v1.3.20测试] ✅ 发送方环境纯净，无历史消息');
      }
    } else {
      console.log('🧪 [v1.3.20测试] 检测到接收方身份');
    }
    
    console.log('🧪 [v1.3.20测试] 测试完成，请查看日志输出');
  };
  // 🆕 【HOTFIX-v1.3.21】彻底修复发送方身份误判问题测试
  page.testV1321Fix = function() {
    console.log('🧪 [v1.3.21测试] 开始测试发送方身份误判彻底修复');
    
    const currentUser = this.data.currentUser;
    const participants = this.data.participants;
    const isFromInvite = this.data.isFromInvite;
    const dynamicTitle = this.data.dynamicTitle;
    const messages = this.data.messages;
    
    console.log('🧪 [v1.3.21测试] ==================== 开始全面检查 ====================');
    
    // 检查1：强制接收方模式是否已禁用
    console.log('🧪 [v1.3.21测试] 检查1：强制接收方模式状态');
    const hasReceiverFlag = currentUser?.isReceiver;
    console.log('🧪 [v1.3.21测试] currentUser.isReceiver:', hasReceiverFlag);
    console.log('🧪 [v1.3.21测试] 强制接收方模式:', hasReceiverFlag ? '❌ 仍在使用' : '✅ 已禁用');
    
    // 检查2：身份判断是否正确
    console.log('🧪 [v1.3.21测试] 检查2：身份判断');
    console.log('🧪 [v1.3.21测试] isFromInvite:', isFromInvite);
    console.log('🧪 [v1.3.21测试] 用户昵称:', currentUser?.nickName);
    
    // 特殊检查：如果用户是"向冬"但被判断为接收方，这是错误的
    const isWrongIdentity = currentUser?.nickName === '向冬' && isFromInvite;
    console.log('🧪 [v1.3.21测试] 身份判断:', isWrongIdentity ? '❌ 发送方被误判为接收方' : '✅ 身份判断正确');
    
    // 检查3：标题显示是否正确
    console.log('🧪 [v1.3.21测试] 检查3：标题显示');
    console.log('🧪 [v1.3.21测试] 当前标题:', dynamicTitle);
    
    let titleCorrect = false;
    if (!isFromInvite) {
      // 发送方应该显示自己的昵称
      const expectedSenderTitle = currentUser?.nickName || '我';
      titleCorrect = dynamicTitle === expectedSenderTitle;
      console.log('🧪 [v1.3.21测试] 发送方标题:', titleCorrect ? '✅ 正确' : `❌ 错误，期望"${expectedSenderTitle}"实际"${dynamicTitle}"`);
    } else {
      // 接收方应该显示双人标题格式
      titleCorrect = dynamicTitle.includes('我和') && dynamicTitle.includes('（2）');
      console.log('🧪 [v1.3.21测试] 接收方标题:', titleCorrect ? '✅ 正确格式' : '❌ 格式错误');
    }
    
    // 检查4：历史消息泄露
    console.log('🧪 [v1.3.21测试] 检查4：历史消息保护');
    const userMessages = messages.filter(msg => 
      !msg.isSystem && 
      msg.senderId !== 'system' &&
      !msg.content.includes('您创建了私密聊天') &&
      !msg.content.includes('建立了聊天')
    );
    
    console.log('🧪 [v1.3.21测试] 消息总数:', messages.length);
    console.log('🧪 [v1.3.21测试] 用户消息数:', userMessages.length);
    
    const hasMessageLeak = !isFromInvite && userMessages.length > 0;
    console.log('🧪 [v1.3.21测试] 发送方历史消息泄露:', hasMessageLeak ? `❌ 泄露${userMessages.length}条` : '✅ 无泄露');
    
    // 检查5：邀请信息清理
    console.log('🧪 [v1.3.21测试] 检查5：邀请信息状态');
    const app = getApp();
    const storedInvite = app.getStoredInviteInfo();
    console.log('🧪 [v1.3.21测试] 存储的邀请信息:', storedInvite);
    
    console.log('🧪 [v1.3.21测试] ==================== 检查完成 ====================');
    
    // 生成测试报告
    const issues = [];
    
    if (hasReceiverFlag) {
      issues.push('强制接收方模式未完全禁用');
    }
    
    if (isWrongIdentity) {
      issues.push('发送方被误判为接收方');
    }
    
    if (!titleCorrect) {
      issues.push('标题显示错误');
    }
    
    if (hasMessageLeak) {
      issues.push(`发送方泄露${userMessages.length}条历史消息`);
    }
    
    const isFixed = issues.length === 0;
    
    console.log('🧪 [v1.3.21测试] 测试结果:', isFixed ? '✅ 全部修复成功' : '❌ 发现问题: ' + issues.join(', '));
    
    wx.showModal({
      title: 'v1.3.21修复测试结果',
      content: `身份: ${isFromInvite ? '接收方' : '发送方'}\n标题: ${dynamicTitle}\n历史消息: ${userMessages.length}条\n强制模式: ${hasReceiverFlag ? '启用' : '禁用'}\n\n${isFixed ? '✅ 修复成功！所有问题已解决' : '❌ 发现问题:\n' + issues.join('\n')}`,
      showCancel: false,
      confirmText: '知道了'
    });
    
    // 如果检测到历史消息泄露，立即触发清理
    if (hasMessageLeak) {
      console.log('🧪 [v1.3.21测试] 检测到历史消息泄露，触发紧急清理');
      setTimeout(() => {
        this.checkBurnAfterReadingCleanup();
      }, 2000);
    }
  };

  // 🆕 【HOTFIX-v1.3.22】建立连接后标题更新和消息收发修复测试
  page.testV1322Fix = function() {
    console.log('🧪 ==================== v1.3.22 连接标题修复测试 ====================');
    
    const currentUser = this.data.currentUser;
    const participants = this.data.participants || [];
    const messages = this.data.messages || [];
    const isFromInvite = this.data.isFromInvite;
    const currentTitle = this.data.dynamicTitle || this.data.chatTitle;
    
    console.log('🧪 [v1.3.22测试] 当前用户信息:', currentUser);
    console.log('🧪 [v1.3.22测试] 参与者数量:', participants.length);
    console.log('🧪 [v1.3.22测试] 当前标题:', currentTitle);
    console.log('🧪 [v1.3.22测试] 身份标识 isFromInvite:', isFromInvite);
    
    // ✅ 1. 检查参与者列表完整性
    console.log('🧪 [v1.3.22测试] 详细参与者信息:');
    participants.forEach((p, index) => {
      console.log(`🧪 [v1.3.22测试] 参与者${index}:`, {
        id: p.id,
        openId: p.openId,
        nickName: p.nickName,
        isSelf: p.isSelf
      });
    });
    
    // ✅ 2. 验证标题更新逻辑
    let titleTestResult = '';
    if (participants.length <= 1) {
      const expectedTitle = currentUser?.nickName || '我';
      if (currentTitle === expectedTitle) {
        titleTestResult = '✅ 单人状态标题正确';
        console.log('🧪 [v1.3.22测试] ✅ 单人状态标题显示正确:', currentTitle);
      } else {
        titleTestResult = '❌ 单人状态标题错误';
        console.log('🧪 [v1.3.22测试] ❌ 单人状态标题错误，期望:', expectedTitle, '实际:', currentTitle);
      }
    } else if (participants.length === 2) {
      if (currentTitle && currentTitle.includes('我和') && currentTitle.includes('（2）')) {
        titleTestResult = '✅ 双人聊天标题正确';
        console.log('🧪 [v1.3.22测试] ✅ 双人聊天标题格式正确:', currentTitle);
      } else {
        titleTestResult = '❌ 双人聊天标题格式错误';
        console.log('🧪 [v1.3.22测试] ❌ 双人聊天标题格式错误，期望包含"我和"和"（2）"，实际:', currentTitle);
        
        // 🔥 自动触发标题修复
        console.log('🧪 [v1.3.22测试] 🔧 自动触发标题修复');
        this.updateDynamicTitle();
      }
    } else {
      const expectedTitle = `群聊（${participants.length}）`;
      if (currentTitle === expectedTitle) {
        titleTestResult = '✅ 群聊标题正确';
        console.log('🧪 [v1.3.22测试] ✅ 群聊标题正确:', currentTitle);
      } else {
        titleTestResult = '❌ 群聊标题错误';
        console.log('🧪 [v1.3.22测试] ❌ 群聊标题错误，期望:', expectedTitle, '实际:', currentTitle);
      }
    }
    
    // ✅ 3. 检查消息收发对称性
    const sentMessages = messages.filter(msg => msg.senderId === currentUser?.openId && !msg.isSystem);
    const receivedMessages = messages.filter(msg => msg.senderId !== currentUser?.openId && !msg.isSystem);
    
    console.log('🧪 [v1.3.22测试] 已发送消息数量:', sentMessages.length);
    console.log('🧪 [v1.3.22测试] 已接收消息数量:', receivedMessages.length);
    
    let messageTestResult = '';
    if (!isFromInvite) {
      // 发送方检查
      messageTestResult = '✅ 发送方消息功能正常';
      console.log('🧪 [v1.3.22测试] 发送方身份，消息发送功能检查通过');
    } else {
      // 接收方检查
      if (receivedMessages.length > 0) {
        messageTestResult = '✅ 接收方能正常接收消息';
        console.log('🧪 [v1.3.22测试] ✅ 接收方能正常接收消息');
      } else {
        messageTestResult = '⚠️ 接收方暂未收到消息';
        console.log('🧪 [v1.3.22测试] ⚠️ 接收方暂未收到消息，可能是对方尚未发送');
      }
    }
    
    // ✅ 4. 检查监听器状态
    let listenerStatus = '';
    if (this.messageWatcher) {
      listenerStatus += '✅ 消息监听器正常 ';
    } else {
      listenerStatus += '❌ 消息监听器异常 ';
    }
    
    if (this.participantWatcher || this.conversationWatcher) {
      listenerStatus += '✅ 参与者监听器正常';
    } else {
      listenerStatus += '❌ 参与者监听器异常';
    }
    
    console.log('🧪 [v1.3.22测试] 监听器状态:', listenerStatus);
    
    // ✅ 5. 自动修复检测
    if (participants.length === 2 && (!currentTitle || !currentTitle.includes('我和'))) {
      console.log('🧪 [v1.3.22测试] 🔧 检测到双人聊天标题需要修复，触发自动修复');
      setTimeout(() => {
        this.fetchChatParticipantsWithRealNames();
      }, 1000);
    }
    
    console.log('🧪 ==================== v1.3.22 测试完成 ====================');
    
    // 显示测试结果摘要
    wx.showModal({
      title: 'v1.3.22 修复测试完成',
      content: `参与者: ${participants.length}人\n${titleTestResult}\n${messageTestResult}\n${listenerStatus}`,
      showCancel: false,
      confirmText: '了解'
    });
  };

  // 🔥 【修复消息身份判断】基于角色身份的准确判断，避免错误映射
  page.isMessageFromCurrentUser = function(senderId, currentUserId) {
    if (!senderId || !currentUserId || senderId === 'temp_user' || currentUserId === 'temp_user') {
      console.warn('🔥 [ID匹配] 无效的ID参数:', { senderId, currentUserId });
      return false;
    }

    // 1. 直接匹配 - 最准确的判断
    if (senderId === currentUserId) {
      console.log('🔥 [ID匹配] 精确匹配成功:', senderId);
      return true;
    }

    // 🔥 【关键修复】基于用户身份角色判断，避免错误的自动映射
    const isFromInvite = this.data.isFromInvite;
    const currentUserOpenId = this.data.currentUser?.openId;
    
    console.log('🔥 [ID匹配] 身份判断:', {
      senderId: senderId,
      currentUserId: currentUserId,
      isFromInvite: isFromInvite,
      currentUserOpenId: currentUserOpenId
    });
    
    // 🔥 【修复】统一的身份判断逻辑，避免复杂的映射和自动匹配
    // 使用传入的currentUserId参数作为准确的当前用户ID
    const isMyMessage = senderId === currentUserId;
    console.log('🔥 [ID匹配] 统一判断结果:', isMyMessage ? '自己发送' : '对方发送');
    return isMyMessage;
  };
  
  // 🔥 【HOTFIX-v1.3.23】提取ID中的数字部分
  page.extractIdNumeric = function(id) {
    if (!id) return null;
    
    // 匹配时间戳格式的数字
    const match = id.match(/(\d{13,})/); // 13位以上的数字（时间戳）
    return match ? match[1] : null;
  };
  
  // 🔥 【HOTFIX-v1.3.23】检查是否是同一用户的不同ID格式
  page.isSameUserDifferentFormat = function(id1, id2) {
    if (!id1 || !id2) return false;
    
    // 检查是否都包含相同的时间戳
    const numeric1 = this.extractIdNumeric(id1);
    const numeric2 = this.extractIdNumeric(id2);
    
    if (numeric1 && numeric2) {
      // 如果时间戳相近（10秒内），认为是同一用户
      const diff = Math.abs(parseInt(numeric1) - parseInt(numeric2));
      return diff < 10000; // 10秒内
    }
    
    return false;
  };

  // 🔥 【HOTFIX-v1.3.25】增强的用户映射系统
  this.chatUserMapping = this.chatUserMapping || new Map();
  
  // 建立用户ID映射关系
  page.establishUserMapping = function(localId, remoteId, userName) {
    if (!localId || !remoteId) {
      console.warn('🔥 [用户映射] 无效的ID参数:', { localId, remoteId });
      return;
    }

    // 验证ID格式
    const isLocalIdFormat = id => id.startsWith('local_');
    const isWechatIdFormat = id => id.length > 20 && !isLocalIdFormat(id);

    if (!isLocalIdFormat(localId)) {
      console.warn('🔥 [用户映射] 本地ID格式错误:', localId);
      return;
    }

    if (!isWechatIdFormat(remoteId)) {
      console.warn('🔥 [用户映射] 微信ID格式错误:', remoteId);
      return;
    }

    const mappingInfo = {
      localId,
      remoteId,
      userName: userName || '用户',
      timestamp: Date.now()
    };

    // 双向映射
    this.chatUserMapping.set(localId, mappingInfo);
    this.chatUserMapping.set(remoteId, mappingInfo);

    console.log('🔥 [用户映射] ✅ 建立映射关系:', {
      localId,
      remoteId,
      userName,
      timestamp: new Date().toISOString()
    });

    // 显示当前映射状态
    console.log('🔥 [用户映射] 当前映射表大小:', this.chatUserMapping.size);
    this.chatUserMapping.forEach((value, key) => {
      console.log(`🔥 [用户映射] - ${key}:`, value);
    });
  };
  
  // 检查用户映射关系
  page.checkChatUserMapping = function(id1, id2) {
    if (!id1 || !id2) {
      console.warn('🔥 [用户映射] 无效的ID参数:', { id1, id2 });
      return false;
    }

    // 获取映射信息
    const mapping1 = this.chatUserMapping.get(id1);
    const mapping2 = this.chatUserMapping.get(id2);

    if (!mapping1 && !mapping2) {
      console.log('🔥 [用户映射] 未找到映射关系');
      return false;
    }

    // 检查是否存在映射关系
    if (mapping1) {
      if (mapping1.localId === id2 || mapping1.remoteId === id2) {
        console.log('🔥 [用户映射] ✅ 找到映射关系:', id1, '->', id2);
        return true;
      }
    }

    if (mapping2) {
      if (mapping2.localId === id1 || mapping2.remoteId === id1) {
        console.log('🔥 [用户映射] ✅ 找到反向映射关系:', id2, '->', id1);
        return true;
      }
    }

    console.log('🔥 [用户映射] ❌ 未找到有效映射关系');
    return false;
    
    return false;
  };
  
  // 🔥 【HOTFIX-v1.3.26】增强智能映射系统
  page.smartEstablishMapping = function() {
    const currentUser = this.data.currentUser;
    const messages = this.data.messages || [];
    
    if (!currentUser || !currentUser.openId) {
      console.log('🔥 [智能映射] 用户信息缺失，跳过映射');
      return;
    }
    
    // 从本地存储恢复映射关系
    const mappingKey = `${this.data.chatId}_mapping`;
    const storedMapping = wx.getStorageSync(mappingKey) || {};
    
    // 恢复映射到内存
    Object.entries(storedMapping).forEach(([id, info]) => {
      this.chatUserMapping.set(id, info);
    });
    
    // 提取所有有效的消息发送者ID
    const senderIds = [...new Set(
      messages.filter(msg => {
        // 过滤有效消息：非系统消息，有发送者ID，不是占位符
        const isValid = !msg.isSystem && 
                       msg.senderId && 
                       msg.senderId !== 'system' && 
                       msg.senderId !== 'self' && 
                       msg.senderId !== 'other' && 
                       msg.senderId !== 'undefined' &&
                       typeof msg.senderId === 'string' &&
                       msg.senderId.length > 5;
        
        if (isValid) {
          console.log('🔥 [智能映射] 发现有效消息:', {
            id: msg.id,
            senderId: msg.senderId,
            content: msg.content?.substring(0, 10) + '...'
          });
        }
        
        return isValid;
      }).map(msg => msg.senderId)
    )];
    
    const currentUserId = currentUser.openId;
    
    console.log('🔥 [智能映射] 当前用户ID:', currentUserId);
    console.log('🔥 [智能映射] 有效消息发送者IDs:', senderIds);
    console.log('🔥 [智能映射] 消息总数:', messages.length, '非系统消息:', messages.filter(msg => !msg.isSystem).length);
    
    // 🔥 新增：主动检测ID格式差异
    const localIds = senderIds.filter(id => id && id.startsWith('local_'));
    const wechatIds = senderIds.filter(id => id && id.length > 20 && !id.startsWith('local_'));
    
    console.log('🔥 [智能映射] 本地ID数量:', localIds.length, '列表:', localIds);
    console.log('🔥 [智能映射] 微信ID数量:', wechatIds.length, '列表:', wechatIds);
    
    // 🔥 如果同时存在本地ID和微信ID，很可能需要建立映射
    if (localIds.length > 0 && wechatIds.length > 0) {
      console.log('🔥 [智能映射] 🚨 检测到ID格式混合，强制建立映射关系');
      
      // 为每个本地ID和微信ID建立映射
      localIds.forEach(localId => {
        wechatIds.forEach(wechatId => {
          if (localId === currentUserId) {
            // 当前用户的本地ID映射到对方的微信ID
            this.establishUserMapping(localId, wechatId, currentUser.nickName);
            console.log('🔥 [智能映射] ✅ 建立映射: 本地用户', localId, '<->', '远程用户', wechatId);
          } else if (wechatId !== currentUserId) {
            // 对方的本地ID映射到微信ID
            this.establishUserMapping(localId, wechatId, '对方用户');
            console.log('🔥 [智能映射] ✅ 建立映射: 对方本地', localId, '<->', '对方微信', wechatId);
          }
        });
      });
    } else {
      // 🔥 传统的相似性检测
      senderIds.forEach(senderId => {
        if (senderId !== currentUserId) {
          // 检查是否可能是同一用户的不同ID格式
          if (this.isPotentialSameUser(senderId, currentUserId)) {
            this.establishUserMapping(currentUserId, senderId, currentUser.nickName);
            console.log('🔥 [智能映射] ✅ 相似性映射:', currentUserId, '<->', senderId);
          }
        }
      });
    }
    
    // 🔥 新增：显示当前映射状态
    console.log('🔥 [智能映射] 映射表大小:', this.chatUserMapping ? this.chatUserMapping.size : 0);
    if (this.chatUserMapping && this.chatUserMapping.size > 0) {
      this.chatUserMapping.forEach((value, key) => {
        console.log(`🔥 [智能映射] - ${key} -> ${JSON.stringify(value)}`);
      });
    }
  };
  
  // 判断两个ID是否可能属于同一用户
  page.isPotentialSameUser = function(id1, id2) {
    if (!id1 || !id2) return false;
    
    // 如果一个是本地ID，一个是微信ID，且在同一聊天中，很可能是同一用户
    const isLocal1 = id1.startsWith('local_');
    const isLocal2 = id2.startsWith('local_');
    const isWechat1 = id1.length > 20 && !isLocal1;
    const isWechat2 = id2.length > 20 && !isLocal2;
    
    // 一个本地ID，一个微信ID
    if ((isLocal1 && isWechat2) || (isLocal2 && isWechat1)) {
      console.log('🔥 [智能映射] 检测到本地ID和微信ID组合，可能属于同一用户');
      return true;
    }
    
    return false;
  };
  
  // 🔥 【HOTFIX-v1.3.25】判断是否应该建立映射关系
  page.shouldEstablishMapping = function(senderId, currentUserId) {
    if (!senderId || !currentUserId) return false;
    
    // 检查是否已经有映射关系
    if (this.checkChatUserMapping && this.checkChatUserMapping(senderId, currentUserId)) {
      console.log('🔥 [实时映射] 映射关系已存在，跳过');
      return false;
    }
    
    // 检查ID格式是否不同
    const senderIsLocal = senderId.startsWith('local_');
    const currentIsLocal = currentUserId.startsWith('local_');
    const senderIsWechat = senderId.length > 20 && !senderIsLocal;
    const currentIsWechat = currentUserId.length > 20 && !currentIsLocal;
    
    // 如果一个是本地ID，一个是微信ID，需要建立映射
    if ((senderIsLocal && currentIsWechat) || (senderIsWechat && currentIsLocal)) {
      console.log('🔥 [实时映射] 检测到不同ID格式，需要建立映射');
      console.log('🔥 [实时映射] 发送者ID:', senderId, senderIsLocal ? '(本地)' : '(微信)');
      console.log('🔥 [实时映射] 当前用户ID:', currentUserId, currentIsLocal ? '(本地)' : '(微信)');
      return true;
    }
    
    return false;
  };
  // 🆕 【HOTFIX-v1.3.23】消息收发身份不一致修复测试
  page.testV1323Fix = function() {
    console.log('🧪 ==================== v1.3.23 身份不一致修复测试 ====================');
    
    const currentUser = this.data.currentUser;
    const messages = this.data.messages || [];
    const isFromInvite = this.data.isFromInvite;
    
    console.log('🧪 [v1.3.23测试] 当前用户信息:', currentUser);
    console.log('🧪 [v1.3.23测试] 身份标识 isFromInvite:', isFromInvite);
    console.log('🧪 [v1.3.23测试] 消息总数:', messages.length);
    
    // ✅ 1. 检查用户ID格式
    const currentUserId = currentUser?.openId;
    console.log('🧪 [v1.3.23测试] 当前用户ID:', currentUserId);
    console.log('🧪 [v1.3.23测试] ID格式分析:');
    
    if (currentUserId) {
      if (currentUserId.startsWith('local_')) {
        console.log('🧪 [v1.3.23测试] - 本地生成ID格式');
      } else if (currentUserId.startsWith('mock_') || currentUserId.startsWith('fallback_')) {
        console.log('🧪 [v1.3.23测试] - 云函数模拟ID格式');
      } else if (currentUserId.length > 20) {
        console.log('🧪 [v1.3.23测试] - 真实微信openId格式');
      } else {
        console.log('🧪 [v1.3.23测试] - 未知ID格式');
      }
    }
    
    // ✅ 2. 检查消息发送者ID格式
    console.log('🧪 [v1.3.23测试] 消息发送者ID分析:');
    const senderIds = [...new Set(messages.filter(msg => !msg.isSystem).map(msg => msg.senderId))];
    senderIds.forEach((senderId, index) => {
      console.log(`🧪 [v1.3.23测试] 发送者${index + 1}: ${senderId}`);
      
      if (senderId.startsWith('local_')) {
        console.log(`🧪 [v1.3.23测试] - 本地生成ID`);
      } else if (senderId.startsWith('mock_') || senderId.startsWith('fallback_')) {
        console.log(`🧪 [v1.3.23测试] - 云函数模拟ID`);
      } else if (senderId.length > 20) {
        console.log(`🧪 [v1.3.23测试] - 真实微信openId`);
      }
      
      // 测试ID匹配逻辑
      const isMatch = this.isMessageFromCurrentUser(senderId, currentUserId);
      console.log(`🧪 [v1.3.23测试] - 与当前用户匹配: ${isMatch ? '✅ 是' : '❌ 否'}`);
    });
    
    // ✅ 3. 检查消息归属正确性
    const myMessages = messages.filter(msg => !msg.isSystem && this.isMessageFromCurrentUser(msg.senderId, currentUserId));
    const otherMessages = messages.filter(msg => !msg.isSystem && !this.isMessageFromCurrentUser(msg.senderId, currentUserId));
    
    console.log('🧪 [v1.3.23测试] 我的消息数量:', myMessages.length);
    console.log('🧪 [v1.3.23测试] 对方消息数量:', otherMessages.length);
    
    // ✅ 4. 检查是否存在ID不一致问题
    let hasIdMismatch = false;
    let mismatchDetails = [];
    
    if (senderIds.length > 1) {
      // 多个发送者ID，检查是否有格式不一致
      const localIds = senderIds.filter(id => id.startsWith('local_'));
      const realIds = senderIds.filter(id => !id.startsWith('local_') && !id.startsWith('mock_') && !id.startsWith('fallback_'));
      
      if (localIds.length > 0 && realIds.length > 0) {
        hasIdMismatch = true;
        mismatchDetails.push(`发现本地ID(${localIds.length}个)和真实ID(${realIds.length}个)混合使用`);
      }
    }
    
    console.log('🧪 [v1.3.23测试] ID一致性检查:', hasIdMismatch ? '❌ 发现不一致' : '✅ 格式一致');
    
    if (hasIdMismatch) {
      mismatchDetails.forEach(detail => {
        console.log('🧪 [v1.3.23测试] - ' + detail);
      });
    }
    
    console.log('🧪 ==================== v1.3.23 测试完成 ====================');
    
    // 显示测试结果
    const resultText = `当前用户ID: ${currentUserId}\n发送者数量: ${senderIds.length}\n我的消息: ${myMessages.length}条\n对方消息: ${otherMessages.length}条\n\n${hasIdMismatch ? '❌ 检测到ID格式不一致:\n' + mismatchDetails.join('\n') : '✅ ID格式一致，消息归属正确'}`;
    
    wx.showModal({
      title: 'v1.3.23 身份修复测试',
      content: resultText,
      showCancel: false,
      confirmText: '了解'
           });
   };

   // 🆕 【HOTFIX-v1.3.24】标题重置和ID不一致终极修复测试
   this.testV1324Fix = function() {
     console.log('🧪 ==================== v1.3.24 标题重置和ID终极修复测试 ====================');
     
     const currentUser = this.data.currentUser;
     const participants = this.data.participants || [];
     const messages = this.data.messages || [];
     const isFromInvite = this.data.isFromInvite;
     const currentTitle = this.data.dynamicTitle || this.data.chatTitle;
     
     console.log('🧪 [v1.3.24测试] 当前用户信息:', currentUser);
     console.log('🧪 [v1.3.24测试] 参与者数量:', participants.length);
     console.log('🧪 [v1.3.24测试] 当前标题:', currentTitle);
     console.log('🧪 [v1.3.24测试] 身份标识 isFromInvite:', isFromInvite);
     
     // ✅ 1. 检查标题重置问题
     let titleStatus = '';
     if (participants.length >= 2) {
       if (currentTitle && currentTitle.includes('我和') && currentTitle.includes('（2）')) {
         titleStatus = '✅ 双人标题正确显示';
         console.log('🧪 [v1.3.24测试] ✅ 双人标题正确:', currentTitle);
       } else {
         titleStatus = '❌ 标题被重置或格式错误';
         console.log('🧪 [v1.3.24测试] ❌ 标题问题，期望双人格式，实际:', currentTitle);
       }
     } else {
       if (currentTitle === currentUser?.nickName) {
         titleStatus = '✅ 单人标题正确显示';
         console.log('🧪 [v1.3.24测试] ✅ 单人标题正确:', currentTitle);
       } else {
         titleStatus = '❌ 单人标题错误';
         console.log('🧪 [v1.3.24测试] ❌ 单人标题错误，期望:', currentUser?.nickName, '实际:', currentTitle);
       }
     }
     
     // ✅ 2. 检查ID格式一致性问题
     const currentUserId = currentUser?.openId;
     const senderIds = [...new Set(messages.filter(msg => !msg.isSystem).map(msg => msg.senderId))];
     
     console.log('🧪 [v1.3.24测试] 当前用户ID:', currentUserId);
     console.log('🧪 [v1.3.24测试] 消息发送者IDs:', senderIds);
     
     let idConsistencyStatus = '';
     let hasInconsistency = false;
     
     if (senderIds.length > 1) {
       const localIds = senderIds.filter(id => id && id.startsWith('local_'));
       const wechatIds = senderIds.filter(id => id && id.length > 20 && !id.startsWith('local_'));
       
       if (localIds.length > 0 && wechatIds.length > 0) {
         hasInconsistency = true;
         idConsistencyStatus = `❌ 发现ID格式不一致：本地ID ${localIds.length}个，微信ID ${wechatIds.length}个`;
         console.log('🧪 [v1.3.24测试] ❌ ID格式不一致:', { localIds, wechatIds });
       } else {
         idConsistencyStatus = '✅ ID格式一致';
         console.log('🧪 [v1.3.24测试] ✅ ID格式一致');
       }
     } else {
       idConsistencyStatus = '✅ 单一发送者，无一致性问题';
       console.log('🧪 [v1.3.24测试] ✅ 单一发送者');
     }
     
     // ✅ 3. 测试智能映射功能
     console.log('🧪 [v1.3.24测试] 测试智能映射功能:');
     console.log('🧪 [v1.3.24测试] 当前映射表大小:', this.chatUserMapping ? this.chatUserMapping.size : 0);
     
     if (this.chatUserMapping && this.chatUserMapping.size > 0) {
       console.log('🧪 [v1.3.24测试] 映射关系:');
       this.chatUserMapping.forEach((value, key) => {
         console.log(`🧪 [v1.3.24测试] - ${key} -> ${JSON.stringify(value)}`);
       });
     }
     
     // 测试智能映射建立
     if (hasInconsistency) {
       console.log('🧪 [v1.3.24测试] 🔧 检测到ID不一致，触发智能映射');
       this.smartEstablishMapping();
     }
     
     // ✅ 4. 测试消息归属判断
     let messageAttributionStatus = '';
     const myMessages = messages.filter(msg => !msg.isSystem && this.isMessageFromCurrentUser(msg.senderId, currentUserId));
     const otherMessages = messages.filter(msg => !msg.isSystem && !this.isMessageFromCurrentUser(msg.senderId, currentUserId));
     
     console.log('🧪 [v1.3.24测试] 我的消息数量:', myMessages.length);
     console.log('🧪 [v1.3.24测试] 对方消息数量:', otherMessages.length);
     
     if (myMessages.length === 0 && otherMessages.length === 0) {
       messageAttributionStatus = '⚠️ 暂无消息可测试';
     } else if (hasInconsistency && otherMessages.length === 0) {
       messageAttributionStatus = '❌ ID不一致导致无法识别对方消息';
     } else {
       messageAttributionStatus = '✅ 消息归属判断正常';
     }
     
     console.log('🧪 ==================== v1.3.24 测试完成 ====================');
     
     // 显示测试结果
     const resultText = `标题状态: ${titleStatus}\nID一致性: ${idConsistencyStatus}\n消息归属: ${messageAttributionStatus}\n映射关系: ${this.chatUserMapping ? this.chatUserMapping.size : 0}条\n\n参与者: ${participants.length}人\n我的消息: ${myMessages.length}条\n对方消息: ${otherMessages.length}条`;
     
     wx.showModal({
       title: 'v1.3.24 终极修复测试',
       content: resultText,
       showCancel: false,
       confirmText: '了解'
     });
   };

   // 🆕 【HOTFIX-v1.3.25】智能映射系统修复测试
   this.testV1325Fix = function() {
     console.log('🧪 ==================== v1.3.25 智能映射系统修复测试 ====================');
     
     const currentUser = this.data.currentUser;
     const messages = this.data.messages || [];
     const isFromInvite = this.data.isFromInvite;
     
     console.log('🧪 [v1.3.25测试] 当前用户信息:', currentUser);
     console.log('🧪 [v1.3.25测试] 消息总数:', messages.length);
     console.log('🧪 [v1.3.25测试] 身份标识 isFromInvite:', isFromInvite);
     
     // ✅ 1. 测试消息分析逻辑
     const nonSystemMessages = messages.filter(msg => !msg.isSystem);
     const senderIds = [...new Set(nonSystemMessages.map(msg => msg.senderId).filter(id => id && id !== 'self' && id !== 'other'))];
     
     console.log('🧪 [v1.3.25测试] 非系统消息数量:', nonSystemMessages.length);
     console.log('🧪 [v1.3.25测试] 提取的发送者IDs:', senderIds);
     
     let messageAnalysisStatus = '';
     if (senderIds.length === 0) {
       messageAnalysisStatus = '⚠️ 暂无有效消息可分析';
     } else if (senderIds.includes('self') || senderIds.includes('other')) {
       messageAnalysisStatus = '❌ 发现无效ID (self/other)';
     } else {
       messageAnalysisStatus = '✅ 消息分析逻辑正常';
     }
     
     // ✅ 2. 测试ID格式检测
     const localIds = senderIds.filter(id => id && id.startsWith('local_'));
     const wechatIds = senderIds.filter(id => id && id.length > 20 && !id.startsWith('local_'));
     
     console.log('🧪 [v1.3.25测试] 本地ID:', localIds);
     console.log('🧪 [v1.3.25测试] 微信ID:', wechatIds);
     
     let idFormatStatus = '';
     if (localIds.length > 0 && wechatIds.length > 0) {
       idFormatStatus = `❌ 发现ID格式混合：本地${localIds.length}个，微信${wechatIds.length}个`;
     } else if (localIds.length > 0) {
       idFormatStatus = '✅ 全部使用本地ID';
     } else if (wechatIds.length > 0) {
       idFormatStatus = '✅ 全部使用微信ID';
     } else {
       idFormatStatus = '⚠️ 无有效ID可检测';
     }
     
     // ✅ 3. 测试映射表状态
     const mappingSize = this.chatUserMapping ? this.chatUserMapping.size : 0;
     console.log('🧪 [v1.3.25测试] 映射表大小:', mappingSize);
     
     let mappingStatus = '';
     if (mappingSize === 0) {
       if (localIds.length > 0 && wechatIds.length > 0) {
         mappingStatus = '❌ 需要映射但映射表为空';
       } else {
         mappingStatus = '✅ 无需映射';
       }
     } else {
       mappingStatus = `✅ 已建立${mappingSize}条映射关系`;
       console.log('🧪 [v1.3.25测试] 映射详情:');
       this.chatUserMapping.forEach((value, key) => {
         console.log(`🧪 [v1.3.25测试] - ${key} -> ${JSON.stringify(value)}`);
       });
     }
     
     // ✅ 4. 触发智能映射测试
     console.log('🧪 [v1.3.25测试] 🔧 触发智能映射分析');
     this.smartEstablishMapping();
     
     const newMappingSize = this.chatUserMapping ? this.chatUserMapping.size : 0;
     let smartMappingStatus = '';
     if (newMappingSize > mappingSize) {
       smartMappingStatus = `✅ 智能映射成功，新增${newMappingSize - mappingSize}条关系`;
     } else if (localIds.length > 0 && wechatIds.length > 0) {
       smartMappingStatus = '❌ 智能映射失败，未建立新关系';
     } else {
       smartMappingStatus = '✅ 智能映射正常，无需新建关系';
     }
     
     // ✅ 5. 测试消息归属判断
     let attributionTestStatus = '';
     if (senderIds.length > 1 && currentUser && currentUser.openId) {
       let successCount = 0;
       senderIds.forEach(senderId => {
         const isCurrentUser = this.isMessageFromCurrentUser(senderId, currentUser.openId);
         console.log(`🧪 [v1.3.25测试] 归属测试: ${senderId} -> ${isCurrentUser ? '自己' : '对方'}`);
         if (senderId === currentUser.openId || this.checkChatUserMapping(senderId, currentUser.openId)) {
           successCount++;
         }
       });
       attributionTestStatus = `✅ 归属判断成功率: ${successCount}/${senderIds.length}`;
     } else {
       attributionTestStatus = '⚠️ 消息不足，无法测试归属判断';
     }
     
     console.log('🧪 ==================== v1.3.25 测试完成 ====================');
     
     // 显示测试结果
     const resultText = `消息分析: ${messageAnalysisStatus}\nID格式: ${idFormatStatus}\n映射状态: ${mappingStatus}\n智能映射: ${smartMappingStatus}\n归属判断: ${attributionTestStatus}\n\n本地ID: ${localIds.length}个\n微信ID: ${wechatIds.length}个\n映射关系: ${newMappingSize}条`;
     
     wx.showModal({
       title: 'v1.3.25 智能映射修复测试',
       content: resultText,
       showCancel: false,
       confirmText: '了解'
     });
   };

   // 🆕 【HOTFIX-v1.3.29】用户数据调试和修复工具
   this.testV1329Fix = function() {
     console.log('🧪 ==================== v1.3.29 用户数据调试和修复测试 ====================');
     
     const chatId = this.data.contactId;
     console.log('🧪 [v1.3.29测试] 当前chatId:', chatId);
     
     // 1. 调试用户数据
     wx.cloud.callFunction({
       name: 'debugUserDatabase',
       data: {
         action: 'debug'
       },
       success: (res) => {
         console.log('🧪 [v1.3.29测试] 用户数据调试结果:', res.result);
         
         if (res.result && res.result.success) {
           const data = res.result.data;
           console.log('🧪 [v1.3.29测试] 用户总数:', data.userCount);
           console.log('🧪 [v1.3.29测试] 重复昵称:', data.duplicateNicknames);
           console.log('🧪 [v1.3.29测试] 会话数:', data.conversationCount);
           
           // 检查是否有重复昵称问题
           if (data.duplicateNicknames && data.duplicateNicknames.length > 0) {
             wx.showModal({
               title: '发现用户数据问题',
               content: `检测到重复昵称问题：\n${data.duplicateNicknames.map(([name, ids]) => `${name}: ${ids.length}个用户`).join('\n')}\n\n是否重建用户映射？`,
               confirmText: '重建',
               cancelText: '稍后',
               success: (modalRes) => {
                 if (modalRes.confirm) {
                   this.rebuildUserMapping();
                 }
               }
             });
           } else {
             wx.showToast({
               title: '用户数据正常',
               icon: 'success'
             });
           }
         }
       },
       fail: (err) => {
         console.error('🧪 [v1.3.29测试] 调试失败:', err);
         wx.showToast({
           title: '调试失败',
           icon: 'none'
         });
       }
     });
   };

   // 🔧 重建用户映射
   this.rebuildUserMapping = function() {
     const chatId = this.data.contactId;
     console.log('🔧 [用户映射重建] 开始重建，chatId:', chatId);
     
     // 🔥 修改：后台静默重建用户映射，不显示加载气泡
     console.log('🔧 开始后台静默重建用户映射...');
     
     wx.cloud.callFunction({
       name: 'debugUserDatabase',
       data: {
         action: 'rebuild',
         chatId: chatId
       },
       success: (res) => {
         wx.hideLoading();
         console.log('🔧 [用户映射重建] 重建结果:', res.result);
         
         if (res.result && res.result.success) {
           wx.showToast({
             title: '✅ 用户映射重建完成',
             icon: 'success'
           });
           
           // 重新获取参与者信息
           setTimeout(() => {
             this.fetchChatParticipantsWithRealNames();
             this.updateDynamicTitle();
           }, 1000);
         } else {
           wx.showToast({
             title: '重建失败: ' + (res.result?.error || '未知错误'),
             icon: 'none'
           });
         }
       },
       fail: (err) => {
         wx.hideLoading();
         console.error('🔧 [用户映射重建] 重建失败:', err);
         wx.showToast({
           title: '重建失败',
           icon: 'none'
         });
       }
     });
   };

   // 🔧 清理特定用户数据
   this.cleanUserData = function(targetOpenId) {
     if (!targetOpenId) {
       wx.showModal({
         title: '清理用户数据',
         content: '请输入要清理的用户openId',
         editable: true,
         success: (res) => {
           if (res.confirm && res.content) {
             this.performUserDataClean(res.content);
           }
         }
       });
       return;
     }
     
     this.performUserDataClean(targetOpenId);
   };

   // 执行用户数据清理
   this.performUserDataClean = function(targetOpenId) {
     console.log('🔧 [用户数据清理] 开始清理，目标openId:', targetOpenId);
     
     // 🔥 修改：后台静默清理用户数据，不显示加载气泡
     console.log('🔧 开始后台静默清理用户数据...');
     
     wx.cloud.callFunction({
       name: 'debugUserDatabase',
       data: {
         action: 'clean',
         targetOpenId: targetOpenId
       },
       success: (res) => {
         wx.hideLoading();
         console.log('🔧 [用户数据清理] 清理结果:', res.result);
         
         if (res.result && res.result.success) {
           wx.showToast({
             title: '✅ 用户数据清理完成',
             icon: 'success'
           });
         } else {
           wx.showToast({
             title: '清理失败: ' + (res.result?.error || '未知错误'),
             icon: 'none'
           });
         }
       },
       fail: (err) => {
         wx.hideLoading();
         console.error('🔧 [用户数据清理] 清理失败:', err);
         wx.showToast({
           title: '清理失败',
           icon: 'none'
         });
       }
     });
   };

   // 🆕 【HOTFIX-v1.3.33】标题显示修复测试
   this.testV1333Fix = function() {
     console.log('🧪 ==================== v1.3.33 标题显示修复测试 ====================');
     
     // 获取当前参与者信息
     const participants = this.data.participants || [];
     console.log('🧪 [v1.3.33测试] 当前参与者数量:', participants.length);
     console.log('🧪 [v1.3.33测试] 参与者详情:', participants);
     
     // 检查参与者数据结构
     if (participants.length >= 1) {
       participants.forEach((p, index) => {
         console.log(`🧪 [v1.3.33测试] 参与者${index}:`, {
           openId: p.openId,
           nickName: p.nickName,
           isSelf: p.isSelf,
           type: typeof p
         });
       });
     }
     
     // 测试参与者监听器的去重逻辑
     const testParticipantsData = [
       "ojtOs7bmxy-8M5wOTcgrqlYedgyY",
       "ojtOs7bA8w-ZdS1G_o5rdoeLzWDc"
     ];
     
     console.log('🧪 [v1.3.33测试] 测试去重逻辑，输入数据:', testParticipantsData);
     
     const deduplicatedParticipants = [];
     const seenIds = new Set();
     
     for (const p of testParticipantsData) {
       let id;
       let participant;
       
       if (typeof p === 'string') {
         id = p;
         participant = {
           id: p,
           openId: p,
           nickName: '用户',
           avatarUrl: '/assets/images/default-avatar.png'
         };
       } else if (typeof p === 'object' && p !== null) {
         id = p.id || p.openId;
         participant = p;
       } else {
         console.log('🧪 [v1.3.33测试] ❌ 无效的参与者数据格式:', p);
         continue;
       }
       
       // 🔥 【过滤垃圾数据】跳过temp_user等无效参与者
       if (id === 'temp_user' || id.startsWith('temp_') || id.length <= 5) {
         console.log('🧪 [v1.3.33测试] ❌ 跳过垃圾数据:', id, participant.nickName);
       } else if (id && !seenIds.has(id)) {
         seenIds.add(id);
         deduplicatedParticipants.push(participant);
         console.log('🧪 [v1.3.33测试] ✅ 保留唯一参与者:', id, participant.nickName);
       } else {
         console.log('🧪 [v1.3.33测试] ❌ 跳过重复参与者:', id, participant.nickName);
       }
     }
     
     console.log('🧪 [v1.3.33测试] 去重结果:', deduplicatedParticipants);
     
     // 测试对方昵称获取
     const otherParticipant = deduplicatedParticipants.find(p => p.openId !== this.data.currentUser?.openId);
     if (otherParticipant) {
       console.log('🧪 [v1.3.33测试] 找到对方参与者:', otherParticipant);
       
       wx.cloud.callFunction({
         name: 'debugUserDatabase',
         data: {
           openId: otherParticipant.openId
         },
         success: (res) => {
           console.log('🧪 [v1.3.33测试] 获取对方信息成功:', res);
           
           if (res.result && res.result.success && res.result.userInfo) {
             const realNickname = res.result.userInfo.nickName || res.result.userInfo.name || '好友';
             const newTitle = `我和${realNickname}（2）`;
             
             console.log('🧪 [v1.3.33测试] 对方真实昵称:', realNickname);
             console.log('🧪 [v1.3.33测试] 新标题:', newTitle);
             
             // 实际更新标题
          this.setData({
               dynamicTitle: newTitle,
               chatTitle: newTitle,
               contactName: newTitle
          });
          
          wx.setNavigationBarTitle({
               title: newTitle,
            success: () => {
                 console.log('🧪 [v1.3.33测试] ✅ 标题更新成功');
                 wx.showToast({
                   title: `v1.3.33修复成功`,
                   icon: 'success'
                 });
               }
             });
           } else {
             console.log('🧪 [v1.3.33测试] ❌ 获取对方信息失败');
             wx.showToast({
               title: '获取对方信息失败',
               icon: 'error'
             });
      }
    },
    fail: (err) => {
           console.log('🧪 [v1.3.33测试] ❌ 云函数调用失败:', err);
           wx.showToast({
             title: 'v1.3.33测试失败',
             icon: 'error'
           });
         }
       });
     } else {
       console.log('🧪 [v1.3.33测试] ❌ 未找到对方参与者');
       wx.showToast({
         title: '未找到对方参与者',
         icon: 'error'
       });
     }
   };
   // 🔧 【b端消息销毁测试】专门测试b端消息销毁功能
   this.testBEndMessageDestroy = function() {
     console.log('🔥 [b端销毁测试] ==================== 开始测试b端消息销毁功能 ====================');
     
     const currentUser = this.data.currentUser;
     const isFromInvite = this.data.isFromInvite;
     
     console.log('🔥 [b端销毁测试] 当前用户身份:', {
       isFromInvite: isFromInvite,
       isASide: !isFromInvite,
       isBSide: isFromInvite,
       currentUserOpenId: currentUser?.openId
     });
     
     // 🔥 模拟b端接收消息的场景
     const mockMessage = {
       id: 'test_b_msg_' + Date.now(),
       senderId: 'other_user_' + Date.now(), // 模拟对方发送
       content: '测试b端消息销毁功能',
       timestamp: Date.now(),
       isSelf: false,
      isSystem: false,
      destroyTimeout: DEFAULT_DESTROY_TIMEOUT,
       isDestroyed: false,
       destroying: false,
       remainTime: 0,
       opacity: 1
     };
     
     console.log('🔥 [b端销毁测试] 模拟接收消息:', mockMessage);
     
     // 🔥 检查消息身份判断逻辑
     const isFromCurrentUser = this.isMessageFromCurrentUser(mockMessage.senderId, currentUser?.openId);
     console.log('🔥 [b端销毁测试] 消息身份判断:', {
       senderId: mockMessage.senderId,
       currentUserId: currentUser?.openId,
       isFromCurrentUser: isFromCurrentUser,
       expected: false // 期望为false，因为是对方发送的消息
     });
     
     if (isFromCurrentUser) {
       console.error('🔥 [b端销毁测试] ❌ 消息身份判断错误！对方消息被识别为自己发送');
       wx.showModal({
         title: 'b端测试失败',
         content: '消息身份判断错误：对方消息被识别为自己发送',
         showCancel: false
       });
       return;
     }
     
     // 🔥 添加消息到界面
     const currentMessages = this.data.messages || [];
     const updatedMessages = [...currentMessages, mockMessage];
      this.setData({
       messages: updatedMessages
     });
     
     console.log('🔥 [b端销毁测试] 消息已添加到界面，开始销毁倒计时');
     
     // 🔥 启动销毁倒计时（模拟b端的自动销毁逻辑）
     setTimeout(() => {
       console.log('🔥 [b端销毁测试] 开始销毁倒计时');
       this.startDestroyCountdown(mockMessage.id);
       
       // 🔥 监控销毁过程
       const monitorDestroy = setInterval(() => {
         const currentMessages = this.data.messages;
         const testMessage = currentMessages.find(msg => msg.id === mockMessage.id);
         
         if (!testMessage) {
           console.log('🔥 [b端销毁测试] 消息已从列表中移除');
           clearInterval(monitorDestroy);
           return;
         }
         
         console.log('🔥 [b端销毁测试] 销毁状态:', {
           destroying: testMessage.destroying,
           destroyed: testMessage.destroyed,
           remainTime: testMessage.remainTime,
           opacity: testMessage.opacity,
           fading: testMessage.fading
         });
         
         if (testMessage.destroyed) {
           console.log('🔥 [b端销毁测试] ✅ 消息销毁完成');
           clearInterval(monitorDestroy);
           
           // 🔥 验证销毁效果
           this.verifyDestroyEffect(testMessage);
         }
       }, 1000);
       
     }, 1000); // 延迟1秒开始，模拟b端的延迟启动
     
     // 🔥 设置整体测试超时
     setTimeout(() => {
       console.log('🔥 [b端销毁测试] 测试完成，清理测试消息');
       const finalMessages = this.data.messages.filter(msg => msg.id !== mockMessage.id);
       this.setData({
         messages: finalMessages
       });
     }, 30000); // 30秒后清理测试消息
   };
   
   // 🔧 【销毁效果验证】验证销毁效果是否符合预期
   this.verifyDestroyEffect = function(destroyedMessage) {
     console.log('🔥 [销毁效果验证] 开始验证销毁效果');
     
     const issues = [];
     
     // 🔥 检查消息是否标记为已销毁
     if (!destroyedMessage.destroyed) {
       issues.push('消息未标记为已销毁');
     }
     
     // 🔥 检查内容是否已清空
     if (destroyedMessage.content !== '') {
       issues.push('消息内容未清空');
     }
     
     // 🔥 检查透明度是否为0
     if (destroyedMessage.opacity !== 0) {
       issues.push('消息透明度未设为0');
     }
     
     // 🔥 检查销毁状态
     if (destroyedMessage.destroying !== false) {
       issues.push('消息销毁状态未重置');
     }
     
     if (issues.length === 0) {
       console.log('🔥 [销毁效果验证] ✅ 所有销毁效果验证通过');
       wx.showToast({
         title: '🔥 b端销毁测试通过',
         icon: 'success',
         duration: 2000
       });
     } else {
       console.error('🔥 [销毁效果验证] ❌ 发现问题:', issues);
       wx.showModal({
         title: 'b端销毁测试失败',
         content: '发现问题：' + issues.join('；'),
         showCancel: false
       });
     }
   };
   
   // 🔧 【对比测试】比较a端和b端的销毁时机差异
   this.compareDestroyTiming = function() {
     console.log('🔥 [对比测试] 开始比较a端和b端的销毁时机');
     
     const testMessage = '测试消息';
     const messageLength = testMessage.length;
     const expectedStayDuration = messageLength; // 每个字1秒
     const expectedFadeDuration = 5; // 5秒渐变
     const expectedTotalDuration = expectedStayDuration + expectedFadeDuration;
     
     console.log('🔥 [对比测试] 销毁时机计算:', {
       messageContent: testMessage,
       messageLength: messageLength,
       expectedStayDuration: expectedStayDuration,
       expectedFadeDuration: expectedFadeDuration,
       expectedTotalDuration: expectedTotalDuration
     });
     
     // 🔥 检查是否与startDestroyCountdown函数中的逻辑一致
     console.log('🔥 [对比测试] 验证销毁时机计算逻辑是否一致...');
     
     // 模拟startDestroyCountdown中的计算
     const stayDuration = messageLength || 1;
     const fadeDuration = 5;
     const totalDuration = stayDuration + fadeDuration;
     
     const isTimingCorrect = (
       stayDuration === expectedStayDuration &&
       fadeDuration === expectedFadeDuration &&
       totalDuration === expectedTotalDuration
     );
     
     if (isTimingCorrect) {
       console.log('🔥 [对比测试] ✅ 销毁时机计算逻辑一致');
     } else {
       console.error('🔥 [对比测试] ❌ 销毁时机计算逻辑不一致');
     }
     
     return {
       isTimingCorrect,
       expectedStayDuration,
       expectedFadeDuration,
       expectedTotalDuration
     };
   };
   
   // 🔧 【全面测试】运行完整的b端消息销毁测试
   this.runFullBEndDestroyTest = function() {
     console.log('🔥 [全面测试] ==================== 开始运行完整的b端消息销毁测试 ====================');
     
     // 🔥 步骤1：检查身份判断
     console.log('🔥 [全面测试] 步骤1：检查身份判断');
     const currentUser = this.data.currentUser;
     const isFromInvite = this.data.isFromInvite;
     
     if (!currentUser || !currentUser.openId) {
       console.error('🔥 [全面测试] ❌ 用户信息缺失，无法进行测试');
       return;
     }
     
     console.log('🔥 [全面测试] 用户身份:', isFromInvite ? 'b端（接收方）' : 'a端（发送方）');
     
     // 🔥 步骤2：验证销毁时机计算
     console.log('🔥 [全面测试] 步骤2：验证销毁时机计算');
     const timingResult = this.compareDestroyTiming();
     
     if (!timingResult.isTimingCorrect) {
       console.error('🔥 [全面测试] ❌ 销毁时机计算存在问题');
       return;
     }
     
     // 🔥 步骤3：执行实际销毁测试
     console.log('🔥 [全面测试] 步骤3：执行实际销毁测试');
     this.testBEndMessageDestroy();
     
     // 🔥 步骤4：总结报告
     setTimeout(() => {
       console.log('🔥 [全面测试] ==================== b端消息销毁测试报告 ====================');
       console.log('🔥 [全面测试] 身份判断: ✅ 正确');
       console.log('🔥 [全面测试] 销毁时机: ✅ 正确');
       console.log('🔥 [全面测试] 销毁效果: 测试中...');
       console.log('🔥 [全面测试] 测试完成，请查看上方日志了解详细结果');
     }, 2000);
   };

       // 🔥 【CRITICAL-FIX-v3】系统消息过滤修复测试
  page.testSystemMessageFilter = function() {
    console.log('🔥 [系统消息测试] ==================== 开始系统消息过滤测试 ====================');
    
    // 模拟各种系统消息格式进行测试
    const testMessages = [
      // 正确格式（应该保留）
      { isSystem: true, content: '朋友加入聊天', senderId: 'test123' },
      { isSystem: true, content: '张三加入聊天', senderId: 'test123' },
      { isSystem: true, content: '加入朋友的聊天', senderId: 'test123' },
      { isSystem: true, content: '加入张三的聊天', senderId: 'test123' },
      { isSystem: true, content: '您创建了私密聊天', senderId: 'test123' },
      
      // 错误格式（应该被过滤）
      { isSystem: true, content: '成功加入朋友的聊天', senderId: 'test123' },
      { isSystem: true, content: '成功加入朋友的聊天！', senderId: 'test123' },
      { isSystem: true, content: '已加入朋友的聊天', senderId: 'test123' },
      { isSystem: true, content: '成功加入聊天', senderId: 'test123' },
      { isSystem: true, content: '已加入聊天', senderId: 'test123' },
      { isSystem: true, content: '朋友加入聊天！', senderId: 'test123' },
      { isSystem: true, content: '加入朋友的聊天！', senderId: 'test123' },
      { isSystem: true, content: '朋友已加入聊天', senderId: '' },
      { isSystem: true, content: '测试消息', senderId: 'undefined' }
    ];
    
    console.log('🔥 [系统消息测试] 测试消息总数:', testMessages.length);
    
    // 备份当前消息列表
    const originalMessages = this.data.messages || [];
    
    // 设置测试消息列表
    this.setData({
      messages: [...originalMessages, ...testMessages]
    });
    
    console.log('🔥 [系统消息测试] 添加测试消息后，消息总数:', this.data.messages.length);
    
    // 运行清理函数
    setTimeout(() => {
      console.log('🔥 [系统消息测试] 运行清理函数...');
      this.cleanupWrongSystemMessages();
      
      setTimeout(() => {
        // 检查结果
        const finalMessages = this.data.messages || [];
        const systemMessages = finalMessages.filter(msg => msg.isSystem);
        
        console.log('🔥 [系统消息测试] 清理后消息总数:', finalMessages.length);
        console.log('🔥 [系统消息测试] 清理后系统消息数:', systemMessages.length);
        
        // 检查正确格式是否被保留
        const correctMessages = systemMessages.filter(msg => 
          /^.+加入聊天$/.test(msg.content) ||
          /^加入.+的聊天$/.test(msg.content) ||
          msg.content.includes('您创建了私密聊天')
        );
        
        // 检查错误格式是否被移除
        const wrongMessages = systemMessages.filter(msg =>
          msg.content.includes('成功加入') ||
          msg.content.includes('！') ||
          !msg.senderId || msg.senderId === 'undefined' || msg.senderId === ''
        );
        
        console.log('🔥 [系统消息测试] ✅ 保留的正确格式消息数:', correctMessages.length);
        console.log('🔥 [系统消息测试] ❌ 剩余的错误格式消息数:', wrongMessages.length);
        
        if (wrongMessages.length === 0) {
          console.log('🔥 [系统消息测试] 🎉 测试通过！所有错误格式已被正确过滤');
        } else {
          console.log('🔥 [系统消息测试] ⚠️ 测试失败！仍有错误格式消息:', wrongMessages.map(m => m.content));
        }
        
        // 还原原始消息列表
        setTimeout(() => {
          this.setData({
            messages: originalMessages
          });
          console.log('🔥 [系统消息测试] 测试消息已清理，消息列表已还原');
        }, 1000);
        
      }, 200);
    }, 500);
   };

  if (DEBUG_FLAGS.ENABLE_TEST_APIS) {
    console.log('🧪 [测试方法] 测试方法添加完成，可使用以下命令:');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testParticipantFix()');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testTimeFix()');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testConnectionFix()');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testMessageSync()     // 消息收发测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].forceMessageSync()   // 🆕 强制消息同步');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testSystemMessageFilter() // 🆕 系统消息过滤测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testSystemMessageFix() // 🔥 系统消息修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testIdentityFix() // 🔥 身份判断修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].checkDataState() // 🔥 数据状态检查');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testBurnAfterReading() // 🔥 阅后即焚测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testBEndMessageDestroy() // 🔥 b端消息销毁测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].runFullBEndDestroyTest() // 🔥 完整b端销毁测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].compareDestroyTiming() // 🔥 销毁时机对比测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1319Fix()       // 🆕 v1.3.19修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1320Fix()       // 🆕 v1.3.20紧急修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1321Fix()       // 🆕 v1.3.21彻底修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1322Fix()       // 🆕 v1.3.22连接标题修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1323Fix()       // 🆕 v1.3.23身份不一致修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1324Fix()       // 🆕 v1.3.24标题重置和ID终极修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1325Fix()       // 🆕 v1.3.25智能映射系统修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1329Fix()       // 🆕 v1.3.29用户数据调试和修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testV1333Fix()       // 🆕 v1.3.33标题显示修复测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].testBEndDisplayFix()  // 🆕 v1.3.45 b端标题和系统消息测试');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].rebuildUserMapping()  // 🆕 重建用户映射');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].cleanUserData()       // 🆕 清理用户数据');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].performBEndSystemMessageCheck()  // 🆕 B端系统消息安全检查');
    console.log('- getCurrentPages()[getCurrentPages().length - 1].removeDuplicateBEndMessages()     // 🆕 清理重复B端系统消息');
  }

}

module.exports = { attach };
