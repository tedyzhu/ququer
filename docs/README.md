# 项目文档索引

本目录是项目工程文档的**唯一权威入口**。每个阶段的工作总结、关键决策、技术债等都在对应的 `P*-Summary.md` 中。

历史 hotfix 报告与版本验证文档放在 [`archive/`](./archive/) 中(只读历史,不再维护)。
更早的零散修复记录在仓库根目录 [`.plans/`](../.plans/) 中(见 [`.plans/README.md`](../.plans/README.md))。

---

## 当前阶段交付(权威)

按时间顺序,从 P0(仓库清理起点)到 P5(测试覆盖完整):

| 阶段 | 文档 | 焦点 | chat.js | 测试 PASS |
| --- | --- | --- | --- | --- |
| P0 | [P0-Cleanup-Summary.md](./P0-Cleanup-Summary.md) | 仓库清理 | 15500 → 15500 | — |
| P1 | [P1-Summary.md](./P1-Summary.md) | 7 模块抽离 + 性能 | 15500 → ~13000 | — |
| P2 | (合并到 P3) | 5 大模块抽离 | ~13000 → 5948 | — |
| P3 | [P3-Summary.md](./P3-Summary.md) | 持续抽离到极限(18 PR) | 5948 → 2237(-62.4%) | 217 |
| P4 | [P4-Summary.md](./P4-Summary.md) | 测试加固 + CI 集成(8 PR) | 2237 不动 | 217 → 559 |
| P5 | [P5-Summary.md](./P5-Summary.md) | 测试覆盖到几乎全部业务模块(9 PR) | 2237 不动 | 559 → 790 |

**累计**:chat.js 从 15500 → 2237 行(**-85.6%**),20 个 chat 模块 / 18 个静态测试 / **790 PASS** / CI ~10-13 秒。

---

## 速查

### 我想找…

| 问题 | 去哪里看 |
| --- | --- |
| chat.js 当前结构 / 模块全景 | [P3-Summary.md § 模块全景](./P3-Summary.md) |
| 重构的 18 个 PR 详情 | [P3-Summary.md § PR 清单](./P3-Summary.md) |
| wxml 绑定不可抽离的限制 | [P3-Summary.md § 关键边界发现](./P3-Summary.md) |
| 测试套件全景(18 个测试 / 790 PASS) | [P5-Summary.md § 当前测试套件全景](./P5-Summary.md) |
| 静态测试可复用模板(fakePage / fake timers / mock cloud / watch 链) | [P4-Summary.md § 测试设计模式沉淀](./P4-Summary.md) + [P5-Summary.md § P5 测试模板补充沉淀](./P5-Summary.md) |
| CI 配置与跑时 | [P4-Summary.md § CI 集成](./P4-Summary.md) |
| 主动放弃的项 / 后续候选 | 各阶段 Summary 末尾的"主动放弃"和"P* 候选"章节 |
| 历史 v1.3.x hotfix 报告 | [`archive/`](./archive/) |
| 早期(P0 之前)的零散修复 | [`.plans/archive/`](../.plans/archive/) |

### 跑测试

```
$ bash .tools/run_all_tests.sh
[完成] 全部 18 个静态测试通过
```

CI 配置:[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

### git 备份

- 主线开发分支:`main`
- P0 清理前快照:`backup/before-p0-cleanup`(保留 1-2 个月)

---

## 文档维护原则

1. **`P*-Summary.md` 一经合并,不回填后续阶段内容** — 每个阶段的 Summary 固化在合并那一刻,后续用跳转链接连接到下一阶段
2. **每个新阶段创建独立的 `P*-Summary.md`** — 不要修改已有 Summary 的核心内容
3. **hotfix 报告默认归档** — 新 hotfix 文档应直接放 `archive/`,不在 `docs/` 根新增
4. **跨阶段索引用此 README 维护** — 当新增阶段交付时,更新本文件的"当前阶段交付"表
