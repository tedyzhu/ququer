/**
 * 聊天页数据库写入辅助子系统
 *
 * 通过 attach(page) 把 4 个云数据库写入 helper 挂到 Page 实例上:
 *   - updateUserInfoInDatabase: 把当前用户信息写到 users 集合
 *   - updateSpecificUserInfo: 把指定 openId 的昵称同步到 users + conversations
 *   - createConversationRecord: 创建 conversation 记录,返回 Promise
 *   - syncParticipantsToDatabase: 把参与者列表同步到 conversations 集合
 *
 * 设计要点:
 * - attach 模式(与已有 13 个 attach 模块一致):整段函数体搬迁,所有 this.xxx 不动
 * - 调用方分布在 identity-resolver / participant-listener / recovery-tools / join-by-invite
 *   均通过 this.xxx() / page.xxx() 调用,attach 模式行为完全等价
 * - 无 wxml 绑定,可安全 attach
 */

/**
 * @param {Object} page - Page 实例
 */
function attach(page) {
    /**
     * 🔥 更新用户信息到数据库
     */
    page.updateUserInfoInDatabase = function() {
      const app = getApp();
      const userInfo = app.globalData.userInfo;

      if (!userInfo || !userInfo.openId) return;

      console.log('👤 更新用户信息到数据库:', userInfo);

      wx.cloud.callFunction({
        name: 'updateUserInfo',
        data: {
          openId: userInfo.openId,
          userInfo: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl
          }
        },
        success: res => {
          console.log('👤 用户信息更新成功:', res);
        },
        fail: err => {
          console.error('👤 用户信息更新失败:', err);
        }
      });
    };

    /**
     * 🔧 更新特定用户信息到数据库
     * @param {string} openId - 目标用户 openId
     * @param {string} nickName - 目标用户昵称
     */
    page.updateSpecificUserInfo = function(openId, nickName) {
      if (!openId || !nickName || nickName === '用户') return;

      console.log('👤 [修复] 更新特定用户信息到数据库:', { openId, nickName });

      wx.cloud.callFunction({
        name: 'updateUserInfo',
        data: {
          openId: openId,
          userInfo: {
            nickName: nickName,
            avatarUrl: '/assets/images/default-avatar.png'
          }
        },
        success: res => {
          console.log('👤 [修复] 特定用户信息更新成功:', res);
        },
        fail: err => {
          console.error('👤 [修复] 特定用户信息更新失败:', err);
        }
      });
    };

    /**
     * 创建会话记录
     */
    page.createConversationRecord = function(chatId) {
      return new Promise((resolve, reject) => {
        console.log('🔥 创建会话记录，chatId:', chatId);
        
        wx.cloud.callFunction({
          name: 'createChat',
          data: {
            chatId: chatId,
            message: '您创建了私密聊天，可点击右上角菜单分享链接邀请朋友加入'
          },
          success: res => {
            console.log('🔥 创建会话记录成功:', res);
            if (res.result && res.result.success) {
              resolve(res.result);
            } else {
              reject(new Error(res.result?.error || '创建会话记录失败'));
            }
          },
          fail: err => {
            console.error('🔥 创建会话记录失败:', err);
            reject(err);
          }
        });
      });
    };

    /**
     * 🔧 同步参与者到数据库
     */
    page.syncParticipantsToDatabase = function(participants) {
      console.log('🔧 [数据库同步] 开始同步参与者到数据库');
      
      wx.cloud.callFunction({
        name: 'updateConversationParticipants',
        data: {
          chatId: this.data.contactId,
          participants: participants
        },
        success: (res) => {
          console.log('🔧 [数据库同步] 参与者同步成功:', res.result);
        },
        fail: (err) => {
          console.error('🔧 [数据库同步] 参与者同步失败:', err);
        }
      });
    };
}

module.exports = { attach };
