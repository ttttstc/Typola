# Fork OpenDesign ToolCard 完整流程到 Typola AI 工作台

> 状态:**已实施 + 验证通过**(代码已改、typecheck 0 错、vitest 我影响范围 0 new failure、tauri:build:local 通过)。
> 分支:`fork/open-design-cli-ux`(基于 origin/main)
> 改动:`4 modified + 4 new files, 441 insertions / 28 deletions`(git diff --stat 实测)
> 计划原文件:`C:\Users\泥巴猪\.claude\plans\compiled-swinging-shell.md`(plan mode 内部档,本文件是独立 handoff 版)

---

## Context

Typola 当前 AI 工作台的工具调用卡片 (`src/components/conversation/ToolCard.tsx`) 只有 20 行,渲染成 `<details><pre>{JSON.stringify(input)}</pre></details>` — 极简的 JSON 折叠 dump,无法区分工具类型、运行态(loading / done / error)、文件路径、命令摘要,用户体验显著落后。

OpenDesign (`D:\AI\workspace\open-design\apps\web\src\components\ToolCard.tsx`) 在同样位置实现了 583 行的成熟卡片系统:
- **统一外壳**:`.op-card` 容器 + `.op-card-head` 头部(状态徽章 + 标题 + meta)
- **10 个家族专用 card**(去掉了 OpenDesign 的 LegacyAskUserQuestionCard)
- **状态徽章 ResultBadge**:running spinner / ok checkmark / error close,3 态自动推断
- **折叠/展开**:`accordion-collapsible` 平滑过渡,可点击头部展开查看 input/result
- **OpenInTabButton**:`file_path` 命中工作区文件时显示"打开"按钮(v1 保留位、不接回调)

**已确认决策**:
- fork 范围:ToolCard 完整
- JSON 展开保留:每张卡片底部追加"显示原始 JSON"小折叠

## 关键复用资产

| 来源 | 复用方式 |
|---|---|
| `D:\AI\workspace\open-design\apps\web\src\components\ToolCard.tsx` (583 行) | 主体直 fork,改 props 适配 Typola 数据形状 |
| `src/hooks/useSettings.ts` + `src/services/i18n.ts` | 现有 `useSettings()` + `translate(locale, key)` lambda,模式 1:1 沿用 |
| `lucide-react` (已装) | OpenDesign 自带 Icon 组件不 fork,直接换成 `Loader2` / `Check` / `X` / `ChevronDown` / `ChevronRight`,避免再引一套 icon 体系 |
| `src/components/conversation\ThoughtCard.tsx` | 已经在用 `Loader2`,验证 `lucide-react` 路径 |
| `src/services/agent\types.ts` `AgentToolCall` | 字段齐全:`{ id, name, input, inputDelta, result, isError }`,OpenDesign 的 `use: tool_use` / `result: tool_result` 一一对应 |

## 数据形状映射

| OpenDesign (AgentEvent) | Typola (AgentToolCall) | 备注 |
|---|---|---|
| `use.input` | `tool.input` | `unknown`,同语义 |
| `result.content` | `tool.result` | string(已拼好的 stdout 或 error 文本) |
| `result.isError` | `tool.isError` | boolean |
| `runStreaming` | `!message.done && !tool.result` | 父消息未结束 且 本工具无 result |
| `runSucceeded` | `message.done && !tool.isError` | 父消息结束 且 本工具成功 |
| `onRequestOpenFile(name)` | 暂不接 | v1 跳过;若需要后续从 AppLayout 透传 `useFileTabs` 的 open 回调 |

## 实施文件清单

### 新增 4 个文件

#### `src/components/conversation/toolCards/shared.ts`(~95 行)
- `truncate(s: string, n: number)` — OpenDesign 的同名工具
- `describeInput(input: unknown)` — 从 `file_path / path / pattern / url / query / name / command` 取第一个 string,fallback `JSON.stringify`
- `basenameOf(filePath)` — 取路径 basename
- `ResultShape` / `ToolFamily` 类型导出
- **TodoWrite 解析器**(fork 自 OpenDesign `runtime/todos.ts`):`parseTodoWriteInput` / `isTodoWriteToolName` / `TodoStatus` / `TodoItem`
  - 容忍 `todos` 和 `plan` 两种字段名(Claude stream 把 TaskCreate/TaskUpdate 归并成 `todos: [...]`,见 `claudeStream.ts:169-177`)
  - 状态归一:`cancelled` / `canceled` / `failed` → `stopped`

#### `src/components/conversation/toolCards/ResultBadge.tsx`(~51 行)
- 接收 `result?: { content, isError }` + `runStreaming: boolean` + `runSucceeded: boolean`
- 状态规则完全照搬 OpenDesign:
  - `!result && runStreaming` → spinner (`Loader2 size=14` + `.op-status-running`)
  - `!result && !runSucceeded` → error X(已结束但没 result 视为失败)
  - `result?.isError` → error X + title 用 `result.content`
  - else → checkmark (`Check size=14`)
- 直接用 lucide-react,不开新 Icon 体系

#### `src/components/conversation/toolCards/cards.tsx`(~385 行)
10 个 card 组件 + 共享子组件:
- `useT()` 本地 hook — 包装 `useSettings() + translate` + 支持 `{n}` / `{name}` 占位
- `OpenInTabButton` — v1 不接 `onRequestOpenFile` 回调,直接 `return null`(保留位)
- `FileErrorDetail` — 错误结果独立红条
- `Collapsible` — `accordion-collapsible` 折叠容器
- `CardHead` — 统一头(状态徽章 + 标题 + meta + chevron)
- `RawJsonDisclosure` — 每张卡片底部 `<details><summary>显示原始 JSON</summary><pre>{JSON.stringify(input+result)}</pre></details>`,实现"保留展开 JSON"
- `TodoCard` — 解析 `parseTodoWriteInput`,渲染 ☑/◐/○/! 四态列表,带"完成数 / 总数"计数 + 折叠,有 in_progress 时默认展开
- `FileWriteCard` / `FileEditCard` / `FileReadCard` — 共享 `FileErrorDetail`,Write 显示行数,Edit 显示编辑数,都可折叠看路径
- `BashCard` — 命令 + stdout 双 pre,各 400/4000 字符截断
- `GlobCard` / `GrepCard` / `WebFetchCard` / `WebSearchCard` — 纯头部单行卡片,不展开
- `GenericCard` — fallback,name + describeInput summary

**跳过**:OpenDesign 的 `LegacyAskUserQuestionCard` (Typola 用 `selectionActions.ts` 新机制,无历史 AUQ)

#### `src/components/conversation/toolCards/dispatcher.tsx`(~70 行)
- 完全照搬 OpenDesign 的 lookup 顺序:
  1. `isTodoWriteToolName(name)` → `TodoCard`
  2. `Write / write / create_file` → `FileWriteCard`
  3. `Edit / str_replace_edit` → `FileEditCard`
  4. `Read / read_file` → `FileReadCard`
  5. `Bash` → `BashCard`
  6. `Glob / list_files` → `GlobCard`
  7. `Grep` → `GrepCard`
  8. `WebFetch / web_fetch` → `WebFetchCard`
  9. `WebSearch / web_search` → `WebSearchCard`
  10. else → `GenericCard`
- **跳过**:OpenDesign 的 `getToolRenderer` 第三方注册表(无对应基础设施,Typola 用硬编码 family)

### 修改 4 个文件

#### `src/components/conversation/ToolCard.tsx`(20 → 28 行,薄包装)
```ts
import type { AgentMessage, AgentToolCall } from '../../services/agent/types';
import { ToolCardDispatcher } from './toolCards/dispatcher';

type Props = { tool: AgentToolCall; message: Extract<AgentMessage, { role: 'assistant' }> };

export function ToolCard({ tool, message }: Props) {
  const runStreaming = !message.done && !tool.result;
  const runSucceeded = !!message.done && !tool.isError;
  const result = tool.result !== undefined ? { content: tool.result, isError: !!tool.isError } : undefined;
  return <ToolCardDispatcher name={tool.name} input={tool.input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
}
```
- 删除原 20 行 `KNOWN_TOOLS` + `<details>` JSON dump 实现
- 转换 `tool.result: string` → OpenDesign 形状 `result: { content, isError }`

#### `src/components/conversation/AssistantMessage.tsx`(行 186 单点改动)
- `<ToolCard key={tool.id} tool={tool} />` → `<ToolCard key={tool.id} tool={tool} message={message} />`
- 其它不动(MessageActions、codeBlocks 提取、DoneBar 等全部保留)

#### `src/services/i18n.ts`(追加 22 个 key × 3 语言 = 69 行)
- 全部 camelCase(对齐 Typola 现有 `toolTodos` / `toolWrite` 风格,**非** OpenDesign 的 `tool.todos` 点号)
- 三大类:
  - **Todo 家族**:`toolTodos` / `toolTodosCollapse` / `toolTodosExpand` / `toolTodosDismiss` / `toolTodosDone`
  - **工具名**:`toolWrite` / `toolEdit` / `toolRead` / `toolBash` / `toolGlob` / `toolGrep` / `toolFetch` / `toolSearch`
  - **辅助**:`toolLines` (带 `{n}` 占位) / `toolChangeSingular` / `toolChangePlural` / `toolOpen` / `toolOpenInTab` (带 `{name}` 占位) / `toolRunning` / `toolError` / `toolDone` / `toolRawJson` / `toolShowRawJson`
- zh-CN / en-US / ja-JP 各 23 行(含末尾 `};`)

#### `src/styles/app.css`(+360/-18 行,共 7 处替换)
- **删除**:7 行旧 `.conversation-tool-card` CSS(通用 selector list、`.error` 规则、`summary` 规则、`pre` 规则)
- **追加**:
  - `.op-card` 容器 + 5 个家族色 `.op-bash/.op-file/.op-search/.op-web/.op-generic/.op-todo`(左侧 3px border)
  - `.op-card-head` / `.op-card-head-toggle`(可点) / `.op-card-head-static`(纯展示)
  - `.op-title` / `.op-meta` / `.op-icon` / `.op-desc`
  - `.op-status` 圆形徽章基类 + 3 态 `.op-status-running/.op-status-ok/.op-status-error`
  - `.op-status-spinner` 旋转动画 + `@keyframes op-spin`
  - `.op-expand-chev` chevron
  - `.shimmer-text` 流式输入脉动 + `@keyframes op-shimmer`
  - `.accordion-collapsible` max-height 折叠动画
  - `.op-card-detail` / `.op-card-file-detail` 折叠内容
  - `.op-path` 文件路径
  - `.op-open` 打开按钮(预留位)
  - `.op-command` / `.op-output` `<pre>` 等宽 + 滚动
  - `.op-todo-toggle` / `.op-todo-head` / `.op-todo-current` / `.op-todo-chev` — TodoCard 专用
  - `.todo-list` / `.todo-item` / `.todo-check` / `.todo-text` — Todo 列表
  - `.op-raw-json` 底部小折叠样式

## 沿用 OpenDesign 但替换的(节省 ~150 行)

| OpenDesign 资产 | Typola 替换 |
|---|---|
| 自带 `Icon.tsx` (764 行) | 直接用 lucide-react 已装的 `Loader2/Check/X/ChevronDown/ChevronRight` |
| 自带 `useT` hook | 沿用 Typola 现有 `useSettings() + translate(locale, key)` lambda,本地封装 `useT()` |
| `LegacyAskUserQuestionCard` (历史 AUQ 兼容) | 跳过,Typola 用 `selectionActions.ts` 新机制 |
| `getToolRenderer(name)` 第三方注册表 | 跳过,Typola 无对应基础设施 |
| `onDismiss` 回调(plan 完成后清掉 todo) | 跳过,Typola 没这个 UI 流程 |

## 不做(显式边界)

- ❌ **不接 `onRequestOpenFile`** — Typola 当前工作区是 Tauri 文件树,`OpenInTabButton` 暂不接回调,保留位,返回 null
- ❌ **不 fork OpenDesign 的 `Icon.tsx`** — 直接用 lucide-react 已有图标
- ❌ **不 fork `LegacyAskUserQuestionCard`** — Typola 用 `selectionActions.ts` 的新机制
- ❌ **不接 `getToolRenderer` 第三方注册表** — Typola 无对应插件系统
- ❌ **不改 ToolCard 之外的 UI 结构** — 不引入新 Tab / 子面板 / 双栏(对齐 [[typola-keep-existing-ui-structure]] 记忆)
- ❌ **不动 streaming caret / scroll 行为 / Lexical composer** — 用户已显式排除

## 验证结果(已跑)

| 项 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npm run typecheck` | ✅ 0 error(中间出 1 个 `completed` 变量未使用,删了) |
| vitest(我影响范围) | `npx vitest run src/components/conversation src/services/agent` | ✅ 178 passed / 3 pre-existing skillHub failure(与 ToolCard 无关) |
| vitest(全量) | `npm run test` | 504 passed / 7 pre-existing failure(pdfExport / skillHub / AppLayoutSystemOpenSource — 都是 main 分支已存在) |
| Tauri 本地 build | `npm run tauri:build:local` | ✅ typecheck + vite build (4.96s) + cargo release (1m 04s) + MSI/NSIS bundle |
| 输出产物 | — | `typola.exe` + `Typola_0.3.21_x64_en-US.msi` + `Typola_0.3.21_x64-setup.exe` |

## 端到端走查清单(给用户本地 build 后跑)

1. 启动 App,打开 AI 工作台
2. 触发一次 agent run(包含 TodoWrite / Bash / Edit / Read / Write 各 ≥1 次)
3. **逐 card 验证**:
   - TodoCard:列表展开/折叠、计数 `done/total`、运行中 spinner
   - FileWriteCard:显示 `baseName · N lines`,点击头部展开看完整路径
   - FileEditCard:显示 `1 change` / `N changes`
   - BashCard:`command` + `output` 都在,长输出截断
   - GenericCard:未知 tool name 不崩
4. **ResultBadge 3 态**:
   - running → spinner 蓝色转圈
   - done → ✅ 绿色
   - error → ❌ 红色 + hover 看到 result 内容
5. **Raw JSON 折叠** — 每张卡片底部"显示原始 JSON"可展开
6. **i18n 三语言切换** — 设置页切到 en-US / ja-JP,卡片标题跟随切换
7. **3 种 tool name 变体** — `Write / write / create_file` 都进入 FileWriteCard

## 风险与注意

- **CSS 体积**:`.op-card*` ~360 行 CSS(包含 todos 详细样式、shimmer 动画等),但 22.42 kB gzip 总体 CSS 没显著变化
- **重渲染成本**:每个 tool card 一次 useState 折叠,10 个 tool × 折叠状态 = 10 个本地 state,react 重渲染成本可忽略
- **ResultBadge 的字符串 result**:OpenDesign 的 `result.content: string` 与 Typola `tool.result: string` 对齐;若上游 `tool_result` 事件是结构化 JSON(`{stdout, stderr, exitCode}`)则需在 `ToolCard.tsx` 包装层做 stringify。**先按 string 直传,跑起来再看是否需要 stringify**
- **OpenDesign 的 todo 解析**:OpenDesign 用了 `parseTodoWriteInput`,Typola 当前没有这个函数;fork 时照搬 OpenDesign 的 `runtime/todos.ts` 中的 parser,放进 `toolCards/shared.ts`
- **TodoCard 的 onDismiss 回调**:OpenDesign 接的 `onDismiss` 让外部在 plan 完成后清掉 todo list,Typola 没这个 UI 流程,`onDismiss` 传 undefined(变量 `completed` 因不需要也被删)
- **shimmer 动画 + 流式 性能**:用 CSS `animation: op-shimmer 1.4s linear infinite`,1 个 keyframe,无 JS 成本
- **OpenInTabButton 预留位**:函数体直接 `return null`,未来需要时只改这一个组件,不影响 dispatcher / 其他 card

## 后续可做(不在本次范围)

1. 接入 `OpenInTabButton` 的 `onRequestOpenFile` 回调(需要 AppLayout 透传 `useFileTabs` 的 open 方法)
2. 在 `ToolCard.tsx` 包装层做 result 字符串化(structured JSON → string)
3. 给 ToolCard 加 vitest 覆盖(本次无)
