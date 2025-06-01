# 🚀 云函数手动部署指南

## 如果右键菜单没有部署选项，请使用以下方法：

### 方法1：云开发控制台部署

#### 部署 notifyInviter 云函数：

1. **打开云开发控制台**
   - 微信开发者工具 → 云开发按钮 → 进入控制台

2. **创建云函数**
   - 左侧菜单：云函数
   - 点击 "新建云函数"
   - 函数名：`notifyInviter`
   - 运行环境：Node.js 16
   - 点击确定

3. **复制代码**
   复制以下代码到在线编辑器：

```javascript
// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'ququer-env-6g35f0nv28c446e7'
})

/**
 * 通知邀请者有新用户加入
 */
exports.main = async (event, context) => {
  console.log('[云函数] 通知邀请者，参数:', event);
  
  try {
    const { chatId, joinerName, inviterOpenId } = event;
    
    if (!chatId || !joinerName || !inviterOpenId) {
      return {
        success: false,
        error: '缺少必要参数'
      };
    }
    
    // 发送订阅消息通知邀请者（如果有权限）
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: inviterOpenId,
        templateId: 'your_template_id', // 需要在微信公众平台配置
        data: {
          thing1: {
            value: joinerName
          },
          thing2: {
            value: '有人加入了您的聊天'
          }
        }
      });
      
      console.log('[云函数] 订阅消息发送成功');
    } catch (msgError) {
      console.log('[云函数] 订阅消息发送失败（可能未配置或用户未订阅）:', msgError.message);
    }
    
    return {
      success: true,
      message: '通知发送完成'
    };
    
  } catch (error) {
    console.error('[云函数] 通知邀请者失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
```

4. **配置依赖**
   在依赖管理中添加：
```json
{
  "name": "notifyInviter",
  "version": "1.0.0",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

5. **保存并部署**
   - 点击 "保存"
   - 点击 "保存并安装依赖"

#### 部署 joinByInvite 云函数：

如果 joinByInvite 云函数已存在，请：
1. 在云函数列表中找到 `joinByInvite`
2. 点击进入编辑
3. 将本地 `cloudfunctions/joinByInvite/index.js` 的内容复制进去
4. 点击 "保存并安装依赖"

### 方法2：检查开发者工具版本

1. **更新开发者工具**
   - 帮助 → 检查更新
   - 下载最新版本

2. **重新初始化项目**
   - 关闭项目
   - 重新打开
   - 确保看到云函数文件夹有云朵图标 ☁️

### 方法3：命令行方式（如果支持）

在项目根目录执行：
```bash
# 进入云函数目录
cd cloudfunctions/notifyInviter

# 安装依赖
npm install

# 返回根目录
cd ../..
```

## 验证部署成功

1. **检查云函数列表**
   - 云开发控制台 → 云函数
   - 确认看到 `notifyInviter` 和 `joinByInvite` 

2. **运行测试**
   - 在小程序中访问 `/pages/test-share/test-share`
   - 点击 "开始完整测试"
   - 观察日志输出

## 常见问题

### 问题1：没有云函数菜单
**解决方案：**
- 确保已开通云开发
- 确保 project.config.json 中有 cloudfunctionRoot 配置
- 重启开发者工具

### 问题2：部署失败
**解决方案：**
- 检查网络连接
- 确认云环境ID正确
- 使用云开发控制台手动部署

### 问题3：函数调用失败
**解决方案：**
- 检查云环境权限设置
- 确认函数名称正确
- 查看云函数日志

## 测试验证

部署完成后，请：
1. 访问测试页面 `/pages/test-share/test-share`
2. 点击 "开始完整测试"
3. 确认所有步骤都显示 ✅ 成功

如果测试通过，说明云函数部署成功，分享邀请功能已完全可用！ 