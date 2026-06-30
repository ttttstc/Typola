# Typola 分阶段实施规划：合并版 Issue 拆分

> 面向 Codex 拆分 Issue / PR 实施。  
> 本版本将原先较细的 21 个 issue 合并为 **8 个中等粒度 issue**，更适合实际推进：每个 issue 都有完整目标、实现范围和验收标准，但避免过细导致管理成本过高。  
> 本规划不建立 `src/vendor/open-design/` 目录。若复用 open-design 代码，直接复制到 Typola 正式模块目录，并在文件头保留来源说明与 Apache-2.0 attribution。

---

# 1. 总体目标

Typola 下一阶段目标是从“有 AI 能力的 Markdown 编辑器”升级为：

> **本地优先、可诊断、可追踪产物的一站式 AI 文档工作台。**

核心建设顺序：

```txt
v0.4：AI 执行控制中心
  先让 AI 跑得稳、看得懂、能诊断。

v0.5：Artifact 产物库
  再让 AI 产物可追踪、可操作、可交付。

v0.6：STYLE.md 文档风格系统
  最后让 AI 按工作区文档风格持续产出。

v0.7：工作台体验整合
  把入口、右栏、首页、隐私安全说明打磨成完整工作台体验。
```

---

# 2. 基本原则

## 2.1 保持 Typola 主架构

继续保持：

```txt
Tauri v2
React 19
Vite
TypeScript
Rust backend
Vditor / CodeMirror
本地 Claude/OpenCode CLI
```

不做：

```txt
不迁移 Electron
不迁移 Next.js
不引入 open-design daemon
不整体 fork open-design app
不改变现有 skill 体系
不默认引入 BYOK / 云端 API Key
```

---

## 2.2 open-design 复用原则

可以复用 open-design 的成熟模块，但方式是：

```txt
直接复制到 Typola 正式目录
而不是建立 src/vendor/open-design/
```

复制文件头统一保留：

```ts
/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/types.ts
 * Modifications: adapted for Typola Tauri runtime and document workspace model.
 */
```

---

# 3. open-design 可复用范围

## 3.1 推荐直接复制并改造

| open-design 来源 | Typola 目标目录 | 用途 |
|---|---|---|
| `apps/daemon/src/runtimes/types.ts` | `src/services/agent/runtime/types.ts` | Agent Runtime 类型 |
| `apps/daemon/src/runtimes/registry.ts` | `src/services/agent/runtime/registry.ts` | Agent 注册表 |
| `apps/daemon/src/runtimes/defs/claude.ts` | `src/services/agent/runtime/defs/claude.ts` | Claude 参数构造 |
| `apps/daemon/src/runtimes/defs/opencode.ts` | `src/services/agent/runtime/defs/opencode.ts` | OpenCode 参数构造 |
| `apps/daemon/src/runtimes/diagnostics.ts` | `src/services/agent/runtime/diagnostics.ts` | 诊断模型 |
| `apps/daemon/src/runtimes/prompt-budget.ts` | `src/services/agent/runtime/promptBudget.ts` | prompt 长度判断 |
| `apps/web/src/components/AgentDiagnosticRow.tsx` | `src/components/agent/AgentDiagnosticRow.tsx` | 诊断 UI |
| `apps/web/src/components/modelOptions.tsx` | `src/components/agent/ModelSelect.tsx` | 模型选择 |
| `apps/web/src/artifacts/manifest.ts` | `src/services/artifacts/manifest.ts` | Artifact manifest |
| `apps/web/src/artifacts/parser.ts` | `src/services/artifacts/parser.ts` | Artifact parser |
| `apps/web/src/artifacts/recover.ts` | `src/services/artifacts/recover.ts` | AI 输出恢复 |
| `apps/web/src/artifacts/validate.ts` | `src/services/artifacts/validate.ts` | Artifact 校验 |

---

## 3.2 只借鉴，不直接复制

| open-design 来源 | 处理方式 | 原因 |
|---|---|---|
| `SettingsDialog.tsx` | 借鉴信息架构 | 组件过大，依赖多 |
| `ProjectView.tsx` | 借鉴工作台编排 | 绑定 chat、artifact、design、plugin、media 等大量上下文 |
| `apps/daemon` 整体 | 不复制 | Typola 已有 Rust 后端 |
| `apps/desktop` | 不复制 | Electron，与 Tauri 冲突 |
| `apps/web` 整体 | 不复制 | Next.js，与 Vite 冲突 |
| `design-systems/` | 后续参考 | 当前 Typola 重点是文档 |
| `prompt-templates/` | 后续参考 | 可用于封面图/公众号配图，但不是 P0 |

---

# 4. 合并后的 Milestone 与 Issue

## 总览

| Issue | Milestone | 标题 | 优先级 |
|---|---|---|---|
| 1 | v0.4 | Agent Runtime Registry 与命令抽象 | P0 |
| 2 | v0.4 | Agent 检测、诊断与测试运行 | P0 |
| 3 | v0.4 | AI 执行设置页与运行状态展示 | P0 |
| 4 | v0.5 | Artifact Manifest 与产物落盘标准化 | P0 |
| 5 | v0.5 | Artifact Scanner、右栏产物列表与产物库页面 | P0 |
| 6 | v0.5 | Artifact 操作闭环与输出恢复校验 | P0 |
| 7 | v0.6 | STYLE.md 文档风格系统 v0 | P1 |
| 8 | v0.7 | 工作台体验整合与隐私安全说明 | P1 |

---

# Issue 1：Agent Runtime Registry 与命令抽象

## 标题

```txt
[v0.4] Agent Runtime Registry 与命令抽象
```

## 目标

建立 Typola 原生的 Agent Runtime 抽象，把当前硬编码的 `claude | opencode` provider 逐步升级为可扩展 registry。

这个 issue 只做 runtime 底座，不要求一次完成设置页 UI 和检测 UI。

---

## 背景

当前 Typola 已支持 Claude/OpenCode，但 provider 判断比较硬编码。后续如果要支持 Codex/Gemini/Cursor Agent，需要先把 runtime 定义统一。

open-design 已经有比较成熟的 runtime 类型、registry 和 Claude/OpenCode 定义，可以直接复制到 Typola 正式目录后改造。

---

## 实现范围

新增或改造：

```txt
src/services/agent/runtime/types.ts
src/services/agent/runtime/registry.ts
src/services/agent/runtime/commandSpec.ts
src/services/agent/runtime/promptBudget.ts
src/services/agent/runtime/defs/claude.ts
src/services/agent/runtime/defs/opencode.ts
src/services/agent/runtime/defs/codex.ts       可选，experimental
src/services/agent/runtime/defs/gemini.ts      可选，experimental
```

不建立：

```txt
src/vendor/open-design/
```

---

## 建议类型

```ts
export type AgentRuntimeId =
  | 'claude'
  | 'opencode'
  | 'codex'
  | 'gemini';

export type AgentCapability =
  | 'stream'
  | 'sessionResume'
  | 'fileWrite'
  | 'mcp'
  | 'extraAllowedDirs'
  | 'promptViaStdin'
  | 'modelSelection'
  | 'partialMessages';

export interface AgentRuntimeDef {
  id: AgentRuntimeId;
  label: string;
  description?: string;

  defaultCommand: string;
  fallbackCommands?: string[];
  versionArgs: string[];

  capabilities: Partial<Record<AgentCapability, boolean>>;

  experimental?: boolean;
  docsUrl?: string;
  installUrl?: string;

  buildCommandSpec?: (input: AgentCommandInput) => AgentCommandSpec;
}

export interface AgentCommandInput {
  runtimeId: AgentRuntimeId;
  prompt: string;
  cwd: string;
  model?: string;
  resumeSessionId?: string;
  pluginDirs?: string[];
  extraAllowedDirs?: string[];
  commandName?: string;
}

export interface AgentCommandSpec {
  runtimeId: AgentRuntimeId;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;

  promptViaStdin?: boolean;
  promptInputFormat?: 'text' | 'stream-json';
  outputFormat?: 'text' | 'json' | 'stream-json';
}
```

---

## 关键要求

1. Registry 第一阶段默认只启用：
   - Claude Code
   - OpenCode

2. Codex/Gemini 可以先定义，但必须：
   - 标记为 `experimental`
   - UI 默认隐藏
   - 不影响现有链路

3. `buildCommandSpec` 第一阶段只用于：
   - 设置页展示
   - 测试运行说明
   - 日志诊断
   - 后续 Rust 侧改造准备

4. 不允许前端通过任意 command spec 绕过 Rust 白名单。

5. 现有 AI 工作台必须不回退。

---

## open-design 复用建议

可复制并改造：

```txt
apps/daemon/src/runtimes/types.ts
apps/daemon/src/runtimes/registry.ts
apps/daemon/src/runtimes/defs/claude.ts
apps/daemon/src/runtimes/defs/opencode.ts
apps/daemon/src/runtimes/prompt-budget.ts
```

---

## 验收标准

- `listAgentRuntimeDefs()` 可返回 Claude/OpenCode。
- `getAgentRuntimeDef('claude')` 可返回 Claude 定义。
- `getAgentRuntimeDef('opencode')` 可返回 OpenCode 定义。
- Claude/OpenCode 都能生成 `AgentCommandSpec`。
- 现有 `AgentProvider = 'claude' | 'opencode'` 仍兼容。
- TypeScript check 通过。
- 现有 AI 工作台运行不受影响。

---

# Issue 2：Agent 检测、诊断与测试运行

## 标题

```txt
[v0.4] Agent 检测、诊断与测试运行
```

## 目标

把当前简单的 agent 检测升级为完整的结构化检测、诊断和一键测试运行能力。

用户在设置页应该能知道：

- Claude/OpenCode 是否安装
- 路径是什么
- 版本是什么
- 是否可执行
- 是否存在 Windows PATH / `.cmd` 问题
- 是否可能存在认证问题
- 是否可以真正跑通一次简单请求
- 失败时该怎么修

---

## 实现范围

前端新增：

```txt
src/services/agent/runtime/diagnostics.ts
src/services/agent/runtime/detection.ts
src/services/agent/agentTestRunService.ts
src/components/agent/AgentDiagnosticRow.tsx
src/components/agent/AgentTestRunPanel.tsx
```

Rust 侧改造：

```txt
src-tauri/src/lib.rs
```

或拆分：

```txt
src-tauri/src/agent_detect.rs
src-tauri/src/agent_test_run.rs
```

---

## 诊断模型

```ts
export type AgentDiagnosticLevel = 'ok' | 'warning' | 'error';

export type AgentDiagnosticCode =
  | 'not_found'
  | 'not_executable'
  | 'version_failed'
  | 'auth_missing'
  | 'auth_expired'
  | 'model_invalid'
  | 'mcp_unsupported'
  | 'permission_risk'
  | 'windows_path_issue'
  | 'prompt_too_long'
  | 'unknown';

export interface AgentDiagnostic {
  code: AgentDiagnosticCode;
  level: AgentDiagnosticLevel;
  title: string;
  detail: string;
  fix?: {
    label: string;
    action:
      | 'choose_file'
      | 'copy_command'
      | 'open_settings'
      | 'open_doc'
      | 'rescan'
      | 'none';
    payload?: string;
  };
}

export interface AgentDetectionResult {
  runtimeId: string;
  available: boolean;
  executablePath?: string;
  version?: string;
  authStatus?: 'unknown' | 'ok' | 'missing' | 'expired';
  capabilities?: string[];
  diagnostics: AgentDiagnostic[];
  detectedAt: string;
}
```

---

## agent_detect 要求

输入支持：

```ts
{
  runtimeId: 'claude' | 'opencode';
  customPath?: string;
  defaultCommand?: string;
  versionArgs?: string[];
}
```

输出：

```ts
AgentDetectionResult
```

必须处理：

- command not found
- 自定义路径不存在
- 路径不可执行
- spawn failed
- permission denied
- timeout
- non-zero exit
- Windows `.cmd` / npm global bin / PATH 继承问题
- 版本输出无法解析

---

## 一键测试运行

测试 prompt：

```txt
请只回复：Typola AI runtime ok
```

测试结果展示：

```ts
export interface AgentTestRunResult {
  runtimeId: string;
  ok: boolean;
  elapsedMs: number;
  cwd: string;
  model?: string;
  stdoutPreview?: string;
  stderrPreview?: string;
  parsedStream?: boolean;
  diagnostics: AgentDiagnostic[];
}
```

---

## 关键要求

1. 测试运行不能污染正式会话列表。
2. 或者如果复用正式 session，必须标记为 test run。
3. 测试运行必须有超时。
4. 测试失败不能导致设置页崩溃。
5. Windows 路径带空格必须支持。
6. Claude 的 `bypassPermissions` 要显示 warning，但不阻塞运行。

---

## open-design 复用建议

可复制并改造：

```txt
apps/daemon/src/runtimes/diagnostics.ts
apps/daemon/src/runtimes/detection.ts
apps/daemon/src/runtimes/executables.ts
apps/web/src/components/AgentDiagnosticRow.tsx
```

注意：

- detection 的 Node spawn 逻辑不能原样搬，需要适配 Tauri/Rust。
- AgentDiagnosticRow 可较直接迁移，但要改样式和中文文案。

---

## 验收标准

- Claude 未安装时显示 `not_found`。
- 自定义路径错误时显示 `not_executable` 或 `version_failed`。
- 检测成功时显示 path/version/available。
- 点击重新检测可刷新结果。
- 点击测试运行可得到成功/失败结果。
- 测试失败时展示 stderr 摘要和修复建议。
- Windows 下 `claude.cmd` 可识别。
- 现有 AI 正式运行不受影响。

---

# Issue 3：AI 执行设置页与运行状态展示

## 标题

```txt
[v0.4] AI 执行设置页与运行状态展示
```

## 目标

将 Typola 的 AI 设置从零散输入框升级为“AI 执行控制中心”。

同时在 AI 工作台运行时展示当前使用的 provider/model/cwd，提升可理解性。

---

## 实现范围

新增或改造：

```txt
src/components/agent/AgentRuntimeCard.tsx
src/components/agent/AgentRuntimeSettings.tsx
src/components/agent/ModelSelect.tsx
src/components/agent/AgentDiagnosticRow.tsx
src/services/settingsService.ts
src/app/AppLayout.tsx
```

根据当前项目结构，也可能涉及现有 Settings 相关组件。

---

## 设置页建议结构

```txt
通用
AI 执行
文档编辑
预览与阅读
导出
图片与资源
产物库
终端
外观主题
隐私与安全
关于
```

AI 执行内部：

```txt
执行模式
Agent
模型
工作区权限
MCP 配置
诊断
```

---

## AgentRuntimeCard 展示内容

```txt
Claude Code
状态：已安装 / 未安装 / 认证异常 / 路径异常
路径：C:\Users\xxx\AppData\Roaming\npm\claude.cmd
版本：x.x.x
模型：默认 / sonnet / 自定义
能力：流式输出、会话续接、文件写入、MCP、额外目录授权
操作：设为默认 / 重新检测 / 测试运行 / 选择路径 / 查看诊断
```

OpenCode 同理。

---

## 运行状态展示

在 AI 工作台中展示：

```txt
Claude Code · sonnet · 工作区 D:/workspace
```

展示位置：

- AI 工作台输入区上方
- 运行中状态条
- 错误详情
- 后续产物 metadata

---

## 关键要求

1. 不直接复制 open-design 的完整 SettingsDialog。
2. 可以借鉴它的左侧分组 + 右侧面板信息架构。
3. 保存设置时，不能因为 AI 执行配置未完成而阻塞其他设置保存。
4. active provider 切换后，AI 工作台立即使用新 provider。
5. 模型选择支持：
   - 默认
   - 常用模型
   - 自定义模型
6. 工作区权限要展示：
   - AI 工作区根目录
   - extraAllowedDirs
   - pluginDirs
   - MCP 配置位置

---

## open-design 复用建议

可复制并改造：

```txt
apps/web/src/components/AgentDiagnosticRow.tsx
apps/web/src/components/modelOptions.tsx
```

只参考，不复制：

```txt
apps/web/src/components/SettingsDialog.tsx
```

---

## 验收标准

- 设置页出现“AI 执行”分区。
- Claude/OpenCode 以卡片形式展示。
- 可以选择 active provider。
- 可以设置/清空自定义路径。
- 可以设置模型或自定义模型名。
- 可以触发重新检测。
- 可以触发测试运行。
- AI 工作台运行中显示 provider/model/cwd。
- 保存设置后重启应用仍生效。
- 原有设置项不丢失。

---

# Issue 4：Artifact Manifest 与产物落盘标准化

## 标题

```txt
[v0.5] Artifact Manifest 与产物落盘标准化
```

## 目标

为 Typola 的 AI 生成物建立统一元数据模型，让每个新产物都有 `artifact.json`，为右栏产物列表和产物库打基础。

---

## 背景

当前 Typola 已经有 `.typola-output` 和产物 chip，但 AI 生成物还不是一等对象。v0.5 需要把产物标准化。

---

## 实现范围

新增：

```txt
src/services/artifacts/types.ts
src/services/artifacts/manifest.ts
src/services/artifacts/artifactRelation.ts
```

改造现有产物生成链路：

```txt
心流模式生成产物
检视模式导出 review.md
检视意见发 AI 改生成 ai改N.md
HTML/公众号/PPT HTML 产物
```

---

## ArtifactKind

```ts
export type ArtifactKind =
  | 'markdown'
  | 'html'
  | 'review'
  | 'revision'
  | 'wechat-html'
  | 'ppt-html'
  | 'data'
  | 'asset'
  | 'unknown';
```

---

## ArtifactStatus

```ts
export type ArtifactStatus =
  | 'running'
  | 'done'
  | 'failed'
  | 'partial'
  | 'archived'
  | 'deleted';
```

---

## ArtifactManifest

```ts
export interface ArtifactManifest {
  id: string;
  title: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  primaryFile: string;

  createdAt: string;
  updatedAt?: string;

  source: {
    type:
      | 'flow_generation'
      | 'selection_ai'
      | 'review_export'
      | 'review_ai_edit'
      | 'manual_import'
      | 'unknown';
    documentPath?: string;
    documentName?: string;
    conversationId?: string;
    docMode?: string;
  };

  agent?: {
    id: string;
    label?: string;
    model?: string;
  };

  workspace?: {
    root?: string;
    outputRoot?: string;
  };

  files?: Array<{
    path: string;
    role: 'primary' | 'asset' | 'log' | 'metadata' | 'preview';
    mime?: string;
    size?: number;
  }>;

  actions?: {
    openAsTab?: boolean;
    preview?: boolean;
    insertToEditor?: boolean;
    compareWithCurrent?: boolean;
    exportHtml?: boolean;
    exportPdf?: boolean;
    exportWord?: boolean;
    archive?: boolean;
    delete?: boolean;
  };

  error?: {
    message: string;
    stderrTail?: string;
    exitCode?: number;
  };
}
```

---

## 目录结构

推荐目标结构：

```txt
.typola-output/
  sessions/
    20260626-153000-review/
      session.json
      history.jsonl
      artifacts/
        artifact-001/
          artifact.json
          output.md
        artifact-002/
          artifact.json
          output.html
          assets/
  index.json
```

兼容策略：

- 如果当前已有 `.typola-output/<conversation>/`，不强制迁移。
- 新产物必须写 `artifact.json`。
- 旧文件由后续 scanner 推断为 legacy artifact。
- 不破坏现有 chip 展示。

---

## 关键要求

1. 所有新 AI 产物都要有 manifest。
2. 失败或部分输出也要写 manifest。
3. manifest 必须包含 agent、model、source document、conversation id。
4. 生成 `review.md` 和 `ai改N.md` 时必须写 manifest。
5. 不要改变用户已有产物目录结构导致旧文件失效。
6. 删除/归档仍走 Rust 安全命令。

---

## open-design 复用建议

可复制并改造：

```txt
apps/web/src/artifacts/manifest.ts
```

但必须改为 Typola 文档产物模型，不要照搬 HTML artifact schema。

---

## 验收标准

- 新生成 Markdown 产物有 `artifact.json`。
- 新生成 HTML 产物有 `artifact.json`。
- 检视导出的 review.md 有 `artifact.json`。
- AI 改稿 `ai改N.md` 有 `artifact.json`。
- 失败产物有 `status = failed` 或 `partial`。
- manifest 可被 JSON parse。
- 现有 chip 不回退。
- 现有产物打开/归档/删除不回退。

---

# Issue 5：Artifact Scanner、右栏产物列表与产物库页面

## 标题

```txt
[v0.5] Artifact Scanner、右栏产物列表与产物库页面
```

## 目标

实现 `.typola-output` 扫描、当前文档相关产物展示，以及工作区级产物库页面。

这个 issue 负责“看见产物”，不负责全部操作闭环；操作闭环放到 Issue 6。

---

## 实现范围

新增：

```txt
src/services/artifacts/scanner.ts
src/services/artifacts/indexer.ts
src/components/artifacts/ArtifactCard.tsx
src/components/artifacts/ArtifactList.tsx
src/components/artifacts/ArtifactStatusBadge.tsx
src/components/artifacts/ArtifactActionMenu.tsx
src/components/artifacts/ArtifactLibrary.tsx
```

---

## scanner 能力

- 扫描 `.typola-output`
- 读取 `artifact.json`
- 识别 legacy 文件
- 过滤 deleted
- 按更新时间排序
- 按当前文档路径筛选
- 按 kind/status/agent 筛选
- 缓存扫描结果，避免频繁 IO
- 扫描失败不影响编辑器启动

---

## 当前文档右栏产物列表

卡片示例：

```txt
[Markdown] 检视修改版
来自：article.md
时间：15:31
Agent：Claude Code · sonnet
状态：已完成

[打开] [对比] [插入] [导出] […]
```

右栏规则：

- 默认只显示当前文档相关产物。
- 无相关产物时显示空状态。
- failed/partial 产物不能隐藏。
- 支持手动刷新。
- 新生成产物后自动刷新。
- 切换文档后列表同步变化。

---

## 独立 Artifact Library 页面

入口：

```txt
左侧栏：产物库
顶部菜单：打开产物库
右栏空状态：查看全部产物
```

筛选：

```txt
全部
Markdown
HTML
Review
Revision
已归档
失败/部分完成
按文档
按日期
按 agent
```

搜索：

```txt
title
documentName
primaryFile
agent
kind
```

---

## 关键要求

1. 产物库页面第一版不需要做复杂数据库，直接基于扫描结果即可。
2. 可以生成 `.typola-output/index.json` 作为缓存，但必须能从文件系统重新恢复。
3. 旧产物没有 manifest 时，也要尽量展示为 legacy artifact。
4. 当前文档右栏只展示相关产物，避免噪音。
5. 独立产物库展示工作区全部产物。

---

## 验收标准

- 打开工作区后能加载产物列表。
- 当前文档生成新产物后右栏立即出现。
- 切换文档后右栏产物同步变化。
- 独立产物库能显示全部产物。
- 可按 kind/status 筛选。
- 可搜索 title/documentName。
- legacy 文件能显示。
- failed/partial 产物能显示。
- 扫描异常不影响编辑器启动。

---

# Issue 6：Artifact 操作闭环与输出恢复校验

## 标题

```txt
[v0.5] Artifact 操作闭环与输出恢复校验
```

## 目标

让产物具备完整操作能力，并处理 AI 输出不规范问题。

这个 issue 负责“操作产物”和“修复/校验产物”。

---

## 实现范围

新增：

```txt
src/services/artifacts/artifactActions.ts
src/services/artifacts/parser.ts
src/services/artifacts/recover.ts
src/services/artifacts/validate.ts
src/components/artifacts/ArtifactPreview.tsx
```

可能复用现有：

```txt
DiffReviewPane
ArtifactPreview
archive_artifact_to_workspace
delete_artifact_file
```

---

## 产物操作

支持：

```txt
openAsTab
preview
insertToEditor
compareWithCurrent
archiveToWorkspace
deleteArtifact
revealInFileTree
copyPath
viewLog
```

---

## 安全要求

删除必须满足：

```txt
目标路径必须属于 .typola-output
不能删除 workspace 任意文件
不能删除用户手动选择的外部文件
删除前需要确认
失败时显示原因
```

归档要求：

```txt
从 .typola-output 复制/移动到工作区目标目录
不能覆盖用户文件，除非确认
归档后更新 manifest status
```

---

## 输出恢复与校验场景

需要支持：

1. AI 输出 Markdown fenced code 中包含 HTML。
2. AI 输出完整 HTML 文档。
3. AI 输出 HTML 片段。
4. AI 输出 Markdown，但后缀不明确。
5. AI 运行失败但已有部分 stdout。
6. AI 输出包含多段候选产物。

---

## parser/recover/validate 规则

- Markdown-first。
- HTML 恢复逻辑可参考 open-design。
- 校验不能过度严格。
- 不要因为校验失败删除原始输出。
- 失败时保留 raw output。
- partial artifact 也可以显示和打开。

---

## open-design 复用建议

可复制并改造：

```txt
apps/web/src/artifacts/parser.ts
apps/web/src/artifacts/recover.ts
apps/web/src/artifacts/validate.ts
```

不要照搬 HTML-only 模型，需要扩展为 Typola 文档产物模型。

---

## 验收标准

- Markdown 产物可打开。
- Markdown 产物可插入当前光标。
- Revision 产物可与当前文档 diff。
- HTML 产物可预览。
- 产物可归档到工作区。
- 产物可安全删除。
- 删除不能越权到 `.typola-output` 外。
- 可从 ```html fenced block 恢复 HTML。
- 可标记 partial artifact。
- 校验失败时保留原始输出和错误原因。

---

# Issue 7：STYLE.md 文档风格系统 v0

## 标题

```txt
[v0.6] STYLE.md 文档风格系统 v0
```

## 目标

引入轻量文档风格系统，让 AI 在生成和改写文档时遵守工作区风格。

注意：

```txt
不改变现有 skill 体系。
STYLE.md 只作为 prompt context 注入。
用户当前明确指令优先于 STYLE.md。
```

---

## 实现范围

新增：

```txt
src/services/styleProfile/styleProfileService.ts
src/services/styleProfile/styleProfileParser.ts
src/services/styleProfile/styleProfilePrompt.ts
src/components/styleProfile/StyleProfileSettings.tsx
src/components/styleProfile/StyleProfileBadge.tsx
```

改造：

```txt
选区 AI prompt 构造
心流模式 prompt 构造
检视模式发 AI 改 prompt 构造
设置页
AI 工作台状态展示
```

---

## STYLE.md 查找顺序

```txt
<workspace>/.typola/STYLE.md
<workspace>/STYLE.md
~/.typola/STYLE.md
```

第一阶段可以只支持工作区级：

```txt
<workspace>/.typola/STYLE.md
```

---

## STYLE.md 模板

```md
# Typola Document Style

## 1. Writing Voice
文风、语气、正式程度、中文/英文偏好。

## 2. Audience
目标读者、专业程度、默认解释深度。

## 3. Structure Rules
标题层级、摘要、列表、章节组织方式。

## 4. Markdown Rules
表格、代码块、引用、图片、Mermaid、脚注使用规则。

## 5. Terminology
固定术语、禁用词、缩写展开规则。

## 6. Delivery Presets
Word、PDF、公众号、PPT、HTML 等交付偏好。

## 7. Review Rules
审稿标准：准确性、逻辑性、表达、格式、风险点。

## 8. AI Prompt Guide
给 AI 的最终执行提醒。
```

---

## 注入规则

| 场景 | 注入内容 |
|---|---|
| 选区润色 | Writing Voice + Terminology + AI Prompt Guide |
| 选区缩写/扩写 | Writing Voice + Structure Rules + AI Prompt Guide |
| 心流模式生成全文 | 完整 STYLE.md |
| 公众号/PPT/HTML 交付 | 完整 STYLE.md + Delivery Presets |
| 检视模式发 AI 改 | Writing Voice + Review Rules + Terminology |
| 解释术语 | Audience + Terminology，可选 |
| 数据分析 | 默认不注入 |

---

## 设置页入口

```txt
设置 → 文档风格

当前工作区 STYLE.md：已启用 / 未启用
[创建风格档案]
[从模板创建]
[编辑 STYLE.md]
[禁用]
```

---

## UI 感知

在相关 AI 入口显示：

```txt
已参考当前 STYLE.md
```

或者：

```txt
当前风格：技术产品文档风格
```

---

## 关键要求

1. 用户当前 prompt 优先于 STYLE.md。
2. STYLE.md 缺失时不影响 AI 运行。
3. STYLE.md 解析失败时给 warning，不阻塞。
4. 用户可以禁用 STYLE.md 注入。
5. STYLE.md 过长时需要截断或摘要。
6. 不修改 skill 协议。
7. 不改变现有场景卡结构。

---

## 验收标准

- 可创建 `.typola/STYLE.md`。
- 可在 Typola 中打开编辑 STYLE.md。
- 可解析 8 个 section。
- 选区 AI 能注入精简风格。
- 心流模式能注入完整风格。
- 检视改稿能注入 Review Rules。
- UI 能显示是否参考 STYLE.md。
- 禁用 STYLE.md 后不再注入。
- STYLE.md 不存在时 AI 正常运行。

---

# Issue 8：工作台体验整合与隐私安全说明

## 标题

```txt
[v0.7] 工作台体验整合与隐私安全说明
```

## 目标

把 v0.4/v0.5/v0.6 的底层能力整合为一个清晰的一站式 AI 文档工作台体验。

重点不是新增底层能力，而是优化入口、状态、右栏信息架构和安全可解释性。

---

## 实现范围

新增或改造：

```txt
工作台首页 / Welcome 面板
右栏 tabs / mode-based panel
设置页隐私与安全分区
AI 权限说明面板
产物库入口
STYLE.md 入口
```

---

## 工作台首页建议

展示：

```txt
最近打开文档
当前 AI Agent 状态
最近产物
当前 STYLE.md 状态
快捷入口：
  打开文档
  打开工作区
  检测 Claude
  查看产物库
  创建 STYLE.md
```

---

## 右栏信息架构

建议 tabs：

```txt
产物
预览
检视
大纲
```

或按模式动态显示：

```txt
阅读模式：
  大纲 / 预览 / 产物

心流模式：
  AI 工作台 / 产物

检视模式：
  检视意见 / AI 改稿产物
```

---

## 隐私与安全说明

设置页新增：

```txt
隐私与安全
```

展示：

```txt
当前 active agent
AI 工作区根目录
额外允许目录
pluginDirs
MCP 配置位置
.typola-output 位置
产物删除边界
bypassPermissions 风险说明
本地优先说明
不上传说明
```

---

## 关键要求

1. 用户能一眼看懂 Typola 的本地 AI 执行方式。
2. 用户能知道 AI 可以访问哪些目录。
3. 用户能知道产物存在哪里。
4. 用户能知道删除产物的安全边界。
5. 右栏不能因为产物、预览、检视、大纲太多而混乱。
6. 首页要提供下一步行动，而不是空白。

---

## 验收标准

- 首次打开 Typola 有明确引导。
- Claude 未配置时提示去 AI 执行设置页。
- 有工作区时展示最近产物。
- 右栏产物、预览、检视、大纲入口清晰。
- 设置页能看到隐私与安全说明。
- 能看到 AI 工作区根目录和额外允许目录。
- `bypassPermissions` 有风险说明。
- 不影响现有阅读/心流/检视三态。

---

# 5. 推荐实施顺序

## 5.1 标准顺序

```txt
1. Issue 1：Agent Runtime Registry 与命令抽象
2. Issue 2：Agent 检测、诊断与测试运行
3. Issue 3：AI 执行设置页与运行状态展示

4. Issue 4：Artifact Manifest 与产物落盘标准化
5. Issue 5：Artifact Scanner、右栏产物列表与产物库页面
6. Issue 6：Artifact 操作闭环与输出恢复校验

7. Issue 7：STYLE.md 文档风格系统 v0

8. Issue 8：工作台体验整合与隐私安全说明
```

---

## 5.2 最小可发布版本

如果希望快速发布一个阶段成果，建议最小范围：

```txt
Issue 1
Issue 2
Issue 3
Issue 4
Issue 5
```

这个版本可以命名为：

```txt
Typola AI Execution & Artifact Center
```

中文：

```txt
Typola AI 执行与产物中心
```

对外更新文案：

```txt
- 全新的 AI 执行控制中心：自动检测 Claude/OpenCode，支持诊断和测试运行。
- 全新的 AI 产物模型：生成物可追踪、可预览、可归档。
- 当前文档相关产物自动聚合，AI 改稿、HTML、Review 文件不再散落。
- 更清晰的本地工作区权限展示，为后续 STYLE.md 文档风格系统打基础。
```

---

# 6. GitHub Milestone 建议

```txt
Milestone: v0.4 AI Execution Center
Issues:
  1. Agent Runtime Registry 与命令抽象
  2. Agent 检测、诊断与测试运行
  3. AI 执行设置页与运行状态展示

Milestone: v0.5 Artifact Library
Issues:
  4. Artifact Manifest 与产物落盘标准化
  5. Artifact Scanner、右栏产物列表与产物库页面
  6. Artifact 操作闭环与输出恢复校验

Milestone: v0.6 STYLE.md
Issues:
  7. STYLE.md 文档风格系统 v0

Milestone: v0.7 Workspace Polish
Issues:
  8. 工作台体验整合与隐私安全说明
```

---

# 7. GitHub Labels 建议

```txt
area/agent-runtime
area/settings
area/artifact
area/style-profile
area/rust
area/ui
area/security
area/migration
source/open-design

priority/p0
priority/p1
priority/p2

milestone/v0.4
milestone/v0.5
milestone/v0.6
milestone/v0.7
```

---

# 8. Codex 通用实施提示词

每个 issue 都可以附带以下提示词：

```txt
你正在实现 Typola 的阶段性规划任务。请遵守以下约束：

1. 不引入 src/vendor/open-design/ 目录。
2. 如需复用 open-design 代码，请直接复制到 Typola 正式模块目录，并在文件头保留来源、许可证、原始路径和修改说明。
3. 不整体 fork open-design。
4. 不迁移 Typola 的 Tauri + React + Rust 架构。
5. 不引入 Electron、Next.js 或 open-design daemon。
6. 不改变现有 skill 体系。
7. 保持现有 Claude/OpenCode AI 工作台能力不回退。
8. 所有新增能力必须兼容 Windows 路径。
9. 删除/归档产物时必须保证不能越权操作 .typola-output 外的文件。
10. 代码完成后请运行 TypeScript check、lint、Rust check 和现有测试。如项目没有某项脚本，请说明。
11. PR 描述中列出：
   - 本次改动范围
   - 是否复用 open-design 代码
   - 复用来源路径
   - 与现有能力的兼容性
   - 已验证场景
```

---

# 9. 风险与边界

## 9.1 复制 open-design 过多导致架构污染

控制方式：

```txt
只复制小模块
不复制大页面
不复制 daemon
不复制 app shell
复制后必须进入 Typola 正式目录
复制后必须改造成 Typola 命名和依赖
每个 PR 范围保持清晰
```

---

## 9.2 Agent 执行安全风险

控制方式：

```txt
runtimeId 白名单
不允许前端传任意 command 绕过白名单
bypassPermissions 必须在 UI 中明确展示
extraAllowedDirs 必须可见、可编辑、可清空
测试运行必须有超时
```

---

## 9.3 Artifact 删除越权风险

控制方式：

```txt
删除必须在 Rust 侧校验路径
目标路径必须属于 .typola-output
不允许删除 workspace 任意文件
归档和删除分开
删除前确认
失败时显示原因
```

---

## 9.4 STYLE.md 影响用户原意

控制方式：

```txt
用户当前明确指令优先于 STYLE.md
STYLE.md 只作为风格参考
UI 显示是否启用 STYLE.md
用户可禁用
STYLE.md 过长时截断或摘要
```

---

# 10. 最终实施建议

建议先以 3 个大 PR 完成 v0.4：

```txt
PR 1：Agent Runtime Registry 与命令抽象
PR 2：Agent 检测、诊断与测试运行
PR 3：AI 执行设置页与运行状态展示
```

再以 3 个大 PR 完成 v0.5：

```txt
PR 4：Artifact Manifest 与产物落盘标准化
PR 5：Artifact Scanner、右栏产物列表与产物库页面
PR 6：Artifact 操作闭环与输出恢复校验
```

最后做：

```txt
PR 7：STYLE.md 文档风格系统 v0
PR 8：工作台体验整合与隐私安全说明
```

最终路线：

```txt
先让 AI 跑得稳、看得懂、能诊断；
再让 AI 产物可追踪、可操作、可交付；
最后让 AI 按工作区文档风格持续产出。
```
