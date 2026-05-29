/**
 * 消息拉取子系统
 *
 * 通过 attach(page) 把 fetchMessages / fetchMessagesAndMerge 挂到 Page 实例上。
 *
 * 设计要点:
 * - attach 模式(与 message-listener.js 一致):整段函数体搬迁,所有 this 不动,
 *   函数被挂到 page 上后运行时 this 自然指向 page,行为零差异
 * - 两个方法的核心职责:
 *     fetchMessages — 全量拉取 + 完整 B 端过滤 + 销毁状态合并 + watcher 友好的非破坏合并
 *     fetchMessagesAndMerge — 接收方加入后 fast-path 拉取,合并本地系统消息,简化的 B 端过滤
 *
 * 已知技术债(本次保留不修):
 * - 两个方法的 B 端系统消息过滤逻辑高度重复,后续可提取共用函数到 chat-helpers
 * - 时间戳归一化逻辑(4 个分支)在两处都有副本,可提取 normalizeTimestamp(rawTs)
 */

const ChatHelpers = require('./chat-helpers.js');
const { isPlaceholderJoinMessage, isSystemLikeMessage, normalizeTimestamp } = ChatHelpers;

/**
 * @param {Object} page - Page 实例
 */
function attach(page) {
    /**
     * 获取聊天记录并合并本地消息（用于接收方加入后）
     */
    page.fetchMessagesAndMerge = function() {
      const that = this;
      
      console.log('🔍 获取聊天记录并合并本地消息，chatId:', that.data.contactId);
      
      // 保存当前的本地消息（特别是刚添加的系统消息）
      const localMessages = that.data.messages || [];
      const localSystemMessages = localMessages.filter(msg => 
        msg.isSystem && msg.id && msg.id.startsWith('sys_')
      );
      
      console.log('🔍 保存的本地系统消息:', localSystemMessages);
      
      // 🔥 修改：后台静默获取消息，不显示加载气泡
      console.log('🔍 开始后台静默获取历史消息...');
      
      // 使用云函数获取消息
      wx.cloud.callFunction({
        name: 'getMessages',
        data: {
          chatId: that.data.contactId
        },
        success: res => {
          console.log('🔍 获取消息成功', res);
          wx.hideLoading();
          
          if (res.result && res.result.success) {
            // 处理服务器消息数据
            const serverMessages = res.result.messages.map(msg => {
              const currentUserOpenId = getApp().globalData.userInfo.openId || getApp().globalData.openId;
              const isSelf = that.isMessageFromCurrentUser(msg.senderId, currentUserOpenId);
              const resolvedServerId = msg._id || msg.id || '';
              if (!resolvedServerId) {
                console.warn('🔍 [历史消息] 跳过无ID消息，避免列表key冲突:', msg.content);
                return null;
              }
              
              // 🔥 获取正确的头像
              let avatar = '/assets/images/default-avatar.png';
              if (msg.type === 'system') {
                avatar = '/assets/images/default-avatar.png';
              } else if (isSelf) {
                // 🔥 【B端头像修复】B端自己的消息不显示头像
                const isFromInvite = (typeof that.isReceiverEnvironment === 'function')
                  ? that.isReceiverEnvironment()
                  : !!that.data.isFromInvite;
                if (isFromInvite) {
                  // B端用户自己发送的消息，不设置头像
                  avatar = null;
                  console.log('🔥 [B端头像修复] B端自己发送的消息，移除头像显示');
                } else {
                  // A端用户自己的头像
                  avatar = that.data.currentUser?.avatarUrl || getApp().globalData.userInfo?.avatarUrl || '/assets/images/default-avatar.png';
                }
              } else {
                // 对方的头像，从参与者列表中查找
                const sender = that.data.participants.find(p => 
                  p.openId === msg.senderId || p.id === msg.senderId
                );
                avatar = sender?.avatarUrl || sender?.avatar || '/assets/images/default-avatar.png';
                
                // 🔥 如果参与者列表中没有找到，尝试从URL参数获取邀请者信息
                if (!sender || avatar === '/assets/images/default-avatar.png') {
                  const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
                  if (urlParams.inviter) {
                    // 使用默认头像，但保留真实昵称用于标题显示
                    avatar = '/assets/images/default-avatar.png';
                  }
                }
              }
              
              // 保留原始数值时间戳(详见 chat-helpers.js#normalizeTimestamp)
              const numericTs = normalizeTimestamp(msg.sendTime || msg._createTime);

              return {
                id: resolvedServerId,
                senderId: msg.senderId,
                originalSenderId: msg.senderId,
                isSelf: isSelf,
                content: msg.content,
                type: msg.type,
                duration: msg.duration || 0,
                time: that.formatTime(new Date(msg.sendTime)),
                timeDisplay: that.formatTime(new Date(msg.sendTime)),
                timestamp: numericTs,
                sendTime: numericTs,
                showTime: true,
                status: msg.status,
                destroyed: msg.destroyed,
                destroying: false,
                remainTime: 0,
                avatar: avatar,
                isSystem: msg.type === 'system'
              };
            }).filter(msg => msg !== null);
            
            // 🔥 【CRITICAL-FIX-v4】B端专用消息过滤 - 彻底解决B端获取A端消息问题
            const filteredServerMessages = serverMessages.filter(msg => {
              if (msg.isSystem && msg.content) {
                // 🔥 【B端特殊过滤】如果当前用户是B端（isFromInvite），彻底过滤A端消息
                const isFromInvite = (typeof this.isReceiverEnvironment === 'function')
                  ? this.isReceiverEnvironment()
                  : !!this.data.isFromInvite;
                
                if (isFromInvite) {
                  // 🔥 【HOTFIX-v1.3.68】B端用户：彻底过滤掉所有A端相关的系统消息
                  const shouldFilterForBSide = 
                    msg.content.includes('您创建了私密聊天') ||
                    msg.content.includes('可点击右上角菜单分享链接邀请朋友加入') ||
                    msg.content.includes('私密聊天已创建') ||
                    msg.content.includes('分享链接邀请朋友') ||
                    (msg.content.includes('创建') && msg.content.includes('聊天')) ||
                    // 🔥 【HOTFIX-v1.3.68】过滤A端加入消息格式"XX加入聊天"（但保留B端格式"加入XX的聊天"）
                    (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content));
                  
                  if (shouldFilterForBSide) {
                    console.log('🔥 [B端消息过滤-v1.3.68] B端彻底过滤A端系统消息:', msg.content);
                    return false;
                  }
                }
                
                // 🔥 【CRITICAL-FIX-v4】垃圾数据和错误格式双重过滤
                const shouldFilter = 
                  // 【垃圾数据过滤】优先过滤无效数据
                  !msg.content || msg.content.trim() === '' ||
                  !msg.senderId || 
                  msg.senderId === 'undefined' || 
                  msg.senderId === 'null' ||
                  msg.senderId === '' ||
                  msg.senderId === ' ' ||
                  // 【内容垃圾过滤】
                  msg.content === 'undefined' ||
                  msg.content === 'null' ||
                  msg.content === '[object Object]' ||
                  msg.content.includes('NaN') ||
                  msg.content.length > 1000 ||
                  // 【错误格式过滤】精确匹配错误消息格式
                  msg.content === '成功加入朋友的聊天' ||
                  msg.content === '成功加入朋友的聊天！' ||
                  msg.content === '已加入朋友的聊天' ||
                  msg.content === '成功加入聊天' ||
                  msg.content === '已加入聊天' ||
                  msg.content === '朋友已加入聊天' ||
                  msg.content === '朋友已加入聊天！' ||
                  // 过滤所有包含"成功加入"的消息
                  msg.content.includes('成功加入') ||
                  // 移除特定的"已加入"错误格式
                  (msg.content.includes('已加入') && !msg.content.match(/^已加入.+的聊天$/)) ||
                  // 过滤包含感叹号的旧格式消息
                  (msg.content.includes('加入') && msg.content.includes('聊天') && msg.content.includes('！')) ||
                  isPlaceholderJoinMessage(msg.content);
                
                if (shouldFilter) {
                  // 🔥 【HOTFIX-v1.3.68】二次检查：不要过滤正确格式的消息
                  let isCorrectFormat = false;
                  
                  if (isFromInvite) {
                    // B端只保留B端格式的加入消息
                    isCorrectFormat = /^加入.+的聊天$/.test(msg.content); // "加入xx的聊天"
                  } else {
                    // A端保留A端格式的消息
                    isCorrectFormat = 
                      (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content)) || // "xx加入聊天"（非"加入xx的聊天"）
                      msg.content.includes('您创建了私密聊天'); // A端创建消息
                  }
                    
                  if (isCorrectFormat) {
                    console.log('🔥 [消息过滤-v1.3.68] 保留正确格式消息:', msg.content, 'B端:', isFromInvite);
                    return true; // 保留正确格式
                  }
                  
                  console.log('🔥 [消息过滤-v1.3.68] 过滤错误系统消息:', msg.content, '发送者:', msg.senderId);
                  return false; // 过滤掉
                }
                
                // 🔥 【HOTFIX-v1.3.68】额外验证：只保留正确格式的系统消息
                if (msg.content.includes('加入') && msg.content.includes('聊天')) {
                  let isCorrectFormat = false;
                  
                  if (isFromInvite) {
                    // B端只保留B端格式："加入xx的聊天"
                    isCorrectFormat = /^加入.+的聊天$/.test(msg.content);
                  } else {
                    // A端保留A端格式："xx加入聊天" 或 "您创建了私密聊天"
                    isCorrectFormat = 
                      (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content)) ||
                      msg.content.includes('您创建了私密聊天');
                  }
                  
                  if (!isCorrectFormat) {
                    console.log('🔥 [消息过滤-v1.3.68] 过滤格式不正确的加入消息:', msg.content, 'B端:', isFromInvite);
                    return false;
                  }
                }
              }
              return true;
            });
            
            // 合并本地系统消息和服务器消息
            let allMessages = [...filteredServerMessages, ...localSystemMessages];
            // B端合并时强制剔除A端样式“XX加入聊天”，仅保留“加入XX的聊天”
            if ((typeof that.isReceiverEnvironment === 'function'
              ? that.isReceiverEnvironment()
              : (that.data && that.data.isFromInvite))) {
              allMessages = allMessages.filter(m => {
                if (!m || !isSystemLikeMessage(m) || typeof m.content !== 'string') return true;
                if (/^.+加入聊天$/.test(m.content) && !/^加入.+的聊天$/.test(m.content)) {
                  console.log('🧹 [合并过滤] (B端) 移除A端样式系统消息:', m.content);
                  return false;
                }
                return true;
              });
            }
            
            // 按时间排序，但确保本地系统消息显示在最后
            allMessages.sort((a, b) => {
              // 如果是本地系统消息，放在最后
              if (a.id && a.id.startsWith('sys_') && !(b.id && b.id.startsWith('sys_'))) {
                return 1;
              }
              if (b.id && b.id.startsWith('sys_') && !(a.id && a.id.startsWith('sys_'))) {
                return -1;
              }
              
              // 其他消息按时间排序
              const timeA = a.time || '00:00';
              const timeB = b.time || '00:00';
              return timeA.localeCompare(timeB);
            });
            
            console.log(`🔍 合并后的消息数据 ${allMessages.length} 条:`, allMessages);
            
            that._localMessageCache = allMessages;
            that.setData({
              messages: allMessages,
              isLoading: false
            }, function() {
              that.scheduleScrollToBottom();
            });

          // 🔥 补偿：为仍未进入销毁流程的普通消息启动倒计时（防止刷新后计时丢失）
          setTimeout(() => {
            const currentUserId = that.data.currentUser?.openId;
            const msgs = that.data.messages || [];
            msgs.forEach(m => {
              if (
                m &&
                !m.isSystem &&
                m.senderId !== 'system' &&
                !m.destroyed &&
                !m.destroying &&
                !m.fading &&
                m.id &&
                (!that.destroyTimers || !that.destroyTimers.has(m.id))
              ) {
                // 自己或对方的普通消息都应按规则销毁
                try { that.startDestroyCountdown(m.id); } catch (e) {
                  console.warn('⚠️ [销毁补偿] 启动倒计时失败:', m.id, e);
                }
              }
            });
          }, 200); // 给setData一次渲染时间
            
            // 🔥 【系统消息修复-v2】消息获取后进行额外清理
            setTimeout(() => {
              that.cleanupWrongSystemMessages();
            }, 100);
            
            // 滚动到底部
            that.scheduleScrollToBottom();
          } else {
            console.log('🔍 获取消息失败，保持本地消息');
            // 获取失败时保持当前消息不变
            that.setData({
              isLoading: false
            });
          }
        },
        fail: err => {
          console.error('🔍 获取消息失败', err);
          wx.hideLoading();
          
          // 失败时保持当前消息不变
          that.setData({
            isLoading: false
          });
        }
      });
    };

    /**
     * 获取聊天记录
     */
    page.fetchMessages = function () {
      const that = this;
      that.ensureDestroyedMessageStore();
      
      console.log('🔍 获取聊天记录，chatId:', that.data.contactId);
      
      // 🔥 修复：避免频繁显示加载提示和重复请求
      if (that.data.isLoading) {
        console.log('🔍 正在加载中，跳过重复请求');
        return;
      }
      
      // 🔥 修改：所有消息加载都在后台静默进行，不显示加载气泡
      const lastFetchTime = that.lastFetchTime || 0;
      const currentTime = Date.now();
      console.log('🔍 后台静默获取消息，无前端加载提示');
      
      that.lastFetchTime = currentTime;
      // that.setData({ isLoading: true }); // 🔥 修改：后台静默获取，不显示loading界面
      
      // 🔥 【HOTFIX-v1.3.38】保存当前已销毁消息的ID列表，使用全局记录防止重新显示
      const existingMessages = that._localMessageCache || that.data.messages || [];
      const destroyedMessageIds = new Set();
      const destroyingMessageIds = new Set();
      const destroyingMessageStates = new Map(); // 保存销毁状态

      const registerMessageKeys = ChatHelpers.registerMessageKeys;

      const registerDestroyState = (message, state) => {
        if (!message || !state) {
          return;
        }
        const keys = [];
        if (message.id) {
          keys.push(message.id);
        }
        if (message._id && message._id !== message.id) {
          keys.push(message._id);
        }
        if (!keys.length) {
          return;
        }
        keys.forEach(key => destroyingMessageStates.set(key, state));
      };

      const getDestroyState = (message) => {
        if (!message) {
          return undefined;
        }
        const key = message._id || message.id;
        if (!key) {
          return undefined;
        }
        return destroyingMessageStates.get(key);
      };
      
      // 🔥 【HOTFIX-v1.3.75】合并本地消息状态和全局销毁记录，包括fading状态
      existingMessages.forEach(msg => {
        if (msg.destroyed) {
          registerMessageKeys(destroyedMessageIds, msg);
          registerMessageKeys(that.globalDestroyedMessageIds, msg); // 添加到全局记录
        }
        // 🔥 【HOTFIX-v1.3.75】同时记录fading状态的消息，防止刷新时重新显示
        if (msg.fading || msg.destroying) {
          registerMessageKeys(destroyingMessageIds, msg);
          registerDestroyState(msg, {
            opacity: msg.opacity,
            remainTime: msg.remainTime,
            fading: msg.fading,
            destroying: msg.destroying,
            hideWhenFading: msg.hideWhenFading
          });
          console.log('🔥 [防空白气泡-v1.3.75] 标记正在淡出的消息:', msg.id, msg.content);
          // 🔥 不要将fading/destroying的消息加入destroyedMessageIds，否则会被过滤掉
          // registerMessageKeys(destroyedMessageIds, msg);
          // if (that.globalDestroyedMessageIds) {
          //   registerMessageKeys(that.globalDestroyedMessageIds, msg);
          // }
        }
      });
      
      if (that.globalDestroyedMessageIds) {
        that.globalDestroyedMessageIds.forEach(id => {
          destroyedMessageIds.add(id);
        });
      }
      
      console.log('🔥 [防重复加载] 已销毁消息ID:', Array.from(destroyedMessageIds));
      console.log('🔥 [防重复加载] 正在销毁消息ID:', Array.from(destroyingMessageIds));
      console.log('🔥 [防重复加载] 全局销毁记录:', Array.from(that.globalDestroyedMessageIds || []));
      
      // 🔥 使用云函数获取消息 - 传递chatId而不是targetUserId
      wx.cloud.callFunction({
        name: 'getMessages',
        data: {
          chatId: that.data.contactId // 🔥 使用chatId参数
        },
        success: res => {
          console.log('🔍 获取消息成功', res);
          // wx.hideLoading(); // 🔥 已移除对应的showLoading，无需hideLoading
          
          if (res.result && res.result.success) {
            // 处理消息数据
            let messages = res.result.messages.map(msg => {
              // 🔥 标准化ID集合，便于判重/过滤
              const msgKeyIds = [];
              if (msg._id) msgKeyIds.push(msg._id);
              if (msg.id && msg.id !== msg._id) msgKeyIds.push(msg.id);

              const resolvedMessageId = msg._id || msg.id || '';
              if (!resolvedMessageId) {
                console.warn('🔥 [防重复加载] 跳过无ID云端消息，避免列表key冲突:', msg.content);
                return null;
              }

              // 🔥 记录服务端的destroyed标记，避免回流
              if (msg.destroyed === true) {
                msgKeyIds.forEach(id => {
                  destroyedMessageIds.add(id);
                  if (that.globalDestroyedMessageIds) that.globalDestroyedMessageIds.add(id);
                });
              }

              // 🔥 检查是否为已销毁/正在销毁的消息，直接跳过
              const isDestroyedOrMarked = msg.destroyed === true || msgKeyIds.some(id => destroyedMessageIds.has(id));
              if (isDestroyedOrMarked) {
                console.log('🔥 [防重复加载] 跳过已销毁/标记销毁的消息:', msg.content, msgKeyIds);
                return null; // 标记为跳过
              }
              
              // 🔥 【HOTFIX-v1.3.23】修复接收方消息判断 - 使用智能身份匹配
              const currentUserOpenId = that.data.currentUser?.openId || getApp().globalData.userInfo?.openId || getApp().globalData.openId;
              const isSelf = that.isMessageFromCurrentUser(msg.senderId, currentUserOpenId);
              
              console.log('🔍 [消息处理] 消息ID:', msg._id, '发送者:', msg.senderId, '当前用户:', currentUserOpenId, '是否自己:', isSelf);
              
              // 🔥 【B端头像修复】处理头像逻辑
              let avatar = null; // 默认不显示头像
              const isFromInvite = (typeof that.isReceiverEnvironment === 'function')
                ? that.isReceiverEnvironment()
                : !!that.data.isFromInvite;
              
              if (msg.type === 'system' && isPlaceholderJoinMessage(msg.content)) {
                console.log('🔥 [防重复加载] 过滤占位系统消息，避免回流:', msg.content);
                return null;
              }

              if (msg.type === 'system') {
                avatar = null; // 系统消息不显示头像
              } else if (isSelf) {
                // 🔥 【B端修复】B端用户自己的消息不显示头像
                if (isFromInvite) {
                  avatar = null;
                  console.log('🔥 [B端头像修复] B端自己发送的消息，不设置头像');
                } else {
                  // A端用户自己的消息也不显示头像（统一处理）
                  avatar = null;
                }
              } else {
                // 对方的头像也暂时不显示（因为当前模板没有头像元素）
                avatar = null;
              }
              
              // 🚨 【修复时间错误】安全处理sendTime
              // 显示时间格式化(详见 chat-helpers.js#normalizeTimestamp)
              let msgTime = '00:00';
              try {
                const tsForDisplay = normalizeTimestamp(msg.sendTime);
                if (msg.sendTime != null) {
                  msgTime = that.formatTime(new Date(tsForDisplay));
                } else {
                  console.warn('🚨 [时间修复] 消息缺少sendTime字段:', msg._id);
                  msgTime = that.formatTime(new Date());
                }
              } catch (timeError) {
                console.error('🚨 [时间修复] 时间处理错误:', timeError, '原始时间:', msg.sendTime);
                msgTime = that.formatTime(new Date());
              }
              
              // 🔥 保持原有的销毁状态
              const messageStateKey = resolvedMessageId;
              const stateSnapshot = messageStateKey ? destroyingMessageStates.get(messageStateKey) : undefined;
              const wasDestroying = (stateSnapshot && stateSnapshot.destroying) || (messageStateKey ? destroyingMessageIds.has(messageStateKey) : false);
              
              // 🔥 【HOTFIX-v1.3.67】B端立即过滤掉A端系统消息，防止刷新时重新出现
              if (msg.type === 'system' && isFromInvite) {
                // B端需要过滤A端的系统消息
                if (msg.content.includes('您创建了私密聊天')) {
                  console.log('🔥 [B端过滤-v1.3.67] 过滤A端创建消息:', msg.content);
                  return null;
                }
                // 过滤A端的"XX加入聊天"格式（但保留B端的"加入XX的聊天"格式）
                if (/^.+加入聊天$/.test(msg.content) && !/^加入.+的聊天$/.test(msg.content)) {
                  console.log('🔥 [B端过滤-v1.3.67] 过滤A端加入消息:', msg.content);
                  return null;
                }
              }
              
              const systemLikeMsg = isSystemLikeMessage(msg);

              // 保留原始数值时间戳,供 checkBurnAfterReadingCleanup 等判断消息新旧
              const numericTimestamp = normalizeTimestamp(msg.sendTime || msg._createTime);

              return {
                id: resolvedMessageId,
                senderId: msg.senderId,
                originalSenderId: msg.senderId,
                isSelf: isSelf,
                content: msg.content,
                type: msg.type || (systemLikeMsg ? 'system' : 'text'),
                duration: msg.duration || 0,
                time: msgTime,
                timeDisplay: msgTime,
                timestamp: numericTimestamp,
                sendTime: numericTimestamp,
                showTime: true,
                status: msg.status,
                destroyed: msg.destroyed,
                destroying: wasDestroying,
                fading: stateSnapshot?.fading || false,
                hideWhenFading: stateSnapshot?.hideWhenFading || false,
                remainTime: stateSnapshot?.remainTime || 0,
                opacity: stateSnapshot?.opacity !== undefined ? stateSnapshot.opacity : 1,
                avatar: avatar,
                isSystem: systemLikeMsg,
                isSystemMessage: systemLikeMsg
              };
            }).filter(msg => msg !== null); // 🔥 过滤掉已销毁的消息和B端不应看到的A端系统消息
            
            // 🔥 去重保护：按id/_id去重，避免历史消息回流造成重复
            const uniqueMap = new Map();
            messages.forEach(m => {
              if (!m) return;
              const key = m.id || m._id || `${m.senderId || 'unknown'}_${m.timestamp || m.sendTime || 0}_${m.content || ''}`;
              if (!uniqueMap.has(key)) {
                uniqueMap.set(key, m);
              }
            });
            messages = Array.from(uniqueMap.values());

            console.log(`🔍 处理后的消息数据 ${messages.length} 条(去重后):`, messages);

            // 🔥 【合并模式-v3】保留本地已有但云端尚未返回的消息
            // 关键修复：重新读取 _localMessageCache，因为 watcher 可能在异步云端请求期间添加了新消息
            const freshLocalMessages = that._localMessageCache || that.data.messages || [];
            const cloudMsgIds = new Set(messages.map(m => m.id).filter(Boolean));
            const retainedLocal = freshLocalMessages.filter(localMsg => {
              if (!localMsg || !localMsg.id) return false;
              if (cloudMsgIds.has(localMsg.id)) return false;
              if (localMsg.destroyed) return false;
              if (destroyedMessageIds.has(localMsg.id)) return false;
              if (localMsg._localTemp || localMsg.status === 'sending') {
                console.log('🔥 [合并模式] 跳过正在发送的临时消息:', localMsg.id, localMsg.content);
                return false;
              }
              console.log('🔥 [合并模式] 保留本地消息（云端未返回）:', localMsg.id, localMsg.content);
              return true;
            });
            if (retainedLocal.length > 0) {
              console.log('🔥 [合并模式] 从本地保留了', retainedLocal.length, '条消息');
              messages = messages.concat(retainedLocal);
              // 再次去重
              const mergedMap = new Map();
              messages.forEach(m => {
                if (!m) return;
                const k = m.id || `auto_${mergedMap.size}`;
                if (!mergedMap.has(k)) mergedMap.set(k, m);
              });
              messages = Array.from(mergedMap.values());
            }
            
            // 🔥 【B端最终防线】setData前再次清理A端样式系统消息
            if ((typeof that.isReceiverEnvironment === 'function')
              ? that.isReceiverEnvironment()
              : !!that.data.isFromInvite) {
              const beforeCleanCount = messages.length;
              messages = messages.filter(m => {
                if (!m || !isSystemLikeMessage(m) || typeof m.content !== 'string') return true;
                if (/^.+加入聊天$/.test(m.content) && !/^加入.+的聊天$/.test(m.content)) {
                  console.log('🧹 [B端setData前清理] 移除A端样式系统消息:', m.content);
                  return false;
                }
                if (m.content.includes('您创建了私密聊天')) {
                  console.log('🧹 [B端setData前清理] 移除A端创建消息:', m.content);
                  return false;
                }
                return true;
              });
              if (messages.length !== beforeCleanCount) {
                console.log('🧹 [B端setData前清理] 已移除', beforeCleanCount - messages.length, '条A端样式系统消息');
              }
            }
            
            // 🔥 【HOTFIX-v1.3.84】检查是否有系统消息，如果有则滚动到顶部
            const hasSystemMessage = messages.some(msg => isSystemLikeMessage(msg));
            const shouldKeepBottom = !!(that.data.inputFocus || that.data.keyboardVisible || that.data.keyboardHeight > 0);
            const scrollTarget = (hasSystemMessage && !shouldKeepBottom) ? 'sys-0' : '';
            
            console.log('🔥 [滚动控制-v1.3.84] 消息列表中是否有系统消息:', hasSystemMessage);
            if (hasSystemMessage && !shouldKeepBottom) {
              console.log('🔥 [滚动控制-v1.3.84] 将滚动到顶部系统消息 sys-0');
            } else if (hasSystemMessage && shouldKeepBottom) {
              console.log('🔥 [滚动控制-v1.3.84] 键盘可见，保持底部，不执行顶部定位');
            }
            
            // 🔥 【核心修复-v4】当 watcher 活跃时，使用非破坏性合并防止覆盖 watcher 已添加的消息
            if (that._watcherInitialized) {
              var currentLocal = that._localMessageCache || that.data.messages || [];
              var currentLocalIds = new Set(currentLocal.map(function(m) { return m && m.id; }).filter(Boolean));
              var cloudMsgIds_final = new Set(messages.map(function(m) { return m && m.id; }).filter(Boolean));
              var newFromCloud = messages.filter(function(m) { return m && m.id && !currentLocalIds.has(m.id); });
              
              // 清理：移除已销毁的本地消息和已有云端版本的临时消息
              var cleanedLocal = currentLocal.filter(function(m) {
                if (!m || !m.id) return false;
                if (m.destroyed || destroyedMessageIds.has(m.id)) return false;
                if ((m._localTemp || m.status === 'sending') && cloudMsgIds_final.has(m.id)) return false;
                if ((m._localTemp || m.status === 'sending') && messages.some(function(cm) { return cm.content === m.content && cm.senderId === m.senderId; })) return false;
                return true;
              });
              
              if (newFromCloud.length > 0) {
                messages = cleanedLocal.concat(newFromCloud);
                messages.sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
                console.log('🔥 [非破坏合并] 添加', newFromCloud.length, '条新云端消息，本地保留', cleanedLocal.length, '条');
              } else {
                messages = cleanedLocal;
              }
            }
            
            that._localMessageCache = messages;
            that.setData({
              messages: messages,
              isLoading: false,
              scrollIntoView: scrollTarget,
              hasSystemMessage: hasSystemMessage
            }, function() {
              if (!hasSystemMessage || that.data.inputFocus || that.data.keyboardVisible || that.data.keyboardHeight > 0) {
                that.scheduleScrollToBottom();
              }
            });
            
            try { that.normalizeSystemMessagesAfterLoad && that.normalizeSystemMessagesAfterLoad(); } catch (e) {}

            const currentUserOpenId = that.data.currentUser?.openId || getApp().globalData.userInfo?.openId;
            console.log('🔥 [历史消息销毁] 当前用户OpenId:', currentUserOpenId);
            
            messages.forEach((msg, index) => {
              const isFromCurrentUser = that.isMessageFromCurrentUser(msg.senderId, currentUserOpenId);
              console.log('🔥 [历史消息销毁-v1.3.84] 消息:', msg.content, '发送者:', msg.senderId, '是否自己发送:', isFromCurrentUser);
              
              // 🔥 修复：检查消息是否已经在销毁倒计时队列中
              const isAlreadyDestroying = that.destroyTimers && that.destroyTimers.has(msg.id);
              
              // 🔥 【HOTFIX-v1.3.84】处理系统消息的自动淡出
              if (msg.isSystem || msg.senderId === 'system') {
                if (isPlaceholderJoinMessage(msg.content)) {
                  console.log('🔥 [系统消息淡出-v1.3.96] 跳过占位系统消息:', msg.content);
                  return;
                }
                if (!isAlreadyDestroying && !msg.destroyed && !msg.destroying) {
                  console.log('🔥 [系统消息淡出-v1.3.84] 为云端系统消息启动淡出:', msg.content);
                  // 立即启动系统消息的淡出逻辑
                  setTimeout(() => {
                    that.startSystemMessageFade(msg.id, 3, 5); // 3秒停留 + 5秒淡出
                  }, 100 + index * 50); // 小延迟，确保消息渲染完成
                } else {
                  console.log('🔥 [系统消息淡出-v1.3.84] 系统消息已在处理中，跳过:', msg.content);
                }
              } else if (!isFromCurrentUser &&
                  !msg.destroyed && 
                  !msg.destroying &&
                  !isAlreadyDestroying &&
                  !destroyingMessageIds.has(msg.id)) { // 🔥 避免重复启动销毁倒计时
                console.log('🔥 [历史消息销毁-v1.3.84] 为对方发送的消息自动开始销毁倒计时:', msg.content);
                setTimeout(() => {
                  that.startDestroyCountdown(msg.id);
                }, 2000 + index * 500); // 错开时间，避免同时销毁
              } else if (isAlreadyDestroying) {
                console.log('🔥 [历史消息销毁-v1.3.84] 消息已在销毁倒计时中，跳过:', msg.content);
              }

              // 补偿：sendMessage 回调因竞态未能启动的倒计时
              if (that._pendingDestroyIds && that._pendingDestroyIds.has(msg.id)) {
                var hasTimer = that.destroyTimers && that.destroyTimers.has(msg.id);
                if (!hasTimer && !msg.destroying && !msg.fading && !msg.destroyed) {
                  console.log('🔥 [待销毁补偿] 从 _pendingDestroyIds 启动:', msg.id);
                  that._pendingDestroyIds.delete(msg.id);
                  (function(mid) { setTimeout(function() { that.startDestroyCountdown(mid); }, 100); })(msg.id);
                } else {
                  that._pendingDestroyIds.delete(msg.id);
                }
              }
            });
            
            // 🔥 阅后即焚检查（函数内部自带冷却期保护）
            that.checkBurnAfterReadingCleanup();
            
            // 🔧 连接检测独立于清理冷却期
            that.checkAndFixConnection(messages);
            
            // 滚动到底部
            that.scheduleScrollToBottom();
          } else {
            console.log('🔍 获取消息失败，使用模拟数据');
            // 获取失败时使用模拟数据
            that.showMockMessages();
          }
        },
        fail: err => {
          console.error('🔍 获取消息失败', err);
          // wx.hideLoading(); // 🔥 已移除对应的showLoading，无需hideLoading
          that.setData({ isLoading: false }); // 🔥 修复：重置加载状态
          
          // 显示错误提示
          wx.showToast({
            title: '获取消息失败',
            icon: 'none',
            duration: 2000
          });
          
          // 失败时使用模拟数据
          that.showMockMessages();
        }
      });
    };

  /**
   * 显示模拟消息数据(作为备份)
   *
   * 当 fetchMessages 云函数调用失败时使用,展示 3 条占位消息让用户看到界面非空。
   */
  page.showMockMessages = function() {
    const currentUser = this.data.currentUser;
    const mockMessages = [
      {
        id: '1',
        senderId: 'other',
        isSelf: false,
        content: '你好，这是一条测试消息',
        type: 'text',
        time: '14:20',
        timeDisplay: '14:20',
        showTime: true,
        status: 'received',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: '/assets/images/default-avatar.png',
        isSystem: false
      },
      {
        id: '2',
        senderId: 'self',
        isSelf: true,
        content: '你好，很高兴认识你',
        type: 'text',
        time: '14:21',
        timeDisplay: '14:21',
        showTime: true,
        status: 'sent',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: currentUser?.avatarUrl || '/assets/images/default-avatar.png',
        isSystem: false
      },
      {
        id: '3',
        senderId: 'other',
        isSelf: false,
        content: '这条消息会自动销毁',
        type: 'text',
        time: '14:22',
        timeDisplay: '14:22',
        showTime: true,
        status: 'received',
        destroyed: false,
        destroying: false,
        remainTime: 0,
        avatar: '/assets/images/default-avatar.png',
        isSystem: false
      }
    ];

    this.setData({
      messages: mockMessages,
      isLoading: false
    });

    // 滚动到底部
    this.scrollToBottom();
  };
}

module.exports = { attach };
