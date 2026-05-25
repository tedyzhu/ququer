/**
 * 一次性数据库清理云函数:扫描 conversations 集合,
 * 移除所有 participants 中的 temp_user / 占位身份残留。
 *
 * 用法:
 *   - 在云开发控制台 → 云函数 → cleanTempUserData → 测试 → 直接运行
 *   - 或前端调用: wx.cloud.callFunction({ name: 'cleanTempUserData' })
 *
 * 安全:
 *   - 加 process.env.DEBUG_TOOLS_ENABLED guard,生产环境默认禁用
 *   - 开发环境部署时,在云函数环境变量中设 DEBUG_TOOLS_ENABLED=true 才启用
 *   - dryRun=true 时只统计不写入(默认 false,用 dryRun:true 先试一次更安全)
 *
 * 输入:
 *   { dryRun: boolean = false }   仅统计不写入
 *
 * 输出:
 *   {
 *     success: boolean,
 *     scanned: number,         扫描的会话总数
 *     dirty: number,           含脏数据的会话数
 *     cleaned: number,         实际清理的会话数(dryRun=true 时为 0)
 *     removedItems: number,    实际移除的脏参与者条目总数
 *     details: Array            前 50 条修复明细
 *   }
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

function isDebugEnabled() {
  return process.env.DEBUG_TOOLS_ENABLED === 'true';
}

function isPlaceholderId(id) {
  if (!id || typeof id !== 'string') return true;
  if (id === 'temp_user') return true;
  if (id.startsWith('temp_')) return true;
  if (id.startsWith('local_')) return true;
  if (id.length <= 5) return true;
  return false;
}

/**
 * 清理一个 participants 数组,返回新数组与移除条数
 * @param {Array} participants
 */
function sanitize(participants) {
  if (!Array.isArray(participants)) return { cleaned: [], removed: 0 };
  const cleaned = [];
  let removed = 0;
  const seen = new Set();

  for (const p of participants) {
    if (!p) { removed++; continue; }
    if (typeof p === 'string') {
      if (isPlaceholderId(p) || seen.has(p)) { removed++; continue; }
      seen.add(p);
      cleaned.push(p);
      continue;
    }
    const id = p.id || p.openId;
    if (isPlaceholderId(id) || seen.has(id)) { removed++; continue; }
    seen.add(id);
    cleaned.push(p);
  }
  return { cleaned, removed };
}

exports.main = async (event) => {
  console.log('🧹 [cleanTempUserData] 开始执行', event);

  if (!isDebugEnabled()) {
    return {
      success: false,
      disabled: true,
      error: '清理工具已禁用,需在云函数环境变量中设置 DEBUG_TOOLS_ENABLED=true'
    };
  }

  const dryRun = event && event.dryRun === true;
  console.log('🧹 [cleanTempUserData] dryRun:', dryRun);

  const db = cloud.database();
  const conversationsCollection = db.collection('conversations');

  try {
    // 微信云数据库默认 limit 100,需要分页拉取
    const PAGE_SIZE = 100;
    let scanned = 0;
    let dirty = 0;
    let cleaned = 0;
    let removedItems = 0;
    const details = [];

    let lastId = null;
    while (true) {
      let query = conversationsCollection;
      if (lastId) {
        query = query.where({ _id: db.command.gt(lastId) });
      }
      const res = await query.limit(PAGE_SIZE).get();
      const list = res.data || [];
      if (list.length === 0) break;

      for (const conv of list) {
        scanned++;
        lastId = conv._id;

        const result = sanitize(conv.participants);
        if (result.removed === 0) continue;

        dirty++;
        removedItems += result.removed;

        const detail = {
          chatId: conv._id,
          before: Array.isArray(conv.participants) ? conv.participants.length : 0,
          after: result.cleaned.length,
          removed: result.removed
        };

        if (!dryRun) {
          try {
            await conversationsCollection.doc(conv._id).update({
              data: { participants: result.cleaned }
            });
            cleaned++;
            detail.updated = true;
          } catch (updateErr) {
            console.error('🧹 [cleanTempUserData] 更新失败:', conv._id, updateErr.message);
            detail.updated = false;
            detail.error = updateErr.message;
          }
        }

        if (details.length < 50) details.push(detail);
        console.log('🧹 [cleanTempUserData] 处理:', detail);
      }

      if (list.length < PAGE_SIZE) break;
    }

    const summary = {
      success: true,
      dryRun,
      scanned,
      dirty,
      cleaned,
      removedItems,
      details
    };

    console.log('🧹 [cleanTempUserData] 完成:', {
      scanned,
      dirty,
      cleaned,
      removedItems,
      dryRun
    });

    return summary;
  } catch (error) {
    console.error('🧹 [cleanTempUserData] 错误:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
