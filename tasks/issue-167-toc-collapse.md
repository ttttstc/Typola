# Issue #167 — 大纲目录折叠/展开

> 2026-07-09 grill-me 落盘

## 用户诉求

`#167`: 左侧大纲目录（pinned 模式下的 `FloatingToc` 面板）只能平铺滚动，不支持按父 heading 收起/展开。希望参考 Word 大纲视图体验。

注：`#168`（MD 模式下代码块多行拖选）已由 commit `17135a0` 修复，与本任务无关。

## Grill 决策一览

| # | 决策点 | 选择 | 理由 |
|---|---|---|---|
| Q1 | 折叠范围 | A. 按父 heading | 与 Word / VS Code / Typora 大纲语义一致 |
| Q2 | 状态生命周期 | A. 会话内 transient | YAGNI，等用户真提"重启丢失"再加 |
| Q3 | 数据模型 | A. 组件内构树 | 不动 `TocItem` 类型、不影响其他消费方 |
| Q4 | chevron 位置 | B. 钉在最左列 | 改动 CSS 少，复用现有 `--toc-depth` 缩进 |
| Q5 | 触发区域 | A. 只点 chevron | 与 Word 完全一致，避免误触 |
| Q6 | 键盘可达 | A. chevron 是 `<button>` + `aria-expanded` | 跟仓库 a11y 风格一致 |
| Q7 | active 父链折叠 | A. 自动展开 | 与已有 `handleSearchNavigate` 中"搜索命中自动展开父链"同套路（`AppLayout.tsx:780-797`）|
| Q8 | 测试范围 | A. 纯函数单测 | 行为纯逻辑回归保护足够，UI 手动 QA 兜底 |
| Q9 | i18n | A. 加 `tocCollapse` / `tocExpand` 两个 key | 中英各一行 |

## 改动文件清单

| 文件 | 性质 |
|---|---|
| `src/services/tocTree.ts` (新) | 纯函数：`buildTocTree` / `findAncestorChain` / `filterCollapsed` |
| `src/services/tocTree.test.ts` (新) | 覆盖嵌套构造、父链定位、折叠剔除 |
| `src/components/FloatingToc.tsx` | 树形渲染 + chevron 按钮 + 父链自动展开 effect |
| `src/services/i18n.ts` | 加 `tocCollapse` / `tocExpand` 中英各一行 |
| `src/styles/app.css` | chevron 列宽 + `.floating-toc-item-chevron` 样式 |

## 不动的边界（明确划清）

- `TocItem` 类型（Q3）
- `useTocState` 行为、`extractToc`、`markdownHeadings` —— active heading 跟踪基于 flat array 跑 `forEach`，折叠在 `FloatingToc` 内部消化，**不**上提到 hook 层
- `AppLayout.tsx` 顶层 `foldedHeadings`（CM6 编辑器内部代码折叠）—— **不**与 TOC 折叠共享状态，是两套独立机制
- `FloatingToc` 的 pin / 展开 / alwaysPinned 三态逻辑保持不变

## 风险点

1. CSS 改动可能误伤其他 `.toc-h*` 消费者 → 改前 grep
2. animated panel 首次展开默认全展开，不会让用户看到空白
3. active 父链自动展开的 effect 必须用最新 activeIndex 而非闭包旧值（useEffect deps 包含 activeIndex）
4. chevron 占位列对深嵌套（h5/h6）不出现时仍要保留对齐 —— 占位用透明字符或空 `<span>` 保列宽

## 验收

- typecheck / vitest / cargo check 全过
- `npm run tauri:build:local` 出包给用户测试（per memory: Tauri 本地 build 必跑）
- 视觉 QA：手测一个 3 层嵌套文档，能展开/折叠；点 heading 文字仍是跳转；active heading 父链自动展开
- 自动化单测：`src/services/tocTree.test.ts` 18 个用例 / `src/components/FloatingToc.test.tsx` 6 个 RTL effect 用例

### 手动 QA checklist（review #11）

- [ ] 折叠 h1 后 active 切到 h1 子 → h1 自动展开（`FloatingToc.test.tsx` 已覆盖）
- [ ] 用户主动折叠 active 父链后，折叠保持（不被 effect 反向展开，review #1 已覆盖）
- [ ] activeIndex=-1（未滚动）不引发任何状态变更
- [ ] 切文件后 collapsed 清空（review #2 已覆盖）
- [ ] 5+ 层嵌套的缩进不串行
- [ ] 屏幕阅读器朗读 chevron 时能识别折叠哪个 heading（review #5：aria-label 拼上 item.text）
- [ ] 叶子 heading 不渲染 focusable button，列宽对齐保留（review #4）

## 不在范围内

- 折叠状态持久化（settings.json / per-file）
- 多选折叠 / 批量折叠快捷键
- chevron 之外的快捷键（如 Alt+Click 行折叠）
- 折叠动画（Motion library 加容易，但与 issue 无关）
