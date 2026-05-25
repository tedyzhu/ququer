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
}

module.exports = { attach };
