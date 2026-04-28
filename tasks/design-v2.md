# Typola × LLM Wiki 集成设计 V2

> 本文档是 V1 (`todo.md`) 的修订与定稿版本。V1 之后经过多轮对齐，本版作为 M1 起点的权威设计。

---

## 0. 版本与历程

- **V1（初稿）**：参考 nashsu/llm_wiki，含 sqlite-vec、独立 chat 面板、5 里程碑。
- **V2（本版）**：回归 Karpathy LLM Wiki 本源，强调"书记员（bookkeeper）"定位，砍过度工程，补本源缺失能力。

关键修正：
- ❌ 移除 sqlite，改 JSON + 内存索引（Obsidian Smart Connections 路线）
- ❌ 移除向量+RRF+LLM 重排，改纯 BM25 + index.md
- ❌ 图谱从"一级主视图"降级为"Knowledge 面板下的副产品子视图"
- ✅ 新增 Query 结晶化（Chat 回答可保存为 wiki 页）
- ✅ 新增 Lint Pass（健康检查）
- ✅ 新增 Schema 文件（`WIKI.md`）
- ✅ 新增 Tool Use Agent（Notion / sage-wiki 路线，不依赖 CLI）
- ✅ 对齐 Karpathy 三大操作：Ingest / Query / Lint

**V2.1 增补（本次修订）**：
- 问答交互统一为右侧 Chat 面板（V2.1 曾规划的 `Ctrl+K` 浮层已合并到 Chat，减少用户理解成本）
- 所有界面文案移除具体费用 / 价格（仅在预算上限设置里出现"token / 额度"等机制词）
- 国产模型预设明确为：MiniMax / GLM（智谱）/ Kimi（Moonshot）作为首批接入
- 新增 §16 "编译完成后如何使用"（四种使用方式集中视图）

---

## 1. 产品定位

**一句话**：Typola 是一个 Markdown 编辑器，它会帮你整理你写过的东西。

**核心角色隐喻（内部术语，不对外）**：LLM 是 **书记员（bookkeeper）**，不是 "智能助手"。
- 负责无聊的 bookkeeping：摘要、交叉引用、索引、一致性
- 人负责：策划源、提问、思考意义
- 出自 Karpathy："LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass"

**对外话术**（避免术语）：
- 不用：Agent、RAG、向量、embedding、知识图谱（对用户不说）
- 用：AI 书记员、整理、wiki、关联图

---

## 2. 用户约束（已确认）

1. 基础编辑器能力绝不丢失
2. 用户自配 baseUrl / apiKey / model
3. 可引入 `wiki/` 子目录，首次需提示；**绝不修改任何源文件**
4. 先支持百份文档；完全依赖远端 LLM
5. 必须支持图谱
6. **原生 Anthropic + OpenAI 兼容双协议**
7. Wiki 编译：**手动触发**（不做保存自动编译）
8. 小白用户也能轻松上手
9. UI 文案：专业克制，不预设用户焦虑，不过度比喻

---

## 3. 目录约定

```
<workspace>/
├── *.md                    # 源文件（完全不动）
├── WIKI.md                 # Schema 文件：wiki 约定、purpose、扫描范围
├── .typola-wiki/           # 内部数据，建议 gitignore
│   ├── config.json         # LLM 配置、预算、开关
│   ├── index/
│   │   ├── files.json      # {path, sha256, mtime, indexed_at}
│   │   └── bm25.json       # 倒排索引（百份规模）
│   ├── graph.json          # 节点 + 边
│   ├── chats/              # Chat 会话 {uuid}.json
│   └── cache/              # LLM 中间结果缓存
└── wiki/                   # 编译产物（用户可读可改可删）
    ├── index.md            # 主入口（BM25 结合）
    ├── overview.md         # 全局摘要
    ├── entities/           # 人物
    ├── concepts/           # 概念
    ├── topics/             # 主题
    ├── sources/            # 每份源笔记的摘要页
    └── queries/            # Query 结晶化产物
```

**首次启用 Wiki 时的提示**（不弹窗打断，书记员面板卡片即可）：
> 将在工作区创建 `wiki/` 和 `.typola-wiki/` 两个目录。不会修改任何已有文件。

---

## 4. 技术选型

| 组件 | 选型 | 理由 |
|---|---|---|
| LLM Provider | 原生 Anthropic SDK + OpenAI 兼容 fetch | 覆盖 Claude / OpenAI / DeepSeek / Ollama |
| Tool Use 协议 | 内部 MCP 风格接口（不对外暴露 MCP server，M6+ 再开放） | 未来可扩展，短期不引协议复杂度 |
| 全文索引 | 纯 BM25（js 实现，例如 `okapibm25`） | Karpathy 本旨；百份规模够用 |
| 向量检索 | **M1-M6 不做**，M7+ 可选 | 过度设计风险 |
| 图库 | `graphology` + `cytoscape.js`（轻量渲染） | 副产品定位，不需要 sigma.js |
| 社区检测 | **不做** | Karpathy 原文未强调 |
| 切分 | Markdown 按 H1/H2 + 字符兜底 | 百份不需复杂 chunker |
| 文档类型 | 仅 .md/.mdx/.txt | 与现有扫描范围一致 |
| Key 存储 | Electron `safeStorage` + userData | 原生加密 |

---

## 5. 用户历程（对齐 Karpathy 三大操作）

### 5.1 零 AI 用户
打开 Typola = 普通编辑器。首页底部一行入口："✨ 给这个工作区一个 AI 书记员 →"（可关）。

### 5.2 轻 AI 用户（右键 AI）
选中文字 → 右键 → "✨ 让 AI 改写 / 解释 / 精简 / 翻译"。
首次触发进入**配 Key 流程**（见 §6）。
配好后：AI 返回气泡展示 → [应用] [插入下方] [丢弃]。

### 5.3 Ingest（书记员工作）
左侧书记员图标 📋 → 编译 Wiki 入口卡片：
- 显示扫描文件数、预估耗时、边界说明（不改源文件）
- 点"开始整理" → 进度视图（两步链式：分析 → 生成）
- 完成后显示产物统计 + 发现的矛盾数

### 5.4 Query（书记员回答）

**统一入口：右侧 Chat 面板**。所有问答（轻量查询、多轮对话、Agent 任务）走同一个 UI，无需用户区分形态。

#### 5.4.1 入口

三种触发方式，都打开同一个右侧 Chat 面板并聚焦输入框：

| 方式 | 说明 |
|---|---|
| 右上角 **🔍 问书记员** 按钮 | 小白可见入口，零理解成本 |
| 侧边栏 💬 图标 | 常驻入口 |
| 快捷键 `Ctrl+\` 或 `Ctrl+K` | 键盘党快捷 |

#### 5.4.2 位置与形态

**右侧面板**（可拖宽 / 可隐藏 / `Ctrl+\` 切换）：
```
╭──────────────────────────────╮
│ 💬 书记员                     │
│ [模型 ▼]          [+ 新对话] │
├──────────────────────────────┤
│                               │
│ [消息流，流式 + Markdown]     │
│                               │
│ Claude: ... 根据你的笔记...   │
│ [[RLHF]] [[DPO]]              │
│                               │
│ [ 💾 保存到 Wiki ]            │
│                               │
├──────────────────────────────┤
│ @ 引用 · 📄 当前文件          │
│ 📚 已引用：[[RLHF]]            │
├──────────────────────────────┤
│ > 输入问题...            [↵] │
╰──────────────────────────────╯
```

#### 5.4.3 能力矩阵

| 能力 | 说明 |
|---|---|
| 单次提问 | 输入 → 发送 → 流式回答 → 可直接 Esc / 新建对话 |
| 多轮对话 | 默认开启上下文延续，每条历史自动纳入 |
| `@mention` | `@<文件>`、`@selection`、`@wiki:<实体>` |
| Markdown 渲染 | 复用 Milkdown/Shiki，代码块、公式、列表一致 |
| Tool Use Agent | 可读文件、调搜索、审批后写文件（§7） |
| Thinking log | 每条回复下可展开"AI 的步骤" |
| 结晶化 | 每条回复可一键"💾 保存到 Wiki" → 生成 `wiki/queries/<slug>.md` |
| 会话持久化 | `.typola-wiki/chats/<uuid>.json`，可列表、重命名、导出 |

#### 5.4.4 设计核心

- **一个入口，一套 UI**：消除"轻量 vs 深度"的理解门槛
- **新对话按钮显眼**：鼓励"一问一答"型用户每次 [+ 新对话] 开始，会话历史不累积包袱
- **不打扰写作**：面板可隐藏；不开时完全不占屏幕
- **Karpathy 结晶化闭环**：好答案 `💾` 一下写回 wiki，价值不流失

### 5.5 Lint（书记员自检）
书记员面板每月提示一次（频率可配）：
- 互相矛盾的说法
- 孤立页（无链入）
- 断链
- 缺失索引项
- 每项可"让 AI 修 / 我自己改 / 忽略"

### 5.6 关联图（副产品）
书记员面板下的子视图，不是一级入口。
- cytoscape 轻量渲染
- 双击节点 → 编辑器打开对应 md
- 无社区检测、无复杂交互

### 5.7 持续写作
默认关闭的"相关提示"开关（设置里可开）。开启后写作时底部出现 `💡 相关：[[X]] [[Y]]`。

---

## 6. 配 Key 流程（M1 核心交付）

### 6.1 触发时机
小白第一次点"让 AI 改写"等 AI 动作时触发。不在启动时强制。

### 6.2 主窗口
```
连接 AI 服务

Typola 的 AI 功能需要你自备 API Key。选择一类服务继续：

[ Anthropic (Claude) ]    [ OpenAI 兼容 ]

了解差异 | 什么是 API Key                   [ 以后再配 ]
```

### 6.3 Anthropic 配置页
```
1. 在 Anthropic 获取 API Key  [ 打开控制台 ]
2. API Key [输入框，可切换明文]
   密钥使用 Electron safeStorage 加密存储在 userData。
3. 模型 [ claude-sonnet-4 ▼ ]
                              [ 取消 ] [ 测试连接 ]
```

### 6.4 OpenAI 兼容配置页

**M1 首批预设**（覆盖海外 + 三大国产）：

| 预设 | Base URL | 默认模型 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| **MiniMax** | `https://api.minimax.chat/v1` | `MiniMax-Text-01` |
| **GLM（智谱）** | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| **Kimi（Moonshot）** | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| Ollama | `http://localhost:11434/v1` | `llama3.2` |
| 自定义 | *（用户手填）* | *（用户手填）* |

点击预设自动填 Base URL + 默认模型。用户可改。

**M7+ 扩展**（不纳入 M1）：SiliconFlow、通义（DashScope）、OpenRouter、Groq 等。

### 6.5 验证结果
- 成功：✓ 连接成功 → [完成] → 自动执行用户最初的 AI 动作
- Key 无效：✗ 连接失败：密钥无效或已撤销（HTTP 401）
- 网络：✗ 连接失败：无法访问 {host}  [代理设置]

### 6.6 文案原则
- 不比喻、不预设焦虑
- 状态码 + 事实描述 + 必要的行动入口
- 隐私说明用机制（safeStorage、userData），不用承诺（"不会上传"）
- 不做额度承诺（政策易变）

### 6.7 存储
- Key：Electron safeStorage 加密到 `userData/typola-llm-keys`
- 配置：`userData/typola-llm-config.json`（多套配置可列表管理）
- 工作区级可覆盖：`.typola-wiki/config.json`（优先级高于全局）

---

## 7. Agent 架构（Tool Use）

### 7.1 定位
- 走 **Notion / sage-wiki 路线**：内部 Tool Use 循环 + 审批 UI + Thinking log
- **不走** Claude Code CLI 内嵌路线（违反多 provider 约束）
- 能力介于"纯 chat 套壳"和"Claude Code 全家桶"之间，覆盖 90% 写作者需求

### 7.2 工具集（内部接口，M5 交付）

**只读工具**（默认自动通过）：
- `read_file(path)` — 读 md
- `list_files(glob?)` — 列工作区文件
- `search_wiki(query)` — BM25 搜索
- `get_current_selection()` — 当前编辑器选中
- `get_current_file()` — 当前打开文件
- `get_wiki_page(type, name)` — 读 wiki entity/concept/topic

**写操作**（强制审批）：
- `write_file(path, content)` — 仅限工作区内
- `append_file(path, content)`
- `create_wiki_page(type, name, content)`
- `update_wiki_page(path, patch)`

**禁止**：bash 执行、任意 shell、网络请求（M1-M6）。MCP 外部服务器 M7+ 可选。

### 7.3 审批 UI
- 每次写操作弹确认框：显示 diff、路径、来源任务
- 支持"此会话全部允许"快捷
- 所有 run 落地到 audit log（可在书记员面板查看）

### 7.4 Thinking Log
- Chat 消息可展开"AI 的步骤"子面板
- 显示：调用了哪些工具、返回了什么、下一步判断
- 对齐 Notion "Thinking log" 设计

---

## 8. Wiki 编译（对齐 Karpathy 本旨）

### 8.1 两步链式
1. **Step 1 分析**：LLM 读源文件 + 已有 wiki 上下文 → JSON 输出（实体/概念/连接点/冲突）
2. **Step 2 生成**：基于分析结果写/更新 wiki 页

### 8.2 增量
- 源文件 SHA256 未变 → 跳过
- `WIKI.md` 变更 → 全量重编译
- 单文件入口：右键文件 → "编译到 Wiki"

### 8.3 置信度标注
每条 wiki 断言带标记（写入 frontmatter 或行内）：
- `[EXTRACTED]` — 直接来自源文
- `[INFERRED]` — LLM 综合推断
- 附来源文件路径

### 8.4 Schema 文件 `WIKI.md`
首次编译前自动生成（用户可编辑）：
```markdown
# Wiki Purpose

## 目标
（用户填写：这份 wiki 服务什么问题）

## 关键问题
（用户填写：想通过这份 wiki 回答哪些问题）

## 扫描范围
include:
  - "**/*.md"
exclude:
  - "wiki/**"
  - ".typola-wiki/**"
  - "node_modules/**"

## 约定
- 实体类型：entities / concepts / topics
- 语言：{auto-detect}
- 置信度：启用
```

### 8.5 用量控制
- 编译前显示预估 token 量（不展示货币金额）
- 工作区级预算上限以 token 数配置（`.typola-wiki/config.json`）
- 超限时暂停并提示用户
- 设计原则：**不在 UI 里计算或展示"¥X.X"等货币金额**（汇率、价格、计费模式随 provider 波动，显示易误导）

---

## 9. 里程碑

| M | 内容 | 工期 |
|---|---|---|
| M1 | LLM 基础 + Provider 抽象 + 配 Key 流程 + 右键 AI 菜单 | 1 周 |
| M2 | BM25 全文索引 + index.md 生成 + 工作区搜索 API（供 Chat 引用） | 1 周 |
| M3 | 两步编译 + `WIKI.md` Schema + 置信度标注 + 单文件/全量入口 | 2 周 |
| M4 | 书记员面板（一级图标）+ wiki 导航 + cytoscape 关联图子视图 | 1 周 |
| M5 | Chat 面板 + Tool Use Agent + 审批 UI + Thinking log + Query 结晶化 | 3 周 |
| M5.5 | Lint Pass（健康检查）+ 修复清单 UI | 0.5 周 |
| M6 | 润色：Purpose 引导、相关提示（默认关）、导出 zip、预算监控 | 1 周（可选）|
| M7+ | 向量检索（可选）、MCP server 化、外部 MCP、Claude Code 内嵌模式 | 可选 |

**核心交付（M1–M5.5）：7.5 周**

---

## 10. UI 结构

```
Activity Bar:
  📁 Explorer
  🔍 Search
  📋 Outline
  📋 书记员          ← M4 新增（一级图标）
    ├─ 编译入口 / 进度
    ├─ Wiki 导航（index / overview / entities / concepts / topics / sources / queries）
    ├─ 关联图（子视图）
    ├─ 健康检查（M5.5）
    └─ 会话历史（M5）

顶部栏右上角:
  🔍 问书记员（M5，点击打开右侧 Chat 并聚焦输入框）
  ✨ Provider 名称（点击进设置）

右侧面板（可切换）:
  💬 书记员 Chat（M5）
  [ 可拖宽 / Ctrl+\ 切换 / Ctrl+K 也触发 ]

底部：
  写作时相关提示条（默认关）
```

---

## 11. 小白可用性关键设计

| 设计 | 对应关切 |
|---|---|
| 所有入口用"书记员""整理""wiki"，不出现"Agent/RAG/向量" | 术语焦虑 |
| 首次配 Key 控制台链接直达 | 不知道去哪申请 |
| 预估 token 用量 + token 预算上限 | 怕烧钱（不展示货币金额，避免汇率/计价误导）|
| 自动化默认关（相关提示、自动编译） | 怕打扰、怕偷偷扣钱 |
| Wiki 页 = 普通 md 文件 | 不用学新格式 |
| 右上角"🔍 问书记员"可见按钮 + `Ctrl+\` 快捷键 | 零理解成本 + 键盘党快捷，两头兼顾 |
| 一键导出 zip / 一键卸载书记员 | 后悔权 |
| 写操作强制审批 + Thinking log | 信任建立 |

---

## 12. 非功能要求

- **零回归**：所有现有编辑器功能、快捷键、配置保持不变
- **新代码隔离**：`src/llm/`、`src/wiki/`、`src/graph/`、`src/chat/` 新目录
- **i18n**：所有新文案进 i18n，中/英双语
- **性能**：BM25 索引百份 < 1s；cytoscape 渲染百节点流畅
- **打包**：不新增原生模块依赖（JSON + 内存 = 零 rebuild 风险）

---

## 13. 风险与对策

| 风险 | 对策 |
|---|---|
| LLM 用量不可控 | 编译前 token 预估 + token 预算上限 + 实时 token 计数（不换算货币）|
| 两步编译质量波动 | Prompt 模板集中管理；单文件重编译入口 |
| 审批 UI 打扰严重 | "会话内全部允许"选项；只读工具自动通过 |
| 百份 → 千份时 BM25 性能 | 监控索引大小，触发阈值时再加向量（M7+） |
| 图谱视觉被用户期待为主视图 | 明确降级为子视图；主流量走 wiki 导航树 |
| Key 泄露 | safeStorage 加密；不在 log 中输出 |
| Anthropic 国内访问受限 | 配 Key 失败时提示代理设置入口 |

---

## 14. 非目标（明确不做）

- ❌ PDF / DOCX / 图片 / 网页摘取（M1-M7 全程不做）
- ❌ 多用户协作 / 云端同步
- ❌ 浏览器扩展
- ❌ 本地模型打包（用户自装 Ollama 可用）
- ❌ Deep Research / 多轮 web 搜索
- ❌ 独立 MCP 客户端（M7+ 再看）
- ❌ 自动化工作流（Notion Custom Agents 式）
- ❌ 插件系统

---

## 15. 下一步

1. 用户确认本 V2 设计
2. 更新 `tasks/todo.md` 将里程碑同步为 V2 版本
3. 进入 M1 编码：
   - `src/llm/types.ts` — Provider 抽象
   - `src/llm/anthropic.ts` — 原生适配器
   - `src/llm/openaiCompat.ts` — 兼容适配器
   - 配 Key 流程 UI（§6）
   - 右键 AI 菜单 4 个动作（改写/解释/精简/翻译）

---

## 16. 编译完成后用户如何使用

Wiki 编译不是一次性终点，而是持续使用的起点。用户可以做四件事：

### 16.1 ① 浏览 / 阅读 wiki（被动消费）

**入口**：左侧书记员面板 📋 → Wiki 导航树（index / overview / entities / concepts / topics / sources / queries）

**体验**：
- 点任一节点 → 编辑器主区域打开对应 md
- Wiki 页**就是普通 md 文件**，用编辑器全部能力查看/编辑/导出
- `[[链接]]` 可点 → 跳转
- 置信度标注可见：`[EXTRACTED]` vs `[INFERRED]`
- 反向引用区："提到 TA 的笔记"

### 16.2 ② 向书记员提问（主动查询，高频）

**统一入口：右侧 Chat 面板**。详见 §5.4。

- 入口：右上角 `🔍 问书记员` 按钮 / 侧边栏 💬 / `Ctrl+\`
- 单次问答：直接问 → 回答后 Esc 或 [+ 新对话]
- 多轮 / Agent 任务：继续追问即可
- 好答案 → `💾 保存到 Wiki` 结晶化 → `wiki/queries/<slug>.md`

### 16.3 ③ 基于 wiki 继续创作（反哺写作）

这是"编辑器 + wiki"协同最体现价值的场景：

- **`[[` 自动补全**：写作时输入 `[[` 弹出 wiki 页列表（类 Obsidian）
- **相关提示条**（默认关）：写作时底部静默显示相关 wiki 页
- **右键 AI + Wiki 上下文**：选中段落右键 → "基于 Wiki 改写"，自动带上相关 wiki 页做上下文
- **Chat 结果插入**：Chat 回复右下角 [📝 插入到当前文件] 按钮，写入光标位置

### 16.4 ④ 维护 wiki（保持新鲜，对齐 Karpathy 第三大操作）

- **增量整理**：书记员面板提示"N 篇笔记还没整理" → 一键更新（SHA256 对比只处理变化）
- **健康检查（Lint）**：矛盾 / 孤立页 / 断链 / 缺失索引，每项可"让 AI 修 / 自己改 / 忽略"
- **单文件重编译**：右键源文件 → "重新编译到 Wiki"

### 16.5 端到端示例（研究者的一天）

```
09:00  读新论文 → 写笔记 → 右键 AI "精简"
10:30  Chat 问 "DPO 的主要批评？" → [💾 保存到 Wiki]
14:00  写博客 → [[DPO]] 补全 → 右键"基于 Wiki 改写"
17:00  书记员提示"4 篇未整理" → 一键更新
18:00  健康检查 "2 处矛盾" → 标记演化记录
```

**核心体验原则**：
- Wiki **不是独立产品**，是编辑器的知识层
- Wiki 页 **就是 md 文件**，不是另一种格式
- 问答 **基于自己笔记**，不是外部 AI
- 好回答 **结晶化** 为新 wiki 页
- 维护 **提示驱动**，绝不偷偷跑
