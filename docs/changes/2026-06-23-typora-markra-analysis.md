# Typora 能力补齐 + Markra 能力借鉴 + 下一阶段竞争力补齐计划

**日期**: 2026-06-23
**整合自**: 3 个子 agent 调研
- Agent 1: Typora 能力差距清单(10 个类别)
- Agent 2: `D:\AI\workspace\markra` 深度代码分析(10 条借鉴)
- Agent 3: Typola v0.3.21 现状能力清单(28 Tauri commands, Skill OS M1/M2)

**复核状态**:
- Markra 关键文件已读:`packages/editor/src/ai-preview.ts`(ProseMirror DecorationSet 实现 Diff Preview),`packages/ai/src/agent/tools/index.ts`(17 个 tool factory)
- Typola 现状已交叉验证:src-tauri/src/lib.rs(2148 行, 28 commands),src/app/AppLayout.tsx(1368 行)

---

## 第一部分: Typora 能力差距清单(分优先级)

Typora 能力按 10 个类别分桶,**🔴 必补(护城河) / 🟡 应补(体验补齐) / 🟢 可选(锦上添花)**:

| 类别 | Typora 能力 | Typola v0.3.21 | 优先级 | 落地建议 |
|---|---|---|---|---|
| **4-导出** | PDF 导出 / Pandoc 多格式 / 图像导出 | ❌ 无(只有 HTML preview) | 🔴 | **Typst 本地导出 PDF**(沿用 2026-06-20 报告);次期加 HTML/Pandoc |
| **2-视图** | Focus / Typewriter / 全屏 | ❌ 无 | 🔴 | CSS 三个 mode + toolbar 开关, 2-3 天 |
| **1-语法** | smartypants / 严格模式 / 公式编号 | ❌ 部分(Vditor 自带) | 🔴 | Vditor 已支持大部分, 缺"严格 CommonMark"开关 + 公式编号 |
| **8-工具** | 命令面板 / Snippet / 字符计数 | ❌ 无 | 🟡 | 命令面板(Claude Code 风格 ⌘K)+ Snippet 模板库 + 行/词/字符统计 |
| **6-搜索** | 全局搜索 / 跨文件锚点 | ❌ 只有当前文件 | 🟡 | ripgrep 集成 + 跨文件 anchor `[#id](file.md#id)` |
| **3-文件** | 最近文件 / 自动保存 / 版本历史 | ⚠️ 部分(自动保存有, 最近文件无) | 🟡 | workspace.db + 30s 间隔版本快照 |
| **7-图像** | 拖拽粘贴 / 复制粘贴 / 相对路径 | ⚠️ 有基础(粘贴), 缺拖拽多文件 | 🟡 | dropzone 多文件 + 重命名规则 |
| **5-主题** | 主题商店 / CSS 变量 / 字间距行距 | ⚠️ 4 个内置主题, 缺商店 | 🟢 | 主题 JSON 导入/导出 + ui 调节面板 |
| **9-协作** | Typora 实际无; 不算差距 | — | 🟢 | 不做 |
| **10-插件** | 无官方插件系统 | — | 🟢 | 不做(避免变成 IDE) |

### 🔴 必补(护城河)清单 M3

1. **PDF 导出**(Typst 本地路径, 沿用 2026-06-20 报告)
2. **Focus / Typewriter / 全屏** 三个 mode
3. **严格 CommonMark 开关** + 公式编号
4. **命令面板 ⌘K**

### 🟡 应补(体验补齐)清单 M4

5. **全局搜索**(ripgrep)+ 跨文件锚点
6. **workspace.db** + 版本快照
7. **拖拽多文件上传**
8. **Snippet 模板库**

---

## 第二部分: Markra 能力借鉴清单(10 条 + 3 个最关键)

Markra 是 **Tauri v2 + React 19 + Milkdown(ProseMirror)+ pnpm workspace + AGPL-3.0** 的直接对位项目。我读了它的关键源码确认了以下几点:

| # | Markra 做法 | 对我们价值 | 文件路径 | 优先级 |
|---|---|---|---|---|
| 1 | AppRuntime contract(web/desktop 共用同一套业务接口, 内部各自 bridge) | 已有(我们的 AppLayout/utils 模式相同), 但 Markra 抽得更彻底 | `packages/app/src/runtime/index.ts` | 低(参考但不重做) |
| **2** | **AI diff preview: 用 ProseMirror DecorationSet 把 AI 建议的 replacement 行内渲染成绿色"待应用"块, 用户逐块 Apply / Reject** | **直接可用: Vditor 受控同步已经够稳, 但缺"先看后用"的 trust 层** | `packages/editor/src/ai-preview.ts:113-150` | **🔴 关键** |
| **3** | **AI Agent 工具化: 17 个领域工具(createDocumentAgentTools), 每个工具都有 name/params/returns, AI 可以调度** | **直接可用: 我们 Skill OS M1 的 5 个 tool renderers 是渲染, Markra 是把工具交给 AI 调度** | `packages/ai/src/agent/tools/index.ts:20-43` | **🔴 关键** |
| **4** | **Process Trace UI: 从 agent 的 tool_calls / tool_results 渲染成可视化的 timeline(每个 step 一行, 带状态、耗时、输入输出折叠)** | **直接可用: 我们的 headless stream-json 已经有事件流, 只差一个 Trace UI** | `packages/ai/src/agent/` | **🔴 关键** |
| 5 | WYSIWYG + Source 模式切换(Milkdown 自带) | 我们已经有(Vditor instant + CodeMirror 6 source) | — | 低 |
| 6 | Inline AI command bar(选中文本后浮出"重写/扩写/翻译"按钮) | 直接借鉴: 把 AssistantMessage 的"插入到文档"变成内联 floating bar | `packages/editor/src/` | 🟡 |
| 7 | 上下文菜单直接集成 AI 动作(右键"用 AI 重写这段") | 我们已经有部分, 缺完整动作集 | `packages/app/src/runtime/context-menu-items.ts` | 🟡 |
| 8 | AI provider 多端点(OpenAI/Anthropic/Ollama/自定义) | 我们走 headless Claude, 这条路径不同 | — | 不做 |
| 9 | WebDAV 同步 + 远程图床(可选) | 我们 Skill OS 阶段不做云 | — | 不做 |
| 10 | Lucide-react 图标 + Tailwind(AGENTS.md 明确) | 我们已有 lucide-react, 不用 Tailwind(自有 CSS tokens) | — | 低 |

### 3 个最关键的借鉴点(都是 🔴)

#### 借鉴 #2: AI Diff Preview(先看后用)

- **Markra 做法**: `ai-preview.ts` 用 ProseMirror DecorationSet 把 replacement 渲染成绿色 ghost 块, 用户 Apply/Copy/Reject 三个按钮逐块处理
- **Typola 落地**:
  - Vditor 没有 ProseMirror 的 DecorationSet, 但 Vditor 有 `afterRender` hook + insertHTML 能力
  - 方案: AI 回复带 `proposedChange` 标记 → 在 Vditor 的当前光标位置渲染 `<span class="ai-pending">…</span>` 块, 带 Accept/Reject 按钮 → 用户点 Accept 才真正写入 Vditor
  - 工作量: **3-5 天**(挂在 Skill OS M2 的"产物回流"扩展上)
  - 用户价值: **直击"AI 不敢用"的痛点**, 任何 AI 编辑类功能都必须有这一层

#### 借鉴 #3: AI Agent 工具化(17 个 tool factory)

- **Markra 做法**: `createDocumentAgentTools(context)` 把 16 个文档操作工具 + 1 个 web search 工具注入到 `pi-agent-core`
- **Typola 落地**:
  - 当前 Skill OS M1 的"5 个 tool renderers"是被动渲染(AI 输出的 XML 我们解析), 不是 AI 主动调度
  - 改造路径: 写一份 `createTypolaAgentTools()`, 工具集最小 8 个:
    - `read_file` / `list_files` / `search_files` / `insert_at_cursor` / `replace_selection` / `apply_diff` / `insert_artifact` / `search_web`(可选)
  - 协议用 Anthropic Tool Use(因为我们走 headless Claude)
  - 工作量: **5-7 天**(新增 `src/services/agent/tools/` 目录 + Tool Use 协议接入 headless)
  - 用户价值: **从"AI 只能聊天"变成"AI 能帮我改文件"**, 这是 Skill OS M3 的真正跃迁

#### 借鉴 #4: Process Trace UI(透明的过程)

- **Markra 做法**: 每次 Agent 运行, 把每个 tool_call + tool_result 渲染成 timeline, 带状态(spinner/check/error)、耗时、输入输出折叠
- **Typola 落地**:
  - 我们 headless Claude 的 stream-json 已经在收 `tool_use` / `tool_result` 事件
  - 当前 `ConversationPanel` 只显示文本消息, 事件流被吞了
  - 新增 `<ProcessTrace steps={...} />` 组件, 挂在 `AssistantMessage` 下方折叠区
  - 工作量: **2-3 天**(纯前端, 数据已经在了)
  - 用户价值: **"AI 在干嘛我看得见"**, 降低对 AI 的不信任

---

## 第三部分: 下一阶段竞争力补齐计划(M3 / M4 / M5)

### M3 — 护城河补齐(6-8 周, 2 人)

| 周次 | 模块 | 内容 |
|---|---|---|
| W1-W2 | **PDF 导出** | Typst 集成(沿用 2026-06-20 报告) |
| W2-W3 | **AI Diff Preview** | 借鉴 Markra #2, Vditor ghost block |
| W3-W4 | **Process Trace UI** | 借鉴 Markra #4, 折叠 timeline |
| W4-W6 | **视图模式** | Focus / Typewriter / 全屏 + 命令面板 ⌘K |
| W6-W8 | **语法增强** | 严格模式开关 + 公式编号 |

- **M3 完成后 Typola 相对 Typora 的差距**: 从"约 60%" 提升到 "约 85%"
- **M3 完成后 Typola 相对 Markra 的差距**: 从"明显领先(M1 Skill OS)" 变成"全面领先(Diff Preview + Process Trace + 工具化 Agent)"

### M4 — 体验补齐(4-6 周)

| 模块 | 内容 |
|---|---|
| Agent 工具化 | 借鉴 Markra #3, 8 个 tool factory + Tool Use 协议 |
| 全局搜索 | ripgrep + 跨文件锚点 |
| 版本历史 | workspace.db + 30s 快照 |
| 拖拽多文件 | dropzone + 重命名规则 |
| Inline AI bar | 借鉴 Markra #6 |

### M5 — 长尾(4-6 周)

| 模块 | 内容 |
|---|---|
| Snippet 模板库 | 用户自定义文本片段 |
| 主题商店 | CSS 变量导入/导出 |
| PDF 导入(LiteParse) | ⚠️ 等 crates.io 版本追上再说(MEMORY.md 记录的踩坑) |
| 多端点 AI | OpenAI / Ollama / 自定义(可选) |

---

## 第四部分: 不做清单(避坑)

- ❌ **不做协作**(Typora 也没做, 不是护城河)
- ❌ **不做插件系统**(避免变成 IDE, 护城河是"开箱即用的写作流")
- ❌ **不做云同步 / WebDAV**(Typola 是 local-first)
- ❌ **不做移动端**(聚焦桌面端)
- ❌ **不做 PDF 导入**(LiteParse 当前 crates.io 版本落后, 已搁置)
- ❌ **不做 Tailwind 改造**(我们有自有 CSS tokens 体系)

---

## 第五部分: M3 决策清单(等用户确认)

### 待评估项(没做的, 等用户指示是否补进)

#### A. 实施可行性补漏

- [ ] **A1**: Vditor Diff Preview 的具体 API 调研(`afterRender` hook 怎么拿到当前光标位置, ghost block 怎么渲染到 Vditor 即时模式而不破坏 markdown 源)
- [ ] **A2**: Anthropic Tool Use 协议在 headless Claude stream-json 里的具体事件格式(`tool_use` / `tool_result` 字段长什么样, 怎么和 stream-json 对齐)
- [ ] **A3**: Typst crate 选型(`typst-as-lib` vs `typst` 直接依赖 vs `pdfium-render`), 哪个对 Tauri bundle 友好
- [ ] **A4**: ripgrep 在 Tauri 侧的集成方式(子进程 vs 静态链接 `grep-cli` crate)

#### B. 漏掉的竞争对比

- [ ] **B1**: **Vditor vs Milkdown 迁移评估**: Markra 用 Milkdown(ProseMirror), 我们用 Vditor。如果长期 Agent 工具化深入, Vditor 的"以 markdown 字符串为中心"模型会成为瓶颈(无法做精确的 block-level 操作)。要不要评估迁 Milkdown?
- [ ] **B2**: **Obsidian 的 backlink / graph view**: 我们 6 竞品里点过, 没补进 M3。要不要做"反向链接"?
- [ ] **B3**: **iA Writer 的 focus mode + sentence highlighting**: Typora 抄了 iA, 但 Markra 没抄。Sentence highlighting(当前句高亮)是 iA 的差异化, 要不要做?
- [ ] **B4**: **Zettlr 的 citation / Zotero 集成**: 学术用户场景, 我们走不通, 不做。

#### C. 用户场景清单

- [ ] **C1**: Typola 现在的核心用户是谁?(中文写作 / 技术文档 / 学生笔记 / 自媒体?)
- [ ] **C2**: M3 的优先级应该按用户场景排序, 而不是按"Typora 抄不抄得到"

### 决策项

| # | 决策点 | 选项 | 待用户确认 |
|---|---|---|---|
| 1 | M3 是否现在启动? | 是 / 否 / 延后 | ⏳ |
| 2 | 借鉴 Markra 是抄实现还是抄设计? | AGPL-3.0 不能直接抄代码, 只能学设计 | ✅ 默认 |
| 3 | M3 工期 6-8 周、2 人, 是否投入? | 影响 v0.4 vs v0.5 版本节奏 | ⏳ |
| 4 | 是否评估 Vditor → Milkdown 迁移? | 工作量巨大(B1), 但长期价值高 | ⏳ |
| 5 | M3 第一个里程碑先做哪个? | 见下方候选 | ⏳ |

### M3 第一个里程碑候选

| 候选 | 工作量 | 用户价值 | 依赖 |
|---|---|---|---|
| A. **Diff Preview + Process Trace**(借鉴 Markra) | 5-8 天 | 🔴 最高("AI 敢用") | Skill OS M2 收尾 |
| B. **PDF 导出**(沿用之前研究) | 5-7 天 | 🟡 高("Typora 用户迁移") | Typst crate 选型 |
| C. **A + B 并行** | 10-15 天 | 🔴 最高 | 需 2 人并行 |
| D. **视图三件套**(Focus/Typewriter/全屏) | 2-3 天 | 🟡 中("小里程碑暖身") | 无 |

---

## 第六部分: M3 决策补漏(A1+A2+B1+C1 子 agent 调研)

**调研日期**: 2026-06-23
**触发**: 用户指示"把没做的补到这份里一起评估", 起 4 个子 agent 分别就 A1(Vditor Diff Preview API)、A2(Anthropic Tool Use stream-json 协议)、B1(Vditor vs Milkdown 迁移评估)、C1(用户画像)做深挖

---

### F-A1: Vditor Diff Preview 实施可行性

#### 结论

**方案 D(浮层 Overlay)+ Accept 用 `insertMD` 局部写入** 是唯一可行路径, 工作量 **1.5-2 人天**, **比原报告估的 3-5 天小**。

#### 证据

**Vditor 没有装饰层 / 命令系统**:
- `node_modules/vditor/src/ts/wysiwyg/input.ts:13-212` 每次输入触发后, 第 47-49 行**清除 `blockElement` 内所有 `[style]` 属性**, 第 93-148 行 `blockElement.outerHTML = html` **整块重写** → **任何在 block 内部插入的非源 DOM 元素会被擦掉**
- `node_modules/vditor/src/index.ts:553-555` 的 `after()` hook 只在初始化时触发一次, **不是每次渲染**
- `input` hook 走 800ms 节流(`ts/wysiwyg/afterRenderEvent.ts:12-40`), 不能作为实时渲染 hook

**公开 API 盘点**(`index.ts:132-355`):
- `getCursorPosition(): { left, top }` — 屏幕像素坐标, 不是 block/offset
- `getSelection(): string` — 只返回选中文本
- `setValue(md, clearStack)` — 整 doc 重渲染 + **光标丢失到开头**
- `insertMD(md)` — 局部插入, 走 lute 渲染管线
- `insertValue(value, render)` — 插入 HTML
- **没有 transaction API, 没有 setSelection 公开方法**
- 内部有 `getEditorRange(vditor)` (`ts/util/selection.ts:5-22`), 但 **未 export**

#### 4 条路径评估

| 路径 | 可行性 | 失败原因 |
|---|---|---|
| A. markdown 源加注释 + 视觉处理 | ❌ | `lute.SetSanitize(true)` 默认开启, 自定义 data 属性被剥 |
| B. insertValue + 自定义按钮 | ❌ | 走 lute 渲染管线, 非 markdown 节点被 sanitize/outerHTML 重写 |
| C. 暴露 IR 层 | ❌ | IR 类未 export |
| **D. Vditor DOM 上叠浮层 div** | ✅ | **唯一可行** |

#### 推荐架构

```jsx
<div className="vditor-host" style={{ position: 'relative' }}>
  <Vditor ref={vd} />
  <div className="ai-ghost-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <GhostBlock top={...} height={...} onAccept={...} onReject={...} />
  </div>
</div>
```

- **GhostOverlay.tsx**: 绝对定位在 Vditor 容器之上, 单个 GhostBlock 组件
- **定位**: 用 `ResizeObserver + MutationObserver` 监听 `vditor.wysiwyg.element` 几何变化, 重算 ghost 位置
- **监听**: `vditor.options.input` hook(800ms 节流)作为内容变化轻量信号
- **Accept 写回**: **首选 `vditor.insertMD(aiMarkdown)`**(光标保持稳定), 先 `vditor.focus()` 再保存当前 range, 用 `setSelectionFocus` 设到目标 block 末尾
- **占位锚点**: 在 ghost block 对应的 markdown 行尾插零宽 `<wbr>`, 让 ghost 与源同步移动

#### 风险清单

1. **性能**: 每次敲键(800ms 内)重排所有 ghost, >20 个 ghost 时需虚拟列表
2. **scroll 同步**: vditor `<pre>` 可滚动, ghost 层用 `position: absolute; inset: 0` + 监听 scroll 重定位
3. **block 索引漂移**: 用户在 ghost 关联 block 内编辑后, block 文本会变, Accept 时需重新定位 — 用 `data-block="0"` + `data-ai-anchor="ghostId"` 属性锚定
4. **setValue 副作用**: Typola 某些流程(文件保存、自动重渲)可能调 setValue 擦掉 ghost 锚点, 需 MutationObserver 兜底

**为什么不改 Vditor 源码**: Vditor 没有插件机制, 改其源码需维护 fork, 后续 Vditor 升级会冲突。浮层方案对 Vditor 黑盒, 兼容性最好。

---

### F-A2: Anthropic Tool Use stream-json 协议 + Typola 当前能力

#### 结论

Typola 当前 headless stream-json 链路**已 100% 覆盖 Anthropic 原生 tool_use/tool_result 解析**(`claudeStream.ts:404-518`)。**M3 真正缺口不在解析侧, 而在两侧的"执行通道"**:
- **左(工具注入)**: `build_claude_headless_args` 没有 `tools` 字段
- **右(结果回灌)**: `headlessService.ts` 完全没有 `agent_session_inject_tool_result` command, stdin 在 spawn 后被 `drop(stdin)` 关闭

加这两条管道 + 一个 `tool_use.name` 的前端 dispatcher, M3 "AI Agent 工具化" 就能落地。

#### Anthropic Tool Use 协议关键字段

- `tools: [{ name, description, input_schema, cache_control? }]`
- `input_schema.type` 必须是 `"object"`, 内部 JSON Schema `properties` / `required` / `description`
- `name` 长度 ≤64, 匹配 `^[a-zA-Z0-9_-]{1,64}$`
- `tool_choice` 可选 `auto` / `any` / `tool` / `none`
- `cache_control` 只能放在最后一个 tool 上(prefix cache)

#### stream-json 事件格式(逐行 JSONL)

| 事件 type | 关键字段 |
|---|---|
| `system/init` | `session_id`, `model`, `tools`(暴露的全部工具清单), `skills` |
| `stream_event.event.type=message_start` | `message.id`, `message.usage` |
| `stream_event.event.type=content_block_start` | `index`, `content_block.{type,id,name,input?}` |
| `stream_event.event.type=content_block_delta` | `delta.type` ∈ `text_delta` / `thinking_delta` / `input_json_delta` / `signature_delta` |
| `stream_event.event.type=message_delta` | **`delta.stop_reason`** = `end_turn` / `tool_use` / `max_tokens` / `refusal` |
| `stream_event.event.type=message_stop` | **无 payload**, 纯分隔 |
| `assistant` | **完整消息快照**, 无 `--include-partial-messages` 时是 text 的唯一来源 |
| `user` | **只携带 tool_result**, 没有 tool_result 时不会出现 |
| `result` | **整个会话终结**: `total_cost_usd`, `num_turns`, `usage.cache_read_input_tokens`, `session_id` |

#### headless Claude CLI 对 tool 的支持程度(实测 claude 2.1.148)

- `--tools <names...>` 只接受 **built-in tool 名字枚举**(Bash / Edit / Read / Write / Glob / Grep 等), **不接受** Anthropic `tools` schema
- CLI **没有** `--input-schema` / `--function-definitions` / `--tool-schema` 等参数
- Typola 想让 Claude 调用自定义工具(`insert_into_document` 等), **唯一通道是把 schema 写进 prompt**(`--system-prompt` 或 stdin user message)

#### Typola 当前解析覆盖度

**已处理 top-level `type`**:
- `system/init` → status(`claudeStream.ts:404`)
- `system/status` → status(`claudeStream.ts:414`)
- `stream_event` → handleStreamEvent → 拆 `message_start` / `content_block_start` / `content_block_delta` / `content_block_stop`(`claudeStream.ts:532-617`)
- `assistant` → 拆 `tool_use` + `text` + `thinking` block(`claudeStream.ts:430-491`), 发 `turn_end { stopReason }`
- `user` → 专门处理 `tool_result`(`claudeStream.ts:495-508`)
- `result` → usage(`claudeStream.ts:510-518`)

**收敛点**(`useAgentSession.ts:62-71`):
- `tool_use` → upsert 到 `assistant.tools[]`
- `tool_input_delta` → upsert 并拼接 `inputDelta`(Typola 专有实时拼字字段)
- `tool_result` → upsert 并写入 `result` + `isError`

#### M3 改造清单

| # | 改造点 | 文件 | 工作量 |
|---|---|---|---|
| 1 | `startAgentSession` 加 `tools: AgentToolDef[]` 字段, `build_claude_headless_args` 拼到 `--system-prompt` | `lib.rs:1387-1539`, `headlessService.ts`, `useAgentSession.ts` | 1-2 天 |
| 2 | 新建 `agent_session_inject_tool_result(runId, toolUseId, content, isError)` Tauri command, Rust 侧拿 child stdin writer, 写 stream-json `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"...","content":"...","is_error":false}]}}` | `lib.rs`(新增), `headlessService.ts`(新增) | 1-2 天 |
| 3 | 拦截特定 `tool_use.name`(`typola_insert_text` / `typola_archive_artifact` 等), 在 frontend 用 dialogService / ArtifactPreview 回调执行, 不发给 CLI, 直接当 `tool_result` 喂回 | `useAgentSession.ts`, `ToolCard.tsx` | 2-3 天 |
| 4 | 解析 `system/init.tools` 字段做"运行时反射" | `claudeStream.ts:404` | 0.5 天 |
| 5 | `tool_input_delta` 累积拼装边界处理(增量 JSON parser) | `useAgentSession.ts:67`, `ToolCard.tsx:14-15` | 1 天 |

**总工作量**: **5-8 天**, 与原报告"5-7 天"基本一致

---

### F-B1: Vditor vs Milkdown 迁移评估

#### 结论

**短期(3 个月内): Vditor + Overlay**(方案 A)
**中期(6-12 个月): 迁 Milkdown**(首选)或 Tiptap(Plan B)
**长期(12+): 看 AI 改文件频次**

**M3 不应该迁 Milkdown**。原因: 6 周迁移成本 vs 1.5-2 人天 Overlay 方案, 性价比差距巨大。M3 先用 Overlay 验证用户需求, M4/M5 再决策迁不迁。

#### 5 项能力差距(Milkdown 严格超集 Vditor)

| 能力 | Vditor | Milkdown | 分差 | Vditor 能绕? |
|---|---|---|---|---|
| **AI Diff Preview(DecorationSet)** | 0/5 | 5/5 | +5 | **不能绕**(无 Decoration 概念) |
| **Block-level 精确操作** | 1/5 | 5/5 | +4 | 能绕但极脆(字符串切割 + `findUniqueAnchor`) |
| **自定义 InputRule / PasteRule** | 1/5 | 5/5 | +4 | **不能优雅地绕** |
| **Schema-driven(markdown ↔ PM doc 双向)** | 0/5 | 5/5 | +5 | **不能绕** |
| **Selection / Cursor 控制颗粒度** | 2/5 | 5/5 | +3 | 部分能绕 |

#### 迁移成本

- **推荐 2 人 6 周**(WYSIWYG only, Source 保留 CM6)
- 核心改动文件: `WysiwygEditorPane.tsx`(764 行, 整重写 5-7 天)、`vditorFormatService.ts`(139 行, 整重写 2 天)、`vditorPreviewConfig.ts`(删除 0.5 天)、18 个引用 vditor 的文件(grep 出来 5-6 个真要改)
- markdown 双向序列化: `@milkdown/transformer` + remark, **3 个已知坑**(HTML 块 escape / 属性 / 换行策略)
- Mermaid NodeView: 需社区插件或自写, **预算 2 周缓冲**
- 大文档性能: ProseMirror 在 Tauri WebView 下 >10k 字有性能问题, **需做虚拟滚动**, 是 Tauri 场景的硬骨头

#### 替代方案评估

| 方案 | 优劣 |
|---|---|
| A. Vditor + Overlay | 0 迁移成本, 1-2 周出活; 精度脆(IR 重渲染让 overlay 错位) |
| B. 双编辑器并用 | 强烈不推荐(双轨一致性灾难) |
| C. Fork Vditor | 等于重写 Vditor 核心, 3-6 个月起步 |
| D. 切 Milkdown WYSIWYG only | **推荐**, 是 6 周方案子集 |

#### 其他 Tauri markdown 编辑器对比

| 框架 | 综合评分 | 备注 |
|---|---|---|
| **Milkdown 7.21** | **18** | MIT, 11.6k stars, Markra 已用, **首选** |
| **Tiptap 2.x** | **18** | MIT 核心 + 商业版付费, **强备选**, 生态最全 |
| BlockNote 0.x | 13 | Notion-style, 不适合 markdown-first |
| Lexical 0.x | 13 | Meta 出品, markdown 生态薄弱 |
| Slate.js | 13 | 已过时 |
| Editor.js | 11 | block 模型不匹配 |

#### 决策矩阵

| 维度 | 维持 Vditor + Overlay | 迁 Milkdown | 迁 Tiptap |
|---|---|---|---|
| AI 工具化能力 | 2/5 | 5/5 | 5/5 |
| 迁移工作量(人月) | 0.5 | 3 | 4 |
| 中文 markdown 成熟度 | 5 | 4 | 3 |
| 长期维护成本 | 低 | 低 | 低 |
| 商业授权风险 | 0 | 0 | 中 |
| 与 Markra 协同 | 0 | **高** | 中 |

**最终推荐**: **短期 Overlay 验证用户, 中期迁 Milkdown**。

---

### F-C1: 核心用户画像

#### 结论

Typola 是 **单人项目**(star=2, fork=0, 1 个 active contributor `nibazhu`, 103 个 commit, 占绝对主导), **无真实外部用户**, 任何 Persona 优先级都是"基于设计意图 + 项目代码 + 竞品规律的合成判断"。

**目标用户**: Typora 中文付费用户中"已有 Claude Code 工作流的子集" — 这是 Skill OS 设计明确表达的人群(`docs/AI_WORKBENCH_SKILL_OS.md §0` 明确写:"PM / 架构师 / 博主"三类知识工作者)。

#### 三段 Persona

**Persona A: 中文技术写作者**(28-38 岁, 后端/全栈 + 副业技术博主)
- 场景: Markdown 写公众号技术文章 → 想贴图 → 转 Word 给同事 review → 存本地知识库
- 痛点: Typora 收费后想替代; Word 排版丑; 公众号粘贴错乱
- **M3 优先级**: PDF 导出(🔴 最高)> Word 排版 > Focus/Typewriter(🟡)> 命令面板(🟡)> 全局搜索(🟢)

**Persona B: AI 重度早期采用者**(25-40 岁, PM / 独立开发者 / 知识付费博主, **已订阅 Claude/ChatGPT**)
- 场景: 用 Claude Code 写产品方案 → 在 Markdown 里"选中→AI 改一段" → AI 写完整篇日报/PPT
- 痛点: 编辑器和 AI 工具反复切换; **不敢信任 AI 直接覆盖原文 → Diff Preview 是刚需**; 已有 `~/.claude/skills/` → Skill OS 零成本嫁接
- **M3 优先级**: Diff Preview(🔴 最高)> AI Agent 工具化(🟡)> Process Trace(🟡)> 命令面板 ⌘K(🟡)

**Persona C: 学生 / 知识工作者**(18-26 岁本科生 / 研究生)
- 场景: 课程作业 → Markdown 写完 → 交 Word/PDF → 写读书笔记
- 痛点: 不会配置 Claude(Typola Skill OS 加分项但不构成购买动机); **需要 PDF 导出交作业**(很多课程系统收 PDF); 没有版本历史是痛点
- **M3 优先级**: PDF 导出(🔴 最高)> Focus 模式(🟡)> 主题商店(🟡)> Diff Preview(🟢 浅用 AI)

**关键洞察**: **Persona A 和 C 顶 PDF 导出, Persona B 顶 Diff Preview**。**两个用户群对 M3 诉求严重分裂**。

#### 基于用户画像的 M3 优先级重排

**原报告 M3 排序(基于 Typora 抄写)** vs **用户画像驱动排序**:

| 原报告排序 | 用户画像驱动排序 |
|---|---|
| 1. PDF 导出 | 1. **Diff Preview + Process Trace**(护城河, 服务 Persona B) |
| 2. AI Diff Preview | 2. **PDF 导出**(用户基数大, 服务 Persona A+C) |
| 3. Process Trace UI | 3. 视图三件套(低风险暖身) |
| 4. 视图三件套 | 4. 命令面板 ⌘K |
| 5. 语法增强 | 5. AI Agent 工具化(推 M5) |
| 6. 命令面板 | 6. 全局搜索(单人项目价值低) |

**关键调整**: **Diff Preview 应该提到 PDF 导出之前**。理由:
1. Typola 真正差异化在 Skill OS, Typora 抄得到的功能(PDF/视图三件套)是体验补齐不是护城河
2. Diff Preview 是 M1/M2 Skill OS 价值的最后一公里 — 没有它, Persona B 流失
3. **1.5-2 人天工作量**(F-A1 调研推翻原报告 3-5 天估计), 比 PDF 导出风险小(Typst crate 选型仍待 spike, 见 A3)
4. PDF 导出虽然用户基数大, 但 Typora/iCursor/WPS 已把体验做到天花板, Typola 做 PDF 是"跟随"不是"差异化"

**额外建议**:
- **放弃全局搜索 / 跨文件锚点作为 M4**: 单人项目(本地作者)文档量小, 价值不抵工作量
- **AI Agent 工具化推 M5**: 门槛高(Anthropic Tool Use + 8 tool factory), 且"AI 帮你写整篇"频率低于"AI 帮你改一段", Diff Preview 已能覆盖 80% 用例
- **保留 Vditor(不迁 Milkdown)**: Vditor IR 体验是 Typola 心流模式核心, 迁移成本远超收益

---

### F-总结: M3 决策清单(基于补漏后)

#### 推荐 M3 排序

1. **M3 第一里程碑: Diff Preview + Process Trace**(借鉴 Markra #2 + #4)
   - Diff Preview: 1.5-2 人天(F-A1 推翻原估)
   - Process Trace: 2-3 天
   - **总: 5 天**

2. **M3 第二里程碑: PDF 导出**(Typst, 沿用 06-20 报告)
   - 工作量: 5-7 天
   - 风险: Typst crate 选型仍待 spike

3. **M3 第三里程碑: 视图三件套 + 命令面板 ⌘K**
   - 工作量: 2-3 天 + 2-3 天 = 4-6 天
   - 风险: 低

4. **M4 候选: AI Agent 工具化**(8 tool factory + Tool Use 协议)
   - 工作量: 5-8 天(F-A2 估)
   - 风险: 中(需 Rust stdin 回灌管道新建)

5. **M5 候选: 迁 Milkdown**(F-B1 推荐)
   - 工作量: 2 人 6 周
   - 触发条件: M3 Diff Preview 真实用户验证"AI 改文件"频次

#### 决策项更新

| # | 决策点 | 结论 | 状态 |
|---|---|---|---|
| 1 | M3 是否现在启动? | 是 | ⏳ 等用户确认 |
| 2 | 借鉴 Markra 是抄实现还是抄设计? | 抄设计(AGPL-3.0 不能直接抄代码) | ✅ 默认 |
| 3 | M3 工期 6-8 周、2 人, 是否投入? | 影响 v0.4 vs v0.5 版本节奏 | ⏳ |
| 4 | 是否评估 Vditor → Milkdown 迁移? | **短期不迁, M5 评估**(F-B1 决策) | ✅ 默认 |
| 5 | M3 第一个里程碑先做哪个? | **Diff Preview + Process Trace**(F-C1 优先级重排) | ⏳ |
| 6 | 全局搜索是否做? | **不做**(F-C1 单人项目价值低) | ✅ 默认 |
| 7 | AI Agent 工具化放 M4 还是 M5? | **M5**(F-A2 + F-C1 双重证据) | ✅ 默认 |

---

## 附录: 参考链接

- Markra 关键代码:
  - Diff Preview: `D:\AI\workspace\markra\packages\editor\src\ai-preview.ts`
  - Agent Tools: `D:\AI\workspace\markra\packages\ai\src\agent\tools\index.ts`
  - AppRuntime: `D:\AI\workspace\markra\packages\app\src\runtime\index.ts`
- 之前调研报告:
  - `D:\暂存\Typola\docs\changes\2026-06-20-pdf-import-export-research.md`(LiteParse + Inkwell + 6 + 8 竞品 + PDF 导出实施)
  - `D:\暂存\Typola\docs\changes\2026-06-18-skill-os-competitive-research.md`(Skill OS 竞品)
  - `D:\AI\workspace\inkwell\CHANGELOG.md`(Inkwell 闭源对位)
- F-A1 关键文件:
  - `node_modules/vditor/src/index.ts:132-355`(公开 API)
  - `node_modules/vditor/src/ts/wysiwyg/input.ts:13-212`(输入触发 outerHTML 重写)
  - `node_modules/vditor/src/ts/util/selection.ts:5-22, 128-185`(内部 range/光标参考)
- F-A2 关键文件:
  - `D:\暂存\Typola\src\services\agent\claudeStream.ts:404-518`(解析器)
  - `D:\暂存\Typola\src\hooks\useAgentSession.ts:62-71`(事件→UI 收敛)
  - `D:\暂存\Typola\src-tauri\src\lib.rs:1387-1539`(`build_claude_headless_args`, M3 改造点)
  - `D:\暂存\Typola\src\components\conversation\ToolCard.tsx`(当前 tool UI, 拦截点)
- F-B1 关键文件:
  - `D:\暂存\Typola\src\components\WysiwygEditorPane.tsx`(764 行, 整重写候选)
  - `D:\暂存\Typola\src\services\vditorFormatService.ts`(139 行, 整重写候选)
- MEMORY 笔记:
  - `ai-workbench-terminal-pivot.md`(Skill OS 演进路径)
  - `typola-gotchas.md`(已知踩坑)
  - `tauri-local-build-after-changes.md`(每次本地 build 流程)
