# Typola AI 文档工作台 Spec（终端方向 · 心流模式）

> **状态**：已移交开发。前置（headless 移除）已完成。MVP 待 codex 实施。
> **配套文档**：
> - [brief.md](changes/2026-06-14-work-package/brief.md) — 方向 / 范围 / 验收
> - [headless-removal.md](changes/2026-06-14-work-package/headless-removal.md) — 移除清单（已执行，留作历史）
> - [handoff.md](changes/2026-06-14-work-package/handoff.md) — **给 codex 的移交 prompt（启动开发会话用）**

## 当前基线（截至 2026-06-16）

✅ **已就绪**（前置全部完成，可直接基于当前 main 接力）：
- headless AI 工作台原型已外科式移除（commit `abae51e`），保留 `agent_detect` 等地基
- 文件树（`FileTreePanel`）+ 多 tab + 未保存改动三按钮对话框（`UnsavedChangesDialog`）+ 编辑器→预览同步滚动 + WYSIWYG 代码块焦点态 + 右键菜单（`EditorContextMenu`）+ 自定义 tooltip + 新建文件按钮
- 跑通 `npm run typecheck` / `npm test`(222) / `cargo test`(9) / `cargo check`

🚧 **本期 MVP**（codex 接力实施，按本 spec §4–§9）：心流模式布局 + 场景启动器 + 件1 选区注入 + 写盘刷新 + 改动可见 + 本次产物列表 + agent 终端启动/权限。

## 0. 方案与定位

**旧方案（废弃）**：无头 spawn `claude -p` + JSONL 解析 + 自定义聊天 UI（`AIWorkspacePanel`）。问题：等于重写 Claude Code 前端且更差、丢失交互授权/plan/slash/skill、每轮重开进程、格式漂移。

**本方案**：**心流模式 = 以真实文档编辑器为中心的 agent 驾驶舱**。真实交互 `claude` 跑在内嵌 PTY 终端（复用 `portable_pty` + `@xterm/xterm`）。能力（润色/公众号/日报/html-ppt）交给终端里的 **skill**，**app 只做“贴合”那层**：左文件树、中编辑器、右**场景启动器/预览**、底 agent 终端。结果回写不靠解析输出，靠 **agent 写盘 → 文件监听 → 编辑器/预览刷新 + 产物列表**。

参考：NotebookLM（右栏 Studio 场景卡 + 产物列表）、fanbox-windows（嵌真实终端跑 agent）、tolaria（`aiAgents.ts` 注册表驱动卡片；其 agent 走 headless/API 是**反面参照**，我们坚持 PTY 终端以保全用户的 skill 生态）。

**核心定位**：右栏场景卡 = **用户个人工作流的启动器**。点卡片 → app 把当前上下文组合进**预置模板**，自动注入并运行到终端里的 claude（调用用户自己的 skill 链）→ 产物落盘并出现在“本次产物”。app 不重做能力，只做“选场景 → 注入正确 skill 指令 → 看到产物”这层。

## 1. 目标 / 非目标

### 目标（MVP）
1. **心流模式布局**：文件树 + 编辑器 + 右栏 `[场景 | 预览]` 分段 + 底部自动跑 `claude` 的终端；同窗口，可逆，不破坏阅读器模式。
2. **场景启动器**（右栏“场景”）：注册表驱动的场景卡（默认 4 个：总结润色 / 公众号写作 / 日报 / html-ppt），**模板即数据、可编辑**；点击卡片**自动注入 + 自动回车**到 agent 终端运行（可见、可介入）。
3. **本次产物列表**：右栏“场景”下方列出本会话 agent 生成/改动的文件，点击打开。
4. **件1 选区注入**：编辑器/预览选区 → 一键以“出处+围栏(bracketed paste)”注入终端，**纯注入、无预设、不自动回车**，指令由用户输入。
5. **写盘 → 文件监听 → 编辑器/预览自动刷新**。
6. **改动可见**：agent 改动的文件在文件树高亮。

### 非目标（MVP）
- **不重做能力本身**（润色/公众号/日报/html-ppt 全交给 skill）；app 只做场景启动器这层 surface。
- 不做 headless / 结构化输出通道（已废弃）。
- 不做场景的图形化编辑器（直接编辑 JSON 文件即可）；不做任意多场景/分组管理。
- 不做多引擎（codex/opencode）适配（Phase 3）。
- 不做跟随模式、拖文件进终端、可点击路径、git diff 视图、会话回放、undo 快照、skills 透视、用量面板（Phase 2+）。
- **件1 选区注入保持纯注入无预设**（“预设”只存在于右栏场景启动器，二者分工不同，勿混）。

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
| 右栏槽 + resizer | `AppLayout` `rightPanelMode`/`rightPanelWidth` + word-preview-resizer |
| 设置 | `settingsService.ts`（`aiClaudePath` 等） |

## 3. 删除 headless（前置）— ✅ 已完成（commit `abae51e`）
按 [headless-removal.md](changes/2026-06-14-work-package/headless-removal.md) 外科式移除：删 `AIWorkspacePanel` + agentService 运行路径 + Rust `agent_run_*`/`agent_session_*`/`agent_event` + AppLayout 的 ai 左槽接线、CSS `.ai-workbench-*`、i18n、settings 中 `aiResumeSessions`。**保留** `agent_detect`/`detectAgent`、`FileTreePanel`、`workspaceService`、`TerminalPanel`、watcher、`AiCliSection`（路径配置 + 版本检测）。
**codex 接力时无需重做。** typecheck/test/build/cargo 当前全绿。

## 4. 心流模式（布局编排）

### 状态与入口
- `AppLayout` 新增 `flowMode: boolean`（持久化到 settings `flowModeEnabled`）。
- 工具栏新增**心流模式开关**按钮（建议 `Sparkles` 或 `Workflow` 图标，与现有 toolbar 风格一致），快捷键 `Ctrl/Cmd+Shift+A`；新增 i18n `toolbarFlowMode*`（zh/en/ja）。原 AI 按钮 + `toolbarAiWorkbench*` i18n 在 headless 移除时已删除。
- docx 文件下禁用。

### 布局
```
┌ Toolbar（心流模式开关）───────────────────────────────┐
├──────────┬────────────────────┬───────────────────────┤
│ 文件树    │ 编辑器(当前文档)     │ 右栏  [ 场景 | 预览 ]   │
│ (左)     │ (中)               │  场景: 卡片grid          │
│          │                    │       + 本次产物列表     │
│          │                    │  预览: Word/公众号渲染   │
├──────────┴────────────────────┴───────────────────────┤
│ agent 终端(底)：真实交互 claude                          │
└─────────────────────────────────────────────────────────┘
```
- 开启心流模式（一键编排）：`leftPanelMode='workspace'`、右栏显示（默认“场景”tab）、`terminalVisible=true` 且确保 agent 终端存在（§9）。`main-content` 加 class `flow-mode`。
- 关闭：还原为用户手动 toggle 的现状，不强制关闭面板。**完全可逆**。
- `LeftPanelMode` 删 `'ai'`，仅 `'none' | 'workspace'`。

### 右栏分段
- 新增 `flowRightTab: 'scenario' | 'preview'`（仅心流模式生效），顶部分段控件切换。
- `'scenario'` → 渲染 `ScenarioPanel`（§5）。`'preview'` → 复用现有 `WordPaperPreviewPane`/`WechatPreviewPane`（保留其内部 word/wechat 子切换；非心流模式时右栏行为不变）。
- 复用现有右槽宽度/resizer。

## 5. 场景启动器（右栏“场景”）

### 5.1 注册表（模板即数据、可编辑）
- 存储：`<appConfigDir>/typola/flow-scenarios.json`，首次运行写入默认 4 个；提供“编辑场景”入口（按钮打开该文件）。读取失败回退内置默认。
- 类型：
```ts
export type FlowScenario = {
  id: string;            // 'polish' | 'wechat' | 'daily-report' | 'html-ppt' | ...
  label: string;         // 卡片标题，如 "公众号写作"
  icon?: string;         // lucide 图标名
  description: string;   // 卡片副标题（一句话）
  guidance?: string;     // 选中后展示的 markdown：这个场景怎么用、走哪条 skill 链
  promptTemplate: string;// 占位符见 5.2
  autoRun?: boolean;     // 默认 true：注入后自动回车
  skillHint?: string;    // 如 '/ni-writer'，仅展示在 guidance
};
```
- 默认 4 个 seed（用户可改，默认即接入用户 skill 链）：

| id | label | promptTemplate（要点） | skillHint |
|---|---|---|---|
| `polish` | 总结润色 | 总结并润色 `{file}`（或 `{selection}`），保持原意，输出更清晰流畅 | humanizer |
| `wechat` | 公众号写作 | 用我的公众号风格，把 `{file}` 写成长文；走调研→角度→成文→排版→配图 | `/ni-writer` |
| `daily-report` | 日报生成 | 扫描 `{workspace}` 今日({date})改动 / git log，生成日报到 `daily/{date}.md` | — |
| `html-ppt` | html/ppt 生成 | 把 `{file}` 生成 HTML 演示，输出到 `{fileName}.html` | `/baoyu-slide-deck` |

### 5.2 占位符（点击时解析）
`{file}`=当前文件相对 workspace 路径；`{fileName}`=文件名（不含扩展）；`{selection}`=当前选区文本（无则空）；`{workspace}`=workspace 根；`{date}`=今日 `YYYY-MM-DD`。

### 5.3 卡片交互（自动注入 + 自动回车）
- 渲染：`ScenarioPanel` 从注册表渲染 card grid（NotebookLM Studio 风）。
- 点击卡片：
  1. 若该卡有 `guidance` → 内联展开显示（如何在终端应用 + skill 链）。
  2. 主按钮 **「运行」**：解析 `promptTemplate` → 经 `agentBridge` 以 bracketed paste 注入 agent 终端 → **自动追加 `\r`** 运行（`autoRun!==false` 时）。次按钮 **「仅插入」**：注入但不回车（同件1）。
  3. 若无 agent 终端 → 先 `startAgentTerminal`（§9）再运行；若 claude 忙 → 提示稍后或排队（MVP 简单提示即可）。
- **体感**：点一下即在底部终端自动开跑；产物落盘后进“本次产物”（§6.2）。claude 若请求权限/追问，终端在底部，用户一眼介入（透明可介入，非黑盒）。

## 6. 闭环输出（写盘刷新 · 改动可见 · 本次产物）

### 6.1 写盘 → 监听 → 刷新
复用 `documentWatchService` + `lastSelfWriteRef`。心流模式下 `onFileChanged` 命中当前文件：自写（<1500ms）→ 忽略；否则编辑器无脏改动 → 自动从磁盘 reload 并 `setFile`（预览随 `file.content` 刷新，更新 `lastSavedContent`）；有脏改动 → 提示二选一「重新加载/保留我的」。非心流模式维持现状（仅提示）。

### 6.2 改动可见 + 本次产物列表
- Rust 新增 `watch_workspace(path)`/`unwatch_workspace(path)`（`notify` Recursive，忽略 `.git`/`node_modules`/`dist`/`target`/`.worktrees`/隐藏目录），事件 `workspace_changed { paths }`（200–300ms 节流去重批量 emit）。
- 前端 `src/services/workspaceWatchService.ts`：`watchWorkspace/unwatchWorkspace/onWorkspaceChanged`。
- AppLayout 维护 `agentChangedPaths: Set<string>`（绝对路径）；心流模式 + 选定 workspace 时监听，收事件并入。
- **文件树高亮**：`FileTreePanel` 新增 prop `agentChangedPaths?: Set<string>`，用区别于 `dirtyPaths` 的样式标记。
- **本次产物列表**：`ScenarioPanel` 底部，按 `agentChangedPaths` 渲染（文件名 + 相对路径 + 新建/修改 + 时间），点击 `onOpenFile` 打开。清除时机：切换 workspace 或“清除本次产物”操作。

## 7. 件1 · 选区注入（纯注入，与场景卡区分）

| 维度 | 件1 选区 | 场景卡 |
|---|---|---|
| 入口 | 编辑器/预览选区浮动按钮 + 快捷键 | 右栏场景卡「运行」 |
| 内容 | 出处+围栏选区 | 解析后的模板 |
| 回车 | **不自动回车**（你输指令） | **自动回车**（autoRun） |
| 预设 | 无 | 有（模板/skill） |

- 扩展 `EditorCommandHandle`：加 `getSelection(): {text; fromLine?; toLine?} | null`。CodeMirror 用 `state.selection`+`doc.lineAt`；Vditor 优先 `editor.getSelection()`（已存在的 API），回落 `window.getSelection()`。
- `agentBridge`：组装 ```text path:Lx-Ly\n<选区>\n```，bracketed paste（`\x1b[200~`…`\x1b[201~`），件1 不加 `\r`。
- 注入目标经 `TerminalPanel` handle（§8）。

## 8. agent 终端寻址 / 启动 / 权限（shell + 自动跑 claude）

`TerminalPanel` 用 `forwardRef`+`useImperativeHandle` 暴露：
```ts
export type TerminalPanelHandle = {
  startAgentTerminal: (opts: { command: string; cwd?: string }) => void;
  sendText: (text: string) => void;          // 件1：注入不回车
  sendTextAndSubmit: (text: string) => void; // 场景卡：注入 + \r
  hasAgentTerminal: () => boolean;
  restartAgentTerminal: (opts) => void;       // 仅 claude 退出后重起（权限切换用 sendText 发 Shift+Tab，不重起会话）
};
```
- **启动**：心流模式确保 agent 终端 → 复用 `openNewTab` 起普通 shell（cwd=workspace 根，无则当前文件目录）；`ready` 后 `writeTerminal(termId, claudeCommand + '\r')`；该 tab 标 `Claude`、`isAgent=true`。
- **claudeCommand** = `settings.aiClaudePath?.trim() || 'claude'`（+ 权限 flag，见下）。Windows 由 shell 解析 `claude.cmd`/PATH（**绕开直接 spawn `.cmd` 的坑**；tolaria 因直接 spawn 才需 cmd-shim，我们不需要）。
- **权限姿态**：默认 **保留权限提示**（普通 `claude`，不 bypass）。心流模式开关 **「自动接受编辑(acceptEdits)」** 走 **会话内实时切换、不重起**：向 PTY 发送 **Shift+Tab（back-tab `\x1b[Z`）** 即可在交互 TUI 内循环到 acceptEdits（Claude Code 原生支持，TUI 底部显示当前模式）。绝不自动放开任意命令（不 `bypassPermissions`）。默认 OFF。实现：开关只 `sendText('\x1b[Z')`，**当前模式以终端底部 TUI 指示为准，MVP 不自建模式状态机**（避免与 TUI 不同步）；确切按键随 Claude Code 版本，**R1 spike 验证**。
- **授权交互（MVP）**：需要授权时，**真实 claude 在终端里原生弹权限提示**（如"允许编辑 foo.md？ y/n/always…"），用户在底部终端直接回答。点场景卡自动跑时若命中授权 → 终端内暂停等你答（透明可介入，不会黑盒乱改）。Phase 2 把该提示检测成原生「允许/拒绝」按钮（§8.2）。

### 8.1 会话连续性与 token（重要 — 实现须遵守）
- agent 终端 = **一个长驻 `claude` REPL 进程 = 一个 session**。后续追问直接在同终端继续 = 同一对话，上下文保留，**不重开、不重载**。
- **场景卡运行（§5）与件1 选区注入（§7）都注入这个正在跑的同一 session**，绝不为每次动作新开 session（点完场景接着聊 = 连续对话）。
- 无"每轮重开进程"开销（那是已废弃旧 headless 的毛病）；多轮 token 由 prompt caching（重复前缀约 0.1× 计费，Claude Code 自动做）摊薄，长对话靠 `/clear` 或自动 compaction 释放。
- **唯一会重起 claude 会话的时机**：用户手动新开终端（或 claude 自身退出）。**权限模式切换不重起**——Shift+Tab 在会话内切换（§8）；`/clear` 也不重起（仅清当前上下文）。

### 8.2 Agent 表面决策（已定）
MVP = **纯终端**（本 spec）。已评估并**暂缓** "Agent SDK app 原生聊天面板"（气泡 + 工具卡 + `canUseTool` 原生权限按钮，能保留全部 skill 但需自渲染全部 UI、工程量大、偏离"不要大而全"）。注意：tolaria 的漂亮面板走的是**裸 Anthropic API + 自建工具循环**，代价是丢失 skill 生态——**不要照搬该路线**。
**Phase 2 在真实终端上叠轻量 app 原生贴片**（不重写 agent 引擎、不丢 skill）：
- 权限提示检测 → 原生「允许/拒绝」按钮（向 PTY 写 `y`/`n`）
- app 原生输入框（打字 → 注入 PTY，替代直接敲 xterm）
- 运行 / 空闲 / 等待输入 状态徽章（从 PTY 输出或模式推断）

若 Phase 2 贴片仍嫌糙，再评估升级到 Agent SDK 面板（届时 Design 先做 SDK spike 验证 `canUseTool` / streaming input / resume 与交互式 skill 的真实表现）。

## 9. 数据流
```
[场景卡] ─解析模板→ agentBridge ─bracketed paste + \r→ [PTY: claude(+skill)]
[选区] ─getSelection→ agentBridge ─bracketed paste（无\r）→ [PTY: claude] ←用户输指令+回车
                                                              │ 写盘
[watch_opened_document]→onFileChanged→非自写→自动reload→[编辑器/预览刷新]
[watch_workspace]→workspace_changed→agentChangedPaths→[文件树高亮 + 本次产物列表]
```

## 10. 改动文件清单

**新增（前端）**：
- `src/components/ScenarioPanel.tsx` — 右栏「场景」面板（卡片 grid + 本次产物列表）
- `src/components/SelectionSendButton.tsx` — 编辑器/预览选区浮动按钮
- `src/services/agentBridge.ts` — bracketed paste 注入封装（件1 不回车 / 场景卡带回车）
- `src/services/flowScenarioService.ts` — 注册表读写 / 默认 seed / 占位符解析
- `src/services/workspaceWatchService.ts` — `watchWorkspace` / `onWorkspaceChanged` 前端封装
- `src/types/flowScenario.ts` — `FlowScenario` / `FormatAction` 类型

**改（前端）**：
- `src/app/AppLayout.tsx` — `flowMode` 状态 + 编排 + `flowRightTab` + 件1 触发 + 6.1 自动 reload + `agentChangedPaths` + `terminalPanelRef`
- `src/components/Toolbar.tsx` — 新增心流模式开关按钮（在现有按钮组中,使用 `data-tooltip`）
- `src/components/TerminalPanel.tsx` — `forwardRef` 暴露 `TerminalPanelHandle`（§8）+ agent 终端启动逻辑 + 权限 flag
- `src/components/FileTreePanel.tsx` — 新 prop `agentChangedPaths` + 区别于 `dirtyPaths` 的样式
- `src/types/editorCommands.ts` — `EditorCommandHandle` 加 `getSelection()`
- `src/components/EditorPane.tsx` / `src/components/WysiwygEditorPane.tsx` — 实现 `getSelection`
- `src/services/i18n.ts` — 新增 `toolbarFlowMode*` 等键（zh/en/ja）
- `src/styles/app.css` — 加 scenario 卡片 / 产物列表 / 右栏分段 / 选区浮动按钮样式
- `src/services/settingsService.ts` — `flowModeEnabled`、`flowAutoAcceptEdits`
- `src/components/settings/AiCliSection.tsx` — 加「自动接受编辑(acceptEdits)」开关（可选,与 §8 一致）

**改（后端）**：
- `src-tauri/src/lib.rs` — 新增 `watch_workspace` / `unwatch_workspace` + `workspace_changed` 事件
- `src-tauri/capabilities/default.json` — 若新命令需放行

## 11. 验收标准

**功能层**
- 心流模式一键点亮 文件树/编辑器/右栏[场景|预览]/agent 终端；agent 自动跑起交互 claude。
- 右栏「场景」渲染 4 个默认卡（来自可编辑 JSON）；点卡片自动注入+回车，终端开跑；产物落盘后进「本次产物」，点击打开。
- 编辑 JSON 后场景卡随之变化；可把 `/ni-writer` 等 skill 接入模板。
- 件1 选区注入：出处+围栏出现在 claude 输入处、不自动回车；用户输指令回车后处理。
- claude 写回当前文件 → 编辑器/预览自动刷新（无脏改动）；有脏改动给二选一。
- agent 改动文件在文件树高亮，区别于未保存高亮。
- 权限默认保留权限提示；开启「自动接受编辑」=向 PTY 发 Shift+Tab（不重起会话，§8）。
- Windows 下 claude 在 PTY 启动正常、中文宽字符正确。
- 阅读器模式（关闭心流后）行为完全不变。

**工程层**
- `npm run typecheck` / `npm test` / `npm run build` / `cargo test --manifest-path src-tauri/Cargo.toml` 全绿。
- 不引入 PR #52、`abae51e`、当前 main 已修复 bug 的回归（代码块光标、未保存确认、配色统一、编辑器→预览同步滚动等）。

## 12. 测试计划
- 单元：`flowScenarioService`（默认 seed、占位符解析、JSON 容错）；`agentBridge`（件1 无回车 / 场景卡带回车 / bracketed paste）；`getSelection`。
- 集成：心流模式编排与分段；卡片运行→注入；6.1 reload（自写抑制/脏改动分支）；6.2 高亮与产物列表更新/清除。
- Smoke（Windows 重点）：claude 在 PTY 启动；bracketed paste + 回车在 claude TUI 正确提交不被逐行执行；中文宽字符；acceptEdits 重起生效。

## 13. 风险与首个 spike

**开发第一步必做 spike**（合并在一个会话里验证）:
- **R1（最高）Windows `claude` 在 PTY 启动**：复用 `TerminalPanel.openNewTab` 起普通 shell（不动现有终端逻辑）→ 等 `ready` → `writeTerminal(termId, 'claude\r')`。验证：(a) TUI 起来；(b) `aiClaudePath` 路径配置生效；(c) 中文宽字符显示正确。
- **R2 注入 + 自动提交**：在已起的 claude TUI 内 `writeTerminal(termId, '\x1b[200~hello\x1b[201~\r')` —— 验证 bracketed paste 包裹多行内容 + 末尾 `\r` 能让 TUI 把整段当一次输入提交。失败则记录 fallback（去包裹 / 末尾双回车 / 仅 `\n` 等）。
- **R3 权限模式 Shift+Tab 切换**：`writeTerminal(termId, '\x1b[Z')` 验证 TUI 底部状态从 "normal" → "acceptEdits" → "plan" 循环切换。

**Spike 报告**：在 `docs/changes/2026-06-14-work-package/spike-notes.md` 记录三条结论（OK / fallback 内容 / 阻断），用户确认后再进 §4–§9 实施。

**其他风险**:
- **R4 recursive watch 性能**：忽略 `.git`/`node_modules`/`dist`/`target`/`.worktrees` + 200–300ms 节流去重批量 emit。
- **R5 watcher ↔ 未保存改动竞态**：§6.1 脏改动分支覆盖（自写抑制 1500ms + 脏改动二选一）。

## 14. 分期
- **MVP**：§3–§9 全部（删 headless、心流布局、场景启动器、件1、写盘刷新、改动可见+产物列表、agent 终端+权限）。
- **Phase 2**：**终端 app 原生贴片（权限按钮 / 输入框 / 状态徽章，见 §8.2）**、跟随模式、拖文件进终端、可点击路径、git diff、undo 快照、`claude --resume` 项目记忆、场景图形化编辑。
- **Phase 3**：多引擎（codex/opencode）适配抽象。
