/**
 * 聊天页面通用工具与常量
 *
 * 这里只放与业务流程解耦的"纯函数 / 常量 / 弱状态工具":
 * - 不依赖 Page 实例的 this.data
 * - 不读写云函数 / 云数据库
 * - 不直接修改页面 setData
 *
 * 后续模块拆分(标识 / 监听 / 阅后即焚 / 系统消息 / 标题)如需共用,可优先从此处取。
 */

/** 系统消息淡出与销毁记录默认值 */
const SYSTEM_MESSAGE_DEFAULTS = {
  AUTO_FADE_STAY_SECONDS: 3,
  FADE_SECONDS: 5,
  MAX_DESTROY_RECORDS: 200
};

/** 调试开关(默认关闭) */
const DEBUG_FLAGS = {
  ENABLE_VERBOSE_LOGS: false,
  ENABLE_TEST_APIS: false,
  ENABLE_MESSAGE_DIFF_LOGS: false
};

/** 默认阅后即焚倒计时秒数 */
const DEFAULT_DESTROY_TIMEOUT = 30;

/** 是否启用同视图样式(即 A/B 端布局一致) */
const ENABLE_HOMOGENEOUS_UI_MODE = true;

/**
 * 首次弹出键盘时,真实高度尚未上报,用此值立即缩小容器以避免原生上推。
 * @type {number}
 */
const DEFAULT_KEYBOARD_HEIGHT = 300;

/** 占位"加入xx的聊天"系统消息识别正则 */
const PLACEHOLDER_JOIN_MESSAGE_REGEX = /^加入(朋友|好友|用户|邀请者|发送方|a端用户|a端发送方)的聊天[!!]?$/i;

/** 占位昵称黑名单 */
const PLACEHOLDER_NICKNAMES = [
  '用户', '新用户', '朋友', '好友', '邀请者', '发送方',
  'a端用户', 'A端用户', 'a端发送方', 'A端发送方'
];

/**
 * 判断系统消息内容是否为占位文案("加入朋友的聊天"等)
 * @param {string} content - 系统消息内容
 * @returns {boolean}
 */
function isPlaceholderJoinMessage(content) {
  if (!content || typeof content !== 'string') return false;
  return PLACEHOLDER_JOIN_MESSAGE_REGEX.test(content.trim());
}

/**
 * 判断昵称是否为占位符(空 / 通用占位 / 形如"用户_xxx" / "user_xxx")
 * @param {string} name - 待判断的昵称
 * @returns {boolean}
 */
function isPlaceholderNickname(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_NICKNAMES.includes(trimmed)) return true;
  if (/^用户[_\-\dA-Za-z]+$/.test(trimmed)) return true;
  if (/^user[_\-\dA-Za-z]*$/i.test(trimmed)) return true;
  return false;
}

/**
 * 判断消息是否属于系统消息
 * @param {Object} message - 原始或格式化后的消息对象
 * @returns {boolean}
 */
function isSystemLikeMessage(message) {
  if (!message) return false;
  if (message.isSystem === true || message.isSystemMessage === true) return true;
  if (message.fromSystem === true) return true;
  const type = typeof message.type === 'string' ? message.type.toLowerCase() : '';
  if (type === 'system') return true;
  const senderId = typeof message.senderId === 'string' ? message.senderId.toLowerCase() : '';
  if (senderId === 'system') return true;
  const sender = typeof message.sender === 'string' ? message.sender.toLowerCase() : '';
  if (sender === 'system') return true;
  return false;
}

/**
 * 为系统消息补齐标记字段(原地修改并返回)
 * @param {Object} message - 消息对象
 * @returns {Object} 处理后的消息对象
 */
function ensureSystemFlags(message) {
  if (!message) return message;
  if (isSystemLikeMessage(message)) {
    message.isSystem = true;
    message.isSystemMessage = true;
    if (!message.type) {
      message.type = 'system';
    }
  }
  return message;
}

/**
 * 解析多种"布尔表示"——支持原生布尔、0/1、字符串 yes/no/true/false/on/off。
 * 用于 onLoad options 和本地缓存中读取的开关位。
 * @param {*} value - 输入值
 * @returns {boolean}
 */
function parseDebugBoolean(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  }
  return !!value;
}

/**
 * 提取消息 ID 列表用于差异分析(缺 ID 会生成 NO_ID#index 占位)
 * @param {Array<Object>} messages - 消息数组
 * @returns {Array<string>}
 */
function extractMessageIdsForDebug(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list.map((item, index) => {
    if (!item) return `NULL_ITEM#${index}`;
    const resolvedId = item.id || item._id;
    return resolvedId ? String(resolvedId) : `NO_ID#${index}`;
  });
}

/**
 * 计算消息 ID 差异摘要(新增/移除/位移/重复)
 * @param {Array<string>} beforeIds
 * @param {Array<string>} afterIds
 * @returns {{added: Array<string>, removed: Array<string>, movedCount: number, duplicateIds: Array<string>}}
 */
function summarizeMessageIdDiff(beforeIds, afterIds) {
  const prev = Array.isArray(beforeIds) ? beforeIds : [];
  const next = Array.isArray(afterIds) ? afterIds : [];
  const prevSet = new Set(prev);
  const nextSet = new Set(next);

  const added = next.filter(id => !prevSet.has(id));
  const removed = prev.filter(id => !nextSet.has(id));

  const prevIndexMap = new Map();
  prev.forEach((id, index) => {
    if (!prevIndexMap.has(id)) prevIndexMap.set(id, index);
  });

  let movedCount = 0;
  next.forEach((id, index) => {
    if (!prevIndexMap.has(id)) return;
    const prevIndex = prevIndexMap.get(id);
    if (prevIndex !== index) movedCount += 1;
  });

  const counter = {};
  next.forEach(id => {
    counter[id] = (counter[id] || 0) + 1;
  });
  const duplicateIds = Object.keys(counter).filter(id => counter[id] > 1);

  return { added, removed, movedCount, duplicateIds };
}

/**
 * 把 Date 格式化为 HH:mm
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * 把消息的多个键(id / _id / 字符串本身)登记进 collection。
 *
 * collection 通常是 Set,用于消息去重 / 防止已销毁消息回流。
 * 若 message 是字符串且没有 id/_id,直接把字符串当 key 用。
 *
 * @param {Set<string>} collection - 待写入的集合
 * @param {Object|string} message - 消息对象或消息 ID 字符串
 */
function registerMessageKeys(collection, message) {
  if (!collection || !message) return;
  const keys = new Set();
  if (typeof message === 'string') {
    keys.add(message);
  } else {
    if (message.id) keys.add(message.id);
    if (message._id) keys.add(message._id);
    if (keys.size === 0 && typeof message === 'string') keys.add(message);
  }
  keys.forEach(key => {
    if (key) collection.add(key);
  });
}

/**
 * 智能昵称匹配
 *
 * 用于 A/B 端身份判定的辅助:相同昵称是创建者强证据之一。
 *
 * 规则:
 * - 任一昵称为占位/默认值(用户/朋友/好友/邀请者/我/PLACEHOLDER_INVITER) 直接返回 false
 * - 双重 URL 解码后做小写、trim 比对
 * - 最小长度 >= 2(防短昵称误匹配)
 * - 仅严格相等才算匹配,不做包含/前缀匹配
 *
 * @param {string} name1
 * @param {string} name2
 * @returns {boolean}
 */
function smartNicknameMatch(name1, name2) {
  if (!name1 || !name2) return false;

  const defaultNames = ['用户', '朋友', '好友', '邀请者', '我', 'PLACEHOLDER_INVITER'];
  if (defaultNames.includes(name1) || defaultNames.includes(name2)) {
    console.log('🔥 [智能昵称] 检测到默认昵称,直接返回false:', name1, name2);
    return false;
  }

  const normalize = (name) => {
    try {
      const decoded = decodeURIComponent(decodeURIComponent(name));
      return decoded.trim().toLowerCase();
    } catch {
      try {
        const decoded = decodeURIComponent(name);
        return decoded.trim().toLowerCase();
      } catch {
        return name.trim().toLowerCase();
      }
    }
  };

  const normalized1 = normalize(name1);
  const normalized2 = normalize(name2);

  const exactMatch = normalized1 === normalized2;
  const hasMinLength = normalized1.length >= 2 && normalized2.length >= 2;

  console.log('🔥 [智能昵称] 原始1:', name1, '标准化1:', normalized1);
  console.log('🔥 [智能昵称] 原始2:', name2, '标准化2:', normalized2);
  console.log('🔥 [智能昵称] 精确匹配:', exactMatch, '长度合规:', hasMinLength);

  return exactMatch && hasMinLength;
}

module.exports = {
  // 常量
  SYSTEM_MESSAGE_DEFAULTS,
  DEBUG_FLAGS,
  DEFAULT_DESTROY_TIMEOUT,
  ENABLE_HOMOGENEOUS_UI_MODE,
  DEFAULT_KEYBOARD_HEIGHT,
  PLACEHOLDER_JOIN_MESSAGE_REGEX,
  PLACEHOLDER_NICKNAMES,
  // 纯函数
  isPlaceholderJoinMessage,
  isPlaceholderNickname,
  isSystemLikeMessage,
  ensureSystemFlags,
  parseDebugBoolean,
  extractMessageIdsForDebug,
  summarizeMessageIdDiff,
  formatTime,
  registerMessageKeys,
  smartNicknameMatch
};
