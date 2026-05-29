/**
 * 消息轮询子系统
 *
 * 通过 attach(page) 把 startPollingMessages / startMessagePolling 挂到 Page 实例上。
 *
 * 这两个方法是 message-listener (实时 watcher) 的轮询备用方案:
 * - startPollingMessages:每 5 秒轮询一次 fetchMessages,带 4 秒冷却防过频
 * - startMessagePolling:延迟启动包装,检查清理状态/冷却期/身份后才调 startPollingMessages
 *
 * 设计要点:
 * - attach 模式(与 message-listener / message-fetch 等 12 个模块一致)
 * - 整段函数体搬迁,所有 this.xxx 不动
 * - 内部互相调用通过 page 上下文(this 自然指向 page)
 */

/**
 * @param {Object} page - Page 实例
 */
function attach(page) {
    /**
     * 🔥 轮询消息（作为实时监听的备用方案）
     */
    page.startPollingMessages = function() {
      console.log('🔔 启动消息轮询作为备用方案');
      
      // 🔥 如果正在阅后即焚清理中，跳过轮询启动
      if (this.data.isBurnAfterReadingCleaning) {
        console.log('🔔 阅后即焚清理中，跳过轮询启动');
        return;
      }
      
      // 清除可能存在的旧轮询
      if (this.messagePollingTimer) {
        clearInterval(this.messagePollingTimer);
      }
      
      // 🔧 【消息收发修复】每15秒轮询一次新消息，避免过于频繁
      this.messagePollingTimer = setInterval(() => {
        // 🔥 在轮询前检查是否正在清理
        if (this.data.isBurnAfterReadingCleaning) {
          console.log('🔔 阅后即焚清理中，跳过本次轮询');
          return;
        }
        
        // 轮询不再被清理冷却期阻断，确保对方消息始终可达
        const currentTime = Date.now();
        
        // 🔥 【智能轮询优化】避免不必要的重复调用（缩短冷却期以提高消息到达率）
        const lastFetchTime = this.lastFetchTime || 0;
        if (currentTime - lastFetchTime < 4000) {
          console.log('🔔 [智能轮询] 距离上次获取消息不足4秒，跳过轮询避免频繁调用');
          return;
        }
        
        // 🔥 B端轮询不再跳过，确保消息始终可达（移除30秒优化，防止B端漏收消息）
        
        // 🔥 【HOTFIX-v1.3.44】修复轮询身份判断逻辑 - 使用实例属性作为fallback
        const currentUser = this.data.currentUser || this.actualCurrentUser;
        const participants = this.data.participants || [];
        let isFromInvite = this.data.isFromInvite;
        
        // 🔥 如果data中的isFromInvite是undefined，使用实例属性作为fallback
        if (isFromInvite === undefined && this.finalIsFromInvite !== undefined) {
          isFromInvite = this.finalIsFromInvite;
          console.log('🔔 [轮询修复] 使用实例属性fallback，isFromInvite:', isFromInvite);
        }
        
        // 🔥 检查是否为发送方：使用更准确的身份判断
        const isSender = !isFromInvite;
        
        console.log('🔔 [轮询身份判断] isFromInvite:', isFromInvite, 'isSender:', isSender);
        console.log('🔔 [轮询身份判断] 当前用户:', currentUser?.openId);
        console.log('🔔 [轮询身份判断] 参与者数量:', participants.length);
        
        // 🔥 【URGENT-FIX】简化轮询逻辑，确保双方都能正常接收消息
        // 移除复杂的参与者检测，确保消息同步的可靠性
        
        if (isSender) {
          // 🔥 【关键修复】发送方也必须轮询来接收对方的消息
          console.log('🔔 [发送方轮询] 启用轮询接收对方消息');
        } else {
          // 🔥 接收方正常轮询
          console.log('🔔 [接收方轮询] 启用轮询接收消息');
        }
        
        // 🔥 【关键修复】所有用户都需要轮询来确保消息同步
        console.log('🔔 [消息同步] 开始轮询检查新消息 - 身份:', isSender ? '发送方' : '接收方');
        this.fetchMessages();
      }, 5000); // 🔥 缩短至5秒：watcher 可能因微信SDK问题漏消息，短间隔确保对方消息不被遗漏
    };

    /**
     * 🔥 启动消息轮询（新增方法，用于清理完成后重启）
     */
    page.startMessagePolling = function() {
      console.log('🔔 启动消息轮询');
      
      // 🔥 检查是否在清理状态
      if (this.data.isBurnAfterReadingCleaning) {
        console.log('🔔 正在清理中，延迟启动轮询');
        setTimeout(() => {
          this.startMessagePolling();
        }, 5000);
        return;
      }
      
      // 🔥 检查是否在冷却期
      const currentTime = Date.now();
      const lastCleanupTime = this.data.lastCleanupTime;
      const cooldownPeriod = this.data.cleanupCooldownPeriod;
      
      if (lastCleanupTime && (currentTime - lastCleanupTime) < cooldownPeriod) {
        const remainingTime = Math.ceil((cooldownPeriod - (currentTime - lastCleanupTime)) / 1000);
        console.log(`🔔 仍在冷却期内，剩余${remainingTime}秒，延迟启动轮询`);
        setTimeout(() => {
          this.startMessagePolling();
        }, remainingTime * 1000);
        return;
      }
      
      // 🔥 检查用户身份，发送方不启动轮询
      const isFromInvite = this.data.isFromInvite;
      if (!isFromInvite) {
        console.log('🔔 发送方身份，不启动轮询以避免获取历史消息');
        return;
      }
      
      console.log('🔔 条件满足，启动消息轮询');
      this.startPollingMessages();
    };
}

module.exports = { attach };
