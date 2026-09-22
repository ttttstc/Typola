<p align="center">
  <img width="256" height="256" alt="Typola icon" src="https://github.com/user-attachments/assets/b8388747-5cde-4fd1-bc42-e016335a112b" />
</p>

# Typola

<p align="center">
  <a href="https://github.com/ttttstc/Typola/releases"><img src="https://img.shields.io/github/v/tag/ttttstc/Typola?label=version&style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square" alt="License"></a>
</p>

> 中文 · [English](./README.en.md)

**Typola 是面向 Windows 的 Markdown 写作、AI 改稿与文档交付桌面工作台。**

当前发布版本：2.0.9。

一份文档，从写作、审阅、AI 协作到交付，不必在编辑器、聊天网页、终端和导出工具之间反复搬运。

> Markdown 编辑器 + AI 文档助手 + 本地产物中心。

## 适合谁

- 想用 Markdown 写长文、报告、技术文档或内容稿，但希望看到接近成品的排版。
- 希望让 AI 协助润色、改写和审阅，但始终由自己确认每一次改动。
- 需要把文稿、AI 产物与 PDF / Word / HTML 交付物留在本地工作目录中。

## 发布版重点

### 写作不脱离 Markdown

- CM6 写作模式与源码模式共用同一份 Markdown；图片、表格、代码、公式与 Mermaid 图表可直接预览。
- 表格支持单元格/行/列选择、右键行列操作、Markdown / TSV / HTML 粘贴、Tab / Enter 导航及撤销重做。
- 提供文件树、多文档、查找替换、快捷打开、同步滚动与浮动大纲。

### AI 改稿可控、可撤销

- 选中内容即可润色、改写、缩写、扩写、校对或解释术语；结果先以差异展示，再由你确认是否写回正文。
- 检视意见可附着到具体段落、集中管理并导出 `review.md`。
- 检视状态按文档路径保存，重新打开文档仍可继续处理；忽略意见保持终态，已应用意见保留在历史并可导出，但不再进入下一轮 AI 改稿。
- 支持接入本机已有的 Claude Code 与 OpenCode；模型、权限、MCP 和额度继续由你的 CLI 环境管理。

### 交付物回到本地文件

- AI 生成的报告、PPT 草稿、HTML 等文件统一收纳在 `.typola-output/`，可打开、对比、归档、覆盖原文或撤销覆盖。
- 同一份 Markdown 可导出 PDF、Word、HTML，也可复制富文本 HTML 用于发布。Word 使用内置 TypeScript `docx` 生成器，不依赖 Pandoc 或其他外部转换器。

## 60 秒开始

1. 从 [GitHub Releases](https://github.com/ttttstc/Typola/releases) 下载 Windows 安装包或免安装包。
2. 打开 / 拖入 Markdown、HTML 或 Word 文件。
3. 在写作模式中编辑；需要原始 Markdown 时切换源码模式。
4. 选中文字执行 AI 改稿或添加检视意见。
5. 在右侧产物中心处理 AI 生成的本地文件，最后导出 PDF、Word 或 HTML。

## 安装

### Windows 安装版

下载 `Typola_*_x64-setup.exe` 或 `.msi`。安装版适合长期使用，支持文件关联；发现新版本后会显示右上角更新卡片，点击即可下载、安装并重启。

### Windows 免安装版

下载 `Typola_*_windows-x64_portable.zip`，完整解压后运行 `Typola.exe`。适合测试和便携使用；发现新版本时会打开 GitHub Releases，不会把便携版转换为安装版。

> Typola 依赖 Microsoft Edge WebView2 Runtime。发布包会在缺失时给出安装引导；请分发安装包或 portable zip，而不是单独分发内部 `Typola.exe`。PDF 导出还需要系统已安装 Google Chrome、Chromium 或 Microsoft Edge；Word 导出无需安装 Pandoc。

## 使用 AI 前

Typola 不出售或内置模型账号。按官方方式安装你要使用的 CLI，并在终端确认：

```bash
claude --version
opencode --version
```

然后打开 **设置 → AI 执行** 检测运行环境。你可继续使用自己已有的账号、模型、权限、MCP 与插件配置。

## 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + O` | 打开文件 |
| `Ctrl + S` | 保存 |
| `Ctrl + F` / `Ctrl + H` | 查找 / 替换 |
| `Ctrl + Shift + P` | 快速打开 |
| `Ctrl + K` | 打开选区 AI 动作 |
| `Ctrl + Z` | 撤销，包括 AI 改稿 |
| `Ctrl + P` | 导出 PDF |
| `Ctrl + ,` | 打开设置 |

## 设计取舍

- **文档是成品，AI 对话是草稿纸。** AI 输出必须回到本地文件与主编辑器。
- **Markdown 是唯一事实来源。** 编辑、预览和导出尽量由同一份 source 驱动，降低不可解释差异。
- **优先复用本机工具。** AI 能力接入本机 CLI 与 skill 生态，不锁定账号。
- **危险改动显式确认。** AI 替换、覆盖原文和未保存关闭都保留可见的确认与撤销路径。

## 开发与打包

依赖：Node.js、Rust stable、Tauri v2 平台依赖；Windows 打包还需要 WebView2 Runtime 与 NSIS 环境。

```bash
npm install
npm run tauri dev
npm run typecheck
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

```bash
npm run tauri:build:local      # NSIS setup.exe + MSI
npm run tauri:build:portable   # portable zip
npm run tauri:build            # 从 VERSION 同步版本并生成带更新签名的正式构建
npm run tauri:build:update     # tauri:build 的兼容别名
npm run version:check          # 可选本地诊断；发布 CI 会自动同步并校验
```

### Windows exe 全量验收

这组命令运行真实 Tauri + WebView2 exe，不是 Vite 页面或 Playwright 渲染器替代品。先构建验证专用 debug exe，再运行 core 与 extended 两套套件：

```powershell
& '.\\node_modules\\.bin\\tauri.cmd' build --debug --no-bundle --config '.nimo/verification/tauri-verification.conf.json'
npm run verify:exe-core:all       # 全量非 AI exe 验收：core + extended
# 也可单独运行：
npm run verify:exe-core           # core
npm run verify:exe-core:extended  # extended
```

结果和跳过原因会写入 `.nimo/verification/evidence/`。`verify:exe-core:all` 当前覆盖非 AI 核心与扩展场景；真实 Claude / OpenCode Provider 的完整链路仍需按 Feature Map 做专项验证，不能把这条命令当成 AI 全量证明。

正式发版先在 `main` 合入根目录 `VERSION` 的版本提交，再由维护者手动触发 GitHub Actions 的 `Package (manual dispatch)`，选择 `main`、填写版本并将 `publish` 设为 `true`。Workflow 会校验版本跃迁，自动创建同版本 Tag、同步 package / Tauri / Cargo 与锁文件版本，构建签名的 Windows 安装包和 portable 包，生成 `latest.json`，完成资产校验后公开 Release；不要手动创建发布 Tag，也无需手动运行 `version:sync` 或 `version:check`。本地执行 `npm run tauri:build` 时仍会自动同步版本，并要求设置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

## 技术与文档

- Desktop：Tauri v2、Rust、portable-pty
- Frontend：React、TypeScript、Vite
- Editor：CodeMirror 6、`codemirror-markdown-tables`、Vditor（预览 / 导出兼容链路）
- Markdown：KaTeX、Mermaid、DOMPurify

详细实现与架构决策请见：

- [用户指导手册](./docs/USER_GUIDE.md)
- [架构说明](./docs/ARCHITECTURE.md)
- [AI 工作台 Skill OS](./docs/AI_WORKBENCH_SKILL_OS.md)
- [AI 编辑与检视](./docs/AI_EDIT_AND_REVIEW_SPEC.md)
- [PDF 导出](./docs/PDF_EXPORT_SPEC.md)

## 许可证

Apache License 2.0
