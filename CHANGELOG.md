# Changelog

## [2.0.5] - 2026-07-13

- CM6 表格交互切换为 `codemirror-markdown-tables`：支持连续单元格选择、行列操作菜单、对齐、移动、复制/剪切/粘贴、Tab/Enter 导航与原生撤销；保留 Typola 中文右键菜单并补齐行列插入方向和三种对齐方式。
- 清理旧 Atomic 表格样式，并补充右键点击指定列后的真实对齐回归测试。
- 补齐 `codemirror-markdown-tables` 的运行时依赖 `@mobily/ts-belt`，确保 pnpm 严格安装后的测试与构建可解析。

## Unreleased

- 修复 GitHub 更新清单首次连接较慢时的误报：检查超时从 12 秒提高到 30 秒；关于页移除空检查占位文案，发现新版本时可直接选择更新并重启或忽略；设置页所有开关显示明确的开/关状态；同步更新关于页的 Typola 产品定位文案。
- Issue #199：新增右上角应用更新卡片；自动检查只提示，安装版点击一次后下载、安装并重启，期间保护未保存文档，Portable 则打开 GitHub Releases。根目录 `VERSION` 成为唯一人工版本源，推送 Tag 后 CI 自动同步派生版本；正式发布要求提交相对父提交修改 `VERSION`，并校验稳定版本、生成 Tauri updater 签名和 `latest.json`，在 Draft 资源完整后公开。
- 全量动效优化：统一使用 MotionProvider 的时长/easing token，补齐侧栏、列表、模态框、冲突提示、文件树、大纲与终端的可中断进入/退出过渡；所有新增动效尊重 Reduced Motion，终端拖拽期间保持即时响应且不增加 bundle 预算。
- 修复动效审查发现的交互细节：左侧栏拖拽时宽度即时跟手，终端展开动画完成后重新 fit xterm，避免恢复隐藏状态下的列宽与行高。
- 动效性能优化：移除右侧面板重复的宽度过渡，左右侧栏与终端拖拽按动画帧合并更新，修复左栏最小宽度阻塞展开首帧，并合并右栏 tab 指示器的重复测量与渲染。
- 检视意见编辑框新增依据展示，人工意见明确显示暂无依据；AI 检视配置与意见列表增加清晰分区，全局界面文案字号默认放大一级并跟随设置中的字号调整。
- 优化 PDF / Word 导出：新增分阶段进度条，PDF 缓存浏览器定位并缩短安全输出等待；Word 改用内置 `docx` 生成器，不再依赖 Pandoc。同步精修 Word 纸张预览与 HTML 产物预览的排版、加载态、错误态和键盘焦点。
- 同步 README、贡献指南、PDF 导出规格及图片/Mermaid/AI Workbench 设计文档的实现状态，明确当前浏览器打印 PDF 与内置 Word 生成链路，并标注历史方案快照。
- 新增面向小白用户的《用户指导手册》，覆盖写作、AI 工作台、SkillHub、产物中心、检视改稿、图片、主题及 PDF/Word/HTML 交付，并从 README 提供直达入口。
- 检视模式改为正文与检视工作台 1:1 分屏；人工和 AI 意见均可编辑或忽略，AI 改稿默认使用全部未忽略意见；改稿历史支持打开版本、返回前一篇及差异对比。
- AI 检视面板默认展开；支持通过紧凑下拉同时导入多个 Markdown 规则文件、选择多个写作规范 Skill 和输入手工规则，并在运行中显示动态进度或随时停止。
- 检视意见列表按“原文 / 意见”分区并收敛为摘要；点击卡片打开更大的意见编辑器，可保存、取消及连续查看上一条/下一条，定位原文与忽略保持为独立操作。检视模式顶部导航、内容滚动区和底部改稿操作同步分层固定。
- 改稿差异对比统一换行符，只将真实增删改列为待确认项；折叠远处未变化内容，并在句内突出具体增删文字。
- 全应用普通文字在浅色模式统一为纯黑、深色模式统一为纯白，提升编辑区、工作台和弹窗的可读性。
- 修复高对比度文字规则导致工具栏 Tooltip 黑底黑字的问题；行号改为逐源码行显示，行号区域右键复用正文菜单并提供“隐藏行号”；进入检视模式时默认收起左侧文件树。
- AI 检视结果直接写入当前文档的意见列表，不再生成中间产物；仅“导出检视版”会创建检视文件。
- 导出检视版时，Typola 回读元数据统一放在文件末尾，不再打断正文或检视意见汇总。
- 检视版回读元数据改用紧凑编码，缩短外部编辑器未隐藏注释时显示的内容。
- 修复非默认目录中的工作区产物无法读写：当前 `.typola-output` 会在读写前动态加入文件权限范围。
- Issue #241：修复候选稿“应用后切换”时标签内容可能未同步的问题；恢复重复原文人工意见的精确跳转，并增强候选稿持久化配额保护与阻断提示。
- Issue #241：检视模式新增统一人工/AI 意见列表与可恢复忽略状态；AI 可按 `style.md`、Skill 或自然语言要求检视，也可针对选区、当前章节或全文生成候选稿。改稿沿用当前 AI Session，在左右 Diff 中逐处接受、拒绝或手动编辑，关闭并重开应用后可恢复当前对话和候选稿，应用前自动保存历史版本；切换文档、外部改动、另存和恢复均经过候选稿保护流程。正文右键可显示 Markdown 源行号，检视版导出不覆盖原文并可由 Typola 回读。
- 素笺主题的默认正文文字改为更深的暖黑色，提升长文写作时的阅读对比度。
- 重构中英文 README：发布页优先说明适用场景、核心能力、安装与快速开始；实现细节收敛到架构文档。

- CM6 表格右键删除行/列现在可从任意单元格直接触发，操作仍转发给 `codemirror-markdown-tables` 的上游手柄；表格后的退格改为 Obsidian 式“两步删除”。正文右键菜单按“格式 / 段落 / 插入”收纳为二级菜单，并移除右键 AI 入口；加粗、斜体、行内代码、链接、引用与三类列表作为常用按钮直接展示。
- CM6 表格右键行为对齐 Obsidian：表格内只显示中文表格操作，统一提供行列插入、移动、复制、清空、删除、排序、对齐及整表删除；行列事务继续复用 `codemirror-markdown-tables`，整表删除由 CM6 GFM 语法树定位源码范围并进入原生撤销历史。

- 修复 CM6 表格内右键点击单个空格时误落到通用编辑器菜单的问题；文本节点现在统一归一到表格单元格，空白处与单元格其他区域复用同一套上游表格菜单、样式和操作能力。
- 工具栏中央不再显示当前文件名，保留窗口拖拽区与编辑器标签页文件名。
- CM6 表格操作收敛为上游 `codemirror-markdown-tables`：表格右键转交上游行/列菜单，中文界面由轻量适配层翻译；移除 Typola 自研表格行列事务、表格快捷键拦截和重复 Markdown 解析，工具栏与非表格区域右键插入继续调用上游 `insertEmptyMarkdownTable()`。
- Issue #224：自托管 Source Han Serif SC 可变字体子集（OFL 1.1），全局普通文本与文件树/AI 工作台统一使用思源宋体；编辑器字体设置新增思源宋体并设为默认，保留等宽字体切换；新增主题对比度审计与 CM6「编辑器纸纹」持久化开关，纸纹仅用于素笺、墨韵、粗野主题，深海与抽象主题不启用；补充 3 张代表性视觉基线。
- Issue #223：CM6 性能路径优化：预览滚动同步缓存 heading 并独立节流；编辑器视图改用 ref；live-preview 扩展按 Compartment 局部 reconfigure；数学、heading 折叠、Markdown 分析缓存与本地图片观察路径减少重复全篇扫描。
- CM6 格式快捷键补齐标题、行内代码、清除格式与引用层级；多行引用升级/降级现在作为单笔撤销记录。链接与代码语言编辑改为可键盘操作的 React 浮层，删除 CM6 路径中的浏览器 prompt。
- 修复多个 CM6 编辑器实例共享预览同步帧和 Mermaid SVG 编号的问题；搜索替换在写入前验证当前文档，拒绝陈旧坐标。
- Markdown 分析与统一导出识别并剥离文首 YAML frontmatter，避免将其误作正文内容或导出产物。
- 修复 CM6 写作预览中新插入的本地 Markdown 图片未转换为 Tauri asset URL、因而无法显示的问题；右键插入/替换现与工具栏、拖拽、粘贴统一遵循图像设置，外部目录和绝对路径图片可获 asset scope 后显示。
- 修复自定义配色首次打开时调色盘被遮罩隐藏；未选颜色时改为使用素笺主题，调整后的颜色在关闭应用后仍会保留，并在应用启动时重新应用。
- CM6 新增 frontmatter 折叠、脚注跳转、raw HTML 安全预览、格式刷和图片 Alt/Title/宽度编辑；图片目录模板支持 `{filename}`、`{year}`、`{month}`。
- HTML 导出会复制本地图片至导出文件同级资源目录并重写引用；远程与 data URL 保持原样，缺失文件不阻断导出。
- CM6 右键格式菜单新增下划线、上标、下标与 `==高亮==`；导出将高亮语法渲染为安全的 `<mark>`。
- 修复 PR #222 审查发现的本地图片路径越界、图片元数据转义、heading 路径和浮层关闭问题，并补充 HTML/脚注/frontmatter 安全回归测试。

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- 完成 #183 / #184：CM6 数学与 Mermaid 块预览改为带 source-hash / theme 缓存的原生 widget，光标进入块即回到 Markdown 源码；渲染仅在块被 CM6 物化到可视区域时发生，异步错误以卡片展示且不改写 source。HTML、PDF、Word 纸张预览与微信预览的 Markdown→HTML 基座改为 remark/rehype，支持 GFM、代码高亮、KaTeX、Mermaid、本地图片解析与 HTML sanitize，不再依赖 Vditor preview renderer；Word `.docx` 由内置 `docx` 生成器直接打包，不依赖外部转换器。
- PDF 导出改为与 Word 一致的保存对话框：默认 Downloads 路径和 `.pdf` 文件名，用户可选择目标文件夹或取消导出。
- 写作模块主入口固定为 CM6：移除 `typola.editorEngine` 的 Vditor 编辑器切换分支，写作 / 源码模式统一经 `Cm6MarkdownEditorPane` 和 `TypolaEditorKernel`；Vditor 仅保留既有兼容预览链路，统一导出走 remark/rehype。
- 查找替换改为通过 `TypolaEditorKernel.replaceRanges` 提交 CM6 transaction；单个和全部替换都会进入同一 history，支持一次 `Ctrl/Cmd+Z` 撤销。
- 工具栏、`Ctrl/Cmd+B` / `I` / `Shift+7` / `Shift+8` 快捷键和右键菜单统一调用 CM6 格式命令；补齐引用层级、编辑链接、清除格式与代码块语言编辑的 transaction 实现。
- 源码模式保留 CM6 标题折叠、缩放和预览同步核心扩展；仅关闭 Markdown live preview widget，搜索命中折叠内容会自动展开。
- 修复 CM6 写作模式的检视标记与大纲联动：检视意见以 CM6 decoration 标注对应源码行，atomic-editor 标题行可正确驱动悬浮大纲的跳转与当前项。
- 修复 CM6 格式快捷键与批量替换边界：`Ctrl/Cmd+B`、`Ctrl/Cmd+I` 在已有标记内改为取消格式；重叠替换范围会被拒绝，避免生成不可预期的文稿内容。

### Added

- 新增与静态主题完全隔离的 Define 动态配色系统（Issue #192）：工具栏画笔入口打开 1:1 Theme Color Editor，支持固定半径 Hue Wheel、Solid / Gradient、垂直 Saturation、50 个 Preset、9 种 Pattern、Pattern Opacity 与 Surprise me；`--dc-*` Token 从 OKLCH 基色实时推导，拖动仅在 rAF 中预览、释放后持久化，重载恢复且不改变 Markdown 内容或 Word / HTML / PDF 导出外观。
- 外观设置新增“自定义模式 / 主题模式”切换，默认进入纯白自定义模式；选择圆环颜色后，工具栏、面板、控件、编辑器辅助界面与 Windows 原生标题栏统一跟随动态配色。
- 选区菜单窄化对齐 Typora/Obsidian(`width: max-content; max-width: 240px`,kbd 间距收紧 16→10px);右键菜单新增 5 个基础编辑能力:升级引用 / 降级引用 / 编辑链接 / 清除格式 / 编辑代码块语言,均走 `applyVditorFormat` 现有分发,Vditor IR 模式直接操作选中/选区 + `updateValue` 重渲染;新增 i18n keys `contextMenuQuoteUp / contextMenuQuoteDown / contextMenuLinkEdit / contextMenuClearFormat / contextMenuCodeblockLang` 中英日三译。
- 选区浮条右端加 `⋯` 子按钮 + hover tooltip,mini menu 暴露两项:「本页不再展示」(filePath 维度 session suppress,直到切文档)与「全局隐藏」(直接写 `selectionFloatingBarEnabled=false`,与设置页 toggle 同步);新增 keys `floatingBarHideThisPage / floatingBarHideGlobal / floatingBarTooltip` 中英日三译;tooltip 用现有 Tooltip 组件浮显。
- 工具栏新增「打开文件夹」按钮(Cmd+Shift+O),选夹后走新增 Tauri cmd `read_first_level_openable` 仅列一层 md/html/docx(不递归,跳过隐藏文件与节点_modules/dist/target/.git),批量入 tab(last active),单文件打开失败不阻塞其他(#170);新增 keys `toolbarOpenFolderTitle / toolbarOpenFolderLabel` 中英日三译;fileService 加 `openFolder` 函数,useFileTabs 加 `handleOpenFolder` 回调。
- 写作模块图片资源管理基础能力(issue #185 P0):`markdownAnalysisService` 新增 `MarkdownImage` 类型、`scanImages` 解析与 `findMarkdownImageAt` 命中接口;CM6 编辑器右键图片新增「替换图片 / 打开文件 / 复制路径」三项,菜单任意位置新增「插入图片」,四项均走单笔 CM6 transaction,替换与插入复用 `formatImageSrc` 处理相对路径,打开文件走 Tauri `open_path_external` 命令绕开 opener scope 限制,复制路径走 `clipboardService.writeText`;远端 URL 仅作预览不下载。Vditor 模式与 alt 编辑 / 宽度 / 资源目录策略 / ExportAssetResolver 暂不做,留待 P1。

### Fixed

- 修复 CM6 任务复选框切换会移除 Markdown 列表标记的问题；新增任务过滤 API；AI 与检视 anchor 现在共享受限的结构化上下文和恢复规则。
- 修复 AI 会话停止竞态：启动尚未返回 runId 时停止会立即恢复输入；取消后重发不会再被旧进程退出事件中断。
- 修复源码编辑器选区浮条在缺少隐藏回调时仍展示无效「本文档不再展示／全局隐藏」按钮的问题。
- 修复 IR 表格编辑在文档包含同内容表格时可能误改第一张表的问题：定位不唯一时拒绝操作；删除整表同步采用同一保护。新粗野主义 (Neo-brutalism) × 复古网格纸 —— 纸张底色 `#f3f0ec`、鼠尾草绿 `#4ECDC4` 为主色、珊瑚粉 `#E64A2E` 为危险、芥末黄 `#D9C688` 为选中/警告、灰蓝 `#8E9CB0` 为次要；强制 0 圆角、1px 纯黑高对比度边框、交互元素硬阴影 `5px 5px 0 0 #000`、hover/active 时 translate 位移产生压感反馈，整页 30px 坐标网格背景；字体优先用 Noto Serif SC（标题）/ JetBrains Mono（代码）/ Outfit（正文），无外网时回退到系统衬线 / 无衬线栈。设置 → 外观 → 主题卡片可直接切换。
- 新增第四套主题「抽象」(id: `abstract`)：采用蒙德里安 De Stijl 经典配色 —— 白底 (`#ffffff`) + 黑色网格 (`#1a1a1a`) + 蒙德里安红 (`#c8311b`) / 蓝 (`#1e5a8a`) / 黄 (`#e8b810`) 三原色强调。accent 用红、aiInserted 用蓝、aiDeleted 用红、warning 用黄；终端 ANSI 也按红 / 蓝 / 黄 / 黑 / 白体系对齐，不再出现绿色映射。设置 → 外观 → 主题卡片可直接切换。
- 新增主题系统（issue #70）：设置页提供“素笺 / 深海 / 墨韵”三套完整主题，默认素笺；主题通过 `data-theme-id` 静态 CSS 变量块驱动，并覆盖编辑器、AI 浮层、检视标注与终端配色。
- 修复 PR #146 主题系统检视意见：补齐旧 `theme: "dark"` 到 `night-current` 的迁移、`npm run build:themes` 生成主题 CSS、主题卡片键盘导航、Vditor / Mermaid / xterm 主题同步，以及 PDF 导出不跟随应用主题的残留清理。
- 新增 Calm Workspace 动效基础设施：引入 `motion`、`@floating-ui/react` 与 `@formkit/auto-animate`，并提供统一的 MotionProvider / motion token，供后续面板、tooltip 与列表动效复用。
- AI 工作台补齐 #112 Phase 3：Codex CLI 进入 AI 执行设置的检测卡片与 runtime registry，但保持检测-only，不进入 Composer 可发送 Provider；新增裁剪版 `mocks/` 目录用于后续 parser/golden 回归。
- AI 工作台补齐 #112 Phase 2 输出链路：OpenCode 写文件工具现在会进入 `artifact_file` 产物回流，CLI 相对路径会归一到当前会话 `.typola-output/<conversationId>/`，非白名单扩展名（如 `.yaml`/源码文件）也能进入产物 toast/manifest 链路。
- AI 工作台补齐 #112 Phase 1：Composer 左下角切换器改为 OpenDesign 风格 CLI 图标 pill，新增对话内 QuestionForm 交互卡片，并支持 `/clear`、`/mcp`、`/help` 三个本地 slash 命令。
- 新增 CM6 编辑器内核 Phase 1/2/3 骨架：增加 `Cm6MarkdownEditorPane`、统一 Markdown extension 构建入口，并将运行时编辑命令收敛到 `EditorCoreHandle`；支持基础 live preview，包括任务列表、表格、图片、KaTeX 数学公式和 Mermaid 图表。
- 新增 v0.5 AI 产物中心：AI 生成物会标准化为本地 artifact manifest，右栏可按当前会话或全部 `.typola-output` 产物浏览，并支持打开、对比、归档、删除、覆盖原文与撤销覆盖。
- 新增 AI Workbench OpenCode Provider 规划文档：沉淀 AI Provider 术语、ADR、PRD 与 GitHub issue 拆分，用于跟踪在同一左侧 AI 工作台中接入 OpenCode CLI。
- AI 工作台新增 OpenCode Provider 主链路：Composer 底部可切换 Claude Code / OpenCode，设置页可配置 OpenCode CLI 路径与模型，OpenCode 使用 `opencode run` 接入同一 headless 会话与产物回流流程。
- 新增正式的 Windows 免安装版打包命令：`npm run tauri:build:portable`。Windows 现在会在 `src-tauri/target/release/bundle/portable/` 生成 `*_windows-x64_portable.zip`。
- 新增左侧目录文件树：支持打开一个目录、展开/折叠子目录、从文件树打开支持的文档，未保存文件会在文件树名称前显示 `*`。
- 设置页新增 `AI CLI` 分区：可配置 Claude CLI 路径并检测 `claude --version`，供后续 AI 集成功能使用。
- 新增 Skill OS M1 左侧 AI 工作台：工具栏可展开 Claude 对话面板，文件树自动收起，支持直连 Claude CLI、多轮 resume、思考流/正文/工具卡/完成状态渲染，以及错误诊断与重试入口。
- AI CLI 设置新增 Claude 模型占位配置；默认留空时继续使用 Claude CLI 自身默认模型。
- AI 工作台新增工作区选择条、Composer `+` 菜单、附件上下文 chips、`.mcp.json` 编辑入口和 Plugin directory 配置；发送时会把当前文档与附件路径追加到 Claude prompt，Rust 启动参数会按配置追加 `--plugin-dir`。
- AI 工作台工作区/会话模型调整为全局单会话：切换编辑器文件不再重置对话；AI 工作区独立持久化，不再跟随左侧文件树工作区变化；工作区选择移到 Composer 底部并支持最近目录。
- AI 工作台新增 M2 产物回流：Claude 写入的生成类产物会暂存到工作区 `.typola-output/`，右下角以文件 chips 展示，点击直接在中间编辑器打开，并可一键保存到工作区。
- 编辑器与右侧预览同步滚动：编辑器滚动时右侧 Word / 公众号预览按 scroll ratio 单向同步（rAF 节流，零额外重渲染）。
- 未保存改动统一三按钮对话框：tab 关闭与窗口关闭命中未保存文档时弹出「保存 / 不保存 / 取消」一次性确认（自定义 React 模态，Tauri WebView 下可靠）。
- 新增 Mermaid 图表渲染：阅读、心流、检视、HTML 预览和 Word 预览会把 ` ```mermaid ` 代码块渲染为 SVG 图，语法错误保留源码并显示错误条，WYSIWYG 中右键图表可复制 SVG。
- 新增 PDF 导出：工具栏「导出 PDF」与 `Ctrl+P` 会按阅读模式渲染当前文档，生成 A4 / 2cm 页边距的 PDF 文件。
- 新增 CM6 编辑器内核 Phase 4 导出桥接：HTML 预览、Word 纸张预览与 PDF 导出统一通过 `markdownToExportHtml` 从 Markdown source 渲染导出 HTML，减少对编辑器 DOM 的依赖；PDF 导出改为后台写入默认导出路径并通过 toast 汇报结果。

### Fixed

- 修复 Windows MSI 安装到受限目录时可能报 "verify that you have access to that directory" 的问题：MSI 改用自定义 WiX 模板，保留安装目录选择页面，并显式声明 elevated per-machine 安装权限；NSIS 明确保持 current-user 安装模式。
- 修复缺少 Microsoft Edge WebView2 Runtime 时可能还没显示引导就启动失败的问题：Windows 启动预检前移到 `main()`，早于 Tauri WebView 初始化；缺失时先运行随包 bootstrapper，失败后提示用户安装并打开官方页面。
- 修复 Vditor WYSIWYG 代码块拖选多行时选区容易被异步渲染/折叠重排打断的问题；代码块正文显式允许文本选择，拖选期间暂停 mermaid/katex/折叠等会改 DOM 的 idle 重排。
- 补充文件内搜索/替换多行匹配回归测试，确认代码块内外的多行内容可查找、单次替换和全部替换。
- 修复本地 HTML 与产物打开体验：启动时会展开上次工作区文件树；HTML 文件默认进入预览而不是源码；右侧 HTML 预览会压缩常见宽内容并用浏览器打开 file URL；产物中心图片默认调用系统图片工具打开。
- 调整 HTML 与文件操作体验：HTML 预览回到中间主栏并可与源码模式来回切换；HTML 翻页桥接会同时派发到 window/document/body；产物中心和文件树右键菜单新增“打开所在文件夹”等有效操作。
- 修复 Windows 上点击「浏览器/系统默认应用打开」报「Not allowed to open path \\?\D」的问题：根因是 `tauri-plugin-opener` 的 `opener:scope` 用 `std::fs::canonicalize` 把绝对路径变成 Windows device path，跟 capabilities 里 `$HOME`/`$DESKTOP` 等 glob 永远匹配不上。新增自定义 Rust 命令 `open_path_external` 走 `tauri_plugin_opener::open_path` crate 级 helper(直接用 ShellExecuteW,不经 scope 校验),前后端都接入新命令。
- HTML 演示模式源码/预览切换按钮的 active 状态改为 `theme-paper` 文字色,在亮、暗主题下与 `--theme-accent` 背景都满足对比度,不再有橙色背景配糊字。
- 修复浮动大纲误把 fenced code block 内的 `#` 行识别为标题、导致点击大纲跳转偏移的问题；工具栏 hover 提示改为顶层浮层显示，并按当前界面语言展示不含快捷键的文案。
- 修复选中文字后的 AI 浮条被主题按钮样式撑满整屏的问题；浮条现在按内容宽度贴近选区上方显示，并提升 CM6 / Vditor / 原生选区高亮对比度，方便辨认已选文本。
- 素笺主题：把 `selection` 由 `#ead8ca`（带粉感的桃色）改为 `#e3dccf`，更接近 Claude 设计语言的低饱和暖灰选中态。
- 深海主题：danger 与 ai-deleted 由玫瑰粉 `#d08a82` 改为暖灰偏珊瑚的 `#bd8a78`，与冷调蓝调色板不再冲突。
- 墨韵主题：所有 canvas / surface / border / selection / preview.canvas 中带轻微暖色偏移的 hex 全部拉回纯灰（`R = G = B`），杜绝任何第四种颜色。
- 素笺主题二次收束：把 `danger`/`ai-deleted` 从 `#a6533f` 抬到 `#bd6240`（OKLCH hue 22°→33°，从红-橙过渡区推向橙色），`ai-primary`/`review-mark` 由 `#8a6757` 降饱和到 `#867060`，`selection` 由 `#e3dccf` 进一步降到 `#dad6c9`，warning `#9a6c36` → `#a86d36` 更接近琥珀，去掉残留的粉/桃视觉。
- 深海主题二次收束：把 `danger`/`ai-deleted` 从 `#bd8a78` 压到 `#b17a5a`（明显橙-棕，pink 接近 0），warning `#c8a46f` → `#c8985e` 推向 amber，整体 warm 色 token 与素笺 sienna 体系对齐，避免在冷蓝调色板中突兀。
- 清扫 app.css 里散落的硬编码 `oklch(...h=25-30)` 粉色入口：`.skill-hub-error`、`.selection-result-card-error`、`.diff-hunk-delete`、`.review-sidebar-item-tool-danger:hover` 统一跟随 `--theme-danger` token；`.file-tree-icon-doc svg` 由 `h=30` salmon 改为 `h=110` 黄绿，避免残留粉色在场景错误条、选区 AI 错误卡、diff 删除行或文件树 doc 图标上出现。
- 修复素笺 / 深海下顶部工具栏 active 状态、模式切换器外壳、右栏壳、文件 tab 滑块、编辑器当前行和 SkillHub 场景模板卡片 / badge 仍透出粉色或多色分类块的问题：普通主题改为中性纸面 / 边框层级，抽象主题单独用红、蓝、黄、黑、白表达场景强调。

### Changed

- 重新收束三套主题配色：默认主题恢复经典 light 的暖白/暖橙层级，深海降低彩色噪声，墨韵改为纯黑白灰体系；状态标签色也改为跟随主题 token，减少同页框体色彩过多的问题。
- 更新主 README 中文文案：明确当前发布面向 Windows，移除非 Windows 安装 / 打包描述，并同步 CM6 live preview、AI 工作台、SkillHub、主题、选区浮条与导出交付的最新能力。
- 明确 Windows 分发边界：对外发布物是安装包和 portable zip，包内 `Typola.exe` 不作为单独裸 exe 分发产物。
- Windows 安装版同时产出 NSIS `setup.exe` 与 `.msi`：WebView2 bootstrapper 会作为资源打进单个安装文件；NSIS 在安装后执行检测，MSI 由应用启动前预检执行检测，不需要用户额外下载第二个安装文件。
- Windows portable 首选入口改为直接运行 `Typola.exe`：应用会在创建窗口前执行 WebView2 预检，缺失时运行随包 bootstrapper；无网或安装失败时会显性提示用户先安装 WebView2，不再静默退出。
- Windows exe 启动前新增 WebView2 Runtime 预检：缺失时会尝试运行同目录 / resources 中随包携带的 WebView2 bootstrapper，仍失败时弹出明确提示并打开官方安装页；release 包默认启用文件日志，便于定位现场崩溃。
- Windows 免安装包新增 `Start-Typola.cmd` 启动检查脚本并随包携带 WebView2 bootstrapper：启动前检测 WebView2 Runtime，缺失时先尝试静默安装，再给出官方安装入口，避免直接双击 exe 无提示闪退。
- 重写中英文 README：按当前主干能力重新梳理产品定位、AI 工作台、SkillHub、产物中心、CM6 编辑器、导出交付、安装使用、开发打包与文档入口。
- 左右侧栏与预览面板展开/收起改为低噪声滑入/淡出动效，文件 tab 加宽并优化文字垂直居中与可读长度。
- 导航连续性优化：文件树展开增加 chevron 旋转和轻量淡入，文件 tab / 左右栏 tab 增加滑动指示器，搜索跳转命中行会短暂高亮。
- 基础动效反馈优化：按钮按下增加轻量缩放，状态栏保存状态区分未保存 / 保存中 / 已保存 / 保存失败，并让字数统计变化更平滑。
- 心流模式下 OpenCode 选中场景 skill/command 后，若当前文档或附件参考文件存在，Composer 发送时会像 Claude Code 一样在 prompt 中追加“参考以下文件”路径列表，同时继续通过 `--file` 传递真实文件上下文。
- Markdown 默认编辑器切换为 CM6 live preview 内核；Vditor WYSIWYG 暂作为过渡回退保留，可通过本地 `typola.editorEngine=vditor` 切回。
- AI CLI 检测升级为轻量结构化诊断：设置页现在会展示实际识别到的 CLI 路径、版本、检测时间与多条可读诊断，Windows 下继续优先识别 npm 全局 `.cmd`，但不运行模型请求或污染正式 AI 会话。
- 设置页 `AI CLI` 升级为简化版 `AI 执行`：Claude/OpenCode 以运行时卡片展示，可设为默认 Provider、配置 CLI 路径并重新检测；AI 工作台仅在 Composer 底部展示当前 Provider / 模型状态。
- AI 工作台工具调用卡片切换为 OpenDesign 风格的紧凑状态卡，按 Todo / 文件 / 命令 / 搜索等工具类型分派展示，并保留原始 JSON 展开入口。
- Skill 模板卡片统一已安装 / 未安装布局高度，GitHub 来源图标改为调用系统默认浏览器打开源码地址。
- AI 改稿 prompt 不再拼入当前文稿全文，只传指定文稿路径与检视意见，并明确限制 AI 只处理该文件；Skill 模板安装状态统一靠卡片最右显示。
- PDF / Word 导出改为后台自动保存：已保存文档默认导出到源文件同目录，未保存文档导出到系统下载目录；不再弹出保存对话框，完成或失败通过右上角 toast 提示。
- PDF 导出缩短图片等待并采用 fail-open 渲染策略，远程图片加载慢时不再长时间阻塞整次导出。
- AI 工作台的 Provider 切换器改为底部 pill 按钮组，并补齐亮暗主题共用的细边框 token，避免原生下拉控件和未定义 CSS 变量带来的视觉割裂。
- AI 工作台会持久化当前 AI Provider 选择；空对话切换 Claude Code / OpenCode 时不再弹出”新建对话”确认。
- 心流模式打开时会主动调整左侧 AI 工作台与右侧场景栏到更接近“三栏工作台”的比例，减少右栏过宽与编辑区被压缩的问题。
- 左侧文件树窄条切换入口改为更克制的线性图标与细指示条样式，弱化突兀感。
- 终端新建会话的工作目录优先使用用户当前选择的文件树 workspace；未选择 workspace 时再回退到当前文件目录 / 系统默认目录。
- Markdown WYSIWYG 代码块改回由 Vditor 原生管理光标，不再额外做按键后光标偏移修正；补充代码块 / 行内代码显示样式，降低代码块内容被空框“吞掉”的概率。
- 重写 README 为中英文双语文档，补充 Typola 的核心能力、安装方式、基础使用、打包命令、技术栈和产品优势说明。
- 左侧目录栏默认收起，改为通过正文左侧小箭头展开/收起；目录栏与右侧 Word / HTML 预览宽度均支持拖拽调整。
- 左侧栏改为“文件树 / AI 工作台 / 收起”单状态机，顶部提供文件树与 AI 工作台互斥切换 tab，避免出现文件树与 AI 工作台叠加成第四列。
- 心流模式进入时不再自动展开底部终端，终端仍可通过工具栏手动打开。
- AI 工作台 header 不再绑定当前文件名；当前文件改为 Composer 上下文 chip，可手动移除，切换文件后自动显示新文件 chip。
- AI 产物预览从右侧面板收敛为右下角 chips 浮窗；右侧栏不再铺开产物预览，避免把 AI 产物当成对话副产品而挤压主编辑器。
- 顶栏控件与整体背景配色统一到暖米基底：`--surface` / `--panel-bg` / `--control-bg` / `--toc-panel-bg` 等基底色相对齐 `--bg`，消除顶栏控件在暖米背景上「比背景更白」的不协调。
- 右侧 Word 预览面板可拖拽到更窄宽度，纸张预览更靠近分隔条展示，减少预览打开时左侧无效空白。
- 主工作区新增轻量多文件 tab：从文件树、最近文件、系统打开或拖拽打开多个文档时会保留已打开文件，未保存 tab 文件名前显示 `*`；只打开单个文件时自动隐藏 tab 栏。
- 主 WYSIWYG 编辑区改为宽版排版：Vditor 正文容器不再居中限宽，左右留白提升到 120px；右侧预览面板默认宽度提升到 520px、最小宽度提升到 400px，优先保证阅读和编辑宽度。
- 右侧 Word / HTML 预览展开时默认改为左侧编辑区与右侧预览区约 `2:1` 宽度比例；双击分隔条会恢复该比例，拖拽时右侧预览最小宽度收窄到 320px。
- 顶部应用工具栏背景与阅读底色统一，居中文件名字号提升到 13px 并增强对比度，改善窗口顶部的一致性和可读性。
- 新增文件内查找/替换面板：`Ctrl+F` 与 `Ctrl+H` 都会同时展示查找和替换输入，分别聚焦查找框或替换框；支持上/下一个、大小写、全词和正则选项，替换逻辑对只读 Word 预览禁用。
- 新增最近文件与快速打开：打开、拖拽、系统传入或恢复文档后会记录最近文件，`Ctrl+Shift+P` 可按文件名或路径片段快速过滤并打开。
- 状态栏新增文档统计：编辑时延迟计算词数、字符数、段落数和预计阅读时间，避免每次输入同步重算。
- 新增编辑辅助入口：支持插入链接、图片、Markdown 表格，并支持将剪贴板图片异步保存到当前文档同级 `assets/` 后插入相对路径。
- 底部状态栏新增"状态栏路径"设置项（外观页），可选"完整路径 / 仅文件名 / 首尾保留（推荐）"三种展示策略；默认"首尾保留"模式下，长路径会自动 ellipsis 收缩到 ≤60 字符且始终保留文件名，不会再撑开状态栏。完整路径仍可通过 `title` 提示或双击复制。
- 状态栏高度固定为 22px；状态栏文案、复制反馈与"未保存"标记同步加 `flex-shrink: 0` 避免被长路径挤压。
- 设置页移除独立的"快捷键"Tab；快捷键信息直接合并到 Toolbar 等可交互元素的 `title` 中，覆盖打开 / 保存 / 另存为 / 源码 / Word 预览 / HTML 预览 / 设置 7 个核心按钮（`Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+Alt+S` / `Ctrl+Alt+P` / `Ctrl+Alt+M` / `Ctrl+,`），中 / 英 / 日三语同步。设置页导航现为通用 / 编辑器 / 预览 / 外观 / Word 导出 / HTML 导出 / 授权 / 关于 共 8 个 Tab。
- 新增快捷键：`Ctrl+Alt+S` 切换源码模式、`Ctrl+Alt+P` 切换 Word 纸张预览、`Ctrl+Alt+M` 切换 HTML 预览、`Ctrl+,` 打开设置；与既有 `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+Shift+E` 合并为一致的快捷键面板。
- 重构 HTML 阅读预览 / Markdown 预览切换为 Vditor WYSIWYG 一体化（ISS-155 / DEC-085）：所有 Markdown 与 HTML 文档默认直接进入 Vditor WYSIWYG（`mode: 'ir'`），普通段落与不含 `rowspan` / `colspan` 的简单表格内文字可直接编辑；含 `rowspan` / `colspan` 的复杂表格区域在 Vditor 中标记为 `contenteditable="false"` + `data-typola-locked="table"`，结构与文字均不可改，输入回调对比原 `findHtmlTableBlocks` 自动恢复被改动的复杂表格源码。

### Performance

- 设置页拆分为按 Tab 懒加载：`SettingsPage` 模块不再一次性 import 所有子 section；切换 Tab 时只下载对应 section chunk，GeneralSection 与 SettingsPage 在 `preloadSettingsPage` 中并行预热。`ExportSection` / `WechatSection` 等较重的子组件不再拖累首次打开设置页的耗时。骨架屏行数同步从 9 减为 8 以匹配新的导航数。

### Removed

- 删除 `htmlReadingPreference` 状态机、`canToggleHtmlReadingPreview` 派生、`handleExitHtmlReadingPreview` / `handleOpenHtmlReadingPreview`，以及顶部"普通 Markdown 预览 ↔ HTML 阅读预览"toolbar 切换按钮；删除 `html-reading-toolbar` 中"退出 HTML 预览 / 编辑表格"两个按钮和 `markdown-preview-toolbar` 整栏。
- 删除结构化表格编辑入口 `htmlTableEditorVisible` 与 `HtmlTableEditor` 组件（用户确认不使用结构化编辑），Toolbar 源码按钮作为兜底编辑入口；`HtmlPresentationPane` 对 `.md` 文档的入口同步收紧为只对 `.html` / `.htm` 文件生效。

### Fixed

- 修复 AI 工作台 Question Form 会卡住整个对话流的问题：`<question-form>` 现在作为 Typola 自定义 artifact 渲染，进程结束后会话回到 idle，用户提交答案会作为普通下一轮消息继续执行，并显式禁用 Claude `AskUserQuestion` 工具路径；同时所有非问答工具调用默认折叠。
- 修复 PR #103 后续检视意见：SkillHub 本机能力扫描改为单一 generation token 流程，避免切换 Provider 或 reload 时旧扫描结果覆盖新列表；同时保留旧 `skillHubReloadKey` 兼容字段并补充 OpenCode command prompt 契约说明。
- 修复心流模式下 OpenCode 场景模板没有可选 skill/command 的问题：内置模板现在声明支持 OpenCode command，已安装的同名本地 command 会直接显示为可点击卡片，未安装项会引导按 OpenCode command 配置。
- 修复 #90：OpenCode 场景下点击 SkillHub command 卡片会预填 Composer，并继续通过 `opencode run --command` 调用；刷新、扫描错误和安装引导文案改为区分 Claude skill 与 OpenCode command。
- 修复 PR #120 检视指出的 CM6 polish 稳定性问题：图片加载失败 fallback 改为捕获真实 `img error`，图片粘贴/拖放避免重复插入，标题折叠搜索会展开完整父链并在切换文档时清理折叠状态；补齐折叠操作的 CM6 userEvent 标记、Tauri event listen 权限和本地 asset 协议基础 scope。
- 修复 PR #102 检视指出的 AI 产物中心安全与稳定性问题：覆盖/撤销原文会在 Rust 侧校验目标文档白名单，产物时间戳排序兼容 ISO 与历史毫秒格式，补齐 `.typola-output` 文件系统权限、CSS token 兼容别名和 artifact scanner / 覆盖白名单回归测试。
- 调整 AI 产物中心：产物统一生成到当前 AI 工作目录下的 `.typola-output/<当前会话>/`，扫描当前 AI 工作目录下的 `.typola-output/`；未指定工作目录时使用用户默认目录下的 `.typola-output/`。产物中心移除“当前文档”视图和“全部状态”筛选，保留当前会话 / 全部产物与类型筛选。
- 修复 PR #100 检视指出的 AI Runtime 空抽象问题：移除未接入实际 spawn 的 commandSpec / promptBudget 层，Claude / OpenCode runtime 定义收敛为 CLI 检测配置表。
- 修复 AI CLI 检测稳定性：版本探测改用进程级超时等待、限量读取 stdout/stderr 并按字符边界安全截断；诊断操作按钮不再只支持重新检测。
- 修复 Windows 下通过 npm `.cmd` wrapper 启动 OpenCode 时，用户 prompt 中的 shell 特殊字符可能被 `cmd.exe` 重新解析的问题；现在会优先解析 wrapper 指向的真实可执行文件，并在取消后等待旧 run 退出、丢弃 late stdout，再切换到新 Provider 对话。
- 改进 OpenCode 新手诊断：设置页增加安装提示与文档入口，检测或运行失败时会区分未安装/路径不可执行/模型格式/认证问题，而不是只显示泛化的执行失败。
- 修复心流模式下 OpenCode 仍显示用户添加的本地 Claude skill、点击后可能卡在不支持的 skill 调用路径的问题；SkillHub 现在按当前 AI Provider 扫描与添加能力，Claude 使用 `.claude/skills`，OpenCode 使用全局/项目级 `.opencode/commands` 或 `opencode.jsonc` command 配置，并通过 `opencode run --command` 调用。

- 修复 SkillHub 系统内置 skill 安装入口不区分 AI Provider 的问题：内置模板现在按当前 CLI provider 过滤，OpenCode 场景不会再展示 Claude-only 的安装项。

- 修复未显式选择 AI 工作区时 OpenCode Provider 会继承 Typola 启动目录、导致工作目录显示为 Typola 源码目录的问题；现在会回退到用户默认目录，并在默认目录下使用 `.typola-output/<当前会话>/` 保存 AI 产物。
- 修复 OpenCode Provider 下当前文档/附件仅作为 prompt 路径文本传递、导致模型可能无法读取当前编辑区文章的问题；现在会把可见上下文 chip 对应的参考文件在每轮发送时同步传给 `opencode run --file`，把 `opencode run --dir` 指向有效工作区而不是会话产物目录，并避免在 OpenCode prompt argv 中追加首轮多行参考文本。
- 修复 OpenCode Provider 交互时不显示工具调用卡片的问题；现在会把 OpenCode `tool_use` JSON 事件映射到与 Claude Code 一致的工具卡与结果显示，并在存在 reasoning/thinking 文本时显示思考过程。
- 修复 AI 工作台在同一会话中切换编辑区文章后仍沿用旧“已注入当前文档”状态、导致后续回复无法识别新打开文章的问题。

- 修复 Windows 自定义 npm global 目录下 `claude.cmd` 会导致 Rust CLI 路径解析测试失败的问题。
- 修复 AI 工作台切换到 OpenCode 后首轮对话不可用的问题：不再把 Typola 内部 UUID 当作 OpenCode `--session` 传入，后续对话改用 OpenCode `--continue`，并补齐真实 `step_finish` JSON 完成事件解析。
- 修复 AI 工作台 OpenCode 模式下仍显示 Claude 文案的问题，Composer、模型提示、错误卡和默认工作目录提示现在会使用当前 AI Provider 或中性文案。
- 修复 `npm run tauri dev` 在 Windows 上可能因 Vite 监听 `src-tauri/target` Rust 构建产物、撞到被锁定的 `app_lib.dll` 而退出的问题。
- 修复多个未保存新建文档同名导致关闭 tab 时误关其他“未命名”文档的问题：新建文档会生成可区分名称与稳定内部 tab id。
- 修复只有一个已打开文档时没有 tab 关闭入口的问题；默认空白初始态仍保持无 tab。
- 新增当前文件重命名能力：可双击顶部文件名或 tab 文件名打开重命名弹窗，真实重命名磁盘文件并同步 tab / 最近文件。
- 修复 tab 关闭与窗口关闭未保存确认在 Tauri WebView2 下不弹窗的问题：原 `window.confirm` 会被 WebView 静默吞掉，造成 tab 关闭时静默丢失编辑；改为自定义 React 模态对话框（保存 / 不保存 / 取消 三按钮），并补全 `dialog:allow-confirm` / `dialog:allow-message` capability。
- 修复 WYSIWYG 模式下 Markdown 代码块或行内代码编辑时光标频繁跳回开头的问题：Vditor IR 归一化让受控同步 `editor.getValue() === source` 判断失效，触发 `setValue` 重置光标；改为记录"自身回显值"，自身回显时跳过 `setValue`，外部写入仍正常刷新。
- 修复 PR #125 引入的 3 个用户可感知回归：(1) 左右栏弹出/收起的 motion spring settle 约 500-700ms 与 PR2 `transition: width 0.46s` 并发导致双通道打架，改为 motion 仅补 opacity 淡入/淡出、保留 PR2 宽度 transition，移除 `motion.div` 拖拽分隔条的不必要 fade；(2) 工具栏导出下拉菜单被 motion transform 创建的 stacking context 遮挡导致 PDF / Word 选项点不到，改为 `@floating-ui/react` `FloatingPortal` 挂到 `document.body` 并把 `z-index` 抬到 9999；(3) tooltip 文案冗长且 `::after` `z-index: 200` 在 modal overlay 之下被遮挡，新增 `src/components/ui/Tooltip.tsx` 用 `FloatingPortal + useHover + useFocus` 渲染到 body 层（短 label + 灰色 shortcut），旧 `data-tooltip::after` `z-index` 同步抬到 9999 作兜底，并补 `prefers-reduced-motion` 与触摸设备的 `@media (hover: none)` 守门。同时把 `MotionProvider` 的 duration 从 CSS `--motion-duration-base` 读取并对齐到 180ms，删除未使用的 `calmSpring` export，避免后续动效 token 双轨。
- 修复多文件 tab 中当前活动文件刚被编辑后，关闭 tab 或关闭窗口可能没有提示未保存修改的问题。
- 彻底修复右上角关闭按钮可能无响应的问题：关闭请求现在先拦截确认，再显式销毁窗口；销毁过程中的重复关闭事件会直接放行，并提供 Rust 后端强制关闭兜底。
- 关闭存在未保存文档的窗口时改为“保存并关闭 / 不保存关闭 / 取消关闭”流程，选择保存会先写回所有未保存文档，保存失败则取消关闭，降低数据丢失风险。
- 修复编辑器聚焦时 `Ctrl+S` 被编辑器快捷键保护提前放行、无法触发保存的问题。
- 正文编辑区滚动条右侧留白收敛到 30px，减少编辑区无效空白。
- 修复 PR 审查发现的高严重度安全与数据风险：Tauri CSP 移除 `script-src` 的 `unsafe-inline`，文件系统能力移除 `fs:default` 并限制到常用用户文档目录 / 对话框授权路径，另存为统一走 Rust 写入校验；打开、拖入或系统传入新文件前会提示未保存内容，避免静默丢失。
- 修复全局快捷键在 Vditor、CodeMirror、输入框等编辑焦点中抢占按键的问题；编辑区内按键会交回编辑器处理。
- 修复终端输出在 Windows PTY 下可能因 Rust 端 `from_utf8_lossy` 提前替换字节而乱码的问题：`terminal_data` 改为传输原始字节，前端按当前默认编码流式解码；终端清屏命令现在会真正向 PTY 写入清屏控制序列。
- 修复设置服务连续快速写入可能基于过期快照合并的问题：`updateSettings` 增加进程内最新快照与统一持久化入口，旧设置迁移不再全量展开 defaults 覆盖当前字段。
- 修复自动保存失败时无提示并持续无限重试的问题：连续 3 次失败后暂停当前内容的自动重试，在状态栏提示，用户继续编辑或手动保存后恢复。
- 新增当前文件外部变更监听：桌面端通过 Rust `notify` 监听已打开文件，外部编辑会在状态栏提示；保存后的 1.5 秒内同路径变更视为自写事件并忽略，避免误报。
- 新增单实例文件打开转发：Windows / Linux 第二次启动 Typola 并传入文档路径时，会复用已有窗口并通过 `opened-paths` 打开文件，避免同一文档被多个进程分叉编辑。
- 修复重新打开上次文件失败后路径永远保留的问题；失败一次后会清理过期 `lastOpenedPath`，下次启动不再反复尝试同一路径。
- 修复 Markdown 文件中通过 `![](./path.webp)` 引用的本地相对路径图片（WebP / PNG / JPG / GIF 等）无法在 Vditor 编辑区、Word 纸张预览、HTML 导出预览中正常渲染的问题：新增 `localImageResolver` 服务，在 Vditor 渲染完成后自动将 `<img src="./relative">` 解析为 Tauri asset 协议 URL（`https://asset.localhost/...`），与已有的 `htmlPresentationService` 共用路径解析逻辑。`.webp` 与 `.png` / `.jpg` 表现一致。
- 修复 PDF 导出评审问题：导出链路改为离屏 hidden webview 打印，不再复用主窗口；前后端都增加了导出互斥保护，导出中显示遮罩，成功提示包含完整保存路径，`Ctrl+P` 的快捷键调整也同步写入按钮提示与文档说明。

- 修复 Vditor WYSIWYG（即时渲染）模式中输入 `**foo**` 后 `**` 字符仍以蓝色 marker 持续可见、加粗看上去未生效的问题：`WysiwygEditorPane` 监听 `keydown` 钩子并在停顿 220ms 后强制清除 IR 节点的 `vditor-ir__node--expand` class，与 Vditor 自身 `blurEvent` 行为对齐；编辑过程中不打断用户，持续键入时 marker 仍可见，停顿后自动折叠。

- 修复打开右侧 Word / HTML 预览面板时主 Markdown 区域被反向压扁、行宽急剧收窄的问题：`.main-content` 引入 `--main-min-width: 480px` 阈值，主编辑 / 预览 / HTML 演示容器在 `.right-panel-open` 下保证 480px 最低行宽；右侧面板宽度改为 `clamp(360px, var(--right-panel-width, 460px), calc(100% - 489px))`；800×600 视口下 Word 预览自动折叠，1280×800 视口主区保持可读。新增 `.html-presentation-layout` / `.html-reading-layout` / `.word-preview-open` / `.wechat-preview-open` 显式规则，消除 dangling class。

### Added

- 复杂表格上方 hover 出现"查看原貌"小图标（`<button class="typola-html-table-viewer-trigger">`），点击后弹出 `<HtmlTableViewerOverlay />` 渲染 `createHtmlReadingPreviewHtml` 的忠实 HTML 版本（独立容器，不打断 Vditor 状态），支持 ESC、关闭按钮、点击遮罩三种关闭方式。
- `htmlTableBlockService` 暴露 `classifyHtmlTableBlocks()`，返回 `{ simple, complex }` 两桶以供 Vditor 锁定与输入拦截使用；新增 5 个 `classifyHtmlTableBlocks` 单元测试。

## [0.3.21]

### Changed

- 浮动大纲的横条改为轻量查看入口：横条点击或悬停只展开大纲，不再直接固定；展开面板内新增明确的固定、取消固定和关闭按钮，固定后继续使用左侧常驻栏避免遮挡正文。
- 浮动大纲固定态新增“总是固定大纲”选项：该选项只在大纲已固定为左侧栏时显示，开启后会记住默认固定偏好；取消固定或关闭固定栏会同步回到轻量横条体验。
- 包含原生 HTML 表格的 Markdown 文档仍默认进入 HTML 阅读预览，但预览顶部新增“退出 HTML 预览”，可切回普通 Markdown 预览；普通预览顶部保留“HTML 阅读预览”按钮，方便需要表格稳定渲染时再切回。

### Fixed

- 修复源码模式下点击浮动大纲条目无法跳转的问题：TOC 现在会定位到对应 Markdown 标题行并滚动 CodeMirror 源码编辑区。

## [0.3.20]

### Removed

- 删 `website/` Astro 子目录、官网构建转发脚本 `scripts/run-website.mjs` 和 GitHub Pages 部署 workflow `deploy-website.yml`，官网已迁到独立仓 `cat-xierluo/personal-site` 统一管理。
- 删 `package.json` 中的 `website:dev` / `website:build` / `website:preview` 转发脚本和官网构建相关 npm 依赖；`docs/ARCHITECTURE.md` 改为引用 `personal-site` 仓维护的产品详情页。

### Changed

- `README.md` §"官方网站" 链接改到 `https://cat-xierluo.github.io/personal-site/typola/`，移除"调试官方静态网站"小节和相关 `npm run website:build` 命令提示。
- 浮动大纲固定后改为左侧常驻栏，占用独立阅读空间，避免大纲面板覆盖正文；固定状态下可通过面板右上角按钮取消固定。
- 阅读预览和 `.docx` HTML 预览支持按中文字体、英文字体独立响应设置变更：通过新增的 `--preview-chinese-font-family` / `--preview-latin-font-family` CSS 变量直接消费 `useSettings` 同步写入根容器的字串，Vditor 渲染实例无需重新解析 Markdown；标题字体仍走 `--preview-heading-font-family`，对 Vditor 生成的标题元素以 `!important` 优先于自带 `font-family`。

### Fixed

- 修复在设置页切换中文字体、英文字体或标题字体后，主阅读预览面板不实时更新的问题：以前 CSS 变量变化被 Vditor 自带 `font-family` 覆盖，需要切换文件或重新触发渲染才会生效；现在 CSS 变量直接控制正文 / 列表 / 表格 / 引用等 Vditor 元素的字体并以 `!important` 优先于其默认样式。
- 修复阅读预览正文只消费英文字体变量的问题：正文、列表、表格和引用现在按英文字体栈 → 中文字体栈 → 总体阅读字体回退组合，避免 `sans-serif` 提前截断用户选择的中文字体。

## [0.3.19]

### Fixed

- 修复 `v0.3.18` 桌面端打开后主页面可能空白的问题：生产包资源改为相对路径，避免 Tauri WebView 从嵌入页面加载 `/assets/...` 失败。
- 修复生产构建进入“源码模式”可能白屏的问题：CodeMirror 相关依赖按包边界拆分 vendor chunk，不再通过任意 `maxSize` 切分打散类继承顺序。
- 新增 Vite 构建配置回归测试，覆盖桌面包相对资源路径和 CodeMirror 拆包策略。

## [0.3.18]

### Changed

- Settings / 预览字体改为中文字体、英文字体、标题字体三组选择，默认入口统一为“默认”，并支持自定义字体名；Markdown 阅读预览、`.docx` HTML 预览和即时渲染编辑同步使用新字体栈。
- Markdown H1-H6 默认跟随正文或统一标题字体，标题层级改用字号、间距和渐进字重表达，不再按层级混用衬线/非衬线。

## [0.3.17]

### Fixed

- 修复 `v0.3.16` 后系统双击 Markdown / HTML 文件仍可能显示空白的问题：桌面端通过文件关联、启动参数、拖放或“重新打开上次文件”得到的路径改由 Rust 后端受控读取，再交给前端按当前编码解码，避免前端文件插件路径授权不足导致内容未加载。
- 修复系统路径打开 HTML 后进入“编辑源码”仍可能为空的问题；新增覆盖“系统传入 HTML 路径 → 后端读取原始源码 → 源码编辑器显示”的整链路回归测试。
- 修复通过系统路径打开 Markdown / HTML 后保存可能继续受前端文件插件权限影响的问题；已有路径保存改由 Rust 后端受控写回，另存为仍保留系统保存对话框链路。

## [0.3.16]

### Changed

- Release workflow 的 Gitee 附件同步改为带超时的 best-effort 步骤：GitHub Release 和 `latest.json` 仍是发布主路径，Gitee 上传过慢或失败时不再无限挂起后续发布流程。

### Fixed

- 修复将 Typola 设为 Markdown / HTML / Word 默认打开应用后，双击文件不会直接加载的问题；macOS 运行中打开文件会进入同一窗口，Windows 启动参数打开链路也会读取系统传入路径。
- 修复 `.html` 文件预览仍按 Markdown 链路渲染，导致残留 HTML 符号、白色源码框、右对齐和空行语义丢失的问题；HTML 阅读页现在提取正文后走安全直读预览，并保留受控的对齐与空白样式。
- 修复 HTML 阅读页点击“编辑源码”可能显示空白的问题，新增真实 CodeMirror 渲染回归保护，确保源码编辑区拿到当前完整文档内容。
- 修复 `v0.3.14` 发布草稿在 Windows MSI 打包阶段失败的问题；文件关联描述改为 WiX 兼容文本，Windows `.exe` / `.msi` 产物可继续一起发布。
- 修复 `v0.3.15` 发布草稿的 Windows 编译失败问题，保留 Windows 启动参数打开链路所需的 Tauri `Manager` trait。

## [0.3.13]

### Added

- Word 导出自定义 JSON 示例扩展为完整模板，覆盖页面、字体、标题、正文、页码、表格、代码、引用、图片、分割线和列表配置。
- Word 自定义预设导入兼容 md2word YAML 转 JSON 后的常见字段别名与单位，包括 `row_height_cm`、`cell_margin.top/bottom/left/right`、`table.header/body`、`code_block.label/content`、`quote.left_indent_inches` 和页码位置。
- Word 导出 JSON 新增 `styles`、`markdown_mapping` 和 `html_mapping`，可用样式别名统一定义 Markdown 标题、正文、代码块、列表、分割线、表格、图片标题以及 HTML table 选择器的输出规则。

### Changed

- Word 纸张预览和真实 `.docx` 导出继续以同一套 `PresetConfig` 为来源，并补齐标题字体、页码格式/位置、表格背景色、表格对齐、单元格四边距和图片标题的可见样式映射。
- Word 纸张预览和 `.docx` 导出会消费 JSON v2 样式映射；映射引用不存在时导入失败，避免 JSON 中写了样式但实际导出无效。
- 内置 Word 预设中的“公文报告”更贴近 GB/T 9704 公文版式，“学术论文”更贴近 GB/T 7713.2 学术论文常见字号字体。

### Fixed

- 修复 md2word 风格 JSON 只包含 `table.cell_margin.top/bottom/left/right` 时不会触发 dxa 单位转换的问题。
- 修复 JSON v2 表格样式只设置 `cell_margin` 时纸张预览和 `.docx` 单元格边距可能不一致的问题。
- 修复 Word 纸张预览中未配置表格背景色时默认背景变量可能继承文字色的问题。

## [0.3.12]

### Changed

- Markdown 阅读和即时渲染编辑默认改用中文优化字体栈，Settings / 预览字体新增“中文优化”“中文宋体”等预设，改善中文长文与中英文混排观感。
- 优化前端生产构建拆包：React、CodeMirror、Tauri、Vditor、docx / Mammoth / JSZip 等重型依赖拆分为独立 vendor chunks，消除当前 500KB chunk size warning。

### Fixed

- 修复 HTML 表格导出 Word 时正文行仍输出 `w:tblHeader w:val="false"` 的冗余节点；新增真实 `.docx` XML 回归测试，覆盖 `gridSpan`、`vMerge` 和表头行结构。

## [0.3.11]

### Changed

- Word 纸张预览保持快速 HTML/CSS 仿 Word 路线：当前 Markdown 直接渲染为 A4 纸张预览，导出预设驱动页边距、字体、标题、正文、表格和图片样式；真实 `.docx` 生成继续只服务 Word 导出。

### Fixed

- 修复 Word 纸张预览中部分长表格正文单元格会按表头样式渲染的问题，长 HTML 表格预览恢复正常换行且不撑出面板。
- 修复根目录官网脚本在未安装 `website/` 依赖时无法构建的问题；`website:dev`、`website:build`、`website:preview` 会按需补装官网依赖。

## [0.3.10]

### Added

- 新增 `website/` Astro 官方静态网站，提供项目介绍、功能展示、下载入口和 GitHub Pages 自动发布流程。
- 工具栏新增内联更新按钮：发现可用更新后自动后台下载，下载完成后在工具栏显示重启按钮，无需弹窗确认。
- 新增日语 (ja-JP) 完整语言支持，覆盖设置、工具栏、更新等全部文案。
- Word 导出表格支持行高 (HeightRule) 和单元格边距 (cell margins)，从预设配置读取。

### Changed

- 官网浏览器标签页 favicon 改用 Typola 应用自身 logo。
- 官网首屏布局改为居中内容容器，产品预览作为下方居中视觉信号，两侧保留自然留白。
- 官网文案从偏法律文档场景调整为面向知识工作者的复杂 Markdown 阅读、预览和导出定位。
- ESLint 忽略 Astro 官网生成目录，避免 `website/.astro` 类型文件参与桌面应用源码检查。
- Word 纸张预览继续使用导出预设驱动的 A4 纸张样式，补齐更多标题、正文、链接、表格和图片尺寸映射。
- 配置文件（eslint、playwright、tsconfig、vite）从项目根目录移至 `config/` 子目录。
- 更新服务将下载和安装拆分为独立 API，支持后台下载后再重启安装。
- 导出预设设置面板精简布局：移除冗余描述文案，自定义预设使用紧凑模式。
- 关于页更新提示增加后台下载状态文案。
- 许可证描述文案精简。

### Fixed

- 修复 Word 导出未把 Markdown 链接转换为 Word 原生超链接的问题；右侧 Word 纸张预览同步补齐链接颜色、正文颜色和表格字体颜色映射。
- 修复自动更新后台下载期间仍订阅进度事件、导致主界面频繁重绘和卡顿的问题；下载完成前不显示重启入口，完成后才在顶部栏提示重启更新。

### Removed

- 移除 `UpdateDialog` 弹窗组件，更新流程改为工具栏内联状态机。

## [0.3.9]

### Added

- 新增共享 `HtmlTableModel` 与 HTML table block 定位/替换服务，为后续结构化表格编辑器提供稳定基础。
- 新增 HTML 表格结构化编辑器：稳定阅读预览中可选择单个表格，编辑单元格 HTML，追加/删除行列，并只替换目标 `<table>` 源码区块。
- 新增法律 HTML 表格 fixture，覆盖证据目录、材料清单、复杂表头、多 `tbody`、空单元格、长 URL 和长中文内容。
- 导出预设新增启用/停用管理；自定义预设可删除，内置预设可从日常列表中隐藏。
- Settings / Word 导出新增示例 JSON 展开区和单页纸预览；点击预览纸张可打开放大视图，便于比较不同 Word 预设的版式效果。
- Settings / Word 导出新增自定义预设槽位可视化：2 个常规槽位、空槽位导入入口、历史兼容提示和内测授权槽位提示。
- HTML 表格稳定阅读预览新增“编辑源码”入口，用户可从只读阅读视图明确进入源码编辑。
- 新增 `zh-CN` / `en-US` / `ja-JP` 语言设置基础，先覆盖设置导航、关于页、顶部栏和 Word 预览核心文案。
- 关于页新增 Typola 图标、项目地址、作者 GitHub 主页和微信二维码。
- 新增默认浮动 TOC：文档有标题时显示左侧弱刻度，hover 或键盘聚焦展开标题列表，支持轨道点击固定和标题跳转。
- 新增暗色模式，覆盖主界面、设置页、Word 预览外壳、Floating TOC 和编辑器容器。
- 新增 HTML 预览入口与右侧预览面板：当前 Markdown 可渲染为 HTML 文章预览，并提示本地相对图片。
- HTML 预览面板支持复制到公众号编辑器和导出 HTML：复制写入 `text/html` 与 `text/plain` fallback，导出文件包含完整 HTML 结构；正文节点已按当前 HTML 预设生成内联样式，同时保留文档级 CSS 作为兜底。
- Settings 新增“HTML 导出”分区，提供 `预设库 / 自定义槽位 / CSS 示例` 二级页、3 套简单通用内置 HTML 主题、2 个常规自定义 CSS 槽位，支持导入 `.css` 样式文件和 `.json` 预设文件，并可导出当前 CSS 预设 JSON。
- Settings 新增“授权”分区，可输入内测码并显示 Word / HTML 自定义预设槽位上限；内测授权启用后槽位上限从 2 个提升到 8 个。
- HTML 文件新增“演示模式”：`.html/.htm` 默认仍使用安全阅读预览，用户点击演示模式后在隔离 iframe 中运行当前 HTML，并提供上一页、下一页和返回阅读预览操作。

### Changed

- README 补充普通用户下载入口、macOS 首次运行命令、开发/构建说明，并参考 Legal Skills 项目完善作者介绍。
- 顶部栏按钮按“文件操作 / 视图与导出 / 导航设置”分组，并改用更柔和的 folder/save/braces/book/sliders 图标；tooltip 更明确，同时保持透明、低视觉权重的 icon-only 风格。
- 顶部栏不再提供“大纲”按钮，TOC 改为内容区左侧浮动导航，不再挤占横向布局。
- Floating TOC 的固定/取消固定统一由左侧横线轨道触发，展开面板不再显示图钉按钮；折叠刻度按标题层级显示不同长度和粗细。
- 普通 Markdown 编辑从 Vditor `wysiwyg` 切换为 Vditor `ir` 即时渲染模式，更接近 Obsidian Live Preview：当前编辑块显示 Markdown 标记，离开后保持预览观感。
- 默认内置 Word 导出预设精简，移除“法律服务方案”；常规版本自定义导出预设限制为 2 个槽位，历史超限预设继续兼容读取。
- Word 导出设置页将内置预设与自定义预设槽位分组展示，内置预设不占用自定义槽位。
- Word 导出设置页改为 `预设库 / 自定义槽位 / JSON 示例` 二级页面；纸张预览只在预设库显示，自定义槽位和 JSON 示例使用全宽内容区。
- HTML 导出设置页收敛为同构二级页面：CSS 示例页使用全宽内容区，不再常驻文章预览；自定义槽位的导入 / 导出主路径统一表述为 CSS 预设。
- Word / HTML 导出设置页的三级选项改为等宽铺满横条；顶部“删除/停用”入口移除，HTML 文章预览只在预设库显示并支持点击放大，内置 CSS 预设条目不再展示来源行。
- Word / JSON 示例页和 HTML / CSS 示例页精简为只展示可选中示例文本；导入、复制、导出当前预设等动作保留在自定义槽位页。
- Word / HTML 自定义槽位页移除顶部导入按钮，空槽位点击导入预设文件；槽位说明进一步压缩。HTML 导出自定义槽位页不再提供手写 CSS 表单，Word / HTML 设置页预览侧只显示预设名，不重复展示描述或点击提示。
- 内测授权页文案收敛为“内测码只用于开启本机额外自定义槽位”。
- Word / HTML 设置页预览缩略框收窄，放大预览弹层高度限制到设置页尺度，减少按钮和内容挤压。
- Word / HTML 自定义槽位页的锁定入口统一改为“内测授权 / 输入内测码”，并跳转到授权页。
- Markdown 主显示区继续扩大可视高度：WYSIWYG / Live Preview、普通预览和稳定 HTML table 阅读预览同步压缩上下留白，内容更贴近底部状态栏路径区域。
- 自动检查更新恢复为可配置开关，默认开启；关于页只保留开关和手动检查更新入口，不再展示“启动后延迟检查”等技术说明。
- 自动更新发现新版后改为后台下载；下载完成后在顶部栏显示“重启更新”，不再用下载弹窗阻塞编辑和页面切换。
- 快捷键设置精简为打开、保存、另存为和导出 Word，移除暂未实际提供的命令面板占位。
- Tauri capabilities 新增 `process:allow-restart`，保证安装更新后可以正常重启应用。
- Tauri CSP 为 HTML 演示模式允许内联演示脚本，并保留本地图片、字体和媒体资源兜底；同目录 JS / CSS / 图片会优先内联进演示 iframe，外部网络连接继续受限。
- 项目定位从"专为法律文档设计"调整为"面向知识工作者的 Markdown 阅读与 Word 导出工具"，强调 HTML 表格 Markdown 预览与 Word 纸张预览导出两大核心能力。
- 关于页信息结构重新整理：版本只显示版本号，自动检查更新和手动检查更新同栏，项目地址与作者链接使用一致字体。
- 关于作者区改为作者信息与微信二维码两栏，移除微信号文字和作者业务方向描述。
- Word 纸张预览中的超长 HTML 表格现在按行分页，并在分页片段中重复表头；含 `rowspan` 的行组会保守地保持在同一页。
- Word 纸张预览的导出预设选择器改为 Typola 风格的轻量弹出列表，显示预设来源、说明和当前选中状态，并只展示已启用预设。
- 右侧预览面板改为互斥模式：无面板、Word 预览、HTML 预览三种状态不会同时打开，并共用同一套右侧宽度拖拽逻辑。
- Settings 侧栏标题默认从 `Settings` 改为“设置”。
- 自动更新运行时 endpoint 暂时收敛为 GitHub Releases `latest.json`；Gitee 继续作为 Release 产物同步镜像，但不再写入客户端静态更新源，避免 Gitee 不支持 GitHub 风格 `/releases/latest/download/...` 直链导致更新检查先命中无效地址。
- `scripts/create-updater-manifest.mjs` 改为从签名文件自动生成全平台 `latest.json` / `latest-gitee.json`，并在缺少必需平台签名时失败发布。
- 开发配置文件集中迁移到 `config/`，根目录仅保留包管理文件、前端入口和项目主目录；日常开发命令改为通过 npm scripts 指向配置路径。

### Fixed

- 修复打包 App 中标题栏拖动仍无法移动窗口的问题：补齐 Tauri 窗口拖动/双击最大化权限，移除与手动 fallback 冲突的 `-webkit-app-region`，并兼容桌面 WebView 中 `MouseEvent.buttons` 不稳定的情况。
- 修复 HTML table Markdown 默认稳定阅读时缺少页面内编辑入口的问题；普通 Markdown 默认进入即时渲染编辑器并可直接编辑。
- 关于页移除 Typola 标题下的能力说明和作者方向描述，减少关于页信息密度。
- 收紧即时渲染编辑器和稳定阅读预览的上下留白，改善大文档打开后的可视高度。
- 修复 Floating TOC 未固定时从横线轨道移向展开面板会因 hover 断层而消失、导致无法点击条目的问题；展开面板改为半透明，减少对正文的遮挡。
- 修复顶部栏透明拖拽覆盖层带来的交互命中不稳定风险；非按钮区域保留同步手动拖动 fallback，双击空白区域继续最大化。
- 调整 macOS overlay 红黄绿窗口控制的垂直位置，使其与 Typola 顶部栏图标视觉中线更一致。
- 精简主界面冗余线条：Word 预设区、分栏拖动区、编辑器 gutter 和预览边界改为更低权重表达。
- 打开或编辑文件后，文件名与 dirty 标记现在显示在标题栏视觉中心，不再跟随左侧文件按钮偏移。
- 关于页不再显示更新源，只保留项目地址、软件介绍和作者区域。
- 修复设置页第一次打开时只先显示变暗遮罩的问题：设置页会在空闲期预加载，懒加载等待时显示完整窗口骨架，并使用更连贯的进入动效。
- 修复 Word 纸张预览与导出 Word 在首行缩进、列表/引用/代码块缩进、行内代码、分割线、表格行高、表格单元格边距和图片宽度上的部分不一致。
- 修复自动检查更新在启动延迟期间被关闭再打开后，本会话不会重新排期检查的问题。
- 修复设置页 Word 导出预览放大时按 `Esc` 会直接关闭整个设置窗口的问题；现在优先关闭放大预览。
- 修复 Word 导出遇到单行 HTML table 时可能吞掉表格后续段落的问题；连续紧凑 HTML 表格现在会作为独立文档节点处理。
- 修复 Floating TOC 折叠状态下隐藏面板仍扩大透明命中区域的问题，避免遮挡正文点击和选区。
- 修复 Floating TOC 移除顶部按钮后的键盘可达性问题，折叠轨道现在可以通过键盘聚焦展开。
- 修复 Vditor WYSIWYG 异步挂载后 Floating TOC 当前标题高亮可能不随滚动更新的问题。
- 修复 HTML 表格导出 Word 时 `rowspan` 覆盖列被补成普通空单元格、导致合并单元格错列或列数膨胀的问题。
- 修复 HTML 表格导出 Word 时短行未补齐真实缺口、源码缩进空白生成额外空段落的问题。
- 修复 Word 纸张预览长表格分页时 `tfoot` 行丢失的问题。
- Word 导出 HTML 表格单元格时保留常见内部结构，包括段落、换行、加粗/斜体/下划线、行内代码、链接文本和简化列表。
- 修复 Markdown 管道表格解析：正确识别 `| --- | :---: | ---: |` 分隔行，并保留转义管道 `\|`。
- 修复 `npm run test:e2e` 在本机解析到上层旧版 Playwright CLI 的问题，项目现在显式固定 `playwright@1.60.0`。
- 同步前端、Rust 和文档中的版本/发布说明，减少 `0.1.0`、`0.0.0` 与 `0.3.7` 混用造成的排查干扰。

## [0.3.7] - 2026-05-19

### Added

- GitHub Actions 全平台自动发布工作流：tag 触发 → macOS ARM/Intel DMG + Windows EXE/MSI → 签名 → `latest.json` → GitHub Release。
- Release 发布后自动同步构建产物到 Gitee，生成 Gitee 专属 `latest.json` 供国内用户自动更新。

### Changed

- Updater 构建配置 `createUpdaterArtifacts` 改为 `true`，构建时生成签名产物。
- Updater endpoint URL 从 `{{target}}-{{arch}}.json` 改为统一的 `latest.json`。
- Bundle identifier 从 `com.typola.app` 改为 `com.typola.reader`，避免 macOS `.app` 扩展名冲突。
- Updater endpoints 增加 Gitee 备用源（国内优先），GitHub 作为 fallback。

### Fixed

- `.gitignore` 添加 `*.key` 排除规则，防止签名密钥意外提交。
- `docs/icon.png` 添加 macOS 标准圆角，GitHub 上显示更自然。

## [0.3.6] - 2026-05-18

### Added

- Word 预览改为多页 A4 纸张栈，显示 `第 1 页`、`第 2 页` 等页标，长文档不再是一张无限长纸。
- Word 预览面板内新增导出预设选择器，切换预设会同步影响预览和后续 `.docx` 导出。
- Settings / 导出支持导入自定义 JSON 预设，并提供 JSON 模板复制入口。

### Changed

- “导出 Word”按钮从顶部一级工具栏移入 Word 预览面板，只有打开 Word 预览时才显示。
- Word 预览拖拽调整宽度时只改变视觉缩放，不改变 A4 页面自身排版宽度。
- 导出预设从纯内置列表扩展为“内置预设 + 用户导入预设”的统一注册表。

## [0.3.5] - 2026-05-18

### Fixed

- 修复原生 HTML 表格文档在默认 WYSIWYG 区域中被压成极窄列、单元格接近逐字换行的问题。
- 修复大纲侧栏默认宽度和字号偏小的问题，提升长文档导航的可读性。
- 修复 macOS overlay 顶部栏部分区域只设置 `data-tauri-drag-region` 但拖动不稳定的问题，增加手动 `startDragging()` fallback；双击顶部栏空白区域会触发窗口最大化切换。
- 修复源码模式中 CodeMirror 容器随内容无限增高、导致长文档无法在窗口内滚动的问题。

### Changed

- 检测到原生 `<table>` 或打开 `.html` 文件时，主内容区自动使用 `Vditor.preview()` 稳定阅读预览；源码模式仍可编辑，普通 Markdown 仍默认进入 WYSIWYG。
- HTML 表格阅读预览使用更宽的内容版心，优先保证法律证据目录类宽表格可读。

## [0.3.4] - 2026-05-18

### Added

- 接入 Tauri updater / process 插件，新增启动后延迟自动检查更新、发现新版本提示、下载进度、安装后重启流程。
- Settings 新增“关于”页面，包含当前版本、自动检查更新开关、手动检查更新按钮和 GitHub Releases 更新源信息。
- 新增 `scripts/create-updater-manifest.mjs` 与 `npm run updater:manifest`，用于生成 GitHub Release 所需的 `darwin-aarch64.json` 更新清单。
- 新增 `npm run tauri:build:update`，用于在发布时生成签名 updater artifact。

### Changed

- 普通 `npm run tauri -- build` 默认不生成 updater artifact，避免本地打包因为缺少私钥失败；发布更新时使用专门脚本并提供签名私钥环境变量。

## [0.3.3] - 2026-05-18

### Changed

- 顶部工具栏图标更换为统一的文件流转语义：打开、保存、另存为、导出、源码、Word 预览、大纲和设置按钮更容易区分。
- 工具栏按钮尺寸、圆角和 hover 反馈微调，减少“标签感”，更接近克制的桌面工具栏。

## [0.3.2] - 2026-05-18

### Fixed

- 修复 macOS overlay 标题栏中工具栏空白区域无法稳定拖动窗口的问题。
- 修复拖拽 Markdown / HTML / Word 文件到窗口后无法稳定打开的问题，桌面端改用 Tauri 原生拖放事件读取文件路径。
- 修复 WYSIWYG 编辑区中央出现突兀白色画布的问题，默认写作背景统一为暖调纸面底色。
- 修复 Word 纸张预览把 A4 页面压缩成面板宽度导致版式不还原的问题，改为真实 A4 页面按比例缩放。

### Changed

- 顶部工具栏不再显示 Typola 名称，文件操作按钮改用更明确的打开、保存、另存为、导出 Word 图标。
- 默认窗口尺寸从 `1280×800` 调整为 `980×680`，更符合轻量阅读器的初始体量。
- Word 纸张预览继续复用 `md2word` 沉淀的 A4、页边距、标题、正文、表格、图片宽度规则，并保持按需加载。

## [0.3.1] - 2026-05-17

### Fixed

- 修复前端生产构建失败和 ESLint 失败，恢复 `npm run build` / `npm run lint` 可用。
- 修复 Tauri 打包后生成目录被 ESLint 扫描导致 `npm run lint` 误报失败的问题。
- 修复 Node 25 测试环境中全局 `localStorage` 干扰 jsdom，导致 Vitest 设置服务测试失败的问题。
- 修复 Settings 在切换二级菜单时因内容高度不同导致弹窗尺寸跳动的问题。
- 修复 Vditor 默认 `nowrap` 表格样式导致长证据目录横向撑出预览区的问题。
- 修复 macOS 原生标题栏显示为独立黑色条的问题，窗口标题栏改为 overlay 并融入 Typola 顶部工具区。
- 修复应用图标仅左上角透明、其余三个角仍为实色背景导致圆角不完整的问题。
- `.docx` 预览接入 DOMPurify 清洗，避免 Mammoth HTML 输出直接注入预览区。
- 修复旧版导出设置迁移的递归读取风险。
- Settings 中的自动保存、重新打开上次文件、默认编码、编辑器字体/拼写检查、预览字体/宽度等选项接入运行时行为。

### Changed

- 主界面默认改为 Vditor 所见即所得 Markdown 编辑器，占满内容区；源码编辑器改为工具栏按钮触发的 fallback。
- Word 纸张预览改为按需打开的右侧可拖拽面板，默认不占用主界面，也不在冷启动时加载。
- Word 纸张预览基于导出预设渲染 A4、页边距、字体、图片最大宽度和表格样式。
- 复杂原生 HTML 表格继续作为核心能力保护：阅读预览与 Word 纸张预览均覆盖 `rowspan` / `colspan` 渲染和长表格换行；源码模式保留为结构安全的编辑入口。
- 明确 v0.3 产品方向：默认 Typora-like 所见即所得编辑，右侧预览改为 Word 导出纸张预览，源码模式保留为复杂 HTML 表格 fallback。
- Toolbar 改为 lucide 图标按钮，并补充 Typola wordmark，整体更贴近 `docs/DESIGN.md` 的克制工具风格。
- Markdown / Word 预览统一使用设计系统变量，修正白底、蓝色链接等硬编码样式。
- Word 导出、docx 预览、Vditor 预览改为按需加载，降低首屏主包压力。
- 启动路径进一步瘦身：空文档不加载 Vditor JS/CSS，CodeMirror 编辑器、Tauri 文件服务、Settings 与 docx 预览均改为按需加载，上次文件恢复延迟到启动后的空闲时段。
- Vditor 预览增加内部内容特征探测：仅包含 Mermaid、数学公式、Graphviz 等由 Vditor 自渲染代码块时，不再加载普通代码高亮脚本；普通代码块仍保持高亮。
- 纯预览链路内联 Vditor 所需中文文案并关闭图标脚本加载，同时复用 Typola 自有预览样式，减少 `i18n`、`icons`、`content-theme` 运行时请求。
- 应用图标改为透明外角的圆角图标资产，修正 Dock / Finder 中显示为方形底色的问题。
- 工具栏按钮、图标和 Settings 信息层级整体放大，去掉选择框的原生渐变光泽。
- 主编辑区从“只看编辑 / 分屏 / 只看预览”改为默认 WYSIWYG 单页编辑；Word 预览作为右侧可拖拽面板按需打开。
- macOS 下为系统红黄绿窗口按钮预留顶部工具栏左侧空间，并设置应用窗口背景色与主界面奶油底一致。

### Added

- 新增 `WysiwygEditorPane`，使用现有 Vditor WYSIWYG 能力，不新增编辑器依赖。
- 新增 `WordPaperPreviewPane` 和 Word 预览样式映射服务。
- 新增 Word 纸张预览样式单元测试，以及 WYSIWYG / Word 预览 / HTML 表格相关 E2E 回归测试。
- 新增 Vitest 测试脚本与服务层测试，覆盖 HTML 清洗和设置持久化/迁移。
- 新增 Markdown 渲染特征探测测试，覆盖普通文档、普通代码块、Mermaid/数学公式等高级块的资源触发判断。
- 新增 Playwright 端到端回归测试，覆盖空文档冷启动、普通 Markdown、Mermaid-only、普通代码块的资源加载策略。
- 新增布局端到端回归测试，覆盖视图切换、分栏拖拽、Settings 固定尺寸和长 HTML 表格换行。
- 新增 `package-lock.json` 固定前端依赖版本。

### Removed

- 移除遗留 `markdown-it` / `@types/markdown-it` 依赖和不再使用的 `markdownService.ts`。
- 精简 `public/vditor/dist/`，移除运行时不引用的 TS/type 声明和未压缩 Vditor 构建文件，保留阅读功能所需的本地资源。

## [0.3.0] - 2026-05-16

### Added

- Word 导出支持嵌入本地图片（JPEG/PNG/GIF/BMP，Tauri readFile + docx ImageRun，自动缩放）
- Settings 页面：导出预设选择器（5 个预设单选列表），选择持久化到 localStorage
- 导出 Word 时使用用户选择的预设（替换原来硬编码的 legal 预设）
- Word 导出功能：Markdown → 格式化 .docx，支持 5 个预设（法律/学术/公文/法律服务方案/简约通用）
- Word 预览功能：打开 .docx 文件，mammoth 转 HTML 在预览区渲染
- 拖拽支持 .docx 文件
- `Cmd+Shift+E` 快捷键触发 Word 导出
- 应用图标：用户设计的字母 F 图标，全平台格式（.icns / .ico / PNG）
- 设计系统文档 `docs/DESIGN.md`
- 任务清单 `docs/TASKS.md`

### Changed

- README.md 技术栈更新为 Vditor + 补充图标
- Tauri capabilities 新增 `fs:allow-read-file` 和 `fs:allow-write-file` 二进制文件权限

## [0.2.0] - 2026-05-15

### Changed

- 渲染引擎从 markdown-it + DOMPurify 替换为 Vditor.preview()
- PreviewPane.tsx 改用 Vditor.preview() 渲染，支持 Mermaid 图表、KaTeX 数学公式、highlight.js 代码高亮
- CSS 选择器从 `.preview-document` 改为 `.preview-content`（Vditor 容器 class）
- CSP 收紧：移除 `https:` 通配，只允许本地资源 + `unsafe-eval`（Vditor 需要）

### Added

- Vditor 静态资源本地化到 `public/vditor/dist/`，不依赖外部 CDN
- 代码块语法高亮（highlight.js，github 主题）
- Mermaid 图表渲染支持
- KaTeX 数学公式渲染支持
- Vditor 内置 XSS 过滤（sanitize: true）

### Removed

- `src/services/markdownService.ts` 不再使用（Vditor 自带 Lute 引擎）
- `src/components/VditorTest.tsx` 测试组件已删除
- `dangerouslySetInnerHTML` 渲染方式已移除

## [0.1.0] - 2026-05-15

### Added

- Markdown + HTML 渲染（markdown-it + DOMPurify）
- 固定左右分屏：CodeMirror 6 编辑 + 实时预览
- TOC 大纲面板，点击跳转到对应标题
- 文件打开（对话框 Cmd+O + 拖拽）
- 保存 / 另存为（Cmd+S / Cmd+Shift+S）
- 法律文档表格样式（rowspan / colspan / thead / tbody）
- DOMPurify 安全清洗，禁止 script / 事件属性 / javascript: 链接
- Tauri v2 桌面应用，macOS 原生 WebView
