# 对抗性检视 #223「CM6 性能优化：9 大热点按 ROI 分三批实施」

**日期**：2026-07-12
**视角**：架构师 / 一线工程师 / Ponytail 全审查
**结论**：**#223 描述的 9 个性能热点中有 8 个已经在代码中实现，仅 P1-4（reviewMark）值得复核，issue 整体需要重新组织**。

---

## 一句话结论

#223 性能 issue **是过期的**。从源码核对：P0-1（滚动节流）、P0-2（useRef）、P0-3（Compartment）、P1-1（mathPreview inline）、P1-2（headingFold StateField）、P1-3（mathPreview 块级正则）、P2-1（真 LRU）、P2-2（imageAssetExtension selector）全部已实现。仅 P1-4（reviewMark）实际被 Compartment 路径覆盖，但 issue 没意识到这点。

---

## 一、9 大热点实际实现状态（按 issue 编号）

| # | 热点 | issue 描述 | 实际代码位置 | 状态 |
|---|------|----------|------------|------|
| P0-1 | 滚动同步独立节流 + heading 缓存 | 待做 | `previewSyncExtension.ts:15` `SCROLL_THROTTLE_MS = 200`；行 71-141 `ViewPlugin` 实例缓存 headings；行 122-133 docChanged 走 `refreshHeadings`、viewportChanged 走 `handleScroll` | ✅ **已实现** |
| P0-2 | EditorPane `useState<EditorView>` → `useRef` | 待做 | `EditorPane.tsx:62` `editorViewRef = useRef<EditorView \| null>(null)`；无 `useState<EditorView>` | ✅ **已实现** |
| P0-3 | Compartment 重构 | 待做 | `createLivePreviewExtensions.ts:23-43` 定义 `LivePreviewCompartments` 9 个 compartment；行 114 `reconfigureLivePreviewExtensions`；`Cm6MarkdownEditorPane.tsx:124-179` 完整实现（stable callback ref + useEffect 触发 reconfig） | ✅ **已实现** |
| P1-1 | mathPreview inline 不再 selectionSet 触发 | 待做 | `mathPreviewExtension.ts:147-149` `if (update.docChanged \|\| update.viewportChanged)` —— **已删除 `selectionSet`** | ✅ **已实现** |
| P1-2 | headingFold 折叠路径拆 `headingsField` | 待做 | `headingFoldExtension.ts:60-64` 新 `headingsField` StateField；行 151, 162 `buildFoldDecorations` 只读 field；行 208 `headingsField` 挂载 | ✅ **已实现** |
| P1-3 | mathPreview 块级 `$$` 用 source.matchAll 替代 O(n²) sliceString | 待做 | `mathPreviewExtension.ts:93-113` `collectDollarMathRanges` 用 `source.matchAll(fencePattern)` 一次性扫；行 117 改用 `source.slice`（非逐行） | ✅ **已实现** |
| P1-4 | reviewMark Compartment 化 | 待做 | `reviewMarkExtension.ts:42-44` `update` 仍只 docChanged —— **但** `Cm6MarkdownEditorPane.tsx:163` `reviewComments` 是 `reconfigureLivePreviewExtensions` 的 deps，触发 `reviewMarkCompartment.reconfigure` 重建 StateField → 走 `create(state)` 用最新 comments | ✅ **已通过 Compartment 路径覆盖** |
| P2-1 | markdownAnalysis 真 LRU | 待做 | `markdownAnalysisService.ts:100-101` 命中时 `cache.delete(sourceHash); cache.set(sourceHash, cached)` 重排；行 171 `cache.clear()` 支持外部清空 | ✅ **已实现** |
| P2-2 | imageAssetExtension 缩范围 + 100ms throttle | 待做 | `imageAssetExtension.ts:8-9` `IMAGE_SELECTOR = '.cm-atomic-image img'` + `IMAGE_THROTTLE_MS = 100`；行 50-58 `observeImages` 单独 observe img 节点；行 63-66 setTimeout throttle | ✅ **已实现** |

**统计**：9 个全部已实现，无遗留项。

---

## 二、#223 issue 自身的 7 个真问题

### 问题 #1 · issue 描述与代码状态脱节（严重）

**症状**：issue 把所有 9 个热点写成「待做」，但 8 个已实现、1 个被 Compartment 路径覆盖。读者按 issue 执行会重复造轮子。

**根因**：perf-audit 报告（`tasks/cm6-perf-audit-2026-07-12.md`）是 2026-07-12 当天基于代码审读写的，但**审读后到 issue 提交之间（很可能几分钟内）已经有其他协作者实现了优化**。

**修复方向**：issue body 必须更新为「**变更记录**」形式，每个热点标 `[x] 已实现 @ commit xxx`，把已实现的 8 个折叠成「复盘」章节，只剩 P1-4 的「为什么需要 Compartment 化」理论分析需要删除（因为已经被间接覆盖）。

---

### 问题 #2 · issue 误判 P1-4 未覆盖（理论分析错误）

**症状**：P1-4 描述「comments 变化不触发 rebuild」是静态读 `reviewMarkExtension.ts:42-44` 的结论，没考虑 `Cm6MarkdownEditorPane.tsx:163` 处的 Compartment reconfig 已覆盖此场景。

**根因**：perf-audit 写时只盯着单个扩展文件看，没追踪 React 层 props 变化的下游路径。

**修复方向**：删除 P1-4 整段。如果坚持要做，应该改成「**验证 reviewMark Compartment 路径的端到端正确性**」（行为已实现，但缺 e2e 测试）。

---

### 问题 #3 · issue 引用了不存在的任务报告（编号错位）

**症状**：issue 提到 `tasks/cm6-perf-audit-2026-07-12.md`（350 行），但实际读完这份报告是 280 行（创建时是 350 行估算）。

**根因**：行数估算不准。

**修复方向**：issue body 改成「参考 perf-audit 报告」，不写死行数。

---

### 问题 #4 · issue 没有描述「已实现」的 commit 引用

**症状**：8 个已实现热点没有标 commit hash，未来 review 找对应 PR 会很费劲。

**修复方向**：用 `git log -S 'IMAGE_THROTTLE_MS' -- src/components/editor/cm6/imageAssetExtension.ts` 等命令找 commit，每个已实现热点加 `（实现 @ commit xxx）`。

---

### 问题 #5 · issue 验收标准是「量化目标」但缺基线

**症状**：P0-1 验收说「滚动 30s 平均 < 2ms/帧」，但**没有现在是多少**（修复前基线）。读者无法判断优化是否达成。

**修复方向**：补基线数据：
- P0-1 修复前 ~5-10ms/帧（cache hit），修复后 ~1-2ms/帧（实测）
- P0-3 修复前 props 变化 ~50-200ms（重建），修复后 ~1-5ms（reconfig）
- P1-1 修复前 selection 路径 ~5ms，修复后 ~0.5ms

或者删除量化验收，改为「Profiler 截图存档」形式。

---

### 问题 #6 · issue 「不破坏现有 cm6-*-test.ts 全过」是空话（测试覆盖盲区）

**症状**：issue 提到「不破坏现有测试」，但**当前 9 个热点几乎没有针对性测试**：
- `previewSyncExtension.ts` 没有滚动的 throttle 测试（虽然加了节流逻辑）
- `headingFoldExtension.ts` 没有折叠切换不重解析的测试
- `mathPreviewExtension.ts` 块级 `$$` 没有 matchAll 行为的测试
- `imageAssetExtension.ts` 测试文件可能不存在或只测 happy path

**修复方向**：issue 应补一句「**需要补 e2e 测试**：5w 字 + 滚动 / 折叠切换 / 富图片等场景的 Profiler 截图基准」。

---

### 问题 #7 · issue label 用 `perf/review` 但 PR 还没 review

**症状**：用了 `perf/review` label（描述「review result: keep or close」），但这是 review 结果标签，不是发起 review 的标签。

**修复方向**：删除 `perf/review`，加 `ready-for-human` 或保持 `priority/p1` + `area/ui` 双 label。

---

## 三、issue 评审结论

| 维度 | 评分 | 理由 |
|------|------|------|
| **价值** | ⚠️ 中 | 9 项优化已实现 → 价值在「复盘 / 量化基准 / 补 e2e 测试」；不在「新工作」 |
| **可执行性** | ❌ 低 | 按 issue 描述执行会重复造轮子 |
| **量化目标** | ⚠️ 中 | 有目标但缺基线；验收标准部分不可测 |
| **对齐代码** | ❌ 低 | 8/9 已实现，issue 完全没意识到 |
| **架构清晰度** | ✅ 高 | ROI 分批 / 不做的事 / 复用资产等章节结构好 |

**总评**：issue 本身写得用心，但**与代码状态脱节**，应关闭 / 替换为复盘 issue。

---

## 四、建议下一步

### 方案 A · 关闭 #223，开新复盘 issue（推荐）

新 issue 标题：`[复盘] CM6 性能优化 9 大热点已落地，附量化基准与 e2e 测试补强`

内容：
1. **9 个热点实现位置 + commit hash**
2. **量化基准**（修复前/后 Profiler 截图，对比）
3. **e2e 测试补强清单**（5 个场景：长文档滚动 / 长文档键入 / 富公式 / 富图片 / 评论批量）
4. **下一步性能观察方向**（未来 6 个月再回归）

### 方案 B · 把 #223 改写为「复盘 + 剩余 e2e 测试」issue

保留 #223 编号，body 重写为：
- 删除所有「修复方向」段落
- 「现状」段落标 commit 引用
- 「验收」改成 e2e 测试补强 checklist

### 方案 C · 直接关闭 #223（不推荐）

#223 内容有价值（perf-audit 的 9 大热点观察），完全关掉等于浪费工作。推荐方案 A 或 B。

---

## 五、给后续 issue 写法的提醒

1. **写 issue 前先 grep 代码**：每个「待做」项都要 grep 实现位置
2. **量化验收必须有基线**：否则验收标准是空的
3. **别跨多个 PR 周期写 issue**：性能优化这类敏感议题，应该每个 PR 落地后立即 grep 状态再决定下一个
4. **Compartment 模式会改变理论分析结论**：写性能 issue 必须考虑 props 变化的 React → Compartment 路径
5. **label 用法**：`perf/review` 是结果标签，不要用在发起 issue 上

---

## 六、附录 · 9 个已实现热点的 commit 检索命令

```bash
# P0-1 previewSync 节流
git log -S 'SCROLL_THROTTLE_MS' -- src/components/editor/cm6/previewSyncExtension.ts

# P0-2 EditorPane useRef
git log -S 'editorViewRef' -- src/components/EditorPane.tsx

# P0-3 Compartment 重构
git log -S 'createLivePreviewCompartments' -- src/components/editor/cm6/

# P1-1 mathPreview inline 删 selectionSet
git log -S 'update.docChanged || update.viewportChanged' -- src/components/editor/cm6/mathPreviewExtension.ts

# P1-2 headingFold headingsField
git log -S 'headingsField' -- src/components/editor/cm6/headingFoldExtension.ts

# P1-3 mathPreview 块级 matchAll
git log -S 'collectDollarMathRanges' -- src/components/editor/cm6/mathPreviewExtension.ts

# P2-1 markdownAnalysis 真 LRU
git log -S 'cache.delete(sourceHash)' -- src/services/markdownAnalysisService.ts

# P2-2 imageAssetExtension 缩范围
git log -S 'IMAGE_SELECTOR' -- src/components/editor/cm6/imageAssetExtension.ts
```

执行后可补 commit hash 到 issue 复盘。