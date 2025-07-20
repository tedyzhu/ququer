/**
 * 🔥 获取b用户真实昵称并修复聊天标题
 * 在小程序控制台中运行此函数
 */
function getBUserRealNickname() {
  console.log('🔍 开始获取b用户的真实昵称...');
  
  // 第1步：查询b用户的详细信息
  wx.cloud.callFunction({
    name: 'debugUserDatabase',
    data: {
      action: 'debug',
      specificUserId: 'ojtOs7bA8w-ZdS1G_o5rdoeLzWDc'
    }
  }).then(res => {
    console.log('✅ b用户详细信息查询结果:', res.result);
    
    if (res.result.success && res.result.data.userInfo) {
      const bUserInfo = res.result.data.userInfo;
      console.log('🎯 b用户真实昵称:', bUserInfo.nickName);
      console.log('🎯 b用户头像:', bUserInfo.avatarUrl);
      console.log('🎯 b用户完整信息:', bUserInfo);
      
      // 第2步：更新原聊天记录中的参与者信息
      updateChatParticipantInfo(bUserInfo);
    } else {
      console.error('❌ 获取b用户信息失败:', res.result);
    }
  }).catch(err => {
    console.error('❌ 调用云函数失败:', err);
  });
}

/**
 * 🔥 更新聊天参与者信息
 */
function updateChatParticipantInfo(bUserInfo) {
  console.log('🔄 开始更新聊天参与者信息...');
  
  const originalChatId = 'chat_1751717858982_w0egq6bp9';
  const bOpenId = 'ojtOs7bA8w-ZdS1G_o5rdoeLzWDc';
  
  // 直接更新数据库中的参与者信息
  wx.cloud.database().collection('conversations').doc(originalChatId).get().then(res => {
    if (res.data) {
      const conversation = res.data;
      const participants = conversation.participants || [];
      
      console.log('🔍 原始参与者信息:', participants);
      
      // 查找并更新b用户的参与者信息
      const updatedParticipants = participants.map(participant => {
        if ((participant.id || participant.openId) === bOpenId) {
          console.log('🔄 更新前的b用户信息:', participant);
          
          const updatedParticipant = {
            ...participant,
            nickName: bUserInfo.nickName,
            avatarUrl: bUserInfo.avatarUrl,
            name: bUserInfo.nickName // 兼容性字段
          };
          
          console.log('🔄 更新后的b用户信息:', updatedParticipant);
          return updatedParticipant;
        }
        return participant;
      });
      
      console.log('🔄 更新后的参与者列表:', updatedParticipants);
      
      // 更新数据库
      wx.cloud.database().collection('conversations').doc(originalChatId).update({
        data: {
          participants: updatedParticipants
        }
      }).then(updateRes => {
        console.log('✅ 参与者信息更新成功:', updateRes);
        
        // 第3步：验证更新结果
        verifyUpdateResult(originalChatId, bUserInfo.nickName);
      }).catch(updateErr => {
        console.error('❌ 更新参与者信息失败:', updateErr);
      });
    } else {
      console.error('❌ 未找到原始聊天记录');
    }
  }).catch(err => {
    console.error('❌ 获取原始聊天记录失败:', err);
  });
}

/**
 * 🔥 验证更新结果
 */
function verifyUpdateResult(chatId, expectedNickname) {
  console.log('🔍 验证更新结果...');
  
  wx.cloud.database().collection('conversations').doc(chatId).get().then(res => {
    if (res.data) {
      const conversation = res.data;
      const participants = conversation.participants || [];
      
      console.log('🔍 验证结果 - 参与者信息:', participants);
      
      const bParticipant = participants.find(p => 
        (p.id || p.openId) === 'ojtOs7bA8w-ZdS1G_o5rdoeLzWDc'
      );
      
      if (bParticipant) {
        console.log('✅ b用户参与者信息:', bParticipant);
        console.log('✅ b用户昵称:', bParticipant.nickName);
        
        if (bParticipant.nickName === expectedNickname) {
          console.log('🎉 昵称更新成功！');
          console.log('🎉 现在a端应该显示: 我和' + expectedNickname + '（2）');
        } else {
          console.log('⚠️ 昵称更新可能有问题，期望:', expectedNickname, '实际:', bParticipant.nickName);
        }
      } else {
        console.log('❌ 验证失败：未找到b用户参与者信息');
      }
    }
  }).catch(err => {
    console.error('❌ 验证失败:', err);
  });
}

// 🔥 一键修复函数
function fixChatTitle() {
  console.log('🚀 开始一键修复聊天标题...');
  getBUserRealNickname();
}

// 🔥 使用说明
console.log('🔥 使用说明：');
console.log('1. 运行 getBUserRealNickname() 获取b用户真实昵称');
console.log('2. 或者运行 fixChatTitle() 一键修复聊天标题');
console.log('3. 修复完成后，刷新聊天页面查看效果'); 