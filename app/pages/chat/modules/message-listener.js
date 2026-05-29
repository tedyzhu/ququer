/**
 * 实时消息监听子系统
 *
 * 通过 attach(page) 把 startMessageListener / stopMessageListener 挂到 Page 实例上。
 *
 * 设计要点(与 test-methods.js / voice-recorder.js 一致的 attach 模式):
 * - 把整段函数体搬迁,所有 this.xxx 改为 page.xxx 后函数体内 this 不动
 *   因为函数被赋值到 page 上后,运行时 this 自然指向 page,行为零差异
 * - 模块内部不直接读 chat-helpers 常量,通过 require 引入再用
 *
 * 函数职责:
 * - startMessageListener:启动 wx.cloud.database watch 监听 messages 表 (chatId 维度)
 *     onChange:增量收到新消息时,根据 isFromInvite 进行 B 端系统消息过滤,
 *               批量 setData 直接添加到界面;若 docChanges 为空,fallback 到 docs 备用方案
 *     onError:重启监听 (3s)
 *     启动失败:fallback 到 startPollingMessages
 * - stopMessageListener:关闭监听 + 清轮询定时器
 *
 * 已知技术债(本次保留不修):
 * - 主路径 (docChanges) 与备用路径 (docs) 几乎是复制粘贴,后续可提取共用过滤函数
 * - onChange 内嵌多层 if/forEach,深度可读性较差,但行为正确
 */

const ChatHelpers = require('./chat-helpers.js');
const { DEFAULT_DESTROY_TIMEOUT, isPlaceholderJoinMessage, isSystemLikeMessage, normalizeTimestamp } = ChatHelpers;

/**
 * @param {Object} page - Page 实例
 */
function attach(page) {
  /**
   * 🔥 启动实时消息监听
   */
  page.startMessageListener = function() {
    const chatId = this.data.contactId;
    if (!chatId) return;

    console.log('🔔 启动实时消息监听，chatId:', chatId);

    try {
      // 如果已有监听器，先关闭
      if (this.messageWatcher) {
        this.messageWatcher.close();
        this.messageWatcher = null;
      }

      const db = wx.cloud.database();
      this.messageWatcher = db.collection('messages')
        .where({
          chatId: chatId
        })
        .orderBy('sendTime', 'desc')
        .limit(50)  // 🔥 增加监听范围，确保不遗漏消息
        .watch({
          onChange: snapshot => {
            console.log('🔔 监听到消息变化:', snapshot);

            if (snapshot.type === 'init') {
              console.log('🔔 消息监听器初始化');
              this._watcherInitialized = true;
              return;
            }

            // 🔥 检查是否有新消息
            if (snapshot.docChanges && snapshot.docChanges.length > 0) {
              const changes = snapshot.docChanges;
              let hasNewMessage = false;

              // 🔧 【消息收发修复】使用页面当前用户OpenId，而不是全局数据
              const currentUserOpenId = this.data.currentUser?.openId || getApp().globalData.userInfo?.openId || getApp().globalData.openId;
              console.log('🔔 [消息监听] 当前用户OpenId:', currentUserOpenId);

              changes.forEach(change => {
                if (change.queueType === 'enqueue') {
                  const newDoc = change.doc;
                  console.log('🔔 检测到新消息:', newDoc);
                  console.log('🔔 [消息检测] 消息发送者:', newDoc.senderId, '当前用户:', currentUserOpenId);

                  // 🔥 【HOTFIX-v1.3.68】B端系统消息过滤 - B端不应该接收A端的系统消息
                  if (this.data.isFromInvite && newDoc.isSystem && newDoc.content) {
                    // 🔥 【HOTFIX-v1.3.68】只过滤A端格式，保留B端格式
                    const shouldFilterForBSide =
                      newDoc.content.includes('您创建了私密聊天') ||
                      newDoc.content.includes('可点击右上角菜单分享链接邀请朋友加入') ||
                      newDoc.content.includes('私密聊天已创建') ||
                      newDoc.content.includes('分享链接邀请朋友') ||
                      (newDoc.content.includes('创建') && newDoc.content.includes('聊天')) ||
                      (/^.+加入聊天$/.test(newDoc.content) && !/^加入.+的聊天$/.test(newDoc.content)); // 只过滤A端格式"XX加入聊天"

                    if (shouldFilterForBSide) {
                      console.log('🔥 [B端过滤-v1.3.68] B端过滤A端系统消息:', newDoc.content);
                      return; // 跳过此消息
                    }
                  }

                  // 🔥 【HOTFIX-v1.3.23】增强身份匹配逻辑，支持不同ID格式
                  const isMyMessage = this.isMessageFromCurrentUser(newDoc.senderId, currentUserOpenId);
                  console.log('🔥 [ID匹配] 消息归属判断结果:', isMyMessage);

                  // 🔥 B端容错：若身份误判为自己（同一微信号测试），也要视为新消息
                  if (!isMyMessage || this.data.isFromInvite) {
                    console.log('🔔 检测到对方发送的新消息，准备刷新');
                    hasNewMessage = true;
                  } else {
                    console.log('🔔 [消息检测] 这是自己发送的消息，跳过处理');
                  }
                }
              });

              // 🔥 【调试】始终打印身份判断信息，便于诊断
              const currentUser = this.data.currentUser;
              const isFromInvite = this.data.isFromInvite;
              const isSender = !isFromInvite; // 🔥 修复：使用更准确的身份判断

              console.log('🔔 [身份判断] isFromInvite:', isFromInvite, 'isSender:', isSender, 'hasNewMessage:', hasNewMessage);

              if (hasNewMessage) {
                console.log('🔔 刷新聊天记录以显示新消息');

                // 🔥 【FIX-v2.1】不再强制调用fetchMessages替换整个消息列表
                // 直接通过下方 direct-add 逻辑逐条追加，轮询(5s)提供兜底同步
                // 旧逻辑会导致B端多条消息被替换而非逐条显示
                this._watcherDirectAddSuccess = false;

                              // 🔥 【HOTFIX-v1.3.25】智能建立用户映射关系和实时ID检测
              if (this.smartEstablishMapping && typeof this.smartEstablishMapping === 'function') {
              this.smartEstablishMapping();
              }

              // 🔥 【URGENT-FIX】修复作用域错误，确保消息监听正常工作
              try {
                if (snapshot.docChanges && snapshot.docChanges.length > 0) {
                  snapshot.docChanges.forEach(change => {
                    var ct = change.dataType || change.type || '';
                    if (ct !== 'add' && ct !== 'added' && ct !== 'init' && ct !== '') return;
                    var msgData;
                    if (change.doc && typeof change.doc.data === 'function') {
                      msgData = change.doc.data();
                    } else if (change.doc && change.doc._data) {
                      msgData = change.doc._data;
                    } else if (change.doc) {
                      msgData = change.doc;
                    } else { return; }
                    var senderId = msgData && msgData.senderId;
                    var currentUserId = this.data.currentUser?.openId;

                    if (senderId && currentUserId && senderId !== currentUserId) {
                      console.log('🔥 [实时映射] 检测到新消息 - 发送者:', senderId, '当前用户:', currentUserId);
                      if (this.shouldEstablishMapping && typeof this.shouldEstablishMapping === 'function' && this.shouldEstablishMapping(senderId, currentUserId)) {
                        console.log('🔥 [实时映射] 🚨 立即建立映射关系');
                        if (this.establishUserMapping && typeof this.establishUserMapping === 'function') {
                          this.establishUserMapping(currentUserId, senderId, this.data.currentUser.nickName);
                        }
                      }
                    }
                  });
                }
              } catch (mappingErr) {
                console.warn('🔥 [实时映射] 映射处理异常，不影响消息接收:', mappingErr);
              }

              if (hasNewMessage) {
                  console.log('🔔 [智能消息处理] 检测到新消息，直接添加到界面（双端通用）');

                  if (snapshot.docChanges && snapshot.docChanges.length > 0) {
                    var currentUserInfo = this.data.currentUser;
                    var currentUserId = currentUserInfo?.openId;
                    var batchNewMessages = [];
                    var existingMessages = this._localMessageCache || this.data.messages || [];
                    var existingIdSet = new Set();
                    existingMessages.forEach(function(m) {
                      if (!m) return;
                      if (m.id) existingIdSet.add(m.id);
                      if (m._id) existingIdSet.add(m._id);
                    });
                    var bSide = this.data.isFromInvite === true;
                    var _self = this;

                    snapshot.docChanges.forEach(function(change) {
                      var ct = change.dataType || change.type || '';
                      if (ct === 'remove' || ct === 'update' || ct === 'replace') return;
                      var newMessage;
                      if (change.doc && typeof change.doc.data === 'function') {
                        newMessage = change.doc.data();
                      } else if (change.doc && change.doc._data) {
                        newMessage = change.doc._data;
                      } else if (change.doc) {
                        newMessage = change.doc;
                      } else if (typeof change.data === 'function') {
                        newMessage = change.data();
                      } else { return; }

                      var resolvedId = (newMessage && (newMessage._id || newMessage.id))
                        || (change.doc && (change.doc._id || change.doc.id))
                        || change.id
                        || '';
                      if (!resolvedId) {
                        console.warn('🔔 [新消息处理] 跳过无ID消息，避免列表key冲突导致覆盖');
                        return;
                      }
                      if (existingIdSet.has(resolvedId)) return;

                      var isMyMessageStrict = Boolean(currentUserId) && newMessage.senderId === currentUserId;
                      if (isMyMessageStrict) return;

                      var rawContent = (newMessage && newMessage.content) || '';
                      if (isPlaceholderJoinMessage(rawContent)) {
                        return;
                      }
                      if (bSide) {
                        var isASideSystem = (
                          rawContent.includes('您创建了私密聊天') ||
                          rawContent.includes('可点击右上角菜单分享链接邀请朋友加入') ||
                          rawContent.includes('私密聊天已创建') ||
                          rawContent.includes('分享链接邀请朋友') ||
                          (rawContent.includes('创建') && rawContent.includes('聊天')) ||
                          (/^.+加入聊天$/.test(rawContent) && !/^加入.+的聊天$/.test(rawContent))
                        );
                        if (isASideSystem) return;
                      }

                      var normalizedTimestamp = normalizeTimestamp(
                        newMessage.timestamp || newMessage.sendTime || newMessage._createTime
                      );

                      var systemLike = isSystemLikeMessage(newMessage);
                      batchNewMessages.push({
                        id: resolvedId,
                        senderId: newMessage.senderId,
                        content: newMessage.content,
                        timestamp: normalizedTimestamp,
                        sendTime: normalizedTimestamp,
                        isSelf: isMyMessageStrict,
                        type: newMessage.type || (systemLike ? 'system' : newMessage.type),
                        duration: newMessage.duration || 0,
                        isSystem: systemLike,
                        isSystemMessage: systemLike,
                        destroyTimeout: newMessage.destroyTimeout || _self.data.destroyTimeout || DEFAULT_DESTROY_TIMEOUT,
                        isDestroyed: newMessage.destroyed || false
                      });
                      existingIdSet.add(resolvedId);
                    });

                    if (batchNewMessages.length > 0) {
                      var merged = existingMessages.concat(batchNewMessages);
                      this._localMessageCache = merged;
                      this.setData({ messages: merged }, () => {
                        this.scheduleScrollToBottom();
                      });
                      this._watcherDirectAddSuccess = true;
                      console.log('🔔 [新消息处理] ✅ 批量添加', batchNewMessages.length, '条新消息');

                      if (!this._watcherPendingIds) this._watcherPendingIds = new Set();
                      var ctx = this;
                      batchNewMessages.forEach(function(fm) {
                        if (!fm.isSystem && fm.senderId !== 'system') {
                          ctx._watcherPendingIds.add(fm.id);
                          setTimeout(function() {
                            ctx._watcherPendingIds && ctx._watcherPendingIds.delete(fm.id);
                            ctx.startDestroyCountdown(fm.id);
                          }, 150);
                        }
                      });
                    }
                  } else {
                    console.log('🔔 [调试] snapshot.docChanges 为空，尝试备用方案');

                    // 🔥 备用方案：直接从 snapshot.docs 获取最新消息（批量处理）
                    if (snapshot.docs && snapshot.docs.length > 0) {
                      var fbExisting = this._localMessageCache || this.data.messages || [];
                      var fbIdSet = new Set();
                      fbExisting.forEach(function(msg) {
                        if (!msg) return;
                        if (msg.id) fbIdSet.add(msg.id);
                        if (msg._id) fbIdSet.add(msg._id);
                      });
                      var fbBatch = [];
                      var fbSelf = this;
                      var fbIsB = this.data.isFromInvite === true;

                      snapshot.docs.forEach(function(doc) {
                        var message;
                        if (typeof doc.data === 'function') {
                          message = doc.data();
                        } else if (doc._data) {
                          message = doc._data;
                        } else {
                          message = doc;
                        }

                        var fbMessageId = (message && (message._id || message.id))
                          || (doc && (doc._id || doc.id))
                          || '';
                        if (!fbMessageId) {
                          console.warn('🔔 [备用方案] 跳过无ID消息，避免列表key冲突导致覆盖');
                          return;
                        }
                        if (fbIdSet.has(fbMessageId)) return;

                        var isMyMsg = fbSelf.isMessageFromCurrentUser(message.senderId, currentUser?.openId);
                        if (isMyMsg) return;

                        var mc = (message && message.content) || '';
                        if (isPlaceholderJoinMessage(mc)) {
                          return;
                        }
                        if (fbIsB) {
                          var aSys = (
                            mc.includes('您创建了私密聊天') ||
                            mc.includes('可点击右上角菜单分享链接邀请朋友加入') ||
                            mc.includes('私密聊天已创建') ||
                            mc.includes('分享链接邀请朋友') ||
                            (mc.includes('创建') && mc.includes('聊天')) ||
                            (/^.+加入聊天$/.test(mc) && !/^加入.+的聊天$/.test(mc))
                          );
                          if (aSys) return;
                        }

                        var fbTimestamp = normalizeTimestamp(
                          message.timestamp || message.sendTime || message._createTime
                        );

                        var sysLike = isSystemLikeMessage(message);
                        fbBatch.push({
                          id: fbMessageId,
                          senderId: message.senderId,
                          content: message.content,
                          timestamp: fbTimestamp,
                          sendTime: fbTimestamp,
                          isSelf: isMyMsg,
                          type: message.type || (sysLike ? 'system' : message.type),
                          duration: message.duration || 0,
                          isSystem: sysLike,
                          isSystemMessage: sysLike,
                          destroyTimeout: message.destroyTimeout || fbSelf.data.destroyTimeout || DEFAULT_DESTROY_TIMEOUT,
                          isDestroyed: message.destroyed || false
                        });
                        fbIdSet.add(fbMessageId);
                      });

                      if (fbBatch.length > 0) {
                        var fbMerged = fbExisting.concat(fbBatch);
                        this._localMessageCache = fbMerged;
                        this.setData({ messages: fbMerged }, () => {
                          this.scheduleScrollToBottom();
                        });
                        this._watcherDirectAddSuccess = true;
                        console.log('🔔 [备用方案] ✅ 批量添加', fbBatch.length, '条新消息');

                        if (!this._watcherPendingIds) this._watcherPendingIds = new Set();
                        var fbCtx = this;
                        fbBatch.forEach(function(fm) {
                          if (!fm.isSystem && fm.senderId !== 'system') {
                            fbCtx._watcherPendingIds.add(fm.id);
                            setTimeout(function() {
                              fbCtx._watcherPendingIds && fbCtx._watcherPendingIds.delete(fm.id);
                              fbCtx.startDestroyCountdown(fm.id);
                            }, 150);
                          }
                        });
                      }
                    }
                  }

                  // 🔥 【FIX-v2.1】仅当 direct-add 完全失败时，才 fallback 到 fetchMessages
                  if (!this._watcherDirectAddSuccess) {
                    console.log('🔔 [消息同步] direct-add未成功，使用fetchMessages兜底');
                    setTimeout(() => {
                      this.fetchMessages();
                      console.log('🔔 [消息同步] 兜底fetchMessages完成');
                    }, 500);
                  }

                  return;
                }

                // 🔥 【HOTFIX-v1.3.38】接收方避免重新获取全部消息，防止已销毁消息重新出现
                console.log('🔔 [接收方处理] 检测到新消息，但不重新获取全部消息以保护已销毁的消息');
                // 不调用 fetchMessages() 避免已销毁消息重新出现
              }
            }
          },
          onError: err => {
            console.error('🔔 消息监听出错:', err);
            this._watcherInitialized = false;

            setTimeout(() => {
              console.log('🔔 尝试重新启动消息监听');
              this.startMessageListener();
            }, 3000);
          }
        });

      console.log('🔔 实时消息监听启动成功');
    } catch (err) {
      console.error('🔔 设置消息监听失败:', err);

      // 🔥 启动失败时，使用轮询作为备用方案
      this.startPollingMessages();
    }
  };

  /**
   * 🔥 停止实时消息监听
   */
  page.stopMessageListener = function() {
    if (this.messageWatcher) {
      console.log('🔔 停止消息监听');
      this.messageWatcher.close();
      this.messageWatcher = null;
      this._watcherInitialized = false;
    }

    // 🔥 同时停止轮询
    if (this.messagePollingTimer) {
      clearInterval(this.messagePollingTimer);
      this.messagePollingTimer = null;
    }
  };
}

module.exports = { attach };
