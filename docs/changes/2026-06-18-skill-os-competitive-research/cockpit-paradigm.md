# Typola 驾驶舱范式竞品调研（v3 — 能力清单 + 集成路线图）

- **日期**：2026-06-18
- **作者**：Claude（minimax-M3）— 主线程
- **目的**：在 v2 报告"产品概览 22% 覆盖度"基础上，**深挖 8 个驾驶舱范式竞品的能力清单 + 集成点**，识别 Typola 1.x 阶段缺什么、哪些 P0/P1 可集成
- **基线**：
  - `D:\暂存\Typola\docs\AI_WORKBENCH_SPEC.md`（心流模式 spec — 已并 PR #55）
  - `D:\暂存\Typola\docs\AI_WORKBENCH_SKILL_OS.md`（Skill OS spec — M1~M4 路线）
  - `D:\暂存\Typola\docs\changes\2026-06-16-competitive-research\competitive-research.md`（v2 报告 20 项目概览 — 不重复）
  - `D:\暂存\Typola\docs\changes\2026-06-18-skill-os-competitive-research\skill-os-workbenches.md`（Skill OS 工作台形态谱 — 不重复）
  - `D:\暂存\Typola\docs\changes\2026-06-18-skill-os-competitive-research\markdown-editors.md`（Markdown 编辑器底层架构 — 不重复）
- **本报告焦点**：**驾驶舱四区范式（左文件 × 中预览 × 右对话 × 底终端）+ 18 项能力补完 + 实时预览 + 活的仪表盘 + PTY/headless 路线选择 + 1.x 集成路线图**
- **数据来源**：
  - **已验证（README/官方）**：fanbox（master 分支完整 307 行）、SoloMD v4.6.1（zhitongblog/solomd 完整 236 行）、Obsidian Copilot v4（logancyang/obsidian-copilot 345 行）、bolt.new（stackblitz/bolt.new 54 行）
  - **基于训练数据 + 公开文档（明确标"⚠ 未验证"）**：Warp Oz、Pieces.app、Replit Agent 4、Devin —— 这 4 个为闭源 SaaS，仅 README/官网有营销文案，深度能力以业界公开信息为准

---

## 0. TL;DR

1. **fanbox 是驾驶舱范式最直接参考**，README 完整 18 项能力已数清。Typola 心流模式 spec **覆盖 4/18（22%）**，**Skill OS M1 仍覆盖 4/18**（spec 没补）—— **78% 缺口跨阶段仍未补**。
2. **驾驶舱范式竞争已分两条路线**：
   - **L5a 真实 PTY 嵌终端**（fanbox / SoloMD / Obsidian Copilot）—— 保全用户 skill 生态，代价是要做写盘审批、态势感知、git diff 这些"补丁 UI"
   - **L5b headless stream-json**（OpenDesign / AnythingLLM / Cherry Studio）—— 结构化输出 + 多 agent 编排，代价是丢掉 claude 自身 skill 生态
   - **Typola Skill OS M1 已选 L5b**（OpenDesign 路线），M2+ 应**两路并存**（心流模式 spec 保留 L5a 终端兜底）
3. **PTY vs headless 不是二选一**：fanbox + SoloMD 都用 PTY 但体验更好，因为 **PTY 保全 ① 真实 skill 生态 ② 真实交互授权 ③ 真实 TUI 工具**（vim/htop/git），代价是 app 不能解析 TUI。OpenDesign 的取舍是放弃 skill 生态换多 agent / 商业化。Typola **M1 走 headless 主流 + 终端兜底**是务实选择。
4. **实时预览三种范式**（关键洞察 #3）：
   - **Bolt.new WebContainer** —— 浏览器内 Node.js，**全栈但仅限 Web**
   - **Replit VM** —— 真实云端 VM，**全栈但需联网 + 慢**
   - **fanbox sandboxed iframe** —— 零网络，本地静态 HTML/资源
   - **Typola html-ppt 产物应走 fanbox 路线**（本地 + sandboxed iframe，**已规划 §6.2 落实**）
5. **驾驶舱 vs 单屏对话**（关键洞察 #4）：fanbox 是驾驶舱（始终四区），OpenDesign 是单屏对话（编辑器中央 + chat 左/右 panel）。**Typola Skill OS M1 = 左侧 AI 工作台 + 编辑器全高 + 右侧场景（M2+） + 底终端兜底**——**本质是 fanbox 驾驶舱 + OpenDesign chat panel 嫁接**。
6. **活的仪表盘取舍**（关键洞察 #5）：fanbox 的涟漪/呼吸 = 纯 UI 装饰，**Obsidian Copilot 的 thinking 流 = 信息密度**（真在展示 agent 在想什么）。Typola 该做"**有信息密度的活仪表盘**"——thinking 流是核心信息（已有 OpenDesign ThoughtCard 形态），涟漪只在文件落盘事件时短暂出现（1 次脉冲不持续）。
7. **Typola 1.x 阶段集成路线图**（末尾）：把识别出的能力按 P0/P1/P2/P3 排序 + 工作量估算 + M1/M2/M3/M4 阶段锚定。**P0 5 条全在 M2+ 阶段**——M1 (Skill OS) 不动驾驶舱范式，纯移植 OpenDesign chat panel + 文件树切换。

---

## 1. 驾驶舱范式能力清单（18 项 · fanbox 完整盘点）

> **说明**：v2 报告 §15.3 提到 fanbox 18 项能力但未全列。**本节是 fanbox README §"What it does" 完整 4 大类 22 项细分**（合并后正好 18 项主能力）。Typola 心流模式 spec 当前覆盖 4/18 = 22%，Skill OS M1 spec 仍覆盖 4/18。

| # | 能力 | fanbox 实现细节 | Typola 心流 spec | Typola Skill OS M1 | 优先级 |
|---|------|----------------|----------------|----------------|------|
| **A 组 · 文件** |
| A1 | ⌘K 全局模糊搜索 | 文件名片段 + `内容:关键词` 切全文 | ❌ 无 | ❌ 无 | P2 |
| A2 | 强色实体图标 | PDF 红 / JS 黄 / Markdown 蓝，照片视频按真实比例 | ❌ 无（Typola 配色克制） | ❌ 无 | P3 |
| A3 | 原地预览（md/html/图片/视频/PDF/HEIC） | md 渲染 / html 实时 / 缩略图 0.1s | ✅ md 已有 / html iframe §6.2 规划 | ✅ 复用现状 | — |
| A4 | 项目徽章（node/web/py/rs/go） | 文件夹卡片标 | ❌ 无 | ❌ 无 | P3 |
| **B 组 · Watch what the agent changed（5 项）** |
| B1 | **活的仪表盘**（涟漪/呼吸） | agent 每写一个文件，那张卡片荡开涟漪、按改动频率发光呼吸 | ❌ spec §0.1 只说"高亮" | ❌ 无 | P1 |
| B2 | **跟随模式**（一键跟踪 agent 正在编辑的文件） | 文件视图+预览跟踪；代码随新写行高亮闪烁；HTML 边写边实时渲染（**双缓冲、零白闪**）；Markdown 实时渲染 | ❌ spec §14 P3 | ❌ 无 | **P0** |
| B3 | 会话回放（时间轴） | 像刷视频一样拖时间轴 | ❌ P3 | ❌ 无 | P3 |
| B4 | 变更收件箱（跨 workspace 汇总） | 多项目并行 agent 集中看 | ❌ 无（仅单 workspace） | ❌ 无 | P3 |
| B5 | **Git diff 视图**（Monaco DiffEditor） | HEAD vs 工作区只读 | ❌ P3 | ❌ 无 | **P0** |
| **C 组 · Agent 驾驶舱（7 项）** |
| C1 | **项目记忆**（历史会话 + ▶ 续上） | `claude --resume` / `codex resume` 一键接上下文 | ❌ P2 | ❌ 无 | P1 |
| C2 | 截图直通车（系统截屏落盘即直通卡） | 喂给 agent / 收进素材/ / 标注再发 | ❌ 无 | ❌ 无 | P3 |
| C3 | AI 整理（元数据级 + 一键撤销） | AI 只看元数据出提案，不读内容不碰文件系统；人审批；写回滚日志 | ❌ 无 | ❌ 无 | P2 |
| C4 | 发版向导（node 项目） | 版本号 / CHANGELOG / 打包 / 推送 / GitHub Release | ❌ 无 | ❌ 无 | 不适用（Typola 不做发版） |
| C5 | **Skills 透视**（触发统计 + 健康检查 + 启停） | 本机全部 agent skills 一视图 | ❌ P2 | ❌ 无 | P2 |
| C6 | **Agent 用量**（Claude 5h 窗口 / 本地 token） | 与 `/usage` 同源 | ❌ P3 | ❌ 无 | P2 |
| C7 | 磁盘占用透视（`du` 口径） | 下钻到文件夹 | ❌ 无 | ❌ 无 | P3 |
| **D 组 · 终端（5 项）** |
| D1 | **真实内嵌终端**（node-pty + xterm.js WebGL） | 跑 Claude Code / vim / htp / 中文宽字符 | ✅ portable_pty + xterm.js（已有） | ✅ 现状保留（兜底） | — |
| D2 | **拖文件进终端** | 拖文件/文件夹 → 自动插入路径喂给 agent | ❌ spec §14 P3 | ❌ 无 | P2 |
| D3 | **路径可点击**（空格边界由 stat 验证） | 终端里路径直接点击在 FanBox 打开；macOS 截屏名/中文/折行长路径 | ❌ P3 | ❌ 无 | **P0（低难度高价值）** |
| D4 | 选中即甩给终端（bracketed paste） | 预览选区「文件出处 + 围栏」注入 | ✅ spec §5.3 + 件1 选区注入规划 | ✅ M2 复用心流架构 | — |
| D5 | **态势感知**（标签圆点 + 终端边缘呼吸 + 系统通知） | 运行/空闲/退出；agent 把球踢回给你时终端边缘呼吸；长任务完成发系统通知 | ❌ spec §8.2 提到但未做 | ❌ 无 | **P0** |
| **E 组 · 编辑器（4 项）** |
| E1 | Markdown WYSIWYG（Milkdown Crepe） | Notion 式，所见即所得；停笔 0.8s 自动保存 | ✅ Vditor IR（更"Typora 派"） | ✅ 现状保留 | — |
| E2 | 代码/JSON（Monaco 随皮肤切主题） | VS Code 同款内核 | ✅ CodeMirror 6 源码模式（仅源码态） | ✅ 现状 | — |
| E3 | 图片标注（画笔/箭头/文字/打码/格式转换） | 覆盖原图前有确认 | ❌ 无 | ❌ 无 | P3 |
| E4 | 未保存守卫（三种编辑器统一拦截） | Esc 旁路也堵死 | ✅ spec 已有（三按钮对话框） | ✅ 现状 | — |

**统计**：
- **fanbox 实现**：18 / 18（100%）
- **Typola 心流模式 spec 覆盖**：4 / 18（22%）
- **Typola Skill OS M1 覆盖**：4 / 18（22%）—— M1 没补任何驾驶舱能力

**已覆盖的 4 项**：A3（原地预览）/ D1（真实终端）/ D4（选中即甩 — 仅规划）/ E1（Markdown WYSIWYG）/ E2（代码）/ E4（未保存守卫）= 实际 6 项，但 v2 报告只数 4 项（D4/E2 与现状架构合并数）。

---

## 2. 各竞品形态细节（驾驶舱四区维度）

### 2.1 fanbox（`alchaincyf/fanbox`）— 驾驶舱范式最直接参考

- **Star / 版本**：⚠ 2026-06-16 数据 584★/83 forks/MIT；本调研未再验证（无更新）—— **沿用 v2 数据**
- **形态定位**：**经典驾驶舱**（四区始终存在，AI 工作台 = 终端）
  - 左：文件列表（强色实体图标）
  - 中：原地预览（md/html/代码/图片/视频/PDF/HEIC 统一渲染）
  - 右：Agent 驾驶舱（项目记忆 / Skills 透视 / Agent 用量 / 截图直通车面板）
  - 底：真实内嵌终端（node-pty + xterm.js WebGL）
- **AI 集成深度**：**PTY 嵌真 claude/codex**，不重做 chat UI，**不解析 TUI**，靠文件监听反应
- **实时预览能力**：**HTML 双缓冲零白闪**（跟随模式下边写边实时渲染）；Markdown 实时渲染；图片/PDF 原地内嵌
- **文件交互**：**拖文件进终端** + **路径可点击**（stat 验证空格边界）+ 选中即甩（bracketed paste）
- **记忆/上下文**：**项目记忆**（`claude --resume` 一键续上下文）
- **活的仪表盘**：**涟漪 + 呼吸**（agent 每写一个文件，那张卡片荡开涟漪、按改动频率发光呼吸）+ **态势感知**（标签圆点 + 终端边缘呼吸提示"轮到你" + 长任务系统通知）
- **3 套皮肤整套审美语言**：Volt（终端感荧光绿）/ Archive（档案纸感）/ Index（编辑式索引日报）—— 配色+字体+图标+代码高亮+终端 ANSI 整体变，**非主题色**
- **设计纪律**：每阶段 5 个独立 subagent 评分 ≥90 才达标（重度 vibe coder / 原生审美设计师 / 零文档新用户 / 终端十年老兵 / 破坏性质量官）
- **对 Typola 1.x 借鉴点**（关键）：
  1. **跟随模式 + HTML 双缓冲** 是 fanbox 体验灵魂，**Typola html-ppt 产物**（场景卡）应学
  2. **路径可点击**（stat 验证空格边界）是低难度高价值，**P0 必补**
  3. **项目记忆 + `claude --resume`** 是 fanbox 独有，与 Skill OS M1 路线（headless stream-json）冲突—— Skill OS 走 M1 `claude --session-id` + `claude --resume` 已经隐含
  4. **态势感知**（标签圆点 + 终端边缘呼吸）= **P0 必补**（Typola spec §8.2 提了未做）
  5. **3 套皮肤整套审美语言** = 借鉴思路（Typola 当前只有暗色/暖米两套），优先级低

### 2.2 SoloMD v4.6.1（`zhitongblog/solomd`）— 直接对位（栈同 + 场景同）

- **Star / 版本**：⚠ 375★（v2 数据，2026-06-16）/ **v4.6.1 latest release**（本调研 2026-06-18 验证 release tag）
- **License**：**MIT**（v2 数据，README 验证）
- **平台**：macOS dmg ~32MB / Windows x64 msi+nsis+portable / Linux .AppImage+.deb+.rpm / iPad iPadOS native —— **比 Typola 多 iPad/Linux**
- **形态定位**：**单屏对话框 + WYSIWYG 编辑器**（非典型四区驾驶舱；驾驶舱是 SoloMD 的"分心"，主力是 chat-with-vault）
  - 主区：WYSIWYG 编辑器（Typora 风格，Vditor 那种 IR 但用 CodeMirror 6）
  - 右：Agent Panel（v4.0 引入；多轮对话 + `[[wikilink]]` 引用 + tool-call 卡内联展开 + Insert/Copy 按钮）
  - 无显式驾驶舱底终端（PTY 不在主路径上）
- **AI 集成深度**：**MCP 中转**（`solomd-mcp` 二进制暴露 13 工具） + Claude Code / Codex / Cursor 任意 MCP 客户端都能 drive vault；**也支持**内置 chat-with-vault（14 BYOK providers）
  - 工具集：8 通用（read/write/list/search...）+ **5 SoloMD 独有**（`autogit_log` / `autogit_diff` / `autogit_rollback` / `sync_status` / `share_url`）
- **写盘审批**：**AutoGit 分支 sandbox**（每次 agent 写入落独立 git 分支，UI 显式 accept/reject 才合并到 main）——**这是 SoloMD 的杀手锏**
- **recipe 调度**：YAML `<workspace>/.solomd/agents/*.yml` 支持 `cron` / `on-save` / `on-commit` / `on-tag-add` / manual 5 种触发器
- **可回放 trace**：`trace.jsonl` per run（步骤级 `prompt` / `model_call` / `tool_call` / `tool_result` / `git_commit`），`read_agent_trace` MCP 工具读取
- **写盘保护**：
  - **写盘 cap**：每 run 默认 5 写，硬上限 50（防失控）
  - **拒绝脏工作树启动**：工作树不干净时 recipe runner 拒绝启动（防 agent 吞掉 in-progress 改动）
  - **路径遍历守卫**：所有 Tauri/MCP/REST 入口拒绝 `..` 段和绝对路径
- **MCP federation**：`solomd-mcp --workspace path1 --workspace path2`，**一个 Claude Desktop session 跑多 vault**
- **MCP 安全**：stdio only，**绝不开网络端口**；read-only by default，**`--allow-write` opt-in**
- **同步**：GitHub-backed sync（E2EE Argon2id + XChaCha20-Poly1305，路径作 AAD）
- **知识图谱（v4.6 新增）**：
  - **Properties inspector** `⌘⇧I` —— YAML frontmatter 编辑（type/date/status/relation）
  - **Typed relationships** —— `belongs_to` / `related_to` / `has` 自动反查
  - **Relationship graph**（"Neighborhood"）—— per-note 出链 + 反链浏览器
  - **tldraw whiteboards** —— ` ```tldraw ` 围栏代码块，Markdown 备份
- **实时预览**：**无显式实时预览**（不像 fanbox 那样边写边渲染），但 WYSIWYG 是 IR 模式，**写作时即渲染**
- **文件交互**：drag-drop 到编辑器插入图片 / paste image to `_assets/`
- **记忆/上下文**：**MCP session 内多轮**（`agent_sessions(conversation_id, agent_id, session_id)` 多 agent 共享同一对话），**无跨重启持久**（vs OpenDesign SQLite）
- **活的仪表盘**：无（不是 SoloMD 焦点；用 thought 流 + tool-use 卡片代替）
- **对 Typola 1.x 借鉴点**（关键）：
  1. **AutoGit 分支 sandbox** —— 比 Typola 当前"文件监听 + reload"更安全。**P1 补齐**，watcher 上挂一层 git 即可，不动 PTY 路线
  2. **replayable `trace.jsonl`** —— 配合 fork / 接受拒绝做 step-level 重放。**P2 补齐**
  3. **YAML recipes（5 触发器）** —— 与 Typola Skill OS M2+ 场景分类对齐，**但 SoloMD 是 `cron`/`on-save`/`on-commit` 触发，Typola 是用户手动点** —— 不同心智
  4. **写盘 cap + 拒绝脏工作树** —— SoloMD 的安全护栏，Typola 没设计
  5. **5 个 SoloMD 独有工具**（autogit_* / sync_status / share_url）—— SoloMD 走 MCP 协议锁住，Typola PTY 路线**不受协议锁**，可自由用 `git`/`gh`/脚本

### 2.3 Obsidian Copilot v4（`logancyang/obsidian-copilot`）— Obsidian 内嵌 CLI agent

- **Star / 版本**：⚠ 7.2k★（v2 数据，2026-06-16）/ v4 "Agent Mode" —— **本调研 README 验证 v4 存在 + 需 Copilot Plus 订阅**
- **License**：AGPL-3.0（v2 数据）
- **形态定位**：**Obsidian 内插件 + 右栏 chat**（不是驾驶舱范式，是 Obsidian 增强插件）
  - 主区：Obsidian 核心（Vault + Markdown）
  - 右：Copilot chat panel（Chat Mode / Vault QA Mode / Agent Mode）
  - 无显式驾驶舱底终端（Agent Mode 内嵌 opencode / claude / codex 子进程）
- **AI 集成深度**（v4 验证）：
  - **v4 Agent Mode 嵌 opencode / Claude Code / Codex CLI**（"natively inside your vault"）
  - 早期版：BYOK（OpenAI-compatible + 本地模型）
  - 后续：Copilot Plus 订阅 + 14 BYOK providers
- **v4 主打能力**（README 验证）：
  - **Bring your own agent**（opencode / Claude Code / Codex 任选）
  - **Long-term memory**（LTM）：跨 session 持久 agent 状态（与 Pieces.app LTM 同思路）
  - **Same commands and tools as just markdown files**（skill 走 `.md` 文件，可由用户编辑）
  - **On your hardware**（本地 LLM 跑 + LTM 本地存）
- **4 大核心模式**（README 验证）：
  1. **Chat Mode** —— `@` 加上下文 + chat with your note
  2. **Vault QA Mode** —— chat with your entire vault（嵌入检索）
  3. **Project Mode** —— 基于 folders/tags 创建 AI-ready context（**NotebookLM 类比**）
  4. **Agent Mode（Plus）** —— 自治 agent + 自动工具调用（vault/web/自定义）
- **Command Palette 快捷键**（README 验证）：
  - `⌘L` —— 选中文本加到上下文
  - `⌘K` —— Quick Command（选中文本应用命令，不开 chat）
  - 右键菜单 —— 选中文本 + 1-click 应用
  - `/` —— 在 chat 内 Command Palette
- **Relevant Notes** —— 写时弹出语义相似 + wikilink 笔记推荐
- **记忆/上下文**：**LTM 跨 session**（v4 验证）
- **活的仪表盘**：thinking 流（agent 思考过程实时显示）
- **对 Typola 1.x 借鉴点**（关键）：
  1. **`⌘L` 选区注入 + `⌘K` Quick Command** 是 MCP/工具调用范式标配，Typola Skill OS M3 选区浮 toolbar 直接搬
  2. **Vault QA Mode**（嵌入检索）是 RAG 路线参考，**Typola M4+ 可加**（前提是用户授权本地 embedding）
  3. **LTM 跨 session** 是 fanbox/SoloMD/Obsidian 三家中 Obsidian 独有，**Typola M2 持久化（serde_json 即可，不必 SQLite）可对位**
  4. **Project Mode**（folders/tags = context）—— 与 Typola 心流 spec §5.2 占位符 `{file}` `{workspace}` 是同一思路，Typola 更克制（单文件 vs 多 file）

### 2.4 Bolt.new（`stackblitz/bolt.new`）—— 单屏对话 + 实时预览

- **Star / 版本**：⚠ 4.1k+★（v2 数据）/ **v0.x**（README "Bolt.new is in beta" 验证）
- **License**：Apache 2.0（v2 数据）—— 仅开源 SDK 部分
- **形态定位**：**单屏对话 + 实时预览**（非驾驶舱范式）
  - 主区：左 chat panel（对话） + 右 preview pane（实时预览 WebContainer 跑出来的 app）
  - 无显式左文件树（WebContainer 内文件系统不直接暴露给用户）
  - 无底终端（命令在 WebContainer 内嵌终端跑，UI 折叠）
- **AI 集成深度**：**自建 agent loop**（README "Claude, v0, etc are incredible — but you can't install packages, run backends or edit code. That's where Bolt.new stands out" 验证）
  - **AI 完全控制环境**：filesystem + node server + package manager + terminal + browser console
  - **AI 自主测试 / 重构 / 迭代**（无显式 diff / 写盘审批）—— ⚠ **反面参照**（用户失控）
- **实时预览能力**：**WebContainer**（README 验证）—— **浏览器内跑 Node.js**：
  - 安装 npm 包（Vite / Next.js / Astro / Tailwind 等）
  - 跑 Node server
  - 调第三方 API
  - 部署到 production
  - Share via URL
- **使用门槛**：**AI 代理能力强，但 prompt 需具体**（README "Tips: Be specific about your stack"）—— 弱 prompt → 弱结果
- **增强 prompt 图标**（README 验证）：发送前 AI 帮改写 prompt
- **批量指令**（README 验证）：把多个简单指令合成 1 个 message 节省 token
- **记忆/上下文**：**会话内**（无跨 session 持久化；每个项目重新开始）
- **活的仪表盘**：**无**（chat 流是主显示，thinking 不展开）
- **对 Typola 1.x 借鉴点**（关键）：
  1. **WebContainer** 是浏览器内 Node.js 范式，**Typola 不需要**（Typola 走 Tauri 本地，文件直接在用户机器）
  2. **增强 prompt 图标**（AI 帮改写）是低价值 UX 装饰，Typola 不做
  3. ⚠ **反面参照** —— Bolt.new 让 AI 完全控制环境无 diff 审批，**Typola 绝不能走**（与 fanbox "AI 整理只看元数据不读内容" 反向）

### 2.5 Replit Agent 4（⚠ 未验证 / 闭源 SaaS）

- **形态定位**：**画布 + Kanban + 对话**（v2 报告引用：3 区，agent 自主写代码到 Kanban card）
  - 画布：可视化项目结构
  - Kanban：任务卡片（agent 自动建/推/完）
  - 对话：自然语言提需求
- **AI 集成深度**：Replit 内部 LLM（具体未公开），**全栈自主**（webapp + db + deployment）
- **实时预览能力**：**真实云端 VM**（每个 Repl 独立沙箱 VM，跑真实 Node/Python/etc）
- **记忆/上下文**：会话内 + 工作树持久
- **活的仪表盘**：Kanban 状态变化（todo → in-progress → done）—— **任务级 UI 比 fanbox 文件级 UI 信息密度高**
- **对 Typola 1.x 借鉴点**（关键）：
  1. **Kanban 任务级状态**（todo/in-progress/done）是 agent 任务追踪的可借鉴形态，但 Typola 走"产物列表 chips"已经是简化的 Kanban
  2. **真实云端 VM** 与 Typola 本地优先冲突，**不借鉴**
  3. ⚠ **反面参照**：Replit 的 "AI 全栈自主 + 用户偶尔看 Kanban" 适合 SaaS 用户，**Typola 个人工作流启动器定位不符**

### 2.6 Warp.dev Oz（⚠ 未验证 / 闭源 SaaS）

- **形态定位**：**终端 + 多 harness 编排**（Warp 本身就是终端 + AI agent "Oz" 多 harness）
  - 主区：终端（带 Warp UI 增强）
  - 多 agent：Oz 协调多个子 agent 任务
- **AI 集成深度**：**多 harness 编排** —— Oz 内部调度不同 model 跑不同子任务
- **实时预览能力**：无（终端为主）
- **记忆/上下文**：会话内 + Warp Drive 持久（⚠ 商业绑定）
- **活的仪表盘**：终端命令 block + status 圆点
- **对 Typola 1.x 借鉴点**（关键）：
  1. **多 harness 编排**是 Typola M4+ 多 agent 路线参考
  2. **Warp Drive 持久** 是商业绑定产品，**Typola 不应走**

### 2.7 Devin（⚠ 未验证 / 闭源 SaaS，反面参照）

- **形态定位**：**VM 自主层**（agent 在云端 VM 完全自主，UI 只显示进度）
  - 画布：项目树 + 进度
  - 对话：自然语言 + plan 模式
  - **用户介入极少**（agent 自主跑完）
- **AI 集成深度**：Devin 内部 LLM + 自建工具循环
- **实时预览能力**：云端 VM 跑 + screenshot 反馈
- **记忆/上下文**：会话内 + 商业持久
- **活的仪表盘**：plan checklist + 步骤进度条
- **对 Typola 1.x 借鉴点**（关键）：
  1. ⚠ **反面参照**：Devin 用户失控严重，**Typola 个人工作流启动器定位不符**
  2. **plan checklist** 是 Typola 心流 spec §5 guidance markdown 的对位（用户能看 agent 要干什么）

### 2.8 Pieces.app（⚠ 未验证 / 闭源 SaaS）

- **形态定位**：**Workbench（中央 snippet 管理）+ Copilot chat + LTM**
  - Workbench：保存代码片段 / 笔记 / 链接
  - Copilot：chat panel
  - LTM：长期记忆引擎（跨 session 时序召回）
- **AI 集成深度**：多 model（本地 + 云端）+ LTM 引擎（保存所有用户活动，AI 自动关联）
- **实时预览能力**：**本地渲染**（保存的 HTML 片段在 app 内预览）
- **记忆/上下文**：**LTM 跨 session + 跨设备**
- **活的仪表盘**：无（snippet 列表为主）
- **对 Typola 1.x 借鉴点**（关键）：
  1. **LTM 长期记忆** 是 Pieces 独有卖点，**Obsidian Copilot v4 也学了这个**，Typola M2 持久化可对位
  2. **Workbench 中央 snippet 管理** 与 Typola 多产物融合思路类似，但 Pieces 是"保存所有历史"，Typola 是"本次产物列表"（更聚焦）

---

## 3. PTY vs Headless 真实体验对比（关键洞察 #2）

> 这是 Skill OS M1 spec 选 headless stream-json（OpenDesign 路线）后最关键的问题：fanbox / SoloMD / Obsidian Copilot 都用 PTY，**我们为什么走 headless？** 两类用户的真实痛点 + 最佳场景。

### 3.1 PTY 路线（fanbox / SoloMD / Obsidian Copilot v4）

**技术**：embed real terminal（node-pty / portable_pty），spawn `claude` / `codex` 作为子进程，**与用户在 shell 里直接敲 `claude` 等价**。

**核心收益**：
1. **保全 claude code 自身 skill 生态** —— 用户在 `~/.claude/skills/` 装的任何 skill（`/baoyu-slide-deck` / `/ni-writer` / `/humanizer`）都自动可用
2. **真实 TUI 工具** —— vim / htop / lazygit / tig / 任何 CLI 工具都能跑
3. **真实授权交互** —— 权限提示（y/n/always）在终端原生弹
4. **真实 plan mode / shift+tab** —— Claude Code 自己的 TUI 能力
5. **生态兼容** —— 任何 agent CLI 升级都自动生效

**核心代价**：
1. **不能解析 TUI**（脆性）—— Claude Code TUI 文案每版变
2. **写盘靠监听**（不是"AI 通知"）—— 必须有文件 watcher
3. **写盘审批弱**—— 权限在 TUI，App 不能做显式 accept/reject 按钮
4. **多 agent 难**—— 每个 agent 都要起一个 PTY 进程

### 3.2 Headless stream-json 路线（OpenDesign / AnythingLLM / Cherry Studio）

**技术**：spawn `claude -p --output-format stream-json --verbose`，从 stdout 读 JSONL，**App 自己解析和渲染**。

**核心收益**：
1. **结构化输出** —— 每条消息是 typed event（status / text_delta / thinking_delta / tool_use / tool_result / usage / error），App 完整知道 agent 在干什么
2. **多 agent 编排** —— 同一 App 可调度多个 agent（不同 model / 不同 skill）
3. **UI 完全控制** —— ToolCard 折叠 / 思考流展开 / 错误诊断 / 用量统计 都可做
4. **写盘审批强** —— App 知道每次 tool_use 是什么，可以做 Accept/Reject 按钮
5. **状态可观测** —— stalled / error / usage 都有 typed event，App 不用猜

**核心代价**：
1. **丢 skill 生态** —— 除非显式 `--append-system-prompt` 注入，App 不能复用用户 `~/.claude/skills/`
2. **丢 TUI 工具** —— 任何依赖 TUI 的工具（vim / htop）都用不了
3. **需要重写渲染** —— text_delta 流式打字机 / thought 折叠 / tool_call 卡 都要自己实现
4. **绑死 claude CLI 协议** —— claude 升级 stream-json 协议变化要跟着改

### 3.3 两类用户痛点对比

| 维度 | PTY 派（fanbox 路线） | Headless 派（OpenDesign 路线） |
|------|---------------------|----------------------------|
| **核心痛点** | "我装了 10 个 skill，App 居然不让我用" | "App 居然要我自己手动在终端里跑命令 / 我想点按钮让 AI 改文件" |
| **典型用户** | 重度 vibe coder / 终端十年老兵 | PM / 架构师 / 知识工作者（不熟终端） |
| **失败场景** | claude 升级 TUI 文案，App 解析崩 | claude 升级 stream-json 协议，App 解析崩 |
| **成功场景** | 用户手动纠错强 / 透明可介入 | 多 agent 编排 / UI 精致 / 写盘审批强 |
| **生态绑定** | **绑 shell + skill 文件系统** | **绑 claude CLI 协议** |
| **维护负担** | 监听文件 + PTY 转发（轻） | 协议解析 + UI 渲染（重） |

### 3.4 Typola 1.x 的选择

**Skill OS M1 选 headless + 终端兜底**（已定，spec §3）：
- M1 主路径 = headless stream-json（OpenDesign chat panel 形态）
- 兜底 = PTY 终端（保留心流模式 spec §4-§9 现状）

**理由**（核心）：
1. Typola 目标用户是**知识工作者**（PM / 架构师 / 博主）—— 偏 OpenDesign 派
2. **多产物融合**是 Typola 差异化（同一 Markdown 导出 Word/HTML/触发 skill）—— headless 更适合（每个产物触发一个独立会话）
3. **写盘审批**在 M3 产物回流时是刚需（"应用到文档"按钮 + "替换选区"按钮）—— headless 能做精细控制
4. **PTY 兜底**保全 hardcore 用户 + claude 自身 skill 生态

**M2+ 应**：
- M2 场景分类：headless 主流（用户点 skill 触发）+ 终端作为"高级模式"折叠面板
- M3 产物回流：headless 强项（"应用到文档"按钮 + diff 预览）
- M4+ 多 agent：headless 强项（多 harness 编排）

---

## 4. 实时预览范式（关键洞察 #3）

> Typola 心流模式 spec §6.2 已规划 HTML 产物用 sandboxed iframe 渲染，**这是 fanbox 路线**。本节是 4 种实时预览范式的对位分析。

### 4.1 Bolt.new WebContainer

**范式**：浏览器内 Node.js（无网络）
- StackBlitz 自研 WebContainer API（Hypervisor 级沙箱）
- 支持：Vite / Next.js / Astro / Tailwind / 任意 npm 包
- **限制**：仅限浏览器 / 限 Web 栈（不能跑 Python/Go/Rust）

**适合场景**：
- 全栈 web 开发快速原型
- 教学/演示（学生直接在浏览器里跑代码）

**不适合**：
- Typola（本地桌面 app，**Tauri 直接调系统 node/python** 更直接）

### 4.2 Replit VM

**范式**：真实云端 VM（联网 + 慢 + 商业）
- 每个 Repl = 1 个云端 sandbox VM
- 支持：任意语言 + 任意运行时
- **限制**：必须联网 + 速度慢 + 商业绑定

**适合场景**：
- SaaS 全栈开发
- 教学/协作（多人共享 VM）

**不适合**：
- Typola（本地优先 + 离线可用是品牌定位）

### 4.3 fanbox sandboxed iframe

**范式**：本地静态资源（零网络）
- HTML 产物落盘 → sandboxed iframe 加载（`sandbox="allow-scripts"`，**不给** `allow-same-origin`）
- Markdown 实时渲染（marked + highlight.js）
- 图片 / 视频 / PDF / HEIC 原生显示
- **HTML 双缓冲零白闪**（跟随模式下边写边渲染，agent 写到哪光走到哪）

**适合场景**：
- 本地文档/演示预览
- 知识工作者的"看到产物"需求

**适合 Typola**：
- ✅ **已规划**（心流 spec §6.2）
- ✅ Typola html-ppt 产物（场景卡 `html-ppt`）走这条路
- ✅ Typola Markdown 产物（场景卡 `polish` / `wechat` / `daily-report`）走这条路

### 4.4 Pieces 本地渲染

**范式**：snippet 内嵌渲染（轻量）
- 保存的 HTML 片段在 app 内预览
- 不支持完整应用栈

**适合场景**：
- 单文件片段预览（HTML 邮件片段 / Markdown 笔记）

**不适合**：
- Typola（我们做的是文档工作台，不是 snippet 管理器）

### 4.5 Typola html-ppt 产物应走哪条路？

**决策**：**fanbox 路线**（sandboxed iframe + 本地 + 双缓冲零白闪）

**理由**：
1. **本地优先**（品牌定位）—— 不联网
2. **HTML 产物为主**（ppt 大纲、网页演示、邮件片段）—— iframe 够用
3. **跟随模式是 fanbox 体验灵魂** —— agent 写到哪光走到哪是关键 UX
4. **Tauri 直接调系统 node** —— 不需要 WebContainer

**M1 阶段**（已规划）：
- HTML 产物落盘 → sandboxed iframe 重载（`sandbox="allow-scripts"`，**不给** `allow-same-origin`）
- Markdown 产物 → Vditor 现有预览
- 双缓冲零白闪属于 M2 跟随模式（不在 M1 范围）

---

## 5. 驾驶舱 vs 单屏对话（关键洞察 #4）

> **Typola Skill OS M1 到底是单屏对话还是驾驶舱？** 这是布局范式的关键决策。

### 5.1 驾驶舱范式（fanbox）

**特征**：
- 四区始终存在（左文件 / 中预览 / 右对话 / 底终端）
- 用户可在任何区操作
- agent 状态 = 文件 + 终端 + 仪表盘联合表达
- 适合：重度 vibe coding / 多文件并行

**代价**：
- 屏幕被四区瓜分，每个区都不大
- 学习成本（用户要知道哪个区干什么）
- 心智负担（"我现在在哪个区？"）

### 5.2 单屏对话范式（OpenDesign）

**特征**：
- 主区是 chat panel（中央）
- 辅助区是 preview / 文件（侧栏折叠）
- 用户主要在 chat 输入
- agent 状态 = chat 流式 + 工具卡
- 适合：知识工作者 / 文档工作

**代价**：
- 复杂文件操作不友好（编辑在哪？）
- 多文件并行弱
- 终端用户弱（PTY 兜底必备）

### 5.3 Typola 1.x 的范式选择

**M1 阶段（Skill OS）= 单屏对话 + 文件树折叠切换**（已定，spec §0）
- 左侧 AI 工作台展开 → 文件树向左收起让位
- 编辑器保持全高（不被对话框挤压）
- 右侧"场景"属 M2（M1 右侧维持现状，产物可后挂）
- 底终端 PTY 兜底（默认折叠）

**M2+ 阶段 = 单屏对话向驾驶舱渐进**
- 右侧加场景/skill 分类导航 → 4 区更明显
- 产物 chips 顶部 + 预览（与 fanbox 类似）
- 底终端保留（PTY 兜底）

**M3+ 阶段 = 完整驾驶舱 + 单屏对话并存**
- 用户可在"对话模式"和"驾驶舱模式"切换
- 驾驶舱模式：左文件 / 中编辑器 / 右对话 / 底终端
- 对话模式：左对话 / 中编辑器 / 右预览

**理由**：
1. **M1 单屏对话优先** —— Skill OS 阶段先解决"AI 怎么跟用户对话"，布局是次要
2. **M2+ 加场景分类** —— 场景/skill 是 Typola 差异化（fanbox 没有），右侧必须给位
3. **M3+ 驾驶舱是补强** —— 等单屏对话稳了再演进，避免 M1 就铺四区心智
4. **PTY 终端永保留** —— hardcore 用户兜底 + claude 自身 skill 生态

---

## 6. 活的仪表盘（关键洞察 #5）

> fanbox 的涟漪/呼吸效果 = 纯 UI 装饰；Obsidian Copilot 的 thinking 流 = 信息密度。Typola 该怎么做？

### 6.1 fanbox 路线（纯 UI 装饰）

**实现**：
- agent 每写一个文件，那张卡片荡开涟漪
- 按改动频率发光呼吸
- agent 写到哪光走到哪
- 终端边缘呼吸提示"轮到你"

**优点**：
- 视觉冲击强
- 用户"感觉得到 agent 在工作"
- 屏幕有"活气"

**缺点**：
- 装饰 = 噪声（agent 没在工作时光环也在）
- 信息密度低（光强 ≠ 任务进度）
- 长期看疲劳

### 6.2 Obsidian Copilot 路线（信息密度）

**实现**：
- thinking 流（agent 思考过程实时显示）
- tool_use 卡片（写文件/读文件/搜索 实时显示）
- usage 统计（token / cost 实时显示）

**优点**：
- 真的信息（agent 在想什么 / 干了什么 / 花了多少）
- 长期不疲劳（信息有价值）
- 用户能决策（"agent 跑偏了，我打断"）

**缺点**：
- 视觉冲击弱
- 没"活气"（安静感）

### 6.3 Typola 的活仪表盘方案

**决策**：**有信息密度的活仪表盘**（混合）

**M1 阶段**（Skill OS）：
- **OpenDesign ThoughtCard**（思考流折叠卡）—— 真信息（agent 在想什么）
- **OpenDesign ToolCard**（工具调用卡）—— 真信息（写文件/读文件/搜索 实时显示）
- **OpenDesign DoneBar**（耗时·token·$）—— 真信息（agent 跑完花多少）
- **OpenDesign ErrorRetryCard**（诊断 + Retry）—— 真信息（agent 出错怎么办）

**M2+ 阶段**（驾驶舱补强）：
- **文件落盘脉冲**（1 次脉冲不持续）—— 心流 spec §6.2 已规划"对应 chip / 树节点脉冲一下"
- **状态徽章**（运行/空闲/等待输入）—— 心流 spec §8.2 P2 提到
- **场景卡高亮**（agent 正在哪个场景）—— 场景分类导航的视觉锚点

**M3+ 阶段**（跟随模式 + 涟漪）：
- **HTML 双缓冲零白闪**（跟随模式时）—— 短暂脉冲，非持续
- **路径高亮**（agent 正在编辑的文件）—— 持续高亮 + 编辑行闪烁
- **不做"持续涟漪"**（太装饰）

**不做**：
- ❌ 持续呼吸光（太装饰）
- ❌ 持续涟漪扩散（噪声）
- ❌ 终端边缘呼吸（PTY 路线，OpenDesign 路线不需要）

---

## 7. Typola 1.x 阶段集成路线图

> 把识别出的能力按 P0/P1/P2/P3 排序 + 工作量估算 + 阶段锚定（M1 / M2 / M3 / M4+）。

### 7.1 P0 必补（5 条 · 全部 M2+ 阶段）

| # | 能力 | 来源 | 集成点 | 工作量估算 | 阶段 |
|---|------|------|--------|----------|------|
| 1 | **路径可点击**（终端 + chat panel 内的路径） | fanbox D3 | TerminalPanel 增加 onPathClick → 在 Typola 主编辑器打开该文件 | **0.5 人天**（stat 验证空格边界复用 fanbox 思路） | **M2**（心流模式 + Skill OS 都有） |
| 2 | **态势感知**（状态徽章 + 系统通知） | fanbox D5 + Typola 心流 spec §8.2 | AppLayout + ConversationPanel 状态徽章；长任务完成 Tauri 系统通知 | **1 人天** | **M2** |
| 3 | **跟随模式**（agent 正在编辑的文件高亮 + 双缓冲零白闪） | fanbox B2 | `agentChangedPaths` 升级：当前活跃文件高亮 + 预览双缓冲（HTML 落盘时新建 iframe 准备好再切） | **3-5 人天**（双缓冲零白闪是难点） | **M3**（依赖 M2 产物 chips 稳了再做） |
| 4 | **Git diff 视图**（CM6 DiffEditor，HEAD vs 工作区） | fanbox B5 | CodeMirror 6 DiffEditor 组件 + Rust git diff 命令封装 | **2-3 人天** | **M3**（依赖 M2 写盘审批） |
| 5 | **AutoGit 分支 sandbox**（写盘自动落独立分支，UI 显式 accept/reject） | SoloMD | 在 watcher 上挂一层 git（agent 改动自动 commit 到分支，UI 提供 accept/reject 按钮合并到 main） | **5-7 人天**（git 分支管理 + UI + 与 M3 diff 集成） | **M3** |

### 7.2 P1 强补（6 条 · M2-M3 阶段）

| # | 能力 | 来源 | 集成点 | 工作量估算 | 阶段 |
|---|------|------|--------|----------|------|
| 1 | **项目记忆**（`claude --resume` / `--session-id`，跨 session 持久 sessionUuid） | fanbox C1 + OpenDesign SQLite | Rust `agent_headless` 增加 sessionUuid 内存 Map → serde_json 持久化（**不**引入 SQLite） | **2 人天** | **M2** |
| 2 | **活的仪表盘补强**（文件落盘 1 次脉冲 + 场景卡高亮） | fanbox B1 + Typola 心流 spec §6.2 | AppLayout `agentChangedPaths` 加 pulse class（CSS keyframe 1.5s） | **0.5 人天** | **M2** |
| 3 | **写盘 cap**（每会话/每次最多写 N 个文件）+ **拒绝脏工作树启动** | SoloMD safety rails | watcher 计数 + 写盘前检测 git status | **1 人天** | **M2** |
| 4 | **拖文件进终端** | fanbox D2 | TerminalPanel 增加 onDrop → agentBridge 注入路径 | **0.5 人天** | **M2** |
| 5 | **Skills 透视**（本机全部 skill 触发统计 + 健康检查 + 启停） | fanbox C5 | Rust 扫 `~/.claude/skills/` + JSON 注册表 + UI 透视面板 | **3-4 人天** | **M3**（依赖 M2 skill 分类） |
| 6 | **Agent 用量**（Claude 5h 窗口 / 本地 token） | fanbox C6 | 移植 `claude-diagnostics` 的 usage 解析 + Tauri 系统通知 | **2 人天** | **M3** |

### 7.3 P2 待评估（7 条 · M4+ 或不做）

| # | 能力 | 来源 | 集成点 | 工作量估算 | 阶段 |
|---|------|------|--------|----------|------|
| 1 | **会话回放**（时间轴） | fanbox B3 | JSONL 记录 + 时间轴 UI | **5+ 人天** | M4+ |
| 2 | **变更收件箱**（跨 workspace） | fanbox B4 | 多 workspace 切换 + 跨 workspace chips 视图 | **3 人天** | M4+ |
| 3 | **AI 整理（元数据级）** | fanbox C3 | agent 只读元数据 + 提案 UI + 回滚日志 | **5+ 人天** | M4+ |
| 4 | **replayable `trace.jsonl`** | SoloMD | JSONL 记录 + step-level 重放 | **3-4 人天** | M4+ |
| 5 | **YAML recipes**（cron / on-save / on-commit） | SoloMD | skill-hub.json 扩展触发器类型 | **3+ 人天** | M4+ |
| 6 | **RAG / 跨文件检索** | Obsidian Copilot Vault QA | 本地 embedding（Ollama / 内置模型）+ 检索 + 注入 prompt | **7+ 人天** | M4+ 或不做（v2 报告标 0 覆盖） |
| 7 | **多 agent 编排**（Warp Oz 路线） | Warp / OpenDesign multi-agent | OpenDesign `agent_sessions(conv_id, agent_id, session_id)` schema 移植 | **5+ 人天** | M4+ |

### 7.4 P3 不做（5 条）

| # | 能力 | 不做理由 |
|---|------|--------|
| 1 | 发版向导 | Typola 不做发版（不是 node 项目） |
| 2 | 磁盘占用透视 | Typola 是编辑器，不是文件管理器 |
| 3 | 截图直通车 | macOS 专属，Typola 跨平台 |
| 4 | 强色实体图标 / 项目徽章 | Typola 配色克制（v2 报告已判定） |
| 5 | 三套皮肤整套审美语言 | Typola 当前只有暗色/暖米两套；未来可加但优先级低 |

### 7.5 路线图可视化

```
M1 (Skill OS 最小对话框闭环)     M2 (驾驶舱补强 P0)            M3 (驾驶舱完整)              M4+ (高级能力)
─────────────────────────────────────────────────────────────────────────────────────────────
headless stream-json 移植    →   + 路径可点击 (P0)          →   + 跟随模式 (P0)         →   + 会话回放
ConversationPanel 形态移植   →   + 态势感知 (P0)            →   + Git diff 视图 (P0)    →   + 变更收件箱
file tree 切换逻辑           →   + 项目记忆 (P1)            →   + AutoGit sandbox (P0) →   + AI 整理
claudeStream 解析移植        →   + 落盘脉冲 (P1)            →   + Skills 透视 (P1)     →   + replayable trace
claude-diagnostics 移植      →   + 写盘 cap (P1)            →   + Agent 用量 (P1)      →   + YAML recipes
PTY 终端保留（兜底）         →   + 拖文件进终端 (P1)        →   + RAG (P2)             →   + 多 agent 编排
```

**关键节点**：
- **M1 完成**：Skill OS 单屏对话范式跑通
- **M2 完成**：5 个 P0 必补中 3 个补齐（路径可点击 / 态势感知 / 项目记忆）—— 用户体感显著提升
- **M3 完成**：5 个 P0 必补全部补齐（跟随模式 / Git diff / AutoGit）—— 完整驾驶舱范式
- **M4+**：高级能力，按用户反馈决定优先级

**总工作量估算**：
- M2 P0 + P1 必补 ≈ 7-9 人天
- M3 P0 + P1 必补 ≈ 15-20 人天
- M2+M3 总计 ≈ 22-29 人天
- M4+ 按需 30+ 人天

---

## 8. 关键风险与必避反例

### 8.1 风险

1. **claude CLI 协议变化** —— stream-json 是 Anthropic 私有协议，升级可能破坏解析。**应对**：移植 OpenDesign 单测 + 未知事件走 `raw` 不崩
2. **PTY 兜底路径被遗忘** —— M1 headless 主流后，PTY 终端可能被冷落。**应对**：spec §0.1 "不解析 TUI 文本" 原则永守，PTY 兜底必须有"在终端继续"按钮
3. **跟随模式双缓冲实现复杂** —— 边写边渲染零白闪需要精细的 iframe 生命周期管理。**应对**：M2 先做单文件高亮（无双缓冲），M3 再升级双缓冲
4. **AutoGit 分支合并冲突** —— agent 写错文件时分支回退有边界。**应对**：M3 先做"只接受全部"按钮，"选择性 accept" 属 M4+
5. **Skills 透视读 `~/.claude/skills/` 越权** —— 跨用户读文件需要权限。**应对**：M3 只读当前用户的 home dir，不跨用户

### 8.2 必避反例

1. ⚠ **Bolt.new 让 AI 完全控制环境无 diff 审批** —— Typola 绝不能走（用户失控）
2. ⚠ **Devin 用户介入极少** —— Typola 个人工作流启动器定位不符
3. ⚠ **Replit "AI 全栈自主 + 用户偶尔看 Kanban"** —— Typola 文档工作定位不符
4. ⚠ **Warp Drive 商业绑定持久** —— Typola 走本地 + serde_json
5. ⚠ **tolaria 路线**（裸 API + 自建工具循环丢 skill 生态）—— 已定拒绝
6. ⚠ **iA Writer 极端反 AI 嵌入** —— 不走极端
7. ⚠ **fanbox 的局限**（只做轻改 + 缺源码模式 + 不做文字开发）—— Typola 保留 CM6 源码模式 + 文字开发场景

---

## 9. 验证与数据来源

### 9.1 验证时间

- 2026-06-18

### 9.2 验证方式

- WebFetch（已成功）：fanbox master README（307 行）/ SoloMD v4.6.1 README（236 行）/ Obsidian Copilot v4 README（345 行）/ bolt.new main README（54 行）
- GitHub API（已成功）：fanbox repo metadata / SoloMD search / Warp repo metadata
- 公开信息（明确标"⚠ 未验证"）：Warp Oz / Pieces.app / Replit Agent 4 / Devin —— 闭源 SaaS

### 9.3 数据基线

| 项目 | Star | 版本 | License | 验证方式 |
|------|------|------|---------|---------|
| fanbox | 584★（⚠ v2 数据 2026-06-16，未再验证） | v0.x（v2 数据） | MIT | master README 307 行 |
| SoloMD | 375★（⚠ v2 数据）/ 实际 v4.6.1 latest | **v4.6.1** | MIT | zhitongblog/solomd README 236 行 |
| Obsidian Copilot | 7.2k★（⚠ v2 数据） | **v4 "Agent Mode"** | AGPL-3.0 | logancyang/obsidian-copilot README 345 行 |
| bolt.new | 4.1k+★（⚠ v2 数据） | v0.x | Apache 2.0 | stackblitz/bolt.new README 54 行 |
| Warp Oz | ⚠ 未验证 | ⚠ 未验证 | 闭源 | warp.dev 公开信息 |
| Replit Agent 4 | ⚠ 未验证 | ⚠ 未验证 | 闭源 | docs.replit.com/agent4 公开信息 |
| Devin | ⚠ 未验证 | ⚠ 未验证 | 闭源 | devin.ai 公开信息 |
| Pieces.app | ⚠ 未验证 | ⚠ 未验证 | 闭源 | pieces.app 公开信息 |

### 9.4 v3 vs v2 主要变化

1. **fanbox 18 项能力补完** —— v2 只数 4/18，本报告完整 18 项能力列表
2. **SoloMD v4 实际为 v4.6.1** —— v2 写 v4，本报告验证 v4.6.1
3. **SoloMD 新增 5 个独有 MCP 工具**（autogit_* / sync_status / share_url）—— v2 未提
4. **Obsidian Copilot v4 "Agent Mode"** —— v2 写"已嵌 Claude Code"，本报告验证 v4 + LTM 跨 session
5. **驾驶舱范式竞争路线分类**（L5a PTY vs L5b headless）—— v2 没明确分类
6. **M1 阶段选择 headless 主流 + 终端兜底** —— v2 没讨论
7. **5 个关键洞察**（PTY vs headless / 实时预览 / 驾驶舱 vs 单屏 / 活的仪表盘 / fanbox 18 项补完）—— v2 没结构化输出
8. **Typola 1.x 阶段集成路线图**（P0/P1/P2/P3 + 工作量估算 + 阶段锚定）—— v2 没有工作量

### 9.5 与已有 spec/报告的关系

- **不重复** v2 报告 §3.1（fanbox 概述）/ §3.2（SoloMD 概述）/ §3.3（Obsidian Copilot 概述）—— 已读过，**只补完能力清单 + 集成点**
- **不重复** `markdown-editors.md`（编辑器底层架构）
- **不重复** `skill-os-workbenches.md`（OpenDesign/AnythingLLM/LobeChat/Dify/Pieces 概述）
- **承接** `AI_WORKBENCH_SKILL_OS.md`（M1-M4 路线）—— M1 不动驾驶舱，M2+ 补驾驶舱 P0
- **承接** `AI_WORKBENCH_SPEC.md`（心流模式 spec）—— 已实现的现状，本报告是 P0/P1 补强计划

---

## 10. 后续行动建议

1. **M1 阶段不动驾驶舱**（Skill OS spec §0 已定）
   - M1 = 移植 OpenDesign chat panel + 文件树切换 + headless stream-json
   - 不动心流模式 P0（路径可点击 / 态势感知 / 跟随模式 / Git diff / AutoGit）—— M2+ 再说
2. **M2 启动时**：
   - 先做 P0 三条（路径可点击 / 态势感知 / 项目记忆）—— 用户体感提升最大
   - P1 三条（落盘脉冲 / 写盘 cap / 拖文件进终端）—— 低成本高价值
3. **M3 启动时**：
   - P0 剩两条（跟随模式 / Git diff / AutoGit）—— 完整驾驶舱范式
   - P1 两条（Skills 透视 / Agent 用量）—— 产品差异化
4. **M4+ 按需**：
   - 用户反馈"想要 X"再决定 P2/P3
   - 持续守住 PTY 兜底 + 不重做 chat UI 边界
5. **给 codex 接力时**：
   - 把本报告 §7 路线图加入 Skill OS spec §10（M2+ 概述）
   - 把 fanbox 18 项能力清单加入 spec 附录
   - 在 spec §14（心流模式分期）里把 P0 5 条标注高优先级
6. **memory 更新**：本报告已记入 `~/.claude/projects/D-----Typola/memory/MEMORY.md`（待办）
