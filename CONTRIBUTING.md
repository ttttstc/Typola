# 贡献指南

欢迎来到 Typola。本文档面向人类贡献者和 AI Agent。开始前请先读 [README.md](./README.md) 和 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 项目定位

Typola 是轻量桌面 Markdown 编辑器，聚焦 CM6 写作与源码编辑、Word/HTML/PDF 预览导出，以及集成终端。Vditor 只作为既有兼容预览资源保留。项目强调少而克制：能不加的功能不加；能收敛的入口先收敛。

大型或偏离定位的功能，例如双栏对比、外部 localhost 服务集成、恢复旧 Electron 工作区模型、批量预设等，请先开 Issue 讨论，再开 PR。

## 必跑验证

PR 提交前优先本地跑：

```bash
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

涉及布局、窗口、终端、文件打开保存或系统集成时，还需要用 `npm run tauri dev` 或打包后的桌面应用做 smoke test。

## PR 流程

- 一个 PR 尽量只解决一个主题。
- 从 `main` 拉新分支，命名 `codex/<short-desc>` 或 `fix/<short-desc>` / `feat/<short-desc>`。
- 提交信息使用简短中文描述，例如 `refactor: 重写 Typola 桌面壳`。
- PR 描述至少包含 Summary、Why、Test Plan、Risk & Rollback。

## 明确禁止项

- 不要恢复旧 Electron / Milkdown / 工作区 / 多标签 / 全局搜索实现。
- 不要恢复法律行业专项、内测授权、复杂表格锁定或查看原貌链路。
- 不要禁用核心编辑器快捷键。
- 不要悄悄回退用户已配置的设置项开关。
- 不要删除或弱化既有测试断言，除非对应功能已明确移除。
- 不要扩展 Tauri capability 给当前功能不需要的权限。
- 不要把 `.env`、密钥、token、构建产物或本地调试目录提交进版本库。
- 不要使用 `--no-verify`、`--force`、`git reset --hard` 等绕过或破坏性操作，除非用户明确要求。

## AI Agent 专项

- 接到任务后先确认当前分支、工作区状态和相关架构边界。
- 文件编辑前说明将修改的范围。
- 遇到不清的产品取舍时先询问，不要凭空恢复已移除功能。
- 完成前必须实际查看验证命令输出，再声明通过。
- 用户可见变更同步更新 `CHANGELOG.md`。

## 仓库目录速查

```text
.
├── README.md / CONTRIBUTING.md / CHANGELOG.md
├── AGENTS.md / CLAUDE.md
├── docs/                       架构与辅助资产
├── src/                        React 前端
├── src-tauri/                  Tauri 桌面工程
├── e2e/                        Playwright 端到端测试
├── config/                     ESLint / Playwright / Vite / tsconfig
└── public/vditor/              既有兼容预览所需的本地化 Vditor 静态资源
```
