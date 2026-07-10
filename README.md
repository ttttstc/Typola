# Typola

> 中文 · [English](./README.en.md)

**Typola 是一个面向 Windows 的 Markdown 写作、AI 改稿和文档交付桌面工作台。**

写文档最烦的往往不是“写”，而是在编辑器、AI 网页、终端、预览工具和导出工具之间来回搬运。Typola 想把这些碎片收回来：你可以在这里写 Markdown，选中一段让 AI 润色，把一堆材料变成报告 / PPT / HTML，给草稿加检视意见，最后导出 PDF、Word、HTML 或 review.md。

更重要的是，AI 生成的内容不会困在聊天记录里。它会变成你本地工作目录里的文件：能打开、对比、归档、覆盖原文，也能撤销覆盖。

> 可以把 Typola 理解成：**Markdown 编辑器 + AI 文档助手 + 本地产物中心**。

## 你可以用它做什么

- **写得更顺**：用接近成品的排版写 Markdown，图片、表格、代码块、公式、Mermaid 图表都能直接看见效果。
- **改得更快**：选中一段文字，就能润色、改写、缩写、扩写、校对或解释术语；结果先给你看差异，再决定要不要替换。
- **审得更清楚**：给具体段落加检视意见，集中查看所有问题，也可以导出 review.md 或让 AI 按意见生成修订稿。
- **生成得更落地**：让 AI 基于当前文稿或工作目录材料生成报告、PPT 草稿、HTML 页面等产物，生成后直接进入本地文件列表。
- **交付得更省心**：同一份文档可以导出 PDF、Word、HTML，也能复制适合富文本编辑器 / 公众号后台粘贴的 HTML。
- **少搬运上下文**：AI 工作台会带着当前文档和附件工作，需要你补充信息时会弹出表单，而不是让你在聊天记录里猜它缺什么。
- **沿用本机能力**：支持接入你已经安装好的 Claude Code / OpenCode，账号、权限、模型和额度仍然由本机 CLI 管理。

## 能力概览

### 写作与阅读

- Markdown 写作统一使用 CM6 内核：写作模式提供 live preview，源码模式保留纯 Markdown 编辑。
- 支持阅读 / 心流 / 检视三种文档模式、源码模式、文件内查找替换、快速打开、编辑辅助、文档统计、同步滚动和浮动大纲跳转。
- 支持任务列表、表格、代码块、图片、KaTeX 数学公式和 Mermaid 图表；大纲会避开 fenced code block 内的 `#`。
- 图片支持本地相对路径、剪贴板粘贴保存、远程图片预览与导出。
- 多文件 tab、文件树、拖拽打开、未保存关闭确认，适合日常长文档工作。
- 内置素笺、深海、墨韵、抽象、粗野五套主题，并覆盖编辑器、AI 浮层、检视标注与终端配色。

### AI 改稿与审阅

- 选中文本后出现贴近选区的浮条，可执行润色、解释术语和添加检视意见；完整改写、缩写、扩写、校对和自定义请求保留在右键 / `Ctrl+K` 菜单中。
- 选区会以差异颜色标识，方便确认 AI 操作作用范围。
- 改稿结果以差异卡展示，确认后再替换正文，避免 AI 直接改坏原文。
- AI 修改会保存快照，`Ctrl+Z` 可以一步步撤销。
- 检视意见可以集中管理，也可以导出 review.md，方便给协作者或继续交给 AI 处理。

### AI 工作台

- 支持 Claude Code 与 OpenCode，在底部轻量切换。
- Claude Code 使用 headless stream-json 链路，OpenCode 使用 `opencode run` JSON 链路；Codex CLI 目前可检测但不作为可发送 Provider。
- 支持多轮对话、Provider 切换确认、停止生成、继续提问和工作区切换。
- AI 的思考、正文、工具调用和问题表单会以应用内卡片展示；低关注度的工具调用默认折叠，不刷屏。
- 支持当前文档、附件、可见 context chips、`.mcp.json` 和 Plugin directory，让 AI 更容易围绕正在写的材料工作。
- 如果 AI 需要你补充信息，会显示可填写表单，提交后继续当前任务。

### SkillHub 与产物中心

- 内置报告生成、PPT 制作、HTML 制作等场景入口。
- Claude Skill 与 OpenCode command 会按当前 Provider 分开扫描和展示；系统推荐项会显示安装状态，未安装时提供安装 / 配置引导。
- 用户也可以把本机已有 skill / command 添加到场景模板中。
- AI 生成的文件会统一进入当前 AI 工作区的 `.typola-output/<conversationId>/`，不再散落在聊天记录里。
- 右侧产物中心可查看当前会话或全部产物，支持打开、对比、归档、删除、覆盖原文和撤销覆盖。

### 导出与交付

- PDF 后台导出，成功或失败用右上角通知提示，不打断写作。
- Word 导出支持纸张预览、自定义导出预设与 `.docx` 输出。
- HTML 支持完整导出、富文本复制、公众号样式预览和浏览器打开预览。
- Markdown / HTML / Word / PDF 导出共用 Markdown source 渲染桥接，减少编辑器 DOM 差异。
- `.docx` 文件可作为只读预览打开，HTML 文档可进入阅读 / 编辑链路。

### 桌面体验

- 当前发布面向 Windows。
- 支持文件关联、单实例打开、启动期 WebView2 Runtime 预检和自动更新。
- 底部集成终端，可在当前工作目录或当前文件目录启动。
- 自动保存作为设置项保留，但默认关闭，避免意外覆盖。

## 安装

### Windows 安装版

从 GitHub Releases 下载：

- `Typola_*_x64-setup.exe`

适合长期使用、文件关联和自动更新。Windows 安装包提供 `setup.exe` 与 `.msi` 两种形式，安装时可以选择目录；`.msi` 安装到 Program Files 等受限目录时会请求管理员权限，`setup.exe` 默认走当前用户安装。安装包会携带 WebView2 bootstrapper；目标机器缺少 WebView2 Runtime 时，Typola 会在创建窗口前先运行 bootstrapper，失败时给出明确安装指引。

### Windows 免安装版

下载 `Typola_*_windows-x64_portable.zip`，完整解压后直接运行 `Typola.exe`。它会先检测 WebView2 Runtime，再创建应用窗口。适合临时测试或便携使用。

> 免安装版不会写入 Program Files，但首次启动时会在 WebView2 Runtime 缺失时先运行随包携带的 WebView2 bootstrapper；如果无网或安装失败，会显性提示用户先安装 WebView2，并给出官方安装入口。`Start-Typola.cmd` 仅作为诊断兜底保留。
> 不建议、也不承诺单独分发包内的 `Typola.exe`。Windows 发布物以安装包和 portable zip 为准。

## AI CLI 准备

Typola 不内置模型账号。请先按对应项目的官方方式安装你要使用的 CLI，并确认命令可用：

```bash
claude --version
opencode --version
```

然后在 **设置 → AI 执行** 中检测 CLI。模型、权限、MCP、插件目录等行为以你本机 CLI 环境为准。

## 快速开始

1. 打开 Markdown / HTML / Word 文件，或把文件拖进窗口。
2. 在阅读模式中写作；需要原始 Markdown 时切到源码模式。
3. 选中文本，使用浮条执行 AI 改稿或添加检视意见。
4. 切换到心流模式，选择 SkillHub 场景或直接在 AI 工作台提问。
5. 在右侧产物中心打开、对比、归档或覆盖 AI 产物。
6. 导出 PDF / Word / HTML / review.md 完成交付。

常用快捷键：

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + O` | 打开文件 |
| `Ctrl + S` | 保存 |
| `Ctrl + Shift + S` | 另存为 |
| `Ctrl + F` / `H` | 查找 / 替换 |
| `Ctrl + Shift + P` | 快速打开 |
| `Ctrl + P` | 导出 PDF |
| `Ctrl + Shift + I` | 编辑辅助 |
| `Ctrl + K` | 对选区打开 AI 动作菜单 |
| `Ctrl + Z` | 撤销，包含 AI 修改快照 |
| `Shift + A` | 切换心流模式 |
| `Ctrl + ,` | 打开设置 |

## 开发

依赖：

- Node.js + npm
- Rust stable
- Tauri v2 平台依赖
- Windows 可选：WebView2 Runtime、NSIS 打包环境

```bash
npm install
npm run tauri dev        # 桌面开发模式
npm run dev              # 前端开发模式
npm run typecheck        # TypeScript 检查
npm test                 # Vitest 单测
cargo test --manifest-path src-tauri/Cargo.toml
```

## 打包

```bash
npm run tauri:build:local      # 本地安装版：NSIS setup.exe + MSI
npm run tauri:build:portable   # 本地免安装版：portable zip
npm run tauri:build:update     # 带更新签名的发布构建
```

产物位置：

- Windows EXE：`src-tauri/target/release/typola.exe`
- Windows NSIS 安装包：`src-tauri/target/release/bundle/nsis/`
- Windows MSI 安装包：`src-tauri/target/release/bundle/msi/`
- Windows 免安装包：`src-tauri/target/release/bundle/portable/`

## 项目结构

```text
src/                 React 前端、编辑器、AI 工作台、导出 UI
src-tauri/           Tauri / Rust 后端、文件系统、终端、CLI spawn、导出命令
docs/                架构、AI 工作台、编辑器、导出与功能设计文档
config/              Vite / TypeScript / Playwright / ESLint 配置
public/vditor/dist/  本地化 Vditor 资源
scripts/             打包、portable、updater manifest 辅助脚本
```

## 技术栈

- Desktop：Tauri v2、Rust、portable-pty
- Frontend：React 19、TypeScript、Vite 8
- Editor：CodeMirror 6、Atomic Editor、Vditor
- Markdown：KaTeX、Mermaid、DOMPurify
- Terminal：xterm.js
- AI CLI：Claude Code、OpenCode

## 设计原则

- **文档是成品，AI 对话是草稿纸。**
- **产物必须回到本地文件和主编辑器，而不是困在聊天记录里。**
- **尽量复用用户本机 CLI 与 skill 生态，不把模型账号锁进应用。**
- **导出、预览和编辑使用同一份 Markdown source，减少不可解释差异。**
- **危险操作显式确认，未保存内容不静默丢失。**

## 文档

- [架构说明](./docs/ARCHITECTURE.md)
- [AI 工作台 Skill OS](./docs/AI_WORKBENCH_SKILL_OS.md)
- [OpenCode Provider PRD](./docs/AI_WORKBENCH_OPENCODE_PRD.md)
- [AI Diff Preview](./docs/AI_DIFF_PREVIEW_SPEC.md)
- [AI 编辑与检视](./docs/AI_EDIT_AND_REVIEW_SPEC.md)
- [PDF 导出](./docs/PDF_EXPORT_SPEC.md)
- [Mermaid 支持](./docs/MERMAID_SPEC.md)

## 许可证

Apache License 2.0
