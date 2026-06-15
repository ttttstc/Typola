# 删除清单 · 外科式移除 headless AI 工作台（移交 codex）

> 配套 [docs/AI_WORKBENCH_SPEC.md](../../AI_WORKBENCH_SPEC.md) §3。
> 行号以 2026-06-14 当前代码为准，codex 执行时以实际为准。

## 原则
**外科式**：删 headless 执行路径 + 自定义聊天 UI；**保留**新 spec 要复用的地基（文件树 / workspace / claude 检测 / 终端 / 文件监听）。删完编译、测试全绿，无悬挂引用、无孤儿 CSS / i18n。

> 本清单只「删旧」。心流模式新接线（spec §4–§8）另行实现，可同 PR 也可后续。AI 按钮位删除后由心流模式开关接管。

---

## A. 前端 TypeScript

### A1. 整文件删除
- `src/components/AIWorkspacePanel.tsx`

### A2. `src/services/agentService.ts` —— 只留检测
- **保留**：`invoke` import、`AgentDetectResult`、`detectAgent`。
- **删**：`listen` / `UnlistenFn` import（L2）；类型 `AgentRunCreateResult`（L11）、`AgentEventPayload`（L18）、`CreateAgentRunInput`（L29）；函数 `createAgentRun`（L43）、`stopAgentRun`（L55）、`clearAgentSession`（L59）、`onAgentEvent`（L65）、`stableHash`（L69）。

### A3. `src/components/settings/AiCliSection.tsx` —— 留检测，删会话
- import 去掉 `clearAgentSession`（L3，保留 `detectAgent` / `AgentDetectResult`）。
- 删 `handleClearGlobalSession`（L29–36）及其按钮 / 「清空会话」UI。
- 若存在「会话恢复开关」「默认工作目录策略」等 headless-only 设置 UI，一并删（**保留 Claude 路径输入 + 版本检测**）。

### A4. `src/components/Toolbar.tsx` —— 删 AI 按钮
- props 删 `aiWorkspaceVisible`（L33）、`onToggleAiWorkspace`（L39）；从解构（L52–53）移除。
- 删 AI 按钮 `<button>`（L164–173，`Bot` 图标）。
- `Bot` 图标 import 若仅此处用 → 删。

### A5. `src/app/AppLayout.tsx` —— 拆 ai 左槽
- import 删 `AIWorkspacePanel`（L32）。
- `LeftPanelMode`（L95）去掉 `'ai'` → `'none' | 'workspace'`。
- 删常量 `AI_PANEL_DEFAULT_WIDTH`（L113）；state `aiPanelWidth` / `setAiPanelWidth`（L201）、`aiWorkspaceVisible` / `setAiWorkspaceVisible`（L210）。
- `applyOpenedFile`（L312–313）、`handleSwitchTab`（L349–350）：删 docx 分支里 `setAiWorkspaceVisible(false)` 与 `mode === 'ai' ? 'none' : mode` 收起逻辑。
- 删 `handleToggleAiWorkspace`（L559–566）；`handleToggleWorkspacePanel`（L571）里的 `setAiWorkspaceVisible(false)` 删。
- 快捷键 `Shift+A`（L727）删；keydown 依赖数组（L746）移除 `handleToggleAiWorkspace`。
- main-content className `'ai-workbench-open'`（L1000）删。
- `handleLeftPanelResizerPointerDown`：L1053 三元 `mode === 'workspace' ? workspacePanelWidth : aiPanelWidth`、L1062 `else setAiPanelWidth`、L1075 依赖 `aiPanelWidth` → 简化为仅 workspace（左槽只剩文件树）。
- Toolbar 调用处 props `aiWorkspaceVisible`（L1205）、`onToggleAiWorkspace`（L1211）删。
- 删整个 `{!isDocx && leftPanelMode === 'ai' && (...)}` 渲染块（L1260–1283）。

---

## B. Rust（`src-tauri/src/lib.rs`）

- **保留**：`agent_detect`（L251）、`AgentDetectRequest`、`AgentDetectResult`、claude 版本检测 helper（约 L1040–1065，`agent_detect` 依赖它，**勿删**）。
- **删结构体**：`AgentStore`（L30）、`AgentRunCreateRequest`（L54）、`AgentSessionClearRequest`（L64）、`AgentRunCreateResult`（L118）、`AgentSessionRecord`（L149）、`AgentEventPayload`（emit 用的 struct 定义）。
- **删命令**：`agent_run_create`（L270–415）、`agent_run_stop`（L417–435）、`agent_session_clear`（L437–）。
- **删 headless 私有 helper**：`emit_agent_status`（L1067）、`emit_agent_text`（L1083）、`read_agent_stdout`（L1102）、`read_agent_stderr`（L1113）、`parse_claude_jsonl_text`（L1120–）、session 读写 helper（约 L1221、L1233）。
- 删 `.manage(AgentStore::default())`（L764）。
- `invoke_handler`：移除 `agent_run_create` / `agent_run_stop` / `agent_session_clear`（L796–798）；**保留** `agent_detect`（L795）。
- 删除后按编译器提示清理不再使用的 import（`BufReader` / `BufRead` / `std::process::{Child, ChildStdout, ChildStderr}` 等）。⚠️ `std::process::Command` 可能仍被版本检测 helper 使用，勿误删。

> `capabilities/default.json` 无 agent 命令条目，无需改动（已确认）。

---

## C. CSS（`src/styles/app.css`）
- 删所有 `.ai-workbench-*` 规则（约 L2081–2408 区间，以实际为准）；确认无其它组件复用这些 class。

## D. i18n（`src/services/i18n.ts`）
- `toolbarAiWorkbenchTitle` / `toolbarAiWorkbenchLabel` 三处（zh L58–59、en L174–175、ja L288–289）：**重命名/复用为心流模式开关文案**（spec §4）；若本步彻底删 AI 按钮则一并删除这些键。

## E. 文档
- `docs/ARCHITECTURE.md` L15：改写为「终端方向 / 心流模式」，不再指向 `AIWorkspacePanel` + `agentService` 运行路径。
- `CHANGELOG.md`：若有 headless AI 工作台的未发布条目，相应调整。

---

## F. 保留清单（勿删）
`detectAgent` / `agent_detect` / `AgentDetectRequest` / `AgentDetectResult`、`FileTreePanel`、`workspaceService` + `list_directory_entries`、`TerminalPanel` + 终端 Rust 命令、`documentWatchService` + `watch_opened_document`、`AiCliSection`（路径配置 + 版本检测）、`settings.aiClaudePath`、claude 版本检测 helper。

## G. 验证（全绿才算完成）
```
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```
- TS 无悬挂引用；Rust 无 unused 警告。
- `src/app/AppLayout.test.tsx` 无 AI 工作台引用（已确认），跑通即可。
```
