/**
 * 实时日志封装(真机日志回收)
 *
 * 背景:体验版/真机跑双端流程时,开发者工具的 Console 连不上(真机调试通道一直 Timeout)。
 * 微信「实时日志」(wx.getRealtimeLogManager)可把真机日志回传到后台
 * (mp.weixin.qq.com → 开发 → 运维中心 → 实时日志),按 openId 筛选即可分别看 A/B 两端。
 *
 * 设计:
 * - 纯封装,无业务依赖,可独立单测
 * - API 不存在(低版本基础库 / 单元测试环境)时安全降级为 no-op,绝不抛错
 * - 通过 enabled 开关控制;埋点统一走 logIdentity / logJoin / logTitle 等语义化方法
 * - 关键节点结构化记录(tag + payload),便于在后台按关键字检索
 */

/** 模块级单例状态 */
let _mgr = null;
let _enabled = false;

/**
 * 初始化实时日志。应在 app.js onLaunch 尽早调用。
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] - 是否启用(生产可传 false 关闭)
 * @returns {boolean} 是否成功拿到 RealtimeLogManager
 */
function init(options) {
  const opts = options || {};
  _enabled = opts.enabled !== false;
  try {
    if (_enabled && typeof wx !== 'undefined' && typeof wx.getRealtimeLogManager === 'function') {
      _mgr = wx.getRealtimeLogManager();
      return !!_mgr;
    }
  } catch (e) {
    _mgr = null;
  }
  return false;
}

/** 是否已就绪(开关开 + 拿到 manager) */
function isReady() {
  return !!(_enabled && _mgr);
}

/**
 * 通用结构化日志(info 级)
 * @param {string} tag - 语义标签(如 '身份判定')
 * @param {Object} [payload] - 结构化数据
 */
function log(tag, payload) {
  if (!isReady()) return;
  try {
    _mgr.info('[' + tag + ']', payload || {});
  } catch (e) { /* 日志失败绝不影响业务 */ }
}

/**
 * 警告级日志
 * @param {string} tag
 * @param {Object} [payload]
 */
function warn(tag, payload) {
  if (!isReady()) return;
  try {
    _mgr.warn('[' + tag + ']', payload || {});
  } catch (e) {}
}

/**
 * 错误级日志(后台实时日志中会高亮)
 * @param {string} tag
 * @param {Object} [payload]
 */
function error(tag, payload) {
  if (!isReady()) return;
  try {
    _mgr.error('[' + tag + ']', payload || {});
  } catch (e) {}
}

/**
 * 给当前这条实时日志打过滤标记(后台可按此搜索,如 openId)。
 * @param {string} key
 * @param {string} value
 */
function setFilter(key, value) {
  if (!isReady()) return;
  try {
    if (typeof _mgr.setFilterMsg === 'function' && value != null) {
      _mgr.setFilterMsg(String(value));
    }
    if (typeof _mgr.addFilterMsg === 'function' && key != null && value != null) {
      _mgr.addFilterMsg(key + ':' + value);
    }
  } catch (e) {}
}

// ===== 语义化埋点(覆盖反复出 bug 的关键节点)=====

/**
 * 身份判定结果(resolveFinalIdentity 出口)
 * @param {Object} info - { finalIsFromInvite, isActualCreator, chatId, openId, storedCreator, ... }
 */
function logIdentity(info) {
  log('身份判定', info);
}

/**
 * B 端加入聊天(joinChatByInvite 入口/出口)
 * @param {Object} info - { chatId, inviter, stage, success?, error? }
 */
function logJoin(info) {
  log('B端加入', info);
}

/**
 * 标题决策(updateDynamicTitle / updateTitleForReceiver 出口)
 * @param {Object} info - { method, title, participantCount, isFromInvite }
 */
function logTitle(info) {
  log('标题决策', info);
}

/** 仅用于单元测试:重置模块状态 */
function _resetForTest() {
  _mgr = null;
  _enabled = false;
}

module.exports = {
  init,
  isReady,
  log,
  warn,
  error,
  setFilter,
  logIdentity,
  logJoin,
  logTitle,
  _resetForTest,
};
