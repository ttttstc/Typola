# Handoff: Skill OS M1 评审完成，待修 spec 后进入实现

> ⚠️ **2026-06-18 第二轮研判修正**：本文档 P0/P1 定级已被修订，**实施以 `docs/AI_WORKBENCH_SKILL_OS.md` §14 为准**。要点：
> - **P0-1（capability）是误报** —— 不要加 `shell:allow-execute`、不要做 task#0、不必先发 capability 测试。Rust 原生 `std::process::Command`/`portable_pty` spawn 不经 Tauri ACL，现有 `terminal_create`/`agent_detect` 已证明。
> - **P0-2 / P1-4 / P1-5 降级**为非 M1 阻塞（内存 Map / diagnostics 兜底 / 现有解析够用）。
> - **P1-3 采纳但更简** —— 用 `--input-format text` 喂裸 prompt，**不**实现 stream-json input JSONL。

## 状态

Skill OS M1 设计规约评审完成。评审报告：`docs/REVIEW_SKILL_OS_M1.md`

基线分支：`codex/flow-mode-mvp`（PR #55 心流模式 MVP 已合）

**下一步**：修 spec → 进入 M1 实现

---

## 关键发现（实现前必须先修）

### P0（阻塞实现）

1. **Tauri 2 capability 无 spawn 权限** — `src-tauri/capabilities/default.json` 缺 `shell:allow-execute`，Rust `std::process::Command` spawn 会被静默拒绝。实现 task#1 前必须追加。
2. **Session 持久层未定义** — `--resume / --session-id` 需要存 `Map<conv_id, session_uuid>`。M1 用 Tauri store plugin 或 Rust `serde_json` 文件（不引入 SQLite）。

### P1（严重影响交付）

3. **Stdin stream-json 协议未实现** — `--input-format stream-json` 要求 Rust 侧写 JSONL 格式的 Anthropic user message，不是裸字符串。
4. **Auth probe 未集成到对话流** — 需定义：Composer 输入时静默 `claude auth status`，失败显示黄色警告条。
5. **二进制检测管线不足** — `resolve_windows_bare_command` 需增强：+ fallbackBins 迭代（`['openclaude']`）+ env override（`CLAUDE_BIN`）。

---

## 移植代码清单（已验证可移植）

### 直接移植（改 import + 加 Apache 头）

| 源文件 | → Typola 目标 | 行数 |
|-------|-------------|------|
| `claude-stream.ts` | `src/services/agent/claudeStream.ts` | 620 |
| `claude-diagnostics.ts` | `src/services/agent/claudeDiagnostics.ts` | 262 |
| `role-marker-guard.ts` | `src/services/agent/roleMarkerGuard.ts` | 298 |
| `redact.ts` | `src/services/agent/redact.ts` | 226 |
| `claude.ts` (buildArgs) | Rust `agent_headless` 拼参数（翻译成 Rust） | 99 |
| `claude-stream-thinking.test.ts` | 对应单测（3 个现成测试） | 124 |

### UI 层参考重写（参考形态 + 适配重写）

| 源文件 | → Typola 目标 | 估算工作量 | 剪枝策略 |
|-------|-------------|-----------|---------|
| ChatPane.tsx (~3811) | ConversationPanel.tsx | ~800 行 | 只取消息流骨架，不做虚拟化 |
| AssistantMessage.tsx (~2828) | AssistantMessage.tsx | ~400 行 | 取 prose+thinking+tool 三条分支 |
| ToolCard.tsx (583) | ToolCard.tsx | ~300 行 | 只实现 5 个高频渲染器 |
| ChatComposer.tsx (~4856) | Composer.tsx | ~200 行 | 用 textarea，不做 Lexical |
| AgentDiagnosticRow | ErrorRetryCard.tsx | ~100 行 | 诊断文本 + Retry/Copy |
| DoneBar（嵌入 AssistantMessage） | DoneBar.tsx | ~60 行 | usage 渲染 |

### 需 Rust 重写（不可移植）

- `invocation.ts` (43) — Tauri 2 `invoke` 替代 Node `child_process.execFile`
- `launch.ts` (202) — Rust 侧二进制解析 + PATH 构建
- `agent-session-resume.ts` (114) — session UUID 持久化（Rust 简化版）

---

## 建议实现顺序

```
Step 1: Tauri capability 追加（5 分钟）
  → default.json + shell:allow-execute
  → 5 行 Rust 测 std::process::Command("claude", ["--version"])

Step 2: 机制层移植 + 测试
  → claudeStream.ts + roleMarkerGuard.ts + redact.ts + claudeDiagnostics.ts
  → 移植 claude-stream-thinking.test.ts
  → 验证：npm test 通过

Step 3: Rust agent_headless 模块
  → spawn + stdin JSONL 写 prompt + stdout 逐行 emit('agent-stdout')
  → stall 监控 + exit code 收集
  → sessionUuid 持久化（serde_json 文件）

Step 4: useAgentSession hook
  → invoke('agent_session_start'/'agent_resume')
  → listen('agent-stdout') → claudeStream.feed(line)
  → 消息流 state 积累

Step 5: UI 层
  → ConversationPanel（消息流容器）
  → 子组件：ThoughtCard / AssistantMessage / ToolCard / DoneBar / ErrorRetryCard
  → Composer（textarea 版）+ ContextChips + ModelSwitcher（占位）

Step 6: 布局切换
  → Toolbar 按钮 → 左侧栏 ConversationPanel 展开 / 文件树收起
  → 编辑器保持全高
```

---

## 重要参考文件路径

### OpenDesign 源（移植参考）

```
D:\AI\workspace\open-design\apps\daemon\src\
  claude-stream.ts          — stream-json 解析器核心
  claude-diagnostics.ts     — 错误诊断
  role-marker-guard.ts      — 注入防护
  redact.ts                 — 日志脱敏
  runtimes/defs/claude.ts   — buildArgs + authProbe 定义
  runtimes/executables.ts   — 二进制检测管线（参考不移植）

D:\AI\workspace\open-design\apps\web\src\components\
  ChatPane.tsx              — 对话面板（形态参考）
  ChatComposer.tsx          — 输入框（形态参考）
  AssistantMessage.tsx      — 消息气泡（形态参考）
  ToolCard.tsx              — 工具调用卡片（近乎直接移植）

D:\AI\workspace\open-design\apps\daemon\tests\
  claude-stream-thinking.test.ts  — 3 个现成测试
```

### Typola 现有文件（实现上下文）

```
src-tauri/src/lib.rs              — 现有 terminal + watcher 架构
src-tauri/capabilities/default.json — 需追加 shell:allow-execute
src/services/agentService.ts      — 现有 detectAgent
src/services/agentBridge.ts       — 现有 PTY agent bridge（可保留）
src/app/AppLayout.tsx             — 布局（~1781 行，注意膨胀）
src/components/TerminalPanel.tsx  — PTY 终端（保持不动）
```

---

## 可用 skill

- `/plan-eng-review` — 实现前 plan review
- `/review` — 代码 review
- `/qa` — 质量验收

---

## 已知风险提醒

- IPC 高频事件（100+ events/sec text_delta）可能卡 UI → 需要 prototype 验证或加节流
- AppLayout 已 1781 行 → 加 ConversationPanel 切换逻辑会进一步膨胀，考虑抽 layout hooks
- 对话框 + 终端两套引擎并行 → M1 不动终端，M2 再定 unified 方案
