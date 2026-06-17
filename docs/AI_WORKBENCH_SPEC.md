# Typola AI 文档工作台 Spec（终端方向 · 心流模式）

> **状态**：设计已收敛（2026-06-16 评审 OpenDesign mock 后定稿），待 codex 实施。
> **配套文档**：
> - [brief.md](changes/2026-06-14-work-package/brief.md) — 方向 / 范围 / 验收

## 当前基线（截至 2026-06-16）

✅ **已就绪**（前置全部完成，可直接基于当前 main 接力）：
- headless AI 工作台原型已外科式移除（commit `abae51e`），保留 `agent_detect` 等地基
- 文件树（`FileTreePanel`）+ 多 tab + 未保存改动三按钮对话框（`UnsavedChangesDialog`）+ 编辑器→预览同步滚动 + WYSIWYG 代码块焦点态 + 右键菜单（`EditorContextMenu`）+ 自定义 tooltip + 新建文件按钮
- 跑通 `npm run typecheck` / `npm test`(222) / `cargo test`(9) / `cargo check`

🚧 **本期 MVP**（codex 接力实施，按本 spec §4–§9）：心流模式布局（最大化 + 三块面板独立开关 + ⌘⇧A 宏）+ **单场景卡（HTML 生成）** + 写盘刷新 + 改动可见（预览顶部「本次产物」chips，HTML 用 sandboxed iframe 渲染）+ agent 终端（懒启动）。

## 0. 方案与定位

**旧方案（废弃）**：无头 spawn `claude -p` + JSONL 解析 + 自定义聊天 UI（`AIWorkspacePanel`）。问题：等于重写 Claude Code 前端且更差、丢失交互授权/plan/slash/skill、每轮重开进程、格式漂移。

**本方案**：**心流模式 = 以真实文档编辑器为中心的 agent 驾驶舱**。真实交互 `claude` 跑在内嵌 PTY 终端（复用 `portable_pty` + `@xterm/xterm`）。能力（润色/公众号/日报/html-ppt）交给终端里的 **skill**，**app 只做"贴合"那层**：左文件树、中编辑器、右**场景启动器/预览**、底 agent 终端。结果回写不靠解析输出，靠 **agent 写盘 → 文件监听 → 编辑器/预览刷新 + 产物列表**。

参考：NotebookLM（右栏 Studio 场景卡 + 产物列表）、fanbox-windows（嵌真实终端跑 agent）、tolaria（`aiAgents.ts` 注册表驱动卡片；其 agent 走 headless/API 是**反面参照**，我们坚持 PTY 终端以保全用户的 skill 生态）。

**核心定位**：右栏场景卡 = **用户个人工作流的启动器**。点卡片 → app 把当前上下文组合进**预置模板**，注入到终端里的 claude（调用用户自己的 skill 链）→ 产物落盘并出现在"本次产物"。app 不重做能力，只做"选场景 → 注入正确 skill 指令 → 看到产物"这层。

### 0.1 设计骨架原则（贯穿全篇，务必遵守）

> **App 永远不去猜 agent 在想什么 / 干到哪了，只反应两种真实事件：① 用户显式发送的命令；② 文件系统的真实改动。** 运行态、进度、产物——全部从 `notify` 文件监听这一个真实信号源涌现，**不解析终端 TUI 文本**。

推论（后续各节都是这条的展开）：
- **不自建"AI 运行中"指示器**：流式输出本就在 claude TUI 里实时滚；App 这边的"活着"用**真实写盘事件**表达（文件脉冲 + 预览刷新）。
- **不自建权限状态机**：权限只存在于 claude TUI（用户 Shift+Tab 自己切），App 不读不演（见 §8）。
- **解耦 claude 版本**：TUI 文案每版会变，parse 必脆；只认文件事件就天然稳。

## 1. 目标 / 非目标

### 目标（MVP）
1. **心流模式布局**：阅读器 + 三块可点亮的工作台面板（文件树 / AI 工作流 / 终端），**各自独立开关**；`⌘⇧A` = 一键全开 + **窗口最大化（铺满留窗口 chrome）** 的宏，可逆、不破坏阅读器模式（§4）。
2. **场景启动器**（右栏"场景"）：注册表驱动的场景卡，**模板即数据、可编辑**；**MVP 只上 1 张卡（HTML 生成）** 验证范式。点卡片把命令**注入终端（一句话，不自动回车）**，用户在终端补参数 / 确认权限后自己回车运行（§5）。
3. **本次产物 + 预览**（右栏"预览"）：预览页**顶部一排产物 chips**（本会话 agent 生成/改动的文件，带 新建/修改 标），点 chip 切预览；**HTML 产物用 sandboxed iframe 渲染**，markdown 产物用现有预览（§6.2）。
4. **写盘 → 文件监听 → 编辑器/预览自动刷新**；**发送即存盘**（点卡片若当前文件有未保存改动，先静默保存再注入，保证 agent 读到的是你看到的）（§6.1）。
5. **改动可见**：agent 改动的文件在文件树高亮 + 在预览产物 chips 出现；落盘时对应 chip / 树节点脉冲一下（§6.2）。
6. **写竞争安全**：当前打开的文件被 agent 改动时——编辑器干净则静默重载；有未保存改动则出**非阻塞"外部已修改"条**（`查看差异 / 用 Claude 的版本 / 保留我的`），绝不静默覆盖（§6.1）。

### 非目标（MVP）
- **不重做能力本身**（润色/公众号/日报/html-ppt 全交给 skill）；app 只做场景启动器这层 surface。
- 不做 headless / 结构化输出通道（已废弃）。
- **不做选区注入**（编辑器里的"发给 claude"浮标已弃；触发入口只剩场景卡）。未来优雅路径见 §7。
- **不做参数表单**（卡片只注入一句话，`--style/--length` 等参数用户在终端自己补）。
- **不做 App 级权限开关 / 不读 TUI 模式**（权限全在终端 Shift+Tab，§8、§0.1）。
- **不做会话重起按钮**（单 session 长驻，§8.1）。
- 不做场景的图形化编辑器（直接编辑 JSON 文件即可）；MVP 不做多卡/分组管理（Phase 1.5 再加 polish/wechat/daily）。
- 不做多引擎（codex/opencode）适配（Phase 3）。
- 不做跟随模式、拖文件进终端、可点击路径、git diff 视图、会话回放、undo 快照、skills 透视、用量面板、行级 diff 高亮（Phase 2+）。

## 2. 现有可复用资产

| 资产 | 位置 |
|---|---|
| PTY 后端 | `src-tauri/src/lib.rs` `terminal_create`/`terminal_write`/`terminal_resize`/`terminal_kill`（`portable_pty`） |
| 终端前端 | `src/components/TerminalPanel.tsx`（`@xterm/xterm`）、`src/services/terminalService.ts`（`writeTerminal`） |
| 文件树 | `src/components/FileTreePanel.tsx`（已含 `dirtyPaths` 高亮） |
| 工作区 | `src/services/workspaceService.ts` + Rust `list_directory_entries` |
| 文件监听 | `src/services/documentWatchService.ts` + Rust `watch_opened_document`；`AppLayout` `lastSelfWriteRef` |
| claude 检测 | `detectAgent` + Rust `agent_detect`；`src/components/settings/AiCliSection.tsx` |
| 编辑器 | `EditorPane`（CodeMirror6）/`WysiwygEditorPane`（Vditor）；`editorCommandRef: EditorCommandHandle` |
| 预览 | `WordPaperPreviewPane` / `WechatPreviewPane`（右栏"预览"复用，扩展产物 chips + HTML iframe） |
| 右栏槽 + resizer | `AppLayout` `rightPanelMode`/`rightPanelWidth` + word-preview-resizer |
| 窗口控制 | Tauri `@tauri-apps/api/window`（`getCurrentWindow().maximize()/unmaximize()/isMaximized()`，用于 §4 最大化/还原） |
| 设置 | `settingsService.ts`（`aiClaudePath` 等） |

## 3. 删除 headless（前置）— ✅ 已完成（commit `abae51e`）
外科式移除：删 `AIWorkspacePanel` + agentService 运行路径 + Rust `agent_run_*`/`agent_session_*`/`agent_event` + AppLayout 的 ai 左槽接线、CSS `.ai-workbench-*`、i18n、settings 中 `aiResumeSessions`。**保留** `agent_detect`/`detectAgent`、`FileTreePanel`、`workspaceService`、`TerminalPanel`、watcher、`AiCliSection`（路径配置 + 版本检测）。
**codex 接力时无需重做。** typecheck/test/build/cargo 当前全绿。

## 4. 心流模式（布局编排）

### 心智模型（重要）
**心流模式不是一个独立"模式"，而是阅读器之上点亮三块工作台面板。** 三块各自独立开关，`⌘⇧A` 是把它们一次全开（+ 最大化）的便捷宏：

| 面板 | 独立开关 | 阅读器下 | 心流（⌘⇧A）下 |
|---|---|---|---|
| 文件树（左，workspace） | 树自身的收起/展开把手 | 维持现状 | 展开，**状态从阅读器沿用、不重置** |
| AI 工作流（右，`[场景\|预览]`） | **工具栏右上角独立按钮**（阅读器也能调出） | 可手动调出 | **默认展开** |
| agent 终端（底） | 工具栏"终端"按钮；**懒启动**（§8） | 可手动开 | 自动确保存在 |

- 中心编辑器在所有情况下位置稳定，面板进出不重排中心区（避免 jank）。
- `⌘⇧A` 宏：**进入** = 快照当前窗口状态 → `maximize()`（铺满留 chrome，非真全屏）→ 树/AI 工作流(展开)/终端 全开；**退出** = 还原三块到用户手动状态 + `unmaximize()` 还原窗口。完全可逆。
- 状态：`AppLayout` 新增 `flowMode: boolean`（持久化 `flowModeEnabled`）。`LeftPanelMode` 删 `'ai'`，仅 `'none' | 'workspace'`。
- 工具栏按钮：**心流模式宏按钮**（`Sparkles`/`Workflow` 图标，`⌘⇧A`）+ **AI 工作流独立开关按钮**（右上角，控制右栏显隐）；新增 i18n `toolbarFlowMode*` / `toolbarAiPanel*`（zh/en/ja）。docx 文件下禁用心流宏。

### 布局
```
┌ Toolbar（…  | AI工作流 | 心流模式 ⌘⇧A | 设置）──────────┐
├──────────┬────────────────────┬───────────────────────┤
│ 文件树    │ 编辑器(当前文档)     │ 右栏  [ 场景 | 预览 ]   │
│ (左,可收) │ (中,稳定)           │  场景: 卡片(MVP 1 张)    │
│          │                    │  预览: 顶部产物 chips    │
│          │                    │       + 渲染(md/iframe) │
├──────────┴────────────────────┴───────────────────────┤
│ agent 终端(底,懒启动)：真实交互 claude                    │
└─────────────────────────────────────────────────────────┘
```

### 右栏分段
- 新增 `flowRightTab: 'scenario' | 'preview'`，顶部分段控件切换（**两段**——原"文件列表"已并入"预览"顶部 chips，不再单列 tab）。
- `'scenario'` → `ScenarioPanel`（§5）。`'preview'` → 扩展后的预览（产物 chips + md/HTML 渲染，§6.2）。
- 复用现有右槽宽度/resizer。AI 工作流独立开关控制整个右栏显隐。

## 5. 场景启动器（右栏"场景"）

### 5.1 注册表（模板即数据、可编辑）
- 存储：`<appConfigDir>/typola/flow-scenarios.json`，首次运行写入默认 seed；提供"编辑场景"入口（按钮打开该文件）。读取失败回退内置默认。
- 类型：
```ts
export type FlowScenario = {
  id: string;            // 'html-ppt' | 'polish' | 'wechat' | 'daily-report' | ...
  label: string;         // 卡片标题，如 "HTML 生成"
  icon?: string;         // lucide 图标名
  description: string;   // 卡片副标题（一句话）
  guidance?: string;     // 选中后展示的 markdown：这个场景怎么用、走哪条 skill 链、终端里能补哪些参数
  promptTemplate: string;// 注入终端的一句话，占位符见 5.2
  skillHint?: string;    // 如 '/baoyu-slide-deck'，展示在 guidance
};
```
- **MVP seed 只 1 张**（HTML 生成；其余 Phase 1.5 再加）：

| id | label | promptTemplate（要点） | skillHint |
|---|---|---|---|
| `html-ppt` | HTML 生成 | 把 `{file}` 生成 HTML 演示，输出到 `{fileName}.html` | `/baoyu-slide-deck` |

Phase 1.5 候选 seed（结构相同，先不实现）：`polish`（humanizer）、`wechat`（`/ni-writer`）、`daily-report`。

### 5.2 占位符（点击时解析）
`{file}`=当前文件相对 workspace 路径；`{fileName}`=文件名（不含扩展）；`{workspace}`=workspace 根；`{date}`=今日 `YYYY-MM-DD`。
（无 `{selection}`——本期不做选区注入，§7。）

### 5.3 卡片交互（注入一句话，不自动回车）
- 渲染：`ScenarioPanel` 从注册表渲染 card grid（NotebookLM Studio 风）；MVP 仅 1 张。
- 点击卡片：
  1. 若有 `guidance` → 内联展开（怎么用 + skill 链 + **终端里可补哪些参数**，因为我们不做参数表单）。
  2. 主按钮 **「应用到终端」**：
     - **发送即存盘**：若 `{file}` 对应的当前文件有未保存改动 → 先静默保存（§6.1）。
     - **终端懒启动**：若无 agent 终端 → 先 `startAgentTerminal`（§8）。
     - 解析 `promptTemplate` → `agentBridge` 以 bracketed paste 把命令行**注入 claude 输入处**，**不追加 `\r`** → **焦点移到终端**。
  3. 次按钮 **「复制命令」**（可选）：拷贝解析后的命令行。
- **体感**：点一下 → 命令出现在底部终端输入行（可编辑、可补 `--style` 等参数）→ 用户按 Enter 运行 → claude 若需授权在终端原生弹、用户当场答 → 产物落盘进"本次产物"（§6.2）。透明可介入，非黑盒。

## 6. 闭环输出（写盘刷新 · 改动可见 · 本次产物）

### 6.1 写盘 → 监听 → 刷新（含写竞争安全）
复用 `documentWatchService` + `lastSelfWriteRef`。心流模式下 `onFileChanged` 命中**当前打开文件**：
- 自写（<1500ms）→ 忽略。
- 否则编辑器**无脏改动** → 自动从磁盘 reload 并 `setFile`（预览随 `file.content` 刷新，更新 `lastSavedContent`），伴随轻微"刚刚更新"一闪。
- 否则编辑器**有脏改动** → **绝不覆盖**，出非阻塞"外部已修改"条：`Claude 改了这个文件，你有未保存修改 → [查看差异] [用 Claude 的版本] [保留我的]`。
- **发送即存盘**（§5.3）从源头减少"我没存、claude 按旧版改"的脏冲突。
- 非心流模式维持现状（仅提示）。

### 6.2 改动可见 + 本次产物（预览顶部 chips）
- Rust 新增 `watch_workspace(path)`/`unwatch_workspace(path)`（`notify` Recursive，忽略 `.git`/`node_modules`/`dist`/`target`/`.worktrees`/隐藏目录），事件 `workspace_changed { paths }`（200–300ms 节流去重批量 emit）。
- 前端 `src/services/workspaceWatchService.ts`：`watchWorkspace/unwatchWorkspace/onWorkspaceChanged`。
- AppLayout 维护 `agentChangedPaths: Set<string>`（绝对路径）；心流模式 + 选定 workspace 时监听，收事件并入。落盘瞬间：对应 chip / 文件树节点**脉冲一下**（短暂高亮），这就是 §0.1 的"活着"信号。
- **文件树高亮**：`FileTreePanel` 新增 prop `agentChangedPaths?: Set<string>`，样式区别于 `dirtyPaths`。
- **本次产物 = 预览顶部 chips**：在"预览"页顶部按 `agentChangedPaths` 渲染一排 chips（文件名 + 新建/修改 + 时间）；点 chip → 切换预览渲染该文件。**列表 + 预览同屏**（不再像 mock 那样拆成两个互斥 tab）。清除时机：切换 workspace 或"清除本次产物"。
- **渲染分流**：`.md`/`.markdown` → 现有 markdown/Word/公众号预览；`.html` → **sandboxed iframe**（`sandbox="allow-scripts"`，**不给** `allow-same-origin`；产物是 agent 生成的，可能含任意 JS）；落盘 → iframe 重载 = "自动刷新"。其余类型给只读纯文本兜底。

## 7. 选区注入（已移出 MVP — 仅记录未来优雅路径）

本期**不做**选区注入（原"发给 claude"浮标已弃，触发只剩场景卡）。
**未来若要回 paragraph 级润色，优雅且零新 UI 的路径**：当用户点「应用到终端」时若编辑器**存在选区**，就把选区文本（出处 + 围栏 bracketed paste）作为 `{selection}` 拼进当前卡片命令的 context——**无需独立按钮、无两条互斥入口**（这正是 mock 评审里"两条注入路径打架"的根治法）。届时再扩展 `EditorCommandHandle.getSelection()`。MVP 不实现。

## 8. agent 终端寻址 / 启动（shell + 自动跑 claude；权限全在终端）

`TerminalPanel` 用 `forwardRef`+`useImperativeHandle` 暴露：
```ts
export type TerminalPanelHandle = {
  startAgentTerminal: (opts: { command: string; cwd?: string }) => void;
  sendText: (text: string) => void;   // 场景卡：注入命令行，不回车
  hasAgentTerminal: () => boolean;
  focusAgentTerminal: () => void;      // 注入后把焦点移到终端，便于用户补参数/回车
};
```
（无 `restartAgentTerminal`、无 `sendTextAndSubmit`——本期不重起、不自动提交。）

- **启动（懒启动）**：进心流模式、或点「应用到终端」时无终端 → 复用 `openNewTab` 起普通 shell（cwd=workspace 根，无则当前文件目录）；`ready` 后 `writeTerminal(termId, claudeCommand + '\r')`；该 tab 标 `Claude`、`isAgent=true`。
- **claudeCommand** = `settings.aiClaudePath?.trim() || 'claude'`（**不附加任何权限 flag**）。Windows 由 shell 解析 `claude.cmd`/PATH（**绕开直接 spawn `.cmd` 的坑**；tolaria 因直接 spawn 才需 cmd-shim，我们不需要）。
- **权限姿态（全在终端）**：App **不提供权限开关、不读 TUI 模式、不发 Shift+Tab**。默认普通 `claude`（保留权限提示）。用户要切 acceptEdits/plan → 自己在终端按 **Shift+Tab**（Claude Code 原生，TUI 底部显示当前模式）。term-status 可放一句**静态**提示"权限在终端里用 Shift+Tab 切"，不带状态值。绝不 `bypassPermissions`。
- **授权交互**：需要授权时**真实 claude 在终端里原生弹**（"允许编辑 foo.md？ y/n/always…"），用户在底部终端直接答。点卡片注入后由用户回车触发，命中授权则终端内暂停等答（透明可介入，不黑盒）。

### 8.1 会话连续性与 token（重要 — 实现须遵守）
- agent 终端 = **一个长驻 `claude` REPL 进程 = 一个 session**。后续追问直接在同终端继续 = 同一对话，上下文保留，**不重开、不重载**。
- **场景卡注入（§5）注入这个正在跑的同一 session**，绝不为每次动作新开 session（点完卡接着聊 = 连续对话）。
- 无"每轮重开进程"开销（那是已废弃旧 headless 的毛病）；多轮 token 由 prompt caching（重复前缀约 0.1× 计费，Claude Code 自动做）摊薄，长对话靠 `/clear` 或自动 compaction 释放。
- **唯一会重起 claude 会话的时机**：claude 自身退出，或用户手动新开终端 tab。**本期不提供"重起会话"按钮**（决策已定）；`/clear` 仅清上下文、不重起进程。

### 8.2 Agent 表面决策（已定）
MVP = **纯终端**（本 spec）。已评估并**暂缓** "Agent SDK app 原生聊天面板"（气泡 + 工具卡 + `canUseTool` 原生权限按钮，能保留全部 skill 但需自渲染全部 UI、工程量大、偏离"不要大而全"）。注意：tolaria 的漂亮面板走的是**裸 Anthropic API + 自建工具循环**，代价是丢失 skill 生态——**不要照搬该路线**。
**Phase 2 在真实终端上叠轻量 app 原生贴片**（不重写 agent 引擎、不丢 skill）：
- 权限提示检测 → 原生「允许/拒绝」按钮（向 PTY 写 `y`/`n`）
- app 原生输入框（打字 → 注入 PTY，替代直接敲 xterm）
- 运行 / 空闲 / 等待输入 状态徽章（从 PTY 输出或文件事件推断——**仍守 §0.1，不 parse 模式文本**）

若 Phase 2 贴片仍嫌糙，再评估升级到 Agent SDK 面板（届时 Design 先做 SDK spike 验证 `canUseTool` / streaming input / resume 与交互式 skill 的真实表现）。

## 9. 数据流
```
[场景卡] ─发送即存盘+解析模板→ agentBridge ─bracketed paste(不回车)→ [PTY: claude(+skill)]
                                                          ↑ 用户(补参数)按 Enter 运行
                                                          │ 写盘
[watch_opened_document]→onFileChanged→非自写→ clean:自动reload / dirty:外部已修改条 →[编辑器/预览刷新]
[watch_workspace]→workspace_changed→agentChangedPaths→[文件树高亮 + 预览顶部产物 chips(脉冲) + iframe/md 渲染]
```

## 10. 改动文件清单

**新增（前端）**：
- `src/components/ScenarioPanel.tsx` — 右栏「场景」面板（卡片 grid，MVP 1 张；含 guidance 内联展开）
- `src/services/agentBridge.ts` — bracketed paste 注入封装（注入命令行，**不回车**）
- `src/services/flowScenarioService.ts` — 注册表读写 / 默认 seed / 占位符解析
- `src/services/workspaceWatchService.ts` — `watchWorkspace` / `onWorkspaceChanged` 前端封装
- `src/types/flowScenario.ts` — `FlowScenario` 类型

**改（前端）**：
- `src/app/AppLayout.tsx` — `flowMode` + 三块面板独立开关 + `⌘⇧A` 宏（最大化/还原 + 快照）+ `flowRightTab` + 6.1 自动 reload/脏冲突条 + `agentChangedPaths` + `terminalPanelRef` + 终端懒启动调度
- `src/components/Toolbar.tsx` — 新增**心流模式宏按钮** + **AI 工作流独立开关按钮**（`data-tooltip`）
- `src/components/TerminalPanel.tsx` — `forwardRef` 暴露 `TerminalPanelHandle`（§8）+ agent 终端懒启动逻辑
- `src/components/FileTreePanel.tsx` — 新 prop `agentChangedPaths` + 区别于 `dirtyPaths` 的样式 + 落盘脉冲
- `src/components/WordPaperPreviewPane.tsx`（或新 `ArtifactPreview.tsx`）— 预览顶部**产物 chips** + 渲染分流（md / `.html` sandboxed iframe）
- `src/services/i18n.ts` — 新增 `toolbarFlowMode*` / `toolbarAiPanel*` 等键（zh/en/ja）
- `src/styles/app.css` — scenario 卡片 / 产物 chips / iframe 容器 / 右栏分段 / 脉冲动画 / "外部已修改"条样式
- `src/services/settingsService.ts` — `flowModeEnabled`（**不加** `flowAutoAcceptEdits`——权限不归 App 管）

**改（后端）**：
- `src-tauri/src/lib.rs` — 新增 `watch_workspace` / `unwatch_workspace` + `workspace_changed` 事件
- `src-tauri/capabilities/default.json` — 放行 `watch_workspace` 及 `window:allow-maximize`/`allow-unmaximize`/`allow-is-maximized`（如未放行）

**相对旧 spec 移除的项**（别再实现）：`SelectionSendButton.tsx`、`EditorCommandHandle.getSelection()`、`AiCliSection` 的 acceptEdits 开关、`flowAutoAcceptEdits` 设置、`restartAgentTerminal`/`sendTextAndSubmit`。

## 11. 验收标准

**功能层**
- `⌘⇧A` 一键点亮 文件树/编辑器/右栏[场景|预览]/agent 终端 + 窗口最大化；再按还原窗口与面板。AI 工作流按钮在阅读器下也能单独调出右栏。
- 右栏「场景」渲染 1 张 HTML 卡（来自可编辑 JSON）；点「应用到终端」→（脏则先存）命令注入终端输入行、**不自动回车**、焦点在终端；用户回车后 claude 开跑。
- 无终端时点卡片能**懒启动** claude 终端再注入。
- claude 生成 `*.html` 落盘 → 进预览顶部「本次产物」chips（脉冲）→ 点 chip 在 **sandboxed iframe** 渲染；再次落盘 iframe 自动刷新。
- claude 写回当前打开文件 → 无脏改动自动刷新；有脏改动出「外部已修改」三选项条，不覆盖。
- agent 改动文件在文件树高亮，区别于未保存高亮。
- 权限：App 无权限开关；用户在终端 Shift+Tab 自己切，授权提示在终端原生出现。
- Windows 下 claude 在 PTY 启动正常、中文宽字符正确。
- 阅读器模式（关闭心流后）行为完全不变。

**工程层**
- `npm run typecheck` / `npm test` / `npm run build` / `cargo test --manifest-path src-tauri/Cargo.toml` 全绿。
- 不引入 PR #52、`abae51e`、当前 main 已修复 bug 的回归（代码块光标、未保存确认、配色统一、编辑器→预览同步滚动等）。

## 12. 测试计划
- 单元：`flowScenarioService`（默认 seed、占位符解析 `{file}/{fileName}/{workspace}/{date}`、JSON 容错）；`agentBridge`（bracketed paste 包裹、**不含 `\r`**）。
- 集成：心流宏点亮/还原（含 maximize/unmaximize 快照还原）；AI 工作流独立开关；卡片「应用到终端」→ 发送即存盘 → 懒启动 → 注入（断言不自动提交）；6.1 reload（自写抑制 / 脏改动三选项分支）；6.2 高亮、产物 chips 更新/清除、md↔html 渲染分流。
- Smoke（Windows 重点）：claude 在 PTY 启动；bracketed paste 把命令落为**可编辑输入行**（用户可补参数后回车，不被逐行执行）；中文宽字符；`.html` 在 sandboxed iframe 正常渲染。

## 13. 风险与首个 spike

**开发第一步必做 spike**（合并在一个会话里验证,R1/R2 结论在 commit `663f7ed` / `8010912`）:
- **R1（最高）Windows `claude` 在 PTY 启动**：复用 `TerminalPanel.openNewTab` 起普通 shell（不动现有终端逻辑）→ 等 `ready` → `writeTerminal(termId, 'claude\r')`。验证：(a) TUI 起来；(b) `aiClaudePath` 路径配置生效；(c) 中文宽字符显示正确。
- **R2 注入落为可编辑输入（不自动提交）**：在已起的 claude TUI 内 `writeTerminal(termId, '\x1b[200~把 a.md 生成 HTML 演示\x1b[201~')`（**末尾不加 `\r`**）—— 验证 bracketed paste 把整段作为**一条可继续编辑的输入**落在 claude 输入行，用户随后手敲参数 + Enter 能正常提交。失败则记录 fallback（去包裹 / 仅 `\n` 等）。
- ~~R3 权限模式 Shift+Tab~~ **已删**：权限全在终端由用户手动操作，App 不发按键，无需验证。

**其他风险**:
- **R4 recursive watch 性能**：忽略 `.git`/`node_modules`/`dist`/`target`/`.worktrees` + 200–300ms 节流去重批量 emit。
- **R5 watcher ↔ 未保存改动竞态**：§6.1 脏改动三选项分支覆盖（自写抑制 1500ms + 发送即存盘 + 脏冲突条）。
- **R6 HTML iframe 安全**：sandbox 不给 `allow-same-origin`，避免 agent 生成的 HTML 越权访问应用上下文。

## 14. 分期
- **MVP**：§4–§9（心流布局[最大化+面板独立开关]、单 HTML 场景卡、注入不回车、终端懒启动、写盘刷新+发送即存盘+脏冲突条、改动可见+预览产物 chips+iframe 渲染、agent 终端、权限全在终端）。
- **Phase 1.5**：加场景卡 polish/wechat/daily（同结构）；**选区作为 context**（§7 优雅路径）。
- **Phase 2**：终端 app 原生贴片（权限按钮 / 输入框 / 状态徽章，§8.2）、行级 diff 高亮、跟随模式、拖文件进终端、可点击路径、git diff、undo 快照、`claude --resume` 项目记忆、场景图形化编辑。
- **Phase 3**：多引擎（codex/opencode）适配抽象。
