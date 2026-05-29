/**
 * 聊天页参与者监听子系统
 *
 * 职责:
 * - 启动/停止参与者实时监听 (startParticipantListener / startWatchingForNewParticipants)
 * - 获取参与者列表 (fetchChatParticipants)
 * - 获取/重试真实邀请者昵称 (getOtherParticipantRealName / retryGetRealInviterName)
 * - 参与者去重 (cleanupDuplicateParticipants / deduplicateParticipants)
 *
 * 设计原则(详见 .kiro/specs/chat-participant-listener-module/design.md):
 * - 这些函数在 attach() 时绑定到 page,运行时 `this === page`
 * - 不引入新的状态容器,继续使用 page.participantWatcher / participantWatcherReady 等
 * - 跨模块依赖通过 page 上的方法/属性调用
 */

const ChatHelpers = require('./chat-helpers.js');
const { isPlaceholderJoinMessage } = ChatHelpers;

/**
 * 🔥 【HOTFIX-v1.3.53】获取聊天中其他参与者的真实昵称
 * @returns {String|null} 其他参与者的真实昵称,如果找不到则返回 null
 */
function getOtherParticipantRealName() {
  console.log('🔥 [获取对方昵称] 开始获取其他参与者真实昵称');

  const currentUser = this.data.currentUser;
  const participants = this.data.participants || [];
  const currentUserOpenId = currentUser && currentUser.openId;

  if (!currentUserOpenId || participants.length < 2) {
    console.log('🔥 [获取对方昵称] 条件不满足,返回null');
    return null;
  }

  // 查找不是当前用户的参与者
  const otherParticipant = participants.find(p =>
    (p.openId || p.id) &&
    (p.openId || p.id) !== currentUserOpenId
  );

  if (otherParticipant) {
    const realName = otherParticipant.nickName || otherParticipant.name;
    console.log('🔥 [获取对方昵称] 找到对方参与者:', realName);
    return realName;
  }

  console.log('🔥 [获取对方昵称] 未找到其他参与者');
  return null;
}

/**
 * 🔥 【新增】重试获取真实邀请者昵称
 *
 * B 端兜底:在 updateTitleForReceiver fallback 到 'a端用户' 后,
 * 2 秒后重新拉一遍参与者真实昵称,如果拿到则更新标题。
 */
function retryGetRealInviterName() {
  console.log('🔗 [重试机制] 重试获取真实邀请者昵称');

  // 重新获取参与者信息
  this.fetchChatParticipantsWithRealNames();

  // 延迟检查是否获取到了真实昵称
  setTimeout(() => {
    const participants = this.data.participants || [];
    const currentUser = this.data.currentUser;

    const otherParticipant = participants.find(p => {
      const isNotSelf = !p.isSelf && (p.openId !== currentUser?.openId);
      return isNotSelf;
    });

    if (otherParticipant &&
        otherParticipant.nickName &&
        otherParticipant.nickName !== '用户' &&
        otherParticipant.nickName !== 'a端用户') {

      // 🔥 获取到真实昵称,立即更新标题
      const realTitle = `我和${otherParticipant.nickName}（2）`;
      console.log('🔗 [重试机制] ✅ 获取到真实昵称,更新标题:', realTitle);

      this.setData({
        dynamicTitle: realTitle,
        contactName: realTitle,
        chatTitle: realTitle
      });

      wx.setNavigationBarTitle({
        title: realTitle,
        success: () => {
          console.log('🔗 [重试机制] ✅ 真实昵称标题更新成功:', realTitle);
        }
      });
    } else {
      console.log('🔗 [重试机制] 仍未获取到真实昵称,保持当前标题');
    }
  }, 1000);
}

/**
 * 🔥 发送方专用:启动参与者监听,第一时间感知接收方加入
 *
 * 这是 chat.js 单方法行数之最(原 582 行)。流程:
 * 1. wx.cloud.database().collection('conversations').doc(chatId).watch()
 * 2. onChange:对比新旧参与者列表
 * 3. 检测到新参与者 → 立即更新 participants → 用临时昵称刷标题
 * 4. 触发系统消息添加(占位符则 1 秒后真实昵称替换)
 * 5. 触发 fetchChatParticipantsWithRealNames(注:已知死引用,不影响业务)
 *
 * @param {string} chatId - 聊天 ID
 */
function startParticipantListener(chatId) {
  console.log('🔥 [发送方监听] 启动参与者实时监听,chatId:', chatId);

  try {
    const extractParticipantId = (participant) => {
      if (!participant) return null;
      if (typeof participant === 'string') return participant;
      return participant.openId || participant.id || participant._id || null;
    };

    // 先清理可能存在的旧监听器
    if (this.participantWatcher) {
      this.participantWatcher.close();
      this.participantWatcher = null;
    }
    const db = wx.cloud.database();
    this.participantWatcherReady = false;
    this.lastParticipantIds = (this.data.participants || [])
      .map(extractParticipantId)
      .filter(id => !!id);

    // 监听 conversations 集合的 participants 字段变化
    this.participantWatcher = db.collection('conversations')
      .doc(chatId)
      .watch({
        onChange: snapshot => {
          console.log('🔥 [发送方监听] 检测到聊天变化:', snapshot);

          // 🔥 【HOTFIX-v1.3.93】监听器初始化时也要检查是否已经有 2 人
          if (snapshot.type === 'init') {
            console.log('🔥 [发送方监听-v1.3.93] 监听器初始化完成,检查初始参与者状态');

            // 🔥 检查初始状态是否已经是双人聊天
            if (snapshot.docs && snapshot.docs.length > 0) {
              const conversation = snapshot.docs[0];
              const initialParticipants = conversation.participants || [];
              const currentParticipants = this.data.participants || [];

              console.log('🔥 [发送方监听-v1.3.93] 初始参与者数量:', initialParticipants.length);
              console.log('🔥 [发送方监听-v1.3.93] 当前页面参与者数量:', currentParticipants.length);

              // 🔥 如果数据库已经是 2 人,但页面只显示 1 人,说明需要同步
              if (initialParticipants.length >= 2 && currentParticipants.length < 2) {
                console.log('🔥 [发送方监听-v1.3.93] ✅ 检测到数据库已有2人,页面只有1人,立即同步!');

                // 🔥 立即处理,不要返回
                // 继续执行后面的逻辑...
              } else {
                console.log('🔥 [发送方监听-v1.3.93] 参与者状态一致,无需同步');
                return;
              }
            } else {
              return;
            }
          }

          // 检查是否有文档更新
          if (snapshot.docs && snapshot.docs.length > 0) {
            const conversation = snapshot.docs[0];
            const newParticipants = conversation.participants || [];
            const currentParticipants = this.data.participants || [];

            console.log('🔥 [发送方监听] 新参与者列表:', newParticipants);
            console.log('🔥 [发送方监听] 当前参与者数量:', currentParticipants.length);
            console.log('🔥 [发送方监听] 新参与者数量:', newParticipants.length);

            // 🎯 【HOTFIX-v1.3.33】修复参与者去重逻辑,正确处理字符串格式数据
            console.log('🔥 [发送方监听] 🆘 开始强力去重数据库重复数据');
            const deduplicatedParticipants = [];
            const seenIds = new Set();

            // 🚨 强力去重:正确处理字符串和对象格式的参与者数据
            for (const p of newParticipants) {
              let id;
              let participant;

              if (typeof p === 'string') {
                // 🔧 修复:处理字符串格式的参与者数据(openId)
                id = p;
                participant = {
                  id: p,
                  openId: p,
                  nickName: '用户', // 临时昵称,稍后从数据库获取
                  avatarUrl: '/assets/images/default-avatar.png'
                };
              } else if (typeof p === 'object' && p !== null) {
                // 处理对象格式的参与者数据
                id = extractParticipantId(p);
                participant = p;
                if (id) {
                  participant = {
                    ...p,
                    id: p.id || id,
                    openId: p.openId || id
                  };
                }
              } else {
                console.log('🔥 [发送方监听] ❌ 无效的参与者数据格式:', p);
                continue;
              }

              // 🔥 【过滤垃圾数据】跳过 temp_user 等无效参与者
              if (id && (id === 'temp_user' || id.startsWith('temp_') || id.length <= 5)) {
                console.log('🔥 [发送方监听] ❌ 跳过垃圾数据:', id, participant.nickName || participant.name);
              } else if (id && !seenIds.has(id)) {
                seenIds.add(id);
                deduplicatedParticipants.push(participant);
                console.log('🔥 [发送方监听] ✅ 保留唯一参与者:', id, participant.nickName || participant.name);
              } else {
                console.log('🔥 [发送方监听] ❌ 跳过重复参与者:', id, participant.nickName || participant.name);
              }
            }

            console.log('🔥 [发送方监听] 强力去重:', newParticipants.length, '->', deduplicatedParticipants.length);

            // 🚨 【HOTFIX-v1.3.27】在去重后进行数据验证
            if (deduplicatedParticipants.length > 10) {
              console.log('🔥 [发送方监听] ⚠️ 去重后仍有异常数据:参与者数量过多,跳过处理');
              return;
            }

            // 🚨 【数据质量检查】检查去重后是否仍有质量问题
            if (deduplicatedParticipants.length > 1) {
              const firstId = deduplicatedParticipants[0]?.id || deduplicatedParticipants[0]?.openId;
              const allSameId = deduplicatedParticipants.every(p =>
                (p.id || p.openId) === firstId
              );

              if (allSameId) {
                console.log('🔥 [发送方监听] ⚠️ 去重后仍有重复错误:所有参与者都是同一ID,数据彻底无效');
                return;
              }
            }

            // 🎯 【HOTFIX-v1.3.19】增强参与者检测逻辑 - 不仅检测数量,还检测具体参与者
            const currentUserOpenId = this.data.currentUser?.openId;
            const currentParticipantIds = currentParticipants.map(extractParticipantId).filter(Boolean);
            const newParticipantIds = newParticipants.map(extractParticipantId).filter(Boolean);
            const uniqueParticipantIds = deduplicatedParticipants.map(extractParticipantId).filter(Boolean);
            const previousParticipantIds = (this.lastParticipantIds && this.lastParticipantIds.length > 0)
              ? this.lastParticipantIds
              : currentParticipantIds;
            const isInitialSnapshot = snapshot.type === 'init';
            const hasBrandNewParticipant = uniqueParticipantIds.some(id =>
              id && id !== currentUserOpenId && !previousParticipantIds.includes(id)
            );
            const syncParticipantsWithoutJoin = (tag) => {
              const participantsChanged = currentParticipants.length !== deduplicatedParticipants.length ||
                uniqueParticipantIds.some(id => !currentParticipantIds.includes(id));
              if (!participantsChanged) {
                return;
              }
              console.log(`🔥 [发送方监听] 同步参与者列表(${tag || 'snapshot'})`);
              this.setData({
                participants: deduplicatedParticipants
              }, () => {
                this.updateDynamicTitleWithRealNames();
              });
            };

            console.log('🔥 [发送方监听] 当前用户OpenId:', currentUserOpenId);
            console.log('🔥 [发送方监听] 当前参与者IDs:', currentParticipantIds);
            console.log('🔥 [发送方监听] 新参与者IDs:', newParticipantIds);
            console.log('🔥 [发送方监听] 去重后参与者IDs:', uniqueParticipantIds);
            console.log('🔥 [发送方监听] 上一次同步IDs:', previousParticipantIds);
            console.log('🔥 [发送方监听] 是否初始化快照:', isInitialSnapshot);
            console.log('🔥 [发送方监听] 是否检测到全新参与者ID:', hasBrandNewParticipant);

            if (isInitialSnapshot) {
              console.log('🔥 [发送方监听] 当前变化不触发新参与者逻辑(初始化)');
              this.lastParticipantIds = uniqueParticipantIds;
              this.participantWatcherReady = true;
              syncParticipantsWithoutJoin('initial-sync');
              return;
            }

            if (!hasBrandNewParticipant) {
              console.log('🔥 [发送方监听] 当前变化不触发新参与者逻辑(无新增ID)');
              this.lastParticipantIds = uniqueParticipantIds;
              this.participantWatcherReady = true;
              syncParticipantsWithoutJoin('no-new-id');
              return;
            }

            // 检测是否有新的参与者 ID(不是当前用户)
            const hasNewParticipant = newParticipantIds.some(id =>
              id !== currentUserOpenId && !currentParticipantIds.includes(id)
            );

            console.log('🔥 [发送方监听] 是否有新参与者:', hasNewParticipant);

            // 🎯 重新检测是否有真正的新参与者(基于去重后的数据)
            const hasRealNewParticipant = uniqueParticipantIds.some(id =>
              id !== currentUserOpenId && !currentParticipantIds.includes(id)
            );

            console.log('🔥 [发送方监听] 是否有真正的新参与者:', hasRealNewParticipant);
            console.log('🔥 [发送方监听] 去重后参与者数量:', deduplicatedParticipants.length);

            // 🔥 【CRITICAL-FIX-v4】严格防止已稳定聊天的误触发
            const isStableChat = currentParticipants.length >= 2 && deduplicatedParticipants.length >= 2;
            const shouldSkipProcessing = isStableChat && !hasRealNewParticipant;

            // 🔥 【关键修复】额外检查:确保不是因为消息发送导致的误触发
            const isMessageTriggered = this.data.recentlySentMessage || this.data.hasAddedConnectionMessage;
            const timeNow = Date.now();
            const lastMessageTime = this.data.lastMessageSentTime || 0;
            const timeSinceLastMessage = timeNow - lastMessageTime;

            // 如果距离上次发送消息很近(2 秒内),很可能是消息触发的误报
            const isProbableMessageMisfire = timeSinceLastMessage < 2000;

            console.log('🔥 [发送方监听-v4] 稳定聊天检测:', {
              isStableChat,
              hasRealNewParticipant,
              shouldSkipProcessing,
              isMessageTriggered,
              isProbableMessageMisfire,
              timeSinceLastMessage,
              currentCount: currentParticipants.length,
              deduplicatedCount: deduplicatedParticipants.length
            });

            // 🎯 【HOTFIX-v1.3.90】优先信任新参与者证据
            // 🔥 如果真的有新参与者加入,应该立即处理,不应该被消息发送干扰
            const isDefinitelyNewParticipant = hasRealNewParticipant && !this.data.hasAddedConnectionMessage;
            const isLikelyMessageMisfire = isProbableMessageMisfire && this.data.recentlySentMessage && !hasRealNewParticipant;

            const otherParticipantCandidate = deduplicatedParticipants.find(p => {
              const pid = p.id || p.openId;
              return pid && pid !== currentUserOpenId;
            });
            const otherHasConfirmedJoinFlag = otherParticipantCandidate
              ? (
                typeof otherParticipantCandidate.isJoiner === 'boolean'
                  ? otherParticipantCandidate.isJoiner
                  : true
              )
              : false;

            const shouldProcessNewParticipant =
              hasBrandNewParticipant &&
              isDefinitelyNewParticipant &&
              deduplicatedParticipants.length >= 2 &&
              otherHasConfirmedJoinFlag &&
              !shouldSkipProcessing;
              // 🔥 【v1.3.90】移除 isLikelyMessageMisfire 检查,优先处理新参与者

            console.log('🔥 [发送方监听-v4] 智能检测结果:', {
              isDefinitelyNewParticipant,
              isLikelyMessageMisfire,
              shouldProcessNewParticipant,
              otherHasConfirmedJoinFlag,
              hasAddedConnectionMessage: this.data.hasAddedConnectionMessage,
              recentlySentMessage: this.data.recentlySentMessage
            });

            if (shouldProcessNewParticipant && otherParticipantCandidate) {
              console.log('🔥 [发送方监听] ✅ 检测到真正的新参与者加入!立即更新标题');

              // 🔥 【HOTFIX-v1.3.92】立即更新参与者列表和标题,不等待异步操作
              const otherParticipant = otherParticipantCandidate;

              if (otherParticipant) {
                // 🔥 【HOTFIX-v1.3.92】先立即更新参与者列表为 2 人状态
                const immediateParticipants = [];
                const currentUserInfo = this.data.currentUser;

                // 添加当前用户
                if (currentUserInfo && currentUserInfo.openId) {
                  immediateParticipants.push({
                    id: currentUserInfo.openId,
                    openId: currentUserInfo.openId,
                    nickName: currentUserInfo.nickName,
                    avatarUrl: currentUserInfo.avatarUrl,
                    isCreator: true,
                    isJoiner: false,
                    isSelf: true
                  });
                }

                // 添加对方参与者(使用占位符昵称,稍后会被真实昵称替换)
                const otherName = otherParticipant.nickName || otherParticipant.name || '用户';
                immediateParticipants.push({
                  id: otherParticipant.id || otherParticipant.openId,
                  openId: otherParticipant.id || otherParticipant.openId,
                  nickName: otherName,
                  avatarUrl: otherParticipant.avatarUrl || '/assets/images/default-avatar.png',
                  isCreator: false,
                  isJoiner: true,
                  isSelf: false
                });

                console.log('🔥 [即时标题-v1.3.92] 立即更新参与者列表为2人,临时昵称:', otherName);

                // 🔥 【关键修复】先更新 participants 为 2 人,让后续的 fetchChatParticipantsWithRealNames 能正确触发标题更新
                this.setData({
                  participants: immediateParticipants
                });

                // 🔥 【HOTFIX-v1.3.94】A 端即时标题:先用临时昵称更新,稍后再用真实昵称覆盖
                try {
                  if (this.data.isSender && !this.data.isFromInvite) {
                    const immediateTitle = `我和${otherName}（2）`;
                    this.setData({
                      dynamicTitle: immediateTitle,
                      contactName: immediateTitle,
                      chatTitle: immediateTitle
                    });
                    wx.setNavigationBarTitle({ title: immediateTitle });
                    console.log('🔥 [即时标题-v1.3.94] A端已用临时昵称更新标题:', immediateTitle);
                  }
                } catch (e) {
                  console.warn('⚠️ [即时标题-v1.3.94] A端临时标题更新失败:', e);
                }

                // 🔥 【HOTFIX-v1.3.92】立即启动异步获取真实昵称(此时 participants 已经是 2 人,会触发标题更新)
                console.log('🔥 [连接后标题刷新-v1.3.92] 立即开始获取真实昵称并更新标题');
                this.fetchChatParticipantsWithRealNames();

                // 🔥 额外保险:延迟再次刷新,确保数据同步完成
                setTimeout(() => {
                  console.log('🔥 [连接后标题刷新-保险-v1.3.92] 二次刷新确保标题正确');
                  this.fetchChatParticipantsWithRealNames();
                }, 800);

                // 🔥 【CRITICAL-FIX-v4】A 端防重复系统消息机制
                console.log('🔥 [A端系统消息-v4] A端检测到B端加入,检查是否需要添加系统消息');

                // 🔥 【关键修复】检查是否已经添加过任何加入相关的系统消息
                const currentMessages = this.data.messages || [];
                const hasAnyJoinMessage = currentMessages.some(msg =>
                  msg.isSystem && (
                    msg.content.includes('加入聊天') ||
                    msg.content.includes('已加入聊天') ||
                    msg.content.includes('连接')
                  )
                );

                // 🔥 【双重保护】检查全局标记和时间间隔
                const hasAddedConnectionMessage = this.data.hasAddedConnectionMessage;
                const lastJoinMessageTime = this.data.lastJoinMessageTime || 0;
                const timeSinceLastJoin = Date.now() - lastJoinMessageTime;
                const recentJoinMessage = timeSinceLastJoin < 10000; // 10 秒内不重复添加

                console.log('🔥 [A端系统消息-v4] 重复检测:', {
                  hasAnyJoinMessage,
                  hasAddedConnectionMessage,
                  recentJoinMessage,
                  timeSinceLastJoin
                });

                // 🔧 使用统一工具函数判断占位符昵称
                const isPlaceholderNickname = this.isPlaceholderNickname(otherName);

                // 🔥 【HOTFIX-v1.3.64】如果是占位符昵称,延迟添加系统消息,先获取真实昵称
                if (isPlaceholderNickname) {
                  console.log('🔥 [A端系统消息-v1.3.64] 检测到占位符昵称,等待 fetchChatParticipantsWithRealNames 获取真实昵称');

                  // 🔥 【HOTFIX-v1.3.64】不再使用 debugUserDatabase,完全依赖 fetchChatParticipantsWithRealNames
                  // 延迟添加系统消息,等待 fetchChatParticipantsWithRealNames 完成后处理
                  setTimeout(() => {
                    console.log('🔥 [A端系统消息-v1.3.65] 延迟检查,准备添加系统消息');

                    // 🔥 【HOTFIX-v1.3.65】全局标记检查
                    if (this.aEndJoinMessageAdded) {
                      console.log('🔥 [A端系统消息-v1.3.65] ⚠️ 全局标记:已添加过加入消息,跳过延迟添加');
                      return;
                    }

                    // 🔥 【HOTFIX-v1.3.65】当前消息列表检查
                    const currentMessages = this.data.messages || [];
                    const existingJoinMessage = currentMessages.some(msg =>
                      msg.isSystem && msg.content && msg.content.includes('加入聊天') && !msg.content.includes('您创建了')
                    );

                    if (existingJoinMessage) {
                      console.log('🔥 [A端系统消息-v1.3.65] ⚠️ 检测到已有加入消息,跳过重复添加');
                      this.aEndJoinMessageAdded = true; // 设置全局标记
                      return;
                    }

                    // 从参与者列表获取最新的昵称
                    const participants = this.data.participants || [];
                    const otherP = participants.find(p => p.id !== currentUserOpenId && p.openId !== currentUserOpenId);
                    let finalName = null; // 避免使用"新用户"等占位符

                    if (otherP && otherP.nickName) {
                      // 收敛(S6):统一调权威检测器(原逐项 === 比较)
                      const isStillPlaceholder = this.isPlaceholderNickname(otherP.nickName);
                      if (!isStillPlaceholder) {
                        finalName = otherP.nickName;
                        console.log('🔥 [A端系统消息-v1.3.64] ✅ 从参与者列表获取到真实昵称:', finalName);
                      } else {
                        console.log('🔥 [A端系统消息-v1.3.64] ⚠️ 参与者列表仍为占位符,使用默认值');
                      }
                    }

                    // 🔥 【HOTFIX-v1.3.64】再次检查,确保在处理过程中没有其他地方添加
                    const latestMessages = this.data.messages || [];
                    const hasJoinMessage = latestMessages.some(msg =>
                      msg.isSystem && msg.content && msg.content.includes('加入聊天') && !msg.content.includes('您创建了')
                    );

                    if (hasJoinMessage) {
                      console.log('🔥 [A端系统消息-v1.3.64] ⚠️ 二次检查发现已有加入消息,跳过重复添加');
                      return;
                    }

                    // 使用真实昵称添加或更新系统消息(若仍为占位符则跳过此次添加)
                    if (!finalName || this.isPlaceholderNickname(finalName)) {
                      console.log('🔥 [A端系统消息-v1.3.94] 暂无真实昵称,跳过添加加入消息,等待下一次真实昵称获取');
                      return;
                    }
                    if (!hasAnyJoinMessage && !hasAddedConnectionMessage && !recentJoinMessage) {
                      const joinMessage = `${finalName}加入聊天`;
                      // 🔥 【HOTFIX-v1.3.66】A 端加入消息显示一段时间后自动淡出
                      this.addSystemMessage(joinMessage, {
                        autoFadeStaySeconds: 3,
                        fadeSeconds: 5
                      });

                      // 🔥 【HOTFIX-v1.3.65】设置全局标记和页面标记
                      this.aEndJoinMessageAdded = true;
                      this.setData({
                        hasAddedConnectionMessage: true,
                        lastJoinMessageTime: Date.now()
                      });

                      console.log('🔥 [A端系统消息-v1.3.65] ✅ A端系统消息已添加(真实昵称):', joinMessage);
                    } else {
                      // 替换创建消息为真实昵称的加入消息
                      this.replaceCreatorMessageWithJoinMessage(finalName);
                      this.aEndJoinMessageAdded = true; // 设置全局标记
                    }
                  }, 1000); // 等待 fetchChatParticipantsWithRealNames 完成
                } else {
                  // 🔥 【HOTFIX-v1.3.65】已有真实昵称,但需要先检查全局标记
                  if (this.aEndJoinMessageAdded) {
                    console.log('🔥 [A端系统消息-v1.3.65] ⚠️ 全局标记:已添加过加入消息,跳过');
                    return;
                  }

                  // 🔥 已有真实昵称,直接添加系统消息
                  if (!hasAnyJoinMessage && !hasAddedConnectionMessage && !recentJoinMessage) {
                    const joinMessage = `${otherName}加入聊天`;
                    // 🔥 【HOTFIX-v1.3.66】A 端加入消息显示一段时间后自动淡出
                    this.addSystemMessage(joinMessage, {
                      autoFadeStaySeconds: 3,
                      fadeSeconds: 5
                    });

                    // 🔥 【HOTFIX-v1.3.65】设置全局标记和页面标记防止重复
                    this.aEndJoinMessageAdded = true;
                    this.setData({
                      hasAddedConnectionMessage: true,
                      lastJoinMessageTime: Date.now()
                    });

                    console.log('🔥 [A端系统消息-v1.3.65] ✅ A端系统消息已添加:', joinMessage);

                    // 🔥 清理错误消息
                    setTimeout(() => {
                      this.cleanupWrongSystemMessages();
                    }, 200);
                  } else {
                    console.log('🔥 [A端系统消息-v1.3.63] 跳过重复添加系统消息 - 原因:', {
                      hasAnyJoinMessage: hasAnyJoinMessage ? '已有加入消息' : false,
                      hasAddedConnectionMessage: hasAddedConnectionMessage ? '已标记添加过' : false,
                      recentJoinMessage: recentJoinMessage ? '最近刚添加过' : false
                    });
                    // 🔥 即使不新增"加入聊天"消息,也要把"您创建了私密聊天"替换为"xx加入聊天"
                    this.replaceCreatorMessageWithJoinMessage(otherName);
                  }
                }

                // 🔥 【HOTFIX-v1.3.63】移除异步获取昵称的冗余代码,完全依赖 fetchChatParticipantsWithRealNames
                // 🔥 原有的 debugUserDatabase 调用已被移除,避免覆盖真实昵称
              }

              // 🔥 【HOTFIX-v1.3.6】暂时标记检测到参与者加入,稍后添加正确的系统消息
              if (!this.data.hasAddedConnectionMessage) {
                console.log('🔥 [发送方监听] 检测到新参与者加入,稍后添加正确的系统消息');
                // 暂时标记,避免重复检测
                this.setData({ hasAddedConnectionMessage: true });
              } else {
                console.log('🔥 [发送方监听] 防重复:已添加过连接消息,跳过');
              }

              // 🔥 【HOTFIX-v1.3.39】修复变量引用错误,使用正确的参与者列表
              setTimeout(() => {
                // 🔥 使用去重后的参与者列表查找对方
                const realOtherParticipant = deduplicatedParticipants.find(p =>
                  (p.id || p.openId) !== currentUserOpenId
                );
                if (realOtherParticipant && realOtherParticipant.nickName && realOtherParticipant.nickName !== '用户' && realOtherParticipant.nickName !== '好友') {
                  console.log('🔥 [发送方监听] 确认有真实参与者,立即获取详细信息');
                  this.fetchChatParticipantsWithRealNames();
                } else {
                  console.log('🔥 [发送方监听] 参与者信息不完整,保持当前状态');
                }
              }, 200); // 🔥 【HOTFIX-v1.3.55】大幅缩短延迟,加速标题刷新

              // 🔥 【HOTFIX-v1.3.5】发送方不获取历史消息,保持阅后即焚原则
              console.log('🔥 [发送方监听] 跳过获取历史消息,保持阅后即焚环境纯净');

              // 🔥 【HOTFIX-v1.3.27】确保消息监听器和轮询都正常运行,支持双向消息收发
              console.log('🔥 [发送方监听] 启动完整的消息接收机制');

              // 先停止可能存在的旧监听器,避免重复
              if (this.messageWatcher) {
                this.messageWatcher.close();
                this.messageWatcher = null;
              }

              // 启动新的消息监听器
              this.startMessageListener();

              // 🚨 【双向消息修复】发送方检测到对方加入后,也要启动轮询作为备用方案
              console.log('🔥 [发送方监听] 🔄 启动轮询备用方案,确保能接收对方消息');
              setTimeout(() => {
                this.startPollingMessages();
              }, 1000);

              // 🔗 [连接提示修复] 移除 Toast 提示,只保留系统消息
              console.log('🔗 [连接提示修复] ✅ 跳过"朋友已加入聊天"Toast提示,只保留系统消息');

              console.log('🔥 [发送方监听] 参与者加入处理完成');
              this.lastParticipantIds = uniqueParticipantIds;
              this.participantWatcherReady = true;
            } else {
              if (shouldSkipProcessing) {
                console.log('🔥 [发送方监听] 🎯 稳定的2人聊天,跳过重复处理');
                console.log('🔥 [发送方监听] - 当前参与者数量:', currentParticipants.length);
                console.log('🔥 [发送方监听] - 去重后参与者数量:', deduplicatedParticipants.length);
                console.log('🔥 [发送方监听] - 是否有真正新参与者:', hasRealNewParticipant);
              } else {
                console.log('🔥 [发送方监听] 🔍 未检测到真正的新参与者或数据重复');
                console.log('🔥 [发送方监听] 原因分析:');
                console.log('🔥 [发送方监听] - 是否有真正新参与者:', hasRealNewParticipant);
                console.log('🔥 [发送方监听] - 去重后参与者数量:', deduplicatedParticipants.length);
                console.log('🔥 [发送方监听] - 原始参与者数量:', newParticipants.length);
                console.log('🔥 [发送方监听] 继续监听等待真正的参与者加入...');
              }
              console.log('🔥 [发送方监听] 条件不足,不触发新参与者逻辑:', {
                hasBrandNewParticipant,
                otherHasConfirmedJoinFlag,
                shouldProcessNewParticipant,
                hasCandidate: !!otherParticipantCandidate
              });
              this.lastParticipantIds = uniqueParticipantIds;
              this.participantWatcherReady = true;
              syncParticipantsWithoutJoin('pending-join');
              return;
            }
          } else {
            console.log('🔥 [发送方监听] 未获取到 conversation 文档');
          }
        },
        onError: err => {
          console.error('🔥 [发送方监听] 监听器错误:', err);

          // 发生错误时尝试重启监听
          setTimeout(() => {
            console.log('🔥 [发送方监听] 尝试重新启动监听器');
            this.startParticipantListener(chatId);
          }, 3000);
        }
      });

    console.log('🔥 [发送方监听] 参与者监听器启动成功');

  } catch (err) {
    console.error('🔥 [发送方监听] 启动监听器失败:', err);
  }
}

/**
 * 启动监听新参与者加入(备用方案)
 *
 * 与 startParticipantListener 类似,但更简化。被部分历史路径调用。
 *
 * @param {string} chatId - 聊天 ID
 */
function startWatchingForNewParticipants(chatId) {
  console.log('🎯 [发送方] 开始监听新参与者加入,chatId:', chatId);

  try {
    // 先清理可能存在的旧监听器
    if (this.participantWatcher) {
      this.participantWatcher.close();
      this.participantWatcher = null;
    }

    const db = wx.cloud.database();

    // 监听 conversations 集合的变化
    this.participantWatcher = db.collection('conversations')
      .doc(chatId)
      .watch({
        onChange: snapshot => {
          console.log('🎯 [发送方] 监听到参与者变化:', snapshot);

          if (snapshot.type === 'init') {
            console.log('🎯 [发送方] 参与者监听器初始化');
            return;
          }

          // 获取最新的文档数据
          if (snapshot.docs && snapshot.docs.length > 0) {
            const conversation = snapshot.docs[0];
            const participants = conversation.participants || [];

            console.log('🎯 [发送方] 检测到参与者列表更新:', participants);
            console.log('🎯 [发送方] 当前本地参与者数量:', this.data.participants.length);

            // 🔥 检查是否有新参与者加入
            if (participants.length > this.data.participants.length) {
              console.log('🎯 [发送方] 检测到新参与者加入!');

              const app = getApp();
              const currentUserOpenId = app.globalData.userInfo.openId;

              // 🔥 先更新用户信息到数据库
              this.updateUserInfoInDatabase();

              // 🔥 【HOTFIX-v1.3.55】立即获取完整的参与者信息,确保标题即时刷新
              console.log('🔥 [接收方监听] 立即获取参与者信息并刷新标题');
              this.fetchChatParticipantsWithRealNames();

              // 🔥 保险机制:短延迟后再次确认
              setTimeout(() => {
                console.log('🔥 [接收方监听-保险] 二次确认参与者信息');
                this.fetchChatParticipantsWithRealNames();
              }, 300);

              // 🔥 延迟获取聊天记录,确保能看到对方的消息
              setTimeout(() => {
                this.fetchMessages();
                // 启动实时消息监听
                this.startMessageListener();
              }, 1000);

              // 🔗 [连接提示修复] 不显示"好友已加入!"提示,避免重复
              console.log('🔗 [连接提示修复] ✅ 跳过"好友已加入!"提示,避免重复');

              // 🔥 持续监听而不是立即关闭,以便后续还能检测到更多变化
              console.log('🎯 [发送方] 继续保持监听,等待更多参与者或消息');
            }
          }
        },
        onError: err => {
          console.error('🎯 [发送方] 参与者监听出错:', err);
        }
      });

    console.log('🎯 [发送方] 参与者监听器启动成功');
  } catch (err) {
    console.error('🎯 [发送方] 设置参与者监听失败:', err);
  }
}

/**
 * 获取聊天参与者信息(callFunction:getChatParticipants)
 *
 * 一次性获取参与者并标准化字段,然后调用 updateDynamicTitle 刷新标题。
 * 失败时尝试 inferParticipantsFromMessages 兜底。
 */
function fetchChatParticipants() {
  const chatId = this.data.contactId;
  if (!chatId) return;

  console.log('👥 [统一版本] 获取聊天参与者信息,chatId:', chatId);

  wx.cloud.callFunction({
    name: 'getChatParticipants',
    data: {
      chatId: chatId
    },
    success: res => {
      console.log('👥 [统一版本] 获取参与者成功:', res);

      if (res.result && res.result.success && res.result.participants) {
        const participants = res.result.participants;
        const currentUserOpenId = this.data.currentUser?.openId;

        console.log('👥 [统一版本] 原始参与者数据:', participants);
        console.log('👥 [统一版本] 当前用户OpenId:', currentUserOpenId);

        // 标准化参与者数据,确保字段统一
        const normalizedParticipants = participants.map(p => {
          const participantOpenId = p.id || p.openId;
          const normalized = {
            id: participantOpenId,
            openId: participantOpenId,
            nickName: p.nickName || p.name || '用户',
            avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
            isCreator: p.isCreator || false,
            isJoiner: p.isJoiner || false,
            isSelf: participantOpenId === currentUserOpenId
          };

          console.log('👥 [统一版本] 标准化参与者:', {
            原始: p,
            标准化: normalized,
            是否当前用户: normalized.isSelf
          });

          return normalized;
        });

        console.log('👥 [统一版本] 最终标准化参与者列表:', normalizedParticipants);

        // 更新参与者列表
        this.setData({
          participants: normalizedParticipants
        });

        // 更新动态标题
        this.updateDynamicTitle();
      } else {
        console.log('👥 [统一版本] 获取参与者失败,尝试备用方案');

        // 如果获取失败,确保至少有当前用户在参与者列表中
        const currentUser = this.data.currentUser;
        if (currentUser && this.data.participants.length === 0) {
          console.log('👥 [统一版本] 使用当前用户作为默认参与者');
          this.setData({
            participants: [currentUser]
          });
          this.updateDynamicTitle();
        }

        // 同时尝试从消息推断参与者
        setTimeout(() => {
          this.inferParticipantsFromMessages();
        }, 1000);
      }
    },
    fail: err => {
      console.error('👥 [统一版本] 获取参与者请求失败:', err);
      console.log('👥 [统一版本] 网络错误,尝试备用方案');

      // 网络错误时,尝试从消息推断参与者
      this.inferParticipantsFromMessages();
    }
  });
}

/**
 * 🔧 清理参与者重复数据(用户主动触发,弹窗确认)
 *
 * 调用云函数 forceCleanup 模式 + 前端再次去重 + 更新标题。
 */
function cleanupDuplicateParticipants() {
  console.log('🔧 [清理重复] 开始清理参与者重复数据');

  wx.showModal({
    title: '清理重复参与者',
    content: '检测到参与者数据异常,是否清理重复数据?',
    confirmText: '立即清理',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        const chatId = this.data.contactId;
        const currentUser = this.data.currentUser;

        console.log('🔧 [清理重复] 开始调用云函数清理...');

        // 调用云函数强制清理重复参与者
        wx.cloud.callFunction({
          name: 'getChatParticipants',
          data: {
            chatId: chatId,
            forceCleanup: true // 强制清理模式
          },
          success: res => {
            console.log('🔧 [清理重复] 云函数调用成功:', res);

            if (res.result && res.result.participants) {
              const participants = res.result.participants;

              // 🔥 前端再次去重,确保万无一失
              const uniqueParticipants = [];
              const seenIds = new Set();

              for (const participant of participants) {
                const participantId = participant.id || participant.openId;
                if (!seenIds.has(participantId)) {
                  seenIds.add(participantId);
                  uniqueParticipants.push({
                    ...participant,
                    isSelf: participantId === currentUser?.openId
                  });
                }
              }

              console.log('🔧 [清理重复] 最终去重结果:', uniqueParticipants.length, '人');

              // 更新页面数据
              this.setData({
                participants: uniqueParticipants
              });

              // 🔥 如果是接收方,解除锁定并重新更新标题
              if (this.receiverTitleLocked && uniqueParticipants.length === 2) {
                console.log('🔧 [清理重复] 重新更新接收方标题');
                this.updateReceiverTitleWithRealNames();
              } else if (!this.receiverTitleLocked) {
                // 发送方模式,更新标题
                console.log('🔧 [清理重复] 重新更新发送方标题');
                this.updateDynamicTitle();
              }

              wx.showToast({
                title: `清理完成,当前${uniqueParticipants.length}人`,
                icon: 'success',
                duration: 2000
              });
            }
          },
          fail: err => {
            console.error('🔧 [清理重复] 云函数调用失败:', err);
            wx.showToast({
              title: '清理失败',
              icon: 'error'
            });
          }
        });
      }
    }
  });
}

/**
 * 🔥 【参与者去重修复】去重参与者,解决重复参与者导致的标题错误
 *
 * 在 updateDynamicTitle / updateDynamicTitleWithRealNames 中被调用,
 * 是参与者数量异常时的自动修复路径。
 *
 * 步骤:
 * 1. 强制保留当前用户(如果没有,手动添加)
 * 2. 智能选择对方参与者(发送方优先选真实微信用户/接收方优先选向冬)
 * 3. 根据去重后的参与者数量重置标题
 */
function deduplicateParticipants() {
  console.log('🔧 [参与者去重] ==================== 开始参与者去重处理 ====================');

  const { participants, currentUser } = this.data;
  var currentUserOpenId = currentUser?.openId
    || getApp().globalData.userInfo?.openId
    || getApp().globalData.openId
    || wx.getStorageSync('openId');

  console.log('🔧 [参与者去重] 原始参与者数量:', participants.length);
  console.log('🔧 [参与者去重] 原始参与者列表:', participants);

  if (!participants || participants.length <= 2) {
    console.log('🔧 [参与者去重] 参与者数量正常,无需去重');
    return;
  }

  // 🚨 【强化去重修复】严格按 openId 去重,保留最新的信息
  const uniqueParticipants = [];
  const seenOpenIds = new Set();

  // 🔥 【Step 1】先强制添加当前用户
  let currentUserAdded = false;
  for (const participant of participants) {
    const openId = participant.openId || participant.id;
    if (openId === currentUserOpenId && !currentUserAdded) {
      seenOpenIds.add(openId);
      uniqueParticipants.push({
        ...participant,
        isSelf: true,
        nickName: participant.nickName || this.data.currentUser?.nickName || '我'
      });
      currentUserAdded = true;
      console.log('🔧 [参与者去重] ✅ 强制保留当前用户:', openId, participant.nickName);
      break;
    }
  }

  // 🔥 【Step 2】如果当前用户没有在参与者列表中,手动添加
  if (!currentUserAdded && currentUserOpenId) {
    const currentUserInfo = this.data.currentUser;
    uniqueParticipants.push({
      id: currentUserOpenId,
      openId: currentUserOpenId,
      nickName: currentUserInfo.nickName,
      avatarUrl: currentUserInfo.avatarUrl,
      isSelf: true,
      isCreator: true,
      isJoiner: false
    });
    seenOpenIds.add(currentUserOpenId);
    console.log('🔧 [参与者去重] ✅ 手动添加当前用户:', currentUserOpenId);
  }

  // 🔥 【Step 3】添加其他唯一参与者(智能选择最新的参与者)
  let otherParticipantAdded = false;

  // 🔥 【修复标题错误】优先选择最新加入的参与者,而不是第一个
  const otherParticipants = participants.filter(p => {
    const openId = p.openId || p.id;
    return openId && !seenOpenIds.has(openId) && openId !== currentUserOpenId;
  });

  console.log('🔧 [参与者去重] 发现其他参与者:', otherParticipants.length, '个');
  otherParticipants.forEach((p, index) => {
    console.log(`🔧 [参与者去重] 其他参与者${index}:`, p.openId || p.id, p.nickName || p.name, p.joinTime || '无时间');
  });

  if (otherParticipants.length > 0) {
    // 🔥 【智能选择】选择最新的参与者(通过 openId 特征判断)
    let selectedParticipant = otherParticipants[0];

    // 🔥 【HOTFIX-v1.3.5】智能选择对方参与者
    const currentUser = this.data.currentUser;
    const isSender = currentUser && currentUser.nickName === '向冬';

    if (isSender) {
      // 发送方:优先选择真实微信用户(接收方)
      const realWechatParticipant = otherParticipants.find(p =>
        p.openId && p.openId.startsWith('ojtOs') && p.nickName && p.nickName !== '向冬'
      );

      if (realWechatParticipant) {
        selectedParticipant = realWechatParticipant;
        console.log('🔧 [参与者去重] ✅ 发送方选择真实微信用户(接收方):', selectedParticipant.openId || selectedParticipant.id, selectedParticipant.nickName || selectedParticipant.name);
      } else {
        console.log('🔧 [参与者去重] ⚠️ 发送方未找到真实微信用户,使用第一个:', selectedParticipant.openId || selectedParticipant.id, selectedParticipant.nickName || selectedParticipant.name);
      }
    } else {
      // 接收方:优先选择发送方(向冬)
      const senderParticipant = otherParticipants.find(p =>
        p.nickName === '向冬' || (p.openId && p.openId.startsWith('local_'))
      );

      if (senderParticipant) {
        selectedParticipant = senderParticipant;
        console.log('🔧 [参与者去重] ✅ 接收方选择发送方(向冬):', selectedParticipant.openId || selectedParticipant.id, selectedParticipant.nickName || selectedParticipant.name);
      } else {
        console.log('🔧 [参与者去重] ⚠️ 接收方未找到发送方,使用第一个:', selectedParticipant.openId || selectedParticipant.id, selectedParticipant.nickName || selectedParticipant.name);
      }
    }

    // 添加选中的参与者
    seenOpenIds.add(selectedParticipant.openId || selectedParticipant.id);
    uniqueParticipants.push({
      ...selectedParticipant,
      isSelf: false
    });
    otherParticipantAdded = true;
    console.log('🔧 [参与者去重] ✅ 保留选中的其他参与者:', selectedParticipant.openId || selectedParticipant.id, selectedParticipant.nickName || selectedParticipant.name);

    // 跳过其他参与者
    otherParticipants.forEach(p => {
      if (p.openId !== selectedParticipant.openId && p.id !== selectedParticipant.id) {
        console.log('🔧 [参与者去重] ❌ 跳过多余参与者:', p.openId || p.id, p.nickName || p.name);
      }
    });
  }

  console.log('🔧 [参与者去重] 去重后参与者数量:', uniqueParticipants.length);
  console.log('🔧 [参与者去重] 去重后参与者列表:', uniqueParticipants);

  // 更新参与者列表
  this.setData({
    participants: uniqueParticipants
  });

  // 🚨 【关键修复】根据去重后的参与者数量重新设置标题
  if (uniqueParticipants.length === 2) {
    console.log('🔧 [参与者去重] 去重后为2人聊天,立即更新标题');

    // 找到对方参与者
    const otherParticipant = uniqueParticipants.find(p => {
      const pOpenId = p.openId || p.id;
      return pOpenId !== currentUserOpenId;
    });

    if (otherParticipant) {
      let otherName = otherParticipant.nickName || otherParticipant.name;

      // 🔥 【HOTFIX-v1.3.6】智能获取对方真实昵称
      const currentUser = this.data.currentUser;
      const isFromInvite = this.data.isFromInvite;
      const isSender = !isFromInvite; // 🔥 修复:使用准确的身份判断

      console.log('🔧 [参与者去重] 当前用户身份:', isSender ? '发送方' : '接收方');
      console.log('🔧 [参与者去重] 对方参与者原始信息:', otherParticipant);

      if (isSender) {
        // 🔥 发送方:对方应该是接收方,尝试获取真实昵称
        if (!otherName || otherName === '用户' || otherName === '朋友' || otherName === 'Y.') {
          // 尝试从 URL 参数获取邀请者昵称(这是接收方的昵称)
          const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
          if (urlParams.inviter) {
            try {
              const decodedInviter = decodeURIComponent(decodeURIComponent(urlParams.inviter));
              if (decodedInviter && decodedInviter !== '好友' && decodedInviter !== '朋友') {
                otherName = decodedInviter;
                console.log('🔧 [参与者去重] 发送方从URL获取到接收方真实昵称:', otherName);
              }
            } catch (e) {
              console.log('🔧 [参与者去重] URL解码失败:', e);
            }
          }

          // 🔥 【HOTFIX-v1.3.7】发送方应显示接收方真实昵称,不使用默认值
          if (!otherName) {
            // 如果没有昵称,尝试从原始数据获取
            otherName = otherParticipant.nickName || otherParticipant.name || 'Y.';
            console.log('🔧 [参与者去重] 发送方获取接收方真实昵称:', otherName);
          }

          // 保持接收方真实昵称,不替换为"好友"
          console.log('🔧 [参与者去重] 发送方最终显示昵称:', otherName);
        }
      } else {
        // 🔥 【HOTFIX-v1.3.8】接收方:智能识别发送方真实昵称
        if (!otherName || otherName === '用户' || otherName === '朋友') {
          // 🔥 尝试从参与者信息中找到发送方的真实昵称
          let senderName = null;

          // 遍历所有参与者,寻找非当前用户的参与者
          const allParticipants = this.data.participants || [];
          const currentUserOpenId = this.data.currentUser?.openId;

          for (const participant of allParticipants) {
            const participantId = participant.openId || participant.id;
            if (participantId !== currentUserOpenId) {
              const participantName = participant.nickName || participant.name;
              // 如果找到真实的发送方昵称(不是默认值)
              if (participantName && participantName !== '用户' && participantName !== '朋友') {
                senderName = participantName;
                console.log('🔧 [参与者去重] 接收方从参与者列表找到发送方真实昵称:', senderName);
                break;
              }
            }
          }

          // 🔥 如果找到了真实昵称,使用它;否则保持原有昵称
          if (senderName) {
            otherName = senderName;
            console.log('🔧 [参与者去重] 接收方使用找到的发送方昵称:', otherName);
          } else {
            // 保持原有昵称,不强制替换
            otherName = otherParticipant.nickName || otherParticipant.name || '好友';
            console.log('🔧 [参与者去重] 接收方保持原有昵称:', otherName);
          }
        }
      }

      // 更新参与者信息
      if (otherName !== (otherParticipant.nickName || otherParticipant.name)) {
        const updatedParticipants = uniqueParticipants.map(p => {
          if ((p.openId || p.id) === (otherParticipant.openId || otherParticipant.id)) {
            return {
              ...p,
              nickName: otherName,
              name: otherName
            };
          }
          return p;
        });

        this.setData({
          participants: updatedParticipants
        });

        console.log('🔧 [参与者去重] 已更新对方参与者昵称为:', otherName);
      }

      otherName = otherName || '好友';
      const newTitle = `我和${otherName}（2）`;

      console.log('🔧 [参与者去重] 更新标题为:', newTitle);

      // 统一更新标题
      this.setData({
        dynamicTitle: newTitle,
        contactName: newTitle,
        chatTitle: newTitle
      });

      // 更新导航栏
      wx.setNavigationBarTitle({
        title: newTitle,
        success: () => {
          console.log('🔧 [参与者去重] ✅ 标题更新成功:', newTitle);

          // 🔥 【HOTFIX-v1.3.49】强制刷新页面确保标题生效
          this.setData({
            dynamicTitle: newTitle,
            chatTitle: newTitle,
            contactName: newTitle
          }, () => {
            console.log('🔧 [参与者去重] ✅ 页面数据强制刷新完成:', newTitle);
          });
        }
      });
    }
  } else if (uniqueParticipants.length === 1) {
    console.log('🔧 [参与者去重] 去重后只有自己,显示自己昵称');
    const title = this.data.currentUser?.nickName || '我';
    this.setData({
      dynamicTitle: title,
      contactName: title,
      chatTitle: title
    });
    wx.setNavigationBarTitle({ title: title });
  }

  console.log('🔧 [参与者去重] ==================== 参与者去重处理完成 ====================');

  // 🔥 【移除无限循环】不再自动调用昵称修复,避免循环调用
}

/**
 * 🔥 获取聊天参与者信息(包含真实昵称)— async 版本
 *
 * 这是 chat.js 单方法行数之最(原 642 行)。是参与者刷新的"主路径"。流程概要:
 * 1. 频率限制(1 秒内只能调用一次,可通过 force=true 跳过)
 * 2. 用户信息恢复(globalData → wx.storage → login 云函数兜底)
 * 3. 调云函数 getChatParticipants
 * 4. 标准化参与者数据
 * 5. 立即更新 dynamicTitle
 * 6. 双端身份判断 → 添加正确的系统消息(A 端 / B 端)
 * 7. B 端如果遇到占位符昵称,启动 500ms 间隔的重试机制(最多 10 次/5 秒)
 *
 * @param {boolean} [force=false] - 是否强制刷新(忽略频率限制和处理中标记)
 */
async function fetchChatParticipantsWithRealNames(force = false) {
  const chatId = this.data.contactId;
  if (!chatId) return;

  console.log('👥 [真实昵称-v1.3.71] 获取聊天参与者信息,chatId:', chatId);

  // 🔥 【鲁棒性】防止重复调用:1 秒内只允许调用一次(可强制刷新)
  const now = Date.now();
  if (!force) {
    if (this._lastFetchParticipantsTime && (now - this._lastFetchParticipantsTime) < 1000) {
      console.log('👥 [真实昵称] 调用过于频繁,跳过本次请求');
      return;
    }
  } else {
    console.log('👥 [真实昵称] ⚠️ 强制刷新参与者信息,忽略频率限制');
  }
  this._lastFetchParticipantsTime = now;

  // 🔥 【HOTFIX-v1.3.71】在函数最开始就进行全局防重复检查,避免重复添加系统消息
  // 如果正在处理系统消息,直接返回
  if (this._fetchingSystemMessage && !force) {
    console.log('👥 [防重复-v1.3.71] ⚠️ 正在处理系统消息,跳过重复调用');
    return;
  }

  // 🔧 确保用户信息初始化
  const app = getApp();
  let currentUser = this.data.currentUser;

  if (!currentUser || !currentUser.openId) {
    console.log('👥 [真实昵称] 当前用户信息缺失,尝试恢复');
    // 尝试从全局获取
    if (app.globalData.userInfo && app.globalData.userInfo.openId) {
      currentUser = app.globalData.userInfo;
      this.setData({ currentUser });
    } else {
      // 尝试从本地存储恢复
      try {
        const savedUserInfo = wx.getStorageSync('userInfo');
        const savedOpenId = wx.getStorageSync('openId');

        if (savedUserInfo && savedOpenId) {
          currentUser = { ...savedUserInfo, openId: savedOpenId };
          app.globalData.userInfo = currentUser;
          app.globalData.openId = savedOpenId;
          this.setData({ currentUser });
          console.log('👥 [真实昵称] 用户信息恢复成功:', currentUser);
        }
      } catch (e) {
        console.error('👥 [真实昵称] 恢复用户信息失败:', e);
      }
    }
  }

  // 兜底:调用 login 云函数获取真实 openId,避免使用硬编码占位用户
  if (!currentUser || !currentUser.openId) {
    console.log('👥 [真实昵称] 本地恢复失败,调用login云函数获取openId');
    try {
      const loginRes = await wx.cloud.callFunction({ name: 'login' });
      const loginUserInfo = loginRes?.result?.userInfo;
      const resolvedOpenId = loginUserInfo?.openId;

      if (!resolvedOpenId) {
        console.warn('👥 [真实昵称] login云函数未返回openId,终止本次获取参与者流程');
        return;
      }

      currentUser = {
        ...(currentUser || {}),
        ...loginUserInfo,
        openId: resolvedOpenId
      };
      app.globalData.userInfo = currentUser;
      app.globalData.openId = resolvedOpenId;
      this.setData({ currentUser });
      try {
        wx.setStorageSync('userInfo', currentUser);
        wx.setStorageSync('openId', resolvedOpenId);
      } catch (storageErr) {
        console.warn('⚠️ [真实昵称] 写入用户信息到本地存储失败:', storageErr);
      }
      console.log('👥 [真实昵称] 通过login云函数获取并缓存用户信息:', currentUser);
    } catch (loginErr) {
      console.error('👥 [真实昵称] login云函数调用失败,终止本次参与者获取:', loginErr);
      return;
    }
  }

  wx.cloud.callFunction({
    name: 'getChatParticipants',
    data: {
      chatId: chatId
    },
    success: res => {
      console.log('👥 [真实昵称] 获取参与者成功:', res);

      if (res.result && res.result.success && res.result.participants) {
        const participants = res.result.participants;
        var currentUserOpenId = currentUser?.openId
          || getApp().globalData.userInfo?.openId
          || getApp().globalData.openId
          || wx.getStorageSync('openId');

        console.log('👥 [真实昵称] 原始参与者数据:', participants);
        console.log('👥 [真实昵称] 当前用户OpenId:', currentUserOpenId);

        // 标准化参与者数据,确保字段统一
        const normalizedParticipants = participants.map(p => {
          const participantOpenId = p.id || p.openId;
          let nickName = p.nickName || p.name || '用户';

          // 🔧 如果是对方用户且昵称为"用户",尝试从本地缓存或 URL 参数获取真实昵称
          if (participantOpenId !== currentUserOpenId && nickName === '用户') {
            // 尝试从 URL 参数获取邀请者信息
            const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
            if (urlParams.inviter) {
              try {
                const decodedInviter = decodeURIComponent(decodeURIComponent(urlParams.inviter));
                if (decodedInviter && decodedInviter !== '好友' && decodedInviter !== '朋友') {
                  nickName = decodedInviter;
                  console.log('👥 [真实昵称] 从URL参数修复昵称:', decodedInviter);
                }
              } catch (e) {
                console.log('👥 [真实昵称] URL解码失败:', e);
              }
            }

            // 🔧 触发用户信息更新到数据库,以便下次查询时能获取到正确信息
            this.updateSpecificUserInfo(participantOpenId, nickName);
          }

          const normalized = {
            id: participantOpenId,
            openId: participantOpenId,
            nickName: nickName,
            avatarUrl: p.avatarUrl || p.avatar || '/assets/images/default-avatar.png',
            isCreator: p.isCreator || false,
            isJoiner: p.isJoiner || false,
            isSelf: participantOpenId === currentUserOpenId
          };

          console.log('👥 [真实昵称] 标准化参与者:', {
            原始: p,
            标准化: normalized,
            是否当前用户: normalized.isSelf
          });

          return normalized;
        });

        console.log('👥 [真实昵称] 最终标准化参与者列表:', normalizedParticipants);

        // 更新参与者列表
        this.setData({
          participants: normalizedParticipants
        });

        // 🔥 【HOTFIX-v1.3.55】立即使用真实姓名更新动态标题,无延迟处理
        console.log('👥 [标题更新] 立即开始标题更新逻辑');
        // 🔗 检查是否是接收方,如果是则使用专门的接收方标题更新逻辑
        const newParticipant = normalizedParticipants.find(p => !p.isSelf);

        // 🔥 根据当前用户身份更新标题
        const isFromInvite = this.data.isFromInvite;

        if (isFromInvite && newParticipant && normalizedParticipants.length === 2) {
          // 🔥 接收方使用真实昵称更新(如果有的话)
          console.log('👥 [标题更新] 检测到接收方,首先尝试用真实昵称更新标题');
          console.log('👥 [标题更新] 对方参与者信息:', newParticipant);

          // 🔥 【修复 b 端标题】强制从 URL 参数获取真实昵称
          const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
          let realInviterName = null;

          if (urlParams.inviter) {
            try {
              realInviterName = decodeURIComponent(decodeURIComponent(urlParams.inviter));
              console.log('👥 [标题更新] 从URL解码邀请者昵称:', realInviterName);

              // 验证昵称有效性
              if (realInviterName &&
                  realInviterName !== '朋友' &&
                  realInviterName !== '好友' &&
                  realInviterName !== '邀请者' &&
                  realInviterName !== '用户') {
                console.log('👥 [标题更新] ✅ URL昵称有效,立即更新接收方标题');

                const receiverTitle = `我和${realInviterName}（2）`;
                this.setData({
                  dynamicTitle: receiverTitle,
                  contactName: receiverTitle,
                  chatTitle: receiverTitle
                });

                wx.setNavigationBarTitle({
                  title: receiverTitle,
                  success: () => {
                    console.log('👥 [标题更新] ✅ 接收方标题更新成功:', receiverTitle);
                  }
                });

                return; // 成功更新后直接返回
              }
            } catch (e) {
              console.log('👥 [标题更新] URL解码失败:', e);
            }
          }

          // 🔥 【CRITICAL-FIX】如果 URL 昵称无效,智能尝试多种方式获取真实昵称
          if (newParticipant.nickName &&
              newParticipant.nickName !== '用户' &&
              newParticipant.nickName !== '朋友' &&
              newParticipant.nickName !== '好友') {
            console.log('👥 [标题更新] 使用参与者昵称更新接收方标题:', newParticipant.nickName);

            // 🔥 直接使用参与者昵称更新标题,避免调用可能出错的函数
            const receiverTitle = `我和${newParticipant.nickName}（2）`;
            this.setData({
              dynamicTitle: receiverTitle,
              contactName: receiverTitle,
              chatTitle: receiverTitle
            });

            wx.setNavigationBarTitle({
              title: receiverTitle,
              success: () => {
                console.log('👥 [标题更新] ✅ B端标题更新成功(参与者昵称):', receiverTitle);
              }
            });
          } else {
            // 🔥 【HOTFIX-v1.3.64】B 端获取到占位符昵称时,启动持续重试机制
            console.log('👥 [标题更新-v1.3.64] B端获取到占位符昵称,启动持续重试');

            // 🔥 先尝试从存储的邀请信息获取
            const inviteInfo = wx.getStorageSync('inviteInfo');
            let fallbackName = null;

            if (inviteInfo && inviteInfo.inviterNickName &&
                inviteInfo.inviterNickName !== '朋友' &&
                inviteInfo.inviterNickName !== '好友' &&
                inviteInfo.inviterNickName !== '邀请者' &&
                inviteInfo.inviterNickName !== '用户') {
              fallbackName = inviteInfo.inviterNickName;
              console.log('👥 [标题更新-v1.3.64] 从存储获取到邀请者昵称:', fallbackName);
            }

            // 🔥 【FIX-v2.1】使用获取到的昵称,或通用占位符(不再显示自己昵称)
            const finalInviterName = fallbackName || '朋友';
            const receiverTitle = `我和${finalInviterName}（2）`;

            // 🔥 【HOTFIX-v1.3.64】启动持续重试机制,每 500ms 重试一次,直到获取到真实昵称
            if (!fallbackName && !this.bEndTitleRetryTimer) {
              let retryCount = 0;
              const maxRetries = 10; // 最多重试 10 次(5 秒)

              this.bEndTitleRetryTimer = setInterval(() => {
                retryCount++;
                console.log(`👥 [B端标题重试-v1.3.64] 第${retryCount}次重试获取真实昵称`);

                if (retryCount >= maxRetries) {
                  clearInterval(this.bEndTitleRetryTimer);
                  this.bEndTitleRetryTimer = null;
                  console.log('👥 [B端标题重试-v1.3.64] ⚠️ 已达最大重试次数');
                  return;
                }

                // 重新调用获取参与者
                this.fetchChatParticipantsWithRealNames();

                // 检查是否已经获取到真实昵称
                const currentParticipants = this.data.participants || [];
                const otherParticipant = currentParticipants.find(p => !p.isSelf);
                if (otherParticipant && otherParticipant.nickName &&
                    otherParticipant.nickName !== '用户' &&
                    otherParticipant.nickName !== '朋友' &&
                    otherParticipant.nickName !== '好友') {
                  console.log(`👥 [B端标题重试-v1.3.64] ✅ 第${retryCount}次重试成功,获取到真实昵称:`, otherParticipant.nickName);
                  clearInterval(this.bEndTitleRetryTimer);
                  this.bEndTitleRetryTimer = null;
                }
              }, 500);
            }

            this.setData({
              dynamicTitle: receiverTitle,
              contactName: receiverTitle,
              chatTitle: receiverTitle
            });

            wx.setNavigationBarTitle({
              title: receiverTitle,
              success: () => {
                console.log('👥 [标题更新] ✅ B端标题更新成功(备选方案):', receiverTitle);
              }
            });

            console.log('👥 [标题更新] 备选方案完成,昵称:', finalInviterName);
          }
        } else if (!isFromInvite) {
          // 🔥 【HOTFIX-v1.3.24】发送方智能标题更新,防止重置为单人状态
          console.log('👥 [标题更新] 发送方模式,检查是否需要更新标题');

          // 检查当前参与者状态
          const currentParticipantCount = this.data.participants ? this.data.participants.length : 1;
          console.log('👥 [标题更新] 当前参与者数量:', currentParticipantCount);
          console.log('👥 [标题更新] 云函数返回参与者数量:', normalizedParticipants.length);

          // 🔥 如果当前已经是双人状态,且云函数返回的是单人,说明数据不完整,保持双人标题
          if (currentParticipantCount >= 2 && normalizedParticipants.length < 2) {
            console.log('👥 [标题更新] ⚠️ 检测到数据不完整,保持当前双人标题,不执行重置');
          } else if (normalizedParticipants.length >= 2) {
            // 只有确认有多个参与者时才更新标题
            console.log('👥 [标题更新] ✅ 确认双人状态,更新标题');
            this.updateDynamicTitleWithRealNames();
          } else {
            console.log('👥 [标题更新] ⏸️ 参与者数据不足,跳过标题更新');
          }

          // 🔥 如果参与者数量刚好变为 2,说明刚有人加入,额外强调
          if (normalizedParticipants.length === 2 && newParticipant) {
            console.log('👥 [标题更新] 🎉 发送方检测到接收方加入,标题已更新为双人模式');
          }
        } else {
          console.log('👥 [标题更新] 跳过标题更新 - 其他情况');
        }

        // 🔥 智能系统消息逻辑:根据用户身份显示不同的消息
        // 重用已声明的 newParticipant 变量
        if (newParticipant && normalizedParticipants.length === 2) {
          console.log('👥 [真实昵称] 新参与者:', newParticipant);

          // 🔧 【HOTFIX-v1.3.70】使用身份双重验证,避免依赖可能丢失的 data 值
          const urlParams = getCurrentPages()[getCurrentPages().length - 1].options || {};
          const hasInviteParams = !!urlParams.inviter;

          // 🔥 【可靠身份判断】优先使用全局标记和多重验证
          const isFromInviteCheck = this.data.isFromInvite;
          const isSenderCheck = this.data.isSender;
          const isDefinitelyBSide = isFromInviteCheck || (hasInviteParams && !isSenderCheck);
          const isDefinitelyASide = isSenderCheck || (!isFromInviteCheck && !hasInviteParams);

          console.log('👥 [身份验证-v1.3.70] 详细信息:', {
            isFromInvite: isFromInviteCheck,
            isSender: isSenderCheck,
            hasInviteParams,
            isDefinitelyBSide,
            isDefinitelyASide,
            aEndJoinMessageAdded: this.aEndJoinMessageAdded,
            bEndSystemMessageProcessed: this.bEndSystemMessageProcessed
          });

          // 🔥 【优先检查】A 端全局标记防重复
          if (isDefinitelyASide && this.aEndJoinMessageAdded) {
            console.log('👥 [系统消息检查-v1.3.70] ⚠️ A端全局标记:已添加过系统消息,跳过所有后续逻辑');
            return; // 直接返回,不再执行任何系统消息相关逻辑
          }

          // 🔥 【优先检查】B 端全局标记防重复
          if (isDefinitelyBSide && this.bEndSystemMessageProcessed) {
            console.log('👥 [系统消息检查-v1.3.70] ⚠️ B端全局标记:已处理过系统消息,跳过所有后续逻辑');
            return; // 直接返回,不再执行任何系统消息相关逻辑
          }

          // 🔧 【关键修复】检查并更新不准确的系统消息
          const currentMessages = this.data.messages || [];

          // 🔥 查找需要更新的临时或错误系统消息
          const tempJoinMessage = currentMessages.find(msg =>
            msg.isSystem && isPlaceholderJoinMessage(msg.content)
          );

          // 🔥 【HOTFIX-v1.3.70】根据可靠的身份判断检查准确的系统消息
          let hasAccurateJoinMessage;
          if (isDefinitelyBSide) {
            // B 端:检查是否有"加入xx的聊天"格式(包括正在销毁的)
            hasAccurateJoinMessage = currentMessages.some(msg =>
              msg.isSystem &&
              /^加入.+的聊天$/.test(msg.content) &&
              !isPlaceholderJoinMessage(msg.content)
            );
            console.log('👥 [系统消息检查-B端-v1.3.70] 检查B端格式消息:', hasAccurateJoinMessage);
          } else if (isDefinitelyASide) {
            // A 端:检查是否有"xx加入聊天"格式(包括正在销毁的)
            hasAccurateJoinMessage = currentMessages.some(msg =>
              msg.isSystem &&
              /^.+加入聊天$/.test(msg.content) &&
              !/^加入.+的聊天$/.test(msg.content) &&
              !msg.content.includes('您创建了')  // 排除创建消息
            );
            console.log('👥 [系统消息检查-A端-v1.3.70] 检查A端加入格式消息:', hasAccurateJoinMessage);
          } else {
            // 身份不明,保守处理:检查是否有任何加入相关消息
            hasAccurateJoinMessage = currentMessages.some(msg =>
              msg.isSystem && msg.content && (
                msg.content.includes('加入') && msg.content.includes('聊天')
              )
            );
            console.log('👥 [系统消息检查-未知身份-v1.3.70] 检查任意加入消息:', hasAccurateJoinMessage);
          }

          console.log('👥 [系统消息检查-v1.3.70] 当前身份:', isDefinitelyBSide ? 'B端' : isDefinitelyASide ? 'A端' : '未知');
          console.log('👥 [系统消息检查-v1.3.70] 当前消息:', currentMessages.map(m => m.isSystem ? m.content : null).filter(Boolean));
          console.log('👥 [系统消息检查-v1.3.70] 临时加入消息:', tempJoinMessage?.content);
          console.log('👥 [系统消息检查-v1.3.70] 是否已有准确消息:', hasAccurateJoinMessage);

          // 🔥 【HOTFIX-v1.3.70】如果已有准确消息,则跳过所有后续逻辑
          if (hasAccurateJoinMessage && !tempJoinMessage) {
            console.log('👥 [系统消息检查-v1.3.70] ✅ 已有准确系统消息且无需更新,跳过处理');
            // 设置全局标记防止后续重复
            if (isDefinitelyASide) {
              this.aEndJoinMessageAdded = true;
            } else if (isDefinitelyBSide) {
              this.bEndSystemMessageProcessed = true;
            }
            return;
          }

          // 🔥 【关键修复】如果有临时消息需要更新,或者没有准确消息,则进行处理
          if (tempJoinMessage || !hasAccurateJoinMessage) {
            // 🔥 【HOTFIX-v1.3.71】设置处理标记,防止重复调用
            this._fetchingSystemMessage = true;

            // 🔥 使用页面初始化时保存的身份判断结果
            const isFromInvite = this.data.isFromInvite;

            // 🔥 【HOTFIX-v1.3.65】增强身份判断,优先使用 isFromInvite 和 isSender
            const urlParams = getCurrentPages()[getCurrentPages().length - 1].options || {};
            const hasInviteParams = !!urlParams.inviter;
            const isSender = this.data.isSender;

            // 🔥 【修复】更准确的身份判断:优先使用 isSender 标记
            const isDefinitelyBSide = isFromInvite || (hasInviteParams && !isSender);
            const isDefinitelyASide = isSender || (!isFromInvite && !hasInviteParams);

            console.log('👥 [身份双重验证-v1.3.65]', {
              isFromInvite,
              isSender,
              hasInviteParams,
              isDefinitelyBSide,
              isDefinitelyASide,
              role: isDefinitelyBSide ? 'B端(确认)' : isDefinitelyASide ? 'A端(确认)' : '待确认'
            });

            // 🔥 【CRITICAL-FIX】修复系统消息逻辑,基于双重验证判断身份
            const messages = this.data.messages || [];
            const currentUser = this.data.currentUser;

            let participantName;
            if (isDefinitelyASide) {
              // 🔥 发送方(A 端确认):显示接收方真实昵称
              participantName = newParticipant.nickName || newParticipant.name || '用户';
              console.log('👥 [A端系统消息] A端获取B端真实昵称:', participantName);
            } else if (isDefinitelyBSide) {
              // 🔥 【CRITICAL-FIX】接收方(B 端确认):智能获取发送方真实昵称
              let senderName = newParticipant.nickName || newParticipant.name;

              // 🔥 尝试从 URL 参数获取真实邀请者昵称
              if (urlParams.inviter) {
                try {
                  const decodedInviterName = decodeURIComponent(decodeURIComponent(urlParams.inviter));
                  if (decodedInviterName &&
                      decodedInviterName !== '朋友' &&
                      decodedInviterName !== '好友' &&
                      decodedInviterName !== '邀请者' &&
                      decodedInviterName !== '用户') {
                    senderName = decodedInviterName;
                    console.log('👥 [系统消息] B端从URL获取A端真实昵称:', senderName);
                  }
                } catch (e) {
                  console.log('👥 [系统消息] URL解码失败:', e);
                }
              }

              // 如果 URL 昵称无效,尝试从参与者列表中找到真实昵称
              if (!senderName || senderName === '用户' || senderName === '朋友' || senderName === 'Y.') {
                const allParticipants = this.data.participants || [];
                const currentUserOpenId = this.data.currentUser?.openId;

                for (const participant of allParticipants) {
                  const participantId = participant.openId || participant.id;
                  if (participantId !== currentUserOpenId) {
                    const participantNickName = participant.nickName || participant.name;
                    if (participantNickName && participantNickName !== '用户' && participantNickName !== '朋友' && participantNickName !== 'Y.') {
                      senderName = participantNickName;
                      console.log('👥 [系统消息] B端从参与者列表找到A端真实昵称:', senderName);
                      break;
                    }
                  }
                }
              }

              participantName = senderName || '发送方'; // 使用通用备选方案
              console.log('👥 [B端系统消息] B端最终使用A端昵称:', participantName);
            }

            console.log('👥 [系统消息] 准备添加系统消息,参与者名称:', participantName);
            console.log('👥 [系统消息] 当前用户身份:', isDefinitelyBSide ? 'B端(确认)' : isDefinitelyASide ? 'A端(确认)' : '身份不明');
            console.log('👥 [系统消息] 当前消息列表:', messages.map(m => m.isSystem ? m.content : null).filter(Boolean));

            // 🔗 [系统消息修复] 检查是否已有连接相关的系统消息(不再检查"建立了聊天")
            const hasConnectionMessage = messages.some(msg =>
              msg.isSystem && msg.content && (
                msg.content.includes(`您加入了${participantName}`) ||
                msg.content.includes(`加入${participantName}的聊天`) ||
                msg.content.includes(`${participantName}加入聊天`) ||
                (msg.content.includes('加入') && msg.content.includes('聊天') && !msg.content.includes('您创建了'))
              )
            );

            console.log('👥 [系统消息] 是否已有连接消息:', hasConnectionMessage);

            if (!hasConnectionMessage) {
              if (isDefinitelyBSide) {
                // 🔥 【HOTFIX-B端防重复】增强 B 端系统消息防重复机制
                if (this.bEndSystemMessageProcessed) {
                  console.log('👥 [B端防重复] ❌ B端系统消息已处理过,跳过重复添加');
                  this._fetchingSystemMessage = false;
                  return;
                }

                // 🔥 【额外检查】确保没有任何"加入xxx的聊天"格式的系统消息
                const hasBEndMessage = messages.some(msg =>
                  msg.isSystem && msg.content &&
                  /^加入.+的聊天$/.test(msg.content)
                );

                if (hasBEndMessage) {
                  console.log('👥 [B端防重复] ❌ 已检测到B端加入消息,跳过重复添加');
                  this.bEndSystemMessageProcessed = true; // 标记已处理
                  this._fetchingSystemMessage = false;
                  return;
                }

                // 🔥 【轮询防重复】额外检查轮询触发的重复添加
                const currentMessages = this.data.messages || [];
                const hasAnyBEndJoinMessage = currentMessages.some(msg =>
                  msg.isSystem && msg.content && (
                    msg.content.includes('加入') &&
                    msg.content.includes('的聊天') &&
                    !msg.content.includes('您创建了')
                  )
                );

                if (hasAnyBEndJoinMessage) {
                  console.log('👥 [轮询防重复] ❌ 检测到现有B端加入消息,避免重复添加');
                  this.bEndSystemMessageProcessed = true;
                  this._fetchingSystemMessage = false;
                  return;
                }

                // 🔥 【关键修复】先移除临时的不准确系统消息
                if (tempJoinMessage) {
                  const updatedMessages = currentMessages.filter(msg => msg.id !== tempJoinMessage.id);
                  this._localMessageCache = updatedMessages;
                  this.setData({ messages: updatedMessages });
                  console.log('👥 [系统消息] ✅ 已移除临时消息:', tempJoinMessage.content);
                }

                // 🔥【HOTFIX-v1.3.82】B 端(确认):显示"加入xx的聊天",自动淡出
                if (this.isPlaceholderNickname(participantName)) {
                  console.log('👥 [B端系统消息-v1.3.82] 检测到占位符昵称,暂不添加B端系统消息,等待真实昵称');
                } else {
                  const message = `加入${participantName}的聊天`;
                  console.log('👥 [B端系统消息-v1.3.82] 准备添加B端消息:', message);
                  this.addSystemMessage(message, {
                    autoFadeStaySeconds: 3,
                    fadeSeconds: 5
                  }); // 🔥 添加淡出参数,与 updateSystemMessageAfterJoin 保持一致
                  this.bEndSystemMessageProcessed = true; // 🔥 设置处理标记
                  this.bEndSystemMessageTime = Date.now(); // 🔥 设置处理时间用于轮询优化
                  console.log('👥 [B端系统消息-v1.3.82] ✅ B端消息已添加(带淡出):', message);
                }
              } else if (isDefinitelyASide) {
                // 🔥 【A端系统消息修复-v1.3.81】A 端(确认)显示"xx加入聊天"消息
                console.log('👥 [A端系统消息-v1.3.81] A端准备处理参与者加入消息');

                // 🔥 【HOTFIX-v1.3.81】全局防重复检查:确保整个页面生命周期只添加一次
                if (this.aEndJoinMessageAdded) {
                  console.log('👥 [A端系统消息-v1.3.81] ⚠️ 全局标记:已添加过加入消息,跳过');
                  this._fetchingSystemMessage = false;
                  return;
                }

                // 🔥 【HOTFIX-v1.3.81】当前消息列表检查(包括云端和本地)
                const currentMsgs = this.data.messages || [];
                const hasJoinMsg = currentMsgs.some(msg =>
                  msg.isSystem && msg.content && (
                    msg.content.includes('加入聊天') && !msg.content.includes('您创建了') && !msg.content.includes('的聊天')
                  )
                );

                if (hasJoinMsg) {
                  console.log('👥 [A端系统消息-v1.3.81] ⚠️ 已有加入消息,跳过重复添加');
                  this.aEndJoinMessageAdded = true; // 设置全局标记
                  this._fetchingSystemMessage = false;
                  return;
                }

                // 🔥 【HOTFIX-v1.3.81】仅执行替换逻辑,不再添加新消息
                // 云端 sendMessage 已经创建了"您创建了私密聊天"消息,只需将其替换为"xx加入聊天"
                console.log('👥 [A端系统消息-v1.3.81] 执行替换创建消息为加入消息');
                this.replaceCreatorMessageWithJoinMessage(participantName);

                // 🔥 【HOTFIX-v1.3.81】设置全局标记防止重复
                this.aEndJoinMessageAdded = true;
                this.setData({
                  hasAddedConnectionMessage: true,
                  lastJoinMessageTime: Date.now()
                });

                console.log('👥 [A端系统消息-v1.3.81] ✅ A端消息处理完成(仅替换,不新增)');
              } else {
                // 🔥 【身份不明确】跳过系统消息处理,避免混淆
                console.log('👥 [系统消息警告] 用户身份不明确,跳过系统消息处理,避免A端B端消息混淆');
              }
            } else {
              console.log('👥 [防重复] 已存在连接消息,跳过添加');
              // 🔥 兜底:校正系统消息列表,确保 A 端替换与 B 端过滤生效
              this.enforceSystemMessages && this.enforceSystemMessages();
            }
          } else {
            console.log('👥 [系统消息] 已存在加入消息,跳过添加');
          }

          // 🔥 【HOTFIX-v1.3.71】清除处理标记
          this._fetchingSystemMessage = false;
          console.log('👥 [防重复-v1.3.71] ✅ 系统消息处理完成,清除标记');
        }
      } else {
        console.log('👥 [真实昵称] 获取参与者失败,使用默认处理');
        // 🔥 【HOTFIX-v1.3.71】清除处理标记
        this._fetchingSystemMessage = false;
      }
    },
    fail: err => {
      console.error('👥 [真实昵称] 获取参与者请求失败:', err);
      // 🔥 【HOTFIX-v1.3.71】清除处理标记
      this._fetchingSystemMessage = false;
    }
  });
}

/**
 * 把所有参与者监听相关方法挂到 page 实例上
 * @param {Object} page - Page 实例
 */
function attach(page) {
  page.getOtherParticipantRealName = getOtherParticipantRealName;
  page.retryGetRealInviterName = retryGetRealInviterName;
  page.startParticipantListener = startParticipantListener;
  page.startWatchingForNewParticipants = startWatchingForNewParticipants;
  page.fetchChatParticipants = fetchChatParticipants;
  page.cleanupDuplicateParticipants = cleanupDuplicateParticipants;
  page.deduplicateParticipants = deduplicateParticipants;
  page.fetchChatParticipantsWithRealNames = fetchChatParticipantsWithRealNames;
}

module.exports = { attach };
