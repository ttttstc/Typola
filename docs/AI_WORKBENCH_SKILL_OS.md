# Typola AI 工作台 — Skill OS for Knowledge Workers（设计 Spec v2）

- **状态**：设计稿 v2.1（第一版 = 最小对话框闭环；已并入 minimax 评审的第二轮研判，见 §14）
- **日期**：2026-06-18
- **基线分支**：`codex/flow-mode-mvp`（PR #55 场景卡终端注入 MVP 已合）
- **目标分支**：`codex/skill-os`（从 codex/flow-mode-mvp 起）
- **依据**：CEO review 重新框定 vision + **OpenDesign 0.11.0 真源码**（`D:\AI\workspace\open-design`，Apache 2.0）拆解 + claude headless stream-json 实测
- **取代**：旧 spec 的"场景卡注入终端"形态、plan `binary-petting-avalanche`（output_type 路由 + skill 拷贝）。以本 spec 为准。

---

## 0. 背景与定位

PR #55 的"场景卡 → 注入终端 → 手动回车 → 看 chip"链路割裂。重新定位 Typola = **「Skill OS for Knowledge Workers」**（PM / 架构师 / 博主）：**文档作为产物从 skill 流水线里出来**，用户不感知 CLI。

核心交互改为 **OpenDesign 式对话框（竖在左侧栏）**：点 skill → **左侧 AI 工作台展开**（文件树向左收起让位）→ 多轮对话生成/优化 → 产物回流文档。OpenDesign（同类商业产品，Apache 2.0 开源）的 claude 交互机制 + 工作台界面**直接移植**。

---

## 1. 核心理念

1. **对话式而非一次性** —— 每个「场景 + skill」一个专属多轮对话（固定 session UUID）。
2. **§0.1 骨架原则（强化）** —— App 解析 claude 官方 **stream-json 结构化协议**（不解析 TUI、不猜 agent）。
3. **两套引擎并存** —— 对话框（headless stream-json，日常主力）+ 终端（PTY 交互，高阶/兜底，现有，默认折叠）。
4. **skill 只引用不拥有** —— 引用 `~/.claude/skills/`，不拷内容。
5. **站在 OpenDesign 肩上** —— 机制层近乎直接拷贝，UI 层照搬形态适配重写（见 §4）。

**不做**：通用聊天框、agent 自主探索、可视化 workflow 编辑器、社区 marketplace、多模型路由心智分散。

---

## 布局总览（页面四区）

| 区 | 默认内容 | 说明 |
|---|---|---|
| **左** | 文件树（工作树） | 打开 AI 工作台时文件树**向左收起**，左侧栏切换为 **AI 工作台**（消息流 + 输入框竖排）。收起后留窄图标条，可点回文件树。文件树 ↔ AI 工作台在左侧栏**切换**。 |
| **中** | 编辑器（Vditor，现状） | **始终全高**，不被对话框挤压（这是把对话框从"中下弹出"改为"左侧栏"的主因）。 |
| **右** | 场景(skill) + 产物/预览 | 上段场景/skill 选择，下段产物 chips + 预览（或 tab 切换）。 |
| **底** | 终端（PTY，现有） | 兜底/高阶，默认折叠。 |

**关键**：AI 工作台对话框竖在**左侧栏**，与文件树**切换**（AI 工作台展开 → 文件树向左收起让位）。跟 OpenDesign 原生布局（左对话 / 右预览）一致。

**M1 阶段**：先跑通"左侧 AI 工作台 + 文件树收起切换 + 编辑器全高"；右侧"场景"属 M2（M1 右侧维持现状，产物可后挂）。

---

## 2. 里程碑（M1 是本 spec 重点）

| 里程碑 | 范围 | 状态 |
|---|---|---|
| **M1 最小对话框闭环** | 移植 claude 机制 + 工作台 UI；临时入口直连 claude 跑通多轮对话 + 消息流渲染 | **本 spec 详述** |
| M2 Skill 分类 | **右侧**场景分类导航 + 从 claude 导入 skill + 点 skill 开对话 | 概述 §10 |
| M3 产物回流增强 | "应用到文档/替换选区"按钮 + watcher 浮窗整合 | 概述 §10 |
| M4+ | 选区浮 toolbar / slash / Cmd+P / 多 agent(codex/gemini) / 常驻进程优化 | 概述 §10 |

---

## 3. 架构：Rust spawn + 前端解析

> OpenDesign = Electron（daemon Node 进程 spawn claude）；Typola = Tauri（spawn 必须 Rust 侧）。**关键决策**：Rust 只做"spawn + 原始字节转发"，**复杂的解析逻辑留前端 TS**（直接移植 OpenDesign 的 `claude-stream.ts`，零重写）。

```
┌─ 前端 (React + TS) ────────────────────────────────────┐
│  ConversationPanel (UI 形态抄 OpenDesign)               │
│    ↑ AgentEvent (status/text_delta/thinking/tool_use/   │
│    │             tool_result/usage/error)               │
│  claudeStream.ts  ← 直接移植 OpenDesign claude-stream.ts │
│    ↑ 原始 stdout 行 (JSONL)                              │
│  useAgentSession hook: invoke + listen('agent-stdout')  │
└────────────────────────┬───────────────────────────────┘
                         │ Tauri invoke / event
┌────────────────────────┴───────────────────────────────┐
│  Rust: agent_headless 模块 (新增, 与 terminal_* 并存)    │
│  - spawn claude (buildArgs 移植自 claude.ts)            │
│    Command + piped stdin/stdout (非 PTY)                │
│  - stdin 写 prompt (--input-format text, 裸 prompt)      │
│  - stdout 逐行 emit("agent-stdout", {sessionUuid, line})│
│  - stall 监控 (N 秒无输出 → emit 诊断)                  │
│  - exit → diagnostics (移植 claude-diagnostics.ts)      │
└─────────────────────────────────────────────────────────┘
                         │ spawn (管道)
       claude -p --input-format text --output-format stream-json --verbose [--resume <uuid>] ...
```

**为什么解析放前端**：`claude-stream.ts` 是 620 行成熟 TS，处理了所有边界（partial/非partial、去重、注入防护）。放前端 = 改个 import 直接用；放 Rust = 整段重写。前端解析零重写。

**M1 简化（stdin 用 text 而非 stream-json input）**：OpenDesign 的 `buildArgs` 写死 `--input-format stream-json`，那是为"同进程常驻、mid-conversation 注入"（属 M2 优化）。M1 走"每轮一进程 + `--resume`"，直接用 `--input-format text`（claude 默认）—— stdin 喂**裸 prompt 字符串**即可，**避开 stream-json user message 的 JSONL 拼装**（`claude.ts:48-50` 注释：`claude -p` 无位置参数时从 stdin 读 text，无长度上限）。`--output-format stream-json` 仍保留（解析用）。

**Capability 澄清（防被评审报告误导）**：Rust 用 `std::process::Command` / `portable_pty` spawn claude 是**原生 Rust 调用，不经过 Tauri 2 capability / ACL**（ACL 只管 webview→Rust 的 IPC / plugin 调用）。现有 `terminal_create`（portable_pty，`lib.rs:466`）和 `agent_detect`（`std::process::Command`，`lib.rs:938+`）在 `capabilities/default.json` **无** `shell:allow-execute` 的情况下已正常 spawn claude。**`agent_headless` 同样无需任何 capability 改动**（详见 §14 评审研判 P0-1）。

---

## 4. OpenDesign 源码移植映射（核心）

源仓库：`D:\AI\workspace\open-design`（Apache License 2.0）

### 4.1 ① 机制层 — 近乎直接拷贝（纯 TS，改 import + 加归属头）

| OpenDesign 源文件 | 内容 | → Typola 目标 | 改动量 |
|---|---|---|---|
| `apps/daemon/src/claude-stream.ts` (620行) | stream-json 事件解析器（核心） | `src/services/agent/claudeStream.ts` | 改 import；可裁掉 M1 不用的 artifact 抑制分支 |
| `apps/daemon/src/role-marker-guard.ts` | prompt 注入防护（claude-stream 依赖） | `src/services/agent/roleMarkerGuard.ts` | 几乎不改 |
| `apps/daemon/src/claude-diagnostics.ts` (260行) | 退出/报错 → 人话诊断（**治 auth 混乱**） | `src/services/agent/claudeDiagnostics.ts` | 改 import；保留 redact |
| `apps/daemon/src/redact.ts` | 日志脱敏（diagnostics 依赖） | `src/services/agent/redact.ts` | 不改 |
| `apps/daemon/src/runtimes/defs/claude.ts` 的 `buildArgs` | claude 命令构造 | Rust `agent_headless` 拼参数 | 翻译成 Rust；**M1 改用 `--input-format text`**（见 §3），output 仍 stream-json |

**claude-stream.ts 产出的事件**（即 Typola 的 `AgentEvent`，§6）：`status` / `text_delta` / `thinking_start` / `thinking_delta` / `tool_use` / `tool_input_delta` / `tool_result` / `turn_end` / `usage` / `raw`。

### 4.2 ② UI 层 — 参考重写（形态照搬，代码适配 Typola）

> 这些组件深度耦合 OpenDesign 的 analytics / i18n / `@open-design/contracts` / 自有 state，**不能直接 copy-paste**。照抄 JSX 结构 + CSS + 交互逻辑，用 Typola 的体系重写。

| OpenDesign 源（`apps/web/src/components/`） | 作用 | → Typola 目标 |
|---|---|---|
| `ChatPane.tsx` | 消息流容器（整体骨架） | `src/components/conversation/ConversationPanel.tsx` |
| `AssistantMessage.tsx` | assistant 正文气泡（markdown） | `conversation/AssistantMessage.tsx`（正文复用 `PreviewPane`） |
| `ToolCard.tsx` | 工具调用卡片（名+参数+状态+展开） | `conversation/ToolCard.tsx` |
| `ChatComposer.tsx` | 输入框（多行+发送+快捷键） | `conversation/Composer.tsx` |
| `ContextChipStrip.tsx` | 上下文 chips 行 | `conversation/ContextChips.tsx` |
| `ComposerPlusMenu.tsx` | `+` 附加菜单 | `conversation/Composer.tsx` 内 |
| `InlineModelSwitcher.tsx` | 模型选择器下拉 | `conversation/ModelSwitcher.tsx` |
| `AgentDiagnosticRow.tsx` | stall/错误诊断行 + Retry | `conversation/ErrorRetryCard.tsx` |
| `ContinueInCliButton.tsx` | "在终端继续"（接现有 PTY 终端兜底） | `conversation/ContinueInTerminal.tsx` |
| thinking 折叠卡（在 AssistantMessage 内） | Thought 折叠 | `conversation/ThoughtCard.tsx` |
| Done 状态栏（usage 渲染） | 耗时·token·$ | `conversation/DoneBar.tsx` |

### 4.3 Apache 2.0 归属（合规）

直接拷贝的文件（§4.1）顶部加：

```
/*
 * Adapted from Open Design (https://github.com/nexu-io/open-design)
 * Original: apps/daemon/src/claude-stream.ts
 * Copyright the Open Design authors. Licensed under Apache License 2.0.
 * Modifications: ported to Typola (import paths, ...).
 */
```

仓库根加 `NOTICE` 注明引用 Open Design (Apache 2.0)。无传染性，Typola 不必开源。

---

## 5. 数据流（一轮对话）

```
用户在 Composer 输入 + 发送
  → useAgentSession.send(prompt)
  → invoke('agent_session_start' 或 'agent_resume', {sessionUuid, skillCmd, prompt, cwd, model})
  → Rust spawn claude (首轮 --session-id, 后续 --resume；sessionUuid 存内存 Map) + stdin 写裸 prompt (--input-format text)
  → claude stdout 每行 JSON → Rust emit('agent-stdout', {sessionUuid, line})
  → 前端 listen → claudeStream.feed(line) → onEvent(AgentEvent)
  → useAgentSession 累积 messages state
  → ConversationPanel 渲染 (Thought/正文/ToolCard/DoneBar)
  → claude 退出 → Rust emit('agent-exit', {code}) → 若非 0 跑 claudeDiagnostics → ErrorRetryCard
```

---

## 6. 统一事件协议（`AgentEvent`，源自 claude-stream.ts）

TS 类型（前端 `src/services/agent/types.ts`）：

```ts
type AgentEvent =
  | { type: 'status'; label: string; model?; sessionId?; ttftMs? }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_use'; id; name; input }
  | { type: 'tool_input_delta'; id; name; delta }
  | { type: 'tool_result'; toolUseId; content: string; isError: boolean }
  | { type: 'turn_end'; stopReason: string }
  | { type: 'usage'; usage; costUsd; durationMs; stopReason }
  | { type: 'error'; message: string; code? }
  | { type: 'raw'; line: string };
```

UI 映射：`thinking_*`→Thought 折叠卡；`text_delta`→正文气泡（打字机）；`tool_use`+`tool_result`→ToolCard（按 id 配对）；`usage`→DoneBar；`error`→ErrorRetryCard。

---

## 7. 工作台 UI 形态（照搬 OpenDesign 左侧，见用户截图）

**消息流**（上→下追加）：Thought 折叠卡 · 正文气泡(markdown) · ToolCard(`Edit names.json ›` / `Running ×3, error ›`) · DoneBar(`Done 27m36s · 37218 out · $5.50`) · ErrorRetryCard(诊断文本 + Retry/Copy)。

**输入区**：上下文 chips 行(`当前 index.md ✕`) · 多行输入框 · 底部工具条(`+` · 模型选择器 · 发送) · 对话标题(`场景 · /skill-name`)。

**视觉**：形态 100% 照搬 OpenDesign，配色用 Typola 现有 CSS 变量适配。

---

## 8. M1 范围 + 任务分解（最小对话框闭环）

**M1 目标**：Typola 里点一个入口（工具栏按钮）→ **左侧 AI 工作台展开（文件树向左收起、编辑器保持全高）** → 输入 prompt 直连 claude → 消息流正确渲染（思考/正文/工具卡/Done/错误）→ 多轮 resume 跑通。**先不接 skill 分类/右侧场景**。

| # | 任务 | 文件 | 依赖 |
|---|---|---|---|
| 1 | Rust `agent_headless`：spawn claude（buildArgs 移植，`--input-format text`）+ stdin 写**裸 prompt** + stdout 逐行 emit + cancel；sessionUuid 用**内存 Map**（跨重启持久化属 M2）。**无需改 capability**（§3 / §14 P0-1） | `src-tauri/src/lib.rs`(+模块) | — |
| 2 | Rust：stall 监控（N秒无输出 emit）+ exit code/stderr 收集 | 同上 | 1 |
| 3 | 移植 `claude-stream.ts` → `claudeStream.ts` + `roleMarkerGuard.ts`（加 Apache 头） | `src/services/agent/` | — |
| 4 | 移植 `claude-diagnostics.ts` + `redact.ts` | `src/services/agent/` | — |
| 5 | `AgentEvent` 类型 + `useAgentSession` hook（start/resume/cancel + listen + feed 解析 + 消息流 state） | `src/services/agent/` + `src/hooks/` | 1,3 |
| 6 | UI 容器 `ConversationPanel`（参考 ChatPane） | `src/components/conversation/` | 5 |
| 7 | UI 子组件：ThoughtCard / AssistantMessage / ToolCard / DoneBar / ErrorRetryCard（参考 OpenDesign）。**剪枝**：AssistantMessage 只取 prose+thinking+tool 三分支；ToolCard 只做 5 个高频渲染器（Write/Edit/Read/Bash/Glob），其余降级通用 JSON 展示 | `src/components/conversation/` | 6 |
| 8 | UI 输入区：Composer + ContextChips + ModelSwitcher（参考 ChatComposer 等）。**剪枝**：Composer 用 `<textarea>`，**不做 Lexical 富文本 / @-mention / slash**（属 M4+）；ModelSwitcher 仅占位 | `src/components/conversation/` | 6 |
| 9 | 入口：工具栏按钮开/关 AI 工作台；**ConversationPanel 挂左侧栏，展开时文件树向左收起（左侧栏切换），编辑器保持全高**。AppLayout 已 1781 行，**先抽 layout hooks 再加切换逻辑** | `Toolbar.tsx` / `AppLayout.tsx` / `FileTreePanel` | 6 |
| 10 | 模型：M1 **固定**（设置里配，默认读中转配置），ModelSwitcher 占位、不做模型列表查询。auth 失败由移植的 **claude-diagnostics 兜底**显示人话诊断；输入时静默 probe（黄条）属 M2 增强 | `settingsService` + 设置 UI | 1 |
| 11 | claude 二进制解析复用现有 `resolve_windows_bare_command`（PR#55 已修） | Rust | 1 |
| 12 | 验证：typecheck + test（含 claudeStream 移植单测，OpenDesign 测试可一并移植） + cargo + tauri:build:local | — | 全部 |

**移植带测试**：OpenDesign 有 `apps/daemon/tests/claude-stream-thinking.test.ts` / `claude-diagnostics.test.ts` / `runtimes/claude-resume-args.test.ts`，一并移植，保证解析正确性。

---

## 9. M1 验收标准

1. ✅ 点工具栏入口 → 左侧 AI 工作台展开，文件树向左收起，编辑器保持全高
2. ✅ 输入 prompt 发送 → 实时出现思考流 / 正文（打字机）/ 工具卡片（含展开）/ Done 状态栏（耗时·token·$）；高频 text_delta（100+/秒）下 UI 不卡顿（必要时前端 rAF 节流批量渲染）
3. ✅ 再发一句 → resume 多轮，上下文延续（claude 记得前文）。M1 = **单次运行内**多轮（sessionUuid 内存 Map）；跨重启保留属 M2
4. ✅ claude 报错（auth/模型/连接）→ ErrorRetryCard 显示**人话诊断**（来自 claude-diagnostics）+ Retry
5. ✅ claude 卡死 → stall 检测触发诊断
6. ✅ 模型可在设置配置；auth 失败时 ErrorRetryCard 显示 claude-diagnostics 人话诊断
7. ✅ 全程不碰终端、不手动回车
8. ✅ `npm run typecheck` 干净 / `npm test` 全过（含移植的解析单测）/ `cargo check` 干净 / `tauri:build:local` 出可跑 EXE

---

## 10. M2+ 路线（概述）

- **M2 Skill 分类**：`skill-hub.json`（分类 + skill 引用）；从 headless `init` 事件拿 skill 列表导入；右侧 SkillHub 导航；点 skill → 左侧 AI 工作台开对话（拼 `/skill-name` 首轮 prompt）。砍 ScenarioPanel/flowScenario*。
- **M3 产物回流**：每条回复"插入文档/替换选区/另存"按钮（`EditorCommandHandle` 补 getSelection/replaceSelection）+ workspace watcher 浮窗（复用 ArtifactPreview）。
- **M4+**：常驻 stream-json 进程（省启动）· 选区浮 toolbar · `/` slash · Cmd+P · 多 agent（OpenDesign 已有 codex/gemini/devin def，可继续移植）· 对话历史持久化。

---

## 11. 关键技术决策

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| 1 | 解析放哪 | 前端 TS（直接移植 claude-stream.ts） | 620 行成熟代码零重写 |
| 2 | spawn 放哪 | Rust（agent_headless 模块） | Tauri 架构；与 PTY 终端并存 |
| 3 | 进程类型 | 普通管道（非 PTY） | headless 不需伪终端；OpenDesign 同 |
| 4 | prompt 传递 | stdin + **M1 用 `--input-format text`**（裸 prompt） | 避开 stream-json input 的 JSONL 拼装；兼顾 Windows 命令行长度限制 |
| 5 | 多轮 | M1 每轮 resume，后续常驻 | 先简单健壮 |
| 6 | 权限 | bypassPermissions | 免确认落盘 |
| 7 | UI 移植 | 形态照搬 + 代码适配重写 | 组件耦合 OpenDesign 体系 |
| 8 | license | 直接拷机制层 + Apache 归属头 | Apache 2.0 允许，无传染 |
| 9 | 模型 | M1 固定可配 + claude-diagnostics 兜底 | 中转场景（治 auth 混乱）；模型列表查询属 M2 |
| 10 | session 状态 | M1 内存 Map（conv→uuid） | 跨重启持久化属 M2，不引入 SQLite |
| 11 | UI 富文本 | textarea，不做 Lexical | M1 够用；富文本 / mention / slash 属 M4+ |

---

## 12. 风险

| 风险 | 应对 |
|---|---|
| 用户中转 auth 混乱（CC Switch 多套 env） | 移植 claude-diagnostics（专治）+ 设置"测试连接"（claude auth status） |
| skill 触发 `/skill-name` 的确切拼法 | M2 接 skill 时 spike（M1 是自由 prompt 对话、stdin 裸 text，不依赖） |
| 每轮 resume 启动 ~2-5s | M1 接受 + 状态条提示；后续常驻进程 |
| claude-stream.ts 跨版本变动 | 移植其单测；未知事件走 `raw` 不崩 |
| UI 移植走样 | 对着用户截图 + OpenDesign 组件逐个核对 |
| IPC 高频事件（100+ text_delta/秒）卡 UI | prototype 验证；前端 rAF 节流批量渲染 |
| AppLayout 已 1781 行，加切换逻辑膨胀 | 先抽 layout hooks 再加 |
| `--input-format text` + `--resume` 多轮组合未实测 | M1 第一步 spike 确认（auth 修好后） |

---

## 13. 不在 M1 范围

❌ skill 分类/导入（M2）· 产物"应用到文档"按钮（M3）· 选区浮 toolbar · slash · Cmd+P · 多 agent · 常驻进程 · 终端折叠改造（M1 终端保持现状，对话框是新增临时入口）

---

## 14. 评审研判（对 `docs/REVIEW_SKILL_OS_M1.md` 的回应）

minimax 评审提了 5 个"遗漏"。第二轮独立研判（逐条读码验证）结论 —— **实施以本节定级为准**：

| 评审项 | 研判 | 依据 |
|---|---|---|
| P0-1 capability 拦截 spawn | ❌ **误报，不处理** | Rust 原生 spawn 不经 Tauri ACL；`capabilities/default.json` 无 shell 权限，现有 `terminal_create`（portable_pty，lib.rs:466）/`agent_detect`（std::process::Command，lib.rs:938+）已 spawn claude 正常工作 |
| P0-2 session 持久层（SQLite） | ⬇ **降 P2** | M1 内存 Map 满足单次运行多轮（验收 §9-3）；跨重启保留属 M2，且 serde_json 文件即可，不引入 SQLite |
| P1-3 stdin 协议 | ✅ **采纳，但更简** | 用 `--input-format text` 喂裸 prompt，**不**实现 stream-json input JSONL（见 §3） |
| P1-4 auth probe 集成 | ⬇ **降 P2** | claude-diagnostics 已兜底（对话框显示人话诊断）；输入时静默 probe 是增强 |
| P1-5 二进制检测管线 | ⬇ **降 P3** | 现有 `resolve_windows_bare_command` 够 M1（PR#55 验证）；openclaude fallback / CLAUDE_BIN 是边缘增强 |

**已采纳的有价值点**（并入 §8/§9/§12）：移植解析单测（`claude-stream-thinking.test.ts` 等）、UI 剪枝（textarea / ToolCard 5 渲染器 / ChatPane 取骨架不虚拟化）、IPC 高频事件 rAF 节流、AppLayout 先抽 layout hooks、M1 固定模型。

**⚠️ 实施警示**：`docs/REVIEW_SKILL_OS_M1.md` 与 `docs/handoff-skill-os-m1.md` 里的 **task#0（加 capability）不要执行**，"第一步先发 capability 测试"也不必（现有 spawn 已证明通道通）。两份文档的 P0/P1 定级**以本节为准**。

---

## 附：第一步动手前的前置

1. 确认一个**能用的 claude auth**（你当前中转 token 失效）—— 否则 M1 端到端测不了。可在设置里配，或临时用一个有效中转/官方 auth。
2. 移植从 §4.1 机制层开始（claude-stream.ts + diagnostics），带单测验证，再搭 Rust spawn，最后做 UI。
