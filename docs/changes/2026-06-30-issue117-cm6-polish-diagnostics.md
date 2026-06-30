# Issue #117 CM6 Polish Diagnostics

> 日期:2026-06-30
> 状态:诊断完成,实施中
> 跟踪:https://github.com/ttttstc/Typola/issues/117
> 基础 commit:5ed9096(`codex/issue-117-cm6-polish-plan`)

## 环境

- **Windows 版本**:Windows 11 Pro 10.0.26200(PowerShell 5.1)
- **输入法**:微软拼音可用;搜狗输入法未覆盖(本机未安装)
- **Node / pnpm**:本会话未启动本地 dev server,所有诊断基于代码 review + 已通过的 spike 测试(`src/experimental/cm6-editor-spike-integration/tests/`)
- **分支**:`codex/issue-117-cm6-polish`(基于 `codex/issue-117-cm6-polish-plan`)
- **CM6 版本**:`@codemirror/*` 当前 main 已就位;`@atomic-editor/editor@^0.4.3`
- **手测覆盖**:**未跑 `npm run tauri dev`**(环境受限);所有"未知/手测"场景已在表内标记,待 reviewer 在真实 Tauri 中确认

---

## 场景矩阵

### 1. 中文 IME / composition

| 维度 | 状态 | 复现/定位 | 根因判断 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| 普通中文输入 200 字 | **unknown 待手测** | Tauri dev 启动后用微软拼音输入 200 字段落 | spike 阶段 jsdom 已验证 composition 事件不崩溃(`editorViewIme.test.ts`);真实 IME 流未覆盖 | P0 | unit(已)+ e2e(待加) |
| 候选框/光标同步 | **unknown 待手测** | 选词后看光标是否在词尾 | `@uiw/react-codemirror` 已处理 controlled 协议,但 IME end → CM6 dispatch 之间有竞态可能 | P0 | e2e |
| composition 期间 IME guard | **pass(代码 review)** | 读 `src/experimental/cm6-editor-spike/candidates/atomic-editor/src/table-widget.ts` L723-735 | atomic-editor `tables()` 已实现 `composing` flag + `compositionend` flush;`imageBlocks` 不需要 guard(无 cell 编辑) | — | unit(已) |
| composition 期间 React state 不写中间文本 | **fail** | `Cm6MarkdownEditorPane.tsx` L44 `foldedHeadings` React state 在 `onFoldChange` 同步;`previewSyncExtension.ts` L83-104 走 rAF 节流 | 现状 OK(rAF 节流 + doc 变化才触发),但折叠折叠 toggle 期间会同步 React state,需验证不破坏 IME | P1 | e2e |
| 微软拼音 vs 搜狗 | **unknown(搜狗未覆盖)** | — | 行为可能差异(候选框样式、commit 协议) | P2 | manual |

**关键代码**:
- `src/components/editor/cm6/Cm6MarkdownEditorPane.tsx`(React ↔ editor 桥)
- `src/experimental/cm6-editor-spike/candidates/atomic-editor/src/table-widget.ts`(表格 IME guard)

---

### 2. 表格编辑

| 维度 | 状态 | 复现/定位 | 根因判断 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| 5×5 表格逐格输入 | **partial**(代码已支持) | Tauri dev 创建 5×5 表格,逐格输入 | atomic-editor `tables()` 提供 contenteditable cell + Tab/Shift+Tab 导航 | P0 | e2e |
| Tab / Shift+Tab 单元格导航 | **pass(代码 review)** | `table-widget.ts` L770-779 `keydown` Tab/Enter → `moveCellFocus` | 已实现;Enter 同步 Tab 行为 | — | unit(已)+ e2e |
| Tab 末尾追加行 | **pass(代码 review)** | `table-widget.ts` L1039-1044 + L1052-1097 `appendRow` | 已实现;双 rAF 等待新 widget attach | — | unit(已) |
| 中文输入不破坏列数 | **pass(代码 review)** | `table-widget.ts` L723-735 IME guard | composition 期间不 commit,compositionend 一次性 dispatch | — | unit(已) |
| literal `\|` 处理 | **pass(代码 review)** | `table-widget.ts` L122-124 `escapeCell` | `(?<!\\)\|` → `\\|` 转义,serialize 幂等 | — | unit(已) |
| 列宽自适应 vs Vditor | **pass(差异已知)** | 当前 CSS 走 atomic-editor 默认 | 与 Vditor 行为不同(更紧凑),用户已知 | P2 | manual |
| 空 cell placeholder | **unknown**(代码无) | `table-widget.ts` cell `textContent` 为空时显示? | 现状:空 cell 无 placeholder(`dataset.raw` 空 → 空 cell);需补 CSS `data-empty` | P1 | e2e + CSS |

**关键代码**:
- `src/experimental/cm6-editor-spike/candidates/atomic-editor/src/table-widget.ts`(整套实现)
- `src/components/editor/cm6/createLivePreviewExtensions.ts` L23-24 注册 `tables()`

---

### 3. 图片粘贴/拖拽

| 维度 | 状态 | 复现/定位 | 根因判断 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| 粘贴截图插入图片语法 | **partial**(代码已支持,缺光标后续) | `AppLayout.tsx` L926-952 `handlePasteImage` | 已调 `insertImageFromSource`;但 `insertImageFromSource` 不传 drop/insert pos,只走 selection 末尾 | P0 | e2e |
| 光标停在图片后继续输入 | **fail**(待验证) | 粘贴后输入文字,看光标位置 | `imageBlocks` widget `toDOM` 自身有 click → source line logic;但 **粘贴流程** 没在 image widget 旁 dispatch selection | P0 | e2e |
| 拖拽图片按 drop 位置插入 | **fail** | `AppLayout.tsx` L1066-1096 `handler` 接 `window drop`,用 `(f as any).path` | **没用 `view.posAtCoords` 计算 drop position**;插入位置 = 当前 selection 末尾,与 drop 位置无关 | P0 | e2e |
| Tauri native file drop pos | **fail** | `AppLayout.tsx` L1103-1119 `onDragDropEvent` | Tauri drop event 不传 viewport 坐标(只 paths);**drop 位置语义缺失** | P1 | e2e + 设计 |
| URL 带 query 不被截断 | **pass(代码 review)** | `services/imageInsert.ts` L18-20 `isImagePath` 用 `split(/[?#]/u)[0]` | 已处理 `?wx_fmt=png&from=appmsg` | — | unit(已)+ e2e |
| 图片加载失败 fallback | **partial** | `services/localImageResolver.ts` L81-88 `prepareRemoteImage` 设 referrerPolicy;`#?` 后没 fallback block | 微信图片 referrer 失败有处理;其他失败(404/网络)无可见 fallback | P1 | e2e |
| 保存重开图片显示 | **pass(代码 review)** | `localImageResolver.ts` L37-73 `resolveLocalImages` 转 Tauri asset URL | 已实现 `convertFileSrc` | — | manual |
| 上传进度反馈 | **pass** | `AppLayout.tsx` L809-832 `action === 'upload'` 调 `upload_image_via_command` | 已实现 | — | manual |

**关键代码**:
- `src/app/AppLayout.tsx` L765-840 `insertImageFromSource`
- `src/app/AppLayout.tsx` L926-952 `handlePasteImage`
- `src/app/AppLayout.tsx` L1066-1096 `handler`(window drop)
- `src/app/AppLayout.tsx` L1103-1119 Tauri `onDragDropEvent`
- `src/services/imageInsert.ts` URL/path 处理
- `src/services/localImageResolver.ts` Tauri asset URL + referrer

**根因**:
1. `AppLayout` 拦截 window drop/paste,没有让 CM6 `posAtCoords` 知道 drop 坐标
2. 图片 widget 自身有"点击图片 → 跳回 source line"逻辑,但**插入流程**没复用这个 selection 设置

---

### 4. 长文档性能(5 万字)

| 维度 | 状态 | 复现/定位 | 根因判断 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| 打开 5 万字 | **unknown 待手测** | Tauri dev 打开 5 万字 fixture | spike 已验证 1k/5k jsdom init <1500ms;5 万字待真实浏览器 | P0 | perf + e2e |
| 滚动/翻页响应 <100ms | **partial** | `previewSyncExtension.ts` L83-104 rAF 节流 | 已用 rAF 节流 + 50ms syntax tree budget;长文档 budget 可能 null | P1 | perf + manual |
| syntax highlight + fold + widget 同时开启不卡 | **unknown 待手测** | Tauri dev 实际滚动 | `headingFoldExtension` 50ms budget;`tables()` `ensureSyntaxTree` 200ms;`imageBlocks` 200ms;**三个 budget 累加** | P1 | perf |
| React state 不做全文 derived | **fail**(代码 review) | `Cm6MarkdownEditorPane.tsx` L44 `foldedHeadings` 在 `onFoldChange` 同步到 React | React state 只存 fold set(不存全文),OK;但 `previewSyncExtension` 每次 doc change 走 rAF,可能高频触发 | P1 | — |
| heading fold state 每次输入不写 React | **partial** | `headingFoldExtension.ts` L144-153 `update` 只在 `foldedChanged` 才 `onChange` | OK,folds 不随每次输入重置 | — | — |
| TOC/统计走 debounce | **pass**(代码 review) | `previewSyncExtension` rAF 节流(80ms) | 已实现 | — | — |
| 富内容 widget 只渲染 viewport 附近 | **unknown** | atomic-editor `imageBlocks` / `tables` 实现细节 | 需验证,可能在长文档下 widget 渲染过密 | P1 | perf |

**关键代码**:
- `src/components/editor/cm6/previewSyncExtension.ts`(80ms rAF)
- `src/components/editor/cm6/headingFoldExtension.ts`(50ms syntax tree budget)
- `src/experimental/cm6-editor-spike/candidates/atomic-editor/src/table-widget.ts`(200ms budget)
- `src/experimental/cm6-editor-spike/candidates/atomic-editor/src/image-blocks.ts`(200ms budget)

**根因**:`Cm6MarkdownEditorPane` `useMemo([foldedHeadings, ...])` 依赖 React state,任何 foldedHeadings 变化重建整个 live preview extensions 数组(虽然 CM6 diff)。

---

### 5. 标题折叠 + 搜索/滚动

| 维度 | 状态 | 复现/定位 | 根因判断 | 优先级 | 自动化 |
|---|---|---|---|---|---|
| 折叠三级标题后右侧预览/大纲同步 | **pass**(代码 review) | `previewSyncExtension.ts` `findHeadingAtScroll` 用 `lineBlockAtHeight` 找当前 heading | 已实现段内比例 | — | manual |
| 搜索命中折叠区域自动展开 | **fail** | `EditorPane.tsx` L297-313 `revealText` + `search/replace` 流程 | 只 `scrollIntoView` + 设 selection,**不展开折叠** | P0 | unit + e2e |
| fold key 稳定 | **fail** | `services/headingFoldService.ts` L43-45 `foldKey = level:text` | 重复文本 heading 会冲突(只折叠第一个) | P0 | unit + e2e |
| 同名 heading 区分 index/path | **fail** | 同上 | 没有 index 维度 | P0 | unit + e2e |
| 替换折叠区域内文本不丢 fold | **partial** | `EditorPane.tsx` `replaceRange` 走 CM6 dispatch,fold state 在 `foldedField` 保留 | OK,fold 在 StateField 不丢 | — | e2e |

**关键代码**:
- `src/services/headingFoldService.ts` `foldKey` 算法
- `src/components/editor/cm6/headingFoldExtension.ts` fold state field
- `src/components/EditorPane.tsx` `revealText` / `revealRange` 搜索 reveal

**根因**:`foldKey` 缺 index 维度;搜索 reveal 不展开 fold。

---

### 6. 边界情况

| 场景 | 状态 | 复现/定位 | 优先级 |
|---|---|---|---|
| 空文档加载 | **pass**(代码 review) | `Cm6MarkdownEditorPane` `source: string` 接受空字符串,无特殊处理 | — |
| 纯代码块文档 | **pass**(代码 review) | `createLivePreviewExtensions` 包含 `inlinePreview()` + `tables()` + `imageBlocks()`;纯代码块走 markdown parser,无 widget | — |
| emoji / 生僻汉字 / surrogate pair | **unknown 待手测** | Tauri dev 实际输入 | P1 |
| HTML 混合 Markdown | **unknown 待手测** | Tauri dev | P2 |

---

## 实施路线图(已建任务)

| 任务 | 状态 | 内容 |
|---|---|---|
| #45 PR1 诊断矩阵 | 进行中 | 本文档 |
| #46 PR2 中文 IME + 表格 | pending | IME guard 验证、cell placeholder、空 cell 行为 |
| #47 PR3 图片插入 | pending | drop pos via `posAtCoords`、粘贴后 selection 落到图片后、fallback block |
| #48 PR4 长文档性能 | pending | perf 测试、widget viewport 渲染、previewSync rAF budget |
| #49 PR5 折叠 + 搜索 | pending | fold key 加 index、搜索命中展开 fold |
| #50 PR6 E2E + 单测 | pending | ≥3 个 e2e spec(ime/table/image)+ 单元补齐 |

---

## 剩余风险与未覆盖项

1. **真实 IME / 浏览器 / Tauri** —— 整个诊断未跑真实环境,所有 `unknown` 项需 reviewer 跑 `npm run tauri dev` 验证
2. **搜狗输入法** —— 本机未安装,行为可能与微软拼音差异
3. **5 万字长文档** —— fixture 需要生成脚本,不提交大文件
4. **大文档 widget 渲染密度** —— atomic-editor 内部 viewport 渲染策略未审计
5. **Tauri native drop 的 viewport 坐标** —— Tauri 2 `onDragDropEvent` 不传坐标,需设计 fallback:用 mouse position 估算

## 下一步

1. 提交本文档(`docs: 记录 CM6 polish 诊断矩阵`)
2. 进入 PR2(IME + 表格)— 先做表格 cell placeholder + IME guard 在 main CM6 路径下回归(不依赖 atomic-editor,因 atomic-editor 已在 candidates 内)
3. PR3(图片)— 重构 `AppLayout` 的 paste/drop,让 `insertImageFromSource` 接 pos 参数,走 CM6 `posAtCoords`
4. PR4(性能)— 新增 perf spec
5. PR5(折叠)— `foldKey` 算法升级 + 搜索 reveal 触发 expand
6. PR6(E2E)— 3 个 e2e spec
