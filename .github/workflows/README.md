# GitHub Actions 工作流

## ci.yml — CI 自动化测试

### 触发条件

- `push` 到 `main` 分支
- `pull_request` 目标为 `main` 分支

### 步骤

1. 检出代码(`actions/checkout@v4`)
2. 安装 Node.js 20(`actions/setup-node@v4`)
3. 语法检查 `app/pages/chat/chat.js`
4. 语法检查 `app/pages/chat/modules/*.js`(20 个子模块)
5. 跑完整测试套件 `bash .tools/run_all_tests.sh`(6 套测试 / 187 用例)

### 跑失败时

- 看 GitHub PR 页面的 Checks tab,展开 Test 步骤
- 本地复现:
  ```bash
  bash .tools/run_all_tests.sh
  ```

### 为什么不装依赖

整套测试纯 node 运行,不依赖 `npm install` 或第三方包。模块内部 `require` 都指向相对路径,构成完整可测试单元。

### 后续扩展

- 可考虑加 `eslint` job(项目暂未配置 ESLint)
- 可考虑加 微信小程序构建产物校验(需 wx-cli)
- 可考虑用 matrix 测多个 Node 版本(目前只测 20)
