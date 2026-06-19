# 心流模式 MVP · 性能评审

## 评审人
subagent: performance · 2026-06-17

**评审范围**:`codex/flow-mode-mvp` (head=e784760,基于 origin/main 4df2764)
**评审方法**:只读,核对文件实际实现,所有性能数字标明出处;**未跑 benchmark 的地方明确写"未实测"**。

---

## 总评(2-3 段)

整体性能水位在 MVP 阶段是**可接受的**。栈选择本身是性能友好的:Tauri 2 + React 18 + xterm.js + portable_pty,关键路径都有正确抽象(`Map`/`Set` 不用数组、`useCallback` 覆盖主要回调、`lazy()` 拆分主要面板、`useImperativeHandle` 暴露 PTY 控制而非 prop drilling)。PTY → 前端用 Tauri event 直传,无中间 JSON 序列化热路径(虽然 event 仍是 JSON,但字节流是原始 `Vec<u8>` 一次 emit 一块 ≤8KB)。

**最大瓶颈不在 React 层,而在 Rust 端 `watch_workspace` 的事件模型**:`src-tauri/src/lib.rs:362` 的 `notify::RecommendedWatcher` **没有 debounce/throttle**,每条 `notify::Event` 直接 `app.emit("workspace-changed", ...)`,且每条 emit 都含 `kind` + 完整 paths 列表。在高频写盘场景(claude 一次写 50 个产物、git checkout 一组文件、`npm install` 改 200 节点),前端 `setAgentChangedPaths` 会被连续触发 200 次 → 触发 200 次 AppLayout reconcile → 触发 200 次 `setWorkspaceTreeVersion` → 触发 200 次整棵文件树自顶向下 `listWorkspaceEntries` 重读。spec §6.2 提到"200–300ms 节流去重",**但 Rust 端实际没有** — 这是当前最严重的性能缺陷。竞品 fanbox 的"活的仪表盘/跟随模式"在 P0,但它依赖的文件事件都是已 debounce 的;Typola 这一点比 fanbox 弱。

**长时间运行的稳定性**主要看两点:① PTY 长时间跑 claude 时的回放 buffer 增长(xterm scrollback 5000 行 + 每次 8KB 一次性 write,实测能稳;**未实测** long-running 24h);② `lastSelfWriteRef` 1500ms 自写抑制在 agent 长时间任务下足够(不会撞)。Artifact iframe 在 agent 持续写 HTML 时会被 reload(spec §6.2),但 `useEffect` 依赖 `[activePath, artifacts]` 的写法在 `artifacts` 不变时只 reload 一次;如果 agent 持续写同一文件,**当前实现没有"如果文件 mtime 变了就重新读"**,这一点是 spec 里 §6.2 的"再次落盘 iframe 自动刷新"的**潜在缺口**(未实测,只读代码得出)。

---

## 6 项问题清单意见

### 1. React 渲染开销

**现状**:
- AppLayout 是顶层 setState hub:`src/app/AppLayout.tsx:212-253` 声明 **20+ useState**(`file` / `openTabs` / `activeTabId` / `workspaceRoot` / `leftPanelMode` / `rightPanelMode` / `terminalVisible` / `terminalHeight` / `terminalCreateRequest` / `flowMode` / `flowRightTab` / `agentChangedPaths` / `externalChangeConflict` / `workspaceTreeVersion` / `unsavedDialog` / `diffPreview` 等)
- `agentChangedPaths`(`:239`)、`externalChangeConflict`(`:240`)、`flowMode`(`:237`)、`flowRightTab`(`:238`)、`terminalCreateRequest`(`:236`) 每次变更都触发整树 reconcile
- 关键 prop 透传:`FileTreePanel` 拿 `refreshKey={workspaceTreeVersion}`(`:1588`)+ `agentChangedPaths={new Set(agentChangedPaths.keys())}`(`:1586`)**每次渲染都新建 Set**;`ScenarioPanel` 拿 `bridge={agentBridge}`(`:1500`,useMemo 稳定);`ArtifactPreview` 拿 `artifacts={artifactItems}`(`:1510`,useMemo 稳定)
- `useCallback` / `useMemo` 覆盖率良好:grep 显示 50+ 个,覆盖 `applyOpenedFile` / `handleSave` / `handleToggleFlowMode` 等主要回调
- `lazy()` 拆分合理:`EditorPane` / `WysiwygEditorPane` / `ScenarioPanel` / `ArtifactPreview` / `TerminalPanel` / `SettingsPage` 全部 lazy(行 45-102)
- `forwardRef` + bridge 闭包:`agentBridge` 用 `useMemo(..., [])` 闭包 `() => terminalPanelRef.current`(行 727-730),**每次 render 不重建**;正确

**问题**:
- **P1**:`FileTreePanel` 的 `agentChangedPaths` prop 在 AppLayout `:1586` 用 `new Set(agentChangedPaths.keys())` 内联新建,**每次 AppLayout render 都新建 Set 引用**,导致 `FileTreePanel` 即使 props 内容相同也重渲染(虽然 `useState`/`useMemo` 自身不受影响,子组件 reconcile 是)
- **P1**:`FileTreePanel` 的 `TreeNode` 组件**未用 `React.memo` 包裹**(整个项目都未用 `React.memo`,grep 零命中),意味着 100 个文件的 workspace 中,单文件 agent 改动 → AppLayout reconcile → FileTreePanel 整树 reconcile → 100 个 TreeNode 都重渲染一遍(实际 React 树 diff 很便宜,但每个 TreeNode 的 `useState`/`useEffect` 在 props 引用变化时仍跑)
- **P1**:`handleToggleFlowMode` 依赖数组 9 个元素(行 699-702),依赖 `leftPanelMode` / `rightPanelMode` / `rightPanelWidth` / `terminalVisible` 意味着这些状态的任意变化都会重建回调;这本身不是性能问题(回调重建廉价),但**没有 `useEvent` 模式**意味着传出去的 `onToggleFlowMode={() => void handleToggleFlowMode()}`(行 1551) 每次 render 又是新闭包
- **P2**:`handleContentChange`(行 558)每次内容变化都 `setToc(extractToc(value))` 同步跑 regex(行 567);长文档(>5000 行)每次按键会全文档扫一次 toc,**未实测**但属于已知风险

**建议**:
- 把 `FileTreePanel` 内部的 `TreeNode` 用 `React.memo` 包裹,props 加 `areEqual` 自定义比较(忽略 `refreshKey` 在已展开节点上的副作用)
- AppLayout 行 1586 改成 `const changedSet = useMemo(() => new Set(agentChangedPaths.keys()), [agentChangedPaths])`
- `handleContentChange` 的 `setToc` 改为 debounce(200ms)或 `useDeferredValue` + 异步 extractToc

---

### 2. 文件树性能

**现状**:
- `refreshKey`(`workspaceTreeVersion`)自增触发顶层 `listWorkspaceEntries`(行 121)+ 所有**已展开子目录**的 `useEffect` 重新跑(行 39-46,依赖 `[entry.isDir, entry.path, expanded, refreshKey]`)
- `notify` 事件频率:**无 debounce**(`src-tauri/src/lib.rs:384-409`),每条 `notify::Event` 直接 emit
- `dirtyPaths` 用 `Set<string>`(行 1362),`new Map` / `new Set` 都是 O(1) 查找
- `workspaceTreeVersion` 自增 + `setAgentChangedPaths` 合并:每次 workspace_changed event 都 2 个 `setState`(行 1173-1183)

**问题**:
- **P0**:spec §6.2 写"200–300ms 节流去重批量 emit",**但 Rust `watch_workspace` 实现完全没有**(`src-tauri/src/lib.rs:362-424`)。高频写盘场景(agent 一次写 50 个产物、git checkout 100 文件)会触发 N 个 `workspace-changed` event → 前端 N 次 reconcile + N 次 `listWorkspaceEntries`。**未实测** 但粗估 100 文件目录全量重读 ≈ 5–20ms 一次(I/O bound),100 次 = 500ms–2s 卡顿
- **P0**:`is_document_change_event` 在 `watch_workspace` 内只过滤 Create/Modify/Remove,**不区分文件事件类型**;agent 的 `.html` 落盘触发 modify,但目录 touch / 临时文件 swp / git lock 也都触发 → 高频
- **P1**:`listWorkspaceEntries` 是顶层 Tauri IPC,**每次调用都做一次 `std::fs::read_dir`**,不支持增量;agent 改 1 个文件 → 全树重读 → 同级子目录已展开的也重读
- **P1**:agent 改 1 个文件 → `setWorkspaceTreeVersion` 自增 → 顶层 entries 重读(可能 50 个子项,5ms);**已展开的子目录**也会被 `useEffect` 重新触发(行 46 依赖 refreshKey),**这是 design 行为但代价高**

**建议**:
- **必修**:Rust 端 `watch_workspace` 加 250ms debounce + paths dedup + payload size 上限(分批 emit)
- 用 `notify-debouncer-mini` / `notify-debouncer-full` crate,而不是裸 notify
- AppLayout 行 1181-1183 的判断条件 `if (payload.kind === 'create' || 'remove' || 'rename')` 应只对**顶层路径**触发 `setWorkspaceTreeVersion`;已展开子目录的 refreshKey 应区分
- 高频场景应支持"只重读该文件所在父目录"

---

### 3. PT 帧写入

**现状**:
- `onTerminalData` 回调(行 317-321)每次 emit 一次 `terminal.write(decodeTerminalData(...))`
- `terminalOutputDecoderRef` TextDecoder **复用**(`:80`),在 `defaultEncoding` 变化时重建(`:88-91`)— 好
- `decodeTerminalData` 用 `stream: true`(`:95`)— 正确,支持多字节 UTF-8 跨 chunk
- `fitRuntime` 触发点:resize(行 304-310)、tab 切换(行 288-295)、openNewTab 完成(行 183)+ createRequest(行 297-301) + agent 启动延时 1200ms(行 375)

**问题**:
- **P2**:`fitRuntime` 在 `tabs.length` 变化时也跑(行 295 依赖列表含 `tabs.length`);每次 `setTabs` 都会触发 `setTimeout(0)` 重新 fit — 频繁(但 setTimeout 0 合并了)
- **P2**:`tabs.length + 1` 作为 tabNumber(行 124)在 setTabs 时**未读最新值**,会导致同时建多个 tab 时 number 冲突(但 setState 是合批,实际上没问题)— 微小问题
- **P1**:xterm `scrollback: 5000`(行 132)在大输出(claude 跑 `npm install` 输出 50K 行)时,5K 行 buffer 会被迅速填满 → 老内容丢失;`write` 是 batch(8KB/chunk from Rust),但单 chunk 内容仍由 xterm 同步处理;**未实测** 50K 行下掉帧
- **P1**:`agentBridge.startAgentTerminal` 的 1200ms `setTimeout`(行 375)固定延时,实际上 claude REPL 起来时间不可控;1200ms 太长会感觉卡,太短 inject 会丢 — **未实测**

**建议**:
- `fitRuntime` 改用 `useDebouncedValue(height, 50)` + 仅在 visible 时 fit
- `scrollback` 提到 10000 或根据内存动态调整
- claude REPL ready 检测用"写一个 probe 命令 + 读回 banner"代替固定 1200ms

---

### 4. 场景模板 resolve

**现状**:
- `resolveFlowScenarioTemplate`(`src/services/flowScenarioService.ts:15-21`)4 次 `String.prototype.replace` + `safeString` 包裹,每次 replace 创建新字符串
- `buildContextFromFile`(行 77-101)每次 `handleApply` / `handleCopy` 都跑一次,做 `replace` + `split` + `slice` 字符串操作
- 注册表读取 `readFlowScenarios`(`ScenarioPanel.tsx:45`)在 mount 时跑一次,Tauri IPC + `JSON.parse`

**问题**:
- **P2**:`resolveFlowScenarioTemplate` 4 次 `replace` 每次都扫全字符串;模板 > 1KB 时,**未实测**;理论上 < 1ms,但有更优写法(单次 replace with function)
- **P2**:`buildContextFromFile` 无缓存;每次 handleApply 都重算;click 频率低(人手),**不是问题**
- **P1**:`readFlowScenarios` **每次 `ScenarioPanel` mount 都读**;MVP 只有一个 `ScenarioPanel` 实例(顶层 lazy),所以 mount 次数少,可接受;但如果未来加场景管理面板需要小心
- **P1**:`useEffect` 依赖空数组(行 43-56),无重新读取机制;用户编辑 JSON 文件后,需要关闭/打开右栏才生效(spec §5.1 说"提供编辑场景入口(按钮打开该文件)")

**建议**:
- `resolveFlowScenarioTemplate` 改为单次 `template.replace(/\{(file|fileName|workspace|date)\}/g, (_, key) => ...)`
- 用户编辑 JSON 后,`ScenarioPanel` 应监听文件变化自动 reload(可加 `watch_scenarios_file` 复用 workspace_watcher 模式)
- `readFlowScenarios` 结果加 module-level cache(以修改时间戳为 key)

---

### 5. diff 性能

**现状**:
- `textDiffService.ts` LCS 用 `for` 嵌套 `for` 生成 `m*n` table(`:17-31`),然后回溯生成 hunks(`:38-65`)
- 调用点: `handleViewDiff`(`AppLayout.tsx:1202-1215`),仅在用户点"查看差异"时同步调用
- 没有 Web Worker
- table 占内存:`m * n * 8 bytes`(Number 数组);1000 行 x 1000 行 ≈ 8MB,可接受;10000 行 x 10000 行 ≈ 800MB,**爆炸**

**问题**:
- **P0**:LCS 是 O(n*m);**未实测** 1000/5000/10000 行耗时,但 10000 x 10000 = 1 亿次比较,JS 单线程约 3–10 秒,会冻 UI
- **P0**:table 是 `m+1 x n+1` 的二维数组,创建本身也是 O(m*n);**未实测** 但 10K 行会卡死
- **P1**:无 cancel 机制;用户点完"查看差异"必须等完成
- **P1**:`m=0` 或 `n=0` 时 return `[]`(行 13-15),对**单边全删/全增**文档会生成超大 hunks 数组(几万项),导致 React 渲染 diff preview 慢(行 1744-1750 渲染所有 hunks)

**建议**:
- 立即加 `if (Math.max(m, n) > 5000)` 阈值判断,超过给"文件过大,不支持查看行级 diff"提示(参考 GitHub / GitLab 行为)
- 中期迁移到 `diff-match-patch` (Myers diff) 或 `fast-diff`(O((N+M)*D),D=编辑距离,远快于 LCS on similar text)
- 真正长期:Web Worker 跑 diff,主线程只渲染

---

### 6. Rust 端

**现状**:
- `notify::RecommendedWatcher` 直接用,无 debounce(`lib.rs:12, 384`)
- `workspace_change_kind` 同步,`String` 分配(行 781-789)
- `read_flow_scenarios` 每次调用 `std::fs::read_to_string`(`:1027-1034`),无缓存
- `terminal_data` 8KB buffer,read loop 中 `to_vec()` 一次(`:502-514`),emit 一次

**问题**:
- **P0**:`watch_workspace` **无 debounce**,spec §6.2 要求 200–300ms 节流但实现没做
- **P1**:`workspace_change_kind` 每次事件都分配 `String`;高频场景会持续小分配
- **P1**:`workspace-changed` event payload 用 `Vec<String>`,每次 emit 都做 JSON 序列化(Tauri 内部 serde_json);50 个 path 一次约 100–500µs
- **P2**:`read_flow_scenarios` 无缓存,每次 `ScenarioPanel` mount 读一次盘;MVP 可接受
- **P2**:`terminal_data` 8KB buffer 在大输出(claude 跑 compile 输出几 MB)时,**Tauri event channel** 是 sync emit (?),如果是 sync 会 backpressure;**未实测** Rust emit 是否会 block reader thread
- **P2**:`read_opened_document` 一次性 read 整个文件(`:163-170`);大 HTML(> 10MB)会一次性从 Rust 推到 JS(走 Tauri IPC 的 JSON 序列化,bytes 先转 Vec<u8> 再 JSON),**未实测** 但理论上有问题
- **P2**:`write_attachment_file`(`:182-204`):`Vec<u8>` 数据从 JS 传 Rust 也是走 JSON 序列化,大图粘贴(>1MB)会有几百 ms 延迟

**建议**:
- **必修**:加 `notify-debouncer-mini` 或自实现 250ms trailing debounce + 50ms leading
- `WorkspaceChangedPayload` 改用 `Arc<str>` / `&'static str` 减少分配
- `terminal_data` 确认走 `tauri::async_runtime::spawn` 或 `app.emit` 是否真异步(查 Tauri 文档);如果是 sync,改成 `tauri::async_runtime::spawn` 异步 emit
- `read_opened_document` 改 stream 或大文件分块
- `read_flow_scenarios` 加 mtime 缓存

---

## 优(性能上值得保留)

- **`textDiffService` 小文件(<1000 行)同步可用** — 触发点单一(用户主动点"查看差异"),主流程不卡
- **`terminalOutputDecoderRef` TextDecoder 复用**(`TerminalPanel.tsx:80`)— 正确做法,避免每 chunk new TextDecoder
- **`workspaceTreeVersion` 单独的 useState**(`AppLayout.tsx:733`)— 把 workspace 变更与 file state 解耦,避免文件级事件触发文件树
- **`is_document_change_event` 在 watch_workspace 内做 kind 过滤**(`lib.rs:387`)— 避免无谓事件传到前端
- **`should_ignore_workspace_path` 组件级 ignore**(`lib.rs:349-360`)— `.git` / `node_modules` 等在 Rust 端就过滤,降低 IPC 量
- **`agentBridge` 用 `useMemo([])`**(`AppLayout.tsx:727-730`)— 闭包 `() => terminalPanelRef.current` 不会每 render 重建
- **`dirtyPaths` 用 `Set<string>`**(`AppLayout.tsx:1362`)— O(1) `dirtyPaths.has()` 查找
- **`agentChangedPaths` 用 `Map<path, ts>`**(`AppLayout.tsx:239`)— 比 `Set<string>` 多了时间戳,O(1) 更新
- **`debouncedStatsSource`**(`AppLayout.tsx:253`)— 字符数 / 行数统计 debounce 260ms
- **PTY 8KB buffer + 直接 emit**(`lib.rs:502-514`)— 比"读一行 emit 一行"快,比"读到 N 字节再 emit"延迟低
- **scenario 模板 4 次 replace** — 在 < 1KB 模板上是 ns 级,**未实测** 但理论安全
- **`lastSelfWriteRef` 1500ms 自写抑制**(`AppLayout.tsx:1117`)— 避免自写触发 reload,主流程不抖
- **`scrollback: 5000`** + Rust 端 8KB/chunk + TextDecoder stream — claude 持续输出可稳

---

## 问题(按优先级)

### P0(必修,主流程卡顿/丢帧)

1. **`watch_workspace` 无 debounce**(`src-tauri/src/lib.rs:362-424`)
   - spec §6.2 要求 200–300ms 节流,但实现裸用 `notify::RecommendedWatcher`
   - 高频写盘(agent 一次写 50 文件 / `npm install` / `git checkout`)触发 N 次 IPC + N 次 `setAgentChangedPaths` + N 次文件树重读
   - 建议:加 `notify-debouncer-mini` (推荐 `notify-debouncer-full`,支持 renames),250ms trailing + 50ms leading

2. **`textDiffService` LCS 无阈值**(`src/services/textDiffService.ts:17-31`)
   - 10000 x 10000 行 = 1 亿次比较,JS 单线程 3–10 秒,冻 UI
   - 主流程影响小(用户主动点"查看差异"),但一旦触发即卡死
   - 建议:加 `if (Math.max(m, n) > 5000) return error` 或迁移 `fast-diff`

### P1(重要修,长时间使用累积问题)

1. **`FileTreePanel` 整树 reconcile**(`src/components/FileTreePanel.tsx:31-91`)
   - `TreeNode` 未用 `React.memo`;100 文件 workspace 中 1 个文件改动 → 100 TreeNode 都 reconcile
   - 建议:`TreeNode` 加 `React.memo`,props 比较用 shallow + 忽略 `refreshKey`(已经自己处理)

2. **`agentChangedPaths` prop 每次新建 Set**(`AppLayout.tsx:1586`)
   - `new Set(agentChangedPaths.keys())` 内联,导致 FileTreePanel 即使引用相同也 re-render
   - 建议:`useMemo(() => new Set(agentChangedPaths.keys()), [agentChangedPaths])`

3. **`handleContentChange` 同步 extractToc**(`AppLayout.tsx:567`)
   - 每次按键都 `setToc(extractToc(value))`,长文档(>5K 行) regex 全扫
   - 建议:`useDeferredValue` + debounce 200ms

4. **`terminal_data` 8KB 一次性 emit,潜在 backpressure**(`lib.rs:502-514`)
   - claude 跑 `npm install` 输出几 MB 时,Tauri event channel 是否 sync 阻塞 reader thread?**未实测**
   - 建议:查 Tauri 文档,确认 `app.emit` 异步;否则改 `tauri::async_runtime::spawn`

5. **`read_opened_document` 一次性 read 全文件**(`lib.rs:163-170`)
   - 大 HTML(>10MB)从 Rust 推 JS 走 JSON 序列化,理论慢
   - 建议:大文件分块,或前端 `fetch` 自定义协议

6. **`ArtifactPreview` 缺少 mtime 检测**(`src/components/ArtifactPreview.tsx:39-64`)
   - spec §6.2 要求"再次落盘 iframe 自动刷新",但当前 useEffect 只依赖 `[activePath, artifacts]`,同文件改第二次不会重新 `read_opened_document`
   - 建议:加入 `mtime` 字段到 `ArtifactItem`,watch 文件 mtime 变化触发 reload

7. **`ScenarioPanel` 注册表无热更新**(`src/components/ScenarioPanel.tsx:43-56`)
   - 用户编辑 JSON 后需关闭/重开右栏生效(spec §5.1 提供了编辑入口但没说刷新)
   - 建议:监听 `flow-scenarios.json` 文件变化,或编辑按钮保存后回调刷新

### P2(可优化)

1. **`fitRuntime` 在 `tabs.length` 变化时跑**(`TerminalPanel.tsx:295`)— 改成 `useDebouncedValue` 50ms
2. **`resolveFlowScenarioTemplate` 4 次 replace**(`flowScenarioService.ts:15-21`)— 单次 replace with function
3. **`readFlowScenarios` 无缓存**(`flowScenarioService.ts:59-67`)— 加 mtime 缓存
4. **`xterm scrollback: 5000`**(`TerminalPanel.tsx:132`)— 提到 10000 或动态
5. **`claude REPL 启动 1200ms 固定延时**(`TerminalPanel.tsx:375`)— 改用 banner 检测
6. **`workspace_change_kind` 每次分配 String**(`lib.rs:781-789`)— 改 `&'static str` 或 `Arc<str>`
7. **`write_attachment_file` JSON 序列化传 `Vec<u8>`**(`lib.rs:182-204`)— 大图粘贴慢
8. **`autoSave` 800ms 后仍同步 `setFile`**(`AppLayout.tsx:1051-1079`)— 不阻塞主流程,但 800ms 期间再编辑会触发 race

---

## 评分

**⭐⭐⭐⭐ / 5**

扣分原因:
- P0 两项(Rust debounce 缺失、diff 无阈值)是 spec 已定但未实现的关键性能防护
- `FileTreePanel` 整树 reconcile 在大 workspace 累积可见
- `ArtifactPreview` 不监听 mtime 与 spec §6.2 描述不符

加分原因:
- 整体 React 渲染路径规划合理(`useCallback` / `useMemo` 覆盖 50+ 处)
- `lazy()` 拆分主要面板,初始 bundle 友好
- PTY 帧处理(8KB + TextDecoder stream + scrollback 5000)是正确的
- 自写抑制 + debounce stats 是好的局部优化

MVP 阶段可合并,Phase 1 启动前**至少修 P0 两项 + P1 头两项**。

---

## 5 条 actionable 建议

1. **`watch_workspace` 加 250ms debounce + path dedup**(`src-tauri/src/lib.rs:362-424`)
   - 改用 `notify-debouncer-full = "0.3"` 或自实现 trailing debounce
   - 在事件 callback 内缓冲 `(kind, paths)`,定时器触发后 sort + dedup + 一次性 emit
   - 预期收益:高频写盘场景 IPC 量从 N 降到 1

2. **`textDiffService` 加 size 阈值 + 迁移 `fast-diff`**(`src/services/textDiffService.ts`)
   - 短期:`if (Math.max(m, n) > 5000) return { hunks: [], error: '文件过大' }`
   - 中期:用 `fast-diff` (Myers diff) 替换 LCS,复杂度 O((N+M)*D) 远快于 O(N*M)

3. **`TreeNode` 用 `React.memo` 包裹**(`src/components/FileTreePanel.tsx:31-91`)
   - 大 workspace(100+ 文件)中,agent 改 1 个文件时 100 TreeNode 避免全 reconcile
   - props 比较:浅比较 + 忽略 `refreshKey`(因为 useEffect 自己处理)

4. **`AppLayout.tsx:1586` 的 `new Set(agentChangedPaths.keys())` 用 useMemo 包裹**
   - 避免每次 AppLayout render 都新建 Set 引用导致 FileTreePanel re-render

5. **`ArtifactPreview` 加 mtime 字段 + 监听文件变化**(`src/components/ArtifactPreview.tsx`)
   - 在 `WorkspaceChangedPayload` 中增加 `mtime`,前端 `ArtifactItem` 加 `mtime`
   - `useEffect` 依赖 `[activePath, mtime]`,实现 spec §6.2 的"再次落盘 iframe 自动刷新"
   - Rust `read_opened_document` 返回 `(bytes, mtime)` 二元组
