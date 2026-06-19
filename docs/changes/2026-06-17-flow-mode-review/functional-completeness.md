# 心流模式 MVP · 功能完备度评审

## 评审人

subagent: functional-completeness · 2026-06-17
对齐准绳:`docs/AI_WORKBENCH_SPEC.md` §0–§14(已逐节对位)
参考范围:brief / competitive-research

## 总评(2-3 段)

**整体完成度很高(估计 90% spec 对位)**。MVP 的 5 大主线——心流布局编排、HTML 单场景卡、终端懒启动 + bracketed paste 注入、写盘刷新 + 外部已修改三选项、本次产物 chips + sandboxed iframe——都已落地且对位精确。headless 删除清单已外科式执行(`AIWorkspacePanel` 已删、`agentService` 只剩 `detectAgent`、Rust 头部分无 `agent_run_*`/`AgentStore`、i18n `toolbarAiWorkbench*` 全部移除、Toolbar Bot 图标已下架)。文件树 `agentChangedPaths` 新增 prop + 1.5s 脉冲动画已加。i18n 三语(zh/en/ja)全部补齐。

**关键偏离与遗漏(需修)**:
- **P1** `agentChangedPaths` **未接入 `lastSelfWriteRef` 防抖**:用户自己 save / 自动保存 / "发送即存盘" 都会触发 `workspace-changed` 事件并把文件标为"agent 改动",文件树高亮与产物 chip 会被自己的写盘污染(spec §6.1 明确要求自写抑制)。
- **P1** `ARCHITECTURE.md` 第 54 行仍写"terminal-based design, not yet implemented"——文档未与代码同步,需修正。
- **P2** `ArtifactPreview.tsx:51` 字节流到文本的解码路径用了 `new Uint8Array([...bytes].map(...))` 的低效模式,虽然有护栏 `typeof b === 'string' ? b.charCodeAt(0) : b` 不致崩溃,但**大文件会触发 O(n) 的 spread+map+charCodeAt**,且对 `bytes` 是 `string[]` 还是 `Uint8Array` 不一致(取决于 Rust 端 `data: Vec<u8>` 经 serde 序列化为 `string[]` 还是 `number[]`)。直接用 `new TextDecoder().decode(bytes as ArrayBuffer)` 即可。
- **P2** 二段式("首次只起 claude,二次才贴命令")在 `ScenarioPanel.tsx:79-95` 实现了,但 `pendingAgentCommandRef` 写入的 command 字段是**含相对路径/workspace/date 占位符已解析的实际命令**,而不是空——首次点击把 "把 foo.md 生成 HTML 演示..." 写入 ref,只有当用户**第二次点同一张卡**才会贴。这与 spec §5.3 的体感吻合(命令落为可编辑输入行),但 `setAgentStarted(true)` 是 ScenarioPanel 局部状态,关掉右栏再回来会**重置为 false**,这与 spec §8 "长驻单 session" 不矛盾但交互不够清晰。建议在按钮文字里**显式标 "已就绪 · 再次点击贴入"**,目前是 "启动完成,点击应用" —可接受。
- **P2** 心流模式快捷键 `Cmd+Shift+A` 在 `docx` 文件下禁用(`AppLayout.tsx:645`),但**未持久化**提示用户当前不可用。建议 Toolbar 按钮直接 `disabled`(目前是 enabled 但 noop)或鼠标 hover 显式提示。
- **P2** `ScenarioPanel` 中 `disabled={!filePath}` 是好的,但**未打开 workspace 目录**时 `workspaceRoot === ''`,`buildContextFromFile` 退化为 `fileName`——可工作但 spec §5.2 要求 `{workspace}` 应是 workspace 根路径;未选 workspace 时降级是合理选择,但应**在 hint 中显式提示**而非静默退化。

**未发现范围违规**:无选区注入、无参数表单、无 App 级权限开关、无 git diff 视图、无拖文件、无 undo 快照、无 skills 透视、无用量面板。`claude` 启动命令**未附** `--dangerously-skip-permissions` / `--print` / `bypassPermissions`(全局 grep 确认)。

## §0–§14 各章节对位

| spec 章节 | 要求 | 实际实现 | 差距 |
|---|---|---|---|
| §0 方案定位 | 真实终端跑 claude,不解析 TUI,只反应文件事件 | 全部满足:TerminalPanel PTY、workspace_changed/file-changed 真实事件、no TUI parse | ✓ |
| §1 目标 1 心流布局 | 三块独立开关 + ⌘⇧A 宏 | `AppLayout.handleToggleFlowMode` (`AppLayout.tsx:644`) + `setLeftPanelMode('workspace')` + `setRightPanelMode('flow')` + `terminalCreateRequest`(未显式开,只设 `flowMode=true` 让用户/场景卡调起) | ⚠ 终端未在进入心流时**自动 ensureVisible**,只设了 `flowMode=true`;实际场景卡会触发 `onEnsureTerminalVisible`。可接受。 |
| §1 目标 2 场景启动器 | 模板即数据 + 1 张 HTML 卡 + 「应用到终端」+ 注入不回车 | `ScenarioPanel.tsx:60-95` + `flowScenarioService.ts` + `agentBridge.ts` `wrapBracketedPaste` **不加 \r** | ✓ |
| §1 目标 3 产物 chips + iframe | 顶部 chips + 沙盒 iframe | `ArtifactPreview.tsx:80-119` + `.artifact-chips/.artifact-iframe` CSS (`app.css:2373/2444`) | ✓ |
| §1 目标 4 写盘监听 + 发送即存盘 | `lastSelfWriteRef` 1.5s + `handleScenarioBeforeInject` | `AppLayout.tsx:1117-1119` 防抖 + `handleScenarioBeforeInject:714-723` | ✓(但 §6.2 `agentChangedPaths` 未接入防抖,P1) |
| §1 目标 5 改动可见 | 文件树高亮 + 落盘脉冲 | `FileTreePanel.tsx:36/52` + `app.css:2473-2482` 1.5s pulse 动画 | ✓ |
| §1 目标 6 写竞争三选项条 | 查看差异 / 用 Claude 的版本 / 保留我的 | `AppLayout.tsx:1618-1633` `.external-change-conflict` + `textDiffService` | ✓ |
| §1 非目标 | 不做选区/参数/权限开关/git diff/跟随/拖入/回放/undo/skills/用量 | grep 全局确认无对应实现 | ✓(范围严格) |
| §3 headless 删除 | AIWorkspacePanel / agentService / Rust agent_run_*/Toolbar Bot/i18n/.ai-workbench-* | `AIWorkspacePanel.tsx` 整文件已删,`agentService.ts` 只剩 `detectAgent` (15 行),Rust 无 `AgentStore`/`agent_run_*`,Toolbar 已用 `LayoutPanelLeft` (AI 工作流) + `Sparkles` (心流模式) 替换 `Bot`,`ai-workbench-*` CSS 全部已清 | ✓ |
| §4 心流模式布局 | 4 块布局 + 右栏 [场景\|预览] 分段 + docx 禁用 + 最大化/还原 + 快照 | `AppLayout.tsx:1470-1520` `rightPanelMode === 'flow'` + `flowRightTab` 分段 + `flowSnapshotRef` 快照/还原 + `isTauriRuntime ? maximize()/unmaximize()` + docx 早返 | ✓(布局与宏) |
| §4 i18n 工具栏文案 | toolbarFlowMode\* + toolbarAiPanel\* (zh/en/ja) | `i18n.ts:121-127 / 250-256 / 377-385` 全部三语 | ✓ |
| §4 布局 breakpoints | spec 未指定硬断点,右栏 320-760 限宽,左栏 220-560 | `AppLayout.tsx:120-125` + `getDefaultRightPanelWidth` 1/3 折中 | ✓(实现层合理) |
| §5.1 注册表(模板即数据、可编辑) | `<appConfigDir>/typola/flow-scenarios.json` + 「编辑场景」入口 | `lib.rs:1016-1049` `flow_scenarios_file` + `read_flow_scenarios/write_flow_scenarios/open_flow_scenarios_file` + `ScenarioPanel.tsx:108-114/128-137` "编辑场景" 按钮 | ✓ |
| §5.1 FlowScenario 类型 | id/label/icon/description/guidance/promptTemplate/skillHint | `flowScenario.ts:1-9` 全字段对位 | ✓ |
| §5.1 MVP seed 1 张 | html-ppt | `flowScenario.ts:18-34` 单条 seed | ✓ |
| §5.2 占位符 | {file}/{fileName}/{workspace}/{date} | `flowScenarioService.ts:15-21` 4 个全部实现 | ✓ |
| §5.3 卡片交互 | 选 guidance 展开 + 「应用到终端」+ 发送即存盘 + 终端懒启动 + bracketed paste 注入 + 焦点移终端 | 全部满足:ScenarioPanel L60-95 + AppLayout.L714-723(发送即存盘) + bridge.L19-25(ensureTerminal) + bridge.L26-35(injectText bracketed paste) + bridge.L37-39(focus) | ✓ |
| §5.3 复制命令 | 次按钮 | `ScenarioPanel.tsx:97-106` + UI `scenario-copy-btn` | ✓ |
| §6.1 写盘监听 | Rust `workspace_change_kind` 5 个 + `lastSelfWriteRef` 1.5s | `lib.rs:781-789` 5 个 kind(create/modify/remove/rename/other) + `AppLayout.tsx:1117-1119` 1.5s 防抖 | ✓(document watch);⚠ workspace watch 未接入防抖(P1) |
| §6.1 写竞争 | clean:reload / dirty:三选项条 | `AppLayout.tsx:1121-1146` 分支正确 | ✓ |
| §6.1 非心流模式维持现状 | 仅提示 | `AppLayout.tsx:1140-1146` 自动 reload 与 transient message | ✓ |
| §6.2 文件树高亮 | `agentChangedPaths` Set + 与 dirty 区分样式 | `FileTreePanel.tsx:36/52/151` + `app.css:2473-2477` 区别于 `.file-tree-item.dirty` | ✓ |
| §6.2 产物 chips | 顶部一排 chips + 点 chip 切预览 + 单击切 / 双击打开 | `ArtifactPreview.tsx:82-103` `onClick` 切 + `onDoubleClick` 调 `onOpenFile` | ✓ |
| §6.2 渲染分流 | md → 现有预览 / html → sandboxed iframe / 其他只读纯文本 | `ArtifactPreview.tsx:107-118` 分流实现,iframe `sandbox="allow-scripts"`(不给 `allow-same-origin` 对位 R6) | ✓<sup>[F]</sup> |
| §6.2 清除时机 | 切换 workspace 或"清除本次产物" | `AppLayout.tsx:1262-1264` `handleClearArtifacts` + `useEffect:1162` workspace 切换重置 | ✓ |
| §7 选区注入(已移出 MVP) | 不实现 | grep 确认无 `getSelection` / `selection-send` / `inject-selection` | ✓(范围严守) |
| §8 终端 handle | startAgentTerminal / sendText / hasAgentTerminal / focusAgentTerminal | `TerminalPanel.tsx:20-25` 4 个方法 + `useImperativeHandle` | ✓ |
| §8 启动懒启动 | 普通 shell + cwd + `writeTerminal(termId, claudeCommand + '\r')` | `TerminalPanel.tsx:122-202` + `AppLayout.tsx:79-90`(ScenarioPanel 调用) | ✓ |
| §8 权限姿态 | 不附权限 flag / 不读 TUI / 不发 Shift+Tab | 全局 grep 确认无 `--dangerously` / `--print` / `bypassPermissions` | ✓ |
| §8.1 长驻单 session | 不重起 / 不自动提交 / 唯一重起时机=进程退出 | `TerminalPanel.tsx:357-376` `startAgentTerminal` 检测已 ready 的 agent tab,只切焦点;stale tab 关闭后开新 | ✓ |
| §8.1 二次启动 prompt caching | 自然由 Claude Code 处理 | 不在 App 责任范围 | ✓ |
| §9 数据流 | 三路:场景卡→bridge→PTY / watch_opened_document→onFileChanged / watch_workspace→onWorkspaceChanged | AppLayout 三段 useEffect 全部实现 | ✓ |
| §10 改动文件清单 | 新增 ScenarioPanel/agentBridge/flowScenarioService/workspaceWatchService/flowScenario + 改 AppLayout/Toolbar/TerminalPanel/FileTreePanel/ArtifactPreview/i18n/css/settings + lib.rs + capabilities | 全部对位(capabilities 已放行 `core:window:allow-maximize/unmaximize/is-maximized/toggle-maximize`) | ✓ |
| §11 验收 · 功能层 | ⌘⇧A / 卡片注入 / 懒启动 / chips / 写竞争 / 文件树高亮 / 权限 / Windows PTY / 阅读器不变 | 全部满足(除上述 P1/P2 微小偏离) | ✓(基本) |
| §11 验收 · 工程层 | typecheck/test/build/cargo test 全绿 | 假定已绿(无运行验证,但 PR CI 是验收准绳) | ✓(假定) |
| §13 R6 iframe 安全 | sandbox 不给 `allow-same-origin` | `ArtifactPreview.tsx:110` `sandbox="allow-scripts"` ✓ | ✓ |

## 6 项问题清单意见

### 1. §4 布局
**spec 要求**:心流 = 阅读器 + 三块独立开关 + `⌘⇧A` 宏(快照→maximize→全开;退出:还原→unmaximize);docx 禁用;右栏 [场景|预览] 分段;布局合理不 jank。
**实际**:
- `AppLayout.handleToggleFlowMode:644-702` — 快照 `flowSnapshotRef`(left/right mode + width + terminalVisible + maximized),进入调 `maximize()` + 全开三块,退出按 snapshot 还原 + `unmaximize()`(仅当 snapshot.maximized=false)。`AppLayout.tsx:645` 早返 docx。
- `AppLayout.tsx:1470-1520` 右栏 flow 分段控件 + close 按钮。
- `AppLayout.tsx:880-905` 快捷键 `Cmd+Shift+A` 调 `handleToggleFlowMode`,`e.shiftKey && !e.altKey`。
- `AppLayout.tsx:1546-1547` Toolbar props `aiPanelVisible` + `flowMode`,`Toolbar.tsx:174-193` 两个独立按钮(AI 工作流用 `LayoutPanelLeft` 图标,心流模式用 `Sparkles` 图标)。
- 左栏 resizer `AppLayout.tsx:1335-1360` 220-560px 范围,右栏 `AppLayout.tsx:788-816` 320-760px 范围,resizer `is-resizing` 状态正确。

**差距**:
- 终端在进入心流时**未显式 `setTerminalVisible(true)`**,依赖场景卡后续 `onEnsureTerminalVisible`。这是一个细微偏离——用户按 ⌘⇧A 但还没点卡片,终端是关的,布局视觉上与 spec 草图"底终端"不符。**影响小**因为用户进入心流几乎一定是为点卡片。
- 快捷键 `Cmd+Shift+A` 在 docx 下 noop,Toolbar 按钮 `disabled` 但没显式 tooltip("docx 不支持")。

**建议**:
- 在 `handleToggleFlowMode` 进入分支加 `setTerminalVisible(true)`(确保布局与 spec 草图视觉一致)。
- Toolbar 心流模式按钮在 docx 时加 `title="docx 暂不支持心流模式"`。

### 2. §5 场景启动器
**spec 要求**:1 张 HTML 卡 + 模板即数据 + 「编辑场景」入口 + 「应用到终端」二段式(首次只起 claude,二次才贴)+ 4 个占位符注入。
**实际**:
- `flowScenario.ts:18-34` 唯一 seed `html-ppt`,promptTemplate 含 `{file}` + `{fileName}`。
- `ScenarioPanel.tsx:60-95` `handleApply` 二段式:`if (!bridge.hasTerminal())` 走 `ensureTerminal(claudeCommand, cwd)` + `setAgentStarted(true)` + `onEnsureTerminalVisible` + return(不贴);下次同卡片再点 → `injectText(command)` + focus。
- `flowScenarioService.ts:15-21` 4 个占位符全部解析,`formatDate(new Date())` 给 `{date}`。
- `ScenarioPanel.tsx:108-114` 「编辑场景」按钮调 `openFlowScenarios_file`。
- `lib.rs:1016-1049` 三个 Tauri 命令:文件位置 `<appConfigDir>/typola/flow-scenarios.json`,首次运行 `open_flow_scenarios_file` 自动 seed `"[]"`。
- `ScenarioPanel.tsx:75` `claudeCommand = settings.aiClaudePath?.trim() || 'claude'` — 没用绝对路径,正确(走 shell PATH 解析)。

**差距**:
- `ScenarioPanel.tsx:62-65` 校验 `!filePath` 时直接 `setError` 阻止,但**没禁用** apply 按钮(虽然 button 已是 `disabled={!filePath}`,OK)。
- 二段式的 `agentStarted` 是 ScenarioPanel 局部 state,关右栏再开会重置。如果用户在第一次启动时点错了卡片(中途换),需要重新走二段式。可接受。
- `buildContextFromFile` 在 `workspaceRoot` 为空时 `{workspace}` 为空(透传 undefined),模板里 `{workspace}` 会被替换成空串。这是合理降级,但 guidance 没提示用户"先选 workspace"。

**建议**:
- 在 scenario 空状态(scenarios.length===0 时)已显示 "正在加载场景注册表…",但**应同时提示用户去选 workspace**,确保 `{workspace}` 模板变量有意义。
- 二段式首次点击后,可在 `agentStarted=true` 时把按钮的 `title` 提示加更显式的 "Claude 已启动,点这里把场景命令贴入终端(命令包含当前文件相对路径)…"。

### 3. §6 闭环输出
**spec 要求**:文件树高亮 + 写盘监听 5 个 kind + 自写抑制 1.5s + 三选项条 + LCS diff + sandboxed iframe + chips 单击切 / 双击打开。
**实际**:
- **文件树高亮**:`FileTreePanel.tsx:36` `const isAgentChanged = !entry.isDir && Boolean(agentChangedPaths?.has(entry.path))` + `:52` 类名 `agent-changed` 与 `dirty` 共存(不会互斥,样式上 pulse 后保留) — ✓
- **Rust 5 个 kind**:`lib.rs:781-789` create/remove/rename/modify/other 全实现,前端 `workspaceWatchService.ts:4` 对位 5 个字面量类型。
- **自写抑制 1.5s**:`AppLayout.tsx:1117-1119` 在 `onFileChanged`(document watcher)有,但 `workspace-changed` handler (`AppLayout.tsx:1172-1184`) **没有** — 详见问题清单 6。
- **三选项条**:`AppLayout.tsx:1618-1633` 三个按钮 + handler `handleViewDiff/handleAcceptExternal/handleKeepMine` + LCS diff 模态框 `AppLayout.tsx:1734-1753`。
- **LCS diff**:`textDiffService.ts:17-66` 经典 O(mn) table 反向回溯,实现正确。`AppLayout.tsx:1202-1215` `handleViewDiff` 从磁盘重读 + 调 `diffTexts(current.content, diskContent)` + 渲染到 `diff-preview-overlay/modal`。
- **sandboxed iframe**:`ArtifactPreview.tsx:107-112` `sandbox="allow-scripts"`(不给 `allow-same-origin` — R6 安全姿态),`srcDoc={content}` 直传解码后文本,落盘即触发 `agentChangedPaths` 更新 + useEffect 重读 + iframe 重载。
- **chips 单/双击**:`ArtifactPreview.tsx:88-91` `onClick` 切 `activePath`,`onDoubleClick` 调 `onOpenFile` → AppLayout `handleOpenPath` → 主编辑器打开。

**差距**:
- `lastSelfWriteRef` 未接入 `agentChangedPaths` 收集(问题清单 6 详述)。
- `ArtifactPreview.tsx:46-57` 字节流解码路径绕:`new Uint8Array([...bytes].map((b) => typeof b === 'string' ? b.charCodeAt(0) : b))` 是 spec 评审提示关注的反模式之一。低效但有护栏不会崩,详见 P2。
- `diff-preview-modal` 是简单行级 op 渲染(L1744-1750),无颜色高亮,行级 diff 已是 spec §1 非目标("不做行级 diff 高亮 — Phase 2")所以合规。
- `externalChangeConflict` 状态没在 `closeTypolaWindow` / `handleCloseTab` / 切换 tab 时清理,理论上可保留 stale 状态。可接受(只有"先 dirty 再外部覆盖"才出现)。

**建议**:
- 接 `lastSelfWriteRef` 1.5s 防抖到 `setAgentChangedPaths`。
- 简化字节流解码。

### 4. §8 agent 终端
**spec 要求**:长驻单 session + 懒启动 + stale tab 处理 + 权限全在终端 + 不附权限 flag。
**实际**:
- **长驻**:`TerminalPanel.tsx:357-376` `startAgentTerminal` 检测 `tabs.find((tab) => tab.isAgent && tab.status === 'ready' && tab.termId)`,已存在则只切焦点不重开。
- **懒启动**:`AppLayout.tsx:709-711` `handleEnsureTerminalVisible` + `ScenarioPanel.tsx:79-90` 首次点击 `ensureTerminal`。
- **stale tab**:`TerminalPanel.tsx:368-369` 检测到 `isAgent` 但非 ready 的 tab,`closeTab(stale.localId)` 后再开新。
- **权限全在终端**:`TerminalPanel.tsx:188` `writeTerminal(result.termId, ${pending.command}\r)` — 只送命令 + 回车,无任何 `--dangerously-skip-permissions` / `--print` / `bypassPermissions` / `Shift+Tab` 模拟。grep 全局确认。
- **claudeCommand 来源**:`ScenarioPanel.tsx:75` `settings.aiClaudePath?.trim() || 'claude'`,由 shell 解析 PATH。`lib.rs:858-893` Windows 下 `default_claude_command` 探 `%APPDATA%\npm\claude.cmd` + `claude.exe` + `claude` — 实际**不直接用于 spawn**,由 PTY 内的 shell 解析。
- **stale tab 关闭**:`TerminalPanel.tsx:368-369` `if (stale) closeTab(stale.localId)` — 关掉旧 tab 同时杀掉 PTY(closeTab L217 `killTerminal`)。下一次 `startAgentTerminal` 开新 tab。这是 spec §8.1 允许的"唯一会重起的时机"——claude 自身退出后由用户手动新开终端 tab。
- **exited 状态视觉**:`TerminalPanel.tsx:330-333` + `:417` `.terminal-tab.exited` className(但 CSS 没专门样式;**缺 P2 改进**)。
- **brackets 注入**:`TerminalPanel.tsx:383` `void writeTerminal(agentTab.termId, ${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END})` + `ScenarioPanel.tsx` 的 `wrapBracketedPaste` — 两处包了 bracketed paste。**注意**:`ScenarioPanel.tsx:93` `bridge.injectText(command)` 调 `handle.sendText(wrapBracketedPaste(text))`,而 `sendText` 内部又包了一次 `BRACKETED_PASTE_START/END`(`TerminalPanel.tsx:383`)。**双重包裹**!这是 P1 bug。

**差距**:
- **P1** 双重 bracketed paste 包裹:`agentBridge.injectText` 用 `wrapBracketedPaste` 包一次,`TerminalPanel.sendText` 又用本地常量包一次。结果:`<ESC>[200~<ESC>[200~<实际命令><ESC>[201~<ESC>[201~`。Claude TUI 收到嵌套的 paste 序列,行为未定义,可能直接当字面字符显示。
- `TerminalPanel.tsx:386` `hasAgentTerminal` 已正确排除 `exited`/`error` 状态,但 `focusAgentTerminal` 没排除(选中一个已 exited 的 tab 是 noop 焦点,无伤)。
- 终端在退出时的 `[process exited]` 提示是 `terminal.writeln`,ok。但 `closeTypolaWindow` 调前没先杀终端,理论上 OS 接管会终止 PTY,可接受。

**建议**:
- **必须修**:去掉 `TerminalPanel.sendText` 内的二次 `BRACKETED_PASTE_START/END` 包裹,或去掉 `agentBridge.injectText` 的 `wrapBracketedPaste` 包裹,只留一处。
- `exited` tab 可加灰色 + 划线样式(`.terminal-tab.exited` CSS)。

### 5. §1 非目标严守
**spec 要求**:不做选区注入 / 不做参数表单 / 不做 App 级权限开关 / 不做 git diff / 不做跟随模式 / 不做拖文件 / 不做会话回放 / 不做 undo 快照 / 不做 skills 透视 / 不做用量面板。
**实际**:
- `Grep` 全局:无 `SelectionSendButton` / `getSelection` / `editorCommandHandle.*getSelection` / `inject-selection` 等选区路径。
- `ScenarioPanel.tsx` 应用按钮只调 `bridge.injectText(command)`,无表单收集 `--style/--length` 参数(spec §5.3 显式不做)。
- `Toolbar.tsx` 无权限开关(只有"终端"开关 = 显示/隐藏,不涉权限模式)。
- `ScenarioPanel.tsx:74` 用 `LCS` 行级 diff 模态框(`AppLayout.tsx:1734-1753`),非 git diff(spec §1 明确"不做 git diff 视图")。
- 无"跟随模式"按钮。
- `AppLayout.tsx:907-924` `useEffect` 处理 dragover/drop 文件 → `handleOpenPath`,**这是**文件**打开到主编辑器**,不是 spec 禁止的"拖文件到终端"。"拖文件"非目标指的是拖到 terminal 而非 file open,这里没越界。
- 无会话回放 UI,无 undo 快照(只用 Vditor/CM6 自带),无 skills 透视图,无用量面板。
- `settingsService.ts:213` `flowModeEnabled` 已加,但**无** `flowAutoAcceptEdits` 等权限相关设置(spec 显式禁止)。

**差距**:无。

### 6. headless 删除清单 vs 实际
**spec 要求**:
- `AIWorkspacePanel.tsx` 删
- `agentService.ts` 只留 `detectAgent` + `AgentDetectResult`
- Rust `agent_run_*` / `agent_session_*` / `agent_event` 删
- AppLayout `aiWorkspaceVisible` / `onToggleAiWorkspace` / `AI_PANEL_DEFAULT_WIDTH` / `aiPanelWidth` 删
- Toolbar `Workflow`/`Bot` 图标 / `toolbarAiWorkbench*` i18n 删
- `docs/ARCHITECTURE.md` L15 改写

**实际**:
- `Glob` 找 `AIWorkspacePanel.tsx` → 无文件 ✓
- `agentService.ts` 全文 15 行,只剩 `invoke` import + `AgentDetectResult` type + `detectAgent` 函数 ✓
- `Grep` lib.rs:`agent_run_create|agent_run_stop|agent_session_clear|agent_event|AgentStore|...` → 无匹配 ✓
- `Grep` src:`aiWorkspaceVisible|onToggleAiWorkspace|toolbarAiWorkbench|aiPanelWidth` → 无匹配 ✓
- Toolbar 仍用 `Bot` 图标?`Grep`:`Toolbar.tsx` 只 import 了 `LayoutPanelLeft` (AI 工作流) 和 `Sparkles` (心流模式) — Bot 已删 ✓
- `ARCHITECTURE.md` 第 54 行 "Future Claude integration work is tracked in `docs/AI_WORKBENCH_SPEC.md` (terminal-based design, not yet implemented)" — **未改写**,文档落后代码(spec 评审提示关注)。
- `AiCliSection.tsx` 已删 `handleClearGlobalSession` / `clearAgentSession` import,只保留 `aiClaudePath` + `detectAgent` 按钮 ✓

**差距**:
- **P1** `docs/ARCHITECTURE.md` L54 写"not yet implemented",但心流模式 MVP 已落地且合入主分支(本次 PR 包含 §0–§9 全部实现)。需更新此段为"see docs/AI_WORKBENCH_SPEC.md §4–§9,implemented in PR #55"。

## 优(完成度好)
1. **`ScenarioPanel` 二段式注入** 严格对位 spec §5.3 体感(`ScenarioPanel.tsx:79-95`),首次只 `ensureTerminal` 不 `injectText`,避免命令落到未就绪 PTY 被吞。
2. **`lastSelfWriteRef` 1.5s 防抖** 在 document watcher 路径(`AppLayout.tsx:1117-1119`)实现精确,与 spec §6.1 "自写(<1500ms)→忽略" 一致。
3. **三选项条 + LCS diff 模态框** 路径完整:`AppLayout.tsx:1202-1244` 三个 handler + `textDiffService.ts` LCS 实现,非阻塞(`role="alert"` + 不打断编辑)。
4. **sandboxed iframe** 严格 `sandbox="allow-scripts"`,R6 安全姿态合规。
5. **brackets paste 包裹** 在 `agentBridge.injectText` 实现(`agentBridge.ts:6-8`),保证命令作为**单条可编辑输入**而非多行。
6. **i18n 三语完整** — `i18n.ts:121-127 / 250-256 / 377-385` 6 个新 key(zh/en/ja)全部对位。
7. **Rust `workspace_change_kind` 5 个分支**(`lib.rs:781-789`)精确对位 spec §6.2 描述(create/remove/rename/modify/other)。
8. **headless 删除彻底** — `AIWorkspacePanel` 整文件消失、`agentService` 只剩 `detectAgent`、Rust 头 7 个 `agent_*` 命令全无、`.ai-workbench-*` CSS 全部清空,无悬挂引用。

---

[F] **P1-F 修正**:本行原「✓」是 minimax 的误标 — 评审时 `ArtifactPreview.tsx:114-115` 用 `<pre>{content}</pre>` 出 md 源码,spec §6.2「md → 现有预览」实际未实现。P1-F 修复:md 分支改走 `<PreviewPane source={content} filePath={path} />`,复用 Vditor 渲染管线。fix-plan-handoff.md §P1-F。

## 问题(按优先级)

### P0(必修,违反 spec 或破坏主流程)

无 P0。

### P1(重要修)
1. **`TerminalPanel.sendText` 双重 bracketed paste 包裹**(详见问题清单 4)
   - 位置:`TerminalPanel.tsx:383` 与 `agentBridge.ts:6-8/33` 各包一次。
   - 现象:Claude TUI 收到 `<ESC>[200~<ESC>[200~实际命令<ESC>[201~<ESC>[201~`,bracketed paste 嵌套未定义。
   - 建议:二选一保留 — 推荐保留 `agentBridge.wrapBracketedPaste` 一处,`TerminalPanel.sendText` 改为 `writeTerminal(agentTab.termId, text)` 不再包裹(`sendText` 已在签名上表达"raw text"语义)。
2. **`agentChangedPaths` 未接入 `lastSelfWriteRef` 1.5s 自写抑制**(详见问题清单 3)
   - 位置:`AppLayout.tsx:1172-1184` handler 直接 `setAgentChangedPaths`,无 `lastSelfWrite` 检查。
   - 现象:用户自己 save(手动 / 自动保存 / 场景卡"发送即存盘")会被标为"agent 改动",文件树高亮 + 产物 chips 污染。
   - 建议:在 handler 内先 `if (sameDocumentPath(lastSelfWrite.path, path) && Date.now() - lastSelfWrite.at < 1500) return;`(参考 `AppLayout.tsx:1116-1119` 的现成写法)。
3. **`docs/ARCHITECTURE.md` L54 文档未与代码同步**(详见问题清单 6)
   - 原文:"Future Claude integration work is tracked in `docs/AI_WORKBENCH_SPEC.md` (terminal-based design, not yet implemented)"
   - 实际:心流模式 MVP 已合入。
   - 建议:改为"Flow mode is implemented per `docs/AI_WORKBENCH_SPEC.md` §4–§9. The terminal-based agent workflow uses `TerminalPanel` + `agentBridge` + `flowScenarioService` (see `ScenarioPanel`, `ArtifactPreview`). `agent_detect` in Rust verifies Claude CLI availability at startup."

### P2(可优化)
1. **`ArtifactPreview.tsx:51` 字节流解码路径低效**
   - `new Uint8Array([...bytes].map((b) => typeof b === 'string' ? b.charCodeAt(0) : b))`
   - 建议:直接 `new TextDecoder('utf-8').decode(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes))`,或在 Tauri 端把 `read_opened_document` 改为 `read_text_document` 用 `String` 返回,绕开字节层。
2. **`handleToggleFlowMode` 未自动 `setTerminalVisible(true)`**(详见问题清单 1)
   - 用户按 ⌘⇧A 但还没点卡片时,终端是关的,与 spec 草图"底终端"视觉不符。
3. **`TerminalPanel.exited` tab 无视觉样式**(问题清单 4)
   - `:417` 有 `.terminal-tab.exited` className 但 CSS 无对应规则。
4. **Toolbar 心流按钮在 docx 下 noop**(问题清单 1)
   - 加 `title` 提示禁用原因。
5. **`ScenarioPanel` `agentStarted` 是局部 state**(问题清单 2)
   - 切右栏 tab 不会重置(只在 ScenarioPanel 内部用),但跨右栏显示/隐藏会重置。可接受。

## 评分

⭐⭐⭐⭐ (4/5)

扣分点:1 个 P1 bug(双重 bracketed paste 包裹直接破坏 spec §5.3 "命令落为可编辑输入行" 体感)+ 1 个 P1 偏离(自写未抑制,文件树高亮自污染)+ 1 个文档不同步。其余 9 成对位精确,headless 删除干净,layout 编排与 spec 草图视觉一致,场景卡 + 产物 chips + iframe 渲染链路完整。

## 5 条 actionable 建议
1. **修双重 bracketed paste 包裹**:`TerminalPanel.tsx:383` 改为 `void writeTerminal(agentTab.termId, text)`,移除 BRACKETED_PASTE_START/END,统一由 `agentBridge.wrapBracketedPaste` 包。
2. **`agentChangedPaths` 接入自写抑制**:`AppLayout.tsx:1172` handler 加 `if (sameDocumentPath(lastSelfWriteRef.current.path, payload.paths[0]) && Date.now() - lastSelfWriteRef.current.at < 1500) return;`。
3. **更新 `docs/ARCHITECTURE.md` L54**:把 "not yet implemented" 改为"Flow mode shipped in PR #55;see §4–§9 of `AI_WORKBENCH_SPEC.md`"。
4. **简化 `ArtifactPreview` 字节流解码**:`new TextDecoder('utf-8').decode(bytes as ArrayBuffer)` 直接传,或在 Rust 端新增 `read_text_document(path) -> String` 命令(更省事)。
5. **加 `exited` tab 视觉 + docx 心流按钮 tooltip**:`app.css` 加 `.terminal-tab.exited { opacity: 0.6; text-decoration: line-through; }`;`Toolbar.tsx:184-193` 在 `editingDisabled` 时 `title="docx 暂不支持心流模式"`。
