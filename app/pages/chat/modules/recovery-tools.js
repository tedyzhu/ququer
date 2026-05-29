/**
 * 调试 / 应急修复工具子系统
 *
 * 通过 attach(page) 把 12 个 fix/check/restart/recreate 类方法挂到 Page 实例上。
 * 这些方法用于:
 * - 应急修复(fix*):身份判定异常时手动纠正
 * - 健康检查(check*):验证连接状态、消息同步、参与者去重等
 * - 重新连接(restart_/recreate_):监听器/会话记录重启
 *
 * 设计要点:
 * - attach 模式(与 message-listener 等 11 个模块一致):整段函数体搬迁,
 *   所有 this.xxx 不动,运行时 this 自然指向 page
 * - 这些方法在 chat.js 内部互相调用 + 被 chat-debug-tools 调用
 * - 无 wxml 绑定,可安全 attach
 *
 * 与 chat-debug-tools.js 的区别:
 * - chat-debug-tools.js:console-only 调试工具(33 个),给开发者排错
 * - recovery-tools.js(本文件):chat.js 内部业务路径调用的应急修复
 *   这两类目前没有完全分清,后续可能合并
 */

/**
 * @param {Object} page - Page 实例
 */
function attach(page) {
    /**
     * 🔥 【双端显示修复】立即修复标题和系统消息
     */
    page.fixBEndDisplayImmediately = function() {
      if (this.isHomogeneousUiMode()) {
        console.log('🔥 [同构UI模式] 跳过B端专用显示修复，复用统一UI状态机');
        return;
      }
      console.log('🔥 [双端显示修复] 开始检查并修复显示问题');
      
      const { isFromInvite, isSender, currentUser } = this.data;
      
      // 🔥 【A端专门处理】A端创建者的显示修复
      if (!isFromInvite && isSender) {
        console.log('🔥 [A端显示修复] 检测到A端用户，修复A端显示');
        
        // 修复A端标题（显示自己的昵称）
        const aEndTitle = currentUser?.nickName || '我';
        wx.setNavigationBarTitle({
          title: aEndTitle
        });
        this.setData({
          dynamicTitle: aEndTitle
        });
        
        // 修复A端系统消息
        this.fixAEndSystemMessage();
        return;
      }
      
      // 🔥 【B端专门处理】B端用户的显示修复
      const isReceiverEnv = this.isReceiverEnvironment();
      if (isReceiverEnv) {
        console.log('🔥 [B端显示修复] 检测到B端用户，修复B端显示');
      } else {
        console.log('🔥 [双端显示修复] 身份不明确，跳过修复');
        return;
      }
      
      console.log('🔥 [B端显示修复] 确认B端身份，开始修复');
      
      // 立即获取参与者信息并更新标题
      this.fetchChatParticipantsWithRealNames();
      
      setTimeout(() => {
        const participants = this.data.participants || [];
        var currentUserOpenId = currentUser?.openId
          || getApp().globalData.userInfo?.openId
          || getApp().globalData.openId
          || wx.getStorageSync('openId');
        
        // 找到A端用户
        const aEndUser = participants.find(p => {
          const pId = p.id || p.openId;
          return pId && pId !== currentUserOpenId;
        });
        
        if (aEndUser && aEndUser.nickName && !['朋友', '邀请者', '用户', '好友'].includes(aEndUser.nickName)) {
          const bEndTitle = `我和${aEndUser.nickName}（2）`;
          console.log('🔥 [B端显示修复] 立即更新B端标题:', bEndTitle);
          
          wx.setNavigationBarTitle({
            title: bEndTitle
          });
          
          this.setData({
            dynamicTitle: bEndTitle
          });
          
          // 同时修复B端系统消息
          this.fixBEndSystemMessage(aEndUser.nickName);
        } else {
          console.log('🔥 [B端显示修复] 暂未获取到真实昵称，等待下次更新');
          
          // 再次延迟尝试
          setTimeout(() => {
            this.fixBEndDisplayImmediately();
          }, 1000);
        }
      }, 800);
    };

    /**
     * 🔧 检查并修复昵称显示问题
     */
    page.checkAndFixNicknames = function() {
       console.log('🔧 [昵称修复] 开始检查昵称显示问题');
       
       const participants = this.data.participants || [];
       const currentUserOpenId = this.data.currentUser?.openId;
       
       console.log('🔧 [昵称修复] 当前参与者数量:', participants.length);
       console.log('🔧 [昵称修复] 参与者列表详情:', participants);
       
       // 🚨 【修复】如果参与者数量异常（>2），先进行去重处理
       if (participants.length > 2) {
         console.log('🔧 [昵称修复] 参与者数量异常，开始去重处理');
         this.deduplicateParticipants();
         return; // 🔥 【防无限循环】去重完成，不再重复调用昵称修复
       }
       
       if (participants.length !== 2) {
         console.log('🔧 [昵称修复] 参与者数量不是2，跳过修复');
         return;
       }
       
       const otherParticipant = participants.find(p => (p.openId || p.id) !== currentUserOpenId);
       
       if (otherParticipant && otherParticipant.nickName === '用户') {
         console.log('🔧 [昵称修复] 发现对方昵称为"用户"，尝试从URL参数或存储修复');
         {
           console.log('🔧 [昵称修复] 尝试从URL参数或本地存储获取正确昵称');
           
           // 🔧 尝试从URL参数获取邀请者信息
           const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
           let correctNickname = null;
           
           if (urlParams.inviter) {
             try {
               correctNickname = decodeURIComponent(decodeURIComponent(urlParams.inviter));
               console.log('🔧 [昵称修复] 从URL参数获取到昵称:', correctNickname);
             } catch (e) {
               console.log('🔧 [昵称修复] URL解码失败:', e);
             }
           }
           
           // 🔧 如果URL中没有，尝试从邀请信息中获取
           if (!correctNickname || correctNickname === '好友' || correctNickname === '朋友') {
             const app = getApp();
             const savedInviteInfo = wx.getStorageSync('inviteInfo');
             if (savedInviteInfo && savedInviteInfo.inviter) {
               correctNickname = savedInviteInfo.inviter;
               console.log('🔧 [昵称修复] 从邀请信息获取到昵称:', correctNickname);
             }
           }
           
           if (correctNickname && correctNickname !== '好友' && correctNickname !== '朋友') {
             console.log('🔧 [昵称修复] 使用获取到的正确昵称进行修复:', correctNickname);
             
             // 更新本地显示
             const updatedParticipants = participants.map(p => {
               if ((p.openId || p.id) === otherParticipant.openId) {
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
             
             // 更新标题
             setTimeout(() => {
               this.updateDynamicTitleWithRealNames();
             }, 100);
             
             // 更新数据库
             this.updateSpecificUserInfo(otherParticipant.openId, correctNickname);
             
             console.log('🔧 [昵称修复] 通用修复完成');
           } else {
             console.log('🔧 [昵称修复] 无法获取正确昵称，触发手动修复流程');
             this.manuallyFixConnection();
           }
         }
       } else {
         console.log('🔧 [昵称修复] 昵称显示正常，无需修复');
       }
     };

    /**
     * 手动修复连接 - 当检测到有消息但参与者未正确连接时调用
     */
    page.manuallyFixConnection = function() {
      console.log('🔧 [手动修复] 开始修复连接问题');
      
      const chatId = this.data.contactId;
      const currentUserOpenId = this.data.currentUser?.openId;
      
      if (!chatId || !currentUserOpenId) {
        console.log('🔧 [手动修复] 缺少必要参数，无法修复');
        return;
      }
      
      // 重新获取参与者信息
      wx.cloud.callFunction({
        name: 'getChatParticipants',
        data: { chatId: chatId },
        success: (res) => {
          console.log('🔧 [手动修复] 获取参与者结果:', res.result);
          
          if (res.result && res.result.success && res.result.participants && res.result.participants.length > 0) {
            const participants = res.result.participants;
            console.log('🔧 [手动修复] 所有参与者详情:', JSON.stringify(participants, null, 2));
            console.log('🔧 [手动修复] 当前用户OpenId:', currentUserOpenId);
            
            const otherParticipants = participants.filter(p => 
              (p.id || p.openId) !== currentUserOpenId
            );
            
            console.log('🔧 [手动修复] 其他参与者数量:', otherParticipants.length);
            console.log('🔧 [手动修复] 其他参与者详情:', JSON.stringify(otherParticipants, null, 2));
            
            if (otherParticipants.length > 0) {
              console.log('🔧 [手动修复] 发现其他参与者，开始数据处理');
              
              const processedParticipants = participants.map(p => {
                const participantOpenId = p.id || p.openId;
                let nickName = p.nickName || p.name || '用户';
                
                return {
                  id: participantOpenId,
                  openId: participantOpenId,
                  nickName: nickName,
                  avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
                  isCreator: p.isCreator || false,
                  isJoiner: p.isJoiner || false,
                  isSelf: participantOpenId === currentUserOpenId
                };
              });
              
              console.log('🔧 [手动修复] 处理后的参与者详情:', JSON.stringify(processedParticipants, null, 2));
              
              // 🔥 强制更新UI，确保数据真的被设置了
              this.setData({
                participants: processedParticipants
              }, () => {
                // 在setData回调中验证数据是否真的更新了
                console.log('🔧 [手动修复] setData回调 - 验证参与者数量:', this.data.participants.length);
                console.log('🔧 [手动修复] setData回调 - 参与者详情:', JSON.stringify(this.data.participants, null, 2));
                
                // 🔥 延迟更新标题，确保participants已真正更新
                setTimeout(() => {
                  console.log('🔧 [手动修复] 开始更新标题 - 当前参与者数量:', this.data.participants.length);
                  this.updateDynamicTitleWithRealNames();
                  
                  // 🔧 手动修复完成的最终验证
                  setTimeout(() => {
                    console.log('🔧 [手动修复] 连接修复完成，最终参与者数量:', this.data.participants.length);
                    console.log('🔧 [手动修复] 连接修复完成，最终标题:', this.data.dynamicTitle);
                    
                    // 如果参与者数量还是1，强制触发消息推断
                    if (this.data.participants.length <= 1) {
                      console.log('🔧 [手动修复] 参与者数量仍异常，强制触发消息推断');
                      this.inferParticipantsFromMessages();
                    }
                  }, 300);
                }, 200);
              });
              
            } else {
              console.log('🔧 [手动修复] 没有发现其他参与者，尝试通过消息推断');
              this.inferParticipantsFromMessages();
            }
          } else {
            console.log('🔧 [手动修复] 数据库中没有参与者信息，尝试通过消息推断');
            this.inferParticipantsFromMessages();
          }
        },
        fail: (err) => {
          console.error('🔧 [手动修复] 获取参与者失败:', err);
          // 网络失败时也尝试通过消息推断
          console.log('🔧 [手动修复] 网络失败，尝试通过消息推断');
          this.inferParticipantsFromMessages();
        }
      });
    };

    /**
     * 🔧 强制修复特定用户的昵称问题
     */
    page.forceFixSpecificUserNicknames = function() {
      console.log('🔧 [强制修复] 开始修复特定用户昵称问题');
      
      const participants = this.data.participants || [];
      const currentUserOpenId = this.data.currentUser?.openId;
      
      // 定义所有用户的正确信息
      const userCorrections = {
        'ojtOs7bmxy-8M5wOTcgrqlYedgyY': {
          nickName: 'Y.',
          avatarUrl: '/assets/images/default-avatar.png'
        },
        'ojtOs7bA8w-ZdS1G_o5rdoeLzWDc': {
          nickName: '向冬',
          avatarUrl: '/assets/images/default-avatar.png'
        },
        // 添加所有相关的本地ID
        'local_1749385086984': {
          nickName: '向冬',
          avatarUrl: '/assets/images/default-avatar.png'
        },
        'local_1749386034798': {
          nickName: '向冬',
          avatarUrl: '/assets/images/default-avatar.png'
        },
        'local_1749386462833': {
          nickName: '向冬',
          avatarUrl: '/assets/images/default-avatar.png'
        },
        'local_1749386777168': {
          nickName: '向冬',
          avatarUrl: '/assets/images/default-avatar.png'
        }
      };
      
      let hasUpdated = false;
      
      // 检查并修复参与者昵称
      const updatedParticipants = participants.map(p => {
        const participantOpenId = p.openId || p.id;
        
        if (userCorrections[participantOpenId]) {
          const correction = userCorrections[participantOpenId];
          console.log(`🔧 [强制修复] 修复用户 ${participantOpenId} 昵称: ${p.nickName} -> ${correction.nickName}`);
          
          hasUpdated = true;
          
          // 同时更新数据库
          this.updateSpecificUserInfo(participantOpenId, correction.nickName);
          
          return {
            ...p,
            nickName: correction.nickName,
            name: correction.nickName,
            avatarUrl: correction.avatarUrl
          };
        }
        
        return p;
      });
      
      if (hasUpdated) {
        // 更新页面数据
        this.setData({
          participants: updatedParticipants
        });
        
        // 更新标题
        setTimeout(() => {
          this.updateDynamicTitleWithRealNames();
          console.log('🔧 [强制修复] 昵称修复完成，标题已更新');
          
          // 显示修复结果
          wx.showToast({
            title: '昵称修复完成',
            icon: 'success'
          });
        }, 100);
      } else {
        console.log('🔧 [强制修复] 未发现需要修复的用户');
        wx.showToast({
          title: '未发现需要修复的用户',
          icon: 'none'
        });
      }
    };

    /**
     * 🚨 【热修复】检查并清除连接状态
     */
    page.checkAndClearConnectionStatus = function() {
      console.log('🚨 [热修复] ==================== 开始检查连接状态 ====================');
      
      const data = this.data;
      console.log('🚨 [热修复] 当前状态:', {
        isCreatingChat: data.isCreatingChat,
        chatCreationStatus: data.chatCreationStatus,
        isLoading: data.isLoading,
        messages: data.messages?.length || 0,
        participants: data.participants?.length || 0
      });
      
      // 检查是否应该清除连接状态
      const shouldClearConnectionStatus = (
        data.isCreatingChat && // 当前显示连接状态
        (
          (data.messages && data.messages.length > 0) || // 已有消息
          (data.participants && data.participants.length > 1) || // 已有多个参与者
          (data.contactId && data.contactId.length > 0) // 已有聊天ID
        )
      );
      
      if (shouldClearConnectionStatus) {
        console.log('🚨 [热修复] 检测到异常连接状态，强制清除');
        
        this.setData({
          isCreatingChat: false,
          chatCreationStatus: '',
          isLoading: false
        });
        
        console.log('🚨 [热修复] ✅ 连接状态已清除');
        
        // 添加成功提示
        // wx.showToast({
        //   title: '连接已建立',
        //   icon: 'success',
        //   duration: 1500
        // });
        console.log('✅ [连接状态] 连接已建立，后台静默完成');
        
      } else if (data.isCreatingChat) {
        console.log('🚨 [热修复] 仍在连接状态，但无异常数据，设置超时清除');
        
        // 设置超时清除，防止无限等待
        setTimeout(() => {
          if (this.data.isCreatingChat) {
            console.log('🚨 [热修复] 超时强制清除连接状态');
            this.setData({
              isCreatingChat: false,
              chatCreationStatus: '连接已建立'
            });
          }
        }, 3000);
        
      } else {
        console.log('🚨 [热修复] 连接状态正常，无需清除');
      }
      
      console.log('🚨 [热修复] ==================== 连接状态检查完成 ====================');
    };

    /**
     * 🆘 【强制参与者修复】强制修复参与者重复问题
     */
    page.forceFixParticipantDuplicates = function() {
      console.log('🆘 [强制修复] ==================== 开始强制修复参与者重复 ====================');
      
      const { participants, currentUser } = this.data;
      const userOpenId = currentUser?.openId;
      
      if (!participants || participants.length <= 2) {
        console.log('🆘 [强制修复] 参与者数量正常，无需强制修复');
        return;
      }
      
      console.log('🆘 [强制修复] 检测到严重的参与者重复问题，参与者数量:', participants.length);
      console.log('🆘 [强制修复] 详细参与者信息:', participants);
      
      // 🔥 【终极去重】使用更严格的去重逻辑
      const finalParticipants = [];
      const processedIds = new Map(); // 使用Map来跟踪处理过的ID
      
      participants.forEach((p, index) => {
        const id1 = p.openId;
        const id2 = p.id;
        
        console.log(`🆘 [强制修复] 处理参与者${index}: openId=${id1}, id=${id2}, nickName=${p.nickName}`);
        
        // 检查所有可能的ID字段
        const possibleIds = [id1, id2].filter(id => id && id.length > 0);
        let shouldAdd = true;
        let finalId = null;
        
        for (const pid of possibleIds) {
          if (processedIds.has(pid)) {
            console.log(`🆘 [强制修复] ID ${pid} 已存在，跳过重复参与者`);
            shouldAdd = false;
            break;
          } else {
            finalId = pid;
          }
        }
        
        if (shouldAdd && finalId) {
          processedIds.set(finalId, true);
          
          // 创建标准化的参与者对象
          const standardizedParticipant = {
            id: finalId,
            openId: finalId,
            nickName: p.nickName || p.name || '用户',
            avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
            isSelf: finalId === userOpenId,
            isCreator: p.isCreator || false,
            isJoiner: p.isJoiner || false
          };
          
          finalParticipants.push(standardizedParticipant);
          console.log(`🆘 [强制修复] ✅ 添加唯一参与者: ${finalId} -> ${standardizedParticipant.nickName}`);
        }
      });
      
      console.log('🆘 [强制修复] 强制去重完成，从', participants.length, '减少到', finalParticipants.length);
      console.log('🆘 [强制修复] 最终参与者列表:', finalParticipants);
      
      // 🔥 【强制更新】立即更新页面数据
      this.setData({
        participants: finalParticipants
      }, () => {
        console.log('🆘 [强制修复] 页面数据更新完成，验证参与者数量:', this.data.participants.length);
        
        // 🔥 【立即更新标题】
        if (finalParticipants.length === 2) {
          const otherParticipant = finalParticipants.find(p => !p.isSelf);
          if (otherParticipant) {
            const newTitle = `我和${otherParticipant.nickName}（2）`;
            console.log('🆘 [强制修复] 更新标题为:', newTitle);
            
            this.setData({
              dynamicTitle: newTitle,
              contactName: newTitle
            });
            
        wx.setNavigationBarTitle({
              title: newTitle,
          success: () => {
                console.log('🆘 [强制修复] ✅ 标题更新成功');
                
                // wx.showToast({
                //   title: '✅ 参与者修复完成',
                //   icon: 'success',
                //   duration: 2000
                // });
                console.log('✅ [参与者修复] 参与者修复完成，后台静默完成');
              }
            });
          }
        } else if (finalParticipants.length === 1) {
          const title = currentUser?.nickName || '我';
          this.setData({
            dynamicTitle: title,
            contactName: title
          });
          wx.setNavigationBarTitle({ title: title });
        }
      });
      
      console.log('🆘 [强制修复] ==================== 强制修复完成 ====================');
    };

    /**
     * 🔥 【消息同步修复】检查并修复消息同步问题
     */
    page.checkAndFixMessageSync = function() {
      console.log('🔄 [消息同步修复] ==================== 开始检查消息同步 ====================');
      
      const { participants, messages, contactId } = this.data;
      
      // 检查是否为双人聊天
      if (participants.length !== 2) {
        console.log('🔄 [消息同步修复] 非双人聊天，跳过消息同步检查');
        return;
      }
      
      // 检查是否有对方发送的消息但自己发送的消息对方收不到
      const userMessages = messages.filter(msg => msg.isSelf && !msg.isSystem);
      const otherMessages = messages.filter(msg => !msg.isSelf && !msg.isSystem);
      
      console.log('🔄 [消息同步修复] 自己的消息数量:', userMessages.length);
      console.log('🔄 [消息同步修复] 对方的消息数量:', otherMessages.length);
      
      if (userMessages.length > 0 && otherMessages.length > 0) {
        console.log('🔄 [消息同步修复] 双方都有消息，同步正常');
        
        // 但是需要检查消息监听器是否正常工作
        if (!this.messageWatcher) {
          console.log('🔄 [消息同步修复] 消息监听器未启动，重新启动');
          this.startMessageListener();
        }
        
        return;
      }
      
      if (userMessages.length > 0 && otherMessages.length === 0) {
        console.log('🔄 [消息同步修复] ⚠️ 检测到消息同步问题：自己有消息但收不到对方消息');
        
        // 重新启动消息监听器
        this.restartMessageListener();
        
        // 重新获取消息
        setTimeout(() => {
          this.fetchMessages();
        }, 1000);
        
      } else if (userMessages.length === 0 && otherMessages.length > 0) {
        console.log('🔄 [消息同步修复] ⚠️ 检测到消息同步问题：收到对方消息但自己发送的消息可能有问题');
        
        // 检查发送消息功能
        this.checkSendMessageFunction();
      }
      
      console.log('🔄 [消息同步修复] ==================== 消息同步检查完成 ====================');
    };

    /**
     * 🔄 重新启动消息监听器
     */
    page.restartMessageListener = function() {
      console.log('🔄 [重启监听器] 重新启动消息监听器');
      
      // 停止当前监听器
      if (this.messageWatcher) {
        this.messageWatcher.close();
        this.messageWatcher = null;
        console.log('🔄 [重启监听器] 已停止旧的消息监听器');
      }
      
      // 延迟重新启动
      setTimeout(() => {
        this.startMessageListener();
        console.log('🔄 [重启监听器] 消息监听器已重新启动');
      }, 500);
    };

    /**
     * 🔄 检查发送消息功能
     */
    page.checkSendMessageFunction = function() {
      console.log('🔄 [发送检查] 检查发送消息功能');
      
      const { contactId, currentUser } = this.data;
      
      if (!contactId) {
        console.log('🔄 [发送检查] 缺少聊天ID');
        return;
      }
      
      if (!currentUser || !currentUser.openId) {
        console.log('🔄 [发送检查] 缺少用户信息');
        return;
      }
      
      console.log('🔄 [发送检查] 发送消息功能检查完成，基本参数正常');
      
      // 可以添加测试消息发送功能
      // this.sendTestMessage();
    };

    /**
     * 🔧 修复消息发送问题
     */
    page.fixMessageSending = function() {
      console.log('🔧 [消息发送修复] ==================== 开始修复消息发送问题 ====================');
      
      const chatId = this.data.contactId;
      const currentUser = this.data.currentUser;
      const participants = this.data.participants || [];
      const messages = this.data.messages || [];
      
      console.log('🔧 [消息发送修复] 当前聊天ID:', chatId);
      console.log('🔧 [消息发送修复] 当前用户:', currentUser);
      console.log('🔧 [消息发送修复] 参与者数量:', participants.length);
      console.log('🔧 [消息发送修复] 消息数量:', messages.length);
      console.log('🔧 [消息发送修复] 参与者详情:', JSON.stringify(participants, null, 2));
      
      // 🔥 【新聊天检测】如果只有系统消息，说明是新聊天
      const hasUserMessages = messages.some(msg => msg.senderId !== 'system');
      const isNewChat = !hasUserMessages && participants.length === 1;
      
      if (isNewChat) {
        console.log('🔧 [消息发送修复] ✅ 检测到这是新聊天，消息发送功能正常');
        // wx.showToast({
        //   title: '✅ 新聊天状态正常',
        //   icon: 'success'
        // });
        console.log('✅ [新聊天检测] 新聊天状态正常，后台静默完成');
        return;
      }
      
      // 检查参与者数据完整性
      const currentUserInParticipants = participants.find(p => 
        (p.id || p.openId) === currentUser.openId
      );
      
      if (!currentUserInParticipants) {
        console.log('🔧 [消息发送修复] 当前用户不在参与者列表中，这可能导致消息发送问题');
        
        // 强制添加当前用户到参与者列表
        const updatedParticipants = [...participants];
        updatedParticipants.push({
          id: currentUser.openId,
          openId: currentUser.openId,
          nickName: currentUser.nickName,
          avatarUrl: currentUser.avatarUrl,
          isSelf: true,
          isCreator: true
        });
        
        this.setData({
          participants: updatedParticipants
        }, () => {
          console.log('🔧 [消息发送修复] 已添加当前用户到参与者列表');
          this.syncParticipantsToDatabase(updatedParticipants);
        });
      }
      
      // 检查聊天记录是否存在
      wx.cloud.callFunction({
        name: 'getMessages',
        data: {
          chatId: chatId,
          limit: 1
        },
        success: (res) => {
          console.log('🔧 [消息发送修复] 聊天记录检查结果:', res.result);
          
          if (!res.result || !res.result.success) {
            console.log('🔧 [消息发送修复] 聊天记录可能不存在，尝试重新创建');
            this.recreateChatRecord();
          } else {
            console.log('🔧 [消息发送修复] 聊天记录存在，检查参与者权限');
            this.checkMessagePermissions();
          }
          },
          fail: (err) => {
          console.error('🔧 [消息发送修复] 检查聊天记录失败:', err);
          this.recreateChatRecord();
        }
      });
    };

    /**
     * 🔧 重新创建聊天记录
     */
    page.recreateChatRecord = function() {
      console.log('🔧 [重新创建] 开始重新创建聊天记录');
      
      const chatId = this.data.contactId;
      const currentUser = this.data.currentUser;
      
      wx.cloud.callFunction({
        name: 'createChat',
        data: {
          chatId: chatId,
          creatorOpenId: currentUser.openId,
          creatorInfo: {
            nickName: currentUser.nickName,
            avatarUrl: currentUser.avatarUrl
          }
        },
        success: (res) => {
          console.log('🔧 [重新创建] 聊天记录创建成功:', res.result);
          
          // wx.showToast({
          //   title: '🔧 聊天记录已修复',
          //   icon: 'success'
          // });
          console.log('🔧 [聊天记录修复] 聊天记录已修复，后台静默完成');
          
          // 重新获取消息
          setTimeout(() => {
            this.fetchMessages();
          }, 1000);
        },
        fail: (err) => {
          console.error('🔧 [重新创建] 聊天记录创建失败:', err);
          // wx.showToast({
          //   title: '修复失败，请重试',
          //   icon: 'error'
          // });
          console.log('❌ [聊天记录修复] 修复失败，后台静默记录');
        }
      });
    };

    /**
     * 🔧 检查消息权限
     */
    page.checkMessagePermissions = function() {
      console.log('🔧 [权限检查] 开始检查消息发送权限');
      
      // 尝试发送一条测试消息
      const testMessage = {
        chatId: this.data.contactId,
        content: '[系统测试消息]',
        senderId: this.data.currentUser.openId,
        senderInfo: {
          nickName: this.data.currentUser.nickName,
          avatarUrl: this.data.currentUser.avatarUrl
        },
        sendTime: new Date(),
        type: 'system'
      };
      
      wx.cloud.callFunction({
        name: 'sendMessage',
        data: testMessage,
        success: (res) => {
          console.log('🔧 [权限检查] 测试消息发送成功:', res.result);
          
          // 立即删除测试消息
          if (res.result && res.result.messageId) {
            wx.cloud.callFunction({
              name: 'destroyMessage',
              data: {
                messageId: res.result.messageId
              },
              success: () => {
                console.log('🔧 [权限检查] 测试消息已删除');
              }
            });
          }
          
          // wx.showToast({
          //   title: '✅ 消息发送权限正常',
          //   icon: 'success'
          // });
          console.log('✅ [权限检查] 消息发送权限正常，后台静默完成');
        },
        fail: (err) => {
          console.error('🔧 [权限检查] 测试消息发送失败:', err);
          
          // wx.showModal({
          //   title: '消息发送异常',
          //   content: `检测到消息发送权限问题：\n${err.message || '未知错误'}\n\n是否尝试修复？`,
          //   confirmText: '修复',
          //   cancelText: '稍后',
          //   success: (res) => {
          //     if (res.confirm) {
          //       this.recreateChatRecord();
          //     }
          //   }
          // });
          console.log('❌ [权限检查] 消息发送权限异常，后台静默记录:', err.message || '未知错误');
          // 后台静默自动尝试修复
          this.recreateChatRecord();
        }
      });
    };
}

module.exports = { attach };
