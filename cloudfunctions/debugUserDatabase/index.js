/**
 * 用户数据库调试和清理工具
 * 用于排查和修复用户信息混淆问题
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
});

exports.main = async (event, context) => {
  console.log('🔧 [用户数据调试] 云函数被调用，参数:', event);
  
  const db = cloud.database();
  const usersCollection = db.collection('users');
  const conversationsCollection = db.collection('conversations');
  
  try {
    const action = event.action || 'debug';
    
    switch (action) {
      case 'debug':
        return await debugUserData(db, usersCollection, conversationsCollection, event.specificUserId);
      case 'clean':
        return await cleanUserData(db, usersCollection, conversationsCollection, event.targetOpenId);
      case 'rebuild':
        return await rebuildUserMapping(db, usersCollection, conversationsCollection, event.chatId);
      default:
        return { success: false, error: '不支持的操作类型' };
    }
    
  } catch (error) {
    console.error('🔧 [用户数据调试] 错误:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 调试特定用户数据
 */
async function debugSpecificUser(db, usersCollection, conversationsCollection, specificUserId) {
  console.log('🔧 [特定用户调试] 开始调试特定用户:', specificUserId);
  
  // 1. 查询特定用户的数据
  const userResult = await usersCollection.where({ openId: specificUserId }).get();
  
  if (userResult.data.length === 0) {
    console.log('🔧 [特定用户调试] 未找到用户数据');
    return {
      success: false,
      error: '未找到指定用户数据'
    };
  }
  
  const userData = userResult.data[0];
  console.log('🔧 [特定用户调试] 找到用户数据:', userData);
  
  // 2. 分析用户信息
  const userInfo = {
    openId: userData.openId,
    nickName: userData.nickName || userData.userInfo?.nickName || '未知',
    avatarUrl: userData.avatarUrl || userData.userInfo?.avatarUrl || '未知',
    createTime: userData.createTime || '未知',
    lastLoginTime: userData.lastLoginTime || '未知',
    rawUserInfo: userData.userInfo || null,
    rawData: userData
  };
  
  console.log('🔧 [特定用户调试] 用户信息分析:', userInfo);
  
  // 3. 查询该用户参与的会话
  const conversationsResult = await conversationsCollection.where({
    'participants.id': specificUserId
  }).get();
  
  console.log('🔧 [特定用户调试] 参与的会话数量:', conversationsResult.data.length);
  
  const participantInConversations = conversationsResult.data.map(conversation => {
    const participant = conversation.participants.find(p => (p.id || p.openId) === specificUserId);
    return {
      chatId: conversation._id,
      participant: participant,
      createdTime: conversation.createdTime || '未知'
    };
  });
  
  console.log('🔧 [特定用户调试] 用户在会话中的参与信息:', participantInConversations);
  
  return {
    success: true,
    data: {
      userInfo: userInfo,
      participantInConversations: participantInConversations,
      conversationCount: conversationsResult.data.length
    }
  };
}

/**
 * 调试用户数据
 */
async function debugUserData(db, usersCollection, conversationsCollection, specificUserId) {
  console.log('🔧 [调试] 开始调试用户数据...', specificUserId ? `特定用户: ${specificUserId}` : '所有用户');
  
  // 如果指定了特定用户，只查询该用户
  if (specificUserId) {
    return await debugSpecificUser(db, usersCollection, conversationsCollection, specificUserId);
  }
  
  // 1. 获取所有用户数据
  const usersResult = await usersCollection.get();
  console.log('🔧 [调试] 用户总数:', usersResult.data.length);
  
  // 2. 分析用户数据
  const userAnalysis = [];
  const duplicateNicknames = {};
  
  for (const user of usersResult.data) {
    const analysis = {
      openId: user.openId,
      nickName: user.nickName || user.userInfo?.nickName || '未知',
      avatarUrl: user.avatarUrl || user.userInfo?.avatarUrl || '未知',
      createTime: user.createTime || '未知',
      lastLoginTime: user.lastLoginTime || '未知'
    };
    
    userAnalysis.push(analysis);
    
    // 检查昵称重复
    const nickName = analysis.nickName;
    if (nickName && nickName !== '未知' && nickName !== '用户') {
      if (!duplicateNicknames[nickName]) {
        duplicateNicknames[nickName] = [];
      }
      duplicateNicknames[nickName].push(analysis.openId);
    }
    
    console.log('🔧 [调试] 用户数据:', analysis);
  }
  
  // 3. 找出重复昵称
  const duplicates = Object.entries(duplicateNicknames).filter(([nickName, openIds]) => openIds.length > 1);
  console.log('🔧 [调试] 重复昵称:', duplicates);
  
  // 4. 获取当前活跃的conversation
  const conversationsResult = await conversationsCollection.where({
    status: 'active'
  }).get();
  
  console.log('🔧 [调试] 活跃聊天数:', conversationsResult.data.length);
  
  // 5. 分析participants数据
  const participantAnalysis = [];
  for (const conversation of conversationsResult.data) {
    const participants = conversation.participants || [];
    const analysis = {
      chatId: conversation._id,
      participantCount: participants.length,
      participants: participants.map(p => ({
        openId: p.id || p.openId,
        nickName: p.nickName || p.name || '未知',
        avatarUrl: p.avatarUrl || p.avatar || '未知'
      }))
    };
    
    participantAnalysis.push(analysis);
    console.log('🔧 [调试] 会话参与者:', analysis);
  }
  
  return {
    success: true,
    data: {
      userCount: usersResult.data.length,
      users: userAnalysis,
      duplicateNicknames: duplicates,
      conversationCount: conversationsResult.data.length,
      participantAnalysis: participantAnalysis
    }
  };
}

/**
 * 清理用户数据
 */
async function cleanUserData(db, usersCollection, conversationsCollection, targetOpenId) {
  console.log('🔧 [清理] 开始清理用户数据，目标openId:', targetOpenId);
  
  if (!targetOpenId) {
    throw new Error('缺少目标openId参数');
  }
  
  // 1. 获取目标用户数据
  const userResult = await usersCollection.where({ openId: targetOpenId }).get();
  
  if (userResult.data.length === 0) {
    return { success: false, error: '未找到目标用户数据' };
  }
  
  const userData = userResult.data[0];
  console.log('🔧 [清理] 目标用户数据:', userData);
  
  // 2. 删除错误的用户数据
  await usersCollection.doc(userData._id).remove();
  console.log('🔧 [清理] 已删除错误的用户数据');
  
  // 3. 清理相关的conversation参与者数据
  const conversationsResult = await conversationsCollection.where({
    'participants.id': targetOpenId
  }).get();
  
  for (const conversation of conversationsResult.data) {
    const participants = conversation.participants || [];
    const cleanedParticipants = participants.filter(p => (p.id || p.openId) !== targetOpenId);
    
    await conversationsCollection.doc(conversation._id).update({
      data: {
        participants: cleanedParticipants
      }
    });
    
    console.log('🔧 [清理] 已清理会话参与者数据:', conversation._id);
  }
  
  return {
    success: true,
    message: '用户数据清理完成',
    cleanedUser: userData,
    cleanedConversations: conversationsResult.data.length
  };
}

/**
 * 重建用户映射
 */
async function rebuildUserMapping(db, usersCollection, conversationsCollection, chatId) {
  console.log('🔧 [重建] 开始重建用户映射，chatId:', chatId);
  
  if (!chatId) {
    throw new Error('缺少chatId参数');
  }
  
  // 1. 获取目标会话
  const conversationResult = await conversationsCollection.doc(chatId).get();
  
  if (!conversationResult.data) {
    throw new Error('未找到目标会话');
  }
  
  const conversation = conversationResult.data;
  const participants = conversation.participants || [];
  
  console.log('🔧 [重建] 会话参与者:', participants);
  
  // 2. 重建参与者映射
  const rebuiltParticipants = [];
  const uniqueOpenIds = new Set();
  
  for (const participant of participants) {
    const openId = participant.id || participant.openId;
    
    if (uniqueOpenIds.has(openId)) {
      console.log('🔧 [重建] 跳过重复参与者:', openId);
      continue;
    }
    
    uniqueOpenIds.add(openId);
    
    // 从users集合获取最新的用户信息
    const userResult = await usersCollection.where({ openId: openId }).get();
    
    let nickName = participant.nickName || participant.name || '用户';
    let avatarUrl = participant.avatarUrl || participant.avatar || '/assets/images/default-avatar.png';
    
    if (userResult.data.length > 0) {
      const userData = userResult.data[0];
      nickName = userData.nickName || userData.userInfo?.nickName || nickName;
      avatarUrl = userData.avatarUrl || userData.userInfo?.avatarUrl || avatarUrl;
    }
    
    const rebuiltParticipant = {
      id: openId,
      openId: openId,
      nickName: nickName,
      avatarUrl: avatarUrl,
      isCreator: participant.isCreator || false,
      isJoiner: participant.isJoiner || false,
      joinTime: participant.joinTime || db.serverDate()
    };
    
    rebuiltParticipants.push(rebuiltParticipant);
    console.log('🔧 [重建] 重建参与者:', rebuiltParticipant);
  }
  
  // 3. 更新会话数据
  await conversationsCollection.doc(chatId).update({
    data: {
      participants: rebuiltParticipants
    }
  });
  
  console.log('🔧 [重建] 用户映射重建完成');
  
  return {
    success: true,
    message: '用户映射重建完成',
    originalCount: participants.length,
    rebuiltCount: rebuiltParticipants.length,
    rebuiltParticipants: rebuiltParticipants
  };
}