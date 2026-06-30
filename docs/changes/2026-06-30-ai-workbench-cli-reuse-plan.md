# Typola AI 工作台全量 CLI 命令/输出复用方案

> 日期：2026-06-30
> 状态：调研完成，待对齐后启动实现
> 前置：分支 `codex/cm6-ai-workbench-cli-reuse`(基于合并后 main `d3fe4dd`)
> 原则：**ponytail full** —— 能复用不自研,所有新增必须经 open-design 验证过的实现
> 参考：`D:\AI\workspace\open-design`(Apache-2.0,Typola 已通过 `Adapted from nexu-io/open-design` 头部引用)

## 1. 用户问题复述

左侧 AI 工作台**不支持对话选项** —— Composer 没有 `/command` 解析(`/model /skill /mcp /plugin /clear` 等);与 agent CLI 交互**没有全量命令/输出** —— agent output 的 tool_call / tool_result / thinking_delta / artifact_file / status / usage 等流的渲染不全;**没有 protocol 化的能力清单**。

## 2. 现状盘点(ponytail 已落地部分)

Typola 已经从 open-design 借走并标注 Apache-2.0 的 8 个文件:

```
src/services/agent/claudeStream.ts            ← apps/daemon/src/claude-stream.ts
src/services/agent/claudeDiagnostics.ts       ← apps/daemon/src/claude-diagnostics.ts
src/services/agent/redact.ts                  ← apps/daemon/src/redact.ts
src/services/agent/roleMarkerGuard.ts         ← apps/daemon/src/role-marker-guard.ts
src/services/agent/runtime/types.ts           ← apps/daemon/src/runtimes/types.ts
src/services/agent/runtime/registry.ts        ← apps/daemon/src/runtimes/registry.ts
src/services/agent/runtime/defs/claude.ts     ← apps/daemon/src/runtimes/defs/claude.ts
src/services/agent/runtime/defs/opencode.ts   ← apps/daemon/src/runtimes/defs/opencode.ts
```

已有但**未走 ponytail** 的部分:

| 缺口 | 现状 | 对应 open-design 路径 |
|---|---|---|
| Composer slash command 解析 | 无,所有功能按钮触发 | `apps/web/src/components/ChatComposer.tsx:736-815` |
| 全量 Agent def (codex/gemini/cursor-agent/qwen/grok/...) | 只有 claude / opencode 两个 | `apps/daemon/src/runtimes/defs/` 25 个文件 |
| Agent capability 检测 (运行后哪些 flag 活着) | 只有 Diagnostics(版本/路径/认证),无 capability map | `apps/daemon/src/runtimes/{capabilities.ts, detection.ts}` |
| tool_call UI 卡片全量渲染 | `AssistantMessage.tsx`(191 行)+ `ToolCard.tsx`(29 行) 较薄 | `apps/web/src/components/AssistantMessage.tsx` + `ToolCards/*` |
| thinking/extended_thinking 折叠块 | 只有 `ThoughtCard.tsx`(粗略) | `apps/web/src/components/ThoughtBlock.tsx` |
| artifact_file 渲染 + 写入产物中心 | `ArtifactToast.tsx`,但 `artifact_file` 事件未被订阅 | `apps/web/src/components/ArtifactToast.tsx` + daemon `artifact-*` routes |
| Mock CLI 录制 → 测试 | 无 | `mocks/{picker.mjs, bin/, lib/format-*.mjs, OD_MOCKS_*}` |

**不**应从 open-design 搬的(边界外):

| open-design 模块 | 不搬原因 |
|---|---|
| `packages/sidecar*` (5 字段 stamp + IPC + 命名空间隔离) | Typola 用 Tauri IPC + 单进程 GUI,不需要 sidecar |
| `apps/daemon` HTTP + SSE 路由 | Typola 没有独立 daemon 进程,走 Rust command + Tauri invoke |
| `packages/agui-adapter` (外部 CopilotKit 兼容) | Typola 当前无外部 AG-UI client 需求 |
| `apps/daemon/src/cli.ts` 27 个子命令 + flag whitelist | Typola 是 GUI-only,外部 `typola` CLI 不在 scope |
| `apps/web/src/components/QuestionForm` + `genui_*` | Typola AI 工作台走自研的 Composer,不走 GenerativeUI surface |

## 3. 目标方案: ponytail 复用边界

按"协议层 / runtime 层 / UI 层"三档分离,只在 protocol & runtime 层复用,UI 层做最小化新增。

### 3.1 协议层(直接搬)

无新增文件 —— claudeStream / roleMarkerGuard / redact 已就位。

### 3.2 runtime 层(搬模式 + 补 def)

**新增目录** `src/services/agent/runtime/defs/` 补 5 个 agent def(让 `listAgentRuntimeDefs()` 真正列出全量):

```ts
// 抄自 apps/daemon/src/runtimes/defs/<agent>.ts,只保留 Typola Tauri 调用需要的字段
codex.ts        // OpenAI Codex CLI
gemini.ts       // Google Gemini CLI  
cursor-agent.ts // Cursor CLI agent 模式
qwen.ts         // 阿里通义千问 CLI
grok.ts         // xAI Grok CLI
```

每个文件结构对齐 `claude.ts`(已搬),字段从 open-design 同名 def 拷过来后删 OD 私有字段(`promptInputFormat` / `promptBudget` / `capabilities` 等 Typola 用不上的)。

**扩展** `src/services/agent/runtime/types.ts`:补 `AgentRuntimeId` union(从 `'claude' | 'opencode'` 扩到 7 项),同步 `registry.ts`。

### 3.3 Slash Command 派发层(搬 dispatcher 模式)

**新增** `src/components/conversation/useSlashCommands.ts` —— 抄自 `apps/web/src/components/ChatComposer.tsx:736-815` 的二分类拦截:

```
/<cmd>                 → 本地动作(打开设置/打开面板/清空会话/重置)
/<cmd> <args>          → 纯文本投给 agent(走标准 send)
```

Typola 实际支持的命令(从 Composer 现有按钮推断 + open-design 子集对齐):

| 命令 | 本地动作 | agent 投递 |
|---|---|---|
| `/model` | 打开模型选择 | 文本 |
| `/clear` | 清空当前会话 | — |
| `/compact` | — | 文本 |
| `/mcp` | 打开 MCP 面板 | — |
| `/mcp <id>` | — | 文本 |
| `/plugin` | 打开插件面板 | — |
| `/skill <name>` | — | 文本(等同 skill prefill) |
| `/skill` | 打开 SkillHub | — |
| `/help` | 显示命令清单弹层 | — |
| `/exit` | 关闭 AI 工作台 | — |

### 3.4 Tool Call / Thinking / Artifact UI(抄 AssistantMessage 全量结构)

**重写** `src/components/conversation/AssistantMessage.tsx` —— 抄自 `apps/web/src/components/AssistantMessage.tsx`,对齐的事件分支:

```
AgentEvent
├── status           → 状态 chip(已实现)
├── text_delta       → 累积到 message.content(已实现)
├── thinking_start   → ThoughtCard 展开
├── thinking_delta   → 累积到 message.thinking(已粗略实现)
├── tool_use         → ToolCard(根据 toolName 分发到 toolCards/<name>.tsx)
├── tool_input_delta → 累积 toolUse.input(已实现)
├── tool_result      → ToolCard.result(目前空白,补)
├── artifact_file    → ArtifactToast + 推入产物中心(目前未订阅)
├── usage            → AssistantMessage footer 加 token + cost
├── turn_end         → 隐藏"生成中"指示器(目前空白)
└── error            → ErrorRetryCard(已实现)
```

**新增** `src/components/conversation/toolCards/` 目录,按 toolName 派发:

```
toolCards/
├── Read.tsx       // 文件读取 → 显示路径 + 大小
├── Write.tsx      // 文件写入 → 显示路径 + 摘要 + 跳转按钮
├── Edit.tsx       // 文件编辑 → 显示 diff 预览
├── Bash.tsx       // 命令执行 → 显示命令 + 退出码 + 输出折叠
├── Grep.tsx       // 内容搜索 → 显示 query + 命中数
├── Glob.tsx       // 文件匹配 → 显示 pattern + 路径列表
├── WebFetch.tsx   // URL 获取 → 显示 URL + 状态
├── TodoWrite.tsx  // 任务列表 → 显示 todos + 状态(已有部分)
└── Default.tsx    // 兜底 → 显示 name + 原始 input JSON
```

每个 tool card 抄 open-design `apps/web/src/components/toolCards/<name>.tsx` 的 props 结构(input / result / isError / status),最小实现先保 view 一致。

### 3.5 Capability 检测(搬 detection 模式)

**新增** `src/services/agent/runtime/capabilities.ts` + `detection.ts` —— 抄自 `apps/daemon/src/runtimes/{capabilities.ts, detection.ts}`:

```
RuntimeCapabilityMap = Record<CapabilityFlag, boolean>
// flags: supports_stream_json | supports_images | supports_mcp 
//        | supports_resume_session | supports_compact | supports_vision
```

`detection.ts` 在 spawn agent CLI 后跑轻量探测(版本 flag / 能力 flag dry-run),写到 `CapabilityRegistry`。给前端一个 `useAgentCapabilities(provider)` hook,Composer 的 `/model` 弹层根据 capabilities 决定显示哪些 model。

### 3.6 Mock CLI 录制系统(搬模式)

**新增** `mocks/` 目录 + `scripts/run-mock.sh`:

```
mocks/
├── README.md
├── picker.mjs                 // OD_MOCKS_TRACE 选择回放
├── bin/
│   ├── claude.cmd             // Windows wrapper,转发到 mock-agent.mjs --as claude
│   └── opencode.cmd
├── lib/
│   ├── format-claude.mjs      // 镜像 Typola src/services/agent/claudeStream.ts 的输出
│   ├── format-opencode.mjs
│   └── trace-loader.mjs       // 从 tests/mocks/*.events.json 加载
└── traces/
    ├── claude-basic.events.json
    ├── claude-tool-bash.events.json
    └── opencode-stream.events.json
```

通过 `OD_MOCKS_TRACE=<trace-id>` env + PATH overlay 在测试/e2e 里调用,不烧 provider budget。

> ⚠️ 必须保证 `format-<agent>.mjs` 的输出 JSONL **逐字段镜像** Typola 的 parser(`claudeStream.ts` / `opencodeStream.ts`)解析路径,否则 golden test 会假阳。

## 4. 文件改动清单(预计)

新增(11):
```
src/components/conversation/useSlashCommands.ts
src/components/conversation/commandRegistry.ts
src/components/conversation/toolCards/{Read,Write,Edit,Bash,Grep,Glob,WebFetch,TodoWrite,Default}.tsx
src/services/agent/runtime/capabilities.ts
src/services/agent/runtime/detection.ts
src/services/agent/runtime/defs/{codex,gemini,cursor-agent,qwen,grok}.ts
src/hooks/useAgentCapabilities.ts
mocks/                                              // 整目录
```

修改(5):
```
src/services/agent/runtime/types.ts                 // AgentRuntimeId union 扩展
src/services/agent/runtime/registry.ts              // includeExperimental / 全量 list
src/components/conversation/Composer.tsx            // 接 useSlashCommands 拦截
src/components/conversation/AssistantMessage.tsx    // 补 tool_use/tool_result/artifact_file/usage/turn_end 分支
src/services/agent/types.ts                         // AgentEvent 不变,确认 toolCall.inputDelta 字段已就位
```

**不动**:open-design 的 sidecar / AG-UI / HTTP daemon / 外部 od CLI —— 边界外,不在 scope。

## 5. 验证策略(参考 OD bug follow-up playbook)

每一步先 red spec 再实现:

1. **Slash commands red spec**:`tests/composer/slash-commands.test.tsx` —— 验证 `/clear` 不送 agent、`/mcp` 打开 panel、`/mcp foo` 送 agent
2. **Tool cards red spec**:`tests/conversation/tool-cards.test.tsx` —— 给一个 mock event 流断言渲染出正确的 card
3. **Capabilities red spec**:`tests/runtime/detection.test.ts` —— mock CLI 输出,验证 flag 集合
4. **Mock CLI golden**:`mocks/golden/*.events.json` diff 守护 parser 回归(防止我重写 format-*.mjs 跟 Typola parser 不一致)

跑通后 `npm run tauri:build:local` 全量验证(用户规则)。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| open-design 25 个 def 中大多数 Typola 永远不会用 | 只搬 5 个高频,def 文件加注释 `// pruned from OD; other defs available upstream` |
| Composer 按钮入口(skill/MCP/...)和 slash 命令重复触发 | slash 优先级最高,按钮保留为"非键盘用户的等价入口",dispatcher 共享底层 |
| 5 个 tool card 一次性实现量大 | 分 PR:① shell (Read/Write/Edit/Bash) ② search (Grep/Glob) ③ net (WebFetch) ④ task (TodoWrite) ⑤ fallback (Default) |
| mock CLI 跟真实 CLI 输出有差 | golden test 维护一份真实 CLI 输出快照,format-*.mjs 跟它对齐 |
| capability 检测 spawn 子进程开销 | 只在切换 provider 时跑一次,缓存到 settings |

## 7. 推荐 PR 拆分

```
PR1 (foundation):
  - runtime/types.ts union 扩展
  - runtime/registry.ts includeExperimental
  - runtime/defs/{codex,gemini,cursor-agent,qwen,grok}.ts
  
PR2 (slash commands):
  - useSlashCommands.ts + commandRegistry.ts
  - Composer.tsx 接入 dispatcher
  - /help 弹层 UI
  
PR3 (tool cards):
  - AssistantMessage.tsx 重写
  - toolCards/{Read,Write,Edit,Bash,Default}.tsx
  
PR4 (tool cards II + artifact):
  - toolCards/{Grep,Glob,WebFetch,TodoWrite}.tsx
  - artifact_file → 产物中心推送
  
PR5 (capabilities):
  - runtime/capabilities.ts + detection.ts
  - useAgentCapabilities hook
  - ComposerPlusMenu 根据 cap 过滤 model
  
PR6 (mocks):
  - mocks/ 整目录 + traces/ + golden tests
```

## 8. 待对齐事项

需要确认才能开干:

1. **是否做 5 个 agent def**(codex/gemini/cursor-agent/qwen/grok)还是先保留 2 个(claude/opencode)只补 capability detection?
2. **toolCards 优先级** —— 先做 shell (Read/Write/Edit/Bash) 还是先做完整 9 个?
3. **slash command 入口是否需要全量键盘面板(Cmd+K 弹层)** —— 还是只做 `/` 前缀拦截就够?
4. **mocks 系统是否本 PR 一起做** —— 还是延后,先靠真实 CLI 测?
5. **artifact_file → 产物中心推送**:是否要做(用户已经通过 `ArtifactToast` + `useArtifactState` 有基础)?