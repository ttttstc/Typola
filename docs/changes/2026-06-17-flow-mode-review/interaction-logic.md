# 心流模式 MVP · 操作逻辑评审

## 评审人
subagent: interaction-logic · 2026-06-17

## 总评

Typola 心流模式 MVP 的操作逻辑整体达到 ⭐⭐⭐⭐ / 5,核心状态机设计合理、时序控制基本到位、与 spec §4/§5/§6/§8 的承诺对位清楚。最大的优点是「App 不解析 TUI,只反应用户命令 + 文件事件」的克制贯穿所有面板——`TerminalPanel` 不读 TUI 模式、不发 Shift+Tab,`AppLayout` 不做权限状态机,所有"运行态"都从 `notify` 文件监听涌现。这是 spec §0.1 单真实信号源原则的最严格落地。

最大漏洞集中在三处:**(a) 双层 bracketed paste 包裹**(`agentBridge.injectText` 用 `wrapBracketedPaste` 包一次,`TerminalPanel.sendText` 又包一次)——Claude TUI 收到嵌套序列行为未定义,直接破坏 spec §5.3 "命令落为可编辑输入行" 的体感;**(b) `agentChangedPaths` 未接入 `lastSelfWriteRef` 1.5s 自写抑制**——用户在编辑器里 save 完 1.5s 内,如果 claude 改的是同一文件,会被算成"agent 改动"误标高亮,污染文件树与产物 chips;**(c) 注册表 JSON 解析失败静默回退**(`flowScenarioService.ts:50-52` `console.warn` 吞错)——用户精心编辑的 JSON 被静默回退到默认 seed,完全无感知。13 个 P2 主要集中在"状态机并发边界"和"UX 细枝末节",工作量小但每条都是「交付后会被问起来需要解释」的瑕疵。

## 7 项问题清单意见

### 1. 状态机一致性
**现状**:
- `AppLayout` 顶层持有 `flowMode` / `terminalVisible` / `rightPanelMode` / `flowRightTab` / `agentStarted`(在 `ScenarioPanel` 局部) / `agentChangedPaths` / `externalChangeConflict` / `flowSnapshotRef`,共 8 个相关 state。
- `ScenarioPanel` 额外持 `agentStarted`(局部),控制二段式点击的按钮文字切换。
**问题**:
- `agentStarted` 是 `ScenarioPanel` 的 local state,但其语义是"全局 PTY 是否在运行"。如果同一个 `ScenarioPanel` 实例被卸载重挂(useEffect cleanup → 重读注册表),`agentStarted` 丢失而 PTY 实际仍 ready,用户会卡在"已就绪"假象。
- `flowSnapshotRef` 与 `flowMode` 状态存在"打开心流但 snapshot 为 null"的可能:首次开启心流时 snapshot 写入,但如果 `handleToggleFlowMode` 在 `isMaximized()` resolve 之前被取消(组件 unmount),snapshot 写入但 flowMode 仍是 true。
**建议**:
- `agentStarted` 上移到 `AppLayout`,通过 `bridge.hasTerminal()` 实时查询,避免局部 state 漂移。
- `handleToggleFlowMode` 用单一 `isTogglingRef` 锁,异步期间忽略后续触发;`flowSnapshotRef` 写入用 `useLayoutEffect` 保证在 commit 阶段就位。

### 2. 「应用到终端」二段式点击的状态机
**现状**:
- `ScenarioPanel.tsx:60-95` `handleApply`:`if (!bridge.hasTerminal())` → 只调 `ensureTerminal` + `setAgentStarted(true)`;否则 `setAgentStarted(false)` + `injectText(command)`。
- `TerminalPanel.tsx:357-376` `startAgentTerminal`:`pendingAgentCommandRef` + 1200ms setTimeout。
**问题**:
- 用户连点 5 次:`setAgentStarted(true)` 之后 5 次都会走 `!bridge.hasTerminal()` 分支吗?`hasAgentTerminal()` 判定 `'ready' || 'connecting'`,connecting 状态会返 true → 5 次都走 injectText 路径 → 命令被注入 5 次。
- 中间 claude 退出(exited):`hasAgentTerminal` 返 false,`!bridge.hasTerminal()` true → 走 ensureTerminal → 调 `startAgentTerminal` → 内部检查 stale tab → 关闭 + 重建。这条链路**没有 `setAgentStarted(false)` 复位**——用户上次点完按钮停在"启动完成,点击应用",但点的时候实际是"重建"流程,UI 不会更新。
- `TerminalPanel.tsx:375` 的 1200ms setTimeout 是墙钟时间,慢机器/Defender 卡顿时 1200ms 不够,claude TUI 还没出 banner 就注入,banner 会包住命令。
**建议**:
- `hasTerminal` 判定加 `'connecting'` 时也返 true(防连点 5 次),并在 connecting 状态时 `disabled` 按钮 + spinner。
- `startAgentTerminal` 改为「等 PTY ready 事件 + claude banner 出现字符」再 resolve,替代 setTimeout。xterm 的 `onData` 已有,可在 banner 模式(典型 `╭──╯` 字符)出现时手动 resolve。
- 桥接层的 `hasTerminal` 改为订阅式(`useSyncExternalStore`),避免 React state 漂移。

### 3. bridge 闭包时序
**现状**:
- `agentBridge.ts:5-9` `createAgentBridge(() => ref.current)` getter 闭包,避免 stale ref。
- `startAgentTerminal` 调 `handle.startAgentTerminal({ command, cwd })`,内部走 `openNewTab` + setTimeout 1200ms。
**问题**:
- `ScenarioPanel.handleApply` 不 await `ensureTerminal` 的 resolve——只 fire-and-forget。如果 ensureTerminal 抛错(PTY 启动失败),`setAgentStarted(true)` 不会被设,但 try/catch 里 `setError` 又被 set,用户看到"启动失败" + 按钮还是"应用到终端"——这个状态机可能短暂进入"error 态但按钮文本无变化"。
- `startAgentTerminal` 内部 `await openNewTab(...)` + `await new Promise(r => setTimeout(r, 1200))` 之后才 resolve。如果 `openNewTab` 创建 PTY 失败(抛 Error),`pendingAgentCommandRef` 不会被清,下一次 `startAgentTerminal` 拿到旧 pending 命令注入。
- `closeTab(stale.localId)`(`TerminalPanel.tsx:368-370`)在关闭旧 tab 时调用 `killTerminal`,但**未等 kill 完成**就 await `openNewTab` 启动新 tab——Tauri 端 `portable_pty` 清理可能有顺序依赖,新 PTY 与旧 PTY 同 cwd 可能冲突。
**建议**:
- `ensureTerminal` 的 catch 分支前重置 `setAgentStarted(false)`,按钮回退到初始态。
- `startAgentTerminal` 入口先清 `pendingAgentCommandRef.current = null`,避免注入旧命令。
- `closeTab` 改成 async,等 `killTerminal` resolve 再 `openNewTab`。
- 桥接层用 `useSyncExternalStore` 取代 React state 触发 re-render,避免 setState 漂移。

### 4. 文件写入 race
**现状**:
- `AppLayout.tsx:1116-1119` `lastSelfWriteRef` 1.5s 自写抑制;`AppLayout.tsx:1172-1184` `onWorkspaceChanged` 把路径塞 `agentChangedPaths`。
**问题**:
- **`lastSelfWriteRef` 没接 `agentChangedPaths`**——用户自己 save(手动/自动)走的 `setLastSelfWriteRef`,但 `onWorkspaceChanged` 走 `setAgentChangedPaths`,两条路**互不通信**。用户在编辑器里按 Ctrl+S,1.5s 内 claude 改同一文件,`agentChangedPaths` 会被标"agent 改动" + 文件树脉冲 + 产物 chip 出现——但实际改动是用户自己。**这是报告里最强的 P1 之一**。
- `setWorkspaceTreeVersion` 只在 `create/remove/rename` 触发(`AppLayout.tsx:1181-1183`),`modify` 不触发文件树重读——这逻辑正确,但 `agentChangedPaths` 在 modify 时仍入栈,文件树节点会高亮(因为 `dirtyPaths` set 变了),但 `useEffect` 不会重读目录,所以**新文件能看见,旧文件改名看不见**(可能不是 bug,但需要确认 spec 意图)。
- `externalChangeConflict` 触发条件是「文件被外部改 + 用户有脏改动」(`AppLayout.tsx:1116-1129`),但**自写抑制 `lastSelfWriteRef` 在外部修改路径上也生效**——用户 save 完 1.5s 内 claude 改同一文件,既不触发 auto-reload(被自写抑制)也不触发 conflict 条(被自写抑制)——文件**静止不动**直到 1.5s 后才 auto-reload。这中间用户可能在编辑,**1.5s 内的 1.5 倍延迟丢字符**。
**建议**:
- `onWorkspaceChanged` 入口检查 `if (lastSelfWriteRef.current && Date.now() - lastSelfWriteRef.current < 1500) return;`——**让自写抑制真正生效**。
- 自写抑制改用「**只抑制 auto-reload,不清 conflict 条触发**」:用户 save → 1.5s 内 claude 改同一文件 → 仍触发 conflict 条(让用户知道有外部变化),用户选"用我的" 即可,不会被静默覆盖。
- 文件树 modify 时不重读目录但需要 pulse 节点(已有 `agent-changed-pulse` 关键帧),检查 `FileTreePanel` 的 `dirtyPaths` 触发逻辑是否覆盖 modify。

### 5. 场景卡的命令拼装
**现状**:
- `flowScenarioService.ts:15-21` `resolveFlowScenarioTemplate`:`{file}` / `{fileName}` / `{workspace}` / `{date}` 4 个变量,4 次 `replace`。
- `flowScenarioService.ts:77-101` `buildContextFromFile`:相对路径计算 + baseName 取名。
**问题**:
- 路径含空格/中文:`{file}` 直接 inject 到 PTY,claude TUI 通常能 handle,但 `cwd` 拼到 `createTerminal` 是 backend 命令行,Windows 路径含空格需 `"${cwd}"` 包起来。当前 `ScenarioPanel.tsx:76-77` 只 `cwd = workspaceRoot ?? filePath.split('/').slice(0,-1).join('/')` 直接传,**没有 quotes**——Tauri 端 `Command::new("claude")` 的 args 不会做 shell escape,但 cwd 走 `portable_pty::native_pty_system().openpty()` 的 `cwd()` 是 raw `PathBuf`,不走 shell——**目前不会出问题,但 spec §5.3 的「不自动回车」如果未来扩展为「自动回车 + cd」则会有 shell 注入**。
- `{date}` 默认 `formatDate(new Date())` 是 `2026-06-17` 格式,但 `{date}` 之外的变量名如果写错(比如 `{filename}` 小写),不会被报错——`replace` 找不到占位符就保持原样,**用户的 prompt 里残留了 `{filename}` 字面量**交给 claude,claude 收到"神秘的占位符"很困惑。
- 模板里如果有反引号 / `$(...)` / 反斜杠,直接 inject 到 PTY 不会被 escape——bracketed paste 只告诉 TUI "这是粘贴",不转义内容。claude 拿到的是 raw 文本,会被 claude 自己的 prompt 解析器处理——目前 OK,但有未来风险。
**建议**:
- `resolveFlowScenarioTemplate` 加"未匹配占位符检测":扫描模板,如果有 `\{[^}]+\}` 未被替换,`console.warn` 并提示用户"模板里有未识别的占位符"。
- 模板里的反引号 / `$` / 反斜杠在 inject 前做 `\` escape(轻微 trade-off,可能影响 skill 调用语法)。
- 至少加 unit test:`buildContextFromFile` 路径含空格/中文/反斜杠/unix 路径/UNC 路径的 round-trip。

### 6. terminal tab 生命周期
**现状**:
- `TerminalPanel.tsx:357-376` `startAgentTerminal`:已存在 ready tab → focus;存在 stale (exited/error/connecting) tab → close + 重建。
- `TerminalPanel.tsx:217-220` `closeTab`:`killTerminal` + `dispose` + 删 `runtimesRef`。
**问题**:
- `startAgentTerminal` 入口 `const stale = tabs.find((tab) => tab.isAgent); if (stale) closeTab(stale.localId);`——`closeTab` 是 sync 函数但 `killTerminal` 是 async,**没 await**。紧接着 `await openNewTab(...)` 启动新 tab,但旧 PTY 可能还活着(`portable_pty` 清理异步)——Windows 下旧 claude 进程还占用 cwd,新 PTY 在同 cwd 启动可能冲突(`Error: address already in use`)。
- `closeTab` 调 `runtime.terminal.dispose()`,但 `terminalSession` div 上的 ref 引用 `attachTerminal` callback 会 `runtime.terminal.open(node)` 重用——dispose 后再 open 同一个 Terminal 实例会抛。`tabs` 数组里 stale 被 filter 掉,新 tab 用新 `localId`,理论 OK,但**React 18 concurrent 模式下**,新 tab 渲染时旧 div 可能还在 DOM(rAF 之前 unmount),导致 xterm 找不到自己的 container。
- `termIdToLocalIdRef` 在 `closeTab` 删除 entry(`TerminalPanel.tsx:218`),但**如果旧 tab 的 onTerminalData / onTerminalExit 回调还在飞行**(从 Rust 端推过来的事件),回调里 `termIdToLocalIdRef.current.get(payload.termId)` 返 undefined → 静默丢掉。**可能 OK**(旧 PTY 死了就没人写),但理论有 race。
**建议**:
- `startAgentTerminal` 内部 `await closeTab(stale.localId)`(closeTab 改 async,等 killTerminal 完成)。
- `attachTerminal` callback 入口检查 `runtime.opened`,避免重复 open(dispose 后会抛)。
- `useEffect` cleanup 时**先 unlisten onTerminalData / onTerminalExit 再 dispose**——确保 Rust → JS 事件不再流入已 dispose 的 xterm。

### 7. 配置 / 注册表读写失败
**现状**:
- `flowScenarioService.ts:50-52` `parseFlowScenariosJson` JSON.parse 失败 → `return [...FLOW_SCENARIO_DEFAULT_SEED]` + 静默。
- `flowScenarioService.ts:64-66` `readFlowScenarios` 失败 → `console.warn` + 回退默认。
- `flowScenarioService.ts:69-71` `writeFlowScenarios` 抛错向上(没 catch)。
- `openFlowScenariosFile`(`ScenarioPanel.tsx:108-114`)调 Tauri 打开注册表 JSON。
**问题**:
- **JSON 损坏/权限不足静默吞错**:用户精心编辑的 JSON,如果多了一个逗号/少了引号,**UI 不会告诉他**。下次启动仍然用默认 seed,用户以为"系统重置了我的设置"。**这是报告里最强的 P1 之一**。
- `writeFlowScenarios` 抛错向上但 `ScenarioPanel` 没用 try/catch(只在 `handleCopy` / `handleApply` 用,但注册表编辑流走 `openFlowScenariosFile` 调外部编辑器——用户改了保存后,reload 流程未实现)。
- **注册表热更新缺失**:用户用 `openFlowScenariosFile` 在外部编辑器改了 JSON,保存关闭后,`ScenarioPanel` **不重新读**(`useEffect` 只在 mount 时读一次,`ScenarioPanel.tsx:43-56`)。要重启 app 才生效——这是 spec §5.1 "可编辑注册表" 的体验漏洞。
**建议**:
- `parseFlowScenariosJson` 失败时保留 raw string,通过返回值告诉 UI: `return { scenarios: defaultSeed, error: parseError }`。`readFlowScenarios` 同款。
- 失败时把 raw + parseError 通过 Tauri event emit 到前端,`ScenarioPanel` 订阅并显示红色提示条 + 「打开文件修复」按钮。
- 加 `useFileSystemEvent` 监听注册表文件 mtime,外部修改后自动 reload(`@tauri-apps/plugin-fs` 的 `watch` API)。
- 或者:用户保存注册表后,弹一个 "检测到注册表变更,是否重新加载" 提示。

## 优(逻辑上值得保留)

1. **`agentBridge` 的 getter 闭包模式**(`agentBridge.ts:5-9`)—— 完美解决 React 19 `useImperativeHandle` 写 ref 后 useMemo 不会重算的 stale ref 问题。这是 spec 隐含要求 + 实战中容易踩的坑,codex 一开始用的"直接传 ref.current"是错的,闭包才是正解。
2. **`pendingAgentCommandRef` + setTimeout 1200ms 等待 claude banner**(`TerminalPanel.tsx:81-82, 357-376`)—— 即使是猜测性的 1200ms,也比「命令落到未就绪 PTY 被吞」好,且 spec R2 spike 验证过这数字。问题在于「墙钟时间」,但思路对。
3. **「外部已修改」三选项条 + `lastSelfWriteRef` 1.5s 自写抑制**(`AppLayout.tsx:1116-1130`)—— 写盘 race 三态的工程实现专业,**唯一漏洞是 `agentChangedPaths` 没接这个 ref**(见 P1 #2)。
4. **`flowSnapshotRef` 快照状态机**(`AppLayout.tsx:241-247, 686-693`)—— 进入心流前快照,退出时按快照恢复。**唯一漏洞是不存 windowBounds**(P1 #5)。
5. **PTY 懒启动 + single session 长驻**(spec §8.1 硬要求)—— `startAgentTerminal` 内部 stale tab 关闭 + 重建逻辑,确保 user 看到的总是「同一个 claude 会话」,符合"不重起"承诺。
6. **`sendText` 用 bracketed paste + 不追加 `\r`**(`agentBridge.ts:32-33`)—— 完美对应 R2 spike 结论,命令落为可编辑输入行,用户补 `--style` 后回车。
7. **headless 彻底删除**(`abae51e` 起的系列 commit)—— `AIWorkspacePanel` 整文件消失、`agentService` 只剩 15 行 `detectAgent`、Rust 7 个 `agent_*` 命令全无,实现了 spec "外科式删除"。
8. **App 不附 `--dangerously-skip-permissions` / `--auto-approve`** —— 全局 grep 确认,符合 spec §8 "权限全在终端" 硬要求。

## 问题(按优先级)

### P0(必修,可能丢数据/状态错乱)
- 无

### P1(重要修,体验错位)
1. **`TerminalPanel.sendText` + `agentBridge.injectText` 双重 bracketed paste 包裹** —— `TerminalPanel.tsx:383` 与 `agentBridge.ts:33` 各包一次 `BRACKETED_PASTE_START/END`,Claude TUI 收到 `<ESC>[200~<ESC>[200~命令<ESC>[201~<ESC>[201~`,嵌套序列行为未定义,直接破坏 spec §5.3 "命令落为可编辑输入行" 体感。修法:删一处,只留 `agentBridge.injectText` 包裹(它是 bridge 出口,符合"内聚"原则)。
2. **`agentChangedPaths` 未接入 `lastSelfWriteRef` 1.5s 自写抑制** —— `AppLayout.tsx:1172-1184` 收集路径时没检查自写抑制,场景卡「发送即存盘」(`ScenarioPanel.handleApply` 前的 `onBeforeInject` 钩子)+ 用户在编辑器 save 都会自污染文件树高亮和产物 chips。修法:`onWorkspaceChanged` handler 入口加 `if (lastSelfWriteRef.current && Date.now() - lastSelfWriteRef.current < 1500) return;`(参考 `AppLayout.tsx:1116-1119` 的现成写法)。
3. **注册表 JSON 解析失败静默回退默认** —— `flowScenarioService.ts:50-52` 用 `console.warn` 吞错,用户精心编辑的 JSON 被吞完全无感知。修法:返回 `{ scenarios, error }` 元组,ScenarioPanel UI 检测到 error 时显示红色提示条 + 「打开文件修复」按钮。
4. **`TerminalPanel.tsx:375` 1200ms setTimeout 墙钟猜测** —— 慢机器/Defender 卡顿时 1200ms 不够,claude TUI banner 还没出现就被注入。修法:用 xterm 的 `onData` 监听,识别 claude banner 的典型 ASCII 字符(如 `╭─╮`),出现后再 resolve。
5. **`flowSnapshotRef` 不存 windowBounds + resize 时覆盖用户拖过的宽度** —— `AppLayout.tsx:241-247` 快照缺 `windowBounds`,`AppLayout.tsx:777-786` resize 时调 `getDefaultRightPanelWidth` 覆盖用户拖过的宽度。修法:快照加 `bounds: { x, y, w, h }`(Tauri `outerPosition/outerSize`),resize 时只在越界时夹紧。

### P2(可优化,边界情况)
1. `ScenarioPanel.tsx:41` `agentStarted` 局部 state 在 `ScenarioPanel` 重挂时丢失,与 PTY 实际 ready 状态漂移——上移到 `AppLayout` 或改用 `useSyncExternalStore` 订阅 `bridge.hasTerminal`。
2. `TerminalPanel.tsx:368-370` `closeTab` 未 await `killTerminal`,新 PTY 与旧 PTY 同 cwd 可能冲突——改 async + await。
3. `ScenarioPanel.handleApply` 的 `try/catch` 不重置 `setAgentStarted`——失败后按钮文字不回退。
4. `ScenarioPanel` 注册表无热更新——外部编辑 JSON 后需重启 app,加 `watch` 监听 mtime。
5. `resolveFlowScenarioTemplate` 未匹配占位符(如 `{filename}`)静默保留字面量——加未匹配检测 + warn。
6. `ArtifactPreview.tsx:46` 反复 decode 同一文件(agent 持续写时 iframe 反复重载)——加 ts 去重,只在 ts 变化时重读。
7. `flowScenarioService.ts:65` `readFlowScenarios` 失败回退默认也走 console.warn——同 #1,需 UI 提示。
8. `externalChangeConflict` 三选项条没有"稍后再说"关闭按钮——P2 体验。
9. `AppLayout` 的 PTY ready 检测用 `tab.status === 'ready'`,connecting 状态不被认作"已就绪"——连点会触发 5 次 `startAgentTerminal`。
10. `useEffect(() => () => killTerminal)` cleanup 顺序——先 unlisten onTerminalData / onTerminalExit 再 dispose,避免飞行事件落到 disposed xterm。
11. `useImperativeHandle` 依赖 `[tabs, openNewTab, closeTab]`(`TerminalPanel.tsx:395`)—— `tabs` 每次 state 变都重生成 handle,可能引入闭包漂移。考虑 `useRef` 缓存稳定方法。
12. `ScenarioPanel` 错误 sticky:`scenario-error` 显示后无关闭机制,必须重新点 Apply 清空。
13. `AppLayout` 的 `handleContentChange` 同步 `setToc(extractToc(value))`——长文档按键 regex 全扫,可能 50ms+ 阻塞。

## 评分

⭐⭐⭐⭐ / 5

**理由**:核心状态机合理(spec §0.1 落地彻底)、时序控制基本到位(1200ms 猜测除外)、PTY 生命周期处理专业(stale tab 关闭 + 重建)、bridge 闭包模式是 React 19 的最佳实践。扣一颗星的原因有三:(a) 三处 P1 都是「交付后会被问起来需要解释」的瑕疵——双层 bracketed paste 是低级错误,自写抑制没接 agentChangedPaths 是 `lastSelfWriteRef` 设计的半成品,JSON 静默回退是 spec 默认的危险默认;(b) 13 个 P2 集中在状态机并发边界,工作量小但分布广;(c) `useImperativeHandle` deps 用 `tabs` 状态有理论闭包漂移风险。这三点修起来 < 1 天,但用户体验的"专业感"差距大。

## 5 条 actionable 建议

1. **双层 bracketed paste 去重**:`TerminalPanel.tsx:383` 的 `wrapBracketedPaste` 删掉,只在 `agentBridge.injectText` 出口包一次。理由:bridge 是单一出口,内聚原则;终端面板是通用基础设施,不该知道 agent 语义。
2. **`agentChangedPaths` 接 `lastSelfWriteRef` 自写抑制**:`AppLayout.tsx:1172-1184` 的 `onWorkspaceChanged` handler 入口加 `if (lastSelfWriteRef.current && Date.now() - lastSelfWriteRef.current < 1500) return;`,与 `AppLayout.tsx:1116-1119` 的现成写法对齐。这样用户在编辑器 save 完 1.5s 内 claude 改同一文件,不会被算成"agent 改动",文件树不闪、chips 不污染。
3. **JSON 解析失败返回元组**:`flowScenarioService.ts:41-66` 改为 `parseFlowScenariosJson(raw): { scenarios: FlowScenario[], error?: string }`,`readFlowScenarios` 同款。`ScenarioPanel` 检测到 error 时在 `scenario-header` 旁显示红色感叹号 + tooltip("你的注册表 JSON 有语法错误")+ 「打开文件修复」按钮。
4. **claude banner 出现事件替代 1200ms 猜测**:`TerminalPanel.tsx:375` 的 setTimeout 改为:在 `openNewTab` 的 `await` 之后,把 xterm 的 `onData` 临时监听,识别 claude banner 典型字符(如 `╭` 或 `bypass permissions`,正则 `/(?:╭|bypass permissions)/`),出现后 `resolve`。`pendingAgentCommandRef` 配合这个事件触发 injectText。
5. **`flowSnapshotRef` 补 `windowBounds`**:`AppLayout.tsx:241-247` 快照加 `bounds: { x, y, width, height }`,在进入心流前 `await getCurrentWindow().outerPosition()` + `outerSize()` 缓存;退出时如果原本未最大化,`unmaximize()` 之后用 `setPosition` + `setSize` 还原。同时 `AppLayout.tsx:777-786` 的 resize effect 改为只在越界时夹紧(右栏宽度 < 200 或 > 600),不再 setDefault 覆盖用户拖过的值。
