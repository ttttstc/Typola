# Typola

> 中文 · [English](./README.en.md)

**Typola 是面向 AI 时代的本地 Markdown 文档工作台。**

它不是一个把聊天窗口塞进编辑器的 Markdown 工具，而是把“写作、审阅、AI 改稿、产物生成、导出交付”放在同一个桌面工作台里。文档始终是中心，AI 对话只是草稿纸，生成物会回到本地文件与主编辑器。

Typola 默认本地优先：桌面端基于 Tauri，AI 能力复用你本机已经安装的 CLI，例如 Claude Code / OpenCode。Typola 不要求在应用里填写 API Key，也不接管你的模型账号、权限和余额。

## 为什么是 Typola

| 场景 | 常见工作流 | Typola 工作流 |
| --- | --- | --- |
| 改一段文字 | 复制到网页 AI，等回复，再复制回编辑器 | 选中正文，点浮条动作，查看差异，一键采纳替换 |
| 写一份新材料 | 长对话产出草稿，再手动保存为文件 | 在心流模式选择报告 / PPT / HTML 等场景，产物落到本地 `.typola-output` |
| 审阅文档 | Word 批注或手写意见，人工合并 | 选段加检视意见，统一汇总、导出 review 版或发 AI 改稿 |
| 管理 AI 产物 | 对话里翻历史，找不到最终文件 | 右侧 AI 产物中心按会话 / 全部产物浏览，可打开、对比、归档、覆盖原文、撤销覆盖 |
| 使用本机 Agent | 另开终端，离开文档上下文 | 在 AI 工作台中切换 Claude Code / OpenCode，沿用本机 CLI 配置 |

## 核心能力

### 三种文档工作模式

- **阅读模式**：默认写作与阅读环境。文件树、目录、大纲、Word / HTML / 公众号预览按需展开，不打扰正文。
- **心流模式**：左侧 AI 工作台，右侧 SkillHub / 产物中心。适合把当前文档交给 AI 总结、改稿、生成报告、制作 HTML 或 PPT。
- **检视模式**：围绕“审稿”设计。选中文本即可添加检视意见，右侧集中管理，可导出带意见的 review.md，也可让 AI 按意见生成修订稿。

### AI 工作台

- 支持 **Claude Code** 与 **OpenCode** Provider，在 Composer 底部切换。
- 设置页提供轻量 CLI 检测：识别路径、版本、诊断结果，不做模型请求污染。
- Claude 使用 headless stream-json 链路，OpenCode 使用 `opencode run`，统一渲染正文、思考、工具调用和产物回流。
- 支持多会话 pill，下拉切换 / 新建 / 关闭 / 重命名，不和主编辑器文件 tab 混在一起。
- 支持 `<question-form>` 问题表单：AI 需要补充信息时渲染为应用内卡片，用户提交后作为下一轮普通消息继续。
- 支持附件与当前文档上下文，发送时把可见 context chip 对应文件传给 CLI。
- 工具调用默认折叠，低关注度的读取、搜索、命令执行不会刷屏。

### SkillHub 与 AI 产物中心

- SkillHub 提供系统预设场景模板，例如报告生成、PPT 制作、HTML 制作。
- Claude 场景读取 `~/.claude/skills/`，OpenCode 场景读取全局或项目级 command 配置。
- 未安装的系统推荐 skill 会置灰并提供安装引导；用户可把本机已有 skill 添加到场景。
- AI 生成物统一写入当前 AI 工作目录下的 `.typola-output/<conversation>/`。
- 产物中心可按当前会话或全部产物扫描，支持打开、对比、归档、删除、覆盖原文与撤销覆盖。
- AI 改稿产物也进入产物列表，不再散落在聊天记录里。

### 选区 AI 与可撤销改稿

- 选中文本后出现浮条，可执行润色、改写、缩写、扩写、校对、解释术语、自定义请求、加检视意见。
- 结果以差异卡呈现，可一键采纳替换或忽略。
- AI 替换前会保存快照，`Ctrl/Cmd+Z` 能区分手动编辑和 AI 修改，逐步撤销。
- Anchor 校验确保替换仍作用在原选区，原文发生变化时会提示手动定位。

### Markdown 编辑与阅读体验

- 默认使用 **CodeMirror 6 live preview** 编辑内核，支持任务列表、表格、图片、KaTeX 数学公式和 Mermaid 图表。
- Vditor WYSIWYG 作为过渡回退保留，可通过本地 `typola.editorEngine=vditor` 切换。
- 支持源码模式、文件内查找替换、快速打开、编辑辅助、文档统计、同步滚动、大纲跳转。
- 图片支持本地相对路径、剪贴板图片保存到 `assets/`、远程图片预览与导出。
- Mermaid / KaTeX 在阅读、预览、导出链路保持一致。

### 导出与交付

- **PDF 导出**：后台导出，成功 / 失败用 toast 通知，不打断当前编辑。
- **Word 导出**：支持 Word 纸张预览与 `.docx` 导出。
- **HTML / 公众号预览**：支持富文本 HTML 复制、完整 HTML 导出和公众号样式预览。
- **Review 导出**：把检视意见按段落写入 review.md，适合给协作者或再喂给 AI。
- `.docx` 可作为只读预览打开。

### 桌面能力

- Tauri 原生桌面应用，支持 Windows 和 macOS 打包。
- 文件关联、拖拽打开、单实例转发、自动更新。
- 左侧文件树、多文件 tab、未保存三按钮确认。
- 底部集成终端，支持多 tab，默认使用当前 workspace 或当前文件目录。
- 自动保存作为设置项保留，但默认关闭。

## 安装

### Windows 安装版

从 GitHub Releases 下载：

- `Typola_*_x64-setup.exe`
- `Typola_*_x64_en-US.msi`

适合长期使用、文件关联和自动更新。

### Windows 免安装版

下载 `Typola_*_windows-x64_portable.zip`，解压后运行 `Typola.exe`。适合临时测试或便携使用。

> Windows 需要 Microsoft Edge WebView2 Runtime。现代 Windows 通常已经内置。

### macOS

下载对应架构的 `.dmg`，打开后拖拽 `Typola.app` 到 Applications。首次启动如遇安全提示，在系统设置的“隐私与安全性”中允许打开。

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
| `Ctrl/Cmd + O` | 打开文件 |
| `Ctrl/Cmd + S` | 保存 |
| `Ctrl/Cmd + Shift + S` | 另存为 |
| `Ctrl/Cmd + F` / `H` | 查找 / 替换 |
| `Ctrl/Cmd + Shift + P` | 快速打开 |
| `Ctrl/Cmd + P` | 导出 PDF |
| `Ctrl/Cmd + Shift + I` | 编辑辅助 |
| `Ctrl/Cmd + K` | 对选区打开 AI 动作菜单 |
| `Ctrl/Cmd + Z` | 撤销，包含 AI 修改快照 |
| `Shift + A` | 切换心流模式 |
| `Ctrl/Cmd + ,` | 打开设置 |

## 开发

依赖：

- Node.js + npm
- Rust stable
- Tauri v2 平台依赖
- Windows 可选：WebView2 Runtime、WiX / NSIS 打包环境

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
npm run tauri:build:local      # 本地安装版：msi + nsis
npm run tauri:build:portable   # 本地免安装版：portable zip
npm run tauri:build:update     # 带更新签名的发布构建
```

产物位置：

- Windows EXE：`src-tauri/target/release/typola.exe`
- Windows 安装包：`src-tauri/target/release/bundle/{msi,nsis}/`
- Windows 免安装包：`src-tauri/target/release/bundle/portable/`
- macOS：CI 产出 `.dmg` 与 portable zip

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
