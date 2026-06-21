# Typola

Typola 是一个轻量、专注、跨平台的 Markdown 桌面编辑器。它面向日常写作、技术文档、长文整理、HTML/Word 交付和本地开发工作流，提供接近 Typora 的所见即所得编辑体验，同时保留源码模式、Word/HTML 预览导出和集成终端。

English documentation is available below: [English](#typola-english).

## 核心能力

- 所见即所得 Markdown 编辑：基于 Vditor IR 模式，写作时保留 Markdown 的可控性，阅读时接近排版后的成稿效果。
- 源码模式：基于 CodeMirror 6，适合处理复杂 Markdown、HTML 片段、表格和精确修改。
- 文件打开与保存：支持 `.md`、`.markdown`、`.html`、`.htm`，并支持只读预览 `.docx`。
- 多文件 tab：从文件树、最近文件、系统打开或拖拽打开多个文档时自动建立 tab，未保存 tab 文件名前显示 `*`，只打开单文件时自动隐藏 tab 栏。
- 左侧文件树：按需打开一个工作目录，支持展开/折叠子目录，从文件树直接打开支持的文档，未保存文件会有 `*` 标记。
- Word 纸张预览：右侧按需打开 A4 纸张预览，支持多页展示和 `.docx` 导出。
- HTML 预览与导出：支持文章级 HTML 预览、导出 HTML，并可复制富文本 HTML 到外部编辑器。
- 编辑器与预览同步滚动：编辑器滚动时右侧 Word / HTML 预览按比例单向同步，零额外重渲染。
- 浮动大纲：自动提取标题，支持轻量悬浮查看、固定到侧栏和点击跳转。
- 查找替换与快速打开：`Cmd/Ctrl+F` 与 `Cmd/Ctrl+H` 一个面板同时覆盖查找与替换，支持大小写 / 全词 / 正则；`Cmd/Ctrl+P` 按文件名或路径片段快速过滤打开最近文件。
- 编辑辅助：一键插入链接 / 图片 / Markdown 表格；粘贴剪贴板图片会异步保存到当前文档同级 `assets/` 并插入相对路径。
- 文档统计：状态栏延迟计算词数、字符数、段落数和预计阅读时间，输入时不阻塞。
- 集成终端：底部多标签终端，支持复制、粘贴、清屏、链接打开、自定义 shell 和文件所在目录启动。
- 本地图片解析：Markdown 中的相对路径图片可在编辑区、预览和导出链路中正常显示。
- 数据安全：tab 关闭与窗口关闭命中未保存改动时弹出「保存 / 不保存 / 取消」三按钮确认；外部文件变更监听会在状态栏提示。
- 设置与主题：支持主题、字体、编码、语言、自动保存、自动更新检查、Word/HTML 预设等配置。
- 桌面原生能力：支持系统文件关联、拖拽打开、单实例打开转发、外部文件变更提示和自动更新。

## 文档形态与 AI 协作

Typola 把同一份文档围绕「阅读 / 心流 / 检视」三种形态展开，工具栏右上的凹槽分段切换器一键切换，左右栏跟随平滑收放。

- **阅读模式**：默认形态。专注阅读和写作，左栏可按需开关文件树，右栏可按需开 Word / 微信预览。
- **心流模式**：左栏展开 AI 工作台对话，右栏挂出技能场景模板（日报、总结报告、PPT、HTML、公众号、数据分析），并自动最大化窗口。AI 产出物（HTML / Markdown / 演示稿）自动落到工作区 `.typola-output/<会话>/`，并以 chip 形态出现在右栏，可一键在主编辑器打开、归档到工作区或删除。
- **检视模式**：把文档当作待审稿，右栏挂出「检视意见」面板。选中段落 → 浮条加意见 → 汇总列表点击跳转 → 「导出 review 版」生成行内段后注入的 Markdown 副本（每段后跟 `> **检视意见，请处理**：…`），或「发 AI 改」把全文 + 全部意见拼成 prompt 交给 AI 产出修订稿。

### 选区浮条与原地闭环

选中正文时浮条自动出现在选区上方，提供以下动作：

- **润色 / 缩写 / 扩写 / 校对 / 解释术语**：走 oneshot 静默调用 Claude，结果以「原文 vs 新版本」对比卡贴在选区旁，点「采纳替换」直接落回文档，不离开编辑器。润色支持在调用前先输入要求（如「更口语」「更精简」），其他动作走默认模板。
- **自定义**：把选区作为引用拼到 AI 工作台对话框，让你自由提需求。
- **加检视意见**：开浮卡输入意见后写入右栏检视面板。

浮条可在「设置 → 编辑器 → 选区浮条」关掉，右键菜单与 `Ctrl+K` 仍可触达同一组动作。

### AI 修改可撤销

任何 AI 替换执行前会自动快照编辑器内容。`Ctrl+Z` 在编辑器内拦截：若文档没有被手动改动过，直接回退 AI 改动；若你在 AI 改动后又手动改了几处，先按系统原生 undo 撤销手动改动，再撤销 AI 改动，互不冲突。栈式逐步回退，跨文件自动清空，最多保留 50 条 AI 快照。

### Claude CLI 与 Skill

AI 工作台直接驱动本机已安装的 `claude` CLI（headless 模式），技能场景接入 `~/.claude/skills/` 下的 skill。无需在 Typola 里配置 API Key，所有调用走你自己的 CLI 环境与权限。

## 产品优势

- 写作体验直接：默认进入 WYSIWYG 编辑，不需要在编辑和预览之间反复切换。
- 交付链路完整：同一份 Markdown 可以继续编辑，也可以预览 Word 版式、导出 `.docx` 或生成 HTML。
- 长文更稳：大纲、源码模式、外部文件变更提示和未保存确认减少长文编辑时的误操作风险。
- 本地工作流友好：集成终端会跟随当前文件目录，写文档、跑命令、整理项目可以在一个窗口完成。
- 跨平台发布：基于 Tauri v2，支持 Windows 和 macOS，体积更轻，启动路径更短。
- 支持安装版与免安装版：Windows 同时提供安装包和 portable zip，方便普通用户安装，也方便临时测试或 U 盘携带。

## 安装方式

### Windows 安装版

从 GitHub Release 下载：

- `Typola_*_x64-setup.exe`
- `Typola_*_x64_*.msi`

双击安装即可。安装版适合长期使用、文件关联和自动更新。

### Windows 免安装版

从 GitHub Release 下载：

- `Typola_*_windows-x64_portable.zip`

解压后运行里面的 `Typola.exe`。免安装版不会写入 `Program Files`，适合临时测试、便携使用和不想安装到系统的场景。

Windows 仍需要系统中可用的 Microsoft Edge WebView2 Runtime。现代 Windows 通常已经内置。

### macOS

从 GitHub Release 下载对应芯片架构的 `.dmg`，打开后把 `Typola.app` 拖入 Applications。

如果下载的是 portable zip，解压后运行 `Typola.app`。首次运行如遇到系统安全提示，可在系统设置的隐私与安全中允许打开。

## 基本使用

- 打开文件：点击工具栏打开按钮，或直接拖拽 Markdown/HTML/Word 文件到窗口。
- 编辑文档：默认使用所见即所得编辑；需要精确修改时切换到源码模式。
- 保存文件：使用工具栏保存按钮或快捷键保存；另存为可导出新的 Markdown/HTML 文件。
- 查看大纲：左侧浮动刻度可展开标题列表，也可以固定为侧栏。
- Word 预览：打开右侧 Word 纸张预览，检查分页、标题、段落、表格和图片效果，再导出 `.docx`。
- HTML 预览：打开 HTML 预览面板，复制富文本 HTML 或导出完整 HTML 文件。
- 使用终端：打开底部终端，默认目录会优先跟随当前文件所在目录。
- 设置偏好：在设置中调整主题、字体、默认编码、语言、自动保存、自动更新和导出预设。

常用快捷键：

- `Cmd/Ctrl + O`：打开文件
- `Cmd/Ctrl + S`：保存
- `Cmd/Ctrl + Shift + S`：另存为
- `Cmd/Ctrl + F`：查找
- `Cmd/Ctrl + H`：替换
- `Cmd/Ctrl + P`：快速打开
- `Cmd/Ctrl + Shift + I`：编辑辅助
- `Cmd/Ctrl + Alt + S`：切换源码模式
- `Cmd/Ctrl + Alt + P`：切换 Word 预览
- `Cmd/Ctrl + Alt + M`：切换 HTML 预览
- `Cmd/Ctrl + K`：对选区唤起 AI 动作菜单
- `Cmd/Ctrl + Z`：撤销（含 AI 修改撤销）
- `Shift + A`：切换心流模式
- `Cmd/Ctrl + ,`：打开设置

## 开发与构建

依赖环境：

- Node.js 和 npm
- Rust stable toolchain
- Windows/macOS 对应的 Tauri 平台依赖

安装依赖：

```bash
npm install
```

启动桌面开发模式：

```bash
npm run tauri dev
```

启动前端开发模式：

```bash
npm run dev
```

运行检查：

```bash
npm test
npm run typecheck
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## 打包

本地安装版打包：

```bash
npm run tauri:build:local
```

Windows 安装版产物：

- `src-tauri/target/release/bundle/msi/*.msi`
- `src-tauri/target/release/bundle/nsis/*-setup.exe`

本地免安装版打包：

```bash
npm run tauri:build:portable
```

Windows 免安装版产物：

- `src-tauri/target/release/bundle/portable/*_windows-x64_portable.zip`

带自动更新签名产物的发布构建：

```bash
npm run tauri:build:update
```

macOS CI 会产出 `.dmg`，并为对应 target 生成 portable zip：

- `src-tauri/target/aarch64-apple-darwin/release/bundle/portable/*_macos-arm64_portable.zip`
- `src-tauri/target/x86_64-apple-darwin/release/bundle/portable/*_macos-x64_portable.zip`

## 技术栈

- Tauri v2
- React 19
- TypeScript
- Vite 8
- Vditor
- CodeMirror 6
- xterm.js
- portable-pty

## 许可证

Typola 使用 Apache License 2.0。

---

# Typola English

Typola is a lightweight, focused, cross-platform desktop Markdown editor. It is built for everyday writing, technical documentation, long-form editing, HTML/Word delivery, and local development workflows. It offers a Typora-like WYSIWYG editing experience while keeping source mode, Word/HTML preview and export, and an integrated terminal close at hand.

## Capabilities

- WYSIWYG Markdown editing: powered by Vditor IR mode, balancing Markdown control with a clean reading-like surface.
- Source mode: powered by CodeMirror 6 for precise Markdown, HTML, and table edits.
- File open and save: supports `.md`, `.markdown`, `.html`, `.htm`, and read-only `.docx` preview.
- Multi-file tabs: opening multiple documents from the file tree, recents, OS file association, or drag-and-drop creates lightweight tabs; dirty tabs show a leading `*`, and the tab bar hides automatically when only one file is open.
- Left workspace file tree: open a directory, lazily expand subfolders, and open supported documents straight from the tree; dirty files are marked with `*`.
- Word paper preview: open an A4-style preview panel on demand, inspect multi-page output, and export `.docx`.
- HTML preview and export: preview article-style HTML, export full HTML, and copy rich HTML for external editors.
- Editor-to-preview scroll sync: editor scroll position drives Word / HTML preview by ratio (one-way, rAF-throttled, no extra re-render).
- Floating outline: extract headings automatically, expand the outline on hover, pin it as a sidebar, and jump to sections.
- Find/replace and quick open: `Cmd/Ctrl+F` and `Cmd/Ctrl+H` share one panel with case / whole-word / regex options; `Cmd/Ctrl+P` filters recents by filename or path fragment.
- Editing utilities: insert links / images / Markdown tables in one click; pasted clipboard images are saved to a sibling `assets/` folder and inserted as a relative path.
- Document statistics: the status bar reports word count, characters, paragraphs, and estimated reading time on debounced updates so typing stays fluid.
- Integrated terminal: multi-tab bottom terminal with copy, paste, clear, link opening, custom shell, and file-directory startup.
- Local image resolution: relative Markdown images render correctly in the editor, previews, and export flows.
- Data safety: closing a tab or window with unsaved changes prompts a single "Save / Discard / Cancel" dialog; external file changes surface in the status bar.
- Preferences: configure theme, fonts, encoding, language, auto-save, update checks, and Word/HTML export presets.
- Native desktop behavior: file associations, drag-and-drop open, single-instance forwarding, external file change notices, and auto-update support.

## Document modes and AI co-authoring

Typola wraps the same document in three modes — Reading / Flow / Review — switched via a recessed segmented control in the top-right toolbar; left and right panels glide in and out automatically.

- **Reading mode**: the default. Focused reading and writing; toggle the file tree on the left and Word / WeChat preview on the right as needed.
- **Flow mode**: the left panel opens an AI Workbench chat; the right panel surfaces skill scenarios (daily/weekly report, summary, slide deck, HTML, WeChat article, data analysis); the window auto-maximizes. AI artifacts (HTML / Markdown / decks) land in `<workspace>/.typola-output/<conversation>/` and appear as chips in the right panel — one-click open in the main editor, archive to the workspace, or delete.
- **Review mode**: treats the document as a draft for review. The right panel shows a Review pane. Select a paragraph, add a comment via the floating bar, jump to it from the summary list, "Export review version" to write an in-paragraph-suffix Markdown copy (each commented segment followed by `> **Review comment, please address**: …`), or "Send to AI" to package the full document plus all comments into a prompt and let AI emit a revised draft.

### Selection floating bar and in-place loop

When you select text, a floating bar appears above the selection with these actions:

- **Polish / Shorten / Expand / Proofread / Explain**: a oneshot Claude call returns a diff card pinned next to the selection ("original vs new"); click "Accept replacement" to apply without leaving the editor. Polish also accepts pre-call instructions (e.g. "more casual", "tighter"); other actions use the default template.
- **Custom**: drops the selection as a quote into the AI Workbench composer for free-form requests.
- **Add review comment**: opens an inline editor and saves the comment into the Review pane.

The floating bar can be disabled at Settings → Editor → Selection floating bar. The right-click menu and `Ctrl+K` still reach the same actions.

### AI edits are undoable

Each AI replacement snapshots the editor content first. `Ctrl+Z` inside the editor is intercepted: if the document hasn't been hand-edited since, the AI change is reverted directly; if you've also hand-edited, native undo cleans up your hand edits first, then your next `Ctrl+Z` pops the AI snapshot — they never collide. Stepwise rollback, cleared automatically on file switch, capped at 50 AI snapshots.

### Claude CLI and skills

The AI Workbench drives your locally installed `claude` CLI (headless mode), and skill scenarios reference skills under `~/.claude/skills/`. No API key configuration inside Typola — every call inherits your own CLI environment and permissions.

## Strengths

- Direct writing flow: Typola opens into WYSIWYG editing by default, so writing does not require constant preview switching.
- Complete delivery path: one Markdown document can stay editable, preview as Word pages, export to `.docx`, or become HTML.
- Safer long-form editing: outline navigation, source mode, external file change notices, and unsaved-change prompts reduce accidental loss.
- Local-workflow friendly: the integrated terminal starts in the current file directory when possible.
- Cross-platform packaging: Tauri v2 keeps the app lightweight and supports Windows and macOS.
- Installer and portable builds: Windows provides both setup packages and portable zip packages.

## Installation

### Windows Installer

Download from GitHub Releases:

- `Typola_*_x64-setup.exe`
- `Typola_*_x64_*.msi`

Run the installer. This is the best option for regular use, file associations, and auto-updates.

### Windows Portable

Download from GitHub Releases:

- `Typola_*_windows-x64_portable.zip`

Extract the archive and run `Typola.exe`. The portable package does not install into `Program Files`, which makes it useful for temporary testing or portable use.

Windows still needs the Microsoft Edge WebView2 Runtime. Most modern Windows installations already include it.

### macOS

Download the `.dmg` for your chip architecture, open it, and drag `Typola.app` into Applications.

If you download a portable zip, extract it and run `Typola.app`. If macOS shows a security prompt on first launch, allow it from Privacy & Security settings.

## Basic Usage

- Open files with the toolbar button or by dragging Markdown, HTML, or Word files into the window.
- Edit in WYSIWYG mode by default, and switch to source mode for precise changes.
- Save with the toolbar or shortcut; use Save As to create a new Markdown or HTML file.
- Use the floating outline to inspect headings or pin it as a sidebar.
- Open Word preview to inspect page layout before exporting `.docx`.
- Open HTML preview to copy rich HTML or export a full HTML file.
- Open the bottom terminal to run commands from the current file directory.
- Configure theme, fonts, default encoding, language, auto-save, update checks, and export presets in Settings.

Common shortcuts:

- `Cmd/Ctrl + O`: Open file
- `Cmd/Ctrl + S`: Save
- `Cmd/Ctrl + Shift + S`: Save as
- `Cmd/Ctrl + F`: Find
- `Cmd/Ctrl + H`: Replace
- `Cmd/Ctrl + P`: Quick open
- `Cmd/Ctrl + Shift + I`: Editing utilities
- `Cmd/Ctrl + Alt + S`: Toggle source mode
- `Cmd/Ctrl + Alt + P`: Toggle Word preview
- `Cmd/Ctrl + Alt + M`: Toggle HTML preview
- `Cmd/Ctrl + K`: Open the AI action menu for the current selection
- `Cmd/Ctrl + Z`: Undo (covers AI replacements too)
- `Shift + A`: Toggle Flow mode
- `Cmd/Ctrl + ,`: Open Settings

## Development

Prerequisites:

- Node.js and npm
- Rust stable toolchain
- Tauri platform prerequisites for Windows/macOS

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run tauri dev
```

Run frontend-only development:

```bash
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Packaging

Build local installer packages:

```bash
npm run tauri:build:local
```

Windows installer outputs:

- `src-tauri/target/release/bundle/msi/*.msi`
- `src-tauri/target/release/bundle/nsis/*-setup.exe`

Build a local portable package:

```bash
npm run tauri:build:portable
```

Windows portable output:

- `src-tauri/target/release/bundle/portable/*_windows-x64_portable.zip`

Build release artifacts with updater signatures:

```bash
npm run tauri:build:update
```

macOS CI produces `.dmg` files and portable zip packages for each target:

- `src-tauri/target/aarch64-apple-darwin/release/bundle/portable/*_macos-arm64_portable.zip`
- `src-tauri/target/x86_64-apple-darwin/release/bundle/portable/*_macos-x64_portable.zip`

## Stack

- Tauri v2
- React 19
- TypeScript
- Vite 8
- Vditor
- CodeMirror 6
- xterm.js
- portable-pty

## License

Typola is licensed under the Apache License 2.0.
