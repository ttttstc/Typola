# 心流模式 MVP · 第二轮评审 + 修复计划 Handoff（给 minimax 执行）

> **评审者**：Claude（产品 + 架构第二轮）
> **评审对象**：`codex/flow-mode-mvp` head `e784760`
> **依据**：实读实现代码（非仅看 minimax 报告）+ `docs/AI_WORKBENCH_SPEC.md` 收敛版 + minimax 5 份评审
> **结论**：MVP 主体扎实、范围严守、headless 删除干净。但 **minimax 的优先级排反了**——它标的 3 个 P0 其实是非功能性窄触发缝隙，而真正破坏主流程的 2 个问题被压在 P1。本文重定级后给可执行修复清单。

---

## 一、第二轮核心结论（与 minimax 的差异）

我逐条复核了 minimax 的 file:line，结果：

| 类型 | 条目 | 我的判断 |
|---|---|---|
| ✅ 确认真问题 | 双重 bracketed paste、自写污染、两步点击、JSON 静默回退、claude-not-found 无引导 | 成立，且部分**应升级** |
| ⬆️ 定级升 | 双重 paste（P1→**P0**）、自写污染（P1→**P0**） | 破坏主注入路径 / 每次保存都误标，是功能性 bug |
| ⬇️ 定级降 | minimax 3 个 P0（debounce / LCS / chip 脉冲）→ **P2** | 均非主流程：分别只在「agent 一次写多文件」「万行文件」「纯动效缺失」触发 |
| ❌ 误报 | P1 #8「UTF-8 解码破坏中文」 | **假问题**，见下 |
| 🔍 漏判 | markdown 产物未渲染（被标 ✓）、remove 事件幽灵 chip | minimax 漏 |

**误报详情（P1 #8）**：`read_opened_document` 在 Rust 端返回 `Vec<u8>`（`lib.rs:163`），到 JS 是 `number[]`。`ArtifactPreview.tsx:46-51` 已用 `new TextDecoder('utf-8')` 解码，且 `[...bytes].map(b => typeof b==='string'?b.charCodeAt(0):b)` 对 number 走直通分支 → 字节正确 → **中文/emoji 运行时不会坏**。唯一瑕疵：`invoke<string>` 类型标注应为 `invoke<number[]>`（无害，归 P2 清理）。minimax 的诊断与修法都基于误读。

**优先级被排反的影响**：若按 minimax 「方案 B：只修 3 个 P0 先合」，会把真正破坏体验的注入 bug 和误标 bug 留到合并后——而它修的是万行文件 diff 这种几乎不触发的边界。**建议改为：先修我的 P0(2) + P1(4)，约 1 天，再合。**

---

## 二、修复清单（重定级）

### 🔴 P0 — 破坏主流程 / 数据状态错乱（合并前必修）

#### P0-A 双重 bracketed paste 包裹（注入路径坏）
- **现象**：claude 输入行收到 `\x1b[200~\x1b[200~命令\x1b[201~\x1b[201~`。内层 `\x1b[201~` 提前结束粘贴，命令行残留转义垃圾，直接破坏 spec §5.3「命令落为可继续编辑的输入行」。
- **根因（架构）**：bracketed paste 包裹泄漏到两层 —— `agentBridge.injectText`（`agentBridge.ts:33` 调 `wrapBracketedPaste`）包一次，`TerminalPanel.sendText`（`TerminalPanel.tsx:383` 内联 `BRACKETED_PASTE_START/END`）又包一次。
- **修复**：spec §10 明确「`agentBridge` = bracketed paste 注入封装」→ **包裹只保留在 agentBridge**。把 `TerminalPanel.sendText` 改为裸写：
  ```ts
  // TerminalPanel.tsx:383
  void writeTerminal(agentTab.termId, text);   // 不再包 BRACKETED_PASTE_*
  ```
  `sendText` 退化为「向 agent 终端写裸文本」的 primitive，单一职责。`BRACKETED_PASTE_START/END` 常量从 TerminalPanel 移除（若无其它引用）。
- **验收**：加单测断言 `injectText` 经 `sendText` 出口后整串**只含一对** `\x1b[200~`/`\x1b[201~`；手动跑 HTML 场景卡，claude 输入行出现干净可编辑命令。

#### P0-B 自写污染 `agentChangedPaths`（每次保存都误标 agent 改动）
- **现象**：用户保存（手动 Ctrl+S / 自动保存 / 场景卡「发送即存盘」）的写盘，被 workspace watcher 当作「agent 改动」→ 文件树脉冲高亮 + 误进产物 chips。破坏「改动可见」的信任承诺；非场景的普通保存也会误标。
- **根因**：opened-document watcher 有 `lastSelfWriteRef` 1500ms 自写抑制（`AppLayout.tsx:1117-1119`），但 workspace-changed handler（`AppLayout.tsx:1172-1184`）**没接这个 ref**，两条路互不通信。
- **修复**：在 `onWorkspaceChanged` 回调入口按现成模式过滤自写路径：
  ```ts
  // AppLayout.tsx onWorkspaceChanged 回调内，setAgentChangedPaths 之前
  const last = lastSelfWriteRef.current;
  const isSelfWrite = (p: string) =>
    sameDocumentPath(last.path, p) && Date.now() - last.at < 1500;
  const paths = payload.paths.filter((p) => !isSelfWrite(p));
  if (paths.length === 0) return;
  // 下面 setAgentChangedPaths 与 setWorkspaceTreeVersion 都改用 paths（不要再用 payload.paths）
  ```
- **局限（写进代码注释）**：`lastSelfWriteRef` 是单槽、只记最后一次自写；多文件并发自写仍可能漏抑制。MVP 可接受（与编辑器同款），Phase 2 升级为「最近写入路径集合（带 TTL）」。
- **验收**：编辑器保存当前文件后，该文件**不脉冲、不进 artifacts**；agent 在 1.5s 后改同一文件仍能正确进 artifacts。

### 🟠 P1 — 体验质量 / spec 偏离（建议合并前修）

#### P1-C 两步点击 → 一步带 loading（spec §5.3 对齐 + 防连点）
- **现象**：首次点「应用到终端」只启动 claude、按钮变「启动完成,点击应用」，需**第二次点击**才注入；启动 async 期间按钮不 disable，可连点触发多次 `ensureTerminal`/注入。
- **根因**：`ScenarioPanel.handleApply`（`ScenarioPanel.tsx:60-95`）把「启动」「注入」拆成两次用户点击；无 `applying`/`disabled` 守卫；`hasAgentTerminal` 认 `'connecting'` 为已存在（`TerminalPanel.tsx:386`），连点会把命令注入到未就绪 pty。
- **修复（改成一步式）**：
  1. `handleApply`：`setApplying(true)` → 若无终端 `await ensureTerminal(...)`（**等真正 ready**）→ `injectText(command)` → `setApplying(false)`；删 `agentStarted` 两段文案。
  2. 就绪判定**别用墙钟**：把 `TerminalPanel.tsx:375` 的 `setTimeout(resolve, 1200)` 换成监听 xterm `onData`，收到 claude banner 特征（如框线字符 `╭`/`╰` 或 `bypass permissions` 文案）后 resolve（带一个兜底超时，如 5s）。
  3. 按钮：`applying` 时 `disabled` + `<Loader2>` 旋转 + 文案「正在启动 Claude…」/「正在注入…」。
- **验收**：单击一次即完成「(必要时)启动→注入」；连点被 disabled 拦；慢机器/Defender 下不出现命令落到未就绪 pty。
- **附带**：本条修完，minimax P1 #4（1200ms 墙钟）一并消解，不必单独修。

#### P1-D JSON 解析失败要可见（别静默吞用户配置）
- **现象**：注册表 JSON 多个逗号/少引号被 `catch` 静默回退默认 seed（`flowScenarioService.ts:50-52`），用户以为「设置被重置」。
- **修复**：
  - `parseFlowScenariosJson` 返回 `{ scenarios: FlowScenario[]; error?: string }`；`readFlowScenarios`（`:59-67`）透传 error。
  - 解析失败时**只读不覆盖**用户文件（不要用 seed 静默 writeback）。
  - `ScenarioPanel` 顶部红条显示 error + 复用 `handleOpenRegistry` 的「打开文件修复」按钮。
- **验收**：故意写坏 JSON → UI 出红条提示，不静默换 seed；修好后恢复正常。

#### P1-E claude 未找到要引导到设置
- **现象**：claude not found / `aiClaudePath` 配错时只显示「启动 agent 终端失败: …」（`ScenarioPanel.tsx:84`），用户不知去哪修。
- **修复**：`ensureTerminal` 失败时检测 `error.message` 含 `not found`/`ENOENT`/`No such file` → 显示「未找到 Claude CLI」+「打开设置」按钮（跳设置面板 AiCliSection）。
- **验收**：清空/写错 `aiClaudePath` → 提示带「打开设置」入口。

#### P1-F markdown 产物未渲染（spec §6.2 偏离，minimax 标成 ✓ 的漏判）
- **现象**：`ArtifactPreview` 对 `kind==='markdown'` 用 `<pre>{content}</pre>` 出**源码**（`ArtifactPreview.tsx:114-115`）。spec §6.2 要求「md → 现有 markdown/Word/公众号预览」。文档工作台身份是「编辑/预览为中心」，产物预览出源码很掉价。
- **修复**：复用现有 markdown 渲染管线（`WordPaperPreviewPane` 内部渲染器，或现成 md→html 渲染）渲染 md 产物；最低限度也要渲染成 HTML 而非裸 `<pre>`。
- **验收**：md 产物 chip 选中后显示**渲染后**文档，不是源码。
- **附带**：需同步纠正 minimax `functional-completeness.md:50`（误标 §6.2 为 ✓）。

### 🟡 P2 — 合并后跟进（去重汇总）

| # | 问题 | file:line | 修法摘要 |
|---|---|---|---|
| P2-1 | Rust watch 无 debounce（agent 一次写多文件时 N 次 IPC） | `lib.rs:362-424` | 加 250ms debounce + path 合并（`notify-debouncer-full` 或手写时间窗聚合）；spec §6.2 本就要求 200–300ms 节流 |
| P2-2 | 产物 chip 缺落盘脉冲动效（文件树有，chip 没有） | `ArtifactPreview.tsx` + `app.css` | 加 `.artifact-chip.just-changed`，复用 `@keyframes agent-changed-pulse` |
| P2-3 | LCS diff 无 size 阈值（万行文件冻 UI） | `textDiffService.ts:17-31` | `diffTexts` 入口加阈值（如总行 >5000 直接提示「文件过大，仅按整体替换处理」）；仅在「查看差异」点击时触发，概率低 |
| P2-4 | remove 事件路径仍进产物 → 幽灵 chip（点了「加载失败」） | `AppLayout.tsx:1175` | `kind==='remove'` 时从 `agentChangedPaths` **删除**而非新增 |
| P2-5 | `ArtifactPreview` 每次 artifacts 变都重读活动文件 | `ArtifactPreview.tsx:39-64` | effect 依赖收窄到 `activePath`；按 path 缓存已读内容 |
| P2-6 | flow 快照不存 windowBounds + 进 flow 重置右栏宽度 | `AppLayout.tsx:658-664, 669` | 快照加 `outerPosition/outerSize`，退出按 bounds 还原；进 flow 不强制 `getDefaultRightPanelWidth()` 覆盖用户宽度 |
| P2-7 | `ARCHITECTURE.md:54` 仍写 "terminal-based design, not yet implemented" | `docs/ARCHITECTURE.md` | 重写为「已实现，见 SPEC §4–§9」 |
| P2-8 | `invoke<string>` 类型标注错（应 number[]） | `ArtifactPreview.tsx:46` | 改 `invoke<number[]>`，删 `typeof b==='string'` 死分支（误报 P1 #8 的真实残留） |
| P2-9 | `FileTreePanel.TreeNode` 未 memo（大 workspace 单文件改动全树 reconcile） | `FileTreePanel.tsx` | `React.memo` + 稳定 key |
| P2-10 | `startAgentTerminal` 内 `closeTab` 未 await `killTerminal` | `TerminalPanel.tsx:368-369` | 等旧 pty kill 后再建新 tab（或确认 termId 不复用即可忽略） |

> minimax 各分报告还列了 ~20 条更细 P2（guidance 字体、edit-link 太隐蔽、错误条无关闭按钮、状态点呼吸动画等），均属打磨，合并后批量跟进即可，不阻塞。

---

## 三、给 minimax 的修复指令（粘贴到 minimax 会话）

```
你是 Typola 心流模式 MVP 的修复工程师。本期只修以下问题，不扩范围。

# 背景
分支 codex/flow-mode-mvp（head e784760），心流模式 MVP 已实现并经两轮评审。
本期按《第二轮评审 + 修复计划》(docs/changes/2026-06-17-flow-mode-review/fix-plan-handoff.md) 修复。
范围依据：docs/AI_WORKBENCH_SPEC.md 收敛版。spec §1「非目标」一律不碰。

# 必读
1. docs/changes/2026-06-17-flow-mode-review/fix-plan-handoff.md（本修复计划，逐条 file:line + 修法 + 验收）
2. docs/AI_WORKBENCH_SPEC.md §5/§6/§8（对位实现）

# 修复顺序（每条改完单独 commit + 报告 + 等确认）
P0-A 双重 bracketed paste（TerminalPanel.sendText 改裸写，包裹只留 agentBridge）
P0-B 自写污染（workspace-changed handler 接 lastSelfWriteRef 1500ms 过滤）
P1-C 两步点击改一步带 loading（onData 监听 banner 替换 1200ms 墙钟 + 按钮 disabled 防连点）
P1-D JSON 解析失败可见（返回 {scenarios,error}，UI 红条 + 不静默覆盖）
P1-E claude-not-found 引导到设置
P1-F markdown 产物渲染（复用现有 md 渲染，不出裸 <pre>）
（P2 本期不做，列入下一 PR）

# 工程纪律
1. 每条改完必跑：npm run typecheck && npm test && cargo check --manifest-path src-tauri/Cargo.toml，全绿才进下一条。
2. 新增测试：P0-A 断言单层包裹；P0-B 断言自写路径不进 agentChangedPaths。
3. 最小 diff，不顺手重构无关代码。spec §1 非目标（选区注入/参数表单/权限开关/重起/git diff/跟随…）一律不碰。
4. P1-C 若 onData banner 识别实现成本高，先和我确认 fallback（如「首个 onData 即视为就绪」），不要擅自留墙钟。
5. commit 中文，前缀 fix:/feat:，参考 git log --oneline -10。

# 报告格式（每条）
- 改了什么（file:line + 关键决策）
- 验证：typecheck/test/cargo 结论（数字）
- 手动验证：tauri dev 里观察到的行为
- 下一条计划

# 开始
先读 fix-plan-handoff.md 全文，从 P0-A 开始，改完停下报告等我确认。
```

---

## 四、合并决策建议

- **不采纳** minimax「方案 B：只修 3 个 P0 先合」——它的 3 个 P0 是非功能性窄触发缝隙，而真正影响体感的注入 bug / 误标 bug 被它压在 P1。
- **采纳**：先修 **P0-A/B + P1-C/D/E/F**（约 1 天），再合 PR。P2（含 minimax 原 3 个 P0）作为 1.5 PR 合并后跟进。
- 修完 P0+P1，MVP 在「主流程正确性 + 体感」上才真正达到可交付。
