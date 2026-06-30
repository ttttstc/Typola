# 任务：Typola Issue #117 — CM6 默认化后 Polish Sprint

## 角色

你是 Typola 的实施工程师，继续在最新 `main` 基础上实现 GitHub issue #117：

<https://github.com/ttttstc/Typola/issues/117>

本任务不是重新设计 CM6 编辑器，也不是恢复 Vditor；目标是在 **CM6 已经默认启用** 的前提下，把中文输入、表格、图片、长文档、折叠/搜索这些高频编辑场景打磨到稳定可验收，并补上防退化测试。

## 必读上下文

动手前按顺序读：

1. `docs/changes/2026-06-29-cm6-editor-refactor-plan.md`
2. `docs/changes/2026-06-28-cm6-editor-spike-integration.md`
3. GitHub issue #117 正文
4. 当前相关代码：
   - `src/components/editor/cm6/Cm6MarkdownEditorPane.tsx`
   - `src/components/editor/cm6/createMarkdownExtensions.ts`
   - `src/components/editor/cm6/headingFoldExtension.ts`
   - `src/components/EditorPane.tsx`
   - `src/app/AppLayout.tsx` 中图片粘贴/拖拽、heading scroll、CM6 editor wiring 相关段落
   - `src/services/imageInsert.ts`
   - `src/services/localImageResolver.ts`
   - `src/services/editor/cm6FormatService.ts`
   - `src/types/editorCore.ts`

可参考但不要直接纳入编译：

- `src/experimental/cm6-editor-spike/candidates/atomic-editor/src/table-widget.ts`
- `src/experimental/cm6-editor-spike/candidates/atomic-editor/src/image-blocks.ts`
- `src/experimental/cm6-editor-spike/candidates/codemirror-live-markdown/src/plugins/tableEditor.ts`
- `src/experimental/cm6-editor-spike/candidates/codemirror-live-markdown/src/plugins/image.ts`

## 总原则

1. **只 polish，不重构大架构**：CM6 已是默认内核，本轮只修稳定性和补测试。
2. **Markdown source 是唯一事实源**：不要引入富文本 shadow state；所有表格/图片/折叠/AI 替换都必须回到 raw Markdown。
3. **优先小修和防退化测试**：能用 CM6 transaction / keymap / eventHandler 修就不要自研大 widget。
4. **不要恢复 Vditor fallback**：不得新增“遇到问题切 Vditor”的回退逻辑。
5. **不要改测试去迁就 bug**：测试红先查根因。
6. **每次改动后都跑 `npm run tauri:build:local`**，这是当前项目约定。

## 阶段 0：诊断矩阵（必须先做，提交一个 docs 记录）

先不要直接大改代码。先建立一份诊断表，记录当前 main 上每个场景的真实状态：

新增文档：

`docs/changes/2026-06-30-issue117-cm6-polish-diagnostics.md`

内容格式：

```md
# Issue #117 CM6 Polish Diagnostics

## 环境
- Windows 版本：
- 输入法：
- npm/node：
- 分支/commit：

## 场景矩阵
| 场景 | 当前状态 | 复现步骤 | 根因判断 | 修复优先级 | 自动化覆盖 |
|---|---|---|---|---|---|
| 中文 IME 200 字 | pass/fail/unknown | ... | ... | P0/P1/P2 | unit/e2e/manual |
| 表格 5x5 Tab | ... | ... | ... | ... | ... |
| 图片粘贴后继续输入 | ... | ... | ... | ... | ... |
| 5 万字滚动 | ... | ... | ... | ... | ... |
| 折叠后搜索展开定位 | ... | ... | ... | ... | ... |
```

诊断要求：

- 至少跑一次 `npm run tauri dev` 手测。
- 至少记录微软拼音的 IME 行为；如果没有搜狗输入法，写明未覆盖。
- 长文档可以临时生成，不要提交大文件；如需 fixture，提交小型生成脚本或测试内生成。
- 找不到 bug 的场景也要写 `pass` 和观察结果，避免“凭感觉修”。

提交信息：

`docs: 记录 CM6 polish 诊断矩阵`

完成后继续实施，不需要停等用户，除非发现需要大架构改动。

## 阶段 1：P0 稳定性修复

### 1. 中文 IME / composition

目标：

- 中文输入过程中不重建会破坏 composition 的 DOM/widget。
- 候选词提交后光标不偏移。
- Ctrl+Z 不破坏未完成 composition；composition 中如有风险，应延迟格式化/preview 装饰刷新。

建议检查点：

- CM6 extension 是否在 `ViewUpdate` 中对每次输入都重建 block widget。
- atomic-editor 表格 cell/contenteditable 是否在 `compositionstart` 到 `compositionend` 之间被 React/Widget 重绘。
- 是否需要在 table/image/code block widget 内加 `compositionstart/compositionend` guard。
- 是否有 `preventDefault` 抢走 IME 输入事件。

实现建议：

- 在 CM6 extension 层维护一个轻量 `isComposing` 状态，composition 期间避免主动把 cell DOM ↔ markdown 双向同步。
- 表格 cell 内输入中文时，不要每个 `input` 都重建整张表；compositionend 再 flush。
- 不要在 React state 中存每个 composition 过程的中间文本。

测试要求：

- 新增或补充 jsdom 单测：compositionstart/update/end 不触发文档破坏。
- 新增 Playwright smoke（可用键盘输入普通中文字符串；真实候选框无法完全自动化时保留手测说明）。

### 2. 表格编辑交互

目标：

- 5×5 Markdown 表格每个单元格可编辑。
- Tab / Shift+Tab 在单元格间导航。
- 中文输入和英文输入都不破坏列数。
- 空单元格有轻量 placeholder，但 placeholder 不写入 Markdown。
- 输入 `|` 不应把当前行错误拆列；如果无法完美支持，至少转义或保留单元格内容不丢。

实现建议：

- 优先检查/复用 atomic-editor 的 table widget 逻辑，尤其是其 changelog 里提到的 IME guard、literal `|`、empty cells 修复。
- 如当前表格 widget 是直接渲染但不可稳定编辑，不要一次性做复杂 Excel 化；先实现基础 cell 编辑 + Tab 遍历。
- 表格 serialize 必须保持每行列数一致。

测试要求：

- 单测覆盖：
  - parse 5×5 表格
  - 更新某个空 cell
  - 输入中文
  - 输入 literal `|`
  - Tab 从第 1 个 cell 到第 25 个 cell 的焦点顺序（如果 jsdom 不稳定，可拆为纯函数 + Playwright）
- E2E 覆盖：创建/打开 5×5 表格，逐格输入中英文混合，Tab 遍历。

### 3. 图片粘贴 / 拖拽

目标：

- 粘贴截图后插入 Markdown 图片语法，光标停在图片后方，继续输入文字位置正确。
- 拖拽图片到编辑器时，按 drop 坐标插入，不总是插到文末。
- 保存重开后图片显示正常。
- 图片加载失败有可读 fallback，不能空白或破坏编辑。

建议检查点：

- `AppLayout.tsx` 的 paste/drop handler 当前是否能拿到 CM6 cursor/drop position。
- `insertImageFromSource` 是否总是调用 `insertText` 而不是 `replaceRange`。
- 图片 URL 带 query（如微信公众号 `?wx_fmt=png&from=appmsg`）是否被 Markdown parser 或 resolver 错切。

实现建议：

- 为 `EditorCoreHandle` 如已有 `insertText/replaceRange`，drop 时通过 CM6 `posAtCoords` 计算插入点。
- 粘贴时默认在当前 selection/cursor 处插入 `![alt](path)\n`，dispatch 后 selection 放在插入内容之后。
- 本地图片 resolve 失败时展示 fallback block：文件名/URL + “图片加载失败”，仍可编辑 Markdown source。

测试要求：

- 单测覆盖 image URL with query 不被截断。
- E2E 覆盖 paste mock clipboard image 或调用插入命令后继续输入文字。
- E2E 或单测覆盖 drop position（可用 `posAtCoords` mock/浏览器坐标）。

## 阶段 2：P1 体验与性能

### 4. 长文档性能

目标：

- 5 万字文档打开后可交互。
- 快速滚动/翻页响应 <100ms 级别，不出现明显卡顿。
- syntax highlight + folding + widgets 同时开启不导致全量重算。

实现建议：

- 不要在 React 层对全文做高频 derived state。
- TOC/统计/preview sync 如需全文扫描，做 debounce 或 requestIdleCallback。
- 富内容 widget 只渲染 viewport 附近；无法做到时至少缓存 Mermaid/KaTeX/图片尺寸。
- heading fold state 不要每次输入都全量写 React state。

测试要求：

- 新增性能测试：测试内生成 5 万字 Markdown，记录初始化、一次输入、一次滚动/selection dispatch 的耗时。
- 阈值不要过度理想化：CI/jsdom 可用宽松阈值；真实浏览器手测写入 diagnostics。

### 5. 标题折叠 + 搜索/滚动同步

目标：

- 折叠标题后，右侧预览/大纲同步不明显偏移。
- 搜索命中折叠区域时自动展开并定位到命中项。
- 替换折叠区域内文本时不丢失 folded state 或造成 hidden text 不可达。

实现建议：

- 搜索命中前先判断命中 range 是否位于 folded heading 区域。
- 如果在 folded 区域内，展开该 heading，再 scrollIntoView。
- heading fold key 尽量稳定；同名标题要有 index/path 区分，避免折叠错段。

测试要求：

- 单测：fold key / heading range / search hit belongs-to-folded-section。
- E2E：折叠三级标题 → Ctrl+F 搜索折叠内文本 → 自动展开并定位。

## 阶段 3：边界情况与自动化覆盖

覆盖 issue #117 的边界场景：

- 空文档加载。
- 纯代码块文档。
- emoji / 生僻汉字 / surrogate pair。
- HTML 混合 Markdown。

测试要求：

- 新增至少 3 个 E2E spec，建议文件：
  - `e2e/cm6-ime.spec.ts`
  - `e2e/cm6-table.spec.ts`
  - `e2e/cm6-image.spec.ts`
  - 可选：`e2e/cm6-long-document.spec.ts`
  - 可选：`e2e/cm6-fold-search.spec.ts`
- 如果项目现有 Playwright 配置不适合桌面 Tauri 自动启动，不要硬造复杂 infra；先做 browser-level component/app e2e，并在 handoff report 标明未覆盖 Tauri native shell。
- 组件/服务单测补到可维护，不要为了“覆盖度 >30%”写脆弱 DOM 快照。

## 禁止项

- 不删除 CM6 现有能力。
- 不恢复 Vditor 默认或新增 Vditor fallback。
- 不把 `src/experimental/cm6-editor-spike/candidates/**` 纳入 tsconfig/vitest 编译。
- 不提交大体积长文档 fixture；长文档测试运行时生成。
- 不引入 ProseMirror/Lexical/Slate。
- 不做 Notion 式 block editor。
- 不做复杂 Excel 化表格能力（合并单元格、公式、拖拽列宽）除非 issue 后续明确要求。
- 不改 AI 工作台 CLI/SkillHub/产物中心无关逻辑。
- 不扩大为 PDF/Word 导出重构。

## 建议提交拆分

1. `docs: 记录 CM6 polish 诊断矩阵`
2. `fix: 稳定 CM6 中文输入和表格编辑`
3. `fix: 修复 CM6 图片插入和失败回退`
4. `perf: 优化 CM6 长文档派生状态`
5. `fix: 修复 CM6 折叠标题搜索定位`
6. `test: 补齐 CM6 polish e2e 覆盖`

每个提交都应能独立说明动机，不要一个 mega commit 混完。

## 验收清单

功能验收：

- [ ] 微软拼音输入 200 字中文段落，候选框/光标不跳位。
- [ ] 搜狗输入法如可用，重复上述验证；不可用时在报告中说明。
- [ ] 5×5 表格逐格输入中英文混合内容，Tab 遍历全部单元格。
- [ ] 空单元格可编辑，占位提示不写入 Markdown。
- [ ] 粘贴截图后光标在图片后，继续输入文字位置正确。
- [ ] 拖拽图片按 drop 位置插入。
- [ ] 保存重开后图片正常显示；失败图片有 fallback。
- [ ] 5 万字文档打开、滚动、输入无明显卡顿。
- [ ] 折叠三级标题后，搜索折叠区命中会展开并定位。
- [ ] 空文档、纯代码块、emoji/生僻字、HTML mixed Markdown 不崩。

自动化验收：

- [ ] 新增 ≥3 个 E2E spec。
- [ ] 新增/补充 CM6 单测，覆盖 IME/table/image/fold/search/perf 的关键纯函数或 extension 行为。
- [ ] `npm run typecheck` 通过。
- [ ] `npm test` 通过。
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` 通过。
- [ ] `npm run tauri:build:local` 通过。

文档验收：

- [ ] `CHANGELOG.md` 记录用户可见修复。
- [ ] 如改动 CM6 extension 架构或测试策略，更新 `docs/ARCHITECTURE.md`。
- [ ] `docs/changes/2026-06-30-issue117-cm6-polish-diagnostics.md` 写明手测结果、剩余风险和未覆盖项。

## 最终报告格式

完成后回复：

```md
## 做了什么
- 文件清单
- 关键决策

## 验证
- typecheck:
- npm test:
- cargo check:
- tauri build:
- E2E:

## 手动验证
- IME:
- 表格:
- 图片:
- 长文档:
- 折叠搜索:

## 剩余风险
- ...
```

## 重要提醒

Issue #117 的本质不是“继续堆功能”，而是给 CM6 默认化补稳定性保险丝。优先把真实用户会踩到的数据丢失、光标错位、表格破坏、图片插入错位、长文档卡死解决掉；所有华丽增强都先放下。
