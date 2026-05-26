/**
 * temp_user 登录时序修复的单元测试
 *
 * 验证 app.ensureLogin() 在以下三种场景下的行为:
 *   1. 已登录(globalData.openId 存在): 立即 resolve
 *   2. 本地缓存有但 globalData 未同步: 从缓存恢复
 *   3. 完全未登录: 主动调 performCloudLogin
 */

const path = require('path');

// ====== 模拟 wx 全局 ======
const mockStorage = {};
global.wx = {
  cloud: {
    callFunction: ({ name, data, success, fail }) => {
      // 模拟 login 云函数
      setTimeout(() => {
        if (name === 'login') {
          success && success({
            result: {
              success: true,
              openId: 'mock_openid_123',
              userInfo: {
                openId: 'mock_openid_123',
                nickName: '云端用户',
                avatarUrl: '/cloud-avatar.png'
              }
            }
          });
        }
      }, 50);
    },
    init: () => {}
  },
  getStorageSync: (k) => mockStorage[k],
  setStorageSync: (k, v) => { mockStorage[k] = v; },
  removeStorageSync: (k) => { delete mockStorage[k]; },
  setStorage: ({ key, data, success }) => { mockStorage[key] = data; success && success(); },
  getStorage: ({ key, success, fail }) => {
    if (mockStorage[key]) {
      success && success({ data: mockStorage[key] });
    } else {
      fail && fail();
    }
  },
  onUserCaptureScreen: () => {},
  onNetworkStatusChange: () => {},
  onPageNotFound: () => {},
  showModal: () => {},
  showToast: () => {},
  setNavigationBarTitle: () => {}
};

// 模拟 App 全局
let registeredApp = null;
global.App = (config) => { registeredApp = config; };
global.Page = () => {};

// ====== 加载 app.js ======
require(path.join(__dirname, '..', 'app.js'));

// 创建 app 实例(模拟真实运行)
const app = Object.assign({
  globalData: registeredApp.globalData
}, registeredApp);

// 让 ensureLogin / performCloudLogin 等方法的 this 指向 app
function callMethod(name, ...args) {
  return app[name].apply(app, args);
}

// ====== 测试用例 ======
async function runTests() {
  let pass = 0, fail = 0;

  function assert(name, cond, detail) {
    if (cond) {
      pass++;
      console.log(`PASS  ${name}`);
    } else {
      fail++;
      console.log(`FAIL  ${name}  ${detail || ''}`);
    }
  }

  // ----- Case 1: 已登录场景 -----
  app.globalData.userInfo = { openId: 'existing_user', nickName: '老用户' };
  app.globalData.openId = 'existing_user';
  app.globalData.hasLogin = true;
  app._cloudLoginPromise = null;

  const r1 = await callMethod('ensureLogin');
  assert('Case1 已登录立即 resolve', r1 && r1.openId === 'existing_user', JSON.stringify(r1));

  // ----- Case 2: 本地缓存恢复 -----
  app.globalData.userInfo = null;
  app.globalData.openId = null;
  app.globalData.hasLogin = false;
  app._cloudLoginPromise = null;
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  mockStorage.userInfo = { nickName: '缓存用户' };  // 注意没有 openId
  mockStorage.openId = 'cached_openid';

  const r2 = await callMethod('ensureLogin');
  assert('Case2 本地缓存恢复', r2 && r2.openId === 'cached_openid', JSON.stringify(r2));
  assert('Case2 globalData 同步', app.globalData.openId === 'cached_openid');
  assert('Case2 hasLogin 同步', app.globalData.hasLogin === true);
  assert('Case2 userInfo.openId 补齐', r2.openId === 'cached_openid');

  // ----- Case 3: 完全未登录,主动调 performCloudLogin -----
  app.globalData.userInfo = null;
  app.globalData.openId = null;
  app.globalData.hasLogin = false;
  app._cloudLoginPromise = null;
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);

  const r3 = await callMethod('ensureLogin');
  assert('Case3 主动登录', r3 && r3.openId === 'mock_openid_123', JSON.stringify(r3));
  assert('Case3 globalData 同步', app.globalData.openId === 'mock_openid_123');

  // ----- Case 4: 并发调用复用同一 Promise -----
  app.globalData.userInfo = null;
  app.globalData.openId = null;
  app.globalData.hasLogin = false;
  app._cloudLoginPromise = null;
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);

  const [r4a, r4b, r4c] = await Promise.all([
    callMethod('ensureLogin'),
    callMethod('ensureLogin'),
    callMethod('ensureLogin')
  ]);
  assert('Case4 并发 1', r4a && r4a.openId === 'mock_openid_123');
  assert('Case4 并发 2', r4b && r4b.openId === 'mock_openid_123');
  assert('Case4 并发 3', r4c && r4c.openId === 'mock_openid_123');

  console.log(`\n--- ${pass} pass / ${fail} fail ---`);
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
