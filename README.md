# Typola

> 中文 · [English](./README.en.md)

Typola 是一个轻量、专注、跨平台的 Markdown 桌面编辑器。它面向日常写作、技术文档、长文整理、HTML/Word 交付和本地开发工作流，提供接近 Typora 的所见即所得编辑体验，同时保留源码模式、Word/HTML 预览导出和集成终端。

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
