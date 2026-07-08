# Typola 文档自动化 MVP 设计

> 对应 GitHub issue #155: `特性规划：引入 Typola 文档自动化能力`

## 目标

Typola 自动化的第一版不是通用工作流平台，也不是 n8n / Node-RED 式画布编排器。MVP 只解决一个窄问题：

让用户把当前文档、选区、AI 工作台、导出产物和产物中心动作组合成可复用、可审阅、可记录的“文档自动化模板”。

一句话定位：

> 自动化是 Typola 文档工作台里的可审阅动作链。

## 调研结论

issue #155 已经给出前期调研来源：nexu-io/open-design、n8n、Node-RED、Home Assistant、Huginn、Obsidian QuickAdd / Templater 和 MCP。把这些模型压到 Typola 里，MVP 只吸收其中最有用的部分：

| 来源 | 适合 Typola 吸收的点 | MVP 取舍 |
| --- | --- | --- |
| open-design | source packet、template、proposal、人类审阅 gate、运行记录 | 保留 Context Packet / Template / Gate / Execution，不做自演进闭环 |
| n8n | 执行记录、模板、调试与生产运行分离 | 保留执行记录，不做节点画布 |
| Node-RED | 消息沿节点流动，适合抽象上下文包 | 保留 Context Packet，不做通用事件总线 |
| Home Assistant | Trigger / Condition / Action 心智简单 | 采用 Trigger / Condition / Action 命名，但 MVP 只开放手动 Trigger |
| Huginn | 事件可追踪、可消费 | 执行记录里保留输入摘要和输出引用，不做常驻 event agent |
| Obsidian QuickAdd / Templater | 编辑器内轻量模板、捕获、命令入口 | MVP 入口放在自动化中心和命令面板 |
| MCP | 未来外部工具边界 | MVP 不调用 MCP，只预留 Action 类型 |

## 非目标

- 不做画布式流程编排器。
- 不做后台自动保存触发、定时触发、文件变更触发。
- 不恢复旧 Electron / Milkdown / 工作区 / 多标签 / 全局搜索实现。
- 不让自动化默认后台修改原文或覆盖文件。
- 不把自动保存作为自动化默认行为；自动保存仍是设置项且默认关闭。
- 不默认开放外部网络、终端命令、MCP 工具或任意文件写入。
- 不做法律行业专项、内测授权、复杂表格锁定或查看原貌链路。

## 概念模型

```text
Trigger
  -> Condition
  -> Context Packet
  -> Action[]
  -> Gate
  -> Sink
  -> Execution
```

### Trigger

触发器描述自动化何时开始。MVP 只支持：

- `manual`: 用户在自动化中心或命令面板手动运行。
- `selection_manual`: 用户从选区动作入口手动运行，前提是模板声明需要选区。

后续再加入 `before_export`、`after_export`、`artifact_created`、`file_changed`、`schedule`。

### Condition

条件用于在运行前拒绝不合适的上下文。MVP 支持最小条件：

- `requiresDocument`: 必须有当前文档。
- `requiresSavedDocument`: 必须是已保存文档。
- `requiresSelection`: 必须有选区。
- `allowedExtensions`: 当前文档扩展名白名单，例如 `[".md", ".markdown"]`。

条件失败只给出可读提示，不进入执行。

### Context Packet

Context Packet 是一次运行的只读输入快照。MVP 结构：

```ts
export type AutomationContextPacket = {
  document?: {
    path?: string;
    name?: string;
    markdown: string;
    dirty: boolean;
    mode: 'markdown' | 'source' | 'docx' | 'html' | 'unknown';
  };
  selection?: {
    text: string;
    anchor?: unknown;
  };
  workspace?: {
    root?: string;
    aiWorkspaceRoot?: string;
  };
  ai?: {
    provider: 'claude' | 'opencode';
    activeConversationId?: string;
    model?: string;
  };
  artifact?: {
    activeConversationId?: string;
    recentArtifacts: Array<{ path: string; kind: string; title: string }>;
  };
  export?: {
    wordPresetId: string;
    htmlPresetId: string;
  };
  sensitivity: 'local-only' | 'sends-to-ai' | 'external-command';
  createdAt: string;
};
```

约束：

- Context Packet 由运行器组装，模板不能直接读取任意本地路径。
- Markdown 源码来自当前编辑器 source，而不是预览 DOM。
- 未保存文档允许参与模板、AI prompt 和插入动作，但需要写磁盘、导出或归档时必须经过 Gate。

### Action

Action 是自动化的最小动作单位。MVP 只开放这几类：

| Action | 说明 | 默认 Gate |
| --- | --- | --- |
| `insert_template` | 把模板文本插入当前编辑器或替换选区 | 无，但运行前 UI 明示会改编辑器缓冲区 |
| `create_artifact` | 在当前会话 `.typola-output/<conversationId>/` 写入 Markdown / JSON / HTML 产物 | 无，仍受 artifact 写入目录限制 |
| `run_ai_prompt` | 复用 AI Workbench 发送 prompt，输出进入产物中心 | 需要用户手动运行模板；不再二次确认 |
| `export_current` | 调用现有 Word / HTML / PDF 导出链路 | 若写入默认导出路径则确认 |
| `archive_artifact` | 复用 Artifact Center 归档到工作区 | 确认 |
| `overwrite_document` | 复用 Artifact Center 覆盖原文与撤销覆盖能力 | 强确认 |
| `append_to_file` | 追加到项目内指定日志或索引文件 | 确认，且仅限项目 `.typola/` 或用户显式选择的文件 |

不进入 MVP 的 Action：

- `run_terminal_command`
- `call_mcp_tool`
- `web_request`
- `file_move`
- `file_delete`
- `watch_directory`

### Gate

Gate 是审阅/确认层。MVP 采用“动作级 gate + 模板级 trust”的组合：

| 动作或能力 | Gate 策略 |
| --- | --- |
| 只读 Context Packet 组装 | 不需要 |
| 插入/替换当前编辑器内容 | 用户手动运行即确认，执行记录记录 before/after 摘要 |
| 发送当前文档/选区给 AI Provider | 用户手动运行即确认，模板卡显示“会发送到 AI” |
| 写 `.typola-output/<conversationId>/` 产物 | 不需要额外确认 |
| 导出到默认路径 | 轻确认，可记住“本模板信任此动作” |
| 归档产物到工作区 | 轻确认 |
| 覆盖原文、移动/覆盖文件、追加项目文件 | 强确认，不允许默认跳过 |
| 终端命令、MCP、外部网络请求 | MVP 不开放 |

受信模板只能跳过轻确认，不能跳过强确认。项目级模板默认不受信；用户全局模板可以由用户在 UI 中标记为受信。

### Sink

Sink 描述输出去哪里。MVP 支持：

- `editor`: 当前编辑器缓冲区。
- `artifact`: `.typola-output/<conversationId>/` + `artifact.json` manifest。
- `export`: 现有 Word / HTML / PDF 导出路径。
- `projectFile`: 项目 `.typola/` 下的日志或索引文件，必须 Gate。

### Execution

Execution 是一次运行记录。MVP 不需要复杂数据库，先用 JSONL 或按文件 JSON 存在：

- 用户全局：`<appConfigDir>/typola/automation-executions/*.json`
- 项目级：`<workspaceRoot>/.typola/automation-runs/*.json`

每条记录至少包含：

```ts
export type AutomationExecution = {
  id: string;
  templateId: string;
  templateSource: 'builtin' | 'user-global' | 'project';
  trigger: 'manual' | 'selection_manual';
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'waiting-for-gate';
  contextSummary: {
    documentPath?: string;
    selectionChars?: number;
    provider?: 'claude' | 'opencode';
    sensitivity: 'local-only' | 'sends-to-ai' | 'external-command';
  };
  actions: Array<{
    id: string;
    type: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
    gate?: 'none' | 'light' | 'strong';
    outputs?: Array<{ kind: 'artifact' | 'file' | 'editor'; path?: string; title?: string }>;
    error?: string;
  }>;
};
```

## 模板存储策略

MVP registry 合并三类模板：

1. 内置模板：随应用发布，只读。
2. 用户全局模板：`<appConfigDir>/typola/automations/*.json`。
3. 项目模板：`<workspaceRoot>/.typola/automations/*.json`。

合并规则：

- `id` 是稳定主键，格式建议 `scope.slug`，例如 `builtin.summarize-current-doc`。
- 项目模板与用户模板不能覆盖内置模板；同 id 冲突时禁用后加载的模板并显示错误。
- 项目模板默认标记 `trusted: false`。
- 用户全局模板可以 `trusted: true`，但强确认动作仍必须确认。
- 模板读取失败不影响应用启动，只在自动化中心显示诊断。

最小模板格式：

```json
{
  "schemaVersion": 1,
  "id": "builtin.summarize-current-doc",
  "title": "生成文档摘要",
  "description": "基于当前 Markdown 生成摘要并写入产物中心。",
  "trigger": { "type": "manual" },
  "conditions": {
    "requiresDocument": true,
    "allowedExtensions": [".md", ".markdown"]
  },
  "context": {
    "includeDocument": true,
    "includeSelection": false,
    "includeRecentArtifacts": false
  },
  "actions": [
    {
      "id": "ask-ai",
      "type": "run_ai_prompt",
      "provider": "active",
      "prompt": "请基于当前文档生成一份 5 条以内的摘要，保存为 Markdown 产物。"
    }
  ],
  "sinks": [{ "type": "artifact" }],
  "permissions": {
    "sendsToAi": true,
    "writesArtifact": true,
    "writesProjectFile": false,
    "overwritesDocument": false,
    "runsCommand": false
  }
}
```

## MVP 用户体验

### 自动化中心

自动化中心第一版放在右侧工作台或设置页入口，目标是能运行和审阅，不追求管理大而全：

- 列表展示内置 / 用户 / 项目模板。
- 卡片展示标题、说明、来源、敏感级别、会做什么。
- 运行前显示 Context Packet 摘要。
- 有 Gate 的动作进入确认弹层。
- 运行后进入 Execution 详情，可打开产物、查看错误、重跑。

### 命令面板

命令面板只暴露可运行模板：

- `运行自动化: 生成文档摘要`
- `运行自动化: 选区改写为发布版`
- `打开自动化中心`

### 内置 MVP 模板

MVP 建议只内置 4 个模板：

1. `生成文档摘要`: 当前文档 -> AI -> Markdown 产物。
2. `选区改写提案`: 当前选区 -> AI -> proposal 产物，不直接替换。
3. `导出前检查`: 当前文档 -> 本地规则检查 -> review.md 产物。
4. `产物归档记录`: 最近产物 -> 追加到 `.typola/artifact-index.md`，需要确认。

这四个模板覆盖 issue #155 要的第一阶段闭环：手动运行、上下文包、最小动作库、审阅 gate、输出 sink、运行记录。

## 与现有模块的集成边界

### AI Workbench

MVP 复用 `useConversationManager.send()` 的 provider-aware 运行路径，不另起 AI runtime。`run_ai_prompt` Action 的 Adapter 只负责：

- 创建或选择自动化专用 conversation。
- 传入 prompt、当前文档路径、附件路径和 Context Packet 摘要。
- 继续使用 `.typola-output/<conversationId>/` 作为产物目录。
- 继续使用现有 `withArtifactWriteGuard` 约束产物写入。

### SkillHub

SkillHub 是模板来源之一，不是自动化运行器。MVP 可以把 SkillHub 的 `buildSkillPrefill()` 结果包装为 `run_ai_prompt` Action，但不让 SkillHub 直接定义危险动作。

长期可以允许 SkillHub 模板声明 `automationTemplateId`，但第一版只做单向复用。

### Artifact Center

Artifact Center 是自动化输出的默认 Sink。MVP 复用现有：

- `ArtifactManifest`
- `ensureArtifactManifest`
- `scan_artifacts`
- `archive_artifact_to_workspace`
- `overwrite_artifact_to_document`
- `undo_artifact_overwrite`
- HTML 产物预览

自动化执行记录只保存 artifact 路径和 manifest id，不复制产物内容。

### 导出链路

`export_current` Action 复用现有 Word / HTML / PDF 导出服务。MVP 不引入新的导出格式，也不绕过导出预设。

### 终端命令

底部终端继续作为用户手动工具。MVP 不提供 `run_terminal_command`，避免把文档自动化变成隐式 task runner。后续若开放，必须走强 Gate、命令预览、工作目录预览和执行记录。

### 文件系统与权限

所有写文件动作都必须通过现有受控路径：

- 当前文档写入走 `write_opened_document` 或编辑器缓冲区。
- 产物写入只进 `.typola-output/<conversationId>/`。
- 项目自动化文件只读 `.typola/automations/*.json`。
- 项目索引/日志写入只允许 `.typola/` 下文件，且必须确认。

## Module 设计

MVP 推荐新增 5 个 Module：

| Module | Interface | Implementation |
| --- | --- | --- |
| `automationRegistry` | `loadAutomationTemplates(workspaceRoot?)` | 合并内置、用户全局、项目模板并返回诊断 |
| `automationContext` | `buildAutomationContext(options)` | 从 AppLayout、编辑器、AI、Artifact、设置组装 Context Packet |
| `automationRunner` | `runAutomation(template, context, gateAdapter)` | 按顺序执行 Action，写 Execution |
| `automationPermissions` | `classifyActionGate(action, templateTrust)` | 集中判断 gate，不散落在 UI |
| `automationExecutions` | `recordExecution(event)` / `listExecutions(scope)` | 记录和读取运行历史 |

主要 Seam：

- Runner 到 UI 的 Seam 是 `gateAdapter.requestApproval(request)`。
- Runner 到 AI 的 Seam 是 `aiActionAdapter.runPrompt(request)`。
- Runner 到产物中心的 Seam 是 `artifactSink.write(input)`。
- Runner 到文件系统的 Seam 是 Rust 受控 commands，不直接用任意路径写入。

这样做的好处是：模板 registry、权限判断、上下文组装和执行记录都可以单测，不需要启动 Tauri 窗口。

## 分期路线

### Phase 0: 文档和模型

- 完成本文档。
- 在 `docs/ARCHITECTURE.md` 记录自动化的架构位置。
- 从 issue #155 拆出垂直切片。

### Phase 1: Registry + 自动化中心壳

- 模板类型、解析、诊断。
- 内置模板和用户/项目模板读取。
- 自动化中心列表、详情、禁用错误模板。

### Phase 2: Context Packet + 手动运行

- 从当前文档、选区、AI Provider、Artifact Center 组包。
- 条件检查。
- `insert_template` 和 `create_artifact`。
- Execution 记录。

### Phase 3: AI Action + Gate

- `run_ai_prompt` 接入 AI Workbench。
- Gate UI。
- Execution 详情可打开产物。

### Phase 4: 导出和归档

- `export_current`。
- `archive_artifact`。
- `append_to_file` 限定到 `.typola/`。

## 可拆分 issue

1. 设计文档与架构入口: 本文档、Architecture、Changelog。
2. 自动化模板 schema 与 registry: 内置/用户/项目模板合并、诊断、测试。
3. 自动化中心 UI 壳: 列表、详情、运行按钮、错误展示。
4. Context Packet 组装: 当前文档、选区、AI Provider、最近产物。
5. Execution 记录: 运行状态、动作状态、输出引用、失败诊断。
6. 本地 Action MVP: `insert_template`、`create_artifact`。
7. Gate 系统: 轻确认、强确认、模板 trust 规则。
8. AI Action 接入: `run_ai_prompt` 复用 AI Workbench 与产物中心。
9. 导出/归档 Action: `export_current`、`archive_artifact`、`.typola/` 追加日志。
10. 自动化命令面板入口: 快速搜索和运行模板。

## 验收标准

- 自动化中心能列出内置模板和项目 `.typola/automations/*.json` 模板。
- 手动运行模板前能看到 Context Packet 摘要和敏感级别。
- 条件失败时不运行，并显示可读原因。
- `insert_template` 能修改编辑器缓冲区但不自动保存。
- `create_artifact` 能写入 `.typola-output/<conversationId>/` 并进入 Artifact Center。
- `run_ai_prompt` 复用当前 AI Provider，产物仍走现有 manifest / chips / 产物中心。
- 覆盖原文、归档、追加项目文件必须显示 Gate。
- Execution 记录能展示每个 Action 的状态、输出和错误。
- 自动保存默认仍为关闭；自动化不改变该设置。

## 当前 Demo 实现

首版 demo 已先落地 MVP 的可见闭环，而不是完整 Phase 1-4：

- 右侧新增自动化中心面板，可从工具栏“自动化”按钮打开。
- 内置 3 个 demo 模板：
  - `插入会议纪要骨架`: 执行 `insert_template`，写入当前编辑器缓冲区，不自动保存。
  - `生成本地摘要产物`: 执行 `create_artifact`，写入 `.typola-output/<conversationId>/automation-*` 并生成 artifact manifest。
  - `发送 AI 摘要 Prompt`: 执行 `run_ai_prompt`，复用当前 AI Provider 和 AI Workbench 会话发送。
- 自动化中心展示当前 Context Packet 摘要、模板动作、Gate/权限说明和最近 Execution。
- Execution demo 记录先存 `localStorage`，用于界面验证；完整版本再迁移到 `<appConfigDir>/typola/automation-executions/` 和项目 `.typola/automation-runs/`。
- 当前 demo 尚未实现用户/项目模板 registry、强 Gate 弹窗、项目 `.typola/` 追加日志、导出 Action 和命令面板入口。
