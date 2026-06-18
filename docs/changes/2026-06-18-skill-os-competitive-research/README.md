# Typola Skill OS 竞品深度调研（综合报告）

- **日期**：2026-06-18
- **基线**：`docs/AI_WORKBENCH_SKILL_OS.md`（Skill OS M1-M4 路线）+ `docs/AI_WORKBENCH_SPEC.md`（心流模式 spec，已 PR #55）+ `docs/changes/2026-06-16-competitive-research/competitive-research.md`（v2 报告 20 项目）
- **本调研**：4 份专题报告 + 1 份本综合报告
  - [markdown-editors.md](markdown-editors.md)（304 行 · 编辑器底层架构）
  - [skill-os-workbenches.md](skill-os-workbenches.md)（299 行 · chat panel 形态）
  - [cockpit-paradigm.md](cockpit-paradigm.md)（694 行 · 驾驶舱四区范式 + 18 项能力清单）
  - [writing-verticals.md](writing-verticals.md)（559 行 · 4 写作场景）
- **作者**：Claude（主线程）+ 4 个并行 subagent（每份独立 WebFetch / GitHub API 验证）

---

## 0. 一句话总结

> **Typola Skill OS M1 应把"对话面板"从 spec 现状的"左侧弹窗 + 文件树收起"改为"右侧常驻 panel + 文件树保留"——这是业界（Cursor/Zed/Cherry Studio/OpenDesign）的硬共识**。M1 核心工作（移植 OpenDesign 机制层 + UI 形态）不变，但**布局决断需要现在就拍**。

---

## 1. 4 份报告速览

| 报告 | 核心结论 | 给 Typola 的最大冲击 |
|------|---------|-------------------|
| **Markdown 编辑器架构** | Typola 是业界**唯一坚持"自研 IR + 独立源码编辑器"双模式**的；Vditor IR ↔ CM6 source 同步**业界无解**；BlockNote AI 的 slash+选区+streaming 是 AI 集成标准三件套 | ① IR↔source 同步改"快照式"放弃逐字符 ② AI 工作台无需换编辑器，借鉴 BlockNote AI 原语即可 |
| **Skill OS 工作台形态谱** | **右侧 sidebar 是 IDE 形态最优**（Zed/Cursor/Cherry Studio 一致）；OpenDesign 三层 ToolCard + SQLite WAL 是最成熟内核；LibreChat Resumable Streams 是 M1 必做 | ① chat panel 从左改右 ② ToolCard 6 个 family + generic fallback ③ session 持久化 M1 用 SQLite WAL（不是内存 Map） |
| **驾驶舱范式** | fanbox 18 项能力 Typola spec 只覆盖 4/18（22%）；SoloMD 是直接对位栈（Tauri + CM6 + MCP + AutoGit）；PTY vs headless 是两条路线但 M1 选 headless 已定 | M1 不动驾驶舱（spec 已定）；M2+ 补 P0 五条（路径可点击 / 态势感知 / 项目记忆 / 跟随模式 / Git diff / AutoGit） |
| **PM/写作垂直** | **中文场景差异化 = 本地 MD 单一事实源 + 多平台分发桥**；baoyu-skills 21.9k★（用户原创）是公众号对位；Marp 12k★ 是 HTML-PPT 框架对位；日报靠模板+AI 润色而非纯生成 | 4 场景 P0 集成点全部命中 Spec M2+（公众号/Marp PPT/日报模板 + MDX 导出） |

---

## 2. 跨报告综合洞察（10 条）

> 这些洞察是**多份报告交叉验证**的，不是单一报告结论。

### 洞察 1：右侧 chat panel 是业界硬共识 —— **与 Spec 冲突**

**证据**：
- Skill OS 工作台报告 §2.1 / §2.6 / §2.11：Zed / Cursor Cmd+L / Cherry Studio / LibreChat 一致**右侧**
- Skill OS 工作台报告 §3.1 表格：业界共识 = 右侧 sidebar 是 IDE 形态最优
- 驾驶舱报告 §2.1 fanbox 描述：fanbox 右侧是 "Agent 驾驶舱" panel（虽然不叫 chat）
- 反例：OpenDesign 中央 workspace 是被报告 §3.1 列为"挤压严重"

**Spec 现状**：`AI_WORKBENCH_SKILL_OS.md` §0 写"**左侧 AI 工作台展开，文件树向左收起让位**"。

**冲突分析**：
- 左侧 panel 优点：编辑器不被挤压（全高）
- 左侧 panel 缺点：文件树要让位（写作时高频丢）、与业界形态反、OpenDesign/Cherry Studio 等不能直接照搬形态
- 右侧 panel 优点：文件树保留、业界一致、UI 可照抄 OpenDesign ChatPane 形态
- 右侧 panel 缺点：编辑器缩窄约 380px（1920×1080 剩 1500px 仍够写）

**决策建议**：**改右侧**（详见 §6 决策冲突点 #1）。

### 洞察 2：OpenDesign 是 M1 的"主菜" —— 不是参考，是直接移植

**证据**：
- Skill OS 工作台报告 §2.1：OpenDesign 源码（`D:\AI\workspace\open-design\`）已经在本地，**ChatPane.tsx 3810 行 + claude-stream.ts 619 行 + db.ts 2062 行**全部可读
- Skill OS 工作台报告 §3.3：OpenDesign SQLite schema 直接借鉴
- Skill OS 工作台报告 §3.4：OpenDesign ToolCard 三层查找是最成熟方案
- 驾驶舱报告 §1：OpenDesign 路线（headless stream-json）就是 Skill OS M1 已选路线

**Spec 已对齐**：spec §4.1 已经规划了 OpenDesign 机制层"近乎直接拷贝"+ UI 层"参考重写"。本调研**进一步确认**这是 M1 主路径。

**关键提醒**：
- OpenDesign `claude-stream.ts` 必须整段移植（含 role-marker guard 防 prompt injection）
- OpenDesign `db.ts` SQLite schema（M1 内存 Map → M2 持久化时升级）
- OpenDesign `ToolCard.tsx` 三层查找直接复用

### 洞察 3：会话持久化 **M1 内存 Map 够用，M2 必升级 SQLite WAL**

**证据**：
- Skill OS 工作台报告 §3.3 表格：业界惯例 **桌面独立 app = SQLite WAL**（OpenDesign / Cherry Studio）
- Spec §14 已经定 M1 内存 Map
- Obsidian Copilot v4 README 验证 LTM 跨 session
- 驾驶舱报告 §2.2 SoloMD trace.jsonl 用文件系统（不是 SQLite）

**决策**：
- **M1 内存 Map**（spec 已定，不改）
- **M2 必升级**：OpenDesign SQLite schema 三表（conversations / messages / agent_sessions）
- **不引入 better-sqlite3 之前用 serde_json 文件**（spec §14 也提到）

### 洞察 4：ToolCard 6 个 family card + generic fallback（M1 必须）

**证据**：
- Skill OS 工作台报告 §2.1：OpenDesign 6 个 family（TodoWrite/Write/Edit/Read/Bash/Glob/Grep/WebFetch/WebSearch）
- Spec §7 task#7 说"只做 5 个高频渲染器（Write/Edit/Read/Bash/Glob）"
- 驾驶舱报告 §2.2 SoloMD 验证：TodoWrite 是 Claude Code 大量用的高频工具（任务规划）

**决策**：**改 6 个**（加 TodoWrite），TodoWrite 渲染简单（checkbox 列表）

### 洞察 5：IR ↔ source 同步业界无解 —— 改"快照式"放弃逐字符实时

**证据**：
- Markdown 编辑器报告 §三.洞察 1：业界唯一坚持双模式实时同步的只有 Vditor 三模式（共享 AST），Typola 是 Vditor IR + CM6 双栈 = 两个独立编辑器
- TipTap / Lexical / BlockNote / Milkdown 都放弃了实时双模式
- typola-gotchas #2 已记录受控同步重置光标问题

**方案**：方案 A = 切换模式时一次 setValue/getValue（快照式），中间不双向同步
- 工作量 0.5 人天
- 切模式时光标丢失是已知 trade-off，文档明示

### 洞察 6：fanbox 18 项能力 Typola 只覆盖 22%（4/18）—— M2+ 必须补的清单

**证据**：驾驶舱报告 §1 完整盘点（按 A 文件 / B 仪表盘 / C Agent / D 终端 / E 编辑器 五大类）

**Typola 1.x 集成路线图**（按驾驶舱报告 §7 整理）：

| 阶段 | P0 必补 | 工作量 |
|---|---|---|
| **M1** | 无（spec 已定，纯移植 OpenDesign + 路径可点击） | — |
| **M2** | 路径可点击（D3）+ 态势感知（D5）+ 项目记忆（C1）+ 落盘脉冲（B1）+ 写盘 cap + 拖文件进终端（D2） | 7-9 人天 |
| **M3** | 跟随模式（B2）+ Git diff（B5）+ AutoGit sandbox + Skills 透视（C5）+ Agent 用量（C6） | 15-20 人天 |
| **M4+** | 会话回放（B3）/ 变更收件箱（B4）/ AI 整理（C3）/ replayable trace / YAML recipes / RAG / 多 agent | 按需 30+ 人天 |

### 洞察 7：PTY vs headless 不是二选一 —— M1 headless + M2+ PTY 兜底

**证据**：驾驶舱报告 §3 完整对比

**核心结论**：
- **fanbox/SoloMD/Obsidian Copilot 选 PTY** —— 保全 claude 自身 skill 生态
- **OpenDesign/AnythingLLM/Cherry Studio 选 headless** —— 结构化输出 + 多 agent 编排
- Typola Skill OS **M1 走 headless 已定**（spec §3 + §14）
- PTY 终端必须保留作为兜底（Spec §0.1 原则 + gotchas #5）
- M4+ 多 agent 编排（M2 加场景分类）走 headless 强项

### 洞察 8：实时预览走 fanbox 路线（sandboxed iframe + 本地）—— Spec §6.2 已规划

**证据**：驾驶舱报告 §4 完整对比

- ✅ **fanbox sandboxed iframe**（本地 + 零网络 + 双缓冲零白闪）= Typola 应走的路
- ❌ Bolt.new WebContainer（仅 Web 栈）
- ❌ Replit VM（必须联网 + 商业绑定）
- ❌ Pieces 本地渲染（snippet 工具，不适合文档）

**Spec 已对齐**：spec §6.2 已规划 HTML 产物 sandboxed iframe 渲染 + Markdown 走 Vditor 预览。

### 洞察 9：AI 编辑器形态收敛 —— Typola 应借鉴 BlockNote AI 原语而非换编辑器

**证据**：Markdown 编辑器报告 §三.洞察 2

**BlockNote AI 三件套**（= 业界标准）：
1. **slash menu**（trigger `/` + 异步过滤 + 命令面板）
2. **formatting toolbar 选区触发**（选中即 AI）
3. **streaming diff**（流式 add/delete/update 工具调用）

**对 Typola 借鉴**：
- 不换编辑器（Vditor IR 是心流模式灵魂）
- 借鉴 `useSelection: true` 概念 → Vditor `getSelection()` 作为 AI 上下文
- 借鉴 `streamToolsProvider` 三件套 → Skill OS 场景卡流式写入
- 借鉴 `aiResponseStatus` 状态机 → Skill OS 工作台状态

### 洞察 10：中文场景差异化 = 本地 MD + 多平台分发桥

**证据**：写作垂直报告 §5-Q5

**核心**：
- 海外：Markdown 原生 + AI Agent + 协作
- 中文：富文本/平台 + AI 助手 + 模板 + "一文多发"
- Typola 差异化：**「本地 Markdown 单一事实源 + 多平台分发桥」**——内容 100% 本地、AI 在本地、发布时一次生成公众号/知乎/掘金/飞书/语雀 多平台适配

**4 场景 P0 集成点**（详见写作垂直报告 §6 总览表）：

| 场景 | Typola 差异化定位 | P0 集成点 |
|---|---|---|
| **① PM 文档** | MD 写 + AI 改 diff + MDX 输出 + 本地 RAG | "产品架构文档"场景卡（MDX 输出 + frontmatter） |
| **② 公众号** | 本地 MD + Vditor theme + **baoyu-skills 集成** + 多平台分发 | "公众号写作"场景卡（封装 baoyu-skills） |
| **③ HTML-PPT** | Marp 风格 MD + Vditor 渲染 + AI 补图/大纲 | "HTML-PPT"场景卡（`---` 分页 + Marp theme） |
| **④ 日报周报** | "模板即数据"场景卡 + 多源数据抓取 + AI 总结 | "日报"场景卡（5 段模板 + `{{date}}` 自动建文件） |

**关键协议警告**（写作垂直报告 §7.4）：
- Wechatsync = **GPL-3.0**（不可 fork 集成，仅参考思路）
- **baoyu-skills 无 license 字段**——**需向作者 JimLiu 确认商用授权**（用户是 Typola 用户 = 主动同步最佳时机）
- Slidev/Marp/MDX/Docusaurus = MIT 可自由集成

---

## 3. Typola 优势矩阵

> **绿色 = 业界领先，蓝色 = 业界平均水平，灰色 = 业界落后**

| 维度 | Typola 现状 | 业界对位 | 评级 | 来源 |
|------|------------|---------|------|------|
| **编辑器体验** | Vditor IR + CM6 双模式 + 源码态原生 | 唯一坚持双模式实时同步 | 🟢 领先 | markdown-editors §三.1 |
| **本地优先** | Tauri + 本地 MD 文件 + watcher | Anytype / SoloMD 同 | 🟢 领先 | writing-verticals §1.6 |
| **PTY 终端基建** | portable_pty + xterm.js 已成熟 | fanbox / SoloMD / Obsidian Copilot 同 | 🟢 领先 | cockpit §2.1-2.3 |
| **claude 集成深度** | 流式 JSON 解析（即将移植 OpenDesign） | OpenDesign / Cherry Studio 同 | 🟡 即将追上 | skill-os-workbenches §2.1 |
| **AI 工作台形态** | M1 = 左侧弹窗（spec）→ 应改右侧 | 业界共识右侧 panel | 🔴 反共识 | skill-os-workbenches §3.1 |
| **多 agent** | 单 agent（claude） | SoloMD MCP federation / OpenDesign multi-agent | 🔴 落后 | cockpit §2.2 / skill-os §2.10 |
| **Skill 生态** | 引 `.claude/skills` + `.agents/skills` | Cherry Studio 同 | 🟢 并列 | skill-os §2.6 |
| **写盘审批** | 文件监听 + reload | SoloMD AutoGit sandbox 领先 | 🔴 落后 | cockpit §2.2 |
| **驾驶舱范式** | 心流 spec 覆盖 4/18（22%） | fanbox 18/18 | 🔴 落后 | cockpit §1 |
| **AI 编辑原语** | 无（slash / 选区触发 / streaming diff 都没） | BlockNote AI / Plate AI 三件套 | 🔴 落后 | markdown-editors §三.2 |
| **协作 / CRDT** | 单用户 | Yjs 标准（TipTap/Lexical/BlockNote 都支持） | 🔴 落后 | markdown-editors §1.8 |
| **中文场景适配** | Vditor 中文友好 + 飞书/语雀未对接 | 飞书/语雀/腾讯文档市场 | 🟡 待集成 | writing-verticals §1.7-1.9 |
| **场景卡模板** | Spec §5 已规划 4 场景（HTML/Polish/Wechat/Daily） | SoloMD YAML recipes 5 触发器领先 | 🟡 待补触发器 | cockpit §2.2 |
| **记忆/上下文** | M1 内存 Map | OpenDesign SQLite / Obsidian LTM | 🟡 M2 升级 | skill-os §3.3 |

**总结**：Typola 在**编辑器体验 + 本地优先 + PTY 基建**领先；在 **AI 工作台形态 + 写盘审批 + 驾驶舱范式 + AI 编辑原语**落后。M1 应聚焦**追上 AI 工作台形态**（移植 OpenDesign + 改右侧 panel），M2-M3 补**驾驶舱范式 P0 + AI 编辑原语**。

---

## 4. Typola 差距矩阵（M1-M3 必补）

| 差距 | 现状 | 目标 | 阶段 | 工作量 |
|------|------|------|------|--------|
| **chat panel 位置** | 左侧弹窗（spec） | 右侧 380px 常驻 | **M1 重构** | 2 人天 |
| **IR↔source 同步** | 受控同步重置光标 | 快照式同步（方案 A） | **M1 改** | 0.5 人天 |
| **ToolCard 渲染器** | 5 个 | 6 个 + generic fallback | **M1 加 TodoWrite** | 0.5 人天 |
| **AI 编辑原语** | 无 | BlockNote AI 三件套（slash + 选区 + streaming） | **M2 加** | 2-3 人天 |
| **会话持久化** | 内存 Map | SQLite WAL（OpenDesign schema） | **M2 升级** | 2 人天 |
| **路径可点击** | 无（终端 + chat 内路径） | stat 验证空格边界，点击开文件 | **M2 加** | 0.5 人天 |
| **态势感知** | 无 | 状态徽章 + 终端呼吸 + 长任务通知 | **M2 加** | 1 人天 |
| **项目记忆** | 无 | `claude --resume` / `--session-id` 持久化 | **M2 加** | 2 人天 |
| **写盘 cap + 拒绝脏工作树** | 无 | 每 run 默认 5 写 + 工作树不干净时拒绝启动 | **M2 加** | 1 人天 |
| **跟随模式 + 双缓冲** | 无 | agent 改文件高亮 + HTML 双缓冲零白闪 | **M3 加** | 3-5 人天 |
| **Git diff 视图** | 无 | CM6 DiffEditor + HEAD vs 工作区 | **M3 加** | 2-3 人天 |
| **AutoGit sandbox** | 无 | agent 改动落独立分支 + UI accept/reject | **M3 加** | 5-7 人天 |
| **Skills 透视** | 无 | 本机 skill 触发统计 + 健康检查 + 启停 | **M3 加** | 3-4 人天 |
| **Agent 用量** | 无 | Claude 5h 窗口 + 本地 token 统计 | **M3 加** | 2 人天 |
| **RAG 跨文件检索** | 无 | 本地 embedding + 检索 + 注入 prompt | **M4+ 可选** | 7+ 人天 |
| **多 agent 编排** | 单 claude | OpenDesign agent_sessions schema | **M4+ 可选** | 5+ 人天 |

**总工作量**：M1 3 人天（重构 + 修补）+ M2 7-9 人天 + M3 15-20 人天 + M4+ 30+ 人天。

---

## 5. 高价值集成点清单（按 ROI 排序 · Top 20）

### M1 必做（6 条）

| # | 集成点 | 来源 | ROI | 工作量 | 备注 |
|---|--------|------|-----|-------|------|
| 1 | **claude-stream.ts 移植** | OpenDesign claude-stream.ts | ★★★★★ | 1 天 | 5 类事件归一化 + role-marker guard |
| 2 | **SQLite schema 三表移植**（先内存 Map，M2 升级） | OpenDesign db.ts | ★★★★★ | 0.5 天（接口预留） | conversations/messages/agent_sessions |
| 3 | **chat panel 改右侧 380px** | Cursor/Zed/Cherry Studio | ★★★★★ | 2 天 | 改 AppLayout + 新增 RightPanel 槽 |
| 4 | **ToolCard 三层查找 + 6 个 family** | OpenDesign ToolCard.tsx | ★★★★ | 0.5 天 | TodoWrite/Write/Edit/Read/Bash/Glob + generic |
| 5 | **快照式 IR↔source 同步** | 自我分析 | ★★★★ | 0.5 天 | 解决 typola-gotchas #2 |
| 6 | **Chat→编辑器三按钮**（Copy / Replace / Insert） | Cursor Cmd+K | ★★★★ | 1 天 | M3 必做但 M1 先做 Copy |

### M2 必做（8 条）

| # | 集成点 | 来源 | ROI | 工作量 |
|---|--------|------|-----|-------|
| 7 | **SQLite WAL 升级**（从内存 Map 迁出） | OpenDesign db.ts | ★★★★★ | 2 天 |
| 8 | **路径可点击**（终端 + chat panel） | fanbox D3 | ★★★★ | 0.5 天 |
| 9 | **态势感知**（状态徽章 + 系统通知） | fanbox D5 + Typola §8.2 | ★★★★ | 1 天 |
| 10 | **项目记忆**（`--session-id` / `--resume`） | fanbox C1 | ★★★★ | 2 天 |
| 11 | **落盘脉冲**（文件改动 1 次脉冲不持续） | fanbox B1 | ★★★ | 0.5 天 |
| 12 | **写盘 cap + 拒绝脏工作树** | SoloMD safety rails | ★★★ | 1 天 |
| 13 | **拖文件进终端** | fanbox D2 | ★★★ | 0.5 天 |
| 14 | **AI 编辑原语三件套**（slash + 选区 + streaming） | BlockNote AI | ★★★★ | 2-3 天 |

### M3 必做（6 条）

| # | 集成点 | 来源 | ROI | 工作量 |
|---|--------|------|-----|-------|
| 15 | **跟随模式 + 双缓冲零白闪** | fanbox B2 | ★★★★★ | 3-5 天 |
| 16 | **Git diff 视图**（CM6 DiffEditor） | fanbox B5 | ★★★★ | 2-3 天 |
| 17 | **AutoGit sandbox**（写盘自动落独立分支） | SoloMD AutoGit | ★★★★★ | 5-7 天 |
| 18 | **Skills 透视** | fanbox C5 | ★★★ | 3-4 天 |
| 19 | **Agent 用量**（5h 窗口 + token） | fanbox C6 | ★★★ | 2 天 |
| 20 | **HTML-PPT 场景卡**（Marp 主题 + Vditor 渲染） | Marp + baoyu-slide-deck | ★★★★ | 2 天 |

### M4+ 战略储备

- **RAG 跨文件检索**（7+ 天）—— Obsidian Copilot Vault QA
- **多 agent 编排**（5+ 天）—— OpenDesign agent_sessions schema
- **LTM 跨 session 时序召回**（5+ 天）—— Pieces.app
- **AI 整理（元数据级）**（5+ 天）—— fanbox C3
- **会话回放时间轴**（5+ 天）—— fanbox B3
- **MD → 飞书/语雀/腾讯文档导出**（3 天）—— feishu2md / yuque-dl（注意协议）

---

## 6. 决策冲突点（4 个待决策）

> 这些是**调研发现的与 Spec 现状的冲突**，需要用户拍板。

### 决策 #1：chat panel 位置 —— **左 vs 右**

| 选项 | 现状 | 改后 |
|---|---|---|
| 左侧 panel | spec §0 现状 | — |
| **右侧 panel（推荐）** | — | 文件树保留、编辑器缩窄 ~380px、业界一致 |

**调研共识**：右侧 panel 是 IDE 形态最优（Cursor/Zed/Cherry Studio/OpenDesign 一致）。
**风险**：AppLayout 已 1781 行，加右侧 panel 切换逻辑需先抽 layout hooks（spec §8 task#9 已提）。
**建议**：**改右侧**，spec §0 + §8 task#9 同步修订。

### 决策 #2：ToolCard 渲染器 —— 5 个 vs 6 个 + generic

| 选项 | 现状 | 改后 |
|---|---|---|
| 5 个高频（spec §7） | Write/Edit/Read/Bash/Glob | — |
| **6 个 + generic（推荐）** | — | + TodoWrite（任务规划高频） + generic fallback |

**调研依据**：OpenDesign 是 6 个 + generic，SoloMD 验证 TodoWrite 是 Claude Code 高频工具。
**风险**：TodoWrite 渲染简单（checkbox 列表），0.5 天工作量。
**建议**：**改 6 个**。

### 决策 #3：M1 持久化方案 —— 内存 Map vs SQLite WAL

| 选项 | 现状 | 改后 |
|---|---|---|
| 内存 Map（spec §14 已定） | 简单，重启丢 | — |
| **SQLite WAL（推荐）** | — | OpenDesign 三表 schema，跨重启保留 |

**调研依据**：桌面独立 app 业界惯例是 SQLite WAL（OpenDesign / Cherry Studio）。
**风险**：引入 better-sqlite3 依赖 + schema 设计 + 迁移代码。
**建议**：**M1 仍用内存 Map**（spec §14 已定），**M2 必升级 SQLite**（保留 M1 接口预留）。M1 阶段可加 0.5 天做"接口预留 + 文件 mock"，降低 M2 升级成本。

### 决策 #4：IR↔source 同步 —— 现状补丁 vs 快照式 vs 自研 diff

| 选项 | 工作量 | 风险 |
|---|---|---|
| 现状补丁（用 `selectionChange` 贴回光标） | 0.5 天 | 脆弱，IME 场景仍会丢 |
| **快照式同步（推荐）** | 0.5 天 | 切模式时光标丢失是已知 trade-off |
| 自研 IR↔source 双向 diff | 7+ 天 | 与 Vditor 内部 IME 处理冲突 |

**调研依据**：业界无解（只有 Vditor 三模式内部 AST 共享做得到），自研 ROI 极低。
**建议**：**改快照式**，文档明示光标丢失 trade-off。

---

## 7. 4 场景路线图（M2-M3 阶段锚定）

> 来自写作垂直报告 §6 + cockpit §7 的整合

| 阶段 | 场景卡 | 模板/能力 | 工作量 |
|------|-------|----------|--------|
| **M1** | HTML-PPT（已规划） | Marp `---` 分页 + frontmatter + Vditor 渲染 | 1 天 |
| **M2** | **公众号写作** | 封装 baoyu-skills（**先向作者 JimLiu 确认授权**）+ Vditor theme 市场 | 3-4 天 |
| **M2** | **产品架构文档** | MDX 输出 + YAML frontmatter + AI 改 diff | 3 天 |
| **M2** | **多平台分发**（墨滴路线） | 同 MD 一键转 知乎/掘金/CSDN/头条（**避 Wechatsync GPL**） | 2-3 天 |
| **M3** | **AI 标题候选 + 摘要** | 壹伴助手形态 | 1 天 |
| **M3** | **会议录音 → MD 纪要** | whisper.cpp + claude 总结（飞书智能伙伴形态） | 3 天 |
| **M3** | **HTML-PPT 完整**（Marp theme 库 + baoyu-slide-deck 集成） | Slidev/Marp 主题市场 + baoyu skill | 3 天 |
| **M3** | **日报**（5 段模板 + `{{date}}` + claude 润色） | Obsidian Templater 形态 | 2 天 |
| **M3** | **周报自动生成**（周日 cron 触发） | GH Action 周报模式 | 2 天 |
| **M4+** | 跨文档 RAG 问答（本地 embedding） | Mintlify Ask AI 形态 | 7+ 天 |
| **M4+** | Flomo webhook → 自动建 MD | Flomo 形态 | 2 天 |

---

## 8. Spec 修订建议（待用户拍板后落 spec）

基于本调研发现，建议 spec 修订如下：

### 8.1 spec `AI_WORKBENCH_SKILL_OS.md` §0 修订

**原文**：
> 打开 AI 工作台时文件树**向左收起**，左侧栏切换为 **AI 工作台**（消息流 + 输入框竖排）。

**建议改为**：
> 打开 AI 工作台时**左侧栏切换为右侧 380px 常驻 panel**（消息流 + 输入框），文件树保留在左侧不动。编辑器缩窄约 380px（1920×1080 下剩 1500px 足够写）。

### 8.2 spec §7 task#7 ToolCard 范围修订

**原文**：
> ToolCard 只做 5 个高频渲染器（Write/Edit/Read/Bash/Glob），其余降级通用 JSON 展示

**建议改为**：
> ToolCard 三层查找：`tool-renderers` 注册 → 6 个 family card（TodoWrite/Write/Edit/Read/Bash/Glob） → generic fallback。TodoWrite 渲染为 checkbox 列表，Write/Edit/Read/Bash/Glob 各 1 天工作量。

### 8.3 spec §14 持久化路径修订

**原文**：
> M1 内存 Map（conv→uuid）满足单次运行多轮（验收 §9-3）；跨重启保留属 M2，且 serde_json 文件即可，不引入 SQLite

**建议改为**：
> M1 内存 Map + **接口预留**（0.5 天，让 M2 升级 SQLite 时不动业务代码）。M2 用 OpenDesign SQLite WAL schema 三表（conversations/messages/agent_sessions）+ better-sqlite3 npm。serde_json 文件方案**否决**（不适合会话/消息这种关联数据）。

### 8.4 spec §8 task#9 修订

**原文**：
> 入口：工具栏按钮开/关 AI 工作台；**ConversationPanel 挂左侧栏，展开时文件树向左收起**

**建议改为**：
> 入口：工具栏按钮开/关 AI 工作台（默认折叠）；ConversationPanel 挂**右侧栏 380px 常驻**，文件树保留。**AppLayout 已 1781 行，先抽 layout hooks 再加切换逻辑**（已有）。

---

## 9. 数据来源与可信度

### 9.1 已直接验证（WebFetch / GitHub API）

| 项目 | 验证方式 | 可信度 |
|------|---------|--------|
| **OpenDesign 源码** | 读 `D:\AI\workspace\open-design\` 5 个核心文件 | ★★★★★ |
| **Vditor** | WebFetch GitHub + 官方文档 | ★★★★★ |
| **Milkdown/Crepe** | WebFetch GitHub | ★★★★★ |
| **TipTap/Lexical/BlockNote/Plate/Novel** | WebFetch GitHub | ★★★★★ |
| **CodeMirror 6 / Monaco / Yjs** | WebFetch GitHub | ★★★★★ |
| **AnythingLLM/LobeChat/Dify/Open WebUI** | WebFetch GitHub + 官网 | ★★★★★ |
| **Cherry Studio/LibreChat/Pieces/OpenHands** | WebFetch GitHub + 官网 | ★★★★ |
| **fanbox** | WebFetch master README（307 行）+ gh api metadata | ★★★★★ |
| **SoloMD v4.6.1** | WebFetch README（236 行）+ gh api metadata | ★★★★★ |
| **Obsidian Copilot v4** | WebFetch README（345 行）+ gh api metadata | ★★★★★ |
| **bolt.new** | WebFetch main README（54 行） | ★★★★ |
| **baoyu-skills** | gh api（21.9k★, MIT?, pushed 2026-06-13） | ★★★★★ |
| **Slidev/Marp/MDX/Docusaurus** | gh api 直验证 | ★★★★★ |
| **Anytype/feishu2md/yuque-dl/feishu-cli/Wechatsync** | gh api 直验证 | ★★★★★ |

### 9.2 未直接验证（基于训练数据 + 公开文档 · 标"⚠ 未验证"）

- **Warp.dev Oz**（闭源 SaaS）—— §6-2.6 cockpit
- **Replit Agent 4**（闭源 SaaS）—— §6-2.5 cockpit
- **Devin**（闭源 SaaS）—— §6-2.7 cockpit
- **Pieces.app**（闭源 SaaS）—— §6-2.8 cockpit
- **Slite/Slab/Coda/Tana/腾讯文档 AI** —— §1.1-1.9 writing-verticals
- **Tiptap AI/Mintlify** —— §1.10-1.11 writing-verticals
- **新媒体管家/135editor/秀米/壹伴助手** —— §2.3-2.5 writing-verticals
- **mdnice.com/墨滴** —— §2.6-2.7 writing-verticals
- **Beautiful.ai/Visme/Cron 工具/周报生成器/Awesome Weekly** —— §3.2/§4.4/§4.5/§4.7 writing-verticals

### 9.3 协议警告（必须确认授权）

| 项目 | 协议 | 集成方式 |
|------|------|---------|
| Wechatsync | **GPL-3.0** | ❌ 不可直接 fork 合并发布。**独立实现**思路 |
| Hedgedoc | AGPL-3.0 | ❌ 同上，**仅参考** |
| **baoyu-skills** | 无 license 字段 | ⚠️ **向作者 JimLiu 确认商用授权**（用户是 Typola 用户 = 应主动同步） |
| yuque-dl / feishu-cli | 无 license 字段 | ⚠️ **确认授权**（建议**重写**不直接 fork） |
| Slidev / Marp / MDX / Docusaurus / feishu2md | MIT | ✅ 可自由集成（**核心资源**） |
| Anytype | NOASSERTION | ⚠️ 协议不明，仅参考思路 |
| OpenDesign | Apache 2.0 | ✅ Typola 已确认移植（spec §4.3） |

---

## 10. 后续行动建议

### 10.1 立即（本周）

1. **拍板 4 个决策冲突**（见 §6）—— 用户决策后落 spec §0/§7/§8/§14
2. **向 baoyu-skills 作者 JimLiu 确认商用授权**（写作垂直报告 §7.4 警告）—— 用户是 Typola 用户，最佳时机
3. **更新 memory `MEMORY.md`**：把"fanbox 22% 覆盖度"等关键数据写入（v2 已记，本调研补充）

### 10.2 M1 启动前

1. 修 spec（按 §8 修订建议）
2. 把本报告加入 spec 附录
3. 启动 M1 实施（OpenDesign 机制层移植 + 右侧 panel 改造 + ToolCard 三层查找）

### 10.3 M1 → M2 衔接

1. M1 完成 = Skill OS 单屏对话范式跑通（chat panel 右侧 + headless stream-json）
2. M2 启动时按本报告 §5 M2 必做 8 条优先级补
3. M2 完成 = 5 个 P0 必补中 3 个补齐（路径可点击 / 态势感知 / 项目记忆）—— 用户体感显著提升

### 10.4 M4+ 长期

1. 持续守住 PTY 兜底 + 不重做 chat UI 边界
2. 用户反馈"想要 X"再决定 P2/P3
3. 跨文档 RAG 是真正的差异化方向（写作场景强需求），但需要等用户量起来

---

## 11. 一句话总结（重复 · 加粗）

> **M1 应聚焦：① 改右侧 panel（vs spec 左侧）② 移植 OpenDesign 机制层（claude-stream + SQLite schema + ToolCard 6 个）③ 快照式 IR↔source 同步（解决 typola-gotchas #2）。M1 完成后再补 P0 驾驶舱范式（M2-M3）+ AI 编辑原语（M2） + 4 场景卡（M2-M3）。PTY 终端永保留作为兜底，baoyu-skills 集成是中文场景最大差异化。**