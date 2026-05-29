/**
 * 聊天页标题刷新子系统
 *
 * 职责:
 * - A 端动态标题: updateDynamicTitle / updateDynamicTitleWithRealNames
 * - B 端标题: fetchRealInviterNameAndUpdateTitle / updateReceiverTitleWithRealNames /
 *   updateTitleForReceiver / protectReceiverTitle
 * - 通用单参与者标题刷新: updateTitleWithRealNickname
 *
 * 设计原则(详见 .kiro/specs/chat-title-controller-module/design.md):
 * - 这些函数在 attach() 时绑定到 page,运行时 `this === page`
 * - 不引入新的状态容器,继续读写 page.data 与实例属性
 * - 跨模块依赖通过 page 上的方法/属性调用
 */

const ChatHelpers = require('./chat-helpers.js');

/**
 * 🔥 【HOTFIX-v1.3.55】获取真实邀请者昵称并更新 B 端标题
 *
 * 仅 B 端使用。直接调用 getChatParticipants 云函数,从云端拿真实昵称后:
 * - 写 page.data.dynamicTitle
 * - 调用 wx.setNavigationBarTitle
 */
function fetchRealInviterNameAndUpdateTitle() {
  const chatId = this.data.chatId;
  if (!chatId) return;

  console.log('🔥 [B端标题] 开始获取真实邀请者昵称');

  wx.cloud.callFunction({
    name: 'getChatParticipants',
    data: { chatId: chatId },
    success: (res) => {
      if (res.result && res.result.participants) {
        const currentUserOpenId = this.data.currentUser?.openId;
        const participants = res.result.participants;

        // 找到对方参与者(A 端)
        const otherParticipant = participants.find(p =>
          (p.openId || p.id) !== currentUserOpenId
        );

        if (otherParticipant && otherParticipant.nickName &&
            !['朋友', '邀请者', '用户', '好友'].includes(otherParticipant.nickName)) {
          const realNickname = otherParticipant.nickName;
          const newTitle = `我和${realNickname}（2）`;

          console.log('🔥 [B端标题] 获取到真实昵称,更新标题:', newTitle);

          // 更新导航栏标题
          wx.setNavigationBarTitle({
            title: newTitle
          });

          // 更新页面数据
          this.setData({
            dynamicTitle: newTitle
          });
        }
      }
    },
    fail: (error) => {
      console.error('🔥 [B端标题] 获取参与者信息失败:', error);
    }
  });
}

/**
 * 🔥 接收方专用:用真实昵称更新标题(替换默认的"朋友"昵称)
 *
 * 当 B 端从参与者列表中拿到 A 端真实昵称时调用,把"我和朋友（2）"换成"我和[A端真实昵称]（2）"。
 */
function updateReceiverTitleWithRealNames() {
  console.log('🔗 [接收方真实昵称] ==================== 开始用真实昵称更新接收方标题 ====================');

  const { participants, currentUser } = this.data;
  var currentUserOpenId = currentUser?.openId
    || getApp().globalData.userInfo?.openId
    || getApp().globalData.openId
    || wx.getStorageSync('openId');
  console.log('🔗 [接收方真实昵称] 使用的currentUserOpenId:', currentUserOpenId);

  console.log('🔗 [接收方真实昵称] 当前参与者:', participants);
  console.log('🔗 [接收方真实昵称] 当前用户OpenId:', currentUserOpenId);

  if (!participants || participants.length === 0) {
    console.log('🔗 [接收方真实昵称] 没有参与者信息,跳过标题更新');
    return;
  }

  // 🔥 即使参与者数量>2,也要尝试找到真实的邀请者进行标题更新
  if (participants.length !== 2) {
    console.log('🔗 [接收方真实昵称] 参与者数量异常(' + participants.length + '),尝试去重处理');

    // 🔧 参与者去重:按 openId 去重,保留最新的信息
    const uniqueParticipants = [];
    const seenOpenIds = new Set();

    for (const participant of participants) {
      const openId = participant.openId || participant.id;
      if (!seenOpenIds.has(openId)) {
        seenOpenIds.add(openId);
        uniqueParticipants.push(participant);
      } else {
        console.log('🔗 [接收方真实昵称] 发现重复参与者,跳过:', openId);
      }
    }

    console.log('🔗 [接收方真实昵称] 去重后的参与者数量:', uniqueParticipants.length);

    // 更新参与者列表
    this.setData({
      participants: uniqueParticipants
    });

    // 如果去重后仍不是 2 人,尝试强制查找邀请者
    if (uniqueParticipants.length !== 2) {
      console.log('🔗 [接收方真实昵称] 去重后仍非2人聊天,尝试强制查找邀请者');

      // 查找非当前用户的参与者作为邀请者
      const potentialInviter = uniqueParticipants.find(p => {
        const pOpenId = p.openId || p.id;
        return pOpenId !== currentUserOpenId && !p.isSelf;
      });

      if (potentialInviter && potentialInviter.nickName &&
          potentialInviter.nickName !== '用户' &&
          potentialInviter.nickName !== '朋友' &&
          potentialInviter.nickName !== '好友') {

        const realInviterName = potentialInviter.nickName;
        const newTitle = `我和${realInviterName}（2）`;

        console.log('🔗 [接收方真实昵称] 强制找到邀请者:', realInviterName);
        console.log('🔗 [接收方真实昵称] 强制更新标题:', newTitle);

        this.setData({
          dynamicTitle: newTitle,
          contactName: newTitle,
          chatTitle: newTitle
        }, () => {
          wx.setNavigationBarTitle({
            title: newTitle,
            success: () => {
              console.log('🔗 [接收方真实昵称] ✅ 强制标题更新成功:', newTitle);
            }
          });
        });

        console.log('🔗 [接收方真实昵称] ==================== 强制标题更新完成 ====================');
        return;
      } else {
        console.log('🔗 [接收方真实昵称] 未找到有效的邀请者,保持当前标题');
        return;
      }
    }
  }

  // 查找对方参与者(真实的邀请者)
  const otherParticipant = participants.find(p => {
    const pOpenId = p.openId || p.id;
    const isNotSelf = pOpenId !== currentUserOpenId && !p.isSelf;
    console.log('🔗 [接收方真实昵称] 检查参与者:', p.nickName, 'OpenId:', pOpenId, '是否为对方:', isNotSelf);
    return isNotSelf;
  });

  if (otherParticipant && otherParticipant.nickName &&
      otherParticipant.nickName !== '用户' &&
      otherParticipant.nickName !== '朋友' &&
      otherParticipant.nickName !== '好友') {

    const realInviterName = otherParticipant.nickName;
    const newTitle = `我和${realInviterName}（2）`;

    console.log('🔗 [接收方真实昵称] 找到真实邀请者昵称:', realInviterName);
    console.log('🔗 [接收方真实昵称] 新标题:', newTitle);

    // 🔥 只有当标题确实发生变化时才更新
    if (this.data.dynamicTitle !== newTitle) {
      this.setData({
        dynamicTitle: newTitle,
        contactName: newTitle,
        chatTitle: newTitle
      }, () => {
        console.log('🔗 [接收方真实昵称] ✅ 接收方标题已更新为真实昵称');

        // 更新导航栏标题
        wx.setNavigationBarTitle({
          title: newTitle,
          success: () => {
            console.log('🔗 [接收方真实昵称] ✅ 导航栏标题也已更新为真实昵称:', newTitle);
          }
        });
      });
    } else {
      console.log('🔗 [接收方真实昵称] 标题未发生变化,无需更新');
    }
  } else {
    console.log('🔗 [接收方真实昵称] 未找到有效的真实邀请者昵称,保持当前标题');
  }

  console.log('🔗 [接收方真实昵称] ==================== 接收方真实昵称更新完成 ====================');
}

/**
 * 🔥 接收方专用:更新标题显示 — 确保显示"我和[a端昵称]（2）"格式
 *
 * 仅 B 端调用。优先级:
 * 1. URL 参数 inviter(双重 URL 解码)
 * 2. 参与者列表中的真实昵称
 * 3. fallback 到 'a端用户' + 2 秒后重试 retryGetRealInviterName
 *
 * 设置后会自动启动 protectReceiverTitle 保护机制。
 *
 * @param {string} inviterNickName - 初始邀请者昵称(可能是占位符)
 */
function updateTitleForReceiver(inviterNickName) {
  // 🔒 仅限接收方(B 端)调用,发送方直接返回,避免误将标题改为"我和xx（2）"
  if (!this.data.isFromInvite) {
    console.log('🔗 [接收方标题] 非接收方环境,跳过 updateTitleForReceiver');
    return;
  }
  console.log('🔗 [接收方标题] ==================== 开始接收方标题更新 ====================');
  console.log('🔗 [接收方标题] 初始邀请者昵称:', inviterNickName);
  console.log('🔗 [接收方标题] 当前页面数据:', {
    contactId: this.data.contactId,
    participants: this.data.participants,
    currentUser: this.data.currentUser,
    dynamicTitle: this.data.dynamicTitle
  });

  // 🔧 设置接收方标题锁定标记,防止被后续逻辑覆盖
  this.receiverTitleLocked = true;
  console.log('🔗 [接收方标题] 设置标题锁定标记,防止被覆盖');

  const currentUser = this.data.currentUser || getApp().globalData.userInfo;
  console.log('🔗 [接收方标题] 当前用户信息:', currentUser);

  // 🔧 【修复接收方标题】多重策略获取邀请者昵称,优先使用真实昵称
  let finalInviterName = inviterNickName;

  // 🔥 【修复接收方标题】首先尝试从 URL 参数获取真实的邀请者昵称
  const urlParams = getCurrentPages()[getCurrentPages().length - 1].options || {};
  console.log('🔗 [接收方修复] URL参数:', urlParams);

  if (urlParams.inviter) {
    try {
      // 兼容单重编码/双重编码,防止出现 %E6%... 乱码
      let urlInviter = urlParams.inviter;
      try { urlInviter = decodeURIComponent(urlInviter); } catch (e) {}
      try { urlInviter = decodeURIComponent(urlInviter); } catch (e) {}
      console.log('🔗 [接收方修复] 从URL解码的邀请者:', urlInviter);

      // 如果 URL 中的邀请者昵称更具体,使用它
      if (urlInviter && urlInviter !== '朋友' && urlInviter !== '好友' && urlInviter !== '邀请者' && urlInviter !== '用户') {
        finalInviterName = urlInviter;
        console.log('🔗 [接收方修复] ✅ 使用URL中的真实邀请者昵称:', finalInviterName);
      }
    } catch (e) {
      console.log('🔗 [接收方修复] URL解码失败:', e);
    }
  }

  // 🔥 【关键修复】如果仍然没有获取到有效昵称,从参与者列表获取
  if (!finalInviterName || finalInviterName === '好友' || finalInviterName === '朋友' || finalInviterName === '邀请者' || finalInviterName === '用户') {
    console.log('🔗 [接收方标题] ⚠️ 邀请者昵称仍不明确,从参与者列表获取...');

    const participants = this.data.participants || [];
    console.log('🔗 [接收方标题] 当前参与者列表:', participants);

    const otherParticipant = participants.find(p => {
      const isNotSelf = !p.isSelf && (p.openId !== currentUser?.openId);
      return isNotSelf;
    });

    if (otherParticipant && otherParticipant.nickName && otherParticipant.nickName !== '用户') {
      finalInviterName = otherParticipant.nickName;
      console.log('🔗 [接收方标题] ✅ 从参与者列表获取到邀请者昵称:', finalInviterName);
    } else {
      // 🔥 【关键修复】如果所有方法都失败,使用一个默认值,但会在后续尝试更新
      finalInviterName = 'a端用户';
      console.log('🔗 [接收方标题] ⚠️ 使用默认昵称,稍后尝试更新:', finalInviterName);

      // 🔥 设置延迟重试获取真实昵称
      setTimeout(() => {
        console.log('🔗 [接收方标题] 开始延迟重试获取真实邀请者昵称');
        this.retryGetRealInviterName();
      }, 2000);
    }
  }

  // 🔥 【关键修复】强制设置接收方标题,确保格式正确
  const receiverTitle = `我和${finalInviterName}（2）`;
  console.log('🔗 [接收方标题] 🎯 最终确定的接收方标题:', receiverTitle);

  // 🔥 【重要】立即更新所有相关字段,确保标题统一
  this.setData({
    dynamicTitle: receiverTitle,
    contactName: receiverTitle,
    chatTitle: receiverTitle
  }, () => {
    console.log('🔗 [接收方标题] setData回调 - 接收方标题设置完成');
    console.log('🔗 [接收方标题] 当前dynamicTitle:', this.data.dynamicTitle);
    console.log('🔗 [接收方标题] 当前contactName:', this.data.contactName);

    // 🔥 【关键】同时更新导航栏标题
    wx.setNavigationBarTitle({
      title: receiverTitle,
      success: () => {
        console.log('🔗 [接收方标题] ✅ 导航栏标题更新成功:', receiverTitle);
        console.log('🔗 [接收方标题] ==================== 接收方标题更新完成 ====================');
      },
      fail: (err) => {
        console.error('🔗 [接收方标题] ❌ 导航栏标题更新失败:', err);
      }
    });
  });

  // 🔥 【新增】防止其他方法覆盖标题,设置保护机制
  this.protectReceiverTitle(receiverTitle);
}

/**
 * 🔥 【新增】保护接收方标题不被其他逻辑覆盖
 *
 * 启动 1s 间隔的检查定时器,30s 后自动停止。期间如发现标题被改成不符合"我和X（2）"格式,立即恢复。
 *
 * @param {string} correctTitle - 需要保护的正确标题
 */
function protectReceiverTitle(correctTitle) {
  console.log('🔗 [标题保护] 启动接收方标题保护机制:', correctTitle);

  // 每隔 1 秒检查一次标题是否被修改
  const protectionInterval = setInterval(() => {
    const currentTitle = this.data.dynamicTitle;

    // 如果标题被错误修改(不包含"我和"或者只显示自己昵称),立即恢复
    if (!currentTitle ||
        !currentTitle.includes('我和') ||
        !currentTitle.includes('（2）') ||
        currentTitle === this.data.currentUser?.nickName) {

      console.log('🔗 [标题保护] 检测到标题被错误修改,立即恢复:', currentTitle, '->', correctTitle);

      this.setData({
        dynamicTitle: correctTitle,
        contactName: correctTitle,
        chatTitle: correctTitle
      });

      wx.setNavigationBarTitle({
        title: correctTitle,
        success: () => {
          console.log('🔗 [标题保护] ✅ 标题已恢复:', correctTitle);
        }
      });
    }
  }, 1000);

  // 🔥 保护机制运行 30 秒后自动停止(避免无限运行)
  setTimeout(() => {
    if (protectionInterval) {
      clearInterval(protectionInterval);
      console.log('🔗 [标题保护] 保护机制已停止');
    }
  }, 30000);
}

/**
 * 🔥 使用真实姓名更新动态标题
 *
 * 双端通用入口。逻辑:
 * - 已锁定接收方标题 → 调用 updateReceiverTitleWithRealNames
 * - 单人态 → A 端用自己昵称, B 端用邀请者兜底
 * - 双人态 → "我和[对方昵称]（2）",占位符触发 fetchChatParticipantsWithRealNames
 * - 多人态 → "群聊（N）"
 */
function updateDynamicTitleWithRealNames() {
  // 🔥 【允许A端标题更新】A 端应该能响应真实昵称的变化
  console.log('🔥 [标题更新] A端允许根据真实昵称更新标题');

  // 🔥 【统一标题策略】双端都使用相同的标题更新逻辑
  console.log('🔥 [统一标题] 开始使用真实姓名更新动态标题');

  // 🔧 检查接收方标题锁定状态,但允许真实昵称更新
  if (this.receiverTitleLocked) {
    console.log('🏷️ [真实姓名] 检测到接收方标题已锁定,但允许真实昵称更新');
    // 🔥 如果是接收方且获取到了真实参与者信息,允许更新标题
    this.updateReceiverTitleWithRealNames();
    return;
  }

  const { participants, currentUser } = this.data;
  const isReceiverEnv = (typeof this.isReceiverEnvironment === 'function')
    ? this.isReceiverEnvironment()
    : !!this.data.isFromInvite;
  const getReceiverTitleFallbackName = () => {
    try {
      const pages = getCurrentPages();
      const options = pages && pages.length > 0 ? (pages[pages.length - 1].options || {}) : {};
      let inviterName = options.inviter || '';
      if (inviterName) {
        try { inviterName = decodeURIComponent(inviterName); } catch (e) {}
        try { inviterName = decodeURIComponent(inviterName); } catch (e) {}
      }
      if (inviterName && typeof this.isPlaceholderNickname === 'function' && !this.isPlaceholderNickname(inviterName)) {
        return inviterName;
      }
    } catch (e) {}
    try {
      const inviteInfo = wx.getStorageSync('inviteInfo');
      const storedInviter = inviteInfo && (inviteInfo.inviterNickName || inviteInfo.inviterName || inviteInfo.inviter);
      if (storedInviter && typeof this.isPlaceholderNickname === 'function' && !this.isPlaceholderNickname(storedInviter)) {
        return storedInviter;
      }
    } catch (e) {}
    return '朋友';
  };
  let participantCount = participants.length;
  let title = '';

  console.log('🏷️ [真实姓名] 更新动态标题,参与者数量:', participantCount, '参与者:', participants);
  console.log('🏷️ [真实姓名] 当前用户:', currentUser);

  if (participantCount > 2) {
    console.log('🏷️ [真实姓名] ⚠️ 参与者数量异常,立即触发去重处理');
    this.deduplicateParticipants();
    return;
  }

  if (participantCount <= 1) {
    if (isReceiverEnv) {
      const fallbackInviterName = getReceiverTitleFallbackName();
      title = `我和${fallbackInviterName}（2）`;
      console.log('🏷️ [真实姓名] 规则1: B 端临时单人态,使用接收方标题兜底:', title);
    } else {
      title = currentUser?.nickName || '我';
      console.log('🏷️ [真实姓名] 规则1: 单人状态,显示自己昵称:', title);
    }
  }
  else if (participantCount === 2) {
    var currentUserOpenId = currentUser?.openId
      || getApp().globalData.userInfo?.openId
      || getApp().globalData.openId
      || wx.getStorageSync('openId');
    console.log('🏷️ [真实姓名] 当前用户openId:', currentUserOpenId);

    const otherParticipant = participants.find(p => {
      const pOpenId = p.openId || p.id;
      console.log('🏷️ [真实姓名] 比较参与者openId:', pOpenId, '与当前用户:', currentUserOpenId);
      return pOpenId !== currentUserOpenId;
    });

    console.log('🏷️ [真实姓名] 找到的对方参与者:', otherParticipant);

    if (otherParticipant) {
      const otherNameRaw = otherParticipant?.nickName || otherParticipant?.name || '';
      // 收敛(S1):统一调权威检测器,删除 inline 数组兜底
      const isPlaceholderName = ChatHelpers.isPlaceholderNickname(otherNameRaw);
      if (!isPlaceholderName && (otherParticipant.openId || otherParticipant.id) !== 'temp_user') {
        const otherName = otherNameRaw;
        title = `我和${otherName}（2）`;
        console.log('🏷️ [真实姓名] 规则2: 双人聊天,对方名字:', otherName, '最终标题:', title);
      } else {
        console.log('🏷️ [真实姓名] 检测到占位符昵称或临时ID,触发强制获取真实昵称');
        this.fetchChatParticipantsWithRealNames(true);
        const fallbackInviterName = getReceiverTitleFallbackName();
        title = `我和${fallbackInviterName}（2）`;
      }
    } else {
      // 🔥 如果没找到对方,使用邀请链接中的昵称作为备选
      const urlParams = getCurrentPages()[getCurrentPages().length - 1].options;
      let inviterFromUrl = null;
      if (urlParams.inviter) {
        try {
          // 🔧 处理双重编码问题
          inviterFromUrl = decodeURIComponent(decodeURIComponent(urlParams.inviter));
        } catch (e) {
          // 如果双重解码失败,尝试单次解码
          inviterFromUrl = decodeURIComponent(urlParams.inviter);
        }
      }

      if (inviterFromUrl && inviterFromUrl !== '好友' && inviterFromUrl !== '朋友') {
        title = `我和${inviterFromUrl}（2）`;
        console.log('🏷️ [真实姓名] 使用URL中的邀请者昵称:', inviterFromUrl);
      } else {
        const fallbackInviterName = getReceiverTitleFallbackName();
        title = `我和${fallbackInviterName}（2）`;
        console.log('🏷️ [真实姓名] 未找到对方参与者,使用通用占位标题:', title);
        this.fetchChatParticipantsWithRealNames(true);
      }
    }
  }
  // 规则3:3 人及以上时,显示"群聊（x）"
  else {
    title = `群聊（${participantCount}）`;
    console.log('🏷️ [真实姓名] 规则3: 群聊模式,人数:', participantCount);
  }

  console.log('🏷️ [真实姓名] 动态标题更新为:', title);

  this.setData({
    dynamicTitle: title,
    chatTitle: title,
    contactName: title // 🔥 同时更新 contactName 确保页面标题正确
  });

  // 🔥 更新微信导航栏标题
  wx.setNavigationBarTitle({
    title: title
  });

  console.log('🏷️ [真实姓名] 页面标题和导航栏标题已更新');
}


/**
 * 🔥 核心:动态标题更新
 *
 * 双端通用,在初始化、参与者变化、监听到加入等多个时机被调用。
 * 规则与 updateDynamicTitleWithRealNames 类似,但增加 A 端身份保护机制:
 * - 如果是 A 端发送方,且没有真实 B 端加入,保持显示自己昵称(避免 temp_user 误进双人态)
 * - B 端真实昵称标题不被覆盖,但占位符标题允许更新
 *
 * @returns {void}
 */
function updateDynamicTitle() {
  // 🔥 【移除过度保护】允许 A 端标题根据参与者变化动态更新
  // A 端标题应该能响应:单人 → 双人 → 多人的状态变化

  // 🔥 【1008修复】B 端标题保护:只保护真实昵称,允许更新占位符
  if (this.data.isFromInvite && this.data.hasJoinedAsReceiver) {
    const currentTitle = this.data.dynamicTitle;
    // 🔥 检查标题是否包含占位符昵称
    const hasPlaceholder = currentTitle && (
      currentTitle.includes('用户') ||
      currentTitle.includes('朋友') ||
      currentTitle.includes('好友') ||
      currentTitle.includes('邀请者') ||
      currentTitle.includes('新用户')
    );

    // 🔥 只有标题是真实昵称(不包含占位符)时才保护
    if (currentTitle && currentTitle.includes('我和') && currentTitle.includes('（2）') && !hasPlaceholder) {
      console.log('🔥 [B端标题保护-1008] 跳过覆盖B端真实昵称标题:', currentTitle);
      return;
    } else if (hasPlaceholder) {
      console.log('🔥 [B端标题更新-1008] 检测到占位符标题,允许更新:', currentTitle);
    }
  }

  // 🔥 【统一标题策略】双端都使用相同的标题更新逻辑
  console.log('🔥 [统一标题] 开始动态标题更新');

  const { participants, currentUser } = this.data;
  const isReceiverEnv = (typeof this.isReceiverEnvironment === 'function')
    ? this.isReceiverEnvironment()
    : !!this.data.isFromInvite;
  const getReceiverTitleFallbackName = () => {
    try {
      const pages = getCurrentPages();
      const options = pages && pages.length > 0 ? (pages[pages.length - 1].options || {}) : {};
      let inviterName = options.inviter || '';
      if (inviterName) {
        try { inviterName = decodeURIComponent(inviterName); } catch (e) {}
        try { inviterName = decodeURIComponent(inviterName); } catch (e) {}
      }
      if (inviterName && typeof this.isPlaceholderNickname === 'function' && !this.isPlaceholderNickname(inviterName)) {
        return inviterName;
      }
    } catch (e) {}
    try {
      const inviteInfo = wx.getStorageSync('inviteInfo');
      const storedInviter = inviteInfo && (inviteInfo.inviterNickName || inviteInfo.inviterName || inviteInfo.inviter);
      if (storedInviter && typeof this.isPlaceholderNickname === 'function' && !this.isPlaceholderNickname(storedInviter)) {
        return storedInviter;
      }
    } catch (e) {}
    return '朋友';
  };
  let participantCount = participants.length;
  let title = '';

  console.log('🏷️ [优化标题] 更新动态标题,参与者数量:', participantCount, '参与者:', participants);
  console.log('🏷️ [优化标题] 当前用户:', currentUser);

  // 🚨 【关键修复】如果参与者数量异常,先尝试去重
  if (participantCount > 3) {
    console.log('🏷️ [优化标题] ⚠️ 参与者数量异常,触发去重处理');
    this.deduplicateParticipants();
    return; // 去重后会重新调用标题更新
  }

  // 🔥 【HOTFIX-v1.3.22】增强参与者数量检测
  console.log('🏷️ [优化标题] 详细参与者信息:');
  participants.forEach((p, index) => {
    console.log(`🏷️ [优化标题] 参与者${index}:`, {
      id: p.id,
      openId: p.openId,
      nickName: p.nickName,
      isSelf: p.isSelf
    });
  });

  // 规则1:未加入聊天或只有自己时,显示自己昵称
  if (participantCount <= 1) {
    // 🔥 [发送方修复] 如果已经是双人聊天,不要重置为单人标题
    if (this.data.dynamicTitle && this.data.dynamicTitle.includes('（2）')) {
      console.log('🏷️ [优化标题] 保持双人聊天标题不变:', this.data.dynamicTitle);
      return;
    }
    if (isReceiverEnv) {
      const fallbackInviterName = getReceiverTitleFallbackName();
      title = `我和${fallbackInviterName}（2）`;
      console.log('🏷️ [优化标题] 规则1: B 端临时单人态,使用接收方标题兜底:', title);
    } else {
      title = currentUser?.nickName || '我';
      console.log('🏷️ [优化标题] 规则1: 单人状态,显示自己昵称:', title);
    }
  }
  // 规则2:2 人聊天时,显示"我和xx（2）"
  else if (participantCount === 2) {
    var currentUserOpenId = currentUser?.openId
      || getApp().globalData.userInfo?.openId
      || getApp().globalData.openId
      || wx.getStorageSync('openId');
    console.log('🏷️ [优化标题] 当前用户openId:', currentUserOpenId);

    const otherParticipant = participants.find(p => {
      const pOpenId = p.openId || p.id;
      console.log('🏷️ [优化标题] 比较参与者openId:', pOpenId, '与当前用户:', currentUserOpenId);
      return pOpenId !== currentUserOpenId;
    });

    console.log('🏷️ [优化标题] 找到的对方参与者:', otherParticipant);

    if (otherParticipant) {
      // 🔥 【A端保护】增强 A 端身份检测,防止被误判为 B 端
      const isReceiver = !!this.data.isFromInvite; // 我是 B 端

      // 🔥 【A端身份验证】额外检查确保 A 端不会被误判
      const urlParams = getCurrentPages()[getCurrentPages().length - 1].options || {};
      const hasExplicitInviteParams = !!urlParams.inviter;
      const isDefinitelyASide = !isReceiver && !hasExplicitInviteParams;

      // 🔥 【A端特殊处理】如果是 A 端创建者,只在真正有 B 端加入时才显示双人标题
      if (isDefinitelyASide) {
        const otherNameRaw = otherParticipant?.nickName || otherParticipant?.name;
        // 收敛(S2):统一调权威检测器(原 inline 数组漏判「新用户」等)
        const isValidName = !ChatHelpers.isPlaceholderNickname(otherNameRaw);

        if (isValidName && (otherParticipant.openId || otherParticipant.id) !== 'temp_user') {
          title = `我和${otherNameRaw}（2）`;
          console.log('🏷️ [A端标题] A 端检测到真实 B 端加入,显示双人标题:', title);
        } else {
          title = currentUser?.nickName || '我';
          console.log('🏷️ [A端标题] A 端暂无真实 B 端加入,保持自己昵称:', title);
        }
      } else {
        const otherNameRaw = otherParticipant?.nickName || otherParticipant?.name;
        // 收敛(S3):统一调权威检测器(原 inline 数组漏判「新用户」等)
        const isPlaceholderName = ChatHelpers.isPlaceholderNickname(otherNameRaw);

        if (!isPlaceholderName && (otherParticipant.openId || otherParticipant.id) !== 'temp_user') {
          const otherName = otherNameRaw;
          title = `我和${otherName}（2）`;
          console.log('🏷️ [优化标题] 规则2: 双人聊天,对方名字:', otherName, '最终标题:', title);
        } else {
          if (isReceiverEnv) {
            const fallbackInviterName = getReceiverTitleFallbackName();
            title = `我和${fallbackInviterName}（2）`;
            console.log('🏷️ [优化标题] 规则2: B 端对方昵称占位,使用接收方标题兜底:', title, { otherNameRaw, isPlaceholderName });
          } else {
            title = currentUser?.nickName || '我';
            console.log('🏷️ [优化标题] 规则2: 对方仍为占位/未就绪,保持自己昵称:', title, { otherNameRaw, isPlaceholderName });
          }
        }
      }
    } else {
      // 🔥 如果没找到对方,可能是数据同步问题,B 端用邀请者兜底,A 端显示自己昵称
      if (isReceiverEnv) {
        const fallbackInviterName = getReceiverTitleFallbackName();
        title = `我和${fallbackInviterName}（2）`;
        console.log('🏷️ [优化标题] 规则2: B 端未找到对方参与者,使用接收方标题兜底:', title);
      } else {
        title = currentUser?.nickName || '我';
        console.log('🏷️ [优化标题] 规则2: 未找到对方参与者,暂时显示自己昵称');
      }

      // 延迟重新获取参与者信息
      setTimeout(() => {
        console.log('🏷️ [优化标题] 延迟重新获取参与者信息');
        this.fetchChatParticipants();
      }, 2000);
    }
  }
  // 规则3:3 人及以上时,显示"群聊（x）"
  else {
    title = `群聊（${participantCount}）`;
    console.log('🏷️ [优化标题] 规则3: 群聊模式,人数:', participantCount);
  }

  console.log('🏷️ [优化标题] 动态标题更新为:', title);

  this.setData({
    dynamicTitle: title,
    chatTitle: title // 同时更新 chatTitle 确保兼容性
  }, () => {
    console.log('🏷️ [优化标题] setData回调执行,当前dynamicTitle:', this.data.dynamicTitle);
  });

  console.log('🏷️ [优化标题] 页面数据设置完成,当前dynamicTitle:', this.data.dynamicTitle);

  // 🔥 立即更新导航栏标题
  wx.setNavigationBarTitle({
    title: title,
    success: () => {
      console.log('🏷️ [优化标题] 导航栏标题已更新为:', title);
    },
    fail: (err) => {
      console.error('🏷️ [优化标题] 导航栏标题更新失败:', err);
    }
  });
}

// TODO: 后续 task 将逐步搬入各方法实现

/**
 * 把所有标题相关方法挂到 page 实例上
 * @param {Object} page - Page 实例
 */
function attach(page) {
  page.fetchRealInviterNameAndUpdateTitle = fetchRealInviterNameAndUpdateTitle;
  page.updateReceiverTitleWithRealNames = updateReceiverTitleWithRealNames;
  page.updateTitleForReceiver = updateTitleForReceiver;
  page.protectReceiverTitle = protectReceiverTitle;
  page.updateDynamicTitleWithRealNames = updateDynamicTitleWithRealNames;
  page.updateDynamicTitle = updateDynamicTitle;
}

module.exports = { attach };
