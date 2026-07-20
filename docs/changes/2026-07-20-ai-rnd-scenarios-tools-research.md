# Typola AI 辅助研发分享补充：典型场景与工具链核验

> 调研日期：2026-07-20
> 范围：`quzhi-ai/unknowns-first` 原始仓库、Typola 仓库产物，以及当前可读取的 Codex 本地会话记录。
> 判定原则：只有“仓库产物”或“会话中显式加载 Skill / 调用工具”才记为**实际使用**；技能目录在系统提示中出现，不等于该项目使用过它。

## 1. 先给分享的主结论

不要把 AI 技能列表当作工作流。Typola 更可复制的链路是：

```text
高影响或模糊问题
  → Unknowns First 诊断
  → 产品/架构决策与短计划
  → 一手调研 + Spike
  → 最小实现 + 定向测试
  → 视觉/对抗审查
  → 文档、测试、提交和发布证据
```

同一个阶段只用解决当前不确定性的最少工具；结果必须回到仓库（Brief、plan、spec、测试、变更说明），不能只留在聊天记录里。

## 2. Unknowns First：它在流程中做什么、不做什么

### 定位

`unknowns-first` 是复杂、模糊或高影响任务的**执行前诊断器**：先识别哪些未知会改变方向、质量门槛、交付物或实施路径，再决定是否开始执行。它不是方案设计器、实现器，也不是把所有任务都变成访谈。[项目 README](https://raw.githubusercontent.com/quzhi-ai/unknowns-first/main/README.md)

在 Typola 流程中，它应位于“用户愿望 → 技术方案”之间：

```text
需求/反馈
  → Unknowns First：确认问题、成功标准、关键未知
  → office-hours / brainstorm / grilling / plan review：形成或挑战方案
  → to-spec / plan：形成可交接的工程边界
  → 实现与验证
```

### 输入、输出与交接

完整模式先基于用户任务给出任务复述、用户起点、四类未知、任务层级、所需专家视角、当前成功标准、所需参考物与关键未知，随后提出 3–5 个聚焦问题，**必须暂停等待用户确认**。其 `lite` 模式只保留复述、成功标准、关键未知和 1–3 问，适合轻量但仍有歧义的任务。[原始 `SKILL.md`](https://raw.githubusercontent.com/quzhi-ai/unknowns-first/main/skill/unknowns-first/SKILL.md)

确认后，交接物不应是一段“我懂了”的聊天摘要，而应是可供下一环节使用的任务卡：

```md
已确认目标：
成功标准：
不变量 / 范围外：
关键未知及已作决定：
待验证假设：
建议下一步（调研 / spike / plan / 实现）：
```

长任务执行中，若新事实改变任务层级、专家角色、成功标准或交付物，应该记录初始假设、发现、影响和决策依据，并暂停请求确认；这正是该 Skill 提供的 Implementation Notes 模板要解决的“执行漂移”。[Implementation Notes 模板](https://raw.githubusercontent.com/quzhi-ai/unknowns-first/main/skill/unknowns-first/references/implementation-notes-template.md)

### 使用边界

| 应运行 full | 用 lite 或跳过 |
| --- | --- |
| 跨端/架构迁移、AI 工作台、外部依赖或许可证决策、难以回滚的产品判断 | 明确的局部 bug、翻译、格式化、摘要、已有验收的单文件小改动、用户要求立即执行 |

它的反模式是“为了显得严谨而过度问诊”。原仓库的测试案例明确涵盖：直接开写、泛泛提问、把表面任务误认成真正专家任务，以及简单任务过度诊断。[测试与反模式](https://raw.githubusercontent.com/quzhi-ai/unknowns-first/main/skill/unknowns-first/references/test-cases.md)

## 3. Typola 已核验的 Skill / 工具状态

### A. 有明确实际使用证据：可作为真实案例讲述

| 能力 | 典型场景 | 状态与本地证据 | 分享中应怎样讲 |
| --- | --- | --- |
| `research` | 竞品、依赖、许可证、实现路径核验 | **实际使用**。已留下多份带来源的调研；例如 [CM6 表格组件调研](/D:/暂存/Typola/docs/changes/2026-07-14-cm6-table-components-research.md) 与 [AI 辅助研发行业基线](/D:/暂存/Typola/docs/changes/2026-07-19-ai-assisted-engineering-practices-research.md)。 | “先问一个能影响决策的问题；事实、推断、建议分开；最后用 spike 收尾。” |
| `ponytail` | 最小完整实现、避免未来抽象 | **实际使用**。Typola 会话中多次显式加载，且项目协作规则将其设为默认实现原则；可追溯到 [2026-07-11 会话](/C:/Users/泥巴猪/.codex/sessions/2026/07/11/rollout-2026-07-11T22-58-45-019f51b0-10be-74d3-a8f6-f2174c6becf1.jsonl)。 | “AI 产出不是越多越好；每一行改动都要对应当前验收。” |
| `caveman` / `caveman-commit` | 压缩沟通、生成简洁提交信息 | **实际使用**。会话中显式加载并用于发布收尾，例如 [2026-07-19 发布会话](/C:/Users/泥巴猪/.codex/sessions/2026/07/19/rollout-2026-07-19T15-01-33-019f792e-097a-7fa3-b759-d0265d59e6a1.jsonl)。 | “压缩的是冗话，不是测试证据、风险和安全说明。” |
| Goal（`create_goal`） | 长任务的目标守卫与完成条件 | **实际使用**。会话中创建过 CM6 Issue #183/#184、动效优化、站点复刻等目标；例如 [2026-07-16 动效任务](/C:/Users/泥巴猪/.codex/sessions/2026/07/16/rollout-2026-07-16T01-19-27-019f66ca-43ee-7e82-b928-59845f4873bf.jsonl)。 | “把可验证终点写成系统状态，不让长对话靠印象收尾。” |
| `improve-animations` + `review-animations` | 动效发现、分计划、独立复核 | **实际使用**。7 份实施 plan 已由前者产出，交接文档要求后续实现者按计划实施和自审。[动效实施交接](/D:/暂存/Typola/plans/HANDOFF_TO_CODEX.md) | “发现、计划、实现、审查拆角色；同一人不要既当导演又当验收者。” |
| `tdd` | bug/功能的测试先行或回归补齐 | **实际使用**（Typola 会话显式加载）。 | “在编辑器、导出、路径与时序问题上，让失败用例先变成可复现证据。” |
| `document-release` | 发布前文档与代码状态核对 | **实际使用**（Typola 会话显式加载）；仓库也保留版本、变更和架构同步的发布链路。 | “文档不能凭记忆更新；以当前代码、命令与产物为准。” |
| `grilling` | 对方案/决定施加反例压力 | **实际使用**（至少两条 Typola 会话存在显式加载记录）。 | “针对不可逆假设提尖锐问题；不要把它误用成需求访谈。” |
| `cavecrew` / `gstack-ship` | 子任务委派与交付收尾 | **实际使用**。动效任务初始化时与 `improve-animations`、`ponytail`、`caveman` 一起加载。[同一会话证据](/C:/Users/泥巴猪/.codex/sessions/2026/07/16/rollout-2026-07-16T01-19-27-019f66ca-43ee-7e82-b928-59845f4873bf.jsonl) | “并行给调研/审查，核心状态和同文件写入保持单一 owner；发布必须有检查单。” |
| OpenDesign | AI 工作台的源码参照与受控移植 | **实际使用，且不是 Skill**。工作台 spec 明确以其源码和 stream-json 机制做映射；ToolCard 还有完成实施/验证的交接记录。[Skill OS 设计](/D:/暂存/Typola/docs/AI_WORKBENCH_SKILL_OS.md)；[ToolCard 移植交接](/D:/暂存/Typola/tasks/handoff-fork-opendesign-toolcard.md) | “借鉴成熟实现的交互与机制，但按现有数据形状、依赖和架构剪枝；不做盲目 copy-paste。” |
| `office-hours` | 高影响 UI/产品改动的结构化方案 | **实际产物证据**。一份设计稿明确标注由 `/vibeflow-office-hours` 生成，并包含已确认前提、备选方案、成功标准和范围边界。[主题/浮条/停止兜底设计](/D:/暂存/Typola/docs/plans/20260710-claude-theme-toolbar-stop-office-hours.md) | “先确认关键前提，再比较方案与风险；它适合将讨论压成可实施 Brief。” |

### B. 已出现“激活/可用”痕迹，但没有足够项目交付物：作为候选，不夸大为主流程

| 能力 | 核验结果 | 推荐的正确位置 |
| --- | --- | --- |
| `to-spec` | Typola 会话中有显式 Skill 加载痕迹；本次未找到能单独归因的已落地 spec。 | 产品/架构决定已确认后，将任务卡转为 issue/spec；不能替代 Unknowns First。 |
| `plan-design-review` | 有一次 Typola 会话显式加载痕迹。 | UI 或交互方案评审，检查层级、状态、边界与验收，不承担实现。 |
| `computer-use` | 有 Typola 会话显式加载/工具可用痕迹，但未找到可单独归因的测试报告。 | 桌面端手测、截图基线与真实安装包走查；保留人审，不能用作自动化通过的唯一证据。 |
| `impeccable` | 有 Typola 会话显式加载痕迹。 | 视觉精修或设计审计；与截图、主题对比度检查、Reduced Motion 共同组成 UI 验证。 |

### C. 是用户偏好或已安装能力，但本轮没有足够“已用在 Typola 交付”的证据

| 能力 | 判定 | 说明 |
| --- | --- | --- |
| RTK | **用户工作习惯 / 环境规则** | [RTK.md](/C:/Users/泥巴猪/.codex/RTK.md) 规定 shell 命令以 `rtk` 前缀运行，并有会话读取记录；本轮没有把“读取规则”误判为“所有验证都经 RTK 执行”。适合讲为 token/日志压缩基础设施。 |
| `brainstorm` / `spark` | **未确认实际使用** | 在可用 Skill 快照中未能核验一个稳定、可调用的同名工作流及其 Typola 交付物；可作为“发散阶段工具候选”，但不应写成 Typola 已验证方法。 |
| `grill-me` | **未确认实际使用** | 与 `grilling` 相邻但不是同一能力；没有可靠的 Typola 激活证据。 |
| `plan-ceo-review`、`plan-eng-review` | **未确认实际使用** | 当前环境可用相应 gstack Skill，但未找到显式加载或可归因产物；不应因为目录存在就声称“三种 review 都跑过”。 |

## 4. 可直接复用的“场景—工具—交付物”链路

| 典型研发场景 | 首选工具链 | 人的不可替代决策 | 交付物 / 验收 |
| --- | --- | --- | --- |
| 用户反馈很主观，如“还是卡”“不够像某产品” | `unknowns-first` lite → `office-hours` / `grilling` → 复现与 profiling | 体验基线、可接受取舍、哪些不改 | 可复现步骤、性能/截图基线、最小修复计划 |
| 新功能或跨模块需求 | `unknowns-first` full → `to-spec`（确认后）→ plan review → `ponytail` | 价值、范围外、架构边界、依赖授权 | Brief/spec、6 步以内 plan、最小 diff、测试证据 |
| 技术选型、竞品或开源复用 | `research` 并行只读 Agent → spike → `grilling` | 事实与推断分界、许可证、分发成本、退出条件 | 带一手来源的调研、可运行 spike、最终 ADR/决策 |
| 编辑器/导出等高回归实现 | `tdd` → `ponytail` → 独立 code review | 不变量、数据迁移/兼容策略、是否扩大范围 | 先失败后通过的测试、构建/真实产物检查 |
| UI、动效、桌面交互 | `improve-animations` → 单项 plan → 实现 → `review-animations` / `impeccable` / `computer-use` | 主观体验标准、Reduced Motion、哪些状态最关键 | 截图/走查清单、性能证据、无障碍和窄视口检查 |
| 长任务并行与收尾 | Goal → `cavecrew`（仅独立子任务）→ `document-release` → `caveman-commit` / `gstack-ship` | 子任务边界、单一写入 owner、是否发布 | 状态清晰的目标、验证报告、文档同步、干净提交/PR |

## 5. 分享时必须说清的边界

1. **“Skill 已安装”不是“团队已掌握”。** 本文把会话显式激活、仓库产物与单纯可用严格分开，避免把技能目录当成成果。
2. **Unknowns First 不等于拖慢交付。** 它只用于会改变路径的未知；任务已清晰或用户要求立即执行时跳过或使用 lite。
3. **计划审查不能替代需求确认。** CEO/工程/设计 review 都应建立在已确认的任务卡上；否则只是在更漂亮地讨论错误问题。
4. **视觉自动化不能替代用户验收。** `computer-use` 与截图能扩大覆盖，但桌面应用还需真实安装、文件权限、字体、系统命令等手测。
5. **Goal 也不能替代测试。** Goal 管“任务何时可以结束”，测试和构建证明“系统是否真的正确”。

## 6. 给研发同学的最小起步配置

不需要一次安装整套 Skill。先建立以下五件事即可：

1. 一个 `AGENTS.md`：技术栈、禁止项、验证命令、文档义务；
2. 一张 Brief：目标、范围外、不变量、未知、验收；
3. 一个 `research` 流程：一手来源、事实/推断分离、spike；
4. 一个实现闭环：最小 patch + 测试/构建/真实产物；
5. 一个独立审查入口：对抗性反例、视觉走查或外部 review。

随后再按痛点引入 Unknowns First、动效审计、计划评审、worktree 并行和发布 Skill。工具堆叠不是成熟度；能持续产出可验证、可审阅、可复用证据才是。
