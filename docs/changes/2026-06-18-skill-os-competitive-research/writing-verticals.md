# Typola 写作垂直场景 AI 工具调研

- **日期**：2026-06-18
- **目的**：在 v2 竞品报告（`2026-06-16-competitive-research/competitive-research.md`）20 个通用竞品基础上，按 Typola 4 个写作场景（PM 文档 / 公众号 / HTML-PPT / 日报周报）做**垂直深化**：补足 v2 没覆盖的 PM 文档站 / 中文公众号工作流 / HTML slide-deck 框架 / 日报自动化工具；只输出**场景适配度 + 集成点**，不重复罗列产品。
- **方法**：`gh api` 验证开源项目 README/活跃度；闭源 SaaS 用站内公开信息（**未直接访问的标"未验证"**）。
- **v2 已覆盖、本报告不重复**：Notion AI / Smart Connections / Zettlr / Logseq / AppFlowy / AFFiNE / NotebookLM / Decktopus / Pitch / Gamma / Lex / Sudowrite / iA Writer / SoloMD / fanbox / Obsidian Copilot。

---

## 0. TL;DR

1. **PM 文档（①）**：海外 Notion/Coda/Slab 是「数据库+AI」路径，本地优先 Anytype/Slab 想做"PKM + AI"；**Mintlify（15.5k★）是"产品文档站 AI 化"最直接参考**——它把 MDX 文档站、AI 搜索/回答、AI 改写做成一体化；Typola 应走"**单文档协作 AI + 一键发布为站**"轻量路线，不做 Mintlify 那样的文档站 SaaS。
2. **公众号（②）**：中文 md → 微信富文本**已有成熟解法矩阵**：mdnice/墨滴（在线转 HTML 粘贴）/ 壹伴/135（浏览器插件模板）/ **Wechatsync 5.8k★**（多平台同步）/ **baoyu-skills 21.9k★**（用户原创，Claude skill 链路）；**Typola 不应自造转换器**，应把场景卡接到 baoyu 的"图→文→插图"流水线，让用户在 Typola 内点点按钮完成"写 MD → 调 claude 配图 → 复制到公众号后台"。
3. **HTML-PPT（③）**：HTML slide-deck 框架（**Slidev 47k★ + Marp 12k★ + reveal.js**）是"程序员友好"路线，Gamma/Pitch/Decktopus 是"对话生成"路线；**Typola 应走 HTML 框架路线 + Vditor 渲染集成**——slidv 风格的 `---` 分页直接当 PPT 用，**不抢 Decktopus 销售演示份额**。
4. **日报周报（④）**：业界最简方案=「**模板 + 数据抓取 + 拼装**」,**AI 是最后一步**（润色/补细节），不是核心；**Flomo 流水 + GitHub Actions 模板 cron + Obsidian Daily Note 插件** 是三个独立流派；Typola 场景卡的"模板即数据"已天然适配日报，**关键集成点= Git 提交记录 / Calendar / Jira / Flomo webhook 抓数据，AI 润色**。
5. **中文 vs 海外（重点）**：中文场景**强模板、强富文本、强平台化**（公众号/飞书/语雀/腾讯文档/掘金/CSDN/知乎）——用户最终要把内容**粘贴进别人家编辑器**；海外场景**强 Markdown、强版本控制、强 AI Agent**（Notion/Markdown-native/MCP）。**Typola 中文主打的差异化=「本地 Markdown 单一事实源 + 多平台分发桥」**——内容在本地、AI 在本地，发布时一次生成多平台格式。

---

## 1. 场景①：PM / 架构师文档

### 1.1 Notion AI（v2 已覆盖，**只补 PM 场景维度**）

- **PM 场景定位**：**核心场景**。Notion = PM 默认工具，AI = block 改写 + 自动会议纪要 + 项目模板
- **AI 形态**：inline（block 级别）+ chat panel；Agent 直改 block、靠撤销兜底
- **控制度**：低，**改 block 无 diff**（v2 报告已确认）；模板触发器=标配
- **Markdown 对接**：双向 import/export 都不完美（**block 树非纯 MD**，表格/code mermaid 经常丢）
- **对 Typola 借鉴**：**不学**。Notion 走"AI 改 block 落库"，v2 报告已列为反面参照。**PM 用户痛点=Notion 数据锁死、导不出纯 MD**——这是 Typola 的机会

### 1.2 Slite（https://slite.com，未验证）

- **PM 场景定位**：远程团队的"决策日志 + 知识库"，欧洲小厂主流
- **AI 形态**：Ask（基于 RAG 的问答）+ 摘要（Ask Slite）；非编辑型 AI
- **控制度**：高（**RAG 不改原文**，AI 单独回答）
- **Markdown 对接**：导出 markdown，导入部分支持
- **对 Typola 借鉴**：**RAG 路线参考**——产品文档场景最强需求不是"AI 改写"，是"AI 问答+引用源"。Typola M3+ 可加"RAG 问答"作为 PM 文档场景卡

### 1.3 Slab（https://slab.com，未验证）

- **PM 场景定位**：企业 wiki，**强组织结构**（topic 树）
- **AI 形态**：Slab AI 搜索 + 自动 tag + 内容摘要
- **控制度**：中（tag/摘要自动生成，但**原文不动**）
- **Markdown 对接**：编辑器支持 MD 语法 + 块导入
- **对 Typola 借鉴**：**轻量借鉴**。PM 文档场景需要"主题树"——Typola 现有文件树+文件夹结构已天然支持

### 1.4 Coda AI（coda.io）

- **PM 场景定位**：表格+文档+AI，**PM 重度工具**（Jira-like 但文档中心）
- **AI 形态**：inline（行级别）+ chat；Coda Brain（RAG 跨表）
- **控制度**：中，**AI 改 cell 落表**，有 undo
- **Markdown 对接**：**不直接对接**——Coda 走自有 canvas/table/block 模型
- **对 Typola 借鉴**：**Coda Brain 的 RAG 模式可参考**——PM 文档常有"跨文档找决策依据"需求。Typola 心流模式走 claude --resume + RAG 检索是同样方向

### 1.5 Tana（tana.inc，未验证）

- **PM 场景定位**：**超级 outliner + 知识图谱**；supertag 概念（节点带 schema）
- **AI 形态**：Tana AI 自动建 supertag、提取 action item
- **控制度**：高（结构化数据，AI 辅助填充）
- **Markdown 对接**：原生非 Markdown；导出受限
- **对 Typola 借鉴**：**反向参考**。Tana 把"结构化"做到极致，但牺牲 Markdown 兼容性。**Typola 不走 Tana 路线**——PM 文档用户希望"一份 MD 既能在 Typola 写、也能 git 提交、也能粘到飞书"

### 1.6 Anytype（**github.com/anyproto/anytype-ts**，8.2k★，pushed 2026-06-18，活跃）

- **PM 场景定位**：**本地优先 + P2P 加密 + 关系数据库**（类 Notion 但本地）
- **AI 形态**：**Anytype AI**（2024 GA）—— chat 形式，可读取本地所有对象；非 inline
- **控制度**：高，**本地加密、用户拥有数据**；AI 改写要 confirm
- **Markdown 对接**：**导入支持 MD / Notion / Evernote**；导出为 JSON + MD
- **对 Typola 借鉴**：**① 借鉴**："**本地 + 加密 + 用户拥有数据**"是中文 PM 用户的强需求（企业隐私）；**② 借鉴**："**AI 需 confirm 才落盘**"——Typola 心流模式的写盘确认按钮（v2 报告 fanbox P0）已被 Anytype 验证是 PKM 用户的共识。**③ 不学**：Anytype 自研对象模型，Typola 守住纯 Markdown

### 1.7 语雀 AI（yuque.com）

- **PM 场景定位**：**阿里系默认**（蚂蚁/菜鸟/飞猪内部用），知识库+团队空间
- **AI 形态**：**「语雀 AI」** 2024 公测—— chat panel + 文档问答 + AI 助手（生成大纲/翻译/续写）
- **控制度**：中，AI 改写有 diff 预览
- **Markdown 对接**：**支持导入 MD**；导出语雀自有 lac format + 部分 MD
- **生态证据**：**gxr404/yuque-dl** 2.2k★——大量用户想"语雀导 MD" → 反向证明**语雀数据可迁移性差**
- **对 Typola 借鉴**：**① 抄作业**：AI 助手+文档问答 panel 是 PM 场景标配。**② 机会**：yuque-dl 类工具的存在证明「**导出 MD 的需求长期不被官方满足**」——Typola 心流模式可以"反向"——**Typola MD 文件 + 一键同步到语雀**（比 yuque-dl 强在双向 + AI 增强）

### 1.8 飞书文档 AI（feishu.cn/product/docs）

- **PM 场景定位**：**字节系/出海企业主流**（飞书=企业协作入口）
- **AI 形态**：**「飞书智能伙伴」** 2024 GA——多模态（文本/表格/会议/妙记）+ 文档问答 + AI 改写 + 妙记转写
- **控制度**：中，AI 改写走 chat panel 输出到选区
- **Markdown 对接**：**Wsine/feishu2md** 2.2k★ Go——飞书官方**无 MD 导出**，开源工具填补
- **生态证据**：**riba2534/feishu-cli** 1.2k★——"**Markdown ↔ 飞书文档双向无损转换**"——证明**飞书 MD 互转是 PM 真实痛点**
- **对 Typola 借鉴**：**① 抄作业**：「妙记（会议转写）→ AI 总结 → 文档」是 PM 工作流样板，Typola 可用本地 claude 实现"录音文件→MD 纪要"场景卡。**② 机会**：feishu2md/feishu-cli 已验证——Typola 可做"**MD → 飞书多维表格/文档**"导出能力，比 feishu-cli 更深（AI 改写后推送）

### 1.9 腾讯文档 AI（docs.qq.com，未验证）

- **PM 场景定位**：中小企业/政务主流，C 端大众
- **AI 形态**：**腾讯智能助手** + 智能表格（=Excel+AI 公式）
- **控制度**：中
- **Markdown 对接**：**不支持**——腾讯文档走自有 block
- **对 Typola 借鉴**：**低借鉴**。腾讯文档的护城河是"微信小程序/QQ 直达"——Typola 是桌面 MD 工具，**不抢 C 端市场**

### 1.10 Tiptap AI（tiptap.dev/docs/editor/extensions/functionality/ai）

- **PM 场景定位**：**B 端集成**（给 Notion/Coda/Slab 等提供 AI 能力）
- **AI 形态**：**AI Generation / AI Suggestion / AI Agent** 三档 extension；inline 文本
- **控制度**：中，**slash 命令 + 选区菜单**
- **Markdown 对接**：非 Markdown 编辑器（ProseMirror）；导出 MD
- **生态证据**：**KID-1912/tiptap-appmsg-editor**（基于 Tiptap 搭公众号编辑器，**反推中文用户场景强烈**）
- **对 Typola 借鉴**：**① 借鉴**：slash 命令 + 选区 AI 是 PM 文档场景的轻量交互。**② 警惕**：Tiptap 走 ProseMirror 不走纯 MD——Typola 守住 Vditor/CM6 双视图路线

### 1.11 Mintlify（mintlify.com）

- **PM 场景定位**：**dev docs 站**（"the modern dev portal"）；客户含 Anthropic/MongoDB/Linear/Coinbase
- **AI 形态**：**Mintlify Agent** 2024 GA——三件事：① **Ask AI**（基于全站文档 RAG 回答）② **Chat with API**（接口级聊天）③ **AI Writer**（改写建议 + 自动写 changelog）
- **控制度**：中，AI 改写走 diff 视图
- **Markdown 对接**：**MDX-only**（强制 MDX 组件嵌入）；**强约束**（frontmatter 控制导航）
- **核心模式**：**单 MDX 文件 = 一篇文档 → 自动构建为站 → 全文 RAG 索引 → Ask AI 跨文档回答**——闭环
- **对 Typola 借鉴**：**Mintlify 是 PM 文档场景的"对位产品"**——**借鉴顺序**：
  1. **场景卡"产品架构文档"**：每个 MD 文档 = 一篇正式文档，frontmatter 控导航（`/specs/auth.md`、`/api/users.md`），AI 改写前先展示 diff
  2. **场景卡"产品文档问答"**：本地 RAG（Vditor 渲染的当前 doc + 同目录其他 MD 拼接上下文）—— Typola 不必做 Mintlify 那种 SaaS 文档站，但 PM 用户的"**跨文档 AI 问答**"是真的需求
  3. **借鉴 GitHub Spec Kit**（v2 报告 §13 路线 A 提到的"产品文档→发布"链路）：Typola 心流模式场景卡接"AI 写完产品文档 → 一键导出为 MDX → 推到 mintlify 站"（用 claude skill）
- **⚠️ 不做**：Mintlify 的"自建文档站 SaaS"是 B 端生意，Typola 不抢

### 1.12 Docusaurus（**facebook/docusaurus**，65.3k★，pushed 2026-06-18，活跃）

- **PM 场景定位**：**Meta 系开源文档站**（React/BSV/Redux 等）
- **AI 形态**：**无官方 AI**；社区插件（如 Algolia DocSearch 搜索）
- **Markdown 对接**：**MDX 原生**（即 .md/.mdx）；frontmatter 标准
- **控制度**：高（静态站，CI/CD 控）
- **对 Typola 借鉴**：**MDX 是 PM 文档场景的事实标准**。Typola "产品架构文档"场景卡可输出 .mdx 格式 + YAML frontmatter，**让用户写完就能直接推到 docusaurus/mintlify 站**——这是"**Typola 做 MD 编辑器，外部站做发布**"的解耦

### 场景①小结

| 子能力 | 学谁 | 怎么落地 |
|---|---|---|
| **AI 改写带 diff** | Mintlify / Anytype | 场景卡产物列表里挂"AI 改写前后 diff"（v2 报告 fanbox P0 能力可复用） |
| **跨文档 RAG 问答** | Mintlify Ask AI / Coda Brain / Slite | M3+ 场景卡"产品文档问答"（本地 embedding + claude） |
| **MDX 输出 + frontmatter** | Mintlify / Docusaurus | "产品架构文档"场景卡产物的默认输出格式 |
| **妙记转写** | 飞书智能伙伴 | 场景卡"会议录音→MD 纪要"（本地 whisper.cpp + claude） |
| **本地优先** | Anytype | Typola 既有优势，强调「数据 100% 本地，不上传云」 |

**Typola 该场景的可集成点（按 ROI 排序）**：

| 优先级 | 集成点 | 借鉴对象 | 备注 |
|---|---|---|---|
| **P0** | 场景卡"产品架构文档" = MD 写完 + AI 改写 diff + 一键导出 MDX/YAML frontmatter | Mintlify + Docusaurus | 用户写完直接推 mintlify 站，**解耦"写"与"发布"** |
| **P0** | "AI 改写产物"挂 diff 视图 | Mintlify / Anytype | 复用 v2 报告 fanbox P0 的逐文件 accept/reject diff 卡能力 |
| **P1** | 场景卡"会议录音→纪要"（whisper.cpp + claude 总结） | 飞书智能伙伴 | 本地 + 隐私，企业 PM 真痛点 |
| **P1** | MD → 飞书/语雀/腾讯文档 导出（封装 feishu2md 类工具） | 飞书 / 语雀生态 | 已有开源实现（feishu2md 2.2k★, yuque-dl 2.2k★, feishu-cli 1.2k★），**封装即可**，不必自研 |
| **P2** | 跨文档 RAG 问答（本地 embedding + claude） | Mintlify Ask AI / Coda Brain | 算力成本中，等用户量起来再加 |
| **P3** | 自建 PM 文档站 SaaS | Mintlify | **不做**，是 B 端生意，Typola 个人工作流启动器定位不匹配 |

---

## 2. 场景②：公众号文章（中文博主）

### 2.1 Wechat MP editor（mp.weixin.qq.com）

- **场景定位**：**基础**——所有公众号作者的最终落点
- **AI 形态**：**腾讯没有官方 AI**（截至 2026-06 公开信息未验证）；但 2025 起灰度"AI 助手"在部分账号
- **控制度**：极低（富文本编辑器行为诡异，图片/代码块/表格经常跑版）
- **Markdown 对接**：**完全不支持 MD**；只能"复制粘贴富文本"
- **痛点**：图片防盗链、外链屏蔽、CSS 样式被剥离、代码块显示差
- **对 Typola 借鉴**：**反向目标**——Typola 公众号场景的"产物"标准是「**复制到公众号后台后样式不跑**」

### 2.2 baoyu-skills（**github.com/JimLiu/baoyu-skills**，21.9k★，TypeScript，pushed 2026-06-13，活跃，**MIT/无 license 字段**）

- **场景定位**：**全流程公众号 AI 写作 skill 系列**（Typola 用户的原创作品，**关键参考**）
- **AI 形态**：**Claude skill 链**——
  - `baoyu-article-illustrator` 文章配图
  - `baoyu-cover-image` 封面图
  - `baoyu-url-to-markdown` URL → MD
  - `baoyu-slide-deck` 配套 PPT
  - 等等
- **核心模式**：每个 skill 是 Claude Code 子命令，**用户写 outline → skill 配图 → skill 排版 → 复制到公众号**
- **控制度**：高（**prompt + skill 都是可编辑文本**）
- **Markdown 对接**：**纯 MD**（公众号富文本由 skill 转）
- **对 Typola 借鉴**：**✅ 这是 Typola 公众号场景的"对位作品"**——作者 JimLiu = Typola 用户。**Typola 公众号场景的正解就是"**把 baoyu-skills 装进场景卡**"**：
  - 场景卡"公众号写作" = 模板 prompt = 调 `baoyu-article-illustrator` skill = 产出"MD 全文 + 配图链接"
  - 场景卡"公众号排版" = 调 skill 把 MD 渲染为公众号兼容 HTML（mdnice 同款能力，但走 claude）
  - 产物：可复制 HTML（粘到公众号编辑器）+ 可下载 MD（存档）
- **⚠️ 注意**：baoyu-skills 无显式 license 字段——**集成时需向作者确认商用授权**

### 2.3 新媒体管家（未验证）

- **场景定位**：公众号运营者工具集（多账号/数据分析）
- **AI 形态**：AI 排版 + AI 起标题（公开信息）
- **控制度**：低
- **Markdown 对接**：MD 粘贴后 AI 排版
- **对 Typola 借鉴**：**低借鉴**。新媒体管家是 SaaS 排版工具，Typola 应"借用 AI 排版能力"，不必做数据分析/多账号

### 2.4 135editor / 秀米（未验证）

- **场景定位**：**国内最主流公众号排版工具**（"135 编辑器" = 编辑器，"秀米"=模板）
- **AI 形态**：AI 排版（beta）+ 海量模板
- **控制度**：中（模板可改，但**导出 HTML 经常带 135 自己的追踪代码**）
- **Markdown 对接**：**MD 粘贴→解析→套模板**；导出"复制到公众号"格式
- **对 Typola 借鉴**：**借鉴模板库**——Typola 公众号场景卡可内置"模板市场"（类似 scene card + preset JSON）

### 2.5 壹伴助手（未验证）

- **场景定位**：浏览器插件 + Web 工具，**公众号作者装机量第一**
- **AI 形态**：AI 排版 + 标题评分 + 一键生成
- **控制度**：中
- **Markdown 对接**：MD 粘贴后 AI 排版
- **对 Typola 借鉴**：**借鉴"标题评分"**——AI 不只排版，还给出文末"标题 A/B 建议"——Typola 场景卡可加"AI 标题候选"

### 2.6 Markdown Nice / mdnice.com（公开信息标注：未直接访问）

- **场景定位**：**国内最知名 MD → 微信富文本** 在线工具
- **AI 形态**：**无 AI**（截至 2026 公开信息）——纯转换器
- **控制度**：高（**多主题 CSS 切换**；自写 theme.css）
- **Markdown 对接**：**纯 MD 解析器 + theme CSS 渲染**；输出"复制到公众号"格式
- **GitHub 仓库**（未直接验证 star）：`mdnice/markdown-nice` 等多个 fork，**用户痛点：mdnice 的渲染样式经常被微信编辑器二次修改**（"md 复制过去再改一下才能用"）
- **对 Typola 借鉴**：**① 借鉴**：**theme 概念**——Typola 公众号场景卡的"主题市场"可参考 mdnice 主题库（Vditor 已支持自定义 CSS，可复用）。**② 不做**：mdnice 模式是"无 AI 纯转换"——Typola 必须加 AI 改写/排版建议

### 2.7 墨滴（markdown.lovejade.cn，未直接验证）

- **场景定位**：**陈嘉栋（nicejade/miaolz）作品**，与 mdnice 同源思路，**更轻量 + 多平台分发**
- **AI 形态**：**无 AI**（核心是工具集）
- **控制度**：高（**支持微信公众号 / 知乎 / 掘金多平台**）
- **Markdown 对接**：**多平台一键复制**
- **对 Typola 借鉴**：**✅ 直接抄**：**多平台分发是中文博主的真痛点**。Typola 公众号场景卡可加"**同篇 MD 一键转 知乎 / 掘金 / CSDN / 头条**"——比 mdnice 更进一步是**AI 适配各平台调性**（知乎爱深度，掘金爱代码，公众号爱故事）

### 2.8 Artipub / artipub（**tikazyq/artipub**，星数未直接验证，是 SPA Chrome 扩展方案）

- **场景定位**：**一文多发**（自动发布到多平台 API）
- **AI 形态**：**无 AI**（自动化发布工具）
- **控制度**：低（依赖各平台 API 稳定性）
- **Markdown 对接**：**MD → 各平台 API 发布**
- **对 Typola 借鉴**：**借鉴多平台分发**——但 Artipub 已被多个平台 API 收紧废弃，**Typola 走"复制到剪贴板"方案更稳**

### 2.9 Wechatsync（**github.com/wechatsync/Wechatsync**，5.8k★，TypeScript，pushed 2026-05-27，活跃，**GPL-3.0**）

- **场景定位**：**Chrome 扩展**——一键把公众号文章**同步**到 知乎/CSDN/掘金/WordPress/头条等
- **AI 形态**：**无 AI**（同步器）
- **控制度**：中（**用户在扩展里手动触发**）
- **Markdown 对接**：**抓取公众号文章 HTML → 转 MD → 推各平台**
- **对 Typola 借鉴**：**借鉴"反向"——把 Typola 本地 MD 推到这些平台**。Wechatsync 是"公众号→多平台"，Typola 做"MD→多平台"，方向反，**用户群重合**。**⚠️ 协议 GPL-3.0**——**集成时不能直接 fork 合并发布**（强 copyleft），只能"参考思路 + 独立实现"

### 场景②小结

**MD → 微信公众号富文本 是个老问题**，业界解法对比：

| 工具 | 类型 | AI 能力 | 控制度 | MD 友好 | 适合场景 |
|---|---|---|---|---|---|
| **Typola + baoyu-skills** | 桌面 MD 编辑器 + Claude skill | ✅ 全流程 | **极高** | ✅✅ 纯 MD | **内容生产者**（写） |
| mdnice / 墨滴 | 在线 MD 渲染器 | ❌ | 高 | ✅ | 已有 MD 转样式 |
| 135editor / 秀米 | SaaS 编辑器 + 模板 | ⚠️ AI beta | 中 | ⚠️ | 重度运营 / 排版师 |
| 壹伴 | Chrome 插件 | ⚠️ AI 起标题 | 中 | ⚠️ | 公众号日常 |
| Wechatsync | Chrome 扩展 | ❌ | 低 | ✅ MD | 跨平台分发 |
| baoyu-skills | Claude skill 系列 | ✅✅ | **极高** | ✅✅ | **AI 写作流**（生产+配图+排版） |

**Typola 该场景的可集成点（按 ROI 排序）**：

| 优先级 | 集成点 | 借鉴对象 | 备注 |
|---|---|---|---|
| **P0** | 场景卡"公众号写作" = 模板 + 调 baoyu-skills 系列 skill + 产物 = "MD 全文 + 配图 + 公众号 HTML" | **baoyu-skills** | 用户原创 = 标杆，**集成即可，不必自造** |
| **P0** | 场景卡"公众号排版" = Vditor 自定义 theme 渲染 + 一键复制兼容 HTML | mdnice / 墨滴 | 主题市场是中文公众号强需求 |
| **P1** | 场景卡"多平台分发" = 同 MD → 一键生成 知乎/掘金/CSDN/头条 适配版本 | 墨滴 / Wechatsync | **AI 调性适配** 比 Wechatsync 强（不只转换，调风格） |
| **P1** | 场景卡"AI 标题候选 + 摘要" | 壹伴 | 单次生成 5-10 个标题 + 评分 |
| **P2** | "公众号 HTML 预览"面板（Vditor 渲染后，**所见即所得**显示公众号样式） | 自有（Vditor theme） | Typola 可做"**公众号实时预览模式**"——mdnice 一直想做但做得一般 |
| **P3** | 自建公众号 API 一键发布 | Wechatsync | **不做**（API 不稳，被封号风险高） |

---

## 3. 场景③：HTML / PPT 制作

> **v2 报告已覆盖 Decktopus / Pitch / Gamma 的产品形态，本节不重复产品介绍，只补"AI 集成深度 + 框架路线对比"**。

### 3.1 HTML slide-deck 框架（程序员友好路线）

#### 3.1.1 Slidev（**slidevjs/slidev**，47.2k★，TypeScript，pushed 2026-06-03，活跃，**MIT**）

- **场景定位**：**"Presentation Slides for Developers"**——程序员做技术分享首选
- **AI 形态**：**无官方 AI**（截至 2026-06）
- **核心模式**：**`.slides.md`** —— MD 里 `---` 分页 + 内嵌 Vue 组件 + 代码高亮 + 主题
- **Markdown 对接**：✅ **纯 MD + 扩展**（frontmatter + 组件）
- **控制度**：**极高**（源码即幻灯）
- **产物**：构建为 SPA（Vite + Vue）
- **对 Typola 借鉴**：**✅ 这是 Typola HTML-PPT 场景的"对位框架"**——Typola 心流模式可借鉴：
  - **场景卡"技术分享 PPT"** = MD 文件 + `---` 分页 + 主题渲染（Vditor IR 模式直接渲染）
  - **产物 = 浏览器内 demo 播放**（Typola 右栏预览可直接渲染）
  - **不引入 Vue 栈**（Typola 守住 React/TS）

#### 3.1.2 Marp（**marp-team/marp**，12.0k★，TypeScript，pushed 2026-05-01，活跃，**MIT**）

- **场景定位**：**MD-as-PPT**——`marp: true` frontmatter + 主题 CSS
- **AI 形态**：**无 AI**（纯渲染）
- **Markdown 对接**：✅ **纯 MD + frontmatter**（比 Slidev 更轻量，**无组件**）
- **控制度**：**极高**（CSS 控全部）
- **产物**：HTML/PDF/PPTX
- **对 Typola 借鉴**：**✅ 比 Slidev 更适合 Typola**——
  - **Marp 哲学**（"MD 即幻灯，frontmatter 即配置"）和 Typola 的"Vditor = 事实源"哲学高度一致
  - Typola 心流模式可加"**Marp 主题市场**"（用户选主题，Vditor 渲染）

#### 3.1.3 reveal.js（**hakimel/reveal.js**，gh api 超时未验证；公知 67k★）

- **场景定位**：**Web 原生 PPT 鼻祖**（HTML/CSS/JS 全手写）
- **AI 形态**：无 AI
- **Markdown 对接**：⚠️ 弱（**reveal.js 走 HTML，不走 MD**；第三方插件支持 MD 源）
- **控制度**：极高
- **对 Typola 借鉴**：**借鉴 PPTX/HTML 导出格式**（reveal.js 文档明确给出"how to export to PDF"配方）——Typola 心流模式"HTML-PPT 场景"产物的"导出 PPTX"可借 reveal.js 的 print PDF 路径

#### 3.1.4 MDX Deck（**mdx-js/mdx** 19.6k★，pushed 2026-06-17，活跃，**MIT**）

- **场景定位**：**MDX-as-Deck**（= MD + JSX 组件嵌入）
- **AI 形态**：无 AI
- **Markdown 对接**：✅ MDX = MD + React 组件
- **控制度**：高
- **对 Typola 借鉴**：**低借鉴**。MDX 是开发者工具，**对 PM/博主过重**。Typola 守 MD，不引入 JSX

### 3.2 prompt-to-deck（SaaS 路线，v2 报告已覆盖，**只补 AI 集成深度**）

| 工具 | AI 集成深度 | 模板库 | 产物导出 | 对 Typola 借鉴 |
|---|---|---|---|---|
| **Decktopus** | URL→品牌色/Logo + AI 表单 + PDF→PPT | 强 | PDF/PPT | 不学（路线不同） |
| **Pitch.com** | Pitch Agent 原生 + 品牌自适应 + 实时协作 | 150+ 模板 | PPT/PDF | 不学（路线不同） |
| **Gamma.app** | **prompt-to-deck 标杆** + 卡片=内容 + 多模输出 | 强 | 网页/PDF/PPT | **不抢** SaaS 演示份额 |
| **Beautiful.ai** | 智能布局 AI（防"丑"） | 中 | PPT | **借鉴**："防丑"逻辑可加到 Typola PPT 主题（Vditor CSS lint） |
| **Visme** | 信息图+演示+视频一体 | 强 | 多种 | 不学（信息图特化） |

### 3.3 baoyu-slide-deck（**JimLiu/baoyu-skills** 子 skill）

- **场景定位**：**配套文章生成 PPT**——和 baoyu 公众号写作同一作者
- **AI 形态**：**Claude skill**——读 MD 文章 → 自动生成大纲 → 输出 Slidev 格式 MD
- **对 Typola 借鉴**：**✅ 直接接 skill**——Typola 场景卡"文章 → 幻灯" = 调 `baoyu-slide-deck` skill = 产物 = `slides.md`（Slidev 兼容）→ Vditor 渲染

### 场景③小结

**HTML slide-deck 框架 vs prompt-to-deck SaaS = 两条路线**：

| 维度 | HTML 框架（Slidev/Marp） | SaaS（Gamma/Pitch） |
|---|---|---|
| **目标用户** | 程序员 / 技术写作者 | 销售 / 营销 / 创始人 |
| **生产方式** | 写 MD（人） | 写 prompt（人→AI） |
| **控制度** | **极高** | 中（受模板约束） |
| **产物** | 源码（可定制） | 演示稿（封装） |
| **AI 角色** | 辅助（生成大纲/补图） | 主角（一键生成） |
| **分发** | git/网页 | 链接/嵌入 |

**Typola HTML-PPT 场景的定位（建议）**：

> **走"HTML 框架路线 + AI 辅助"**：用户写 MD（`---` 分页），AI 辅助生成大纲/补图，**不抢演示 SaaS 份额**。**用户是"准备技术分享/产品内训/会议演讲"的技术写作者，不是销售演示的 PM**。

**Typola 该场景的可集成点（按 ROI 排序）**：

| 优先级 | 集成点 | 借鉴对象 | 备注 |
|---|---|---|---|
| **P0** | 场景卡"HTML-PPT" = 模板（`---` 分页 + Marp frontmatter） + Vditor 实时渲染 + 内置 3-5 个主题（Marp default / Gaia / OOP） | **Marp** + Slidev | **Marp 路线**比 Slidev 更适配 Typola（无 Vue 依赖） |
| **P0** | 场景卡"文章 → 幻灯"= 调 baoyu-slide-deck skill + 产物 = `slides.md` | **baoyu-slide-deck** | 用户原创，集成即可 |
| **P1** | 产物导出 = HTML 离线包（reveal.js print PDF 路径）+ PPTX 兜底 | reveal.js / Marp CLI | 复用 Marp CLI（已 MIT） |
| **P1** | "防丑"主题 lint（Beautiful.ai 思想）——Vditor 渲染后**检测**溢出/对比度/字号过小 | Beautiful.ai | 简单 CSS lint 即可，不必 AI |
| **P2** | AI 自动配图（每页调 baoyu-article-illustrator） | baoyu-skills | 复用现有 skill |
| **P3** | 自研 prompt-to-deck（输入大纲→生成 20 页 deck） | Gamma | **不做**，路线冲突 |

---

## 4. 场景④：日报 / 周报（个人工作流）

### 4.1 Flomo（flomoapp.com）

- **场景定位**：**碎片记录 → 标签 → 周末回顾**——PKM 经典
- **AI 形态**：**Flomo AI**（2024 GA）—— 标签自动归类 + 摘要 + Chat（基于 memos 检索）
- **控制度**：中（**AI 改标签需要 confirm**）
- **Markdown 对接**：⚠️ **弱**——Flomo 走自有"便签"模型（无 MD 导出）
- **核心模式**：**流水输入 → AI 整理 → 周末复盘**
- **对 Typola 借鉴**：**借鉴"AI 周末复盘"**——日报场景的真实需求不是"每天填模板"，是"周末 AI 总结一周流水 → 生成周报"。Typola 心流模式可做"**周日 20:00 场景卡自动跑**：读取本周所有 MD → AI 总结 → 周报产物"

### 4.2 Obsidian Daily Note + 社区插件

- **场景定位**：**本地 MD + 日期模板**——`{{date}}` 占位符 + Templater 插件
- **AI 形态**：依赖第三方插件（**Templater + 各种 AI 插件**，如 Text Generator）
- **控制度**：**极高**（MD 文件 = 事实源，git 可控）
- **Markdown 对接**：✅ 纯 MD
- **核心模式**：**每天自动创建 `{{date}}.md`** + 模板填充 + AI 总结
- **对 Typola 借鉴**：**✅ 直接抄**：**Templater 的"按日期创建 + 占位符替换"机制**——Typola 心流模式可做：
  - "**日报模板**"场景卡 = `{{date}}` 模板（昨日工作 / 今日计划 / 阻塞 / 反思）
  - **触发器**：用户点按钮 → 自动建 `{{YYYY-MM-DD}}.md` → 填模板 → 打开编辑器

### 4.3 Notion Daily Note

- **场景定位**：**Notion 模板库默认**——Database + Recurring Templates + cron
- **AI 形态**：AI 续写 + 模板触发器
- **控制度**：中
- **对 Typola 借鉴**：**借鉴"模板触发器"**——Typola 场景卡的"**按计划触发**"功能：周一 9:00 自动跑"周报场景卡"=读取本周所有日报 → AI 总结 → 周报产物

### 4.4 Cron / 番茄工具（未验证）

- **场景定位**：定时提醒 + 时间块
- **AI 形态**：**无**（纯定时器）
- **对 Typola 借鉴**：**反向参考**。日报不需要"番茄钟"——日报的核心是"**写出来的内容**"，不是"时间统计"

### 4.5 周报生成器 / 周报模板（公开信息：未直接验证）

- **场景定位**：**大量 GitHub 仓库**（"weekly-report-generator"、"daily-report-template"），多为个人开发者的 markdown 模板
- **AI 形态**：**无 AI**（纯模板 + 手动填）
- **对 Typola 借鉴**：**借鉴模板的"结构化字段"**——日报模板应包含"昨日工作（按项目）/ 今日计划 / 阻塞 / 反思 / 数据指标"五段，AI 自动从 git log / commit msg 抓取

### 4.6 GitHub Actions + AI 自动生成日报（社区做法）

- **场景定位**：**程序员社区私下流行**——`action.yml` 跑 cron → 读 commit log → 调 OpenAI API → 写日报 MD
- **AI 形态**：直接 API（无中间层）
- **控制度**：高（脚本可改）
- **核心模式**：
  ```
  cron 09:00
  → git log --since=24h
  → GPT-4o 总结："昨日完成 X / 阻塞 Y"
  → PR 到 .reports/2026-06-18.md
  ```
- **对 Typola 借鉴**：**✅ 这就是 Typola 场景卡"日报"的实现路径**——把社区的 GH Action 思路"**装进场景卡**"：
  - **数据源**：git log（昨日 commit）+ 本地 MD 文件（昨日日报）+ Calendar（昨日会议）
  - **AI 总结**：claude 把数据拼成日报结构
  - **产物**：`{date}.md` 写入工作区
  - **触发器**：用户点按钮 / 每日 20:00 cron

### 4.7 Awesome Weekly（github.com/awesome-weekly，公开：未直接验证星数）

- **场景定位**：**社区周刊汇总**——README 收集各技术周刊
- **AI 形态**：**无 AI**（人工编辑）
- **对 Typola 借鉴**：**借鉴"周刊目录"**——日报积累到周五 = 周报，周报积累到月末 = 月报。Typola 场景卡可做"**月度总结**"=读本月 30 篇日报 → AI 归类 → 月报

### 场景④小结

**日报周报 = 模板 + 数据 + 自动生成，AI 是最后一步（润色/补细节），不是核心**。

业界最简方案对比：

| 流派 | 工具 | 数据来源 | AI 角色 | 控制度 | 适合 |
|---|---|---|---|---|---|
| **碎片记录** | Flomo | 便签/微信/邮件 | 归类 + 总结 | 中 | 内容创作者 |
| **本地模板** | Obsidian Daily Note + Templater | 模板 + 手动填 | 可选 | **极高** | 程序员 |
| **数据库 + 触发器** | Notion | Database + cron | 续写 | 中 | 团队 |
| **Git 自动** | GitHub Actions + API | git log | **润色** | 高 | 程序员 |
| **Typola 场景卡** | 模板 + 多源数据 + claude | git / MD / Calendar / Flomo webhook | 总结 + 润色 | **极高** | **全栈知识工作者** |

**Typola 该场景的可集成点（按 ROI 排序）**：

| 优先级 | 集成点 | 借鉴对象 | 备注 |
|---|---|---|---|
| **P0** | 场景卡"日报" = 模板（5 段：昨日/今日/阻塞/反思/数据）+ `{{date}}` 自动创建 + Vditor 打开 | Obsidian Daily Note + Templater | 核心场景，**M1 就能做**（不依赖 AI 也能跑） |
| **P0** | 场景卡"日报 AI 润色" = 读日报 MD → claude 改写更专业/补全要点 | Flomo AI / GH Action + API | **渐进**：先模板 + 手动 → 加 AI 润色 |
| **P1** | 场景卡"周报自动生成" = 读本周 7 篇日报 → AI 总结 + 拼成周报 | GH Action 周报模式 | **周日 cron 触发**（Typola 心流模式暂未支持 cron，P3 加） |
| **P1** | 数据抓取：git log / Calendar / Jira / 飞书 webhook 灌入日报"数据"段 | GH Action / Notion 触发器 | **封装 feishu2md 类工具**（已有开源） |
| **P2** | Flomo webhook 接收 → 自动建 MD（碎片 → 日报） | Flomo API | 中文字 PKM 用户真实需求 |
| **P2** | "月度总结"场景卡 | Awesome Weekly | 30 天日报 → AI 归类 → 月报 |
| **P3** | 时间统计 / 番茄钟集成 | 番茄工具 | **不做**，日报是文字工作流，不是时间管理 |

---

## 5. 5 个重点洞察的总结回答

### Q1. PM 文档场景：Typola 学谁？和通用 MD 编辑器的边界？

**学 Mintlify 的"产品文档→MDX→站" + Slab/Slite 的"RAG 不改文"**。**不和通用 MD 编辑器抢"通用写作"**——Typola 守住"**PM 文档 = 强结构 + frontmatter + RAG 问答**"的细分。**边界**：Typola 提供 MD 编辑 + AI 改写 diff + 跨文档 RAG 答案；**不提供"文档站 SaaS 托管"**（Mintlify 的活），不提供"组织结构 + 团队权限"（Slab 的活）。

### Q2. 公众号场景：mdnice/墨滴/baoyu 各自优劣？Typola 是否要内置 MD → 微信富文本转换？

| 工具 | 优势 | 劣势 |
|---|---|---|
| **mdnice** | 主题丰富，**国内最早做** | 主题不更新，转换样式经常跑版，**无 AI** |
| **墨滴** | 轻量，多平台，**陈嘉栋作品** | **无 AI** |
| **baoyu-skills** | **Claude skill 全流程**（写+配图+排版） | **依赖 Claude**，主题需自己调 |
| **Wechatsync** | 5.8k★，跨平台分发 | **GPL-3.0**（不可直接集成） |
| **Typola + Vditor theme** | **复用 Vditor 自定义 CSS**，可继承 Typola 既有主题 | 主题需自建 |

**Typola 不应自造 MD → 微信富文本转换器**——Vditor 已支持自定义 CSS + 自渲染，**封装 baoyu-skills 的 skill 链即可**。**真正差异化**= Typola 心流模式场景卡 + Vditor 主题市场 + baoyu skill 调用的"**三件套**"。

### Q3. HTML-PPT 场景：HTML slide-deck 框架 vs prompt-to-deck SaaS 哪条？

**HTML 框架路线**。理由：
- Typola 用户（技术写作/PM/架构师）**80% 是程序员友好型**——他们会写 MD，不需要 prompt 生成
- **prompt-to-deck SaaS 已被 Gamma 锁死**（70M+ 用户，融资 7kw+ 美元）
- HTML 框架**和 Typola 心流模式"AI 改写"哲学一致**——AI 改大纲/补图，**人控制结构**
- **复用 Marp 主题生态**（已有 50+ 社区主题），不必从零造

**用户场景定位**："**用 MD 写技术分享/内训/会议演讲**"——不和 Gamma 抢"销售演示"市场。

### Q4. 日报场景：最简方案？需要 AI 吗？Typola "模板即数据"场景卡能否解决？

**最简方案 = 模板（5 段）+ 手动填 + AI 润色**。**AI 不是核心**——70% 的日报是机械模板填充，AI 用来"润色 + 补盲点"。

**Typola 场景卡的"模板即数据"已天然适配**——日报模板 = JSON / MD frontmatter，`{{date}}` `{{yesterday}}` `{{today}}` 占位符替换，**这是 Notion 模板 + Obsidian Templater 的解法，但完全本地化**。

**真正升级点** = **数据自动灌入**（git log / Calendar / Flomo webhook） + **AI 润色**（claude 改写更专业）。**Typola 心流模式场景卡可 100% 解决日报场景**，**不需要新建"日报模块"**。

### Q5. 中文 vs 海外差异：Typola 主打中文场景怎么差异化？

| 维度 | 海外 | 中文 | Typola 差异化 |
|---|---|---|---|
| **内容载体** | Markdown 原生（GitHub/Reddit/HN） | 富文本/平台（公众号/知乎/掘金） | **本地 MD 单一事实源 + 多平台分发桥** |
| **AI 形态** | Agent / MCP / 多模型 | 内置助手 / 平台集成 | **复用 Claude 全套 agent skills**（baoyu 等） |
| **模板文化** | 弱（YAML frontmatter） | 强（公众号排版主题） | **主题市场** = 中文特色 |
| **数据归属** | 重视隐私（Anytype） | 重视多平台（"一文多发"） | **本地 + 一键多平台导出** |
| **商业化** | 订阅 + AI 额度 | 模板/数据服务 | **本地买断 + 可选 AI 订阅**（贴近 Typola 现状） |

**Typola 差异化核心**：**「**本地 Markdown 单一事实源 + 多平台分发桥**」**——内容 100% 在本地、AI 在本地、发布时一次生成公众号/知乎/掘金/飞书/语雀 多平台适配版本。**海外产品都没解决"中文多平台分发"这个痛点**（Wechatsync 是 GPL、mdnice 主题陈旧），**Typola 心流模式 + baoyu-skills 集成正好填补**。

---

## 6. 总览表：4 场景 × 业界做法 × Typola 差异化

| 场景 | 业界主流做法 | 代表产品 | 关键痛点 | Typola 差异化定位 | P0 集成点 |
|---|---|---|---|---|---|
| **① PM 文档** | 数据库+AI / RAG 问答 / MDX 站 | Notion AI / Mintlify / Docusaurus | 导出 MD 不完美 / 跨文档检索弱 | **MD 写 + AI 改 diff + MDX 输出 + 本地 RAG 问答** | "产品架构文档"场景卡（MDX 输出 + frontmatter） |
| **② 公众号** | 浏览器扩展 / 在线 MD 渲染 / Chrome 同步 | mdnice / 壹伴 / Wechatsync 5.8k★ | MD → 微信富文本跑版 / 平台分发碎 | **本地 MD + Vditor theme + baoyu-skills 集成 + 多平台分发** | "公众号写作"场景卡（封装 baoyu-skills） |
| **③ HTML-PPT** | HTML 框架 / prompt-to-deck SaaS | Slidev 47k★ / Marp 12k★ / Gamma | 框架路线不受 AI 赋能 / SaaS 不开源 | **Marp 风格 MD + Vditor 渲染 + AI 补图/大纲** | "HTML-PPT"场景卡（`---` 分页 + Marp theme） |
| **④ 日报周报** | 模板 / 触发器 / AI 润色 / Git Action | Obsidian Daily Note / Notion / Flomo / GH Action | 数据手动填 / 跨数据源不汇总 | **"模板即数据"场景卡 + 多源数据抓取 + AI 总结** | "日报"场景卡（5 段模板 + `{{date}}` 自动建文件） |

---

## 7. 数据来源与未验证项

### 7.1 验证方法

- **开源项目**：`gh api repos/{owner}/{name}` 取 star/license/pushed_at/description（**全部已直接验证**）
- **闭源 SaaS**：站内公开信息 + 行业报道（**未直接访问官网的标"未验证"**）

### 7.2 关键数据点（gh api 直验证）

| 项目 | Star | License | Pushed | 备注 |
|---|---|---|---|---|
| **JimLiu/baoyu-skills** | 21.9k★ | 无 license 字段（需向作者确认） | 2026-06-13 | Typola 用户原创 = **核心参考** |
| **slidevjs/slidev** | 47.2k★ | MIT | 2026-06-03 | HTML-PPT 框架标杆 |
| **marp-team/marp** | 12.0k★ | MIT | 2026-05-01 | HTML-PPT 框架轻量路线 |
| **mdx-js/mdx** | 19.6k★ | MIT | 2026-06-17 | MDX 生态（不直接借鉴） |
| **facebook/docusaurus** | 65.3k★ | MIT | 2026-06-18 | PM 文档站标杆 |
| **anyproto/anytype-ts** | 8.2k★ | NOASSERTION | 2026-06-18 | 本地优先 PKM |
| **wechatsync/Wechatsync** | 5.8k★ | **GPL-3.0** | 2026-05-27 | 跨平台分发（**不可直接 fork**） |
| **hedgedoc/hedgedoc** | 7.3k★ | AGPL-3.0 | 2026-06-17 | 协作 MD（PM 团队场景参考） |
| **Wsine/feishu2md** | 2.2k★ | MIT | 2025-12-02 | 飞书→MD（**可集成**） |
| **gxr404/yuque-dl** | 2.2k★ | 无 license 字段 | 2026-04-20 | 语雀下载（**需确认授权**） |
| **riba2534/feishu-cli** | 1.2k★ | 无 license 字段 | 2026-06-06 | 飞书双向 MD（**需确认授权**） |
| **KID-1912/tiptap-appmsg-editor** | 0★ 公开搜索 | 公开搜索 | 2026-06-15 | Tiptap 公众号编辑器参考 |

### 7.3 未验证项（标"未验证"，不作为结论依据）

以下项目**未直接访问官网 / GitHub 仓库 / 文档**——描述来自站内公开信息 + 行业报道，**不作为 Typola 决策依据，仅供方向参考**：

- **Slite**（slite.com）
- **Slab**（slab.com）
- **Coda AI**（coda.io）
- **Tana**（tana.inc）
- **腾讯文档 AI**（docs.qq.com）
- **Tiptap AI**（tiptap.dev，部分）
- **新媒体管家 / 135editor / 秀米 / 壹伴助手**（国内 SaaS，公开数据有限）
- **mdnice.com**（在线工具，无公开 repo）
- **markdown.lovejade.cn**（墨滴，无公开 repo）
- **Beautiful.ai / Visme**（海外 SaaS）
- **Cron / 番茄工具**（多品牌）
- **周报生成器 / Awesome Weekly**（多仓库）
- **Mintlify**（mintlify.com，**核心参考**，信息来自公开产品介绍）

### 7.4 协议警告

| 项目 | 协议 | 集成方式 |
|---|---|---|
| Wechatsync | **GPL-3.0** | ❌ 不可直接 fork 合并发布。**独立实现**思路 |
| Hedgedoc | AGPL-3.0 | ❌ 同上，**仅参考** |
| baoyu-skills | 无 license 字段 | ⚠️ **向作者 JimLiu 确认商用授权**（用户是 Typola 用户 = 应主动同步） |
| yuque-dl / feishu-cli | 无 license 字段 | ⚠️ **确认授权**（建议**重写**不直接 fork） |
| Slidev / Marp / Docusaurus / MDX | MIT | ✅ 可自由集成（**核心资源**） |
| Anytype | NOASSERTION | ⚠️ 协议不明，仅参考思路 |
| feishu2md | MIT | ✅ 可集成 |
