# Typola Markdown 编辑器底层架构调研

> 日期：2026-06-18  
> 范围：底层架构 + AI 集成对比（不做产品级对比，已由 `2026-06-16-competitive-research` 覆盖）  
> 服务于：Typola Skill OS（M1-M4）路线下的 Markdown 编辑器选型 / 双模式同步 / AI 工作台集成

---

## TL;DR

1. **主流编辑器阵营分化**：Prosemirror 系（TipTap / BlockNote / Milkdown / Novel）vs Lexical vs Slate 系（Plate）vs 自研 IR（Vditor）。Typola 当前站在 Vditor IR + CM6 双栈上，是少数走"自研 IR + 独立源码栈"双模式的方案。
2. **AI 编辑器形态已收敛**：slash menu + formatting toolbar 选区触发 + streaming diff 是 2026 业界标准三件套（BlockNote AI / Plate AI / Novel 都遵循）。
3. **Vditor IR ↔ CM6 source 同步是 Typola 独有的难题**，业界没有现成方案：TipTap 通过 `tiptap-markdown` 走"markdown ↔ ProseMirror JSON 单向"路线（不是 IR），Lexical/Milkdown 走"WYSIWYG + markdown 序列化"路线，**真正坚持双模式实时同步的只有 Vditor 三模式内部切换**。
4. **短期 ROI 最高的改造**：把"双模式"重新定位为"主用 IR + 源码模式按需切换（接受数据快照式同步）"，放弃逐字符实时同步幻想。
5. **AI 集成应走 BlockNote/Plate 路线**（slash + 选区 + streaming），而不是给 Vditor 塞插件。

---

## 一、各项目横向对比表

### 1. Vditor
| 字段 | 内容 |
|------|------|
| Star / 版本 | 11.1k / v3.11.2 (2025-09-02) |
| 架构定位 | 自研 IR（instant rendering） + WYSIWYG + SV 三模式，Markdown 引擎自研 Lute（Go→WASM）|
| 块级模型 | CommonMark + GFM 完整支持（ATX/Setext heading、有序/无序/任务列表、缩进+围栏代码块、引用、GFM table、Front Matter、Math、脚注、ToC）|
| 双模式同步 | **三模式共享同一份内部 AST + DOM 表达**，IR/WYSIWYG 走相同 DOM 渲染管线，SV 是双面板（编辑器 textarea + 预览），不互相同步 |
| AI 集成 | ❌ 无原生支持（只有 `hint.extend` 触发 Emoji/@/话题，不含 LLM）|
| 协作 / CRDT | ❌ 无（`comment` 仅批注非协作，本地 localStorage 缓存）|
| 性能 / 体积 | TypeScript 84.1%；按需加载 Lute/highlight.js/mermaid/MathJax；预估 200-300KB minified；预览 debounce 1000ms；图片懒加载 |
| **对 Typola 借鉴点** | **核心借鉴**：IR 模式是 Typola 心流模式 WYSIWYG 体验的灵魂，**不要轻易替换**。但 Typola 的 IR↔CM6 同步方案（typola-gotchas.md #2 受控同步重置光标）需要重新设计，详见第三节洞察 1。 |

### 2. Milkdown + Crepe
| 字段 | 内容 |
|------|------|
| Star / 版本 | 11.6k (core) / v7.21.2 (2026-06-02) |
| 架构定位 | Prosemirror + Remark 双底层 + Yjs；Milkdown 是 headless 框架，Crepe 是其上"开箱即用 block 编辑器"封装 |
| 块级模型 | Heading / List / Code Block / Quote / Table / Image / Divider 等基础块；Crepe 默认带主题 |
| 双模式同步 | ❌ 单模式 WYSIWYG，markdown 通过 Remark 序列化往返，**不是实时双模式** |
| AI 集成 | ❌ 无原生支持（plugin-driven 架构允许自建）|
| 协作 / CRDT | ✅ 原生 Yjs 支持 |
| 性能 / 体积 | TS 92.8%；按需引入 plugin；无公开 benchmark |
| **对 Typola 借鉴点** | Crepe 的"插件装配式"思路可借鉴：把 IR/WYSIWYG/SV 当作三个 plugin 装配到同一个 Core，而不是三个独立编辑器。**不适合直接替换 Vditor**（迁移成本高、IR 体验不如 Vditor）。 |

### 3. TipTap
| 字段 | 内容 |
|------|------|
| Star / 版本 | 37.3k / v3.27.0 (2026-06-17) |
| 架构定位 | Prosemirror 高层封装，headless，框架无关（Vue/React/原生 JS）|
| 块级模型 | 继承 ProseMirror Node/Mark schema，Notion-like block editor 模板内置 |
| 双模式同步 | ✅ **通过 `tiptap-markdown` 扩展（社区）**：markdown ↔ ProseMirror JSON 双向（基于 prosemirror-markdown + markdown-it），但**不是 IR 实时同步**，是 setContent/getContent 模式 |
| AI 集成 | ❌ Pro Extensions 中列为"AI related features"，无 slash/mention/inline 原语 |
| 协作 / CRDT | ✅ 配套 Hocuspocus 后端（基于 Yjs）|
| 性能 / 体积 | TS 99.4%；core 体积按扩展数量线性增长；无公开 benchmark |
| **对 Typola 借鉴点** | `tiptap-markdown` 的"Markdown 序列化/反序列化"思路可借鉴——**关键洞察：TipTap 官方 3.7.0+ 已有官方 markdown 扩展，社区版 `aguingand/tiptap-markdown` 已弃用**。如果将来要换 TipTap 做主编辑器，这是迁移基础。 |

### 4. Lexical
| 字段 | 内容 |
|------|------|
| Star / 版本 | 23.5k / v0.45.0 (2026-05-28) |
| 架构定位 | Meta 出品，immutable state model（time-travel ready），framework-agnostic + React 绑定 |
| 块级模型 | Node 系统（tables/lists/code blocks/images + custom），底层是 recursive frozen tree + DOM reconciler |
| 双模式同步 | ❌ 单模式富文本，editor state 完全可 JSON 序列化（`editor.parseEditorState()`）|
| AI 集成 | ❌ 无原生（GitHub 内部有 `lexical-ai` 闭源）|
| 协作 / CRDT | ✅ 原生 Yjs 集成 |
| 性能 / 体积 | **核心包仅 22KB min+gzip**，跨浏览器 Firefox 115+ / Safari 15+ / Chrome 86+；无公开 benchmark |
| **对 Typola 借鉴点** | **22KB 核心 + immutable state** 这两点是 Typola 心流模式可借鉴的精简思路。但 Lexical 没有 markdown 原生 IR 体验，不能直接替换 Vditor。**用作"AI side panel"嵌入** 比做主编辑器更现实。 |

### 5. BlockNote
| 字段 | 内容 |
|------|------|
| Star / 版本 | 9.8k / v0.51.4 (2026-06-02) |
| 架构定位 | **Notion-style block editor**，建于 Prosemirror + TipTap 之上；Block schema 自有（id/type/props/content/children），底层映射到 PM schema |
| 块级模型 | 强 block 抽象（5 属性 Block 类型 + InlineContent 体系），支持 Column / Table / 多列 |
| 双模式同步 | ❌ 单模式 block，markdown 通过自定义序列化器；**不是实时双模式** |
| AI 集成 | ✅ **原生 AI Extension**（`@blocknote/xl-ai`）：slash menu + formatting toolbar 选区触发 + Vercel AI SDK + streaming + Human-in-the-loop + 多模型（OpenAI/Anthropic/Mistral/Llama） |
| 协作 / CRDT | ✅ `withCollaboration()` 包装 Yjs |
| 性能 / 体积 | TS 主体；体积未公开；接近 TipTap + 自有 Block 抽象层 |
| **对 Typola 借鉴点** | **AI 集成原语最完整、最可借鉴**：slash menu + 选区 toolbar + streaming diff + invokeAI({userPrompt, useSelection, streamToolsProvider}) 三件套，是 Typola 心流模式 AI 的目标态。**但 BlockNote 没有 IR 体验**，要做主编辑器需放弃心流模式。 |

### 6. Plate
| 字段 | 内容 |
|------|------|
| Star / 版本 | 16.4k / v53.2.2 (2026-06-17) |
| 架构定位 | **AI-first** 富文本编辑器，建于 Slate.js 之上；shadcn/ui 风格组件库 |
| 块级模型 | Slate schema，标准 block + table/media/math/comment 全套 |
| 双模式同步 | ❌ 单模式富文本，markdown 序列化通过第三方插件 |
| AI 集成 | ✅ **原 `@udecode/plate-ai`**：slash command 触发 AI 操作（fix grammar / summarize / translate / change tone），基于 combobox/mention 模式，inline void element + combobox trigger |
| 协作 / CRDT | ✅ 自带 collaboration 包（基于 Yjs）|
| 性能 / 体积 | TS 69.5%；体积未公开 |
| **对 Typola 借鉴点** | **`@platejs/ai` 的 slash command 架构**最成熟：trigger 字符 + combobox + 异步 invoke + 流式写入，是 Typola 心流模式斜杠命令的参考实现。**但 Slate 性能比 Prosemirror 弱**，大型文档下不占优。 |

### 7. Novel
| 字段 | 内容 |
|------|------|
| Star / 版本 | 16.3k / v1.0.2 (2025-02-11) |
| 架构定位 | **Notion-style WYSIWYG + AI-powered autocompletions**，TipTap + Vercel AI SDK + Next.js + TailwindCSS |
| 块级模型 | 继承 TipTap node schema，简化 block 集合 |
| 双模式同步 | ❌ 单模式（AI 驱动的自动补全是核心，不是模式切换）|
| AI 集成 | ✅ slash command 触发 AI 自动补全（OpenAI 流式）|
| 协作 / CRDT | ❌ 无原生 |
| 性能 / 体积 | TS 92.4%；体积未公开 |
| **对 Typola 借鉴点** | **AI 自动补全（autocompletion streaming）**的 UX 模式可借鉴：用户输入中触发，不需要点击，但需要光标附近 inline widget。和 BlockNote/Plate 互补。**项目已 1 年未大更新，慎用做主依赖**。 |

### 8. Yjs
| 字段 | 内容 |
|------|------|
| Star / 版本 | 22k / v13.6.31 (2026-05-28) |
| 架构定位 | CRDT 数据结构（YATA 算法变种 + Lamport 时间戳），框架无关 |
| 块级模型 | 共享类型：`Y.Text` / `Y.XmlFragment` / `Y.Array` / `Y.Map`，所有富文本编辑器通过绑定库转译 |
| 双模式同步 | ✅ **Yjs 双向同步原语**：`doc.on('update', u => Y.applyUpdate(other, u))` 即可，update 满足 commutative + idempotent |
| AI 集成 | ❌ 无（与 AI 无关）|
| 协作 / CRDT | ✅ 自身就是 CRDT 实现 |
| 性能 / 体积 | JS 98.8%；核心 + y-websocket + y-indexeddb 按需引入；Proton Docs/Linear/AWS SageMaker/NextCloud/Typst 在用 |
| **对 Typola 借鉴点** | **如果将来 Typola 要做本地多端同步 / 团队协作**，Yjs 是事实标准。但当前 Skill OS 阶段 Typola 是单机单用户，**短期不需要**。 |

### 9. CodeMirror 6
| 字段 | 内容 |
|------|------|
| Star / 版本 | 7.8k（dev repo 已归档 2026-04-15，转 code.haverbeke.berlin/codemirror/dev） |
| 架构定位 | EditorState（immutable）/ View 分离，precise selection 跟踪，monorepo 多包架构 |
| 块级模型 | 通过 `@codemirror/language` + `foldGutter` + `indentOnInput` + 自定义 StateField 实现块级折叠、装饰 |
| 双模式同步 | ❌ 单模式源码编辑器，markdown 是当作纯文本 |
| AI 集成 | ❌ 无原生（社区有 `codemirror-ai` 第三方）|
| 协作 / CRDT | ✅ 社区 `y-codemirror`（基于 Yjs）|
| 性能 / 体积 | 按包引入；增量更新；高性能长文档 |
| **对 Typola 借鉴点** | **Typola 源码模式已经用 CM6，是正确选择**。关键点：CM6 的 `EditorView` 是不可变 state 模型，与 Lexical 思路一致，**比 Lexical 更适合 markdown 源码编辑**（Lexical 没有 source 模式）。 |

### 10. Monaco Editor
| 字段 | 内容 |
|------|------|
| Star / 版本 | 46.2k / v0.55.1 (2025-11-20) |
| 架构定位 | VSCode 源码直接生成（加 browser shim），不支持 VSCode 扩展（仅 LSP-based JS 扩展可能兼容）|
| 块级模型 | 通过 `IModelDeltaDecoration` 实现装饰器，无原生 block 概念 |
| 双模式同步 | ❌ 单模式代码编辑器 |
| AI 集成 | ⚠️ 内置 inline suggestion 框架（VSCode Copilot 形态），但属于语言服务层 |
| 协作 / CRDT | ✅ `y-monaco` 社区 |
| 性能 / 体积 | JS 56.9%；按语言加载 worker；体积较大；LSP 在 Web Worker 运行 |
| **对 Typola 借鉴点** | **不适合做 Typola 主编辑器**（体积过大、面向 IDE 不是文档）。但如果 Skill OS 需要"代码块编辑 + AI inline suggestion"，Monaco 的 LSP + inline suggestion 框架可借鉴（通过自建 thin wrapper）。 |

---

## 二、架构对比矩阵

| 编辑器 | 底层数据模型 | markdown 路线 | 实时双模式 | AI 原生 | Yjs | 核心体积 | 维护活跃度 |
|--------|------------|-------------|----------|--------|-----|---------|----------|
| Vditor | 自研 AST + DOM | Lute 引擎 | ✅ 三模式内部 | ❌ | ❌ | ~250KB | 中（2025-09）|
| Milkdown/Crepe | Prosemirror + Remark | Remark 序列化 | ❌ | ❌ | ✅ | 未公开 | 高（2026-06）|
| TipTap | Prosemirror | markdown extension | ❌ | ❌ | ✅ | 中 | 极高（2026-06）|
| Lexical | 自研 immutable node | 自有 JSON | ❌ | ❌ | ✅ | **22KB** | 高（2026-05）|
| BlockNote | Prosemirror + Block schema | 自有序列化 | ❌ | ✅✅ | ✅ | 中 | 高（2026-06）|
| Plate | Slate | 第三方插件 | ❌ | ✅✅ | ✅ | 中 | 高（2026-06）|
| Novel | TipTap + Vercel AI SDK | 同 TipTap | ❌ | ✅ | ❌ | 中 | 低（2025-02）|
| Yjs | CRDT | N/A | ✅ 双向同步 | ❌ | 自身 | 小 | 极高（2026-05）|
| CodeMirror 6 | EditorState + View | N/A（纯文本）| N/A | ❌ | ✅ y-codemirror | 小 | 高（已归档 dev repo）|
| Monaco | VSCode 模型 | N/A（纯文本）| N/A | ⚠️ LSP 层 | ✅ y-monaco | 大 | 中（2025-11）|

**关键观察**：
- **唯一支持"实时双模式"的是 Vditor**（三模式内部 AST 共享），其他都是"单编辑器 + markdown 序列化往返"。这是 Vditor 不可替代的根本原因。
- **AI 原生只 BlockNote + Plate**，且都是 WYSIWYG single-mode 路线，没有 IR 体验。
- **Lexical 核心 22KB 是性能标杆**，但与 markdown IR 体验冲突。

---

## 三、重点洞察

### 洞察 1：Vditor IR ↔ CM6 source 同步是 Typola 独有难题，业界没有更优解

**业界事实**：
- TipTap 的 `tiptap-markdown` 是 setContent/getContent 级别的双向（不是逐字符 IR 同步）。
- BlockNote / Lexical / Milkdown 都放弃了"实时双模式"，只做"单编辑器 + 序列化往返"。
- Yjs 可以做"双编辑器数据共享"，但**需要两个编辑器都基于 Yjs 兼容 schema**，CM6 通过 `y-codemirror` 支持，Vditor 不支持（无 Yjs 绑定）。
- **真正做实时 IR ↔ source 同步的只有 Vditor 三模式**（通过共享内部 AST + DOM），Typola 是把 Vditor IR 和 CM6 source 并列起来，相当于"两个独立编辑器数据同步"——这是 100% 自研难题。

**Typola 当前踩的坑**：
- `typola-gotchas.md #2` 已记录：Vditor 受控同步（React state ← Vditor.getValue()）会重置光标，因为 IR 模式 re-render 时 AST diff 会重建 DOM。
- 根本原因：**IR 模式下 Vditor 内部维护 contenteditable DOM + AST**，React 受控组件强行接管 value 触发 AST 重建 → 光标丢失。

**三个可选方案**：

#### 方案 A（推荐）：接受"快照式同步"，放弃逐字符实时
- 切换模式时一次 setValue/getValue，中间不双向同步
- 用户在 IR 模式下编辑 = 单向流入 Vditor，切换到源码模式时一次性 getValue → 同步到 CM6
- **代价**：用户在源码模式改完切回 IR，光标位置丢失（除非额外保存光标 offset）
- **收益**：彻底绕开受控同步的坑，工程量最小

#### 方案 B：保留 IR 主地位，源码模式改为只读预览
- 源码模式用 CM6 渲染**只读视图**（`EditorView({state, editable: () => false})`）
- 用户在 IR 写完，可以"查看 markdown 源码"（只读 + 语法高亮），但不能编辑
- **代价**：用户不能在源码模式直接修改（违背 Typola 当前定位）
- **收益**：彻底解决同步问题

#### 方案 C：自研 IR ↔ source 双向 diff
- 自己实现 markdown AST diff（基于 unified / remark-parse + remark-stringify）
- 每次 IR 模式输入事件 → 拿到 Vditor markdown → diff → apply 到 CM6；反向同样
- **代价**：开发量大（要维护两套光标映射 + AST diff），且会与 Vditor 内部 IME 处理冲突
- **收益**：理论上是"最优雅"的实时同步，但实际产品很少这么干

**结论**：**采用方案 A**。理由：
1. 业界没有现成的"实时双模式"案例可以抄
2. 方案 C 投入产出比极低，且会引入新的不可预测 bug
3. 方案 A 工程量小（半天内改完），与 Skill OS 路线（M1-M4）当前阶段匹配
4. 切换模式时光标丢失是已知 trade-off，文档明示即可

### 洞察 2：AI 编辑器 vs AI 工作台的边界

**关键区分**：
- **AI 编辑器**（BlockNote / Plate / Novel）：编辑器是主角，AI 是编辑动作（选中 → AI 修改 / slash → AI 插入 / inline → AI 补全）。用户**始终在编辑文档**。
- **AI 工作台**（OpenDesign ChatPane / Typola Skill OS）：**对话是主角**，文档/产物是 AI 输出结果。用户**主要在对话**，编辑器是输出面板。

**BlockNote/Plate/Novel 的 AI 原语**（slash + 选区 + streaming）**在 Typola Skill OS 仍适用**，但角色翻转：
- BlockNote：AI 在编辑器内，slash menu 触发"插入 AI 生成内容"
- Typola：AI 在工作台中央，slash menu 触发"插入到侧边编辑器"或"调用 skill"

**借鉴点**：
- **slash menu 选型**：用 `@floating-ui/react` + `@blocknote/xl-ai` 的 `SuggestionMenuController` 模式（trigger 字符 + 异步过滤 + command palette）
- **选区触发 AI**：把 BlockNote 的 `invokeAI({userPrompt, useSelection})` 概念移植到 Typola——AI 命令接收"当前 Vditor 选区"作为上下文
- **streaming 渲染**：BlockNote 的 `streamToolsProvider` 模式（add/delete/update 三种工具调用）可以映射到 Typola 的"AI 流式写入场景卡"

**结论**：**Typola 不需要换编辑器**。Vditor IR + CM6 + 自建 AI 工作台（侧栏对话 + 场景卡）是更合理组合。借鉴 BlockNote 的 AI 原语设计，**不要借鉴 BlockNote 的 block 模型**。

### 洞察 3：块级模型（Notion-style）不是文档 AI 工作台标配

**事实**：
- Notion / BlockNote / Plate 用 block-based（每个 block 是独立对象，AI 可针对 block 操作）
- Obsidian / Logseq / Typora / Vditor 用 markdown-based（整篇是文本，AI 操作的是字符串）
- **CRDT 协作场景**：block-based 优势明显（每个 block 可独立 conflict 解决）
- **AI 工作台场景**：block-based 不显著优于 markdown（AI 输出的还是 markdown 文本）

**对 Typola 的判断**：
- Skill OS 输出物是 markdown 文档（按场景分类：PRD / 报告 / 调研 / 故事等）→ **markdown 模型天然契合**
- 单用户单机使用 → 不需要 CRDT/block 独立协作
- 当前心流模式已经支持"在 markdown 流中插入 AI 内容" → 已经是事实上的 AI 编辑
- **结论：不需要切换到 block 模型**。在 Vditor IR 模式 + 自建 slash menu + 选区 AI 上投入更划算。

---

## 四、关键架构细节（来自源码/文档深读）

### Vditor IR 模式实现（typola-gotchas #2 根因）

IR 模式核心流程：
```
User input → input event → Lute (WASM) parse → AST
    → diff vs 旧 AST → patch DOM (contenteditable)
    → 保存 Selection/Range → 重新 setBaseAndExtent 恢复光标
```

**冲突点**（受控同步重置光标的根因）：
- React 组件 `value` prop 变化 → Vditor `setValue(value)` → 触发完整 AST 重建
- 用户正在 IME 输入（中文/日文 composition）时，AST 重建会打断 compositionend
- 光标恢复算法对"中途替换"不健壮

**修复模式**（typola-gotchas #2 已记录）：
- 区分"用户输入"（让 Vditor 自己处理，不重置 value）和"外部更新"（如切换场景、加载历史），只在外部更新时 setValue
- 使用 `inputRef.current?.getValue()` 反向同步而不是受控 value

### BlockNote AI 命令系统（最完整 AI 原语实现）

```typescript
// 1. 自定义 AI 命令
const makeInformal = {
  key: "make_informal",
  title: "Make Informal",
  aliases: ["casual", "relaxed"],
  icon: <SmileIcon />,
  onItemClick: async ({ editor, aiResponseStatus, setMenuOpen }) => {
    await editor.getExtension(AIExtension)?.invokeAI({
      userPrompt: "Make this more casual and informal",
      useSelection: true,  // 关键：仅使用选中文本
      streamToolsProvider: aiDocumentFormats.html.getStreamToolsProvider({
        defaultStreamTools: { add: false, delete: false, update: true },
      }),
    });
  },
};

// 2. Slash menu 挂载
<BlockNoteView slashMenu={false} /* ... */>
<SuggestionMenuController
  triggerCharacter="/"
  getItems={async (query) => filterSuggestionItems(getSlashMenuItemsWithAI(editor), query)}
/>
```

**关键原语**：
- `useSelection: true` → AI 仅用选中文本作为上下文
- `streamToolsProvider` 三种工具调用（add/delete/update） → AI 可流式增删改块
- `aiResponseStatus: "user-input" | "thinking" | "ai-writing" | "error" | "user-reviewing" | "closed"` → UI 状态机
- Formatting Toolbar 选区触发 + Slash Menu 全局触发，两种入口共用同一个命令池

**对 Typola 的具体映射**：
- `useSelection` → Vditor 的 `getSelection()`（已选中文本作为上下文）
- `streamToolsProvider` → Typola 工作台场景卡的"流式写入"（add = 插入段落 / delete = 删除选区 / update = 替换选区）
- Formatting Toolbar 选区触发 → Typola 选中文本后浮动"AI 操作"菜单（沿用 typola 已有"心流 AI 操作"扩展点）

---

## 五、对 Typola Skill OS 的可集成点（按 ROI 排序）

| 排名 | 集成点 | 来源项目 | ROI | 工作量 | 优先级 |
|------|--------|---------|-----|-------|-------|
| 1 | **方案 A：IR ↔ source 快照式同步**（替代逐字符实时） | 自我分析 | 极高 | 0.5 天 | P0 |
| 2 | **AI 选区触发原语**（`useSelection` 概念 + invokeAI 命令） | BlockNote AI | 高 | 1 天 | P0 |
| 3 | **Slash menu 命令面板**（trigger `/` + 异步过滤） | BlockNote / Plate | 高 | 1 天 | P0 |
| 4 | **AI 流式写入场景卡**（streamToolsProvider 三件套 add/delete/update） | BlockNote AI | 高 | 1.5 天 | P1 |
| 5 | **AI 命令池（command palette）**：选区触发 + slash 触发共用 | BlockNote AI | 高 | 0.5 天 | P1 |
| 6 | **Lexical 思路：immutable state 模型**用于 Skill OS 工作台内部状态 | Lexical | 中 | 2 天 | P2 |
| 7 | **Yjs 离线优先本地缓存**（y-indexeddb，未来协作预埋） | Yjs | 中 | 1 天 | P3 |
| 8 | **CodeMirror 6 装饰器**用于 AI 写入位置高亮（diff 视图） | CodeMirror 6 | 中 | 1 天 | P2 |
| 9 | **Milkdown plugin 装配思路**：Vditor IR / WYSIWYG / SV 三个 plugin | Milkdown | 低 | 3 天 | P3 |
| 10 | **BlockNote AI 的 Vercel AI SDK 集成**作为 Typola LLM 抽象层参考 | BlockNote / Novel | 中 | 1 天 | P2 |

**P0 紧急**（立即可做）：
- **#1 IR ↔ source 同步方案 A**：解决 typola-gotchas #2 的受控同步问题，是当前最痛的点
- **#2 AI 选区触发**：把 BlockNote 的 `useSelection` 概念移植到 Vditor 心流模式
- **#3 Slash menu 命令面板**：Skill OS 当前的场景分类 + skill 引用已经有这个雏形，需要规范化交互

**P1 重要**（下一里程碑）：
- **#4 #5 AI 流式写入场景卡 + 命令池**：把 Skill OS 场景卡的"流式渲染"与 BlockNote 的 streamToolsProvider 对齐

**P2 / P3 备选**（视情况）：
- **#6 immutable state**：仅在 Skill OS 工作台内部状态变得复杂时考虑
- **#7 Yjs**：单用户阶段不急，做协作时再上
- **#8 #9 #10**：锦上添花，不阻塞主线

---

## 六、不做的事（明确放弃）

1. **不切换到 TipTap / BlockNote / Lexical**：Vditor IR 是 Typola 心流模式灵魂，迁移成本远大于收益。
2. **不做实时 IR ↔ source 双向 diff**：业界无案例，工程量大，ROI 低。
3. **不引入 block-based 模型**：Skill OS 输出物天然是 markdown，block 模型不增益。
4. **不引入 Yjs 做主同步**：当前单用户单机，Yjs 是协作预埋不是当前必需。
5. **不做 Monaco 集成**：体积过大、面向 IDE，与文档工作台定位不符。

---

## 七、参考来源

### 项目 README / GitHub
- [Vditor](https://github.com/Vanessa219/vditor)
- [Milkdown](https://github.com/Milkdown/milkdown) + [Crepe 包](https://github.com/Milkdown/milkdown/tree/main/packages/crepe)
- [TipTap](https://github.com/ueberdosis/tiptap)
- [Lexical](https://github.com/facebook/lexical)
- [BlockNote](https://github.com/TypeCellOS/BlockNote)
- [Plate](https://github.com/udecode/plate)
- [Novel](https://github.com/steven-tey/novel)
- [Yjs](https://github.com/yjs/yjs)
- [CodeMirror dev](https://github.com/codemirror/dev)（已归档）
- [Monaco Editor](https://github.com/microsoft/monaco-editor)

### 项目文档
- [BlockNote AI 文档](https://www.blocknotejs.org/docs/features/ai)
- [BlockNote Document Structure](https://www.blocknotejs.org/docs/editor-basics/document-structure)
- [BlockNote Collaboration](https://www.blocknotejs.org/docs/features/collaboration)
- [Milkdown 官网](https://milkdown.dev/)
- [Lexical 文档](https://lexical.dev/docs/intro)

### 关键扩展
- [tiptap-markdown（社区）](https://github.com/aguingand/tiptap-markdown)（TipTap 3.7.0+ 已有官方 markdown 扩展）

### Typola 内部
- [AI_WORKBENCH_SKILL_OS.md](../../../AI_WORKBENCH_SKILL_OS.md) — Skill OS M1-M4 路线
- [competitive-research.md](../2026-06-16-competitive-research/competitive-research.md) — 产品级竞品
- [typola-gotchas.md](../../../CLAUDE.md) — Vditor 受控同步重置光标踩坑

### 记忆引用
- [typola-gotchas.md] Tauri confirm 不可靠、Vditor 受控同步重置光标、lazy+forwardRef bridge stale ref、workspace watcher 缺 event kind、claude 权限全在终端
