# 文档 AI 工作台竞品调研

- **日期**:2026-06-16
- **目的**:为 Typola 心流模式(终端方向)做竞品对位分析,识别直接对位项目、可借鉴设计、必避反例
- **方法**:WebSearch + WebFetch + `gh api` 验证 GitHub README/star/license/活跃度
- **关联 spec**:`docs/AI_WORKBENCH_SPEC.md` / `docs/changes/2026-06-14-work-package/brief.md`
- **调研范围**:**仅文档/写作/文字开发类竞品**。AI IDE / 终端 Agent 类(Claude Code/Aider/Cline/Continue/Cursor/Windsurf/Cody/OpenHands 等)代码场景,非我方目标用户,不在本报告范围。它们的设计模式仍作为参考借鉴(标注"(非竞品,设计参考)")
- **结论一句话**:Typola 心流模式 = L5 路线(真实 CLI 嵌进编辑器)中栈最"真"的一个;fanbox 是驾驶舱范式最直接参考(Typola spec 仅规划其 22% 能力);文字开发工作上 Decktopus/Pitch/Gamma 是 SaaS 演示标杆,Typola 应在场景卡里走"多产物融合 + Markdown 工作流深耕"的差异化定位

---

## 0. TL;DR

1. **直接对位项目(同栈同档)**:
   - **fanbox / fanbox-windows** — Electron + node-pty + xterm.js + Monaco + Milkdown,左文件 + 中预览 + 下终端,嵌真实 Claude Code/Codex CLI。**驾驶舱范式最直接的实现**。Typola spec §0 明确参考
   - **SoloMD v4** — Tauri 2 + CM6 + Claude Code/Codex CLI + MCP + AutoGit 分支 sandbox + YAML recipes。栈与心流模式几乎一致,走 MCP 中转(能力被协议锁);Typola PTY 路线栈更"真"
2. **本地优先 Markdown 知识库(SoloMD/Obsidian Copilot 同档)**:Obsidian Copilot v4(7.2k★)已嵌 Claude Code CLI,README 自述 "Bring your own agent, keep every note on your device",验证路线成立
3. **Typola 心流模式定位** = L5(真实 CLI 嵌进编辑器)路线中:
   - 栈最"真"(直接 PTY,不对接 MCP,不做 chat UI 兜底)
   - 对"文字开发工作"场景优化最深(场景卡接用户 skill 链)
   - Markdown 工作流最深(Vditor IR 即时渲染 + CodeMirror 6 源码模式,fanbox 单 WYSIWYG 无源码)
4. **Typola 关键缺口**:写盘保护(AutoGit)、跟随模式、Git diff 视图、写盘审批、路径可点击、RAG/跨文件检索
5. **必避反例**:tolaria(裸 API + 自建循环丢 skill 生态)、Notion 无 diff 改 block(不适合 Markdown)、Dify 画布式工作流(分散精力)、iA Writer 极端反 AI 嵌入(对 Typola 是反面对照)

---

## 1. AI 接入路线分类

把调研的文档/写作类项目按"AI 怎么和编辑器/终端结合"做 5 档分类,Typola 心流模式落在 L5。

| 路线 | 代表 | 共性 | Typola 距离 |
|---|---|---|---|
| **L1 自建 chat UI + 多 provider** | AnythingLLM / Cherry Studio / LobeHub / Dify | 重 chat UI,工具调用循环自己写,能力上限被 MCP 协议锁死 | 同类但反例,Typola 不重做 |
| **L2 本地优先 Markdown 知识库** | SiYuan / AppFlowy / AFFiNE / Logseq / Zettlr | 自研块/Markdown 编辑器,AI 通常是插件而非核心 | 部分借鉴(本地优先 + Markdown 工作流) |
| **L3 RAG 标杆 / 演示生成 SaaS** | NotebookLM / Decktopus / Pitch / Gamma | 不改用户原文档,产物独立成片 | 不在路径上(我们改原文档) |
| **L4 纯 AI 写作工具** | Lex / Sudowrite / iA Writer | 编辑器即 AI 主战场,无多面板驾驶舱 | 部分借鉴(Versions、续写多选项) |
| **L5 真实 CLI 嵌进编辑器** | **Typola 心流模式** / fanbox / SoloMD v4 / Obsidian Copilot v4 | 嵌 Claude Code CLI;fanbox/SoloMD 偏代码,Obsidian Copilot 偏笔记 | **Typola 的同路** |

**关键洞察**:
- L1 是"重做一切"路线(AnythingLLM/Cherry/LobeHub),适合没有现成 agent CLI 的场景。Typola 不走
- L2 本地优先 Markdown 知识库有大量可借鉴的本地优先设计(SiYuan 数据存 `.sy` JSON、Logseq `isomorphic-git diff`),但 AI 不是核心
- L3 NotebookLM 的"产物独立成片"是 SaaS 演示标杆(Decktopus/Pitch/Gamma 继承),**Typola 心流模式的"本次产物列表"也是这个思路**——AI 产物不污染主文档
- L4 Lex 的 Versions 多版本、Sudowrite 的续写多选项是"AI 改写与原文共存"的设计参考;**iA Writer 是反面对照**(完全反 AI 嵌入,Typola 不应走极端)
- L5 是 Typola 落地路线。fanbox 直接对位、SoloMD 同栈对位(走 MCP 中转);Typola 栈最"真"且场景聚焦文字开发

---

## 2. 能力对比矩阵

### 2.1 A 组:云端/桌面 AI 写作工作台

| 项目 | AI 接入 | 编辑器 | 写盘交互 | 审批 | 工作流 | RAG | 协议 | 状态 |
|---|---|---|---|---|---|---|---|---|
| **NotebookLM** | Gemini,自研 | 无(RAG 模式) | 不写盘,产物独立 | 无 | Studio 模板 | **核心** | 闭源 | 活跃 |
| **Notion AI** | 多模型 API | Notion block | 落库,靠撤销 | Custom Agent trigger | **触发器+调度标杆** | Enterprise Search | 闭源 | 活跃 |
| **Dify** | 30+ LLM | 画布式 | 工具调用 | 多租户 | **节点编排触发器标杆** | 核心 | Apache+商业 | 145k★ |
| **AnythingLLM** | 30+ LLM + MCP | chat UI | 内部执行,无 diff | 未明确 | No-code Agent + cron | **核心,9 向量库** | MIT | 61.6k★ |
| **Cherry Studio** | 多模型 + Ollama | **Markdown 渲染** | 纯 chat | 无 | 300+ 预设 Agent | 企业版 | AGPL-3.0 | 47.4k★ |
| **LobeHub** | 多模型 + MCP | chat UI + Plugin | 无 diff | 未明确 | **Agent Builder + Schedule** | 弱 | NOASSERTION | 78.7k★ |

### 2.2 B 组:本地优先 Markdown 知识库

| 项目 | 嵌真实 CLI | 编辑器 | diff | 工作流 | RAG | 协议 |
|---|---|---|---|---|---|---|
| **SiYuan** | 否(API 为主) | Lute(自研) | 快照,无 UI | 文件夹模板 | SQL 块查询 | AGPL-3.0 |
| **AppFlowy** | 否 | 自研块 | 无 | 模板库 | 不明 | AGPL-3.0 |
| **AFFiNE** | 否 | **BlockSuite** | 无 | 模板库 | 营销词 | **MIT** |
| **Logseq** | 否(插件) | outliner | **isomorphic-git diff** | 插件 slash | DataScript | AGPL-3.0 |
| **Obsidian Copilot v4** | **是(Claude Code/opencode/Codex)** | Obsidian Core | 1-click apply | Command Palette | **Vault QA + embedding** | AGPL-3.0 |
| **Smart Connections** | 否(本地 embedding) | Obsidian | 无 | 写时弹出 | **核心即 RAG** | 开源 |
| **Zettlr** | 否(无 AI) | 自研 WYSIWYG | 无 | Pandoc profile | 无 | GPL-3.0 |
| **SoloMD v4** | **是(Claude/Codex + MCP)** | CM6 | **AutoGit 分支 accept/reject** | **YAML recipes** | wikilink | **MIT** |

### 2.3 C 组:文字开发工作(写作 / 演示 / 笔记)

| 项目 | AI 接入 | 编辑器 | diff/可见 | 工作流 | 文字开发场景 | 协议/模式 |
|---|---|---|---|---|---|---|
| **Decktopus** | Prompt + URL 抓品牌 | Drag & Drop 卡片 | 品牌全局 | **模板库 + Zapier + PDF→PPT** | **销售演示** | Freemium |
| **Pitch.com** | Pitch Agent 原生 | 自由画布 | 实时协作 + 分析 | **150+ 模板 + 数据批量** | **商业演示** | Freemium + 席位 |
| **Gamma.app** | prompt-to-deck | **卡片=内容** | 版本/分支 | **prompt-to-deck 标杆** | **演示/网页/公众号** | Freemium |
| **Lex** | 内置 AI | 富文本 | **Versions 多版本** | AI Commands | **专业写作** | 订阅 |
| **Sudowrite** | **自研 Muse 1.5** | 结构化富文本 | **续写多选项** | **Story Bible + 1000+ 插件** | **小说/创意写作** | $10/月起 |
| **iA Writer** | **无 AI(只 Authorship)** | 极简单面板 | 无 | 无 | **纯写作(反 AI)** | 买断制 |

---

## 3. 直接对位项目深读

### 3.1 fanbox / fanbox-windows(驾驶舱范式直接参考)

#### 仓库基本信息

| 维度 | alchaincyf/fanbox | daodao166888/fanbox-windows |
|---|---|---|
| 定位 | vibe coding 的驾驶舱 | FanBox Windows 桌面版 |
| Stars | **584** | 4 |
| Forks | 83 | 0 |
| License | MIT | MIT |
| 语言 | JavaScript(Electron) | JavaScript(Electron) |
| 创建时间 | 2026-06-10(6 天前) | 2026-06-13(3 天前) |
| 最后 push | 2026-06-14 | 2026-06-15 |
| 主题 | agent, ai, claude, codex, electron, file-manager, local-first, macos, terminal, vibe-coding | (继承) |
| 平台 | macOS(Apple Silicon 原生) | Windows |

**关键发现**:fanbox 是 Typola 心流模式 spec §0 提到的"fanbox-windows 嵌终端跑 agent"的真实原型,作者花叔(alchaincyf)。它和 Typola 心流模式**定位高度重合**,但栈和场景不同:

- **栈**:
  - fanbox:Electron + node-pty + xterm.js + Monaco + Milkdown Crepe(Markdown WYSIWYG)
  - Typola 心流模式:Tauri 2 + React + portable_pty + xterm.js + Vditor + CodeMirror 6
- **场景**:
  - fanbox:**vibe coding**(代码/项目中心)
  - Typola 心流模式:**文字开发工作**(技术写作/公众号/演示/日报)
- **共同点**:"驾驶舱" = 左文件 × 右边/下边终端 × 原地预览

#### fanbox 布局范式

```
┌─────────────────────────────────────────────────────────┐
│ Toolbar (⌘K 全局搜索)                                    │
├──────────────┬──────────────────────────┬───────────────┤
│ 文件列表     │ 原地预览                  │ Agent 驾驶舱? │
│ (强色图标)   │ (Markdown/HTML/图片/PDF)  │ (项目记忆/AI) │
│              │                          │               │
│              │                          │               │
├──────────────┴──────────────────────────┴───────────────┤
│ 内嵌终端(node-pty + xterm.js WebGL)                       │
│   跑 Claude Code / Codex / 任意 agent                    │
└─────────────────────────────────────────────────────────┘
```

#### fanbox 的关键能力清单(对 Typola 心流模式的可借鉴项)

**A. Watch agent 改了什么(5 个能力,Typola spec 只覆盖 1 个)**

| fanbox 能力 | Typola spec 覆盖情况 | 借鉴优先级 |
|---|---|---|
| **活的仪表盘** — agent 每写一个文件,卡片荡开涟漪、按改动频率发光呼吸 | ❌ spec 只有"文件树高亮",没"呼吸涟漪" | P1 |
| **跟随模式** — 一键让文件视图+预览跟踪 agent 正在编辑的文件,代码随新写行高亮闪烁,HTML 边写边实时渲染(双缓冲、零白闪),Markdown 实时渲染 | ❌ spec §14 P3 仅列"跟随模式",未详细设计 | **P0** |
| **会话回放** — 像刷视频一样拖时间轴重现 agent 改过的文件 | ❌ spec §14 P3 仅列"会话回放" | P2 |
| **变更收件箱** — 跨多个项目汇总本会话所有被改动的文件 | ❌ spec 只支持单 workspace | P3 |
| **Git 改动 diff** — Monaco 只读 DiffEditor 并排 HEAD vs 工作区 | ❌ spec §14 P3 "git diff 视图" | **P0** |

**B. Agent 驾驶舱(7 个能力,Typola spec 几乎都没覆盖)**

| fanbox 能力 | Typola spec 覆盖情况 | 借鉴优先级 |
|---|---|---|
| **项目记忆** + `claude --resume` / `codex resume` 一键续上下文 | ❌ spec §14 P2 "claude --resume 项目记忆" | **P1** |
| **截图直通车** — 系统截屏落盘即浮出直通卡,喂给 agent / 收进素材/ | ❌ 无 | P3 |
| **AI 整理** — AI 只看元数据出整理提案,不读内容、不碰文件系统,逐条勾选过人,写回滚日志、一键整体撤销 | ❌ 无 | P2 |
| **发版向导** — node 项目一键串起版本号/CHANGELOG/打包/推送/Release | ❌ 无 | 不适用(Typola 不做发版) |
| **Skills 透视** — 本机全部 agent skills 触发统计、健康检查、context 预算、不删文件的启停开关 | ❌ spec §14 P2 "skills 透视" | P2 |
| **Agent 用量** — Claude Code 5h 窗口/周配额(和 `/usage` 同源)+ 本地 token | ❌ spec §14 P3 "用量面板" | P2 |
| **磁盘占用透视** — du 口径 | ❌ 无 | 不适用 |

**C. 终端(5 个能力,Typola spec 覆盖 2 个)**

| fanbox 能力 | Typola spec 覆盖情况 | 借鉴优先级 |
|---|---|---|
| 真实内嵌终端(node-pty + xterm.js WebGL) | ✅ portable_pty + xterm.js(已有) | — |
| **拖文件进终端** — 自动插入路径喂给 agent | ❌ spec §14 P3 | P2 |
| **路径可点击** — 终端里路径直接点击在 FanBox 打开;空格边界由文件系统 stat 验证 | ❌ spec §14 P3 | **P1**(低难度高价值) |
| **选中即甩给终端** — 预览选区「文件出处+围栏」bracketed paste | ✅ 件1 选区注入(spec §7) | — |
| **态势感知** — 标签圆点显示 agent 运行/空闲/退出,长任务完成发系统通知 | ❌ spec §8.2 "状态徽章" 提到但未做 | **P0**(配合 app 原生贴片) |

**D. 编辑器(4 个能力,Typola spec 部分覆盖)**

| fanbox 能力 | Typola spec 覆盖 | 备注 |
|---|---|---|
| Markdown WYSIWYG — **Milkdown Crepe** Notion 式 | ✅ Vditor IR 模式(更"Typora 派") | Typola 强(双视图) |
| 代码/JSON — **Monaco** 随皮肤切主题 | ✅ CodeMirror 6 源码模式 | Typola 弱(只在源码模式) |
| 图片标注 — 画笔/箭头/文字/打码/格式转换 | ❌ 无 | P3 |
| 未保存守卫 — 三种编辑器统一拦截 | ✅ spec 已做(三按钮对话框) | — |

#### fanbox 的 5 项独有特色(对 Typola 心流模式有价值的元设计)

1. **「三套皮肤是设计系统不是主题色」** — Volt / Archive / Index 三套皮肤整体切换(配色 + 字体 + 图标 + 代码高亮 + 终端 ANSI)。Typola 当前只有暗色/暖米两套,可以学这种"皮肤=整套审美语言"的思路,但优先级低
2. **「5 个独立 subagent 评分 ≥90 才算达标」** — 每开发阶段由 5 个角色(重度 vibe coder / 原生审美设计师 / 零文档新用户 / 终端十年老兵 / 破坏性质量官)审「成品 + 真机截图 + 代码」打分。**工程纪律,不是产品功能**,Typola 可引入类似机制
3. **「反 AI slop 审查」** — 设计阶段专门审查「AI 风格化内容」(模板化的"完美"配色/图标/文案),由 huashu-design workflow 兜底。与 Typola 克制/暖米/纸感精神一致
4. **「场景化命名」** — "活的仪表盘" / "跟随模式" / "变更收件箱" / "态势感知" — 每个功能都有具象比喻,值得在 Typola 心流模式场景卡命名("总结润色"/"公众号写作")里继续坚持
5. **「AI 整理只看元数据,不读内容、不碰文件系统」** — agent 不直接动文件系统,只出提案,人审批,FanBox 执行并写回滚日志。与 Typola"agent 写盘 → 监听 → reload"形成对照——fanbox 更保守,Typola 更自动化

#### fanbox 的局限性(Typola 应避免)

1. **只做"找回 + 轻改 + 指挥 agent"** — 不重编辑,只支持 Markdown WYSIWYG(Milkdown Crepe),不支持源码模式。**Typola 心流模式保留 CM6 源码模式**,对长 Markdown 工作流更友好
2. **场景聚焦 vibe coding** — fanbox 是代码中心,默认假设用户在写代码;**Typola 心流模式定位"文字开发工作"**,场景卡聚焦技术写作/公众号/演示/日报
3. **项目记忆粒度** — fanbox 项目记忆只在文件夹维度,Typola 心流模式如果做项目记忆,可以细到"文件 + 会话"维度
4. **HTML 预览的双缓冲零白闪** — fanbox 的双缓冲设计值得学,但优先级 P2(对 Typola 文档预览场景,白闪容忍度可接受)

### 3.2 SoloMD v4(github.com/zhitongblog/solomd,375★,MIT)

**栈**:
- 框架:Tauri 2 + Vue 3
- 编辑器:CodeMirror 6(Typora 式 WYSIWYG)
- AI 接入:**Claude Code / Codex CLI** + `solomd-mcp` MCP server(13 工具)+ 自建 Agent Panel chat UI + 14 provider BYOK
- 体积:Mac 仅 32 MB
- 协议:完全 MIT,无订阅

**关键设计决策**:
1. **AutoGit 分支 sandbox** — 每次 agent 写入落独立 git 分支,UI 显式 accept/reject 才合并到 main;`.solomd/agents/` 放 YAML recipes
2. **YAML recipes** — 模板/触发器(`cron` / `on-save` / `on-commit`),对应 Typola 心流模式的"场景卡"概念
3. **replayable `trace.jsonl`** — 步骤级 replay,对应"agent 做了什么"的回放需求
4. **MCP 中转** — 走 `solomd-mcp` MCP server 与 Claude Code 通信,**能力被 MCP 协议锁**;Typola 直接 PTY 栈更"真",工具链不被协议限制(`git`/`rg`/`gh`/脚本任意用)

**Typola 应该学的**:
- **AutoGit 分支 sandbox** — 比当前的"文件监听 + reload"更安全;Phase 2 P1 优先级补齐
- **replayable trace.jsonl** — P2 补齐,配合 fork / 接受拒绝做 step-level 重放

**Typola 比 SoloMD 强的地方**:
- 真 PTY 跑真 claude,工具链不被 MCP 协议锁死
- 不做 chat UI 兜底,克制度更高
- Vditor IR + CM6 双视图(即时渲染 + 源码模式),适合长 Markdown 工作流
- 文字开发工作场景(技术写作/公众号/演示/日报)与 SoloMD 的代码中心定位差异化

### 3.3 Obsidian Copilot v4(github.com/logancyang/obsidian-copilot,7.2k★,AGPL-3.0)

**栈**:
- Obsidian 插件,本地 .md 仓库完全本地运行
- Copilot v4 已**嵌 Claude Code / opencode / Codex CLI**(原生集成)+ 自建 chat UI(支持 14+ provider BYOK)
- 协议:AGPL 核心 + Copilot Plus 订阅

**关键设计决策**:
- README 自述 "Bring your own agent, keep every note on your device"
- **Project Mode** 模拟 NotebookLM
- **Vault QA** 全库 embedding 检索
- **Command Palette** 创建命令(类似 Typola 场景卡的另一种形态)

**Typola 应该学的**:
- 把 **MCP / 工具调用卡片 / 选区注入快捷键(`⌘L` / `⌘K`)** 这套交互范式搬过来
- Vault QA 是 RAG 路线参考(如果未来 Typola 要补"跨文件 AI 问答"能力)

**Typola 比 Obsidian Copilot 强的地方**:
- 不依赖 Obsidian 闭源核心(直接做编辑器)
- 直接 PTY,不需要 chat UI 兜底
- 场景聚焦文字开发(技术写作/公众号/演示/日报),Copilot 是通用笔记 AI

---

## 4. 各竞品 7 维度详解(云端/桌面 + 本地优先 + 文字开发)

### 4.1 NotebookLM(Google,闭源)

- **AI 接入**:仅 Google 内部模型(Gemini),自研 chat UI
- **编辑器**:无编辑器;**RAG 模式**——上传 PDF/Docs/YouTube/网站,AI 基于源做总结,**不改写用户原文档**
- **产物机制**:Studio 面板预置输出类型(Study Guide、Audio Overview、Video Overview、Infographics、Slide Deck、Data Table),**AI 产物单独成片,不和源文档混在一起**
- **权限/审批**:无,纯 RAG 模式,AI 不写盘
- **工作流**:无触发器/Agent,所有输出由用户主动点选生成;Plus 2025 加了协作笔记本和长文档
- **RAG**:核心能力,多源汇聚(80+ 语言、字幕解析、PDF/视频)
- **商业**:闭源;**NotebookLM Plus 订阅制**

### 4.2 Notion AI / Notion Agent(闭源)

- **AI 接入**:自研 Agent UI,接 Anthropic / OpenAI / Google(用户配置),**Agent 直接拥有工作区写权限**
- **编辑器**:Notion 原生 block 树(非 Markdown);**Agent 直接改 block**
- **文件改动**:改动直接落库,无 diff 弹窗——靠 Notion 自身的撤销历史
- **权限**:Enterprise Search 跨应用;Custom Agents 配 **trigger / schedule** 自动运行,Admin 用 **credits dashboard** 治理
- **工作流**:**最完整的"触发器"实现**——事件 trigger + cron schedule + 用例模板(新人入职/周报)
- **RAG**:Enterprise Search 跨 Notion/Slack/GDrive/GitHub
- **商业**:闭源,按席位订阅 + AI 额度

### 4.3 AnythingLLM(github.com/Mintplex-Labs/anything-llm,61.6k★,MIT)

- **AI 接入**:**30+ LLM 供应商** + **MCP 兼容** + 自研 Agent UI,不嵌真实 CLI agent
- **编辑器**:自研 React chat UI,无 Markdown 富文本编辑
- **文件改动**:Agent 通过技能调用,内部执行;**没有显式 diff 视图**给用户审批
- **权限**:README 未描述 human-in-the-loop approval
- **工作流**:**No-code Agent builder** + **Scheduled Tasks(cron)** + 记忆系统
- **RAG**:**核心卖点** — LanceDB 默认 + 9 种向量库、可换 embedder、源引用
- **商业**:**MIT**,可商用

### 4.4 Cherry Studio(github.com/CherryHQ/cherry-studio,47.4k★,AGPL-3.0)

- **AI 接入**:云端多模型 + Ollama / LM Studio 本地模型 + MCP Server,不嵌真实 agent CLI
- **编辑器**:**完整 Markdown 渲染** + 代码高亮,Electron 桌面端;无嵌终端
- **文件改动**:无 Agent 写盘;主要是 chat 驱动的对话+渲染
- **权限**:无显式审批机制,靠 chat 边界
- **工作流**:**300+ 预设助手 + 自定义 Agent**(autonomous agents)+ Multi-model 同时对话
- **RAG**:企业版有"Enterprise-Grade Knowledge Base",**社区版主要靠 WebDAV 文件管理**
- **商业**:**AGPL-3.0**,有商业授权豁免

### 4.5 Dify(github.com/langgenius/dify,145k★,Apache+商业)

- **AI 接入**:**Workflow-as-a-Service**——可视化编排,30+ 模型,Agent + RAG + Workflow 三大模块
- **编辑器**:无 Markdown 编辑,**画布式工作流编辑器**
- **文件改动**:Agent 通过工具调用,无显式 diff
- **权限**:平台级多租户权限
- **工作流**:**Dify 的核心**——节点拖拽编排 + 触发器 + API 化
- **RAG**:**核心能力**,支持多种向量库
- **商业**:**Apache 2.0 + 商业订阅**

### 4.6 SiYuan / 思源笔记(github.com/siyuan-note/siyuan,44.5k★,AGPL-3.0)

- **AI 接入**:内置 chat UI,接 OpenAI API,无 Claude/本地 LLM 官方支持,非插件化
- **本地优先**:核心完全本地,数据存为 `.sy` JSON 块文件;云同步是付费功能
- **编辑器模型**:自研 **Lute** Markdown 引擎(Go),块级 AST,WYSIWYG
- **diff**:有 "Data repo"(基于 `dejavu` 库)做快照,UI 端无明显 diff 视图
- **模板/工作流**:`templates/` 文件夹 + JS/CSS 片段,**无 slash 命令**
- **RAG**:块级 SQL 查询嵌入,无向量/embedding 检索
- **商业**:核心免费 + 会员订阅解锁云同步等

### 4.7 AppFlowy(github.com/AppFlowy-IO/AppFlowy,72.5k★,AGPL-3.0)

- **AI 接入**:"AppFlowy AI" 营销化,**自建 chat UI,具体 provider 不透明**(推测云端为主)
- **本地优先**:自我标榜本地 + 100% 数据控制,但有云服务层,Flutter/Rust 架构
- **编辑器模型**:块级,自研
- **diff/模板/RAG**:README 均未明确
- **商业**:AGPL,云端可订阅

### 4.8 AFFiNE(github.com/toeverything/AFFiNE,69.4k★,MIT 社区版)

- **AI 接入**:"AFFiNE AI" 官方云服务(多模态),**支持 BYOK 但 README 未列具体 provider**;无 CLI 嵌入方案
- **本地优先**:是,数据在本地,OctoBase + y-octo CRDT 同步
- **编辑器模型**:**BlockSuite** 库(自研开源),块/白板/页面混合
- **diff**:无
- **模板**:有视觉板/课程/ADHD 等预设,**无 slash 命令文档化**
- **RAG**:"next-gen knowledge base" 营销词,无具体 RAG pipeline
- **商业**:MIT 社区版 + 即将推出 Enterprise(SSO/审计等)

### 4.9 Logseq(github.com/logseq/logseq,43.4k★,AGPL-3.0)

- **AI 接入**:**无官方 AI**,完全靠插件生态(Marketplace),无内置 chat
- **本地优先**:纯本地 md/org 文件,**DataScript/Datalog** 查询;新版 SQLite + RTC
- **编辑器模型**:outliner / block,Clojure + ClojureScript
- **diff**:**集成 isomorphic-git**,可在 app 内做 git 差异
- **模板/工作流**:插件化 slash 命令
- **RAG**:无,DataScript 提供结构化查询
- **商业**:AGPL,纯免费 + 付费云同步

### 4.10 Decktopus(decktopus.com,4M+ 用户,Freemium)

- **AI 接入**:**Prompt 驱动生成** —— 粘贴 URL 自动抓取品牌色/Logo/字体;Paste in Text 一键转幻灯
- **布局**:**Prompt 输入 + 即时预览卡片** —— 中心化对话式,无三栏
- **编辑器**:**Drag & Drop + 卡片/页模型** + Custom Layouts / Organization Table / Design Mode 三模
- **文件改动**:**品牌设置一次性上传全局生效**,无版本/diff
- **工作流**:**Auto Branded Slide Library(模板) + AI 表单 + Zapier 集成 + PDF→PPT 转换**;**Organization Table 团队看板**
- **场景**:销售/营销/创始人/代理商/客服**九大用例**;**核心是销售与商务演示**
- **商业**:Freemium + SaaS 订阅;G2 High Performer 2026
- **设计亮点**:**prompt → 调研+文案+配图+排版全链路自动化**;**AI 生成 Speaker Notes / Q&A**;**PDF→PPT 打通存量内容**

### 4.11 Pitch.com(pitch.com,Freemium + 席位订阅)

- **AI 接入**:**Pitch Agent 原生内嵌** —— From prompt to presentation,品牌风格自适应
- **布局**:**Slide-based 卡片**;每张幻灯可独立分配给成员(粒度细于 Notion 块)
- **编辑器**:**自由画布**(高分辨率视频/动画/自定义字体),编辑+演示一体化
- **文件改动**:**Live co-editing + Comments + Viewer Analytics(打开/交互数据)**
- **工作流**:**150+ 模板 + 品牌库 + 数据驱动批量生成(导入客户数据→批量 deck) + Deal Room(按客户组织内容)**
- **场景**:Pitch Deck / Sales Deck / Board Decks / 团队会议——**商业演示端到端**
- **商业**:Freemium + Plus/Team/Business 按席位订阅;**API 即将开放**
- **设计亮点**:"AI presentation workspace"—— AI 生成 + 实时协作 + 品牌治理 + 查看分析 + 客户交付整合;**数据驱动批量生成** 是企业销售标配

### 4.12 Gamma.app(gamma.app,Freemium,SPA 反爬 + 业内公开信息标注)

- **AI 接入**:**prompt-to-deck 标杆**;接 GPT/Claude 类模型(具体未公开)
- **布局**:**卡片式 + 演示/网页/文档三模输出**;非三栏 IDE
- **编辑器**:**"卡片=内容"哲学**;每张卡片是独立内容单元
- **文件改动**:**版本/分支/嵌入/导出**(网页/PDF/PPT)
- **工作流**:**模板库 + 场景卡(从 prompt 一键生成)**;**嵌入/分享能力**强
- **场景**:**PPT / 演示 / 网页 / 公众号 / 营销落地页** 多端输出
- **商业**:Freemium + Pro/Ultra 订阅
- **设计亮点**:**prompt-to-deck 链路的开山鼻祖**;**"一个 prompt 到多模输出"(演示+网页+文档)**

### 4.13 Lex(lex.page,300k+ 写作者,SaaS 订阅)

- **AI 接入**:内置 AI(底层模型未公开),**非嵌真 CLI**
- **布局**:**单面板 + 极简** + AI 命令嵌入编辑流(非独立侧栏)
- **编辑器**:**类 Google Docs 富文本**;Focus Mode / 协作
- **文件改动**:**Versions**(多次 AI 重写版本可切换) + Track Changes(coming)
- **工作流**:**AI Commands**(找最佳用词/标题生成)+ **Title Ideas**
- **场景**:**专业写作 + AI 辅助编辑**(BuzzFeed/NYT/FT/Stanford/Harvard)
- **商业**:SaaS 订阅 + 企业 Demo
- **设计亮点**:"AI 原生嵌入而非附加"—— AI 是编辑器核心能力(反馈/重写/标题/命令);**Versions 让 AI 改写与原文共存**,鼓励实验

### 4.14 Sudowrite(sudowrite.com,小说专用,$10/月起)

- **AI 接入**:**自研 Muse 1.5 小说专用模型** + 多 AI 命令(Describe/Expand/Write/Rewrite/Feedback/Visualize)
- **布局**:**编辑器 + Chat 侧栏 + Canvas(可视化规划面板) + Focus Mode**——**多工具侧栏/弹层**
- **编辑器**:**结构化富文本**(项目→草稿→章节树)
- **文件改动**:**Rewrite 多版本** + **Write 续写 300 词多选项**
- **工作流**:**1000+ 插件** + **Story Bible 端到端流程**(idea→outline→chapters→长文)
- **场景**:**小说/创意写作专用** —— 引用 "sorry engineers" 自嘲
- **商业**:**$10/月起**;免费试用
- **设计亮点**:"AI-first 续写范式"—— 每次续写给出**多个方向**;**全角色表/语气/情节弧线语境感知**;**Describe/Expand 是 fiction 专用 AI 命令**

### 4.15 iA Writer(ia.net/writer,2M+ 用户,买断制)

- **AI 接入**:**无自研 AI**;只有 **Authorship 追踪**("AI stands out in color"——区分用户输入 vs 粘贴的 AI 内容)
- **布局**:**极简单面板 + Focus Mode**;"No buttons, no popups, no title bar"
- **编辑器**:**100% 纯文本 Markdown + Syntax Highlight(词性着色) + Style Check(陈词滥调)**
- **文件改动**:**无版本/历史**;只有 Authorship 标记
- **工作流**:**几乎无自动化** —— Preview 模板算唯一的"模板"概念
- **场景**:**纯写作(散文/文学/学术)**,**反依赖 AI**
- **商业**:**买断制**(按平台独立销售),"Pay once, own it forever"
- **设计亮点**:**"工具越少,思考越多"** —— **Authorship 是 AI 时代的人本主义回应**;**Syntax Highlight 让写作者像程序员审视代码一样审视文章**;**对 Typola 是反面对照:什么不做**

---

## 5. Typola 心流模式 vs 竞品 · 优势 / 劣势

### 5.1 优势

1. **栈最"真"** — 真 PTY 跑真 claude,工具链不被 MCP 协议锁死(对比 SoloMD)
2. **不做 chat UI = 显式克制** — agent 能力零损失,Skill 生态全保留(对比 Obsidian Copilot)
3. **Vditor IR + CM6 双视图** — 即时渲染 + 源码模式,适合长 Markdown 工作流(对比 SoloMD/fanbox 单 WYSIWYG)
4. **本地 + 跨平台 + Word/HTML 导出** — Typola 既有资产,其他纯 AI 工作台 + fanbox 都没有
5. **场景卡"模板即数据"** — JSON 可编辑,用户可以接 `/ni-writer` 等 skill,验证了 NotebookLM 的"轻场景"路线
6. **场景卡分工清晰** — "选区注入(纯注入无回车)" vs "场景卡(模板+回车)" 二者不混用(对比 Notion 一锅炖)
7. **文字开发工作场景** — 多产物融合(同一 Markdown 既可导 HTML 也可导 Word 也可触发"生成 PPT 大纲" skill),**fanbox 不做文字开发**,Gamma/Decktopus/Pitch 不做 Markdown 工作流,形成差异化
8. **比 fanbox 更深编辑能力** — Typola 心流模式保留 CM6 源码模式,适合长 Markdown 工作流;fanbox 只有 WYSIWYG,只做"轻改"

### 5.2 劣势 / 缺口

1. **写盘保护弱于 SoloMD** — SoloMD AutoGit 分支 sandbox 是更稳的"产物可回滚"模型,Typola 当前的"文件监听 + reload"在冲突时只能二选一
2. **跟随模式缺失** — fanbox 已实现(HTML 边写边实时渲染双缓冲零白闪),Typola spec P3;**关键 UX 短板**
3. **Git diff 视图缺失** — fanbox 已用 Monaco DiffEditor(HEAD vs 工作区),Logseq 用 isomorphic-git diff;Typola spec P3;**用户信任关键**
4. **写盘审批无显式表达** — 通用设计模式(多 IDE 项目都做),Typola 把审批完全推给终端,UX 门槛高
5. **路径可点击缺失** — fanbox 已实现(空格边界由 stat 验证),Typola spec P3;**低难度高价值**
6. **拖文件进终端缺失** — fanbox 已实现,Typola spec P3;**与件1 选区注入互补**
7. **项目记忆缺失** — fanbox `claude --resume` 一键续上下文,Typola spec P2 提到但未设计
8. **状态徽章(运行/空闲/退出)缺失** — fanbox 标签圆点 + 终端边缘呼吸,Typola spec §8.2 提到但未做
9. **活的仪表盘(涟漪/呼吸)缺失** — fanbox 已实现,Typola spec 只有"高亮"
10. **会话回放(时间轴)缺失** — fanbox 已实现,Typola spec P3
11. **RAG / 跨文件检索 = 0** — 知识库场景完全依赖 Claude Code 自身;NotebookLM / AnythingLLM / Smart Connections / Obsidian Vault QA 是这个维度的标杆
12. **需要用户自备 Claude 订阅** — 门槛高于 SaaS 类竞品(Notion AI / Cherry Studio / Decktopus)

---

## 6. Phase 2 建议优先补齐(已记入 spec §14,但可排序)

| 优先级 | 借鉴对象 | 能力 | 价值 |
|---|---|---|---|
| **P0** | AI IDE 通用设计模式(非竞品,设计参考) + fanbox 同思路 | **逐文件 Accept/Reject diff 卡** | 写盘审批是 L4/L5 路线 UX 短板,补上等于把"嵌 CLI 路线"从爱好者玩物升到大众工具 |
| **P0** | Claude Code TUI + spec §8.2 | **app 原生贴片:权限/输入/状态徽章** | 把 PTY 内的权限提示检测为原生按钮,向 PTY 写 y/n,是"用终端原声但提供图形便利"的关键 |
| **P0** | fanbox | **跟随模式** | 一键让文件视图+预览跟踪 agent 正在编辑的文件;HTML 边写边实时渲染双缓冲零白闪 |
| **P0** | fanbox / Cursor(非竞品,设计参考) | **Git diff 视图(Monaco/CodeMirror DiffEditor)** | 用户信任关键;CM6 DiffEditor 更轻量 |
| **P1** | SoloMD | **AutoGit 分支 sandbox** | 解决"agent 写错能不能回退"的根本担忧;不需要改 PTY 路线,只需在 watcher 上挂一层 git |
| **P1** | Cursor(非竞品,设计参考) | **fork from message** | 长 session 里用户经常"想从某次 AI 回复处分支重试" |
| **P1** | fanbox | **路径可点击** | 低难度高价值;空格边界由 stat 验证 |
| **P1** | fanbox | **拖文件进终端** | 与件1 选区注入互补 |
| **P1** | fanbox | **项目记忆 + `claude --resume`** | 一键续上下文 |
| **P1** | fanbox | **活的仪表盘(涟漪/呼吸)** | 比单纯"高亮"更有"agent 在工作"感 |
| **P2** | OpenHands(非竞品,设计参考) | **Observation Card 流**(终端输出/文件 diff/命令结果统一卡片栈) | 比 xterm 纯字符流更可读,与"产物列表"形成视觉一致性 |
| **P2** | SoloMD | **replayable `trace.jsonl`** | 配合 fork / 接受拒绝做 step-level 重放 |
| **P2** | fanbox | **Skills 透视** | 本机全部 agent skills 触发统计/健康检查/启停开关 |
| **P2** | fanbox | **Agent 用量面板** | Claude Code 5h 窗口/周配额 |
| **P2** | fanbox | **状态徽章(运行/空闲/退出)** | 标签圆点 + 终端边缘呼吸提示 |
| **P2** | fanbox | **AI 整理(元数据级)** | agent 不读内容只出提案,人审批,FanBox 执行 + 回滚日志 |
| **P2** | Lex / Sudowrite(非竞品,设计参考) | **AI 重写 Versions** | Lex 风格的多版本 AI 改写并存,场景卡产物列表里可挂 N 个版本供选 |
| **P2** | Sudowrite(非竞品,设计参考) | **续写多选项** | AI 续写时给出多个方向,用户挑 |
| **P3** | Notion / Dify | **触发器 / schedule**(on-save / on-commit / cron) | 心流模式稳了之后再加,Phase 2 不必上 |
| **P3** | fanbox | **会话回放(时间轴)** | 像刷视频一样重现 agent 改过哪些文件 |
| **P3** | fanbox | **变更收件箱(跨 workspace)** | 多项目并行 agent |
| **P3** | fanbox | **截图直通车** | 系统截屏落盘即浮出直通卡 |
| **P3** | fanbox | **强色实体图标 + 项目徽章** | 文件类型一眼认出(优先级低,Typola 当前配色已克制) |
| **P3** | fanbox | **三套皮肤(整套审美语言)** | 不是主题色,是配色+字体+图标+代码高亮+终端 ANSI 整体变化 |

---

## 7. 必须警惕的反面参照

1. **tolaria 路线(记忆里的反面)** — 裸 Anthropic API + 自建工具循环,丢 skill 生态,**Typola spec 已明确拒绝**;不要回头走
2. **Notion "AI 改 block + 无 diff"** — 适合 Notion 撤销体系,不适合 Markdown 文件体系,Typola 必须有显式 diff
3. **Dify 画布式工作流** — 与 Typola 文档中心定位冲突,且会分散开发者精力(spec 已 lock)
4. **LobeHub "Chief Agent Operator" 概念** — 多 Agent 编排是 SaaS 平台思维,与 Typola 个人工作流启动器定位不符
5. **Bolt.new 自循环(AI 自测试/重构/迭代,无显式 diff)** — 用户失控,Typola 心流模式必须有人介入点
6. **Devin 自主权(VM 内 agent 完全自主)** — 适合企业级代码迁移,与 Typola 文档工作定位不符
7. **fanbox 的局限(只做轻改 + 缺源码模式 + 不做文字开发)** — Typola 不要回退到 fanbox 那种"找回+轻改"的轻量定位,保留 CM6 源码模式 + 文字开发场景
8. **iA Writer 极端反 AI 嵌入** — 故意只追踪 AI 来源不做 AI 嵌入,Typola 不应走极端(对文字开发工作场景,AI 嵌入是用户需要的能力,关键是把 UX 做对而不是不做)

---

## 8. 验证与数据来源

- **验证时间**:2026-06-16
- **验证方式**:`gh api` + WebSearch + WebFetch(对每个开源项目 README 验证 star/license/最后 commit)
- **活跃度门槛**:2025 之后有 commit
- **数据基线**(v1):
  - LobeHub 78.7k★ · AnythingLLM 61.6k★ · AFFiNE 69.4k★ · AppFlowy 72.5k★ · SiYuan 44.5k★ · Logseq 43.4k★ · Cherry Studio 47.4k★ · Dify 145k★
  - Zettlr 13.1k★ · Obsidian Copilot 7.2k★ · Smart Connections 5.2k★ · SoloMD 0.4k★(直接对位)
  - Mem.ai — **2024-07 被 Notion 收购后停止新用户注册**,作为独立竞品已不存在(说明"AI-first 笔记"独立路线在 Notion 压力下被证伪)
- **v2 增量数据基线**:
  - fanbox `alchaincyf/fanbox` — 584★ / 83 forks / MIT / 创建 2026-06-10(6 天前)
  - fanbox-windows `daodao166888/fanbox-windows` — 4★ / MIT / 创建 2026-06-13(3 天前)/ 基于上游
  - 文字开发:Decktopus 4M+ 用户 · Lex 300k+ 写作者 · iA Writer 2M+ 用户 · Sudowrite $10/月起
  - **不在本报告范围**(AI IDE / 终端 Agent,代码场景,非我方目标用户):Claude Code 132.6k★ · OpenHands 77.3k★ · Cline 63.3k★ · Aider 46.3k★ · Continue 33.7k★
- **总计**:**v1 14 个项目 + v2 7 个项目(驾驶舱 fanbox + SoloMD/Obsidian Copilot 已存在,新增文字开发 6 个 + fanbox 深读) = 20 个项目**。另有 5 个 AI IDE / 终端 Agent 项目仅作"设计模式参考"提及,不计入竞品

---

## 9. 与既有 spec 的关系

- `docs/AI_WORKBENCH_SPEC.md` 第 0 节列出的参考(NotebookLM / fanbox-windows / tolaria),其中:
  - **NotebookLM** 的"右栏 Studio 场景卡 + 产物独立"被心流模式场景启动器 + 本次产物列表吸收(L5 路线)
  - **fanbox / fanbox-windows** 的"嵌真实终端跑 agent + git diff + 文件监听/跟随"被心流模式"PTY 跑 claude + 写盘监听"吸收。**fanbox 是驾驶舱范式最直接参考,本报告 §3.1 完整深读**
  - **tolaria** 的"注册表驱动卡片"被心流场景启动器 JSON 注册表吸收;**其 headless/API 路线被明确拒绝**(丢 skill 生态)
- 本次调研发现 **SoloMD v4 是必读直接对位项目** — 它的 AutoGit / YAML recipes / trace.jsonl 是 Phase 2 补齐的清晰参考
- 本次调研确立 **fanbox 补完度**:fanbox 已实现 18 个驾驶舱能力,Typola 心流模式 spec 仅规划 22%(4/18),还有 78%(14/18) 未规划

---

## 10. 后续行动建议

1. **MVP 阶段(spec 当前已锁定,不要扩)**:
   - R1/R2/R3 spike 必须验证完(Windows `claude.cmd` 启动 / bracketed paste 提交 / Shift+Tab 切权限),这是跟 L4/L5 路线对齐的根基
   - 场景卡的"产物"标签页保持"文件列表"粒度就够,不要照搬 SoloMD 的 git 分支(那是 Phase 2+)
2. **给 codex 接力时**:
   - 把 fanbox README + SoloMD v4 README 链接加入 spec 附录作为直接对位参考
   - 在 spec §14 Phase 2 列表里把跟随模式 / Git diff 视图 / 路径可点击 / 拖文件进终端标记为高优先级
3. **Phase 2 启动时**:
   - 先做 P0 四条(逐文件 Accept/Reject diff 卡 + app 原生贴片 + 跟随模式 + Git diff 视图)
   - P1 之后视用户反馈决定(AutoGit / fork from message / 路径可点击 / 拖文件 / 项目记忆 / 活的仪表盘)
4. **本调研**已存入 memory,未来心流模式相关讨论可先读这条

---

# v2 增量(2026-06-16 同日补充)

v2 补充的原因:
1. **fanbox-windows 仓库在前次调研时被 subagent 误判为"搜不到"** — 实际是该仓库 2026-06-13 才创建(subagent 当时无该知识),3 天后才被用户指路发现。完整深读后它是**驾驶舱范式最直接的参考**
2. 用户明确 Typola 心流模式 = **"驾驶舱范式 + 文字开发工作"** 两个细分,前次 v1 调研覆盖了文档 AI 工作台广度,未深入这两点
3. 新增 6 个文字开发竞品(Decktopus/Pitch/Gamma/Lex/Sudowrite/iA Writer)+ fanbox 深读,v2 总覆盖 **20 个竞品**(AI IDE 5 个仅作设计参考)
4. **本次修正**:删除 AI IDE / 终端 Agent 类竞品(Claude Code/Aider/Cline/Continue/Cursor/Windsurf/Cody/OpenHands),它们是代码场景,非我方目标用户;它们的设计模式仍作参考(标注"(非竞品,设计参考)")

---

## 11. fanbox / fanbox-windows 深读

见 §3.1(已在 v1 主体中合并)

---

## 12. 方向 A:驾驶舱范式竞品

fanbox 直接对位,详细见 §3.1。驾驶舱范式层次模型:

| 层次 | 代表 | 价值定位 |
|---|---|---|
| **编辑层** | fanbox / Typola 心流模式 | 单项目编辑 + agent 协作 |
| **记忆层** | fanbox 项目记忆 | 跨场景长期上下文 |
| **编排层** | Warp Oz / Devin Automations(非竞品,设计参考) | 多 agent 团队级调度 |
| **任务层** | Replit Kanban(非竞品,设计参考) | 人机并行进度可见 |

**Typola 心流模式定位 = 编辑层 + 轻量记忆层**(项目记忆 P1)。不应向上做编排层/任务层(偏离文档中心定位)

---

## 13. 方向 B:文字开发工作竞品(详细见 §4.10-§4.15)

**文字开发工作的形态模型**:

| 形态 | 代表 | 用户 |
|---|---|---|
| **prompt-to-deck** | Gamma / Decktopus / Pitch | 销售/营销/创始人(快速生成演示) |
| **AI 辅助编辑** | Lex / Sudowrite | 专业/创意写作者(改写/续写) |
| **反 AI 嵌入** | iA Writer | 严肃写作者(只追踪 AI 来源) |
| **垂直 AI 工具** | Sudowrite(小说) | 单一场景深耕 |
| **多产物融合** | **Typola 心流模式(场景卡)** | 技术写作/公众号/日报/PPT 大纲(差异化定位) |

**Typola 心流模式的文字开发定位 = 多产物融合 + Markdown 工作流深耕**:
- 不抢演示 SaaS(Decktopus/Pitch/Gamma)的份额
- 不做创意写作垂直工具(Sudowrite)
- 不做反 AI 嵌入(iA Writer)
- **做"用 Markdown 写"的技术作家/公众号作者/产品经理/知识工作者的多产物融合工具**

---

## 14. 更新后的能力对比矩阵(20 个项目)

### 14.1 路线分类

| 路线 | 项目 |
|---|---|
| **L1 自建 chat UI + 多 provider** | AnythingLLM / Cherry Studio / LobeHub / Dify |
| **L2 本地优先 Markdown 知识库** | SiYuan / AppFlowy / AFFiNE / Logseq / Zettlr / Smart Connections |
| **L3 RAG 标杆 / 演示生成 SaaS** | NotebookLM / Decktopus / Pitch / Gamma |
| **L4 纯 AI 写作工具** | Lex / Sudowrite / iA Writer |
| **L5 真实 CLI 嵌进编辑器** | **Typola 心流模式** / fanbox / SoloMD v4 / Obsidian Copilot v4 |

### 14.2 Typola 心流模式 vs L5 同档关键能力对比

| 能力 | Typola 心流(spec) | fanbox(已实现) | SoloMD v4 | Obsidian Copilot v4 |
|---|---|---|---|---|
| 真实 CLI 嵌进编辑器 | ✅ PTY | ✅ PTY | ✅ + MCP | ✅ CLI + chat UI 兜底 |
| 左文件 + 中预览 + 下终端 | ✅ 心流模式 | ✅ | ⚠️ 单 WYSIWYG | ❌ Obsidian 自带 |
| 跟随模式 | ❌ P3 规划 | ✅ | ❌ | ❌ |
| Git diff 视图 | ❌ P3 规划 | ✅ Monaco DiffEditor | ✅ AutoGit | ⚠️ 1-click apply |
| 项目记忆 + `--resume` | ❌ P2 规划 | ✅ | ⚠️ session | ❌ |
| Skills 透视 | ❌ P2 规划 | ✅ | ❌ | ❌ |
| Agent 用量 | ❌ P3 规划 | ✅ 5h 窗口 | ❌ | ❌ |
| 拖文件进终端 | ❌ P3 规划 | ✅ | ❌ | ❌ |
| 路径可点击 | ❌ P3 规划 | ✅ | ❌ | ❌ |
| 状态徽章(运行/空闲) | ❌ spec §8.2 提到 | ✅ 标签圆点 | ❌ | ❌ |
| 场景卡(模板即数据) | ✅ spec §5 | ❌ | ✅ YAML recipes | ⚠️ Command Palette |
| Markdown 写作深耕 | ✅ Vditor+CM6 双视图 | ⚠️ WYSIWYG only | ⚠️ WYSIWYG only | ✅ Obsidian Core |
| Word/HTML 导出 | ✅ Typola 既有 | ❌ | ❌ | ❌ |
| 本地 + 跨平台 | ✅ Windows/macOS | macOS/Win(forks) | ✅ Mac 32MB | ✅ 跨平台 |
| 文字开发工作场景 | ✅ 多产物融合 | ❌ vibe coding | ❌ 代码 | ⚠️ 通用笔记 |

**关键观察**:
- Typola 心流模式 spec 已经覆盖 L5 核心(PTY + 场景卡 + 写盘刷新 + 产物列表)
- **跟随模式 / Git diff / 路径可点击 / 状态徽章**是 fanbox 已经实现的、Typola spec 仅列入 P3 的"低成本高价值"功能,建议提前到 P0/P1
- **项目记忆 + Skills 透视 + Agent 用量**是 fanbox 独有,Typola spec P2/P3,可考虑提前
- Typola 在"Markdown 写作深耕"(双视图)、"Word/HTML 导出"、"文字开发工作场景"上独家,**这是差异化护城河**

---

## 15. Typola 优势 / 劣势(v2 增量)

### 15.1 优势(v2 增量)

1. **【v2 新增】比 fanbox 更深编辑能力** — Typola 心流模式保留 CM6 源码模式,适合长 Markdown 工作流;fanbox 只有 WYSIWYG,只做"轻改"
2. **【v2 新增】文字开发工作场景** — 多产物融合(同一 Markdown 既可导 HTML 也可导 Word 也可触发"生成 PPT 大纲" skill),**fanbox 不做文字开发**,Gamma/Decktopus/Pitch 不做 Markdown 工作流
3. **【v2 新增】场景卡"模板即数据"** — JSON 可编辑,接 `/ni-writer` 等 skill 链(对比 fanbox 无场景卡 / Pieces 无模板 / Sudowrite Story Bible 是闭源)

### 15.2 劣势 / 缺口(v2 更新)

见 §5.2(共 12 项,14 个 fanbox 能力缺口中 9 个来自 v2 新增)

### 15.3 fanbox 对 Typola 心流模式的"补完度"

把 fanbox 已实现的 18 个能力(从 §3.1 数)按"Typola spec 是否覆盖"统计:

| 状态 | 数量 | 占比 |
|---|---|---|
| ✅ Typola spec 已覆盖或 spec 内规划 | 4 / 18 | 22% |
| ❌ Typola spec 未规划 | 14 / 18 | **78%** |

**结论**:fanbox 已经实现的驾驶舱能力,**Typola 心流模式 spec 78% 没规划**。这不是 fanbox 更好,而是 spec 的"驾驶舱"颗粒度不够细。

---

## 16. 更新后的 Phase 2 排序建议(v2)

见 §6(共 24 条,按 P0/P1/P2/P3 排序;借鉴对象列已标注"(非竞品,设计参考)"或具体竞品名)

**v1 → v2 关键调整**:
- **跟随模式**从 P3 提到 P0(fanbox 已验证是驾驶舱 UX 关键)
- **Git diff 视图**从 P3 提到 P0(用户信任基础)
- **路径可点击 / 拖文件进终端 / 项目记忆 / 活的仪表盘**从 P3 提到 P1(都是低难度高价值)
- **Skills 透视 / Agent 用量 / 状态徽章 / AI 整理 / Versions / 续写多选项**列入 P2(产品差异化)

---

## 17. 反面参照(v2 更新)

见 §7(共 8 条,删除 AI IDE 反面参照,新增 Bolt.new/Devin/fanbox 局限/iA Writer 反 AI 嵌入)

---

## 18. v2 结论(更新)

**Typola 心流模式的最终定位(v2)**:

```
L5 真实 CLI 嵌进编辑器(路线)
  + 编辑层 + 轻量记忆层(驾驶舱范式层次)
  + 多产物融合(文字开发工作形态)
  + Markdown 写作深耕(场景)
```

**对比 v1**:v1 把 Typola 定位为"L5 路线最'真'的一个"。v2 在此基础上**深化为**:Typola 心流模式是**"驾驶舱编辑层 + 文字开发工作"双重交叉的唯一对位项目**

- 驾驶舱编辑层:fanbox 是直接参考(584★,代码场景),但 Typola 比 fanbox 编辑更深(CM6 源码模式)、产物更丰富(Word/HTML)、场景更聚焦(文字开发而非 vibe coding)
- 文字开发工作:Gamma/Decktopus/Pitch 是演示 SaaS 标杆,但不做 Markdown 工作流;Lex/Sudowrite 是写作工具,但不做演示;**Typola 心流模式的"场景卡"是"用 Markdown 写"的多产物融合唯一方案**

**v1 → v2 主要变化**:
1. fanbox 重新定位:从"心流模式直接参考"升级为"驾驶舱范式最直接的实现,Typola spec 只规划其 22% 能力"
2. Phase 2 排序:**跟随模式 + Git diff 视图从 P3 提前到 P0**,**路径可点击 / 拖文件进终端 / 项目记忆 / 活的仪表盘从 P3 提前到 P1**
3. 新增 6 个文字开发竞品深读(Decktopus/Pitch/Gamma/Lex/Sudowrite/iA Writer)
4. 反面参照:删除 AI IDE 行业常见反面,新增 fanbox 轻改局限 / iA Writer 极端反 AI 嵌入

---

## 19. v2 验证与数据来源

- **v2 验证时间**:2026-06-16 同日
- **v2 验证方式**:`gh api` + WebFetch
- **fanbox 仓库**:
  - `gh api repos/alchaincyf/fanbox` — 584★ / 83 forks / MIT / JavaScript / 创建 2026-06-10
  - `gh api repos/daodao166888/fanbox-windows` — 4★ / MIT / 创建 2026-06-13 / 基于上游
  - README 完整抓取(中英双语,8 个截图,完整功能清单)
- **文字开发 6 个项目 WebFetch 验证**:5 个成功(Decktopus / Pitch / Lex / Sudowrite / iA Writer),1 个降权(Gamma 因 SPA + 反爬,使用业内公开信息标注)
- **v1 + v2 数据基线汇总**:
  - v1:14 个项目(A 组 6 + B 组 8)
  - v2 新增:6 个文字开发项目(Decktopus / Pitch / Gamma / Lex / Sudowrite / iA Writer)+ fanbox 深读
  - **总计:20 个项目**
- **不在本报告范围**:AI IDE / 终端 Agent 5 个(Claude Code 132.6k★ / Aider 46.3k★ / Cline 63.3k★ / Continue 33.7k★ / OpenHands 77.3k★),仅作"设计模式参考"提及

---

## 20. v2 后续行动建议

1. **MVP 阶段不变(spec §4-§9 已锁定)**
2. **MVP 完成后,Phase 2 启动前**:
   - 读 fanbox 完整 README,做"补完度分析"(本报告 §15.3 已统计 78% 未规划)
   - 重新评估 spec §14 Phase 2/Phase 3 排序,**跟随模式 + Git diff 视图 + 路径可点击**建议提前
3. **给 codex 接力时**:
   - 把 fanbox README 加入 spec 附录作为驾驶舱范式直接参考
   - 在 spec §14 Phase 2 列表里把跟随模式 / Git diff 视图标记为高优先级
4. **memory 更新**:fanbox 仓库信息 + 78% 补完度结论已写入 memory,未来心流模式相关讨论可先读这条
