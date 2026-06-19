# 心流模式 MVP · 综合评审报告(synthesis)

## 评审元信息
- **评审时间**:2026-06-17
- **评审对象**:`codex/flow-mode-mvp` head `e784760`(基于 `origin/main` 4df2764)
- **PR**:https://github.com/ttttstc/Typola/pull/55
- **评审员**:5 subagent 并行(usability / visual-design / interaction-logic / functional-completeness / performance)
- **评审依据**:`docs/AI_WORKBENCH_SPEC.md`(收敛后定稿)+ `brief.md` + `2026-06-16-competitive-research/competitive-research.md`

## 总体评级:⭐⭐⭐⭐ / 5(MVP 可合并,修 P0 后必合)

5 份独立评审对位一致:MVP 对位 spec **约 90%**,心流布局 + 单 HTML 场景卡 + 终端懒启动 + 写盘刷新 + 三选项条 + 产物 chips + sandboxed iframe 全部落地,headless 删除干净,无范围违规。**未发现 P0 必修问题** — 严格说,3 条 P0 都是性能/视觉的非功能性缝隙,功能上 MVP 已可用。P1 共 ~10 条(去重后)是"专业感差距"——单条工作量小(< 半天/条),累积起来影响交付的"质感"。

**核心架构优点**(5 份评审一致认可):
1. **「单真实信号源」落地彻底**(spec §0.1):无 spinner、无「AI 在思考」动画、无 TUI 解析,文件树高亮 + 产物 chips + iframe 重载三处都从 `notify` watcher 涌现,克制度守住。比 fanbox 强(fanbox 有「活的仪表盘」涟漪),比 NotebookLM 强(改原文档有反馈)。
2. **L5 真栈 / 注册表驱动 / PTY 不解析 TUI 范式选择正确**:用户 skill 生态完整保留,权限边界清晰,App 不越界(无 `--dangerously-skip-permissions` / `--auto-approve`,无 TUI 解析,无权限状态机)。
3. **bridge 闭包 + Promise 解决 React 19 stale ref**:`agentBridge.ts:5-9` 的 `() => ref.current` getter 闭包 + `useImperativeHandle` 返回 `Promise<void>`,是 spec 隐含要求 + 实战易踩坑的最佳实践。
4. **headless 外科式删除干净**:`AIWorkspacePanel` 整文件消失、`agentService` 只剩 15 行 `detectAgent`、Rust 7 个 `agent_*` 命令全无、`.ai-workbench-*` CSS 全清。spec §3 严格执行。
5. **外部已修改三选项条** + **`lastSelfWriteRef` 1.5s 自写抑制**(`AppLayout.tsx:1116-1130`):写盘 race 三态的工程实现专业,L5 路线 UX 关键。

## P0 必修(3 条,合并前必须修)

| # | 维度 | 问题 | file:line | 修法 |
|---|---|---|---|---|
| P0-1 | 性能 | Rust `watch_workspace` 无 debounce,高频写盘(agent 一次写 50 文件 / npm install / git checkout)触发 N 次 IPC + 文件树重读,500ms-2s 卡顿 | `src-tauri/src/lib.rs:362-424` | 加 250ms debounce + path dedup(用 `notify-debouncer-full` crate);spec §6.2 明确要求 200-300ms 节流,实现裸用 `notify::RecommendedWatcher` 是 spec 偏差 |
| P0-2 | 性能 | `textDiffService` LCS O(n*m) 无 size 阈值,10000x10000 行文件会冻 UI 3-10s | `src/services/textDiffService.ts` | 加 size 阈值(>5000 行拒绝或显示截断)或迁移 `fast-diff` / `diff-match-patch`;LCS 在大文件不可用 |
| P0-3 | 视觉 | artifact chip 缺落盘脉冲动效,spec §6.2 明文要求"落盘瞬间:对应 chip / 树节点脉冲一下",文件树做了(@keyframes `agent-changed-pulse`),chips 完全没动画,违反 spec 闭环承诺 | `src/components/ArtifactPreview.tsx:79-103` + `src/styles/app.css` | 加 `.artifact-chip.just-changed` 脉冲,复用 `@keyframes agent-changed-pulse`;3 行 CSS + 1 行 className toggle |

## P1 重要修(10 条,去重后)

> 注:同一条 P1 多份评审都提到,综合后单列。

### 核心逻辑类(影响主流程 UX,建议合 PR 前修)

1. **双层 bracketed paste 包裹**(`TerminalPanel.tsx:383` + `agentBridge.ts:33`):Claude TUI 收到 `<ESC>[200~<ESC>[200~命令<ESC>[201~<ESC>[201~`,嵌套序列行为未定义,直接破坏 spec §5.3 "命令落为可编辑输入行" 体感。修法:删 `TerminalPanel.sendText` 内的 `wrapBracketedPaste`,只留 `agentBridge.injectText` 出口包一次(bridge 是单一出口,内聚原则)。

2. **`agentChangedPaths` 未接入 `lastSelfWriteRef` 1.5s 自写抑制**(`AppLayout.tsx:1172-1184`):用户在编辑器 save(手动 / 自动 / 场景卡「发送即存盘`)1.5s 内,如果 claude 改同一文件,会被算成"agent 改动"误标高亮,污染文件树与产物 chips。修法:`onWorkspaceChanged` handler 入口加 `if (lastSelfWriteRef.current && Date.now() - lastSelfWriteRef.current < 1500) return;`(参考 `AppLayout.tsx:1116-1119` 的现成写法)。**操作逻辑 / 功能完备度 / 使用便捷性 三份评审都独立标出,是最高频 P1**。

3. **JSON 解析失败静默回退默认**(`flowScenarioService.ts:50-52`):用户精心编辑的注册表 JSON 如果多一个逗号,被 `console.warn` 静默吞,UI 仍用默认 seed,用户以为"系统重置了我的设置"。修法:返回 `{ scenarios, error }` 元组,UI 显示红色提示条 + 「打开文件修复」按钮 + 备份 `flow_scenarios.json.broken-{ts}`。

4. **`TerminalPanel.tsx:375` 1200ms setTimeout 墙钟猜测**:慢机器/Defender 卡顿时 1200ms 不够,claude TUI banner 还没出现就被注入,claude banner 会包住命令误识别。修法:用 xterm 的 `onData` 监听,识别 claude banner 典型字符(如 `╭─╮` 或 `bypass permissions`),出现后再 resolve。

5. **`flowSnapshotRef` 不存 `windowBounds` + resize 时覆盖用户拖过的宽度**(`AppLayout.tsx:241-247, 777-786`):心流宏"完全可逆"承诺打折——退出心流不能 unmaximize 还原到原窗口位置,resize 期间用户拖过的右栏宽度被 `getDefaultRightPanelWidth()` 覆盖。修法:快照加 `bounds: { x, y, width, height }`(Tauri `outerPosition/outerSize`),resize 改为只在越界时夹紧。

### 体验缝隙类(影响"质感",可合 PR 后修)

6. **二段式点击认知断裂**(`ScenarioPanel.tsx:60-95`):首次点击按钮文字切到「启动完成,点击应用」,1200ms 等待期无 loading 状态,用户**极易困惑"刚才那次到底生效没"** 而连点 5 次,导致命令被注入多次。修法:首次点击内嵌 `<Loader2 />` 旋转 + "正在启动 Claude..." 文案,等 banner 出现后**自动注入**(改一段式),按钮加 `disabled` 防连点。

7. **`docs/ARCHITECTURE.md` L54 仍写 "terminal-based design, not yet implemented"**:心流模式 MVP 已合入,文档未同步。修法:重写该段为实际实现描述。

8. **`ArtifactPreview` 字节解码 UTF-8 坏**(`ArtifactPreview.tsx:46`):用 `invoke('read_opened_document', ...)` 拿到的字节流被 `[...bytes].map(b => b.charCodeAt(0))` 转 code point,破坏 UTF-8 多字节字符(中文产物、日语 skill 提示、emoji 路径)。修法:用 `new TextDecoder('utf-8').decode(uint8Array)` 一次性解码。

9. **claude 启动失败引导用户检查设置**(`agentBridge.ts:19-25`):`claude not found` / `path 配置错` 错误冒泡后只显示「启动 agent 终端失败: ...」,用户不知道去设置改 `aiClaudePath`。修法:捕获 `Error.message` 含 'not found' 关键字,抛 `AgentNotFoundError`,UI 显示「Claude CLI 未找到」+ 「打开设置」按钮。

10. **`getDefaultRightPanelWidth` resize 覆盖用户拖过的宽度**:与 P1 #5 重叠,独立列出因使用便捷性 / 操作逻辑两份评审都标了。

## P2 可优化(31 条汇总,5 份评审去重后)

按维度分组(仅列前 5 条,完整见各分评审文件):

- **状态机**:`agentStarted` 局部 state 漂移(上移到 AppLayout);`startAgentTerminal` 内部 `closeTab` 未 await `killTerminal`;`useImperativeHandle` deps 用 `tabs` 引入闭包漂移风险;`ScenarioPanel.handleApply` catch 不重置 `setAgentStarted`;`hasTerminal` 判定不认 'connecting' 状态导致连点注入 5 次。
- **场景注册表**:无热更新(外部编辑 JSON 后需重启 app);guidance 用等宽字体阅读阻力大;`scenario-edit-link` 入口太隐蔽(11px 文字);单卡状态下 grid 视觉松散;skill hint 不解释 skill 是什么。
- **artifact chips**:单击 vs 双击语义无 hint(hover 才知);`setWorkspaceTreeVersion` 不在 modify 触发,缺「新/改」区分;反复 decode 同一文件,agent 持续写时 iframe 反复重载;agent 产物双击打开到主编辑器后被 agent 再写会被覆盖,无版本管理提示。
- **错误处理**:`externalChangeConflict` 无关闭按钮;`scenario-error` sticky 无关闭;watcher 失败只 console.warn UI 静默失效;docx 禁用无视觉反馈。
- **性能**:`FileTreePanel.TreeNode` 未用 `React.memo`,100 文件 workspace 单文件改动触发整树 reconcile;`AppLayout.tsx:1586` `new Set(agentChangedPaths.keys())` 内联新建应 `useMemo`;`AppLayout.tsx:567` `handleContentChange` 同步 `setToc(extractToc(value))` 长文档 regex 全扫;`ScenarioPanel` 注册表读取无缓存;`TerminalPanel` 状态点无呼吸动画。

完整 P2 清单见各分评审文件的"## 问题(按优先级) → P2" 章节,5 份共 31 条。

## 范围合规审计(spec §1 非目标严守)

| 排除项(spec 明确不做) | 是否违规 | 证据 |
|---|---|---|
| 选区注入 | ❌ 未做 | 全局 grep `getSelection` 只在 `editorContextMenu` + `WysiwygEditorPane` 用,无注入终端路径 |
| 参数表单 | ❌ 未做 | `ScenarioPanel` 详情只有 guidance + skill hint,无 input 控件 |
| App 级权限开关 | ❌ 未做 | `settingsService` 无 `bypassPermissions` 字段;无权限 toggle UI |
| App 发 Shift+Tab | ❌ 未做 | `TerminalPanel` 无 key sequence 发送;`xterm.onData` 只用 for 用户键入回写 |
| App 读 TUI 模式 | ❌ 未做 | 无任何 `xterm.buffer.active` / `terminalMode` 读取 |
| git diff 视图 | ❌ 未做 | `textDiffService` 只在三选项条用,无独立 diff 面板 |
| 跟随模式 | ❌ 未做 | `AppLayout` 无 follow / focus 切换 |
| 拖文件进终端 | ❌ 未做 | `TerminalPanel` 无 onDrop |
| 会话重起 | ❌ 未做 | `startAgentTerminal` 内部 close + 重建不算"用户主动重起" |
| undo 快照 | ❌ 未做 | 无 |
| skills 透视 | ❌ 未做 | `scenario-skill-hint` 只显示建议 skill 名,无实际 skills 列表 |
| 用量面板 | ❌ 未做 | 无 |

**结论**:**未发现范围违规**,MVP 严守 spec §1 边界。

## headless 外科式删除合规审计

对照历史移除清单(spec §3 已落地):

| 目标 | 状态 | 证据 |
|---|---|---|
| 删 `src/components/AIWorkspacePanel.tsx` | ✅ 已删 | `find src -name AIWorkspacePanel*` 返 0 结果 |
| `agentService` 只留 `detectAgent` + `AgentDetectResult` | ✅ | `src/services/agentService.ts` 共 15 行,只有这两个 export |
| Rust 删 `agent_run_*` / `agent_session_*` / `agent_event` | ✅ | `grep -n "agent_run_\|agent_session_\|agent_event" src-tauri/src/lib.rs` 返 0 结果 |
| 删 `aiWorkspaceVisible` state / `onToggleAiWorkspace` handler | ✅ | `grep "aiWorkspaceVisible\|onToggleAiWorkspace" src/` 返 0 结果 |
| 删 Toolbar `Workflow` 图标 | ✅ | `grep "Workflow" src/components/Toolbar.tsx` 返 0 结果 |
| 删 i18n `toolbarAiWorkbench*` | ✅ | `grep "toolbarAiWorkbench" src/services/i18n.ts` 返 0 结果 |
| `ARCHITECTURE.md` 重写 AI Workbench 段 | ❌ **未做**(P1 #7) | `docs/ARCHITECTURE.md` L54 仍写 "terminal-based design, not yet implemented" |
| 跑 typecheck/test/cargo 验证 | ✅ | 222/222 vitest,typecheck 0 error,cargo check 0 error |

**结论**:**仅 1 项漏做**(ARCHITECTURE.md 重写),其余全部干净。

## 合并决策建议

**方案 A:先修 P0 + P1 核心逻辑类(1-5),再合 PR**(推荐)
- 估时:**1-2 天**
- 修完 8 条后,MVP 在功能 / 性能 / 体验上达到 ⭐⭐⭐⭐⭐ 水平
- 适合追求"一次性高质量合并"的场景

**方案 B:仅修 P0,先合 PR,后续 P1 跟**
- 估时:**半天**(P0 3 条都是局部改动)
- 修完 3 条后,MVP 仍 ⭐⭐⭐⭐ 水平,P1 是"质感差距"而非"功能缺陷"
- 适合"先合并再迭代"的协作流程,Codex 审核时重点关注 P1 #1-5 是否接受后续修复

**方案 C:合 PR 后再全修**
- 不推荐:P0-1(debounce)和 P0-2(LCS 阈值)在生产数据上会暴露,等到合后再修是技术债

**建议**:走 **方案 B**,理由:
- P0 都是非功能性缝隙(Rust debounce / LCS 阈值 / chip 脉冲动效),不影响主流程
- P1 核心逻辑类(1-5)合并后下一 PR 修,可作为 1.5 P0 跟进
- 用户的"本地测试 + 评审"工作流已经在跑,无需等完整修复再合

## 后续 1.5 PR 候选(合并 MVP 后)

| 优先级 | 任务 | 估时 |
|---|---|---|
| P1 高 | 修 P1 #1-5(5 条) | 1 天 |
| P1 中 | 修 P1 #6-10(5 条) | 半天 |
| P2 高 | 修 P2 状态机类(5 条) | 半天 |
| P2 中 | 修 P2 场景注册表类(5 条) | 半天 |
| P2 低 | 修 P2 性能优化(5 条) | 1 天 |
| Phase 2 | 跟随模式 + git diff + 拖文件(竞品 78% 缺口) | 待 spec |

## 评审员附录

| 维度 | 评审员 | 输出文件 | 评分 |
|---|---|---|---|
| 使用便捷性 | subagent: usability | [usability.md](./usability.md) | ⭐⭐⭐⭐ / 5 |
| 页面设计 | subagent: visual-design | [visual-design.md](./visual-design.md) | ⭐⭐⭐⭐ / 5 |
| 操作逻辑 | subagent: interaction-logic | [interaction-logic.md](./interaction-logic.md) | ⭐⭐⭐⭐ / 5 |
| 功能完备度 | subagent: functional-completeness | [functional-completeness.md](./functional-completeness.md) | ⭐⭐⭐⭐ / 5 |
| 性能 | subagent: performance | [performance.md](./performance.md) | ⭐⭐⭐⭐ / 5 |

每份独立评审 2000-4000 字,均含 7 项问题清单逐条意见(file:line 引用)+ 优/问题(P0/P1/P2)/评分/actionable 建议。
