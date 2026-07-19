# 我如何用 AI 从 0 到 1 开发 Typola

> 一套研发可以复制的 AI 辅助研发工作流
>
> 面向研发同学，建议时长 45–60 分钟
>
> 重点放在研发方法：怎样发现问题、判断是否投入、拆需求、做方案、设计界面、固化 Spec、持续开发、完成测试，并把实践转化为可复用能力。

完整版本按章节约 60 分钟。45 分钟版本可以只讲 AI 工作台、CM6 迁移、动效性能三个案例。

---

## 开场：Typola 的开发过程（2 分钟）

Typola 的仓库从 2026 年 4 月 19 日开始，到 7 月 19 日发布 v2.0.6。三个月内留下 613 条提交、72 个合并提交和 10 个版本标签。

研发过程中经历了多次路线调整：

- 桌面技术从 Tauri 切到 Electron，后来又基于 Tauri v2 重写；
- AI 工作台原型做出来后，发现方向不对，删掉重来；
- 编辑器内核从旧方案逐步迁移到 CodeMirror 6；
- Word 导出最初依赖 Pandoc，后来改成内置 docx；
- PDF 技术调研一度推荐 Typst，最终却采用系统 Chrome/Edge headless print；
- 一句“弹窗还是有点卡”，最后追到 CSS 和 Motion 同时控制宽度。

今天重点讨论一条受控的 AI 研发流水线，以及 AI 在各阶段承担的不同职责。用一条“帮我实现”的提示贯穿全程，很难稳定处理产品判断、架构取舍、编码和验收。

---

# 主框架：我的 AI 辅助研发工作流

## 0. CLAUDE.md / AGENTS.md 准备（2 分钟）

### 为什么这是第零步

AI 每次对话都很聪明，但它不会天然知道这个项目长期坚持什么、禁止什么、怎样才算完成。

如果没有项目规则，研发会反复出现三类浪费：

1. 每个任务都重新解释技术栈、命令和目录；
2. AI 会“顺手优化”不在范围内的代码；
3. 同一问题在不同会话里得到相反决策。

所以我会先准备两层规则：

~~~text
全局 AGENTS.md / CLAUDE.md
  管个人长期研发原则

项目 AGENTS.md
  管 Typola 的技术栈、产品边界、命令和文档义务
~~~

### 我的全局规则怎样写

当前全局 AGENTS.md 里，我最在意的是下面几条。

**规则一：复杂任务先达到 95% 把握。**

原文要求是：

> Ask me questions until you are 95% confident you can complete this task exceptionally well.

这条规则只用于模糊、复杂或高影响任务。低风险且边界明确的工作直接执行；其余任务先确认目标、范围、约束和验收。

**规则二：所有方案从第一性原则推导。**

先写真实目标、不可变事实和成功标准，再推导技术方案。不能因为某个框架流行、某个 Skill 推荐，就直接套用。

**规则三：实现遵循 ponytail full。**

完整解决当前问题，但使用最短、最少抽象的实现。不为了“未来扩展”新增无真实调用方的配置、接口和服务层。

**规则四：开源复用优先，但必须读源码。**

优先复用成熟组件，不自研复杂状态机。但“复用”不等于复制粘贴：要检查许可证、依赖、类型、边界和它在本项目里的真实职责。

**规则五：手术式改动。**

只触碰完成请求必须修改的代码；不顺手重构、不整理无关格式、不删除旧代码。每一行改动都应该能追溯到需求。

**规则六：目标驱动和完整验证。**

修 bug 先复现；做功能先写验收；完成后跑最相关检查。无法验证时，要明确未验证项和风险。

### Typola 项目规则怎样写

项目 AGENTS.md 不重复大道理，只记录长期有效的项目事实：

- 技术栈是 Tauri v2、React、TypeScript、Vite、CM6、remark/rehype；
- 用户可见变化必须写 CHANGELOG；
- 架构、命令和跨端行为变化必须同步 ARCHITECTURE；
- 自动保存存在，但默认关闭；
- 不恢复旧 Electron、Milkdown、全局搜索等废弃路线；
- Word 使用内置 docx，不依赖 Pandoc；
- 给出 typecheck、test、build、cargo test 等真实命令。

这两层规则的分工很重要：

| 应放哪里 | 例子 |
| --- | --- |
| 全局规则 | 95% 澄清、第一性原则、最小改动、开源复用、完成后验证 |
| 项目规则 | 技术栈、禁止恢复的旧路线、文档义务、项目命令 |
| Spec | 当前需求的验收标准、接口决定、不做什么 |
| Skill | 某一类多步骤工作的稳定操作方法 |
| 测试和 CI | 每次都必须执行的确定性检查 |

不要把所有经验都塞进一个巨大的 CLAUDE.md。长期规则、单次需求和操作流程应该分开。

### 本阶段产出与退出条件

产出：

- 一份短而稳定的全局规则；
- 一份反映当前实现的项目 AGENTS.md；
- 可直接运行的项目命令；
- 明确的文档更新义务和禁止事项。

退出条件：一个刚进入项目的 AI 能回答“这里是什么项目、不能做什么、改完怎样验证”。

---

## 1. 发现未知：unknowns-first → 竞品调研 → office-hours（4 分钟）

这一阶段先确认未知项和投入价值，暂不讨论实现细节。

### 第一步：用 unknowns-first 找当前最危险的 Unknown

我会先用 quzhi-ai/unknowns-first，当前本地对应 ni-unknown-first。

它承担执行前诊断，不负责方案发散、资料调研和代码实现。具体有四项职责：

1. 找出当前主 Unknown；
2. 列出次级 Unknown；
3. 判断哪个 Unknown 会阻塞下一步；
4. 把当前问题交接给最合适的下一种工作模式。

它将 Unknown 分为想法、伪需求、行动、质量、表达、决策、计划、代码库、实现偏移、验收等阶段。

这里最有价值的一句话是：

> 诊断可以多标签，行动必须单线程。

例如“我要给 Typola 做 AI 工作台”同时包含很多未知：

- 用户是不是需要它；
- 第一版做什么；
- 什么样的 AI 写作体验才算好；
- 现有终端、文件监听和编辑器能复用多少；
- AI 改稿怎样回到正文；
- 怎样验收。

unknowns-first 不会一次解决全部问题。它应该识别当前最早、最阻塞的 Unknown，例如“真实痛点和第一阶段切口还不清楚”，然后把任务交给竞品调研或 office-hours。

一个 Unknown 只有会改变产品方向、首阶段目标、架构、数据模型、主流程、权限或验收标准时，才需要现在解决。其他问题先记录为保留 Unknown。

### 第二步：用竞品调研建立行业能力地图

确定要查什么之后，再做竞品和技术调研。

我不推荐直接做一张巨大功能表。我的调研步骤是：

1. 把问题写成一句可验证的问题；
2. 选择在这个问题上最强的参照物；
3. 查官方文档、源码、类型定义、许可证、release notes；
4. 把事实、推断和建议分开；
5. 检查依赖、包体、分发、平台和许可成本；
6. 最后用 spike 结束调研。

例如调研表格能力时，我把问题落到几个工程决策上：

- 多单元格选择应该由谁维护；
- 行列操作能否成为一次 CM6 transaction；
- 剪贴板、键盘导航和 undo 是否已有成熟实现；
- 自研状态机能不能形成产品差异。

最后选择 codemirror-markdown-tables 承担多选、行列手柄、导航、剪贴板和撤销，Typola 只做产品层菜单和动作适配。

调研中要特别区分：

~~~text
事实：某项目使用 SQLite WAL。
推断：它适合桌面会话持久化。
建议：Typola M2 引入 SQLite。
最终决策：当前阶段不引入，先用现有状态跑通完整流程。
~~~

调研报告用于缩小未知。Typola 的 PDF、Word、AI 工作台路线后来都被 spike 和实现证据修正过。

### 第三步：用 office-hours 判断产品价值和最小切口

竞品告诉我“业界能做到什么”，office-hours 继续追问“我们为什么值得做”。

它有两种模式：

- Startup 模式：看真实需求、现状替代方案、最痛用户、最窄切口和长期方向；
- Builder 模式：适合开源、学习和内部项目，重点选择投入产出合适、能够快速验证的版本。

我重点使用它的几个问题：

1. 用户现在怎样解决这个问题？
2. 现有办法到底痛在哪里？
3. 哪一类具体用户最需要？
4. 最小到什么程度，仍然能产生明显价值？
5. 如果不做，会发生什么？
6. 这个切口能否延伸出稳定的产品差异？

对于 Typola，需要改善的现状是用户在编辑器、终端、文件管理器和浏览器预览之间反复切换。单独比较 Markdown 编辑器功能会漏掉这个问题。

AI 工作台的最小切口是让一个真实文档任务在同一窗口完成：上下文进入 AI，产物落盘，用户能够预览和审阅。多 Agent 支持后置。

### 本阶段产出与退出条件

产出：

- 主 Unknown、次级 Unknown、关闭条件；
- 竞品能力地图与一手证据；
- 明确的真实问题、目标用户和现状替代方案；
- 最小切口；
- 是否值得继续做的判断。

退出条件：能用一句话说清“为谁解决什么问题、现有方法为什么不够、第一版验证什么”，否则不进入需求拆分。

---

## 2. 需求拆分：逐层拆解并提交 Issue / Sub-issue（3 分钟）

找准方向后，我不会一次拆到几十个叶子任务。

我的做法是渐进式拆分：

~~~text
产品方向
  先拆首层 Epic
    某个 Epic 即将实现
      再拆第二层 Issue
        某个复杂 Issue 开工
          再拆可独立验收的子 Issue
~~~

这样做有两个原因。

第一，需求会被调研、原型和实现证据不断修正。太早把所有细节拆完，只是在批量制造过期 Issue。

第二，AI 在细粒度、边界清楚的任务上表现更稳定；但细粒度必须建立在上一层决策已确认的基础上。

### 每一级 Issue 至少写什么

首层 Epic：

- 用户问题和目标；
- 第一阶段边界；
- 成功指标；
- 明确不做的方向；
- 子 Issue 关系。

实现 Issue：

- 用户可见结果；
- 已锁定决策；
- 依赖和前置条件；
- 验收标准；
- 非目标；
- 测试要求；
- 对应父 Issue。

### 为什么要提交到远端 Issue 和子 Issue

聊天记录很容易丢失上下文，也不适合作为团队事实源。

远端 Issue 提供：

- 可追踪的需求树；
- 方案、PR、提交和验收之间的关联；
- 多个会话和多个 Agent 共享的稳定上下文；
- 后续重新拆分和关闭范围的依据。

### 循环规则

每完成一层或遇到新证据，重新运行一次 unknowns-first：

- 如果主 Unknown 已关闭，进入下一层；
- 如果实现暴露新的架构或验收 Unknown，退回方案阶段；
- 如果只是次要问题，不阻塞当前切片，就放入后续 Issue。

Typola 的 CM6 迁移就是这样推进：先有迁移 Epic，再按内核骨架、live preview、编辑命令、导出桥、默认启用、表格和性能逐层展开。

### 本阶段产出与退出条件

产出：远端 Epic、Issue、子 Issue、依赖关系和验收边界。

退出条件：当前准备实现的 Issue 足够小，能由一个负责人在一个分支中完成并独立验收。

---

## 3. 方案设计：/brainstorm / /spark / /grill-me / Plan → 三重 Review（5 分钟）

### 先发散：brainstorm / spark / grill-me / Plan 模式

定位明确后，我会根据问题类型选择不同方式。

**brainstorm 或 spark**

适合还存在多个可行方向时。目标是产生不同方案、原型和最小切口，不急着在第一轮收敛。

Typola AI 工作台最早就有一份 Spark brief：先描述真实痛点、方向、差异化、范围、验收和开放问题。后续 mock 评审又把“选区甩终端”改为场景卡注入，把 git diff 推迟到下一阶段。Spark 的作用就是允许早期方案被修改。

**grill-me / grilling**

适合已经有方案，但关键决策还没有锁定。它一次只问一个问题，并给出推荐答案，沿决策树逐个关闭依赖。

它特别适合确定：

- 是否引入新依赖；
- 数据写到哪里；
- 一个能力拆几个 PR；
- UI 入口放在哪里；
- 遇到失败怎样降级；
- 哪些测试属于必须。

代码库可以回答的事实由 Agent 自行查证；产品取舍和不可逆决策由用户确认。

**Plan 模式直接聊**

问题比较清楚时，可以直接在 Plan 模式读代码、画数据流、比较方案。这个阶段只做决策，避免讨论过程中提前修改实现。

### 再收敛：gstack 三个 Review

方案形成后，我会分别从产品、设计和工程三个视角 Review。三个角色关注的问题不同，分开处理更容易暴露冲突。

#### plan-ceo-review：检查方向、投入价值和范围

它支持四种范围策略：

- Scope Expansion：寻找 10 倍产品；
- Selective Expansion：保持基线，逐项选择扩展；
- Hold Scope：范围不变，把方案做严密；
- Scope Reduction：砍到最小有效版本。

它重点挑战：真实用户结果、现有代码复用、12 个月理想状态、替代方案、范围取舍和长期路径。

#### plan-design-review：用户看到什么，所有状态是否被设计

它按信息架构、加载/空/错误/成功/部分状态、用户旅程、AI 模板感、设计系统、响应式和可访问性逐项评分。

这里会把“做一个简洁现代的弹窗”这种空话改成可执行设计决定。

#### plan-eng-review：这个方案能否安全实现和验证

它检查架构、数据流、代码质量、错误路径、测试图谱和性能；要求列出新 UX、新数据流、新分支、新异步和新外部调用，每一项都要有测试。

### 整个方案里最重要的两部分

**第一：验收标准。**

验收必须是可观察、可执行的。例如：

~~~text
当 provider 卡死、JSON 非法或 stream 挂起时，
点击停止后 1 秒内输入框恢复可输入；
后端进程被终止；
晚到的退出事件不再把状态改乱。
~~~

这比“停止按钮工作正常”强得多。

**第二：不做什么。**

非目标决定方案不会无限膨胀。例如：

- 当前只支持一个 Provider，不提前抽象多 Agent；
- 只改 plain-paper，不顺手统一五套主题；
- 只做 Markdown 到 PDF，不同时做 PDF 导入；
- 复用表格上游状态机，不自研整套表格模型。

### 本阶段产出与退出条件

产出：

- 至少两个真实可选方案及淘汰理由；
- 已确认的架构、数据流、权限和交互决定；
- 可执行验收标准；
- 明确的 Out of Scope；
- CEO、Design、Engineering Review 的决策记录。

退出条件：实现者不需要在编码过程中替产品做关键决定。

---

## 4. 前端设计：OpenDesign 打底 → 逆向优秀设计 → 固化 DESIGN.md（3 分钟）

前端设计最容易让 AI 生成“正确但没有品味”的界面。

我会先提供具体的设计证据，避免只给出“做得像 Claude 或 Codex”这类模糊要求。

### 第一步：用 OpenDesign 打底草图

OpenDesign 提供了成熟的 AI 工作台交互参照，主要包括：

- CLI 事件如何变成消息；
- thinking、tool call、result 怎样分层；
- ToolCard 怎样根据工具类型展示；
- 会话和文档怎样区分；
- 用户怎样看到运行中、成功和失败状态。

我会同时读截图和源码。截图告诉我视觉层级，源码告诉我真实状态和交互。

但不能整块复制。OpenDesign 的组件深度耦合自身 analytics、i18n、contracts 和状态管理。Typola 的处理方式是：

~~~text
机制层：可以移植并保留测试
UI 结构：参考形态，用 Typola 组件重写
设计系统：使用 Typola 自己的 token
无关平台能力：不带过来
~~~

### 第二步：准备设计输入

设计输入可以来自：

- 一套基础配色；
- 自己已有的 DESIGN.md；
- 竞品截图；
- 真实产品源码；
- 字体、间距、圆角、阴影、动效 token；
- 正例与反例。

如果只是截图逆向，要继续追问它为什么好：信息层级、密度、反馈、状态覆盖和交互节奏是什么。

### 第三步：先粗后细

1. 先做线框和核心状态；
2. 确认信息架构；
3. 补加载、空、错误、成功、部分状态；
4. 再决定字体、颜色、间距和动效；
5. 最后做截图对比、窄视口和 Reduced Motion。

不要在信息架构没定时花时间磨阴影。

### 第四步：把风格固化为 DESIGN.md

一套设计通过验证后，我会把它固化到 DESIGN.md：

- 产品气质和反例；
- 颜色和语义 token；
- 字体和字号层级；
- 间距、圆角、边框和阴影；
- 动效 duration/easing；
- 常用组件模式；
- 空、错、加载、成功状态；
- 响应式与可访问性规则；
- 明确禁止的 AI 模板化设计。

后续 AI 先读 DESIGN.md，再做新界面。这样设计不会每个 Issue 换一种审美。

### 推荐的前端设计 Skill

除了 OpenDesign 这种具体产品参照，我还推荐两类设计 Skill：

- `impeccable`：适合从产品上下文出发完成界面塑形、设计审查和上线前精修。它会系统检查信息架构、视觉层级、排版、颜色、间距、响应式、可访问性、错误状态、动效和性能，并主动识别常见的“AI 模板感”。
- [`taste`](https://github.com/Leonxlnx/taste-skill)：适合约束 AI 的视觉品味，重点改善布局、字体、间距和动效，避免生成千篇一律的卡片式界面。它还可以通过设计变化度、动效强度和视觉密度三个旋钮控制设计方向。

产品审美仍由人确定。我的用法是：先通过 OpenDesign、截图或源码选择参照，再用 DESIGN.md 固化项目决定，最后让 `impeccable` 或 `taste` 检查实现偏差。两者承担设计约束和审查职责，不用于随机更换视觉风格。

### 本阶段产出与退出条件

产出：线框、状态图、视觉参照、设计决定和 DESIGN.md。

退出条件：设计不再依赖“感觉高级”“像某某产品”这种无法验收的描述。

---

## 5. Spec 基线：使用 to-spec 固化方案并提交 Issue（2 分钟）

方案和设计都确认后，我会使用 to-spec。

`to-spec` 汇总已经确认的讨论，生成工程可执行的 Spec，并发布到对应 Issue。它不会重新启动一轮需求访谈。

一份 Spec 包含：

- Problem Statement；
- Solution；
- 完整 User Stories；
- Implementation Decisions；
- Testing Decisions；
- Out of Scope；
- Further Notes。

这里有两个很实用的原则。

### 原则一：优先使用已有测试接缝

Spec 会先看这个功能应该从哪个稳定接口被测试。尽量复用已有 seam；需要新增时，选择最高、最少的接缝，避免为了测试把内部实现切得过碎。

### 原则二：Spec 记录决定，不记录容易过期的文件路径

实现模块、接口、状态机和契约应该写清楚；具体行号和大量代码片段很快会过时。只有原型产生的状态机、schema 或类型形状能精确表达决定时，才保留最小片段。

Spec 完成后：

1. 提交到父 Issue；
2. 关联子 Issue；
3. 标记 ready-for-agent；
4. 后续 Plan、Goal、开发和 Review 都以它为基线；
5. 如果真实实现迫使方案变化，先修订 Spec 或记录偏差，不能静默漂移。

### 本阶段产出与退出条件

产出：远端 Issue 中的可执行 Spec，以及清楚的测试决定和 Out of Scope。

退出条件：换一个没有参加前面讨论的研发或 Agent，也能理解为什么做、做什么、怎样验收。

---

## 6. 开始开发：直接设置 Goal 模式（3 分钟）

进入编码阶段后，我会直接设置 Goal 模式。

Goal 用于固定跨多轮任务的完成条件，即使会话经历上下文压缩，执行方向仍然可检查。具体步骤由工作计划维护。

### Goal 怎样写

坏 Goal：

> 完成 Typola 优化。

好 Goal：

> 在当前分支完成 Issue #224 已锁定的字体、纸纹背景、设置持久化和视觉回归；不改其他主题结构；typecheck、单测、构建与 10 张截图基线通过；提交 PR 前排除用户已有未跟踪文件。

Goal 写结果，不写每一步命令。具体步骤放在工作计划里，并随证据调整。

### 开发阶段的基本循环

~~~text
确认 Goal
→ 读当前 Issue、Spec、AGENTS.md、DESIGN.md
→ 检查 Git 状态
→ 只读定位和复现
→ 写短计划
→ 实现一个切片
→ 跑定向测试
→ 更新计划
→ 继续下一个切片
→ 全量验证
→ 对抗 Review
→ 修复、提交、PR
~~~

### 分支、worktree 和多 Agent

- 一个 Issue 一个分支；
- 高冲突实现由一个 Agent 持有写权限；
- 调研、测试设计、独立 Review 可以并行；
- 确需并行实现时使用 worktree 隔离；
- 多 Agent 不同时改 AppLayout、CHANGELOG 或同一状态模型。

### 开发中常用的辅助 Skill

- ponytail：保持完整但最小的实现；
- TDD：bug 先复现，功能先定义行为；
- diagnosing-bugs / investigate：遇到难复现问题时建立假设和证据；
- code-review：实现后的独立审查；
- careful / guard：删除、迁移和高权限操作增加保护；
- cavecrew：判断哪些任务值得委派；
- caveman-review / caveman-commit：压缩 Review 和提交信息；
- simplify：实现后只简化本次改动，不扩展到无关代码。

### 本阶段产出与退出条件

产出：围绕 Goal 的小步提交、持续更新的验证证据和可审查 Diff。

退出条件：Goal 中的全部完成条件都有证据支持。仅完成编码不满足退出要求。

---

## 7. 测试：npm 检查 + Computer Use + 人工手测（4 分钟）

我平时口头会说“先跑 npm check”，在 Typola 里实际对应的是一组明确命令：

~~~bash
npm run typecheck
npm run lint
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
npm run perf:bundle:check
npm run audit:theme-contrast
~~~

检查项按改动风险组合，无需对每个小改动机械执行全部命令。

### 第一层：代码和自动化检查

| 改动 | 重点检查 |
| --- | --- |
| 纯逻辑 | typecheck、单测、边界输入 |
| 编辑器 | IME、选区、transaction、undo/redo、真实时序 |
| Rust 文件和进程 | cargo test、路径越界、异常退出 |
| UI | E2E、窄视口、键盘、Reduced Motion |
| 导出 | 真实 docx/PDF/HTML 产物 |
| 依赖和懒加载 | build、bundle budget |
| 主题 | 对比度审计、截图基线 |

### 第二层：Computer Use

桌面应用很多问题只有在真实 Windows 应用里出现：

- 原生文件对话框；
- 窗口关闭和未保存确认；
- 拖拽；
- 系统浏览器打开；
- 更新提示；
- Tauri WebView 和浏览器 mock 的差异；
- 安装包和 portable 包行为。

Computer Use 可以控制真实 Windows 窗口、点击、输入和截图，适合跑重复的桌面验收路径。它补充 Playwright，但不替代代码级测试。

### 第三层：人工手测

人工重点判断机器难以完全裁决的部分：

- 动效是否有可感知卡顿；
- 中文输入是否自然；
- Word/PDF 排版是否可信；
- 空状态和错误提示是否让人理解；
- 操作是否符合用户心智；
- 设计是否“看起来像同一个产品”。

### 测试报告必须说清三件事

1. 跑了什么；
2. 结果是什么；
3. 什么还没验证。

浏览器环境缺少 Tauri runtime 的告警，不能写成产品失败；重跑一次偶然通过，也不能掩盖潜在 flaky。AI 的“全部通过”只是摘要，真实命令和产物才是证据。

### 本阶段产出与退出条件

产出：自动检查结果、Computer Use 截图或操作证据、人工验收清单、残余风险。

退出条件：用户关键路径有证据覆盖，失败路径可见，未验证项已经明确。

---

## 8. 用户上手：使用 teach 生成用户教程（3 分钟）

研发完成后还要解决用户上手问题。软件按模块组织，用户则围绕任务行动：“我要完成一篇稿子，第一步点哪里，遇到 AI 改稿怎样确认，最后怎样导出？”

我使用 [`teach`](https://github.com/mattpocock/skills/tree/main/skills/productivity/teach) 为 Typola 建立了一套有状态、可跨会话延续的教学工作区。“教会用户”被拆成目标、事实源、课程、练习和学习记录，内容不依赖 AI 临时改写 README。

### 第一步：用 MISSION.md 锁定“教会谁、做到什么”

Typola 的 `MISSION.md` 先定义学习目标和边界：

- 目标用户是已经安装 Typola、准备投入实际写作的中文写作者；
- 5 分钟内跑通一次选区浮条润色；
- 一小时内完成“写作 → AI 改稿 → 检视 → 导出 PDF”的完整回合；
- 能在 AI 输出不确定时判断下一步；
- 不教授源码架构、Skill 开发和打包发布。

这一步非常像写产品验收标准。没有 Mission，AI 很容易把用户手册写成面向研发的架构说明，或者把所有按钮平均介绍一遍。

### 第二步：用 RESOURCES.md 建立事实源

教程里的按钮名称、快捷键和操作路径最容易被 AI 凭印象写错。所以 `RESOURCES.md` 把每节课映射到真实资料：

- 产品定位和快速开始来自 README；
- AI 工作台、检视、Diff、PDF 等行为来自对应 Spec；
- “按钮在哪里、当前叫什么”必须回到组件和服务源码确认；
- 未合入主分支的实验、个人待办和旧评审文档不能写进教程。

关键规则是：教程不展示源码，但教程中的每一个 UX 断言都应该能追溯到源码或已合入文档。

### 第三步：按用户任务组织 9 节课

课程按用户完成工作的顺序组织，不采用 React 组件或 Rust 模块作为章节结构：

~~~text
安装上手
→ 浮条 AI 改稿
→ AI 工作台
→ 上下文芯片
→ Skill 场景
→ 检视与 Diff 审阅
→ 多会话
→ 产物中心
→ PDF / Word / HTML 交付与离线降级
~~~

每节课都是一个独立 HTML，控制在 5–20 分钟，并使用统一结构：

~~~text
能力定位
→ 前置条件
→ 3～5 个真实操作步骤
→ 立即练习
→ 常见陷阱
→ 下一节预告
~~~

其中“能力定位”来自一次真实迭代：先讲它解决什么、Typola 怎样解决、与其他工具有什么差别，再讲点击步骤。用户不了解一项能力的用途，就很难在实际场景中想起它。

### 第四步：把课程做成可持续维护的教学系统

`teach` 最终不只生成课程正文，还生成了：

- `MISSION.md`：长期教学目标和边界；
- `RESOURCES.md`：权威资料与课程的对应关系；
- `lessons/`：9 节独立课程、课程索引和合并版教程；
- `reference/typola-cheatsheet.html`：快捷键和高频操作速查；
- `assets/lesson-base.css`：所有课程共享的视觉样式；
- `NOTES.md`：用户的教学偏好；
- `learning-records/`：记录非显然结论，供下一次会话继续。

这次提交形成 17 个文件、9 节课程和一份速查表。跨会话状态更值得关注：更换 AI 或开启新会话后，仍能确认目标读者、事实来源、课程进度和下一课内容。

### 这件事为什么也属于研发流程

写教程实际上是一轮面向用户任务的黑盒验收：

- 如果一句话说不清能力定位，产品定位可能还没想透；
- 如果步骤无法从源码确认，界面命名或文档已经漂移；
- 如果练习没有可观察结果，功能验收标准可能不够具体；
- 如果九节课无法串成一条路径，产品的信息架构可能只是功能堆积。

用户手册把实现翻译成用户成功路径，也反向检查产品是否可学、可用、可交付。它属于交付验收的一部分。

### 本阶段产出与退出条件

产出：教学 Mission、权威资源表、课程路径、9 节课程、课程索引、速查表和跨会话学习记录。

退出条件：一个不了解源码的新用户，可以沿课程独立完成 Typola 的“写 → 改 → 检视 → 交付”全流程，并能根据速查表再次完成。

---

# 真实案例：这套流程怎样在 Typola 中运行

## 案例一：AI 工作台，先关闭产品 Unknown，再决定技术路线（4 分钟）

### 背景与初始假设

最初的需求只有一句话：“在 Markdown 编辑器里加入 AI。”这句话对研发没有直接指导意义。接入 Claude CLI、放一个输入框、展示流式文本都能满足字面要求，却无法说明用户为何需要 Typola 承载这件事。

我们先用 unknowns-first 把问题拆成四个待验证假设：

1. 用户在编辑器、终端、文件管理器和浏览器之间切换，确实产生了可感知成本；
2. AI 输出需要进入当前文档或项目目录，单纯展示对话价值有限；
3. 用户必须能够检查、拒绝或回退 AI 修改；
4. PTY 与 headless 两条技术路线分别适合哪些交互。

这四项会影响产品定位、数据流和验收，因此被列为阻塞项。模型选择、会话持久化和多 Agent 支持先放入后续清单。

### 调研、定位与第一版方案

竞品调研覆盖 OpenDesign、fanbox、Claude Code、OpenCode 等项目。调研没有停留在功能截图，我们继续读了事件协议、会话模型、ToolCard、产物落盘和授权流程。

office-hours 随后把现有工作方式画成一条用户路径：

~~~text
编辑器写文档
→ 切到终端调用 AI
→ 去文件管理器找生成文件
→ 回编辑器检查内容
→ 去浏览器看最终效果
~~~

由此确定了 Typola 的切口：缩短文档、Agent、产物和审阅之间的路径。第一版的验收对象是一项完整文档任务，Provider 数量和聊天界面丰富度均不进入首要指标。

Spark brief 最初选择真实 PTY，原因很具体：它保留 Claude Code 的 Skill、授权和完整 TUI。已有 headless 原型因交互质量不足被删除。后续研究 OpenDesign 时，又确认结构化事件对 ToolCard、停止状态、多轮会话和产品化错误提示很重要，于是恢复 headless 主路径，同时保留终端作为完整 CLI 兜底。

### 实施中的关键取舍

- 当前文档、附件和工作目录作为显式上下文，不由系统暗中猜测；
- AI 生成文件落到 `.typola-output/<conversation>/`，产物与聊天消息分开管理；
- 改稿先产生候选稿，再进入 Diff 审阅，用户确认后才写回正文；
- Provider 与会话绑定，切换 Provider 时新建会话，避免上下文串用；
- 首版控制在 Claude Code 与 OpenCode，不预埋完整多 Agent 平台。

### 踩过的坑与结果

第一个坑是过早讨论技术接入。CLI 能否启动很快就能验证，AI 产物如何进入用户工作对象才决定产品价值。第二个坑是把已经投入的原型当成约束。删除 headless 原型带来返工，同时也清除了错误的数据流假设。第三个坑是把路线选择理解成单选题；实际产品需要结构化主路径和透明兜底路径同时存在。

最终形成了可追踪的工作台链路：上下文可见、运行状态可见、产物落盘、修改可审阅、失败可退回终端。这个结果来自多轮证据收敛，没有沿用第一次 brainstorm 的结论。

### 观点总结

1. AI 产品应先定义“输出如何进入工作对象”，聊天界面排在后面；
2. 原型的职责是验证假设，验证失败后应及时删除；
3. 技术路线可以按主路径和兜底路径分工，无需强行统一；
4. 产品差异取决于完整任务能否顺利完成，Provider 数量无法替代流程质量。

---

## 案例二：CM6 迁移，把大重构拆成可证明的能力（4 分钟）

### 背景与风险识别

旧编辑器同时承载中文输入、光标、Markdown 标记、表格、预览、AI 替换和导出。直接替换组件会同时改变这些行为，任何回归都很难定位。首要问题因此被写成：“CM6 能否承载 Typola 当前的写作与协作约束？”

Phase 0 spike 只验证高风险能力：中文 IME、选区和撤销、Markdown transaction、live preview 扩展方式、外部命令接口。Spike 通过后才建立迁移 Epic，没有在第一天拆完全部叶子任务。

### 渐进式需求拆分

迁移按依赖关系分成八个阶段：

1. Phase 0 spike；
2. CM6 内核骨架；
3. live preview；
4. 统一 EditorKernel 命令；
5. Markdown 导出桥；
6. 默认启用和旧内核退出；
7. 图片、表格、脚注、raw HTML、检视锚点；
8. 性能诊断与优化。

每个阶段都有独立验收、合入点和回退边界。下一层 Issue 只在对应阶段开工前拆解。这样可以吸收 spike、Review 和真实使用产生的新证据，避免维护一批已经过期的子任务。

### 架构实施与开源复用

- 使用 CM6 `Compartment` 隔离 mode、theme、preview、zoom 和 review mark，配置变化只重配相关 extension；
- 编辑操作统一走 transaction，撤销、选区映射和测试共享同一条数据路径；
- 通过 EditorKernel 保留上层命令接口，让 UI 迁移和内核迁移解耦；
- 表格的多选、导航、剪贴板和行列状态机复用 `codemirror-markdown-tables`；
- Typola 维护菜单文案、产品动作和主题适配，减少自有状态机面积。

### Review 如何改变实现

迁移完成后安排了独立的对抗 Review。PR #222 暴露路径越界、HTML sanitization、转义和浮层焦点问题；PR #225 暴露 preview 双调度、inline math 全篇重扫以及脱离真实时序的测试。

这些反馈没有停留在 Review 评论中：安全问题增加边界校验，性能问题进入专项修复，错误测试被替换为真实时序用例。最后留下的资产包括兼容接口、分阶段提交、回归测试和架构文档。

### 踩过的坑与结果

早期最容易犯的错误是按目录拆迁移任务，例如“重写 editor 目录”。这种拆法无法独立验收，也会把多个风险压进同一 PR。另一个风险是自研所有编辑交互；表格状态机复杂、回归面大，同时缺少产品差异化价值，复用成熟上游更合理。

迁移最终完成了编辑内核统一，并为 AI Diff、检视锚点和后续性能优化保留了稳定扩展面。用户能力保持连续，工程内部逐步替换。

### 观点总结

1. 大重构应按“可独立证明的能力”拆分；
2. 先建立兼容接缝，再替换内部实现，可以显著降低合入风险；
3. 开源复用优先覆盖复杂且缺少差异化价值的状态机；
4. Review 只有转化为代码、测试或规则后，才形成长期收益。

---

## 案例三：动效性能，把“有点卡”转成可验证的工程问题（4 分钟）

### 从设计审计开始

第一轮目标是补齐界面动效。我们使用 `find-animation-opportunities` 和 `improve-animations` 扫描界面，把 7 个机会写成独立 plan。每个 plan 都包含问题证据、修改边界、motion token、Reduced Motion、机械检查和自审清单。

这种拆法控制了视觉任务常见的范围漂移。实现者不能顺手重做布局，也不能为追求“高级感”新增无关动画。

### 用户反馈如何进入诊断

第一轮完成后，实际使用仍然感觉弹窗和拖拽“不够丝滑”。我们停止凭感觉调整 duration 和 easing，转而记录具体操作、动画属性和帧级状态，再进入 profiling。

诊断定位到四个问题：

- CSS transition 与 Motion 同时控制 `width`，同一属性存在两个 owner；
- `pointermove` 每次触发 React 状态和布局更新；
- 终端拖拽复用了相同的高频更新方式；
- `min-width` 约束干扰动画第一帧的计算结果。

### 修复与验证

- 每个动画属性只保留一个 owner；
- 高频指针事件通过 `requestAnimationFrame` 合帧；
- 拖拽过程中更新临时视觉值，松手后写入最终持久状态；
- duration、easing 和 Reduced Motion 统一进入 token；
- 自动检查覆盖 typecheck、lint、前端测试、Rust 测试、构建、bundle budget、对比度审计和关键 E2E；
- Computer Use 与人工手测继续检查拖拽手感、首帧跳动和降级动效。

### 踩过的坑与结果

第一轮把“动效存在”当成了主要验收，缺少属性所有权和热路径检查。截图可以验证静态状态，单测可以验证逻辑分支，两者都无法直接证明连续交互流畅。加入 profiling 后，主观反馈才被转成可定位、可回归的工程问题。

最终收益包括统一 motion token、明确属性所有权、降低 pointermove 更新频率，并为 Reduced Motion 建立稳定规则。

### 观点总结

1. DESIGN.md 与动效 Skill 定义体验目标，profiling 负责解释性能偏差；
2. 同一动画属性必须有唯一 owner；
3. 主观体验需要操作路径、性能证据和人工验收共同支撑；
4. “丝滑”可以拆成首帧、帧间更新、布局次数和输入响应等可检查指标。

---

## 案例四：导出重构，让调研结论接受实现证据修正（3 分钟）

### 初期调研与约束变化

PDF 调研比较了 LiteParse、Typst、Inkwell、Typora、Zettlr 等方案；Word 链路早期依赖 Pandoc。调研报告包含功能、包体和阶段路线，但它记录的是当时证据，不具备永久约束力。

进入实现后，产品约束逐渐清晰：

- 用户安装 Typola 后应能直接导出 Word；
- Word、HTML、PDF 需要共享 Markdown 语义；
- Windows 通常已有 Chrome、Chromium 或 Edge，可复用浏览器打印能力；
- 长导出必须显示阶段进度和失败原因；
- PDF 导入不属于当前交付范围。

### 方案收敛

最终采用共享的 remark/rehype Markdown 渲染层。Word 使用内置 `docx` 生成器；PDF 由 Rust 查找系统 Chrome、Chromium 或 Edge 并调用 headless print；HTML 导出负责复制本地资源和生成独立文件。

这套方案减少了用户侧外部依赖，也让三类导出共享大部分语义处理。调研文档继续保留，并在顶部标注当前实现状态，防止旧建议被误当成现状。

### 踩过的坑与验证方式

技术调研容易高估引擎能力，低估安装、分发、错误提示和取消操作。Pandoc 本身成熟，但新增一个外部可执行文件会扩大安装失败、路径检测和版本兼容成本。PDF 方案也不能只看渲染质量，还要检查浏览器发现、资源路径、取消保存和真实输出文件。

验证覆盖真实 docx、PDF、HTML 产物，检查标题、表格、图片、代码块、本地资源和错误路径。未采用的 Typst、Pandoc 路线保留决策依据，后续需求变化时可以重新评估。

### 观点总结

1. 调研报告必须标日期，并明确事实、推断、建议和最终决策；
2. 技术建议需要经过 spike 和分发约束复核；
3. 外部依赖的安装与诊断成本属于产品体验；
4. 记录淘汰方案及原因，可以减少后续重复调研。

---

# 最终效果与证据边界（2 分钟）

Typola 最终形成了一个可发布的 Tauri v2、React、CM6、Rust 桌面工程，并建立了九百多项前端测试、四十多项 Rust 测试以及 typecheck、lint、构建、E2E、bundle 和主题审计。

仓库之外，还形成了一组稳定的研发约束：

- 高影响需求开始先诊断 Unknown，再决定是否进入实现；
- 竞品调研从功能表转向一手证据和 spike；
- 需求通过 Epic、Issue、Sub-issue 渐进拆分；
- 方案在 CEO、Design、Engineering 三个视角下 Review；
- 前端设计开始从源码和截图逆向，并将设计规则写入项目；
- Spec、Issue、Goal、PR、测试和文档形成连续证据链；
- AI 既参与实现，也作为独立敌手 Review；
- Git、Issue、Spec、测试、AGENTS.md 和 Skill 共同承担长期记忆，降低了对单次会话上下文的依赖。

这些数据需要谨慎解释：

- 613 条提交不能证明生产力提高多少倍；
- 没有严格对照实验，不能宣称节省了多少人月；
- “更丝滑”必须由用户感受和性能证据共同支持；
- AI 生成更快，也会把错误方向实现得更快。

---

## 结尾前补充：工具推荐与 Agent 协作方式（4 分钟）

工具按当前问题选择。安装数量不会直接提高交付质量，触发条件、产出和验收方式必须明确。

### 从想法到 Spec

| 工具 | 用途 |
| --- | --- |
| unknowns-first / ni-unknown-first | 找出当前阻塞性 Unknown，决定下一种工作模式 |
| research | 基于一手资料完成源码、许可证、竞品和技术调研 |
| office-hours | 检查真实痛点、现状替代、最窄切口和投入价值 |
| brainstorm / spark | 形成候选方向和第一版 brief |
| grilling / grill-me | 逐项锁定关键决策 |
| Plan 模式 | 读取代码、讨论架构与数据流，保持只读 |
| plan-ceo-review | 检查方向、范围、投入价值和长期路径 |
| plan-design-review | 检查信息架构、状态、响应式、可访问性和设计系统 |
| plan-eng-review | 检查架构、数据流、错误处理、测试和性能 |
| to-spec / to-tickets | 将已确认决定转为远端 Spec 和任务树 |

### 从设计到交付

| 工具 | 用途 |
| --- | --- |
| OpenDesign / 竞品源码 | 提供交互机制与代码参照 |
| DESIGN.md | 固化产品视觉语言和禁止项 |
| impeccable / taste | 前端塑形、设计审查和视觉偏差检查 |
| Goal 模式 | 跨多轮追踪一个可验证结果 |
| ponytail | 按“不做 → 标准库 → 平台原生 → 已有依赖 → 最短代码”完成精简实现 |
| TDD | 先固定失败条件和预期行为 |
| diagnosing-bugs / investigate | 系统定位复杂缺陷和性能回归 |
| code-review / review | 对 Diff 进行独立对抗审查 |
| computer-use | 验证真实 Windows 桌面交互 |
| document-release / ship | 同步文档、版本和发布检查 |
| teach | 建立 Mission、事实源、课程、速查和跨会话教学记录 |

### Token、安全与协作基础设施

| 工具 | 用途 |
| --- | --- |
| RTK | 压缩 Git、npm、cargo 和测试输出，减少上下文占用 |
| caveman 系列 | 压缩说明、Review、提交信息和长期记忆 |
| careful / guard | 为删除、迁移和高权限操作增加保护 |
| cavecrew | 判断任务是否适合委派，并设计 Agent 边界 |
| worktree | 隔离并行开发，降低文件冲突 |
| Git Issue / Sub-issue / PR | 保存需求、实现和验收的团队事实 |

压缩工具不得删除安全信息、执行顺序、测试结果和残余风险。一个 Skill 至少要说明触发条件、输入、边界、产出和验证，否则很难进入团队流程。

### Agent 如何选择

我按任务类型和协作风险选择 Agent，不按模型排行榜统一分配：

| 角色 | 适合的任务 | 权限与产出 |
| --- | --- | --- |
| 主 Agent / 协调者 | 维护 Goal、关键决策、任务顺序和最终合并 | 持有核心状态，负责最终验收 |
| 调研 Agent | 竞品、源码、许可证、技术路线 | 默认只读，提交带来源的调研结论 |
| 实现 Agent | 边界清楚、可独立验收的 Issue | 限定目录或 worktree，提交最小 Diff 和测试证据 |
| Review Agent | 安全、性能、设计、可维护性审查 | 不参与原实现，输出可定位问题和严重级别 |
| QA Agent | 浏览器、桌面路径、安装包和产物验证 | 不修改代码或单独提交修复报告 |

选择时检查五项：任务是否能独立验收、需要多少项目上下文、是否会写同一批文件、需要哪些工具和权限、失败后能否安全回收。调研和 Review 适合并行；核心状态模型、AppLayout、CHANGELOG 等高冲突文件保持单一写入 owner。

Typola 历史上按任务形态做过几次明确分工：Codex 接收图片插入和动效 plan 这类跨文件、验证要求高的实现；MiniMax 接收 CM6 polish 这类边界清楚的稳定性任务；MiMo 接收产物回流和 Composer 体验调整。模型没有固定岗位。每次分配都重新评估上下文规模、工具能力、改动风险和验收成本。

### 当前方式：Prompt Handoff

Typola 已经使用 Markdown Prompt 完成 Agent 移交，例如 `plans/HANDOFF_TO_CODEX.md` 和 `tasks/handoff-*.md`。Handoff 文件是一份可审计的执行合同，至少包含：

1. 目标、当前状态和完成定义；
2. 必须先读的 Issue、Spec、架构文档和代码入口；
3. 已确认决定、不变量与明确禁止项；
4. 允许修改的范围和单一写入 owner；
5. 验收标准、测试命令和真实产物要求；
6. 已知风险、未关闭 Unknown 和停止条件；
7. 交付格式、提交边界以及需要回传的证据。

Prompt Handoff 的优势是简单、透明、可以进入 Git。它的限制也很明确：能力发现依靠人，任务状态缺少统一协议，长任务更新多为自然语言，跨 Provider 的结果格式不一致。

### 后续计划：A2A 交互

下一阶段计划参考 [A2A Protocol](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)，把文件式移交逐步升级为结构化 Agent 协作：

~~~text
Agent Card：声明能力、工具、端点和认证要求
Task：保存任务 ID、状态和生命周期
Message / Part：传递文本、文件和结构化数据
Artifact：返回代码、报告、截图和构建产物
Streaming：持续回传状态和增量结果
~~~

落地顺序会保持渐进：先为现有 Handoff 增加稳定 schema；再建立本地 Agent 能力目录；随后接入 Task 状态和 Artifact 引用；最后评估跨 Provider 的 A2A 网关。A2A 负责互操作，不会自动解决权限、信任、写冲突和验收问题。高风险写入仍需最小权限、单一 owner 和人工确认。

---

## 结尾：核心结论（3 分钟）

先给出五个结论：

1. AI 辅助研发的首要工作是管理 Unknown。问题定义错误时，代码生成速度只会放大返工；
2. Issue、Spec、测试、Handoff 和 Git 记录构成工程事实，会话只承担当次推理；
3. 验收标准与 Out of Scope 必须在实现前锁定，它们直接控制范围、测试和 Review；
4. 调研、实现、Review、QA 应由不同角色承担，核心代码保持清晰的写入所有权；
5. 所有结论都要接受实现证据和用户反馈修正，包括调研报告、原型和既有架构。

具体执行时，先判断当前处于哪个研发场景，再为 AI 分配对应职责：

~~~text
规则不清，先写 AGENTS.md
问题不清，先找 Unknown
价值不清，做竞品调研和 office-hours
需求太大，逐层拆 Issue
方案未定，brainstorm 或 grill
方案已定，做 CEO / Design / Eng Review
设计含糊，做原型并固化 DESIGN.md
讨论完成，用 to-spec 固化
开始实施，设置 Goal
代码完成，用自动测试、Computer Use 和人工手测验收
产品已经可用但用户不会用，用 teach 建立课程和速查
重复出现的经验，转成规则、测试或 Skill
~~~

AI 的优势是速度、广度和不知疲倦。研发的价值仍然是目标、判断、边界、品味，以及对最终结果负责。

Typola 提供了一个完整样本：研发过程可以重复运行，既有结论允许被新证据推翻，项目积累也会持续转化为规则、测试、文档和 Skill。

---

## 附录 A：现场建议展示的材料

1. 全局 AGENTS.md：95%、第一性原则、ponytail、手术式改动、完整验证；
2. 项目 AGENTS.md：技术栈、禁止事项、文档义务和命令；
3. unknowns-first 的 Unknown 分类与“诊断多标签、行动单线程”；
4. AI 工作台 Spark brief 的原始方向和后续修订；
5. 竞品研究中“事实、推断、建议、最终决策”的差异；
6. Issue #224 锁定的设计决定与任务拆分；
7. CM6 Phase 0～5 的提交历史；
8. OpenDesign 源码到 Typola 的移植映射；
9. plans/HANDOFF_TO_CODEX.md 的边界与验证；
10. PR #222、#225 的 Review 意见与回归测试；
11. 动效卡顿的双重 width animation；
12. PDF 调研旧结论与最终实现对照；
13. teach 生成的 MISSION.md、RESOURCES.md、9 节课程、课程索引和速查表。

## 附录 B：本次分享的项目证据

| 内容 | 证据 |
| --- | --- |
| 全局研发规则 | C:/Users/泥巴猪/.codex/AGENTS.md |
| RTK 用法 | C:/Users/泥巴猪/.codex/RTK.md |
| 项目规则 | AGENTS.md |
| AI 工作台初始 Spark | docs/changes/2026-06-14-work-package/brief.md |
| AI 工作台 Spec | docs/AI_WORKBENCH_SPEC.md、docs/AI_WORKBENCH_SKILL_OS.md |
| Skill OS 竞品调研 | docs/changes/2026-06-18-skill-os-competitive-research/ |
| PDF 与竞品调研 | docs/changes/2026-06-20-pdf-import-export-research.md |
| CM6 迁移方案 | docs/changes/2026-06-29-cm6-editor-refactor-plan.md |
| AI CLI 复用方案 | docs/changes/2026-06-30-ai-workbench-cli-reuse-plan.md |
| 表格组件调研 | docs/changes/2026-07-14-cm6-table-components-research.md |
| 动效实施交接 | plans/HANDOFF_TO_CODEX.md |
| Prompt Handoff 样例 | plans/HANDOFF_TO_CODEX.md、tasks/handoff-codex-image-insert.md、tasks/handoff-minimax-issue117-cm6-polish.md、tasks/handoff-mimo-artifacts.md |
| 当前架构 | docs/ARCHITECTURE.md |
| 行业一手实践 | docs/changes/2026-07-19-ai-assisted-engineering-practices-research.md |
| teach 教学目标 | MISSION.md |
| teach 权威资源表 | RESOURCES.md |
| teach 课程索引 | lessons/README.md |
| teach 跨会话记录 | learning-records/0001-typola-tutorial-workspace.md |

## 附录 C：外部一手资料

- [quzhi-ai/unknowns-first](https://github.com/quzhi-ai/unknowns-first)
- [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)
- [mattpocock/skills：teach](https://github.com/mattpocock/skills/tree/main/skills/productivity/teach)
- [A2A Protocol Specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)
- [OpenAI：AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenAI：Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [OpenAI：Build skills](https://learn.chatgpt.com/docs/build-skills)
- [OpenAI：Agent safety](https://developers.openai.com/api/docs/guides/agent-builder-safety)
- [Anthropic：Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)
- [GitHub：Agent skills](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
