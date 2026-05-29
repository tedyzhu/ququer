/**
 * 参与者推断子系统
 *
 * 通过 attach(page) 把 inferParticipantsFromMessages / syncInferredParticipantsToDatabase
 * 挂到 Page 实例上。
 *
 * 设计要点:
 * - attach 模式(与 message-listener / message-fetch 一致):整段函数体搬迁,所有 this 不动
 * - 这两个方法是云端 participants 缺失/不完整时的兜底逻辑:
 *     inferParticipantsFromMessages — 从消息历史反推参与者,根据 senderId 唯一性聚合
 *     syncInferredParticipantsToDatabase — 把推断结果同步到云端 conversations 表
 * - 无 wxml 绑定,可安全使用 attach 模式
 */

/**
 * @param {Object} page - Page 实例
 */
function attach(page) {
    /**
     * 通过消息推断参与者 - 当无法从数据库获取参与者时的备用方案
     */
    page.inferParticipantsFromMessages = function() {
      console.log('🔧 [推断参与者] ==================== 开始通过消息推断参与者 ====================');
      
      const messages = this.data.messages || [];
      const app = getApp();
      const currentUserOpenId = app.globalData.userInfo.openId;
      const uniqueParticipants = new Map();
      
      console.log('🔧 [推断参与者] 当前消息数量:', messages.length);
      console.log('🔧 [推断参与者] 当前用户OpenId:', currentUserOpenId);
      
      // 添加当前用户
      uniqueParticipants.set(currentUserOpenId, {
        id: currentUserOpenId,
        openId: currentUserOpenId,
        nickName: app.globalData.userInfo.nickName,
        avatarUrl: app.globalData.userInfo.avatarUrl,
        isSelf: true
      });
      
      // 收集所有非自己的发送者ID
      const otherSenderIds = [];
      messages.forEach(msg => {
        if (msg.senderId && 
            msg.senderId !== currentUserOpenId && 
            msg.senderId !== 'system' && 
            msg.senderId !== 'self' &&
            otherSenderIds.indexOf(msg.senderId) === -1) {
          otherSenderIds.push(msg.senderId);
        }
      });
      
      console.log('🔧 [推断参与者] 发现的其他发送者IDs:', otherSenderIds);
      
      // 为每个其他发送者推断参与者信息
      otherSenderIds.forEach((senderId, index) => {
        // 🔥 智能推断参与者昵称
        let inferredNickName = '朋友';
        
        // 🔥 尝试从URL参数推断邀请者昵称
        try {
          const pages = getCurrentPages();
          if (pages.length > 0) {
            const currentPage = pages[pages.length - 1];
            const options = currentPage.options || {};
            
            console.log('🔧 [推断参与者] URL参数:', options);
            
            // 优先从inviter参数获取
            if (options.inviter) {
              try {
                const decodedInviter = decodeURIComponent(decodeURIComponent(options.inviter));
                if (decodedInviter && decodedInviter !== '朋友' && decodedInviter !== '邀请者' && decodedInviter !== '好友') {
                  inferredNickName = decodedInviter;
                  console.log('🔧 [推断参与者] 从inviter参数推断昵称:', inferredNickName);
                }
              } catch (e) {
                // 如果双重解码失败，尝试单次解码
                try {
                  const singleDecoded = decodeURIComponent(options.inviter);
                  if (singleDecoded && singleDecoded !== '朋友' && singleDecoded !== '邀请者' && singleDecoded !== '好友') {
                    inferredNickName = singleDecoded;
                    console.log('🔧 [推断参与者] 从inviter参数单次解码推断昵称:', inferredNickName);
                  }
                } catch (e2) {
                  console.log('🔧 [推断参与者] inviter参数解码失败');
                }
              }
            }
            
            // 备选：从userName参数获取
            if (inferredNickName === '朋友' && options.userName) {
              try {
                const decodedUserName = decodeURIComponent(decodeURIComponent(options.userName));
                if (decodedUserName && decodedUserName !== '用户' && decodedUserName !== '朋友' && decodedUserName !== '好友') {
                  inferredNickName = decodedUserName;
                  console.log('🔧 [推断参与者] 从userName参数推断昵称:', inferredNickName);
                }
              } catch (e) {
                // 如果双重解码失败，尝试单次解码
                try {
                  const singleDecoded = decodeURIComponent(options.userName);
                  if (singleDecoded && singleDecoded !== '用户' && singleDecoded !== '朋友' && singleDecoded !== '好友') {
                    inferredNickName = singleDecoded;
                    console.log('🔧 [推断参与者] 从userName参数单次解码推断昵称:', inferredNickName);
                  }
                } catch (e2) {
                  console.log('🔧 [推断参与者] userName参数解码失败');
                }
              }
            }
          }
        } catch (e) {
          console.log('🔧 [推断参与者] 从URL推断昵称失败，使用默认值:', e);
        }
        
        // 推断参与者信息
        uniqueParticipants.set(senderId, {
          id: senderId,
          openId: senderId,
          nickName: inferredNickName,
          avatarUrl: '/assets/images/default-avatar.png',
          isSelf: false
        });
        
        console.log('🔧 [推断参与者] 推断出新参与者:', senderId, '->', inferredNickName);
      });
      
      const inferredParticipants = Array.from(uniqueParticipants.values());
      console.log('🔧 [推断参与者] 推断出的参与者列表详情:', JSON.stringify(inferredParticipants, null, 2));
      
      // 🔥 【关键修复】确保当前用户在推断的参与者列表中
      const currentUserExists = inferredParticipants.some(p => 
        (p.id || p.openId) === currentUserOpenId
      );
      
      if (!currentUserExists) {
        console.log('🔧 [推断参与者] 当前用户不在推断列表中，添加当前用户');
        inferredParticipants.push({
          id: currentUserOpenId,
          openId: currentUserOpenId,
          nickName: app.globalData.userInfo.nickName,
          avatarUrl: app.globalData.userInfo.avatarUrl,
          isSelf: true
        });
      }
      
      console.log('🔧 [推断参与者] 最终推断的参与者列表:', JSON.stringify(inferredParticipants, null, 2));
      
      if (inferredParticipants.length > 1) {
        console.log('🔧 [推断参与者] ✅ 成功推断出', inferredParticipants.length, '个参与者，开始更新UI');
        
        // 🔥 立即更新参与者列表
        this.setData({
          participants: inferredParticipants
        }, () => {
          console.log('🔧 [推断参与者] setData回调 - 验证参与者已更新，数量:', this.data.participants.length);
          
          // 🔥 强制更新标题并显示双人模式
          setTimeout(() => {
            console.log('🔧 [推断参与者] 开始更新标题');
            this.updateDynamicTitleWithRealNames();
            
            // 🔗 [连接提示修复] 移除Toast提示，避免干扰用户体验
            // wx.showToast({
            //   title: '🎉 连接已恢复',
            //   icon: 'success',
            //   duration: 2000
            // });
            console.log('🔗 [连接提示修复] ✅ 连接已恢复，静默记录结果');
            
            console.log('🔧 [推断参与者] ✅ 通过消息推断完成，参与者数量:', this.data.participants.length);
            console.log('🔧 [推断参与者] ✅ 标题应已更新:', this.data.dynamicTitle);
          }, 100);
        });
        
        // 🔥 同步推断结果到数据库conversations集合
        this.syncInferredParticipantsToDatabase(inferredParticipants);
        
      } else {
        console.log('🔧 [推断参与者] ❌ 未能推断出其他参与者，可能消息都是自己发的');
        console.log('🔧 [推断参与者] 消息发送者统计:');
        messages.forEach((msg, index) => {
          console.log(`🔧 [推断参与者] 消息${index + 1}: 发送者=${msg.senderId}, 内容="${msg.content}"`);
        });
      }
      
      console.log('🔧 [推断参与者] ==================== 推断参与者流程结束 ====================');
    };

    /**
     * 🔥 同步推断的参与者信息到数据库
     */
    page.syncInferredParticipantsToDatabase = function(participants) {
      const chatId = this.data.contactId;
      if (!chatId) return;
      
      console.log('🔧 [数据库同步] 开始同步推断的参与者到数据库');
      
      // 调用云函数更新conversations集合的participants字段
      wx.cloud.callFunction({
        name: 'updateConversationParticipants',
        data: {
          chatId: chatId,
          participants: participants
        },
        success: (res) => {
          if (res.result && res.result.success) {
            console.log('🔧 [数据库同步] ✅ 参与者信息同步成功');
          } else {
            console.log('🔧 [数据库同步] ❌ 参与者信息同步失败:', res.result?.error);
          }
        },
        fail: (err) => {
          console.error('🔧 [数据库同步] ❌ 调用同步云函数失败:', err);
        }
      });
    };
}

module.exports = { attach };
