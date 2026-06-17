# 心流模式 MVP · 使用便捷性评审

## 评审人
subagent: usability · 2026-06-17

## 总评(2-3 段)

整体便捷性处于「能跑通但有显著 UX 缝隙」水平。心流模式的设计哲学(`App 不猜 agent 在想什么,只反应写盘`)在体验层面被忠实落地——文件树高亮、产物 chips、终端注入、iframe 重载都按"单一真实信号源"涌现;场景卡的注册表驱动与"模板即数据"模型也对得起 `docs/AI_WORKBENCH_SPEC.md` §5 的承诺。最大的便利优势是"嵌真实终端":用户保有所有 skill 生态、注入不自动回车、人工介入点自然,这是 fanbox-windows 的同款范式红利。

最大的摩擦点在三处:**(a) 「应用到终端」二段式点击的认知断裂**(首次只启动、第二次才注入,用户极易在第二次点击前困惑「刚才那次到底生效没」);**(b) 心流宏的「可逆性」是名义上的但缺可见反馈**——最大化/还原 + 三块面板开关是 spec §4 的明确承诺,但执行中面板宽度的 `getDefaultRightPanelWidth()` 会强行覆盖用户拖过的宽度,叠加 Tauri 异步 `isMaximized()` 在 fast 用户连按下的潜在 race,真实可逆性打折扣;**(c) `flowMode` 的持久化与 `agentChangedPaths` / 产物 chips 的清空时机没对齐**——关闭心流不会清空 chips,再次进入会"幽灵复现"上一次的产物状态(虽然 `setAgentChangedPaths(new Map())` 在 useEffect cleanup 中执行,但因为 cleanup 依赖 `[flowMode, isTauriRuntime, workspaceRoot]`,`workspaceRoot` 一旦变化就会清空,看起来是 bug 还是 feature 难以判断)。这三处是「便捷」从 80 分跨到 95 分的关键。

## 8 项问题清单意见

### 1. 入口与发现

**现状**:
- `src/app/AppLayout.tsx:882` 注册 `⌘⇧A` 监听: `if (e.key === 'a' && e.shiftKey && !e.altKey) { e.preventDefault(); void handleToggleFlowMode(); return; }`
- `src/components/Toolbar.tsx:184-193` 渲染心流模式按钮: `<Sparkles size={iconSize} />`,`data-tooltip={t('toolbarFlowModeTitle')}` 即「心流模式（Cmd+Shift+A）」,放在 6 个 view 按钮倒数第二,前面紧挨 `AI 工作流`(`LayoutPanelLeft`,`LayoutPanelLeft size={iconSize}`)——两个图标在 18px 下都是细线风,目视差距很小。
- `src/services/i18n.ts:121-122`:zh 文案为「心流模式（Cmd+Shift+A）」,提示足够清楚。
- docx 文件下: `handleToggleFlowMode` 第 645 行直接 `if (file.fileType === 'docx') return;` 静默返回;Toolbar 第 187 行也 `disabled={editingDisabled}`,但 hover tooltip 没有显式说明「docx 下不可用」。

**问题**:
1. **轻度有**:用户首次打开 Typola 完全不知道「⌘⇧A」的存在。提示只挂在 Toolbar 按钮的 hover tooltip,而 Toolbar 文件名在中央占位(图标按钮都是 34×34,在窄屏上密集排列),对一个熟练用户都不一定一眼看到。
2. **轻度有**:「心流模式」与「AI 工作流」两个按钮并列(`Toolbar.tsx:174-193`),图标都用了 `Sparkles` vs `LayoutPanelLeft`,但 `LayoutPanelLeft` 在 lucide 里非常像「侧栏」,两者语义差距不如名称那么明显。
3. **轻度有**:docx 下静默禁用——按钮变灰但 tooltip 不说为什么,用户会以为是 bug。

**建议**:
- 在右栏空态(`scenario-empty` 路径)和首页 hint 加一句「按 ⌘⇧A 进入心流模式」作为冷启动发现路径。`src/components/ScenarioPanel.tsx:117-122` 的 `scenario-empty` 是天然位。
- Toolbar 中给 `toolbarFlowMode` 按钮加一个 `data-disabled-reason="docx 下不可用"` 属性,在 disabled 时显示原因 tooltip。
- 「AI 工作流」按钮的 tooltip 写明「独立开关,在阅读器也能用」,与心流宏区分清楚。

### 2. 一次点击全开的宏: snapshot → 最大化 → 全开

**现状**:
- `src/app/AppLayout.tsx:644-702` 实现 `handleToggleFlowMode`:
  - 进入:读取 `isMaximized()` → 若非最大就 `maximize()` → 快照 `leftPanelMode / rightPanelMode / rightPanelWidth / terminalVisible / maximized` 到 `flowSnapshotRef` → 强设面板状态。
  - 退出:若「当前已最大化且快照未最大化」则 `unmaximize()` → 从快照恢复。
- `src/app/AppLayout.tsx:658-664` 快照保存;`686-693` 退出恢复。
- `src/app/AppLayout.tsx:777-786` 有 `useEffect` 监听窗口 resize 并把右栏宽度重置为 `getDefaultRightPanelWidth()` —— 这意味着「退出心流」恢复 `rightPanelWidth` 之后,如果用户后续调整窗口大小,宽度会被再次冲掉;但只要没 resize,宽度能保留。

**问题**:
1. **中度**:进入心流时,**三块面板的开关动作对用户无任何视觉过渡**——同帧切换 `leftPanelMode`、`rightPanelMode`、`terminalVisible`,再下一帧 `flowMode = true` 触发样式。这在 React 18 自动批处理下几乎同步发生,用户看不到「原来什么都没开,现在都开了」的过渡感。spec §4 隐含希望「点亮三块」的过程有「逐渐亮起」的暗示,实际是「啪一下全部出现」。这对新用户会有「点完我到底做了什么」的认知空窗。
2. **轻度**:`getDefaultRightPanelWidth()`(`AppLayout.tsx:593-599`)在右栏打开/窗口 resize 时强制覆盖用户拖过的宽度。退出心流恢复 snapshot 里的 width 后,如果用户之前调过窗口大小,会被无差别冲掉。spec 强调「完全可逆」,但事实上宽度可逆性有条件。
3. **轻度**:`appWindow.isMaximized()` 是异步;如果用户在「等待 isMaximized 返回」的微秒内连按第二次 `⌘⇧A`,第二次进入会拿错状态(很可能拿到 false,触发再次 maximize,然后 snapshot 错位)。真实环境里键盘抖动 + Tauri IPC 几十 ms,确实有可能。
4. **轻度**:快照只存了「面板状态」,**没存窗口位置/大小**(非最大化的窗口尺寸也是用户手动调的)。如果用户先把窗口拖到屏幕右侧占半屏,再开心流 → 最大化 → 退出 → 窗口只是 unmaximize,但恢复不到「右侧半屏」,会回到默认位置。这是 spec §4 没明说的盲点。

**建议**:
- 进入时给三块面板加 150ms 错位 transition(树先开、右栏次之、终端最后),用 CSS animation/transition + `setTimeout` 错开 setState(或者用 framer-motion,无需新增依赖)。
- 把 `getDefaultRightPanelWidth()` 改为只在「右栏刚打开」时跑,resize 时不再冲掉。`AppLayout.tsx:779-786` 是问题源头。
- snapshot 增加 `windowBounds`(非最大化的位置/大小);Tauri 的 `getCurrentWindow().outerPosition()` / `outerSize()` 可取,unmaximize 之后用 `setSize/setPosition` 还原。

### 3. 「应用到终端」二段式点击

**现状**:
- `src/components/ScenarioPanel.tsx:60-95` `handleApply`:
  - 第一次点击:`if (!bridge.hasTerminal())` 走 `bridge.ensureTerminal(claudeCommand, cwd)` —— 只启动 agent,返回前 `setAgentStarted(true)`,按钮文字变「启动完成,点击应用」,显示 hint「Claude REPL 已就绪,再次点击「启动完成,点击应用」把场景命令贴入」。
  - 第二次点击:`bridge.injectText(command)` —— bracketed paste 注入。
- `src/services/agentBridge.ts:79-90` 对应实现。
- 按钮的 `title`(`ScenarioPanel.tsx:169`)会切换:`agentStarted ? 'Claude 已就绪,点击把场景命令贴入终端' : '把场景命令贴到终端;若 claude 未起,先启动再应用'`。
- hint 文字(`ScenarioPanel.tsx:182-184`):「Claude REPL 已就绪,再次点击「启动完成,点击应用」把场景命令贴入。」

**问题**:
1. **中度**:第一次点击后**用户视线焦点还在按钮上**,但按钮文字只是换了,且没有 toast / 状态条 / 终端里明显的 banner 反馈(终端在底部,如果用户没主动看下终端,根本不知道 claude 在不在跑)。用户最常见的反应是「我刚才点了,怎么没反应?是不是 bug?」然后再点一次,这次直接把命令贴到还没完全就绪的 PTY 输入行,可能丢字符。
2. **中度**:`TerminalPanel.tsx:357-376` 的 `startAgentTerminal` 用 `setTimeout(resolve, 1200)` 给 claude REPL banner 渲染预留时间。这是「墙钟时间」,慢机器/Win Defender 卡顿时 1200ms 不够,claude TUI 还没出现输入提示就被注入,claude 启动 banner 会把命令包起来误识别——结果就是命令落到 banner 上或被截断。但用户看到的「启动完成,点击应用」只是 UI 状态,并不反映 PTY 是否真就绪。
3. **轻度**:按钮的 `title` tooltip 在 hover 时才出现,大部分用户不 hover。文字「启动完成,点击应用」**字面含义模糊**——「启动完成」是 claude?还是 agent 启动?「点击应用」应用什么?对比 spec §5.3 的设计文案「主按钮 「应用到终端」」「体感:点一下 → 命令出现在底部终端输入行(可编辑、可补 `--style` 等参数)→ 用户按 Enter 运行」,实际 UX 已经偏离「点一下到位」的承诺,变成了「点两下到位」。
4. **轻度**:hint 文本「Claude REPL 已就绪,再次点击「启动完成,点击应用」把场景命令贴入」语气像文档,不像 UI 文案。中文用户首次阅读会慢一拍。

**建议**:
- 第一次点击后,在按钮旁边或终端顶部加 1-2s 的 toast:「Claude 已启动(2 秒后自动贴入命令)」+ 一个「立即应用」可点链接。这样用户不用第二次盲点,也避免 1200ms setTimeout 的猜测。
- 或者更彻底:第一次点击走完 PTY ready 检测后**自动注入**,把二段式改为一段式 + loading 态。需要把 `TerminalPanel` 的 `startAgentTerminal` 改成「等 PTY ready 信号 + claude banner 出现」再 resolve。当前是 fire-and-forget + setTimeout。
- hint 文案改为「Claude 已就绪,点这里把命令贴入终端(可继续编辑)」,把意图讲明。

### 4. 场景卡的发现

**现状**:
- `src/components/ScenarioPanel.tsx:140-153` 渲染场景卡 grid,MVP 只 1 张 (`html-ppt`),label = "HTML 生成",icon = `Presentation`,description = "把当前文档转成可演示的 HTML 页面,产物落在同目录"。
- `src/components/ScenarioPanel.tsx:129-138` 右上角有「编辑场景」按钮,带 `ExternalLink` 小图标。
- `src/components/ScenarioPanel.tsx:155-187` 选中后展开 guidance(`src/types/flowScenario.ts:24-30` 是大段 markdown 文本)+ skill hint + 应用按钮。
- spec §5.1 明确 MVP 只 1 张卡,Phase 1.5 才加 polish/wechat/daily。

**问题**:
1. **轻度**:单张卡片占满 grid(`scenario-grid` 用 `repeat(auto-fill, minmax(160px, 1fr))`——只有 1 个 child,就是 1 列 160px),视觉上「场景启动器」的感觉很弱,像一个孤零零的小盒子。用户看到「场景」面板**只看到一张卡片**,不会意识到这是「注册表驱动 / 可扩展」的入口。
2. **轻度**:`scenario-edit-link`(`ScenarioPanel.tsx:131-138`)非常小(11px 文字、12px 图标、4px padding),挤在 header 右边。用户大概率注意不到「编辑场景」的存在——但这恰好是「注册表可编辑」范式的关键发现点。
3. **轻度**:`scenario-guidance`(展开后的大段 markdown)在 `src/styles/app.css:2221-2233` 是 `<pre>` 风格(等宽字体),看起来像「代码示例」而不是「使用说明」。对一个非技术用户来说,等宽字体的整段文字**阅读阻力明显大于衬线/无衬线**。
4. **轻度**:`scenario-skill-hint` 是「建议 skill: `/baoyu-slide-deck`」,但**不解释 skill 是什么**——新用户完全不懂 skill 是什么东西。spec §0 说「交给终端里的 skill」,但 skill 的概念对非 geek 用户完全没铺垫。

**建议**:
- 空态/单卡情况下,在 grid 下方加一行小字提示:「1 个场景 · 你可以在『编辑场景』里加更多」,引导用户找到「编辑场景」入口。
- guidance 改用 markdown 渲染(简单 `<ul>` 解析即可)而不是 `<pre>`,降低视觉密度。
- skill hint 改为更友好的提示:「Claude 会用你安装的 `/baoyu-slide-deck` skill 链完成任务。如果没装,claude 会自动下载」——把 skill 生态讲清楚。
- 把「编辑场景」按钮放大到 header 正常高度,加一个 `(JSON)` 文字尾巴,引导意识。

### 5. 终端交互: 用户能看到 agent 在做什么吗?

**现状**:
- `src/components/TerminalPanel.tsx:399-474` 终端 UI,有 tabs、copy/paste/clear/select all actions。claude agent tab 会标 `isAgent`(在 `className` 里 `tab.isAgent ? 'agent' : ''`)。
- `src/styles/app.css:418` CSS class `.terminal-tab.agent` —— 需要查具体样式是否在视觉上区分普通 tab 与 agent tab。
- `src/app/AppLayout.tsx:1248-1260` 把 `agentChangedPaths` 转化为 `artifactItems`(产物 chips)。
- `src/app/AppLayout.tsx:1162-1199` 心流模式 + workspace 选定后监听 `workspace-changed`,记入 `agentChangedPaths`。

**问题**:
1. **中度**:`terminal-tab.agent` 视觉差异依赖具体 CSS(需确认),但 spec §8.2 明确「状态徽章(运行/空闲/退出)」在 Phase 2 才做。当前 MVP 里,**用户没有任何 badge / 指示器告诉他 claude 此刻是「在思考」还是「在等你授权」还是「已经做完」**。用户只能盯着 xterm 屏幕的字符流,或扫一眼终端 cwd 路径(`terminal-cwd` 那一行 472 行)。
2. **中度**:App 这层完全没有「agent 真的改对了」的进度反馈。产物 chips 是在文件系统事件 emit 后才出现的——如果 claude 在写一个 1MB 的 HTML,中间 30 秒用户看不到任何产物(只是 chips 暂未刷新)。`setWorkspaceTreeVersion` 只在 create/remove/rename 时递增(`AppLayout.tsx:1181-1183`),modify 不会触发文件树重读,这意味着 **claude 修改一个已有 .md 时,文件树节点要在 200-300ms 节流后才脉冲一次,中间用户什么也看不见**。
3. **轻度**:xterm 内 claude 报错的红色 ANSI 转义用户在视觉上是「终端字符」,App 层不会拦截提醒。如果 claude 因为工具权限被拒、找不到 skill 而抛错,用户只能通过终端里滚动看。StatusBar 不显示任何 agent 状态(`StatusBar` 只看 `autoSaveError || diskChangeMessage || transientMessage`)。
4. **轻度**:`TerminalPanel.tsx:330` 处理 exit 事件只 `writeln('[process exited ...]')`,没有在 tab 上加视觉区分(虽然 `tab.status = 'exited'` 但 UI 不显示)。

**建议**:
- agent tab 加一个呼吸的小圆点(2px 直径,CSS 动画),status === 'ready' 且在等用户输入时显示静止绿色,claude 在 streaming 时显示脉冲蓝色。这条改动小、立竿见影。
- `AppLayout.tsx:1161-1199` 在 `payload.kind === 'modify'` 时也递增 `workspaceTreeVersion`(或者单独把 modify 路径 ping 给 file tree),让文件树实时反映 agent 在写哪个文件。
- 至少在 StatusBar 加一行「Claude: 运行中 / 等待输入 / 已退出」,从 `agentChangedPaths` 的最近时间 + agent tab status 推算。

### 6. 闭环反馈: 文件树高亮 + 产物 chips + iframe 预览

**现状**:
- `src/styles/app.css:2473-2482` agent-changed 高亮用脉冲动画(`agent-changed-pulse 1.5s ease-out`),背景 `oklch(58% 0.16 35 / 0.08)` + 左 border `var(--accent)`。注意:这是**单次脉冲**,refresh 后 className 仍带 `agent-changed`,但 CSS 动画只跑一次——效果就是「刚改的文件亮一下」。
- `src/components/ArtifactPreview.tsx:79-103` chips 渲染。单击切 active、双击调用 `onOpenFile`(打开到主编辑器)。
- `src/components/ArtifactPreview.tsx:107-113` HTML 产物用 sandboxed iframe 渲染,`sandbox="allow-scripts"`,没给 allow-same-origin(安全性 OK)。
- `src/app/AppLayout.tsx:1618-1633` 外部已修改三选项条 —— 「Claude 改了这个文件,你有未保存修改 / 查看差异 / 用 Claude 的版本 / 保留我的」。

**问题**:
1. **轻度**:chips 单击切预览、双击打开主编辑器——这两个动作的语义在视觉上**完全无法区分**(都是 hover 高亮,没文字提示双击会干嘛)。`artifact-chip` 的 `title` 属性(`ArtifactPreview.tsx:92`)写了「双击在主编辑器打开」,但用户**得 hover 才知道**。
2. **轻度**:chips 只有一个「新建/修改」的隐含区分(代码层面是 ts 排序),但 UI 没标「新建」「修改」标签。`AppLayout.tsx:1253` 给 kind 设了 'markdown'/'html'/'text'/'other' 但**没区分 create vs modify**——用户看到 chips 不知道哪个是新文件、哪个是改的旧文件。
3. **轻度**:`setWorkspaceTreeVersion` 只在 create/remove/rename 时触发(`AppLayout.tsx:1181-1183`),**modify 不触发文件树重读**——但用户改了文件后,可能要看「这个文件夹多了什么文件」,而 modify 不会让目录内容变化。其实 modify 确实不需要重读目录,这逻辑是对的。**但 chips 的 kind 永远不会从 'markdown' 变成 'markdown-new' 之类**,所以「新建」vs「修改」的视觉差异根本不存在。
4. **中度**:`src/components/ArtifactPreview.tsx:46` 读产物用的是 `invoke('read_opened_document', ...)`。这个 Tauri 命令原本是为「打开当前编辑文件」设计的,**对刚生成的大文件(比如 agent 写的 5MB HTML)每次切换 chip 都要重新 decode**。实际使用中 agent 写完 chip 出现,用户点 chip → decode → 渲染。如果 agent 持续写(HTML 半成品),每次 modify 都会触发 `payload.paths` 包含该路径 → setAgentChangedPaths 更新 ts → artifactItems 重新排序 → useEffect 重新 invoke read——**用户卡在那个 chip 上,iframe 会反复重载**。
5. **轻度**:双击 chip 打开主编辑器后(`AppLayout.tsx:1511-1513`),**产品逻辑上用户期望「在主编辑器打开 HTML 源码以便编辑」**,但 artifact 大概率是 agent 的产物,用户在编辑器里改 agent 产物是合理但目前没有版本管理,改完 agent 再写一次就被覆盖了。spec 没约束这个边界,UX 上有「改完就被覆盖」的陷阱。

**建议**:
- chips 加显式「新建 / 修改」标签(从 `agentChangedPaths` 的入参 kind 区分——但当前 `workspaceWatchService` 没传 kind 详情,需要后端补)。
- 给 chip 加显式 hint(图标 + 小字):hover 提示「单击预览 / 双击在主编辑器打开」,或者给 chip 一个独立的小角标表示双击行为。
- `ArtifactPreview.tsx:46` 的 invoke 需要去重——同一个 path 短时间内不重复读;或者改用 `key=path+ts` 的方式,只在 ts 变化时重读。
- agent 产物打开到主编辑器时,如果是 `.html` / `.md`,在 StatusBar 加一行提示「这是 agent 产物,被覆盖前请保存到其他位置」。

### 7. 错误恢复

**现状**:
- `src/app/AppLayout.tsx:1086-1158` 文件监听失败: `console.warn`,无 UI 反馈。
- `src/components/ScenarioPanel.tsx:81-85` agent 启动失败: setError「启动 agent 终端失败: ...」,以红色框显示在 detail 下方。
- `src/services/flowScenarioService.ts:51-52` JSON parse 失败: `return [...FLOW_SCENARIO_DEFAULT_SEED]` —— 静默回退默认。用户**完全不知道自己的自定义注册表被吞了**。
- `src/services/flowScenarioService.ts:65` read_flow_scenarios 失败也回退默认,console.warn。
- `src/components/ScenarioPanel.tsx:51-54` 读注册表失败: setError,UI 显示。

**问题**:
1. **中度**:`flowScenarioService.ts:41-53` 解析失败回退默认是**危险默认**——用户精心写的 JSON 如果被一个语法错误(比如多了个逗号)整个被吞,UI 显示的还是默认的 HTML 生成卡,**用户以为系统「丢了他的场景」但实际是被回退默认**。spec §5.1 说「读取失败回退内置默认」就是这个行为,但**没有任何 toast 告诉用户「你的 JSON 坏了」**。
2. **中度**:claude 没装(`aiClaudePath` 配错)→ 启动 PTY → `claude` 命令 not found → TerminalPanel `terminal.writeln('Failed to start terminal: ...')`(`TerminalPanel.tsx:196`)或 claude 自己返回 `command not found`。**App 这层完全不知道 PTY 内部的 shell error**。用户点完「应用到终端」等 5 秒发现 claude 没起来,以为没反应。
3. **中度**:`workspaceWatchService.ts:11-17` watch_workspace / unwatch_workspace 失败时只是 console.warn。如果某个 workspace 路径权限不够,心流模式开启后**整个产物 chips 机制静默失效**——agent 改的文件不会出现在 chips 上,用户怀疑自己点错卡。
4. **轻度**:`external-change-conflict` 三选项条(1618-1633)没有关闭按钮——只能选三选一,如果不主动处理就一直显示,挡住编辑器。
5. **轻度**:文件树 agent-changed 高亮的「agent 进程退出了 / 没在跑」场景,App 不告诉用户——用户的 chips 还挂着,文件树还亮着,但 claude 早已不在运行,用户继续等。
6. **轻度**:`scenario-error`(`ScenarioPanel.tsx:185`)显示后没有关闭机制,用户必须重新点 Apply 才会清空(因为 `setError('')` 在 handleApply 入口第 66 行),或者切换 card。错误状态 sticky 强。

**建议**:
- `flowScenarioService.ts:42-52` 解析失败时**保留坏 JSON 给用户**(可以在 UI 显示「你的注册表 JSON 有语法错误,正在用默认 seed」+「打开文件修复」按钮)。
- claude 启动失败时,bridge.ensureTerminal 抛错外加一个更友好的错误:「Claude CLI 启动失败。请在设置里检查 `aiClaudePath` 是否指向正确的 claude 可执行文件。」+ 跳设置按钮。
- `workspaceWatchService` 监听失败给 AppLayout 加一个 setWatcherError,UI 在 StatusBar 红字显示。
- external-change-conflict 加一个「稍后再说」关闭按钮。
- scenario-error 加一个 × 关闭。

### 8. 跨场景一致性: 跟 fanbox-windows / NotebookLM / tolaria 的同维度操作对比

参考 `docs/changes/2026-06-16-competitive-research/competitive-research.md`:
- **fanbox-windows**(L5 真栈直接参考,584★):左文件 + 中预览 + 下终端,嵌 Claude Code/Codex CLI。Typola 心流模式完全采用此布局,栈最「真」(direct PTY)。
- **NotebookLM**(L3 RAG 标杆):右栏 Studio 场景卡 + 产物独立成片(Study Guide/Audio Overview/Slide Deck)。Typola 右栏「场景」+「产物」分段 + 预览独立 = 直接复刻。
- **tolaria**(反面参照):裸 API + 自建循环丢 skill 生态。Typola 坚决不学,坚持 PTY 终端,这点做对了。

**对比维度**:

| 操作维度 | Typola 心流模式 | fanbox-windows | NotebookLM | tolaria | 评估 |
|---|---|---|---|---|---|
| 进入 AI 工作台 | 单快捷键 ⌘⇧A 一键全开 + 最大化 | 通常需手动开 | 永远是右栏 Studio | 始终在 | Typola 比 fanbox 更近 NotebookLM 的「总是就绪」,但有「快捷键发现难」的代价 |
| 触发 agent | 场景卡单按钮 | 直接在终端敲命令 | 场景卡单按钮 | 直接调 API | Typola + NotebookLM 同模式(优于 fanbox) |
| 注入到终端 | bracketed paste 不自动回车 | 终端直敲 | 不适用 | 不适用 | Typola 是「保护用户可介入」的最佳范式 |
| 看见 agent 在干嘛 | 文件树高亮 + chips 脉冲 | git diff 视图 | 产物列表 | 不适用 | Typola 比 NotebookLM 强(改原文档有反馈),比 fanbox 弱(无 git diff) |
| 看 agent 改了啥 | 单 chip 预览 + 双击打开 | git diff | 在 Studio 列表里 | 看不到 | Typola 中间档,既有即时预览又有源文件访问 |
| 写竞争处理 | 外部已修改三选项条 + 发送即存盘 | 手动 git diff review | 不涉及(不写原文档) | 不涉及 | Typola 是 L5 路线必须的,做得相对到位 |
| 权限控制 | 全在终端 Shift+Tab | 全在终端 | 不适用 | App 内按钮 | Typola 与 fanbox 同模型(透明可介入) |

**问题**:
1. **轻度**:`scenario-edit-link` 入口非常隐蔽,而 NotebookLM 的 Studio 模板列表是**平铺可见**的,fanbox 的 YAML recipes 入口通常在显眼位置(配置文件位置)。Typola 把「加新场景」的入口埋在 header 小图标里,与 NotebookLM 「所见即所得」差距大。
2. **轻度**:`scenario-card` 单卡状态下(`ScenarioPanel.tsx:140-153`),grid 只有 1 列,与 NotebookLM Studio 的「多卡片瀑布」视觉密度差距明显。新用户看到单卡会觉得「这就是全部功能」。
3. **中度**:**Typola 的「写盘反馈」比 NotebookLM 强(改了原文档能看见)但比 fanbox 弱(没有 git diff 视图)**——这是 spec §14 P3 已规划的缺口,但在 usability 维度上,「用户能否确认 agent 真的改对了」的答案在 MVP 是「可以预览但不能 diff」,相比 fanbox 的「可以 diff 但没即时预览」,各有盲点。
4. **轻度**:tolaria 的「注册表驱动卡片」被 Typola 学了(`flowScenarioService` 注册表 + JSON 可编辑),但 tolaria 同时提供了**图形化编辑**(UI 里改卡),Typola 直接跳到「外部 JSON 编辑」,对非 geek 用户门槛高。这是 spec §1 非目标明确排除的,但 usability 上是个真实摩擦点。

**建议**:
- 即使 MVP 只有 1 张卡,UI 上加一行「在编辑场景注册表里加更多 / JSON 路径: 设置 → 高级」之类的引导,降低发现成本。
- 在 artifact chips 旁加一个「查看 git diff」按钮占位(Phase 2 实现),或者现在就给一个文本版的「完整变更」按钮,调出 `diffTexts` 结果面板(代码已经实现了 `handleViewDiff` 和 `diff-preview-overlay`,但用户得先撞上「外部已修改」条才能用到)。

## 优(值得保留)

1. **「单真实信号源」的设计纪律(spec §0.1)被忠实落地**:整个产品无任何「AI 在思考」的 spinner/动画/状态机,文件树高亮、产物 chips、iframe 重载三处都是从 `notify` watcher 涌现,这是 fanbox 都没做到的克制(competitive-research §3.1 提到 fanbox 有「活的仪表盘」涟漪,反而是 spec 想避免的)。
2. **`agentChangedPaths` 的 Map<path, ts> 数据结构选得对**:`AppLayout.tsx:239` + `1259` 的 ts 排序天然支持「最近改动在前」,又方便做 chip 高亮对比。这是「模板即数据」范式下的最佳选择。
3. **二段式点击虽然有 UX 缝隙,但背后的工程考量正确**:第一次只起 claude 是不让命令落到未就绪 PTY(`ScenarioPanel.tsx:79-90` 注释明示),这是 spec §8 强调的「PTY ready 前不能注入」。代码是合理的,UX 可以改进。
4. **`sendText` 用 bracketed paste + 不追加 `\r`**(`agentBridge.ts:32-33`):这是 R2 spike 验证过的正确姿势,`TerminalPanel.tsx:383` 也是同款实现。一次性落为可编辑输入行,用户补 `--style` 后回车,完美对应 spec §5.3「透明可介入」。
5. **「外部已修改」三选项条**(1618-1633)是 L5 路线 UX 关键,Typola 做到了(spec §6.1),NotebookLM/tolaria 都没这个概念。
6. **`scenario-edit-link` + `openFlowScenariosFile` 让「注册表可编辑」是真实可达的**(`ScenarioPanel.tsx:108-114`),不是空喊口号。
7. **claude 错误全留终端 + 不读 TUI 文本** 的克制(spec §8 / §0.1):`TerminalPanel.tsx` 完全不解析终端输出做状态机,与 fanbox 的「态势感知」形成对照,这是 spec 想保留的「不要大而全」。

## 问题(按优先级)

### P0(必修,影响主流程)
- 无

### P1(重要修,影响体验)
- **`ScenarioPanel.tsx:60-95` 二段式点击的认知断裂**:第一次点击后用户容易困惑「到底生效没」,且 `TerminalPanel.tsx:375` 的 1200ms setTimeout 是猜测。修法:第一次点击后给 toast「Claude 已启动」+ 2 秒后自动注入(或加「立即应用」可点链接);`startAgentTerminal` 改成「等 PTY ready + claude banner 出现」信号再 resolve。
- **`AppLayout.tsx:777-786` `getDefaultRightPanelWidth` 在 resize 时强制覆盖用户拖过的宽度**:与 spec §4「完全可逆」承诺不符。修法:resize 时只在右栏宽度越界时夹紧,不再 setDefault。
- **`AppLayout.tsx:644-702` 心流宏进入/退出无过渡**:同帧切换 3 块面板,新用户认知空窗。修法:CSS transition + 150ms 错位 setState。
- **`flowScenarioService.ts:41-53` JSON 解析失败静默回退默认**:用户精心写的 JSON 被吞完全无感知。修法:解析失败时在 UI 显式提示「你的 JSON 有语法错误,正在用默认 seed」+ 「打开文件修复」按钮,且 `readFlowScenarios` 失败也走相同提示。
- **`agentBridge.ts:19-25` claude 启动失败提示不够友好**:错误冒泡后只显示「启动 agent 终端失败: ...」。修法:捕获 `which claude` 失败等场景,提示用户检查 `aiClaudePath`,加「打开设置」按钮。

### P2(可优化)
- **`ScenarioPanel.tsx:131-138` 「编辑场景」入口太隐蔽**:11px 文字 + 12px 图标。新用户大概率注意不到。修法:放大到 header 正常字号,加 `(JSON)` 文字尾巴。
- **`ScenarioPanel.tsx:2221-2233` guidance 用等宽字体呈现**:阅读阻力大。修法:改用衬线/无衬线 + 简单 `<ul>` 解析。
- **`ArtifactPreview.tsx:79-103` chips 单击 vs 双击的语义不可见**:靠 hover 才知道。修法:chip 加 hint 或在 chip 右下角放个小图标(铅笔/箭头)暗示双击行为。
- **`AppLayout.tsx:1161-1199` workspace watcher modify 路径不会触发文件树重读**:其实逻辑正确,但 kind 缺「新/改」区分。修法:后端 workspace_changed 事件补 kind('create' / 'modify') + UI chip 标「新建 / 修改」。
- **`ArtifactPreview.tsx:46` 反复 decode 同一个文件**:agent 持续写时,iframe 反复重载。修法:加去重 + ts 比较。
- **`external-change-conflict` 条没有关闭按钮**:`AppLayout.tsx:1618-1633` 只能三选一。修法:加「稍后再说」关闭按钮,临时收起。
- **`StatusBar` 无 agent 状态**:`AppLayout.tsx:1692-1697` 只看 autoSaveError。修法:加一行「Claude: 运行中 / 等待输入 / 已退出」,从 agentChangedPaths ts + agent tab status 推算。
- **Toolbar 中 `toolbarFlowMode` 按钮的 disabled tooltip 不解释原因**:`Toolbar.tsx:184-193` 在 docx 下禁用但不告诉用户为什么。修法:加 `data-disabled-reason="docx 下不可用"` 属性。
- **`TerminalPanel.tsx` 没有 agent tab 视觉区分**:需要确认 `.terminal-tab.agent` 的 CSS 是否有明显视觉差异。如果只是 class 名存在但无样式,需要补一个呼吸点或彩色 label。
- **`scenario-empty` 路径冷启动发现**:`ScenarioPanel.tsx:117-122` 没有引导用户用快捷键进入心流。修法:加一句「按 ⌘⇧A 进入心流模式」。

## 评分

⭐⭐⭐⭐ / 5

**理由**:整体设计纪律严(spec §0.1 落地彻底),核心范式选择正确(L5 真栈、注册表驱动、PTY 而非 chat UI、单一真实信号源),关键工程细节到位(bracketed paste + 不自动回车、外部已修改三选项、发送即存盘)。扣一颗星的原因有三:(a) 二段式点击的认知断裂是主流程 UX 缝隙,影响每个用户首次体验;(b) 心流宏的可逆性是「名义上的」,snapshot 不够完整(resize 会被冲、窗口位置不存);(c) 错误恢复路径对非 geek 用户不友好(JSON 静默回退默认、claude 没装静默失败、watcher 失败静默失效)。这三处修起来工作量小(每处 < 半天),但用户感知强烈。

## 5 条 actionable 建议

1. **二段式点击改为「单段 + 自动完成」**:`ScenarioPanel.tsx:60-95` 的 `handleApply` 在第一次点击后,bridge.ensureTerminal resolve 之后**自动 injectText(command)**,把二段降为一段。背后需要 `TerminalPanel.tsx:357-376` 的 `startAgentTerminal` 改成「等 PTY ready 回调 + claude banner 出现」事件,而不是 1200ms setTimeout 猜测。同时在按钮上加 loading 态(spinner),告诉用户「正在启动 Claude」。
2. **心流宏快照补完**:`AppLayout.tsx:241-247` 的 `flowSnapshotRef` 增加 `windowBounds: { x, y, width, height }`(Tauri `outerPosition/outerSize`),退出心流时如果原本未最大化,`unmaximize()` 之后用 `setPosition/setSize` 还原。同时把 `AppLayout.tsx:777-786` resize 时不再 setDefault,只在越界时夹紧。
3. **`flowScenarioService` 解析失败时显式告知**:`flowScenarioService.ts:42-52` 改为返回 `{ scenarios: FlowScenario[], warning?: string }`(`readFlowScenarios` 返回元组),ScenarioPanel UI 检测到 warning 时显示红色提示条 + 「打开文件修复」按钮。
4. **claude 启动失败引导用户检查设置**:`agentBridge.ts:19-25` 的 `ensureTerminal` 捕获错误,识别 `command not found` 类(`Error.message` 含 'not found' / '无法找到' 等关键字),抛出 `AgentNotFoundError`,ScenarioPanel 拿到后显示「Claude CLI 未找到。请在设置 → AI CLI 里配置 `aiClaudePath`」+ 「打开设置」按钮。
5. **artifact chip 显式标注「新/改」+ 双击 hint**:`AppLayout.tsx:1162-1199` 的 `onWorkspaceChanged` 收到的 `payload.kind` 已经是 'create' / 'modify' / 'remove' / 'rename' / 'other' 之一(`workspaceWatchService.ts:4`),但 `setAgentChangedPaths` 只存 path → ts,kind 丢失。修法:把 `agentChangedPaths` 改为 `Map<path, { ts: number, kind: WorkspaceChangedKind }>`,ArtifactPreview chip 根据 kind 显示「新建」或「修改」小角标。同时给 chip 加显式 hint(图标 + 「单击预览 / 双击打开」tooltip,或 chip 右侧一个小图标)。