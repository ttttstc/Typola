# Skill OS M1 设计规约评审报告

- **状态**：评审完成
- **评审对象**：`docs/AI_WORKBENCH_SKILL_OS.md` v2
- **评审方式**：逐文件读码验证（OpenDesign 15 源文件 + Typola 10+ 现有文件）
- **评审约束**：不改代码，只评审
- **日期**：2026-06-18
- **基线分支**：`codex/flow-mode-mvp`
- **评审人**：Claude (Codex)

---

## 总体评价：⭐⭐⭐☆☆（3/5）

**机制层移植判断准确，但 5 处关键遗漏使 M1 无法端到端跑通。**

规约说对了 claude-stream.ts/diagnostics/redact 的可移植性，漏了 session 持久化、Tauri 2 capability 权限、stdin 协议、auth 集成、检测管线不足。不解决则验收标准 §9 过半不通过。

---

## 一、已验证正确的规约断言

| 规约断言 | 文件:行 | 验证结果 |
|---------|---------|---------|
| claude-stream.ts ~620 行，可直接移植 | `claude-stream.ts:1-620` | ✅ 纯 TS/string 解析，0 Node 依赖 |
| diagnostics ~260 行，可直接移植 | `claude-diagnostics.ts:1-262` | ✅ 仅 `path.basename` 可用 shim |
| redact.ts 可直接移植 | `redact.ts:1-226` | ✅ 纯函数 |
| role-marker-guard.ts 可直接移植 | `role-marker-guard.ts:1-298` | ✅ 纯函数 |
| buildArgs 含 stream-json + session-id/resume + bypassPermissions | `claude.ts:52-89` | ✅ 确认 |
| UI 组件深度耦合 OpenDesign 体系，不能直接 copy-paste | `ChatPane.tsx:1-100`（3811 行） | ✅ analytics/i18n/contracts/state 耦合 |

---

## 二、5 处关键遗漏（P0-P1）

### P0-1：Tauri 2 capability 无 spawn 权限

`src-tauri/capabilities/default.json` 没有 `shell:allow-execute` 或 `process:allow-execute`。Rust `std::process::Command` spawn 会被 Tauri 2 权限系统静默拒绝。

- **证据**：`src-tauri/capabilities/default.json:1-20` — 仅有 `core:default`、`dialog:default`、`fs:allow-read-text-file`、`process:allow-restart`
- **影响**：§8 task#1 Rust `agent_headless` 模块不可运行
- **解决**：追加 `shell:allow-execute` 到 default.json

### P0-2：Session 持久层未定义

OpenDesign `agent-session-resume.ts:10-40` 用 SQLite 存 `(conversation_id, agent_id) → session_uuid`。规约 §5 数据流画了 `sessionUuid` 参数传递但未说明存哪。

- **证据**：`agent-session-resume.ts:10-40` — `resolveAgentResumeContext(db, ...)` + `persistCapturedAgentSession(db, ...)` 需数据库实例
- **影响**：§9-3 "再发一句 → resume 多轮，上下文延续" 跨会话不成立。若用内存 Map 则重启后所有对话丢失 resume 能力
- **解决**：用 Tauri store plugin 或 Rust `serde_json` 文件存 `Map<conv_id, session_uuid>`，不引入 SQLite

### P1-3：Stdin stream-json 协议未实现

规约 §3 说 "stdin 写 prompt" 但 `--input-format stream-json` 要求输入是结构化 JSONL（Anthropic user message 格式），不是裸字符串。多轮时还需 `tool_result` 注入。

- **证据**：`claude.ts:53` `--input-format stream-json`；`promptViaStdin: true`
- **影响**：Rust 侧写裸字符串 → claude 解析失败
- **解决**：在 §3 架构图中细化 stdin JSONL 格式合约

### P1-4：Auth probe 未集成到对话流

`claude.ts:26-29` 定义 `authProbe: { args: ['auth', 'status'], timeoutMs: 5000 }`。规约 §8 task#10 提到 "auth 测试" 但未说明何时触发、失败时 UI 表现。

- **证据**：`claude.ts:26-29` — `authProbe` 定义
- **影响**：用户配置无效中转时，对话框发送后静默失败 vs 发送前提示
- **解决**：用户在 Composer 输入时静默 probe → 失败显示黄色警告条（不阻止发送），定义在 §8 task#10 描述中

### P1-5：二进制检测管线不足

规约 §8 task#11 "复用现有 resolve_windows_bare_command" 。但 OpenDesign 有完整检测管线，当前实现不够。

- **证据**：`executables.ts:1-302` — env override → built-in → PATH search → fallback bins → Homebrew/bun/npm prefix → PATHEXT 迭代
- **影响**：无法处理 fallbackBins `['openclaude']`、`CLAUDE_BIN` 环境变量
- **解决**：增强 `normalize_agent_path` 支持 fallbackBins 迭代 + env override，约 +50 行 Rust

---

## 三、UI 移植工作量和剪枝建议

| 组件 | OpenDesign 源 | 行数 | 耦合度 | M1 建议工作量 | 剪枝策略 |
|------|--------------|------|--------|-------------|---------|
| ConversationPanel | ChatPane.tsx | ~3811 | 高（analytics/i18n/contracts） | ~800 行 | 只取消息流骨架，不做虚拟化 |
| AssistantMessage | AssistantMessage.tsx | ~2828 | 中（ToolCard/file-ops） | ~400 行 | 取 prose+thinking+tool 三条分支 |
| ToolCard | ToolCard.tsx | 583 | 低 | ~300 行 | 只实现 5 个高频渲染器 |
| Composer | ChatComposer.tsx | ~4856 | 高（Lexical/mention/slash） | ~200 行 | 用 textarea，不做 Lexical 富文本 |
| ThoughtCard | 嵌入 AssistantMessage | ~100 | 低 | ~80 行 | 折叠卡 + 展开动画 |
| DoneBar | 嵌入 AssistantMessage | ~80 | 低 | ~60 行 | usage 渲染 |
| ErrorRetryCard | AgentDiagnosticRow | ~120 | 低 | ~100 行 | 诊断文本 + Retry/Copy |

**M1 UI 层总量估算**：约 2000 行，在可控范围内。

---

## 四、移植可执行性确认（携 Explore 子代理验证）

| 文件 | 行数 | Node 依赖 | 可移植？ |
|------|------|-----------|---------|
| claude-stream.ts | 620 | 无 | ✅ 直接 |
| claude-diagnostics.ts | 262 | path.basename | ✅ 几乎直接 |
| defs/claude.ts | 99 | 无 | ✅ 直接 |
| role-marker-guard.ts | 298 | 无 | ✅ 直接 |
| redact.ts | 226 | 无 | ✅ 直接 |
| invocation.ts | 43 | child_process | ❌ Rust 重写 |
| launch.ts | 202 | fs (sync) | ❌ Rust 重写 |
| prompt-file.ts | 30 | fs | ❌ 不需（M1 用 stdin） |
| mcp.ts | 27 | 无 | ✅ 直接（M1 不需） |
| ChatPane.tsx | ~3811 | 无 | 代码量大，按剪枝策略取骨架 |
| ChatComposer.tsx | ~4856 | 无 | 用 textarea 替代 |
| ToolCard.tsx | 583 | 无 | ✅ 直接 |
| AssistantMessage.tsx | ~2828 | 无 | 代码量大，按剪枝策略取骨架 |

---

## 五、M1 任务表修正

| # | 原描述 | 修正 |
|---|-------|------|
| **0** | （缺） | **新增**：追加 Tauri 2 capability `shell:allow-execute` + 设计 session 持久层（`serde_json` 文件） |
| 1 | Rust agent_headless：spawn + stdin + stdout + cancel | 追加 sub-tasks：实现 stdin JSONL 格式写 prompt；集成 sessionUuid 持久化读写 |
| 2 | Rust stall 监控 + exit code/stderr | ✅ 不变 |
| 3 | 移植 claude-stream.ts | 裁剪说明：M1 不做 artifact suppression 分支 |
| 4 | 移植 diagnostics + redact | ✅ 不变 |
| 5 | AgentEvent 类型 + useAgentSession hook | 依赖：需 session persistence 接口定义（task#0） |
| 6 | ConversationPanel UI 容器 | 追加：参考 ChatPane 骨架，不做虚拟化 |
| 7 | 子组件：ThoughtCard / ToolCard / DoneBar / ErrorRetryCard | 追加：ToolCard 只实现 5 个高频渲染器（Write/Edit/Read/Bash/Glob） |
| 8 | Composer + ContextChips + ModelSwitcher | 范围定：用 textarea，不做 Lexical/@-mention/slash |
| 9 | 入口按钮 + 左侧栏切换 | ✅ 不变，注意 AppLayout 膨胀 |
| 10 | 模型可配 + auth 测试 | 细化：Composer 输入时静默 probe；失败显示警告条 |
| 11 | 复用 resolve_windows_bare_command | 增强：+ fallbackBins 迭代 + env override（CLAUDE_BIN） |
| 12 | 验证 | 追加：移植 `claude-stream-thinking.test.ts`（3 个现成测试）；IPC 高频事件性能评估 |

---

## 六、验收标准修正建议

| 原标准 | 问题 | 修正 |
|-------|------|------|
| §9-2 打字机效果 | IPC 高频事件（100+ events/sec）未评估 | 追加：确认 UI 60fps 不卡顿，必要时加 requestAnimationFrame 节流 |
| §9-3 多轮 resume 上下文延续 | 依赖 session 持久层 | 追加：重启 Typola 后仍保留 resume 能力 |
| §9-7 全程不碰终端 | 两套引擎关系未定义 | 明确：M1 只测对话框路径，不删终端，两者并行 |

---

## 七、第一步建议

1. **修 spec**：按 §五 补 task#0（capability + 持久层）+ §3 stdin 合约 + §5 持久化
2. **先发 capability 测试**：加 `shell:allow-execute` → 写 5 行 Rust 测 `std::process::Command("claude", ["--version"])` → 验证 spawn 通道通
3. **移植顺序**：机制层（claudeStream + diagnostics，带测试） → Rust spawn（stdin JSONL + session 持久化） → UI 层（消息流 → Composer → 子组件 → 布局切换）
4. **模型**：M1 固定 claude-sonnet-4-6（或用户在设置配的），ModelSwitcher 占位，不实现模型列表查询
