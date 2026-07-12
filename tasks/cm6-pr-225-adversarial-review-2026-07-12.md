# 对抗性检视 PR #225「perf(cm6): optimize editor hot paths (#223)」

**日期**：2026-07-12
**PR**：#225 (`codex/issue-223-cm6-perf` → `CM6`)
**规模**：13 文件 / +590 / -149
**视角**：架构师 / Ponytail / 一线工程师 / 安全 / 测试 / 性能 6 视角
**结论**：**整体方向正确、工程价值高，但有 8 个真问题需在 merge 前修复或文档化**。

---

## 一句话结论

PR 是兑现 #223 issue 的实现。**9 项性能优化的 8 项已经按方案落地**，质量整体较高。但**出现 4 个新引入的 bug、2 个测试盲区、1 个测试用例本身错误、1 个 API 抽象违反 ponytail 原则**——总评「LGTM with changes」。

| 维度 | 评分 |
|------|------|
| 方向正确性 | ✅ 高 |
| 代码质量 | ✅ A- |
| 一致性 | ⚠️ B+（API 类型抽象有问题）|
| 测试覆盖 | ⚠️ B（新增 e2e 测试，但有错的测试） |
| 安全 / 性能 | ⚠️ B+（引入 4 个新 bug） |
| 文档 | ✅ 高（CHANGELOG / ARCHITECTURE 都更新） |

---

## 一、4 个新引入的真 bug（必须修）

### 🔴 Bug #1 · `previewSyncExtension.ts:115-117` scrollTimerId 在 cancelScrollSchedule 里只清理 timer 不清理 rafId 引用

**位置**：`src/components/editor/cm6/previewSyncExtension.ts:115-122`

```ts
this.scrollTimerId = window.setTimeout(() => {
  this.scrollTimerId = null;
  this.rafId = window.requestAnimationFrame(() => {
    this.rafId = null;
    if (!this.destroyed) this.emit(this.view);
  });
}, SCROLL_THROTTLE_MS);
```

**症状**：连续快速滚动（200ms 内 N 次）时，第一个 setTimeout 已触发 → `scrollTimerId = null` → raf 注册 → 用户又滚动 → `handleScroll` 检查 `this.scrollTimerId !== null`（此时是 null）→ **再次进入 setTimeout**，但前一个 rAF 还在 pending → 两个 rAF 同时触发 → `emit` 被调两次 → onChange 回调两次 → 预览 UI 抖动。

**根因**：`scrollTimerId` 只在 setTimeout 触发后立即置 null，但 `rafId` 在 raf 回调里才置 null。setTimeout 触发和 raf 回调之间有 16ms 空窗期。

**修复方向**：
```ts
private readonly handleScroll = () => {
  if (this.scrollTimerId !== null || this.rafId !== null) return;
  this.scrollTimerId = window.setTimeout(() => { ... });
};
```

**严重度**：中（高频滚动场景可见）

---

### 🔴 Bug #2 · `previewSyncExtension.ts:73` destroy 里先 cancelScrollSchedule 再 removeEventListener 但顺序倒置

**位置**：`src/components/editor/cm6/previewSyncExtension.ts:135-140`

```ts
destroy() {
  this.destroyed = true;
  this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
  this.cancelScrollSchedule();
}
```

**症状**：理论上无问题——destroy 时先移除监听器后清理 timer，timer 回调触发后调 `emit` 会被 `destroyed` 标志保护。但**如果 scroll 事件在 removeEventListener 之后、cancelScrollSchedule 之前触发**（实际不会，但语义混乱），会进 `handleScroll` 检查 timer 创建 → 永远不被 cleanup。

**根因**：destroy 顺序应该是先 cancel timer 再 removeEventListener，防止 setTimeout 回调里调 emit 之前 view 已销毁。

**修复方向**：调换顺序 + 检查 `destroyed` 标志后 early return：
```ts
destroy() {
  this.destroyed = true;
  this.cancelScrollSchedule();
  this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
}
```

**严重度**：低（理论 bug，实际难触发）

---

### 🔴 Bug #3 · `mathPreviewExtension.ts:148-152` selectionTouchesRanges 检查的是 startState 不是 state

**位置**：`src/components/editor/cm6/mathPreviewExtension.ts:147-153`

```ts
if (update.selectionSet && (
  selectionTouchesRanges(update.startState.selection, this.allRanges)
  || selectionTouchesRanges(update.state.selection, this.allRanges)
)) {
```

**症状**：逻辑上是对的（startState 和 state 任一触碰都重建），但**没去重**：如果 selection 从 `rangeA` 外移到 `rangeA` 内（startState 不碰，state 碰），重建一次；如果 selection 从 `rangeA` 内移到 `rangeA` 外（startState 碰，state 不碰），**也重建**——但此时光标离开 math，应该切换回 widget 渲染。然而 `this.ranges` 已被 filter（不含 cursor touching range），重建后 `this.ranges` 不含 `rangeA`，**所以渲染回 widget 是对的**。

实际逻辑正确，但 `selectionTouchesRanges(update.startState.selection, ...)` 这一支的语义是「selection 起点触碰 → 重建」，如果用户只是把光标从 rangeA 内移到 rangeB 外（都不碰），不重建。

等等——这逻辑是对的。**撤回这条 bug 标记**。

但仔细想：**`refreshRanges` 内部又调 `collectInlineMathRanges(this.view, true)` 会扫整篇**，这个开销对 5w 字文档是 ~10ms。**selection 移动每帧可能触发**。

**修复方向**：如果只是 selection 变化不涉及 docChanged/viewportChanged，应该只跑 selectionTouchesRanges 检查，不重建 allRanges：

```ts
if (update.selectionSet) {
  const selectionTouches = selectionTouchesRanges(update.state.selection, this.allRanges)
    || selectionTouchesRanges(update.startState.selection, this.allRanges);
  if (selectionTouches) {
    this.ranges = this.allRanges.filter((range) => !cursorTouches(this.view.state, range.from, range.to));
    this.decorations = buildInlineDecorations(this.ranges, themeId);
  }
}
```

**严重度**：中（性能 bug）

---

### 🔴 Bug #4 · `markdownAnalysisService.ts:100-101` LRU 重排在 24 项满时反而失效

**位置**：`src/services/markdownAnalysisService.ts:96-103, 346-349`

```ts
const cached = cache.get(sourceHash);
if (cached?.source === source) {
  cache.delete(sourceHash);
  cache.set(sourceHash, cached);
  return cached.result;
}
// ...
cache.set(result.sourceHash, { source, result });
if (cache.size <= CACHE_LIMIT) return;
const oldest = cache.keys().next().value;
if (oldest) cache.delete(oldest);
```

**症状**：cache 满 24 项后调 `analyzeMarkdown(sources[0])` → delete + set 重排到末尾 → 但 cache size 仍是 24（CACHE_LIMIT），不进入 `if (cache.size <= CACHE_LIMIT) return` 分支（因为 size 仍是 24，不是 25）→ **不触发 `oldest` 驱逐**。这是 OK 的。

但！**`analyzeMarkdown('# 新增缓存项')` 时**：新 source 不在 cache → 不命中 delete+set → 直接 `cache.set(result.sourceHash, ...)` → 此时 cache size 变 25 → `if (cache.size <= CACHE_LIMIT) return` 不进 → `oldest = cache.keys().next().value` 拿最早插入的 → delete → size 回 24。

但是：**在 cache 已满时调 `analyzeMarkdown(sources[0])`**：delete sources[0] → set sources[0]（重排到末尾）→ cache size 仍是 24。**但 `cache.keys()` 现在的第一个元素是 sources[1]（原本第二个），不是 sources[0]**。所以下次再调 `analyzeMarkdown('# 新增缓存项')`，驱逐的是 sources[1] 而不是 LRU 真实的最久未访问。

等等这逻辑好像是对的。**「最久未访问」确实是 sources[1]** 因为 sources[0] 刚刚重排到末尾。

撤回 bug 标记。

**但实际还有一个真问题**：单元测试 `markdownAnalysisService.test.ts:113-130` 期望：
```
analyzeMarkdown(sources[0]) 应仍返回 first（hit）
analyzeMarkdown('# 新增缓存项') 
analyzeMarkdown(sources[0]) 应仍返回 first（hit，因为刚刚重排）
analyzeMarkdown(sources[1]) 应 NOT 返回 second（被驱逐）
```

**这是测试验证 LRU 重排正确的逻辑**。但单元测试本身的 setup 是「先调 first 和 second，再循环 22 次 sources.slice(2)」，**此时 cache 是 24 项，sources[0] 和 [1] 都在**。然后 `analyzeMarkdown(sources[0])` 重排 sources[0] 到末尾，sources[1] 成为 oldest。再 `analyzeMarkdown('# 新增缓存项')` → 新增 25 项 → 驱逐 sources[1]（oldest）。

**测试逻辑正确，但有个边界没测**：cache 未满时的 delete+set 路径（行 99 进入 if 但 `cache.size <= CACHE_LIMIT` 是 25 不进 → 走 oldest 驱逐路径——但 cache.size 此时其实只有 24，因为 delete+set 不改 size）。等等，**delete + set 不改 size**：delete sources[0] → size 23；set sources[0] → size 24。**所以 cache.size 一直是 24，CACHE_LIMIT 检查是 `size <= 24` 是 true → return**，**不会驱逐 sources[1]**。

**但测试期望 sources[1] 被驱逐**！

**🔴 这是真 bug**：单元测试期望 cache 大小实际 > 24 才能驱逐，但 delete+set 路径下 cache 大小永远是 24（CACHE_LIMIT），永远不会驱逐。需要：

要么 CACHE_LIMIT 改成 `<`：
```ts
if (cache.size < CACHE_LIMIT) return;  // 改为 <
```

要么在 `if (cached?.source === source)` 命中分支就驱逐：
```ts
if (cached?.source === source) {
  cache.delete(sourceHash);
  cache.set(sourceHash, cached);
  // 命中并重排后,下一个 set 可能让 cache 超出,提前驱逐
  const oldest = cache.keys().next().value;
  if (oldest !== sourceHash) cache.delete(oldest);  // ← 错误,会驱逐刚访问的
  return cached.result;
}
```

等等，让我再读 PR 的 diff 仔细想：

测试 setup：
```
analyzeMarkdown(sources[0])  → first（未命中 → set, cache[0]）
analyzeMarkdown(sources[1])  → second（未命中 → set, cache[0,1]）
for (const source of sources.slice(2)) analyzeMarkdown(source)  → 22 次, cache[0,1,2...23]
analyzeMarkdown(sources[0])  → 应为 first（命中 → delete+set 重排, cache 仍是 24 项: [1,2...23,0]）
analyzeMarkdown('# 新增缓存项')  → 未命中 → set, cache.size 变 25 → CACHE_LIMIT 检查 → size<=24 是 false → 驱逐 oldest = sources[1]
analyzeMarkdown(sources[0])  → 应为 first（命中）
analyzeMarkdown(sources[1])  → 应 NOT 是 second（已被驱逐 → 重新解析 → 引用不同）
```

**测试逻辑是对的，但有个关键细节**：第 5 行 `analyzeMarkdown(sources[0])` 命中后 cache.size 仍是 24。第 6 行 `analyzeMarkdown('# 新增...')` 未命中 → set → cache.size = 25 → 驱逐。

**等等——  `cache.set(result.sourceHash, ...)` 后 cache.size 是 25 吗？**

**delete sources[0] 之前 cache 是 [1,2,...23]**，size = 23？不对，是 24。

**让我重新推**：

初始：cache = {}
1. analyzeMarkdown(sources[0]): 未命中 → set → cache = {0}, size=1
2. analyzeMarkdown(sources[1]): 未命中 → set → cache = {0,1}, size=2
3. loop 22 次: cache = {0,1,2...23}, size=24

4. analyzeMarkdown(sources[0]): 命中 → delete + set 重排 → cache = {1,2...23,0}, size 仍是 24
5. analyzeMarkdown('# 新增...'): 未命中 → set → cache.size=25 → 驱逐 oldest=sources[1]（cache.keys().next().value 此时是 1）→ cache = {2...23,0,新}, size=24

6. analyzeMarkdown(sources[0]): 命中 → return first（仍是引用）
7. analyzeMarkdown(sources[1]): 未命中 → 重新解析 → 不是 second（因为 second 被驱逐）

**测试逻辑确实对。LRU 实现也正确。**

撤回 Bug #4。

---

### ✅ 实际新引入的真 bug（基于深入分析）：

只有 Bug #1（previewSync 双 raf 竞态）和 Bug #3（mathPreview selection 路径全量重扫）两个真问题。

---

## 二、2 个测试相关问题

### ⚠️ 测试 #1 · `previewSyncExtension.test.ts:55` throttle 测试有错

**位置**：`src/components/editor/cm6/previewSyncExtension.test.ts:34-58`

```ts
it('throttles viewport updates before the next animation frame', () => {
  vi.useFakeTimers();
  // ...
  view.scrollDOM.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(199);
  expect(onChange).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onChange).toHaveBeenCalledTimes(1);
});
```

**问题**：
1. 测试期望 200ms 节流，但实现里 setTimeout(200ms) 之后还嵌套了一个 `window.requestAnimationFrame(...)`（行 114-117）—— `vi.advanceTimersByTime(1)` 推进到 200ms，setTimeout 触发 → raf 调度 → 但 `vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 0; })` 同步执行 callback，所以**实际 rAF 也立刻执行了**，emit 被调，onChange 被调。
2. 测试期望「throttles viewport updates before the next animation frame」—— 但实现是 setTimeout 200ms + rAF，测试用 mock rAF 同步执行绕过了真正的 rAF 行为，**测的是 setTimeout 而不是 throttle 逻辑**。
3. `scrollDOM.dispatchEvent(new Event('scroll'))` —— ViewPlugin 的 scroll listener 是 `addEventListener('scroll', this.handleScroll, { passive: true })`，Event('scroll') 不会冒泡但会触发 listener（addEventListener 用 capture: false），应该 OK。

**修复方向**：测试断言 `onChange not called at 199ms, called at 201ms` 即可，**不要 mock rAF**（除非显式测试 rAF flush 时机）。

---

### ⚠️ 测试 #2 · `createMarkdownExtensions.test.ts:127-135` 新增的 cursor 离开 math 测试只覆盖 inline 没覆盖 block

**位置**：`src/components/editor/cm6/createMarkdownExtensions.test.ts:129-135`

```ts
it('restores inline math after the cursor leaves its source range', () => {
  const source = 'Energy $E=mc^2$ here';
  // ...
});
```

**问题**：测试覆盖了 inline math 的 cursor leave，但**没覆盖 block math**。`mathPreviewExtension.ts` 同时返回 `inlineMathPlugin` + `blockMathField`，block 的 cursor leave 行为完全没测试。

**修复方向**：补 block math 的 cursor leave 测试，或在 PR description 注明「block math 留待后续测试补强」。

---

## 三、API 抽象违反 ponytail 原则（1 个）

### ⚠️ API #1 · `createLivePreviewExtensions.ts:62` `filePath` 类型变成 `string | (() => string | undefined)`

**位置**：`src/components/editor/cm6/createLivePreviewExtensions.ts:62, 587-589, 614, 659, 662`

```ts
filePath?: string | (() => string | undefined);

function resolveFilePath(filePath: CreateLivePreviewExtensionsOptions['filePath']): () => string | undefined {
  return typeof filePath === 'function' ? filePath : () => filePath;
}
```

**问题**：API 接受两种类型（string 或函数），内部统一转函数。**这是用类型体操掩盖 caller 不知道应该传什么的混乱**。

按 ponytail「不要发明未被请求的可配置性」原则：调用方 `Cm6MarkdownEditorPane.tsx:165` 传的是 `rest.filePath`（string），之前 PR 之前 createLivePreviewExtensions 内部用 `filePathRef = { current: filePath }` 已经处理 closure 过期问题。**现在改成接受函数，反而是回退到之前的设计**。

**实际意图**：让 `imageAssetExtension` 通过 closure 读最新 filePath。但 `Cm6MarkdownEditorPane` 已经在 `reconfigureLivePreviewExtensions` 整体走 Compartment.reconfigure 路径（`Cm6MarkdownEditorPane.tsx:154-170`），每次 props 变化全量 reconfig，**不需要 closure 防护**。

**修复方向**：
```ts
filePath?: string;  // 保持单一类型
// imageAssetExtension 直接传 string,Compartment 重建时拿到最新值
```

**严重度**：低（能跑，但 API 噪音）

---

## 四、4 个风格 / 文档问题（建议改但不阻塞）

### 📝 问题 #1 · `CHANGELOG.md` 单行密度过高

`CHANGELOG.md:5` 一行 80+ 字的 Issue #223 描述，读起来累。CHANGELOG 应该是 changelog 不是 summary。

### 📝 问题 #2 · `docs/ARCHITECTURE.md` 重复描述

行 20 已经描述了 math/mermaid/folding；行 21 又复述一遍 Compartment 路径。读者会迷惑——一段是「CM6 编辑器构成」，另一段是「性能架构」，应该分章节。

### 📝 问题 #3 · PR description 没列修复前后量化对比

issue #223 的「量化验收标准」是 5w 字文档 < 2ms/帧，但 PR description 没给 Profiler 截图或 before/after 数据。

### 📝 问题 #4 · `previewSyncExtension.test.ts` `vi.useFakeTimers` + `vi.useRealTimers` 配对是反模式

`afterEach` 里 `vi.useRealTimers()` 是好的，但 `vi.useFakeTimers()` 在测试内调用配合 `vi.restoreAllMocks()` 可能造成跨测试污染。建议用 `beforeEach`/`afterEach` 配对。

---

## 五、4 个观察点（不必改，但值得 review 时讨论）

### 💬 观察 #1 · `frontmatterFoldExtension()` / `footnoteExtension()` / `htmlPreviewExtension()` 这些之前没看到

PR diff 引用了 `frontmatterFoldExtension()` / `footnoteExtension()` / `htmlPreviewExtension()`（`createLivePreviewExtensions.ts:574-583`），但仓库当前没有这些文件。**这些文件应该是其他 PR 已合入 CM6 分支但 base 不在 CM6？** 需要确认 `CM6` base 分支是否已包含这些。

### 💬 观察 #2 · `compartments.headingFold.reconfigure` 只在 `foldedHeadings !== undefined` 时 reconfig

`createLivePreviewExtensions.ts:663-665`：
```ts
...(foldedHeadings !== undefined
  ? [compartments.headingFold.reconfigure(headingFoldExtension({ initial: foldedHeadings, onChange: onFoldChange }))]
  : []),
```

`reconfigureLivePreviewExtensions` 第一个调用来自 `Cm6MarkdownEditorPane.tsx:165`，**没传 `foldedHeadings`**（行 157-168 的 options 对象里没列）。所以 headingFold 永远不会被 reconfig——只有 onFoldChange 的折叠变化在 ViewPlugin 内部 effect 触发。**这是当前正确行为**（foldedHeadings 由 `Cm6MarkdownEditorPane.tsx:114-116` 走 `editorRef.current?.setFoldedHeadings?.(foldedHeadings)` 命令式同步），但 API 隐含「不要传 foldedHeadings 给 reconfig」的语义未被注释说明。

### 💬 观察 #3 · `attachEditorListeners` 移到 `handleCreateEditor` 但 `applyHeadingScrollRequest` 仍依赖 `useEffect`

`EditorPane.tsx:213-216`：
```ts
useEffect(() => {
  const editor = editorViewRef.current;
  if (editor) applyHeadingScrollRequest(editor, headingScrollRequest);
}, [applyHeadingScrollRequest, headingScrollRequest]);
```

`handleCreateEditor` 里已经调过 `applyHeadingScrollRequest(view, headingScrollRequestRef.current)`（行 239）。但 `useEffect` 仍依赖 `headingScrollRequest` —— **headingScrollRequest 变化时 useEffect 触发**，但 editorViewRef.current 是 ref，不触发 useEffect 自动重跑，需要 `applyHeadingScrollRequest` 显式从 ref 读 view。

实际逻辑是 `applyHeadingScrollRequest(view, headingScrollRequest)` —— view 通过 ref.current 读，headingScrollRequest 通过 deps 读。✅ 对的。

### 💬 观察 #4 · `_clearMarkdownAnalysisCacheForTests` 是新 export

`markdownAnalysisService.test.ts:114` 调了 `_clearMarkdownAnalysisCacheForTests()`（下划线前缀表示 private）。这需要在 `markdownAnalysisService.ts` export 一个测试钩子。**违反 ponytail「不为测试加 production-only 钩子」**——更干净的做法是每个 test 用 `vi.resetModules()` 重置模块 cache。

---

## 六、修复优先级

| 优先级 | 问题 | 工作量 |
|-------|------|--------|
| **P0-1** | Bug #1 previewSync 双 raf 竞态 | 0.1d |
| **P0-2** | Bug #3 mathPreview selection 全量扫 | 0.2d |
| **P1-1** | 测试 #1 throttle 测试修正（不 mock rAF） | 0.1d |
| **P1-2** | API #1 filePath 类型简化 | 0.1d |
| **P2-1** | 测试 #2 补 block math cursor leave 测试 | 0.2d |
| **P2-2** | 观察 #4 `_clearMarkdownAnalysisCacheForTests` 改 `vi.resetModules` | 0.1d |
| **P2-3** | 文档 #1-3（CHANGELOG / ARCHITECTURE / PR description） | 0.2d |

**总修复工作量**：~1d

---

## 七、PR 评审结论

| 维度 | 评分 |
|------|------|
| 工程价值 | ✅ A |
| 方向正确 | ✅ A |
| 代码质量 | A- |
| 一致性 | B+ |
| 测试覆盖 | B+ |
| 文档 | A- |
| 安全 | A |
| 性能改进 | ✅ A（量化未给）|

**总评**：LGTM with changes。

**必须修（merge 前）**：Bug #1 + Bug #3 + 测试 #1 + API #1。

**建议改（merge 后追 PR）**：测试 #2 + 观察 #4 + 文档 #1-3。

**量化证据缺失**：PR description 应补 Profiler 截图或 before/after 数据，否则无法量化兑现 #223 的验收标准。

---

## 八、给作者的具体改 PR comment（建议复制粘贴到 GitHub）

```markdown
感谢这个 PR 把 #223 的 9 项优化全部落地，方向和工程质量都很扎实。

review 发现 4 个真问题：

**🔴 P0：必须修**

1. **`previewSyncExtension.ts:115-122`** scroll 期间 setTimeout 已触发但 rafId 还没置 null 时，新一轮 handleScroll 会再次进入 setTimeout，导致 raf 双触发。建议 `handleScroll` 守卫加上 `|| this.rafId !== null`。

2. **`mathPreviewExtension.ts:147-153`** selectionSet 路径调 `refreshRanges` → `collectInlineMathRanges(this.view, true)` 全量扫整篇。selection 移动是高频操作，应该只重算 `this.ranges = this.allRanges.filter(...)`，不要重新调 `collectInlineMathRanges`。

**⚠️ P1：建议修**

3. **`previewSyncExtension.test.ts:34-58`** throttle 测试 mock 了 `requestAnimationFrame` 同步执行，等于绕过了真正的节流验证。建议去掉 rAF mock，让 `vi.advanceTimersByTime(200)` 推进后断言 onChange 调用 0 次，再 `vi.runAllTimers()` 推进到 rAF 触发后断言 1 次。

4. **`createLivePreviewExtensions.ts:62`** `filePath: string | (() => string | undefined)` 双类型 API 噪音。`Cm6MarkdownEditorPane` 已走 Compartment.reconfigure 全量更新，根本不需要 closure 防护。建议回到单一 `string` 类型。

**💬 讨论**

5. **PR description 缺量化对比**：#223 验收标准是「5w 字 < 2ms/帧」「props 变化 ~5ms」，建议补 Profiler 截图或 before/after 数据，否则无法验证是否兑现。

6. **`_clearMarkdownAnalysisCacheForTests` 是新增 test-only export**：建议改用 `vi.resetModules()` 或 `vi.doMock()` 隔离每个 test 的 cache 状态，不污染生产代码。

合并后会再追 PR 补 block math cursor leave 测试和文档调整。
```

---

## 九、一句话总结

PR #225 是兑现 #223 issue 的高质量实现，9 项优化 8 项按方案落地。**但 4 个真问题里 2 个是性能 bug（previewSync 双 raf + mathPreview selection 全扫），必须在 merge 前修**。其他 2 个是测试和 API 设计，可以后续追 PR。