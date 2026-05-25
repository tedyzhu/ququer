/**
 * 获取会话列表云函数
 *
 * 性能要点:
 * - 使用 db.command.in 一次性批量查询参与者 users 信息(原 N+1 → 1+1)
 * - 兼容三种 participants 数据形态:字符串数组 / [{openId}] / [{id}]
 *
 * @param {Object} event
 * @param {number} [event.limit=10] 返回会话数量上限
 * @param {Object} context
 * @returns {Promise<{success:boolean, conversations:Array, total?:number, error?:string}>}
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const TAG = '🔥 [getConversations]';
const DEFAULT_LIMIT = 10;

/**
 * 从一个 participant(对象或字符串)中抽取 openId
 */
function extractParticipantId(participant) {
  if (!participant) return null;
  if (typeof participant === 'string') return participant;
  if (typeof participant === 'object') {
    return participant.openId || participant.id || null;
  }
  return null;
}

/**
 * 把 participant 已有的昵称/头像归一为 {nickName, avatarUrl}
 */
function pickInlineParticipantInfo(participant) {
  if (!participant || typeof participant !== 'object') {
    return { nickName: null, avatarUrl: null };
  }
  return {
    nickName: participant.nickName || participant.name || null,
    avatarUrl: participant.avatarUrl || participant.avatar || null
  };
}

/**
 * 三种格式并查 + 合并去重
 *
 * 原有实现按 limit 各取 N 条后再合并,可能导致总条数不足 limit。
 * 这里改为各查询取 limit*2 后合并、再按时间倒序截取 limit 条,行为更可预测。
 */
async function fetchUserConversations(userId, limit) {
  const conversations = db.collection('conversations');
  const queryLimit = Math.max(limit, 20);

  const queries = [
    conversations.where({ 'participants.openId': userId }),
    conversations.where({ 'participants.id': userId }),
    conversations.where({ participants: userId })
  ];

  const results = await Promise.all(
    queries.map(q =>
      q.orderBy('updateTime', 'desc')
        .limit(queryLimit)
        .get()
        .catch(err => {
          // 某个 where 形态可能不被索引支持,降级为空
          console.warn(TAG, '子查询失败,跳过:', err && err.message);
          return { data: [] };
        })
    )
  );

  const merged = [];
  const seen = new Set();
  for (const { data } of results) {
    for (const conv of data || []) {
      if (seen.has(conv._id)) continue;
      seen.add(conv._id);
      merged.push(conv);
    }
  }

  merged.sort((a, b) => {
    const ta = a.updateTime || a.createTime || 0;
    const tb = b.updateTime || b.createTime || 0;
    // 云端时间字段可能是 Date 对象,做一次数值化
    const va = ta instanceof Date ? ta.getTime() : Number(ta) || 0;
    const vb = tb instanceof Date ? tb.getTime() : Number(tb) || 0;
    return vb - va;
  });

  return merged.slice(0, limit);
}

/**
 * 收集所有缺信息的 openId,一次性查询 users 集合并构建 map。
 *
 * 微信云数据库默认单次最多返回 100 条,且 in 查询的数组长度也有限制。
 * 这里按 100 一批分页查询,足以覆盖正常用户量。
 */
async function fetchUsersByIds(openIds) {
  const userMap = new Map();
  if (!openIds.size) return userMap;

  const ids = Array.from(openIds);
  const BATCH = 100;

  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    try {
      const res = await db.collection('users')
        .where({ openId: _.in(slice) })
        .limit(BATCH)
        .get();

      for (const user of res.data || []) {
        if (!user.openId) continue;
        userMap.set(user.openId, {
          nickName: user.nickName || user.userInfo?.nickName || '',
          avatarUrl: user.avatarUrl || user.userInfo?.avatarUrl || ''
        });
      }
    } catch (error) {
      console.error(TAG, 'users 批量查询失败,该批降级为占位:', error && error.message);
    }
  }

  return userMap;
}

/**
 * 用 inline 信息 + userMap 把单个会话的 participants 解析为标准化数组
 */
function resolveParticipants(participants, userMap) {
  if (!Array.isArray(participants) || participants.length === 0) return [];

  return participants.map(p => {
    const openId = extractParticipantId(p);
    const inline = pickInlineParticipantInfo(p);
    const fromDb = openId ? userMap.get(openId) : null;

    const nickName =
      inline.nickName ||
      (fromDb && fromDb.nickName) ||
      '用户';
    const avatarUrl =
      inline.avatarUrl ||
      (fromDb && fromDb.avatarUrl) ||
      '';

    return {
      id: openId || '',
      nickName,
      avatarUrl
    };
  });
}

exports.main = async (event, context) => {
  console.log(TAG, '云函数被调用', event);

  const { OPENID: userId } = cloud.getWXContext();
  if (!userId) {
    return { success: false, error: '用户未登录', conversations: [] };
  }

  const limit = event.limit || DEFAULT_LIMIT;

  try {
    const rawConversations = await fetchUserConversations(userId, limit);
    console.log(TAG, '查询到会话数:', rawConversations.length);

    if (rawConversations.length === 0) {
      return { success: true, conversations: [], total: 0, message: '暂无会话记录' };
    }

    // 收集所有缺 inline 昵称/头像的 openId,集中走一次 in 查询
    const idsToFetch = new Set();
    for (const conv of rawConversations) {
      for (const p of conv.participants || []) {
        const openId = extractParticipantId(p);
        if (!openId) continue;
        const inline = pickInlineParticipantInfo(p);
        if (!inline.nickName || !inline.avatarUrl) {
          idsToFetch.add(openId);
        }
      }
    }

    const userMap = await fetchUsersByIds(idsToFetch);
    console.log(TAG, '批量查询用户信息条数:', userMap.size, '请求数:', idsToFetch.size);

    const conversations = rawConversations.map(conv => {
      const participantsInfo = resolveParticipants(conv.participants, userMap);
      const otherParticipant = participantsInfo.find(p => p.id !== userId);

      return {
        id: conv._id,
        chatId: conv._id,
        participants: conv.participants,
        participantNames: participantsInfo.map(p => p.nickName),
        lastMessage: conv.lastMessage || '开始聊天吧',
        lastMessageTime: conv.updateTime || conv.createTime,
        createTime: conv.createTime,
        updateTime: conv.updateTime,
        status: conv.status,
        chatStarted: conv.chatStarted,
        contactInfo: otherParticipant || { id: '', nickName: '未知用户', avatarUrl: '' }
      };
    });

    return { success: true, conversations, total: conversations.length };
  } catch (error) {
    console.error(TAG, '错误:', error);
    return {
      success: false,
      error: (error && error.message) || '获取会话列表失败',
      conversations: []
    };
  }
};
