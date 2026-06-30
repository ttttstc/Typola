# Typola AI 工作台 CLI 交互能力补齐方案

> 日期：2026-06-30
> 状态：已按 Codex 评审与用户反馈收敛，待实现
> 分支：`codex/cm6-ai-workbench-cli-reuse`
> 跟踪 issue：[#112](https://github.com/ttttstc/Typola/issues/112)
> 原则：**ponytail full** —— 能复用 open-design 的成熟路径就不自研；不搬 Typola 不需要的平台层
> 参考：`D:\AI\workspace\open-design`（Apache-2.0，复用代码保留 attribution）

## 1. 目标

补齐 Typola 左侧 AI 工作台和 CLI 交互相关的关键能力，让文档工作台具备 OpenDesign CLI 交互的核心体验：

- AI 可以在对话中发起**问答交互卡片**，用户点选/填写后继续当前会话。
- Composer 支持轻量 `/` 命令，覆盖清空、MCP、帮助等高频入口。
- Claude / OpenCode 的 `thinking / text_delta / tool_use / tool_result / artifact_file / usage` 输出能被稳定渲染。
- CLI 写文件的 `artifact_file` 事件进入现有 `.typola-output` / manifest / ArtifactToast / 产物状态链路。
- Codex CLI 先作为**可检测 runtime**进入 AI CLI 识别体系，不立即开放为可发送 Provider。

## 2. 明确不做

这些能力属于 OpenDesign 的平台层，当前 Typola 不搬：

- 不做 Gemini。用户已确认本轮去掉。
- 不做 Cursor Agent / Qwen / Grok 等新增 Provider。
- 不搬 `packages/sidecar*`、HTTP daemon、SSE 路由、外部 `od` CLI。
- 不搬 AG-UI / CopilotKit adapter。
- 不搬完整 `genui_*` surface 平台。
- 不做 OpenDesign 的设计系统、design toolbox、browser preview 工作流。
- 不做右侧 QuestionsPanel 完整管理面板；第一版只做对话内 QuestionForm 卡片。
- 不恢复复杂设置页；AI 执行设置仍保持“检测 CLI”为主。

## 3. 现状与真实复用点

Typola 已复用并标注 Apache-2.0 来源的模块：

```text
src/services/agent/claudeStream.ts
src/services/agent/claudeDiagnostics.ts
src/services/agent/redact.ts
src/services/agent/roleMarkerGuard.ts
src/services/agent/runtime/types.ts
src/services/agent/runtime/registry.ts
src/services/agent/runtime/defs/claude.ts
src/services/agent/runtime/defs/opencode.ts
```

经核对，OpenDesign 中与本次相关的真实路径是：

| 能力 | OpenDesign 真实来源 | Typola 处理 |
|---|---|---|
| Slash 命令 | `apps/web/src/components/ChatComposer.tsx` 中 slash palette / MCP 拦截片段 | 复用模式，做 Typola textarea 版 |
| ToolCard | `apps/web/src/components/ToolCard.tsx` 单文件分派 | 复用单文件分派模式，不创建假想 `toolCards/<name>.tsx` 复刻 |
| QuestionForm | `apps/web/src/components/QuestionForm.tsx` + `apps/web/src/artifacts/question-form.ts` | 只搬 parser + 对话内卡片，不搬 QuestionsPanel / genui |
| Mock CLI | `mocks/mock-agent.mjs`、`mocks/lib/recording-picker.mjs`、`mocks/bin/*`、`mocks/golden/*` | 裁剪到 Claude/OpenCode/Codex 检测需要 |
| Runtime def | `apps/daemon/src/runtimes/defs/codex.ts` | 只取检测元数据；执行参数/parser 后续再做 |

## 4. 功能设计

### 4.1 QuestionForm MVP（补齐问答/交互卡片）

OpenDesign 的问答交互不是 tool call，而是 assistant 正文里输出：

```html
<question-form id="task-type" title="选择任务类型">
{ "questions": [...] }
</question-form>
```

Typola 第一版只实现对话内闭环：

- 在 assistant markdown 中解析 `<question-form ...>...</question-form>` block。
- 正文渲染时把该 block 从普通 markdown 中剥离，替换为交互卡片。
- 支持问题类型：
  - `radio` / 单选
  - `checkbox` / 多选
  - `select`
  - `text` / 短文本
- 用户提交后，自动向当前 active conversation 发送一条 user message。
- 提交文本格式保持简单稳定：

```text
[form answers — <form-id>]
<问题 1>: <答案>
<问题 2>: <答案>
```

- 已提交卡片变只读，显示答案。
- 切换会话后卡片状态跟随 message 本身，不做跨重启持久化。

不做：

- 不做右侧 QuestionsPanel。
- 不做逐题 reveal 动画。
- 不做 genui state sync。
- 不做表单草稿持久化。

### 4.2 Slash Command 最小集

只做 3 个命令，先保证键盘入口够用：

| 命令 | 行为 |
|---|---|
| `/clear` | 清空当前会话，不发送给 agent |
| `/mcp` | 打开 Composer 现有 MCP 面板，不发送给 agent |
| `/help` | 在 Composer 上方显示命令帮助，不发送给 agent |

暂不做：

- `/model`：避免恢复复杂模型设置心智。
- `/plugin`：现有 `+` 菜单已覆盖。
- `/skill`：现有 SkillHub 卡片已覆盖。
- `/compact`：先不承诺 provider 支持。
- `/exit`：关闭工作台已有按钮。

实现方式：

- 新增 `src/components/conversation/commandRegistry.ts`。
- 新增 `src/components/conversation/useSlashCommands.ts`。
- 在 `Composer.tsx` submit 前拦截：命中本地命令则执行本地动作并清空输入；未命中则按普通 prompt 发送。

### 4.3 ToolCard / Thinking / Usage 输出补齐

OpenDesign 没有 `toolCards/<name>.tsx` 目录，真实实现是单个 `ToolCard.tsx` 负责分派。因此 Typola 不新建 9 个组件目录，先增强现有 `src/components/conversation/ToolCard.tsx`。

需要覆盖：

- `TodoWrite`
- `Write` / `write` / `create_file`
- `Edit` / `str_replace_edit`
- `Read` / `read_file`
- `Bash`
- `Glob` / `list_files`
- `Grep`
- `WebFetch` / `web_fetch`
- `WebSearch` / `web_search`
- unknown fallback：展示 tool name + input/result JSON 摘要

Assistant message 事件映射：

| AgentEvent | UI |
|---|---|
| `text_delta` | 追加正文 |
| `thinking_delta` | `ThoughtCard` 可折叠显示 |
| `tool_use` | 创建或更新 ToolCard |
| `tool_input_delta` | 更新 ToolCard inputDelta |
| `tool_result` | 写入 ToolCard result / isError |
| `artifact_file` | 不进入正文；走产物链路 |
| `usage` | DoneBar / footer 显示 token、耗时、成本（有则显示） |
| `error` | ErrorRetryCard |

### 4.4 artifact_file 接现有产物中心

不重写产物中心。复用现有：

- `.typola-output/<conversation>/`
- `ArtifactToast`
- `useArtifactState`
- manifest / scanner / legacy 恢复

补齐行为：

- `useConversationManager` 收到 `artifact_file` 后调用上层 `onArtifactFile`。
- AppLayout 在回调中：
  - 确保 sidecar manifest 存在。
  - 写入 `source.conversationId`、`source.documentPath`、`agent.provider`、`agent.model`、`agent.toolName`。
  - 刷新 `useArtifactState`。
- 产物浮窗不重复显示 sidecar manifest。
- legacy 产物仍显示，但带“旧”标识。

### 4.5 Codex CLI 检测（不执行）

本轮只让 Codex 进入 AI CLI 检测体系：

- 新增 `src/services/agent/runtime/defs/codex.ts`。
- 扩展 runtime registry，使设置页/AI 执行卡片能检测 `codex --version`。
- 不在 Composer Provider 列表里开放 Codex。
- 不实现 Codex parser。
- 不实现 Codex headless send。

原因：

- OpenDesign `codexAgentDef` 是完整执行定义，包含 `buildArgs / promptViaStdin / eventParser: 'codex'`。
- Typola 当前没有 codex stream parser，也没有对应 mock golden。
- 先检测，后执行，避免出现“UI 可选但运行不稳定”的半成品。

### 4.6 Mock CLI / Golden 测试

只引入最小 mock 基础，服务现有 provider 与后续 Codex parser：

- 沿用 OpenDesign 命名：
  - `mocks/mock-agent.mjs`
  - `mocks/lib/recording-picker.mjs`
  - `mocks/bin/claude`
  - `mocks/bin/opencode`
  - 后续需要时再加 `mocks/bin/codex`
  - `mocks/golden/*.events.json`
- mock 输出 provider 原始 stdout JSONL。
- 测试只喂 Typola parser，断言解析后的 `AgentEvent[]`。
- 不让 `format-*.mjs` 直接输出 Typola 已解析事件，避免假阳。

## 5. Phase 拆分

不拆过碎，按用户可感知能力分 3 个 phase。

### Phase 1：对话交互输入补齐

目标：AI 能问，用户能答；用户能用最小 slash 命令控制会话。

范围：

- QuestionForm parser。
- 对话内 QuestionForm 卡片。
- 提交答案后自动发送到当前会话。
- Slash 最小集：`/clear`、`/mcp`、`/help`。
- 单测覆盖 QuestionForm parse/render/submit 与 slash 拦截。

验收：

- assistant 输出 `<question-form>` 后渲染为卡片，不显示原始标签。
- 单选/多选/文本输入能提交。
- 提交后生成一条 user message 并继续当前会话。
- `/clear` 不发给 agent，清空当前会话。
- `/mcp` 打开 MCP 面板。
- `/help` 显示命令说明。
- `npm run typecheck && npm test && cargo check --manifest-path src-tauri/Cargo.toml && npm run tauri:build:local` 通过。

### Phase 2：CLI 输出与产物闭环补齐

目标：Claude/OpenCode 的工具调用、thinking、usage、产物文件都能被读懂和回流。

范围：

- 增强现有 `ToolCard.tsx`，复用 OpenDesign 单文件分派模式。
- 补 `tool_result` 展示。
- 补 usage footer。
- `artifact_file` 接 `ArtifactToast + useArtifactState + manifest`。
- Mock golden 覆盖 Claude/OpenCode tool_use/tool_result/artifact_file。

验收：

- Read/Write/Edit/Bash/Grep/Glob/WebFetch/WebSearch/TodoWrite 有可读卡片。
- unknown tool 有 fallback，不暴露大段难读 JSON。
- tool_result 成功/失败都有状态。
- `artifact_file` 产物进入 `.typola-output` 产物浮窗，并有 manifest。
- legacy/partial/failed 产物不丢。
- 现有 AI 工作台多轮、cancel、resume 不退化。
- 全套验证通过。

### Phase 3：Codex CLI 检测与 Mock 基础

目标：把 Codex 作为可识别 CLI 纳入 runtime registry，并搭好后续执行 provider 的测试地基。

范围：

- 新增 Codex runtime detection def。
- 设置页 / AI 执行卡片能检测 Codex CLI 路径、版本、可用性。
- Codex 不进入 Composer Provider 发送列表。
- 引入裁剪版 mocks 目录与 README。
- 保留后续 Codex parser / execution 的 TODO 和验收入口。

验收：

- 未安装 Codex 时显示清晰诊断。
- 已安装 Codex 时显示版本。
- Composer 仍只允许现有可执行 provider。
- Mock README 说明如何用 PATH overlay 回放 Claude/OpenCode trace。
- 全套验证通过。

## 6. GitHub Issue 拆分建议

只提 1 个 umbrella issue，避免 phase 过碎：

标题：

```text
[v0.6] AI 工作台 CLI 交互能力补齐：QuestionForm、Slash、ToolCard、产物事件与 Codex 检测
```

Issue checklist：

- Phase 1：QuestionForm MVP + slash 最小集。
- Phase 2：ToolCard/usage/thinking 输出增强 + artifact_file 进入产物链路。
- Phase 3：Codex CLI 检测 + mock golden 基础。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| QuestionForm 被误做成 GenUI 平台 | 只做对话内卡片 + submit 文本，不做 QuestionsPanel / genui |
| Slash 命令和现有按钮重复 | 只做 3 个最小命令，按钮仍保留 |
| ToolCard 变成 9 个新组件重构 | 先增强单文件，超过可维护阈值再拆 |
| Codex 检测被误解为可执行 | 文档、UI、验收都明确“检测，不发送” |
| Mock 与真实 parser 脱节 | mock 输出原始 stdout JSONL，测试 parser 产出的 AgentEvent |

## 8. 完成后具备的 OpenDesign CLI 交互能力

完成 3 个 phase 后，Typola 将具备 OpenDesign CLI 交互的核心 70%-80%：

- 流式对话。
- 多轮会话。
- thinking 展示。
- 工具卡片。
- tool result 状态。
- artifact_file 产物回流。
- 问答交互卡片。
- 基础 slash 命令。
- CLI 可用性检测。
- mock/golden 回归基础。

仍不具备、也暂不需要：

- GenUI / AG-UI surface。
- sidecar / daemon。
- 全量 provider 执行。
- OpenDesign design toolbox。
- 完整 QuestionsPanel。

这符合 Typola 的产品定位：文档是中心，AI 工作台是草稿纸和执行助手，不把设计 Agent 平台的复杂度搬进来。
