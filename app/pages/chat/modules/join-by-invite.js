/**
 * 接收方加入聊天子系统
 *
 * 通过 attach(page) 把 joinChatByInvite 挂到 Page 实例上。
 *
 * 设计要点:
 * - attach 模式(与 message-listener / message-fetch / participant-infer 一致):
 *   整段函数体搬迁,所有 this 不动
 * - joinChatByInvite 是 B 端从邀请链接进入时被 identity-resolver 调用的入口
 * - 内部职责:
 *   - 兜底用户信息(从 wx.storage / app.globalData 恢复)
 *   - 调云函数 joinByInvite 加入聊天
 *   - 加入成功:确认 B 端身份,设置标题(立即 + 800ms 保险),清理错误 A 端消息,
 *     重启消息监听,更新参与者列表,延迟拉取消息合并
 *   - 加入失败:走 addSystemMessage 显示错误
 *
 * 已知技术债(本次保留不修):
 * - 加入成功路径含多个 setTimeout(100/200/500/800/1000/1500)和复杂回调嵌套,
 *   后续可整理为 Promise 链或显式状态机
 * - 邀请者名称解码 + 占位符过滤逻辑在多处重复(可提取 normalizeInviterName 工具)
 */

/**
 * @param {Object} page - Page 实例
 */
function attach(page) {
    /**
     * 被邀请者加入聊天
     */
    page.joinChatByInvite = function(chatId, inviter) {
      console.log('🔗 [被邀请者] 开始加入聊天, chatId:', chatId, 'inviter:', inviter);
      
      const app = getApp();
      let userInfo = this.data.currentUser || app.globalData.userInfo;
      
      // 如果没有用户信息，使用默认信息
      if (!userInfo || !userInfo.openId) {
        const storedUserInfo = wx.getStorageSync('userInfo');
        const storedOpenId = wx.getStorageSync('openId');
        
            userInfo = {
          openId: storedOpenId || app.globalData.openId || 'local_' + Date.now(),
          nickName: storedUserInfo?.nickName || app.globalData.userInfo?.nickName || '用户',
          avatarUrl: storedUserInfo?.avatarUrl || app.globalData.userInfo?.avatarUrl || '/assets/images/default-avatar.png'
        };
        
        // 更新页面数据
        this.setData({
          currentUser: userInfo
        });
      }
      
      console.log('🔗 [被邀请者] 最终用户信息:', userInfo);
      
      // 🔥 先更新基本信息，但标题遵循规则：未满2人时显示自己的昵称
      const inviterName = decodeURIComponent(decodeURIComponent(inviter)) || '好友'; // 🔧 双重解码修复
      const selfNickname = (userInfo && userInfo.nickName) || getApp().globalData.userInfo?.nickName || '我';
      this.setData({
        contactName: `与${inviterName}的聊天`,
        dynamicTitle: selfNickname
      });
      
      // 🔧 【系统提示优化】不再显示"正在加入聊天..."，直接等待成功后显示
      // this.addSystemMessage('正在加入聊天...');
      
      // 调用云函数加入聊天
      wx.cloud.callFunction({
        name: 'joinByInvite',
        data: {
          chatId: chatId,
          // 🔧 传递邀请者昵称给云函数
          inviterNickName: inviterName,
          joiner: {
            openId: userInfo.openId || app.globalData.openId,
            nickName: userInfo.nickName || '用户',
            avatarUrl: userInfo.avatarUrl
          }
        },
        success: (res) => {
          console.log('🔗 [被邀请者] 加入聊天成功:', res.result);
          
          // ⚡ 【热修复】立即强制清除连接状态，不管任何条件
          this.setData({
            isCreatingChat: false,
            chatCreationStatus: '',
            isLoading: false
          });
          console.log('🚨 [热修复] 连接状态已在success回调开始时立即清除');
          
          if (res.result && res.result.success) {
            
            // 🔥 【CRITICAL-FIX-v4】B端加入成功后，立即设置正确的标题和身份
            console.log('🔥 [B端标题修复-v4] 开始B端身份确认和标题设置');
            console.log('🔥 [B端标题修复-v4] 邀请者名称:', inviterName);
            console.log('🔥 [B端标题修复-v4] 当前isFromInvite状态:', this.data.isFromInvite);
            
            // 🔥 【关键修复】确保邀请者名称正确解码
            let decodedInviterName = inviterName;
            try {
              if (inviterName && inviterName.includes('%')) {
                decodedInviterName = decodeURIComponent(decodeURIComponent(inviterName));
                console.log('🔥 [B端标题修复-v4] 双重解码邀请者名称:', decodedInviterName);
              }
            } catch (e) {
              console.log('🔥 [B端标题修复-v4] 解码失败，使用原始名称:', inviterName);
              decodedInviterName = inviterName;
            }
            
            // 🔥 【关键修复】确保邀请者名称不为空
            if (!decodedInviterName || decodedInviterName === '邀请者' || decodedInviterName === 'undefined') {
              decodedInviterName = '朋友'; // 使用通用名称
              console.log('🔥 [B端标题修复-v4] 使用备用邀请者名称:', decodedInviterName);
            }
            
            // 🔥 【修正】加入成功后再切换为双人标题；此处仅记录身份，标题在参与者到位后由统一逻辑更新
            const immediateTitle = this.data.dynamicTitle; // 保持当前（自己昵称）
            
            // 🔥 仅更新身份标记，不强制覆盖标题
            this.setData({
              isFromInvite: true, // 确保B端身份
              isSender: false,    // 明确标记为接收方
              // 🔥 标记B端已加入，防止重复处理
              hasJoinedAsReceiver: true,
              joinedTimestamp: Date.now()
            });
            
            console.log('🔥 [B端标题修复-v1.3.71] ✅ 身份设置完成，开始立即刷新标题');
            
            // 🔥 【HOTFIX-v1.3.71】简化B端标题刷新机制，立即刷新+单次保险
            console.log('🔥 [B端立即刷新-v1.3.71] 立即获取参与者信息并更新B端标题');
            this.fetchChatParticipantsWithRealNames();
            
            // 🔥 【HOTFIX-v1.3.71】单次保险刷新，确保B端标题及时正确
            setTimeout(() => {
              console.log('🔥 [B端立即刷新-保险-v1.3.71] 单次保险刷新，确保最终正确');
              this.fetchChatParticipantsWithRealNames();
            }, 800);
            
            // 🔥 【B端立即标题】额外的立即标题设置，确保B端标题即使在参与者信息未加载前也正确显示
            // 收敛(L140 区):统一调权威检测器(原仅判 '朋友'/'邀请者' 两项)
            if (decodedInviterName && !this.isPlaceholderNickname(decodedInviterName)) {
              const immediateTitle = `我和${decodedInviterName}（2）`;
              console.log('🔥 [B端立即标题] 设置立即标题:', immediateTitle);
              wx.setNavigationBarTitle({
                title: immediateTitle
              });
              this.setData({
                dynamicTitle: immediateTitle
              });
            }
            
            // 🔥 【HOTFIX-v1.3.71】简化B端系统消息处理 - 统一由fetchChatParticipantsWithRealNames处理
            // 移除复杂的多次重试逻辑，避免重复调用和延迟
            console.log('🔥 [HOTFIX-v1.3.71] B端标题和系统消息统一由fetchChatParticipantsWithRealNames处理');
            
            // 🔥 【策略】只在有真实昵称时立即设置标题，系统消息完全交给fetchChatParticipantsWithRealNames
            // 收敛(S5):统一调权威检测器(原 inline 数组)
            if (decodedInviterName && !this.isPlaceholderNickname(decodedInviterName)) {
              console.log('🔥 [HOTFIX-v1.3.71-立即] ✅ 检测到真实昵称，立即设置标题');
              const immediateTitle = `我和${decodedInviterName}（2）`;
              wx.setNavigationBarTitle({ title: immediateTitle });
              this.setData({
                dynamicTitle: immediateTitle,
                contactName: immediateTitle,
                chatTitle: immediateTitle
              });
            }
            
            // 🔥 【移除】原有的多次重试逻辑已移除，统一由上方的fetchChatParticipantsWithRealNames处理

                  // 🔥 【HOTFIX-v1.3.56】修复B端系统消息错误 - 强化身份检查逻辑
        // 【关键修复】仅A端（创建者）才添加系统消息，避免B端误添加
        try {
          const isCreator = !this.data.isFromInvite;
          
          // 🔥 【核心修复】额外检查：如果是通过邀请加入的，强制确认为B端，绝不添加A端消息
          const isJoinByInvite = chatId && inviter;
          const hasInviteParams = inviter || this.data.inviter;
          
          console.log('🔥 [身份验证] isFromInvite:', this.data.isFromInvite);
          console.log('🔥 [身份验证] isCreator:', isCreator);
          console.log('🔥 [身份验证] isJoinByInvite:', isJoinByInvite);
          console.log('🔥 [身份验证] hasInviteParams:', hasInviteParams);
          
          // 🔥 如果有任何邀请迹象，强制设为B端，不添加A端消息
          if (hasInviteParams || isJoinByInvite) {
            console.log('🔥 [B端强制确认] 检测到邀请参数，强制确认为B端身份，跳过A端系统消息');
            // 强制更新身份状态
            this.setData({
              isFromInvite: true,
              isSender: false
            });
          } else if (isCreator) {
            console.log('🔥 [A端系统消息] 检测到A端身份，准备添加/更新系统消息');
            
            // 仅当当前消息列表还没有创建消息时添加
            const hasCreator = (this.data.messages || []).some(m => m.isSystem && m.content && m.content.includes('您创建了私密聊天'));
            if (!hasCreator) {
              this.addCreatorSystemMessage();
            }
            
            // 🔥 【关键修复】当B端加入时，A端将创建消息替换为加入消息
            setTimeout(() => {
              const updatedParticipants = res.result.participants || [];
              if (updatedParticipants.length >= 2) {
                // 找到B端参与者
                const currentUserOpenId = userInfo.openId || app.globalData.openId;
                const bSideParticipant = updatedParticipants.find(p => 
                  (p.id || p.openId) !== currentUserOpenId
                );
                
                if (bSideParticipant) {
                  const bSideName = bSideParticipant.nickName || bSideParticipant.name || '好友';
                  console.log('🔥 [A端系统消息] B端已加入，替换创建消息为加入消息:', bSideName);
                  this.replaceCreatorMessageWithJoinMessage(bSideName);
                }
              }
            }, 800);
          } else {
            console.log('🔥 [B端确认] 检测到B端身份，不添加A端系统消息');
          }
          
          // 🔥 【HOTFIX-v1.3.57】B端身份二次确认：只清理错误消息，不重复添加
          if (hasInviteParams || isJoinByInvite) {
            console.log('🔥 [B端二次确认] 开始清理可能存在的错误A端消息');
            setTimeout(() => {
              this.cleanupWrongSystemMessages();
              // 🔥 不再重复调用updateSystemMessageAfterJoin，避免重复消息
              console.log('🔥 [B端二次确认] 清理完成，B端系统消息将由主流程处理');
            }, 100);
          }
        } catch (e) {
          console.error('🔥 [系统消息错误]', e);
        }
            
            // 🔥 【系统消息修复-v2】B端加入后额外清理任何遗留的错误消息
            setTimeout(() => {
              this.cleanupWrongSystemMessages();
            }, 200);
            
            // 🔥 【消息收发修复】确保接收方能收到发送方的消息
            console.log('🔧 [接收方修复] 强制重启消息监听器，确保能收到发送方消息');
            this.stopMessageListener();
            setTimeout(() => {
              this.startMessageListener();
              console.log('🔧 [接收方修复] 消息监听器重启完成');
            }, 500);
            
            // 🔥 立即更新参与者信息（从云函数返回的数据中获取）
            if (res.result.participants && res.result.participants.length > 0) {
              const currentUserOpenId = userInfo.openId || app.globalData.openId;
              
              // 🔥 【CRITICAL-FIX-v4】标准化参与者数据 - 修复B端标题显示"用户"问题
              const decodedInviterName = inviterName || (inviter ? decodeURIComponent(decodeURIComponent(inviter)) : null) || '好友';
              console.log('🔥 [B端参与者数据] 解码后的邀请者名称:', decodedInviterName);
              
              const normalizedParticipants = res.result.participants.map(p => ({
                id: p.id || p.openId,
                openId: p.id || p.openId,
                nickName: p.nickName || p.name || (p.id === currentUserOpenId ? userInfo.nickName : decodedInviterName) || '朋友',
                avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
                isSelf: (p.id || p.openId) === currentUserOpenId,
                isCreator: p.isCreator || false,
                isJoiner: p.isJoiner || false
              }));
              
              // 🔥 特别处理：确保邀请者（对方）的昵称和头像正确显示
              const inviterNickName = decodeURIComponent(decodeURIComponent(inviter)) || '好友'; // 🔧 双重解码修复
              const processedParticipants = normalizedParticipants.map(p => {
                if (!p.isSelf) {
                  // 这是邀请者，使用URL中的昵称，但保持原有头像（如果有的话）
                  return {
                    ...p,
                    nickName: inviterNickName,
                    name: inviterNickName,
                    avatarUrl: p.avatarUrl || '/assets/images/default-avatar.png' // 🔧 保持原有头像或使用默认头像
                  };
                }
                return p;
              });
              
              console.log('🔗 [被邀请者] 立即更新参与者信息:', processedParticipants);
              console.log('🔗 [被邀请者] 邀请者昵称:', inviterNickName);
              
              this.setData({
                participants: processedParticipants
              });
              
              // 🔥 立即更新标题，使用真实的参与者昵称（接收方专用逻辑）
              setTimeout(() => {
                // 🔥 【修复b端标题】优先使用URL中的邀请者昵称
                const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
                let finalInviterName = inviterNickName;
                
                if (urlParams.inviter) {
                  try {
                    const urlInviter = decodeURIComponent(decodeURIComponent(urlParams.inviter));
                    if (urlInviter && 
                        urlInviter !== '朋友' && 
                        urlInviter !== '好友' && 
                        urlInviter !== '邀请者' && 
                        urlInviter !== '用户') {
                      finalInviterName = urlInviter;
                      console.log('🔗 [被邀请者] 使用URL中的真实邀请者昵称:', finalInviterName);
                    }
                  } catch (e) {
                    console.log('🔗 [被邀请者] URL解码失败，使用传入的昵称');
                  }
                }
                
                // 直接设置标题，不经过复杂的函数链
                const receiverTitle = `我和${finalInviterName}（2）`;
                console.log('🔗 [被邀请者] 设置接收方标题:', receiverTitle);
                
                this.setData({
                  dynamicTitle: receiverTitle,
                  contactName: receiverTitle,
                  chatTitle: receiverTitle
                });
                
                wx.setNavigationBarTitle({
                  title: receiverTitle,
                  success: () => {
                    console.log('🔗 [被邀请者] ✅ 接收方标题设置成功:', receiverTitle);
                  }
                });
              }, 100);
            }
            
            // 延迟获取聊天记录和参与者信息，确保数据库已更新
            setTimeout(() => {
              this.fetchMessagesAndMerge(); // 使用新的方法来合并消息
              
              // 🔥 启动实时监听（增强版）
              this.startMessageListener();
              
              // 🔧 【消息收发修复】启动轮询备份，确保消息同步
              this.startPollingMessages();
              
              // 🔥 强制更新用户信息到数据库，确保后续查询能获取到正确信息
              this.updateUserInfoInDatabase();
              
              // 🔥 强制刷新参与者信息，获取发送方的真实头像
              setTimeout(() => {
                this.fetchChatParticipantsWithRealNames();
                
                // 🔗 再次确保接收方标题正确
                const inviterName = decodeURIComponent(decodeURIComponent(inviter)) || '邀请者';
                // 仅接收方才允许调用接收方标题更新
                if (this.data.isFromInvite) {
                  this.updateTitleForReceiver(inviterName);
                }
              }, 1500);
            }, 1000);
            
          } else {
            console.error('🔗 [被邀请者] 加入聊天失败:', res.result?.error);
            this.addSystemMessage('加入聊天失败，请重试', { autoFadeStaySeconds: 3, fadeSeconds: 5 });
          }
        },
        fail: (err) => {
          console.error('🔗 [被邀请者] 调用joinByInvite失败:', err);
          this.addSystemMessage('网络错误，加入聊天失败', { autoFadeStaySeconds: 3, fadeSeconds: 5 });
        }
      });
    };
}

module.exports = { attach };
