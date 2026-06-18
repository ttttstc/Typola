# Skill OS 工作台形态谱 — 竞品调研

> 调研日期：2026-06-18
> 调研人：Claude（主线程） + 并行 WebFetch / 源码 Read
> 目标：识别 Typola "OpenDesign 式 chat panel + skill 引用 + 多轮会话"形态的竞品谱、差异点、可借鉴能力
> 输入：`D:\暂存\Typola\docs\AI_WORKBENCH_SKILL_OS.md`、`D:\暂存\Typola\docs\changes\2026-06-16-competitive-research\competitive-research.md`
> 主源码：`D:\AI\workspace\open-design\apps\web\src\components\ChatPane.tsx`（3810 行）+ `AssistantMessage.tsx`（2827 行）+ `ToolCard.tsx`（582 行）+ `apps\daemon\src\claude-stream.ts`（619 行）+ `db.ts`（2062 行）

---

## 1. 调研对象速览（12 个产品）

| # | 项目 | 形态定位 | 关键借鉴点 |
|---|------|---------|----------|
| 1 | **OpenDesign 0.10.1/0.11.0** | 中央 chat 工作台 + 右侧 conversations 下拉菜单 + 项目式 file workspace | Claude stream-json 5 类事件规范 + SQLite schema + 3 层 tool renderer 扩展 |
| 2 | **AnythingLLM** | Desktop + Docker，多 workspace + multi-agent，sidebar + chat | Workspace 是顶层隔离单元 |
| 3 | **LobeChat** | Next.js SPA + plugin marketplace（10k+ 插件 / MCP gateway） | Plugin SDK 三阶段渐进 + 模型清单 `+/-` 显隐 |
| 4 | **Dify** | 工作流编排 + Agent builder + dynamic model routing | 编排图谱适合"心流→草稿→发布"链路 |
| 5 | **Open WebUI** | Ollama 团队，web-first，Python function calling + MCP registry | 本地 Python plugin 代码编辑器是杀手锏 |
| 6 | **Cherry Studio** | 多 provider 桌面 chat（Electron），**`.claude/skills` + `.agents/skills` 双目录** + MCP Marketplace | 本地 skill 文件夹直接引用（**与 Typola 形态 1:1 对位**） |
| 7 | **LibreChat** | SKILL.md bundles + Agent Marketplace + 多 provider mid-chat 切换 | mid-chat 切换模型是 UX 关键 |
| 8 | **Pieces.app** | LTM-2 长期记忆 + Workbench（中央 snippet 管理）+ Copilot chat | LTM 跨 session 时序召回 |
| 9 | **bolt.diy / bolt.new** | StackBlitz WebContainers + AI 全控浏览器内 IDE | "对话即开发环境"极致形态 |
| 10 | **OpenHands** | Agent-Client Protocol (ACP) + Docker sandbox + agent-canvas 前端 | ACP 是 agent ↔ UI 通用协议 |
| 11 | **Zed AI** | Rust IDE 内嵌 AI panel（侧栏） | IDE 内 AI panel 形态 |
| 12 | **Cursor**（非竞品·设计参考） | VS Code fork + Cmd+K inline + Cmd+L sidebar + Cmd+I Composer | 3 种 AI surface 共生（inline/sidebar/agent） |

---

## 2. 每个对象形态细节

### 2.1 OpenDesign（直接对位）

- **Star / 版本**：Apache 2.0，`nexu-io/open-design` 当前 HEAD 含 0.10/0.11 release notes
- **Chat panel 位置**：**中央 workspace**（不侧边栏）。编辑器（HTML/Sketch artifact viewer）占中央偏右，chat pane 覆盖中央左侧。Tab 切换：chat ↔ comments（preview 上的批注）
- **Skill 引用方式**：**本地路径引用**，扫描 `.od/skills/` + `.agents/skills/`（与 Anthropic 官方一致）。`onProjectSkillChange` 在 project header 改 skill → 注入系统 prompt。SKILL.md 解析为 `SkillSummary[]`
- **多轮 session 持久化**：**SQLite (better-sqlite3, WAL mode)**，位置 `<projectRoot>/.od/app.sqlite` 或独立 `dataDir`。Schema：`projects` / `conversations` / `messages` / `agent_sessions` / `preview_comments` / `tabs` / `deployments` / `routines` / `routine_runs`
- **流式渲染**：5 类事件（`status` / `text_delta` / `thinking_delta` / `tool_use` / `tool_result`），由 `claude-stream.ts` 把 Claude Code `stream-json` JSONL 归一化后推送给 UI。Text/thinking 逐 token，tool_use 在 `content_block_stop` 才完整 parse（`input_json_delta` 累积 + 终结 fallback）
- **Tool call UI**：3 层查找顺序（`tool-renderers` 注册 → hardcoded family card → generic fallback）。Family card 覆盖 TodoWrite/Write/Edit/Read/Bash/Glob/Grep/WebFetch/WebSearch，每个 card 三态徽章（streaming/succeeded/result）。**写文件/读文件**有"Open in tab"按钮直接跳到 FileWorkspace 的对应标签页
- **模型切换**：固定 per-conversation 的 agent（Claude Code / Codex CLI / local），`agent_sessions(conversation_id, agent_id, session_id)` 主键允许多 agent 共享同一对话
- **对 Typola 借鉴点**：
  1. **claude-stream.ts 必须照抄**：5 类事件归一化 + role-marker guard（防 prompt injection #3247）+ TodoWrite 聚合快照是核心
  2. **SQLite schema 直接借鉴**：Typola 的 Skill OS 心流/草稿 session 应建 `agent_sessions(conv_id, agent_id, session_id)` 表，避免重复发起点
  3. **ToolCard 3 层查找**：未来 Typola skill 工具（`td-query` / `td-commit` 等）应按 skill 注册专用 renderer

### 2.2 AnythingLLM

- **形态**：Desktop + Docker 双形态。侧边 sidebar 列出 Workspaces（顶层隔离），主区 chat panel
- **Skill 引用**：Agent builder（no-code），MCP-compatibility
- **Session 持久化**：向量库可插拔（默认 LanceDB），聊天历史未在 README 暴露
- **借鉴点**：Workspace 作为顶层单元（类似 Typola project），适合把"一个 Skill OS 场景 = 一个 Workspace"

### 2.3 LobeChat

- **形态**：Next.js + Vite SPA（`dev:spa` 模式端口 9876，proxy 后端）。中央 chat + IM-style gateway
- **Skill 引用**：**10,000+ 插件**，`lobe-chat-plugins` index repo，**Plugin SDK 三阶段**：① 基础安全沙箱 → ② 认证 → ③ 自定义渲染
- **模型切换**：`OPENAI_MODEL_LIST` 环境变量 + `+`/`-` 显隐
- **借鉴点**：Plugin SDK 三阶段是渐进路线（先无认证→再 auth→再自定义 UI）。Typola skill 可复用同样节奏

### 2.4 Dify

- **形态**：工作流编排画布（DSL YAML），chat 是工作流的一个应用节点
- **模型路由**：**Dynamic Model Routing**（按规则自动选 provider/model），per-workspace LLM 选
- **借鉴点**：Dify 的编排图适合把 Typola "心流 → 草稿 → 排版 → 发布"画成可视化工作流（M3+ 可选）

### 2.5 Open WebUI

- **形态**：Svelte 前端，**Redis session**（multi-worker）+ SQLite/Postgres 持久化
- **Skill 引用**：**Python Function Calling**（built-in 代码编辑器写 Python 函数）+ MCP Registry（外部工具）
- **"Many Models Conversations"**：**同一对话可同时挂多个模型**，逐条对比答案
- **借鉴点**：Python 代码编辑器写 plugin 是杀手锏。Typola skill 可以照搬"在 UI 内编辑 skill 脚本 → 立即热加载"

### 2.6 Cherry Studio（**直接对位 Typola**）

- **形态**：Electron 桌面 chat，sidebar + main chat area
- **Skill 引用**：**同时支持 `.claude/skills` + `.agents/skills` 本地路径** + **MCP Marketplace**（"upcoming"）+ `.agents/skills` 子目录（按 skill 分类）
- **Session 持久化**：WebDAV 备份 + 本地存储 + migrations 目录（推测 SQLite）
- **模型切换**：Diverse LLM Provider + **Multi-model Simultaneous Conversations**（同一对话并行跑多模型）
- **借鉴点**：
  1. **`.claude/skills` + `.agents/skills` 双目录扫描**：Typola 已用 `AGENTS.md`，可扫描这两个目录兜底（Claude Code / Codex 自动发现的目录）
  2. **Multi-model simultaneous**：未来 M3+ 让用户对比"Claude 草稿 vs Codex 草稿"
  3. **AGENTS.md / CLAUDE.md 双 root 文件**：Cherry Studio 同时有这两个项目级指令文件

### 2.7 LibreChat

- **形态**：中央 chat（ChatGPT-inspired）+ 右侧 conversation 列表
- **Skill 引用**：**SKILL.md bundles**（文件型）+ **Agent Marketplace**
- **Session 持久化**：MongoDB（Docker Compose）+ Redis（scaling）+ S3（媒体）
- **流式**：**Resumable Streams** — 断线自动重连 + Multi-Tab/Multi-Device Sync（Redis 同步）
- **模型切换**：**Mid-chat 切换**（OpenAI/Anthropic/Azure/Google/Vertex AI/Custom Endpoints 全部兼容）
- **借鉴点**：**Resumable Streams** 是关键 — Tauri app 切到后台被系统杀进程后，回到前台应自动重连续传。Typola 必须做这件事（M1 必做）

### 2.8 Pieces.app

- **形态**：Local-first 工作台（centralized snippet/file/link management）+ Copilot chat（侧边）
- **LTM-2 引擎**：跨 session 时序召回（recent > older），local-first 隐私
- **借鉴点**：LTM 让 chat 有"历史记忆"是 Typola 未来 M4+ 的差异化方向（M2 暂不做）

### 2.9 bolt.diy / bolt.new

- **形态**：浏览器内 AI IDE（StackBlitz WebContainers）— AI 全控 fs / node / pkg / 终端 / 浏览器 console
- **Session 持久化**：URL 共享（云端）
- **借鉴点**：对话 + 实时预览一体化形态。Typola 心流模式已经是这个方向（Vditor 实时渲染）

### 2.10 OpenHands

- **形态**：Agent-Client Protocol (ACP) 通用协议，Agent Server 后端 + Agent Canvas 前端（localhost:8000）
- **Skill 引用**：ACP 协议级 — OpenHands/Claude Code/Codex/Gemini 任一 agent 通过 ACP 接入
- **Session 持久化**：Docker sandbox（`PROJECTS_PATH` mount + `.openhands` volume）
- **借鉴点**：**ACP 是 agent ↔ UI 通用协议**。Typola 心流模式直接调 Claude Code CLI 而不是接 ACP，但未来 M3+ 想接 Codex CLI 可考虑用 ACP 抽象

### 2.11 Zed AI

- **形态**：Rust IDE，**AI panel 在右侧 sidebar**，内嵌于 editor buffer
- **Skill 引用**：`.agents/skills` + `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`（与 Cherry Studio 同构）
- **借鉴点**：右侧 sidebar 形态。Typola 当前心流模式是 dialog 弹出，**长期更适合做右侧常驻 panel**（M2+）

### 2.12 Cursor（设计参考）

- **形态**：VS Code fork，**3 种 AI surface 共生**：
  - **Cmd+K inline**：直接在 editor buffer 内改代码（diff 预览，accept/reject）
  - **Cmd+L sidebar chat**：侧栏多轮对话
  - **Cmd+I Composer**：agent 模式，多文件 plan/diff 预览
- **模型切换**：inline / sidebar / composer 各自选模型
- **借鉴点**：
  1. **3 种 surface 共生**是 Typola 应学的：心流对话框（agent）+ 内联 AI（F1 inline suggest）+ 侧栏 chat（M2+ 可选）
  2. **Composer 的"plan/diff 预览"**：Typola 心流模式应让 Claude 给出"要改什么"的 plan，用户点确认才执行（M2 必做）

---

## 3. 重点洞察问题（5 个）

### 3.1 Chat panel 位置：左 vs 右 vs 底 vs 全屏

| 形态 | 代表 | 优点 | 缺点 |
|------|------|------|------|
| **中央 workspace** | OpenDesign | 编辑器和 chat 共用中央空间，可互嵌 artifact 预览 | 编辑器被 chat 挤压严重 |
| **左侧 sidebar** | AnythingLLM / Cherry Studio / LibreChat | 编辑器占满中央，chat 固定 30-40% | 长对话需要窄 sidebar 滚动 |
| **右侧 sidebar** | Zed AI / Cursor Cmd+L | 符合主流 IDE 习惯 | 左利手不便 |
| **底部抽屉** | VS Code Copilot（旧版） | 不挤压编辑器 | 视野垂直方向受限 |
| **对话框弹窗** | Typola 当前 / bolt.diy | 沉浸式 | 切走即失焦 |

**业界共识**：**右侧 sidebar 是 IDE 形态最优**（Zed / Cursor / Cherry Studio），桌面独立 chat 形态用左侧 sidebar。Typola 当前是"对话框弹窗"（心流模式），长期应改成**右侧常驻 panel**（M2 重构目标）。

**与编辑器不被挤压的关系**：
- sidebar 模式（固定 30-40% 宽）< 全屏 chat（挤压 100%）
- OpenDesign 的"中央"是反例，但它的 artifact viewer 可以覆盖 chat（chat 自动折叠）
- Typola 当前对话框抢焦点太多，建议 M1 改"右侧 380px 固定 + 可折叠"

### 3.2 Skill 引用而非拥有：本地路径 vs Marketplace

| 产品 | 方式 | 适用 |
|------|------|------|
| **OpenDesign** | 本地 `.od/skills/` + `.agents/skills/` 扫描 | 自托管 agent，开发者友好 |
| **Cherry Studio** | `.claude/skills` + `.agents/skills` + MCP Marketplace | 双轨：本地 + 远程 |
| **LibreChat** | SKILL.md bundles + Agent Marketplace | bundle 式打包 |
| **LobeChat** | Plugin SDK + lobe-chat-plugins index repo | 远程 marketplace 优先 |
| **Open WebUI** | Python function 内嵌 + MCP Registry | 代码内嵌 |
| **AnythingLLM** | No-code Agent builder | 远程配置 |

**业界惯例**：**本地路径优先 + Marketplace 补充**（Cherry Studio 路线）。完全 marketplace 锁定（LobeChat）会让本地开发者不满；完全本地（OpenDesign）会限制普通用户。

**Typola 当前**：本地 `.claude/skills` + `.agents/skills` 扫描（与 Cherry Studio 一致）→ M1 不做 marketplace，但 schema 应预留 `source: 'local' | 'marketplace' | 'git'` 字段

### 3.3 多轮 session 持久化：内存 vs SQLite vs 文件

| 产品 | 方式 | 适用 |
|------|------|------|
| **OpenDesign** | SQLite (better-sqlite3, WAL) | 本地重型 |
| **Cherry Studio** | 本地存储 + migrations | 推测 SQLite |
| **AnythingLLM** | 向量库 + 聊天历史（未公开） | 桌面/Docker |
| **LobeChat** | Postgres（Drizzle ORM） | 云端/服务端 |
| **Open WebUI** | Redis session + SQLite/PG | web 多 worker |
| **LibreChat** | MongoDB + Redis + S3 | 云端企业 |
| **bolt.new** | 云端 URL 共享 | 无本地 |

**业界惯例**：
- **桌面独立 app**：SQLite（WAL）— OpenDesign 路线
- **Web 多 worker**：Redis session + PG/SQLite
- **云端 SaaS**：PG/Mongo

**Typola 当前**：内存态（每次重开丢失）→ **M1 必做 SQLite 持久化**（schema 借鉴 OpenDesign `conversations`/`messages`/`agent_sessions` 三表）

### 3.4 Tool call UI：折叠策略

| 折叠策略 | 代表 | 优点 | 缺点 |
|---------|------|------|------|
| **按调用顺序** | OpenDesign ToolCard | 真实还原思考过程 | 长 list 滚不动 |
| **按工具类型分组** | Cursor（todo 折叠） | 一眼看清用了哪些工具 | 失序 |
| **按状态分组（in-progress / done / error）** | OpenHands | 进度感强 | 折叠树深 |
| **全部展开不折叠** | 极简 chat | 无 | 长对话噪音 |

**业界共识**：**按调用顺序 + 按状态分组**，关键工具（Write/Edit）单独高亮。OpenDesign 的 3 层查找（user renderer → family card → generic fallback）+ ResultBadge（streaming/succeeded/error 三态）是最成熟的方案。

**Typola 借鉴**：直接照搬 OpenDesign ToolCard 3 层查找。skill 注册专用 renderer（如 `td-query` 的 SQL preview card、`td-commit` 的 diff preview card），未注册的走 generic fallback。

### 3.5 Chat → 编辑器协同："应用到文档"

| 方式 | 代表 | 适用 |
|------|------|------|
| **剪贴板** | 通用 fallback | 所有 chat |
| **Replace selection** | Cursor Cmd+K inline | 编辑器内 |
| **Insert block at cursor** | VS Code Copilot | Markdown 友好 |
| **Open as new tab** | OpenDesign（artifact 渲染） | HTML artifact |
| **AI-edit document** | Notion AI | 长文整篇改 |

**业界共识**：
- **剪贴板是兜底**，所有 chat 必备
- **Replace selection / Insert block** 是编辑器必备
- **AI-edit document**（全篇改）是 M2+ 方向

**Typola 当前**：心流模式产物走 Vditor 渲染（M3 已落地）→ **M1 应补全**：
1. **剪贴板**（所有 chat 产物一键 copy）
2. **Replace selection**（在 Vditor 选中区域点击"应用"覆盖）
3. **Insert block at cursor**（在光标处插入 AI 产物）

---

## 4. 业界最佳实践汇总（形态层）

```
┌─────────────────────────────────────────────────────────────────┐
│                  Skill OS 工作台形态最佳实践                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Sidebar  │  │ Local    │  │ SQLite   │  │ ToolCard │        │
│  │ Chat     │  │ Skill    │  │ Session  │  │ 3-Layer  │        │
│  │ (Right)  │  │ + Market │  │ WAL      │  │ Renderer │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│  Cursor/Zed    Cherry       OpenDesign     OpenDesign            │
│  IDE 形态      Studio 路线   Desktop 路线    直接照抄              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ 5-Class  │  │ Resumable│  │ Role-    │  │ MCP      │        │
│  │ Stream   │  │ Stream   │  │ Marker   │  │ Gateway  │        │
│  │ Events   │  │ (断线重连)│  │ Guard    │  │ (双协议) │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│  OpenDesign    LibreChat     OpenDesign     LobeChat            │
│  claude-stream 直接借鉴       防 prompt 注入   + Cherry          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 对 Typola Skill OS M1-M4 的可集成点清单

> 按 ROI 排序（前 3 条必做，中间为快速胜利，后 3 条战略储备）

### M1 必做（10 条核心）

1. **[chat-stream] claude-stream.ts 移植** — OpenDesign 5 类事件归一化（status/text_delta/thinking_delta/tool_use/tool_result）+ role-marker guard 防 #3247 类 prompt 注入。**前置**：无。**ROI**：★★★★★（没有这个后续全做不了）。**来源**：`apps/daemon/src/claude-stream.ts`
2. **[persistence] SQLite schema 三表** — `conversations` / `messages` / `agent_sessions` 直接照抄 OpenDesign schema（PK `(conversation_id, agent_id)` 支持多 agent 共享）。**前置**：better-sqlite3 npm。**ROI**：★★★★★。**来源**：`apps/daemon/src/db.ts:76-97`
3. **[chat-panel] 右侧常驻 panel 380px** — 替代当前 dialog 弹窗；保留折叠按钮。**前置**：无。**ROI**：★★★★★（解决"编辑器被挤压"）。
4. **[tool-card] 3 层查找 ToolCard 组件** — `tool-renderers` 注册 → family card（TodoWrite/Write/Edit/Read/Bash）→ generic fallback。**前置**：chat-stream。**ROI**：★★★★。**来源**：`apps/web/src/components/ToolCard.tsx:48-77`
5. **[skill-scan] `.claude/skills` + `.agents/skills` 双目录扫描** — 与 Cherry Studio 同构；扫描 `SKILL.md` 解析为 `SkillSummary`。**前置**：无。**ROI**：★★★★（保留 Anthropic 标准兼容）。
6. **[chat-composer] `localStorage` 草稿持久** — `od:chat-composer:draft:<projectId>:<conversationId>`（OpenDesign 命名空间惯例）。**前置**：无。**ROI**：★★★★。**来源**：`ChatPane.tsx:1067-1069`
7. **[session-switch] conversation 下拉菜单** — 不侧边栏，header 内嵌 `<ConversationsMenu>` + 搜索 + 计数。**前置**：persistence。**ROI**：★★★★。**来源**：`ChatPane.tsx:1781-1897`
8. **[streaming-anchor] ChatGPT-style "anchor to top"** — 发送后用户消息 pin 顶部，回复流式向下增长；scroll out 自动 unpin。**前置**：chat-panel。**ROI**：★★★。**来源**：`ChatPane.tsx:806-1113`
9. **[resume-stream] Resumable Streams 兜底** — Tauri app 切后台被杀 → 回前台自动续传（用 stream-json session UUID）。**前置**：chat-stream。**ROI**：★★★★（macOS 切窗口丢流高频）。**灵感**：LibreChat
10. **[chat-to-editor] 三种应用按钮** — Copy / Replace Selection / Insert Block at Cursor。**前置**：chat-panel。**ROI**：★★★★（缺它 chat 只是 demo）。

### M2 可做（快速胜利 + UX 加固）

11. **[chat-mode] session_mode 切换** — design / chat（OpenDesign 的 `session_mode` 字段），心流模式 = design，普通问答 = chat。**前置**：persistence。**ROI**：★★★
12. **[tool-call-apply] Write/Edit 自动跳 Vditor** — 类似 OpenDesign 的 "Open in tab" 按钮，AI 改写后直接跳到对应光标。**前置**：tool-card + chat-to-editor。**ROI**：★★★
13. **[starter-cards] 空 chat 模板卡片** — 按 `projectMetadata.kind` 分类（image / video / audio / doc），点击填充 composer 不自动发送。**ROI**：★★★。**来源**：`ChatPane.tsx:85-228`
14. **[prompt-caching] session resume 同 prompt hash 复用** — OpenDesign `agent_sessions.stable_prompt_hash` 字段；同 prompt 不重发系统提示。**ROI**：★★★（省钱）

### M3+ 战略储备

15. **[acp] Agent-Client Protocol 抽象** — 想接 Codex CLI / Gemini CLI 时用 ACP 替代当前硬编码 Claude Code CLI。**灵感**：OpenHands。**ROI**：★★（长期）
16. **[ltm] 跨 session LTM 时序召回** — Pieces.app 路线；保存心流模式产物摘要，未来 chat 自动引用。**ROI**：★★（差异化）
17. **[marketplace] Skill Marketplace schema 预留** — `source: 'local' | 'marketplace' | 'git'` 字段，不实现但 schema 留好。**ROI**：★★

---

## 6. 不要做的事（反模式）

- **不要做左 sidebar**：Typola 是 Tauri 桌面 app，主区宽度珍贵，右侧更符合"编辑器为中心"原则
- **不要做 marketplace 在 M1**：Cherry Studio 的 marketplace 也标 "upcoming"，本地 `.claude/skills` 够用
- **不要做 Postgres**：单用户桌面 app，SQLite 已够；migration 成本零
- **不要照抄 Dify 工作流画布**：Typola 心流模式是"对话驱动"，编排图会让用户多 1 步决策
- **不要抛弃 dialog 弹窗**：M1 右侧 panel + 保留 dialog 入口（快捷键唤起）兼容老习惯

---

## 7. 引用与延伸阅读

- OpenDesign 源码：`D:\AI\workspace\open-design\`（Apache 2.0）
- 现有竞品报告：`D:\暂存\Typola\docs\changes\2026-06-16-competitive-research\competitive-research.md`
- Typola 自身定义：`D:\暂存\Typola\docs\AI_WORKBENCH_SKILL_OS.md`
- Cherry Studio 双 skill 目录确认：`.claude/skills` + `.agents/skills` + MCP Marketplace
- LibreChat Resumable Streams：Redis-backed session + AI responses 自动重连

---

## 8. 一句话总结

> Typola Skill OS 应**照搬 OpenDesign 的"5 类事件流 + SQLite 三表 + ToolCard 3 层查找"内核**，外层借 Cherry Studio 的双 skill 目录扫描 + LibreChat 的 Resumable Streams，UI 形态**改当前 dialog 弹窗为右侧 380px 常驻 panel**。
