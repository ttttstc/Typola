# 对抗性 review（4 角色扇出 → 交叉验证 → 11 条候选）

针对 PR #173（fix(toc) 折叠/展开）做多角色对抗性审查：边界 case 猎人、React 渲染+可达性、消费方契约、测试盲区猎人。11 条候选合并去重，2 条**未通过 1-vote verify**已剔除（CSS 视觉回归细看其实继承不成立，但 row → item 显式 color 覆盖**仍成立**，保留；filterCollapsed 含叶 flatIndex 鲁棒性属设计意图，剔除）。

## 关键 bug（4 条 high，建议合入前修）

### 1. active 父链自动展开 effect 静默覆盖用户主动折叠 — 高

`src/components/FloatingToc.tsx:72-86`

`useEffect` 依赖 `[activeIndex, collapsed, items.length, tree]`，内部 `toExpand.every((i) => !collapsed.has(i))` 命中失败时调 `setCollapsed((prev) => next.delete(i))` 把父节点从 collapsed 集合中删掉。

**场景**：activeIndex 指向 h2「B.1」，用户点 h1「B」chevron 折叠 → `toggleCollapsed(2)` 把 2 加进 set → effect 重跑（`collapsed` 在 deps）→ `findAncestorChain(tree, activeIndex)` 返回 `[2, 3]` → `toExpand = [2]` → 2 ∈ collapsed → 删 2 → **用户的折叠被静默覆盖，chevron 视觉上又弹开**。

这与 issue 标题要的"Word/VS Code/Typora 大纲语义"不一致（Word 里折叠 active 父链是允许的）。要么：
- (a) effect 改成"只在 activeIndex 真正变化时展开"（用 ref 记上一次的 activeIndex）；
- (b) 引入 `userCollapsedRef`/`collapsedByUser` 标志位，effect 跳过 user-collapsed 的节点；
- (c) spec 改写明"折叠后 active 父链立刻被自动展开是预期行为"。

倾向 (a)：依赖里去掉 `collapsed`，只在 `activeIndex` 变化时跑一次。

### 2. Q2 spec 声称"切文件重置"，实际不重置 — 高

`src/components/FloatingToc.tsx:38` + `src/components/AppLayoutChrome.tsx:212`

`AppLayoutChrome.tsx:212` `<FloatingToc {...tocProps} />` 始终挂载（仅 `showToc={!isDocx}` 时不渲染，docx 模式才卸载）。**文件切换不会卸载 FloatingToc**，`useState<Set<number>>` 的 collapsed 跨文件残留。`tasks/issue-167-toc-collapse.md:36-37` 注释明写 "Q2 transient: switching files resets"，**与代码不符**。

**场景**：文件 A 30 个 heading，用户折叠 flatIndex=10。切到文件 B（5 heading），B 的 `tree` 重建，collapsed 仍是 `{10}`。`filterCollapsed` 用 `{10}` 在 B 上是 noop（B 没 10）。但用户**编辑 A 后** heading 数量变化，原 flatIndex=10 现在指向 A 中另一个 heading，**错误折叠继续生效**，且没有 UI 提示。

修复：要么 (a) effect 监听 `items` 引用变化时清空 collapsed（但目前 `tree` 已能感知），要么 (b) 把 `items` ref 放 deps 进来，要么 (c) 改 spec 把 Q2 写明"collapsing state lives for the lifetime of the FloatingToc instance, not per-file"，并相应更新注释。

### 3. CSS 视觉回归：active heading 文本不再高亮 — 高

`src/styles/app.css:1429` + `:1457-1459`

PR 把 `active` 类从 `.floating-toc-item` 移到 `.floating-toc-row`（FloatingToc.tsx:209）。行 1457 `.floating-toc-row.active { color: var(--accent); }` 想靠 color 继承把 active heading 染成 accent。但：

- 行 1421-1436 `.floating-toc-item { ... color: var(--muted); }` **显式**设了 color，**没有** `color: inherit`。
- 浏览器 button 不强制继承父级 color，**会沿用自身显式 color**。
- 结果：active 行的 background 是 `var(--control-active-bg)`（OK），但**文本仍是 `var(--muted)`**（与 main 分支行为不一致）。
- 行 1499-1501 `.floating-toc-item.active` 规则已**死代码**（item 不再有 active 类）。

修复：要么 (a) `.floating-toc-row.active .floating-toc-item { color: var(--accent); }`；要么 (b) `.floating-toc-item { color: inherit; }`。

### 4. chevron `aria-hidden` 应用在 `<button>` 上违反 WAI-ARIA — 高

`src/components/FloatingToc.tsx:217`

`aria-hidden={!hasSubtree}` 应用在 `<button className="floating-toc-chevron">` 上。WAI-ARIA 1.2 §5.4 明确禁止 `aria-hidden` 出现在 focusable/interactive 元素上。

**场景**：叶子 chevron 渲染为 `<button aria-hidden="true" tabIndex={-1}>` 无文本内容无 aria-label。tabIndex=-1 把它从 tab 序列拿掉，但老版 NVDA / VoiceOver iOS 仍可能把空 button 暴露在 virtual cursor / rotor 里，听起来像"unlabeled button"。

修复：叶子节点**不渲染** chevron button（`{hasSubtree && <button>...</button>}` 包住整段），用占位 `<span>` 维持列宽对齐（CSS `.is-leaf` 视觉隐藏占位）。这样既符合 a11y 也简化逻辑。

## 中等严重度（3 条 medium）

### 5. chevron aria-label/aria-expanded 缺标题关联 — 中

`src/components/FloatingToc.tsx:215-216`

`aria-label={hasSubtree ? (isCollapsed ? expandLabel : collapseLabel) : undefined}` 只说"收起/展开子标题"，没说**哪个** heading 的子标题。屏幕阅读器用户在 N 个 chevron 之间切换，听到的是"收起子标题 / 展开子标题 button collapsed/expanded"反复循环，无法区分折叠的是哪个子树。

修复：chevron 按钮用 `aria-labelledby` 引用 item button 的 id（或反之，把折叠状态 aria-owns 关联到子树 group），符合 WAI-ARIA disclosure pattern。

### 6. FloatingToc effect 零单测 — 中

`src/components/FloatingToc.tsx:72-86`

PR 的 Q8 决策写"纯函数单测 + UI 手动 QA 兜底"，但 effect 既不是纯函数（依赖 React 生命周期）也没 manual QA checklist 落盘（`tasks/issue-167-toc-collapse.md:51-53` 的验收章节只列了 5 项技术检查）。

至少需要 3 条 RTL 单测：
- (a) 折叠 h1 后 active 切到 h1 子 → h1 自动展开；
- (b) activeIndex 不变、collapsed 不变 → 不调用 setState；
- (c) activeIndex=-1 或 ≥ items.length → 不调用 setState。

### 7. `buildTocTree` 缺"连续同 level 兄弟"+"level 连续倒退"测试 — 中

`src/services/tocTree.test.ts`

5 个 buildTocTree 用例全在"单调嵌套或单一跳变"区间，没有触发 `while (stack[top].level >= item.level) pop` 的多 pop 路径。

缺失：
- `h1,h2,h2,h2,h1`：第二个 h2 应是第一个 h2 的兄弟（**当前实现 OK**，但无断言守护）；
- `h1,h3,h1,h1`：4 个 root 紧邻，stack 每次都被清空；
- `h3,h2,h1,h2`：连续倒退 3 次，最后 h2 应挂在 h1 下（`>=` 条件弹栈路径与 `==` 一致，无断言守护）。

`stack` invariant 注释（tocTree.ts:28-30）目前与代码一致，但**没测**的话未来 `>=` 改 `>` 立刻静默回归。

## 低（3 条 low）

### 8. `filterCollapsed` 缺"含无效/叶 flatIndex"鲁棒性测试 — 低

`src/services/tocTree.test.ts:77`

`collapsed={99}`（不存在节点）应等价于 `collapsed={}`；`collapsed={2}`（叶节点）应保留 2 自身（line 90 的 out.push 早于 line 91 的 has 检查），但行为靠手 trace，无测试守护。

### 9. effect 依赖 `items.length` 冗余 — 低

`src/components/FloatingToc.tsx:86`

`tree = useMemo(buildTocTree(items), [items])` 已经在 deps 里，items 引用变化必然重算 tree。`items.length` 重复声明除了让 `react-hooks/exhaustive-deps` 安静外没意义。删掉。

### 10. chevron onClick 的 `event.stopPropagation()` 是 dead defense — 低

`src/components/FloatingToc.tsx:219`

row `<div>` 没有 onClick，`stopPropagation` 现阶段无效果。是个 latent footgun：未来若加 row-level onClick（例如"点 row 任意位置 = 跳转"），chevron click 会悄悄不冒泡。**建议删掉**，或补注释"防御未来 row-level handler"。

### 11. `tasks/issue-167-toc-collapse.md` 验收章节缺 bug 回归 checklist — 低

`tasks/issue-167-toc-collapse.md:49-53`

Q8 决策写"UI 手动 QA 兜底"但没具体 checklist。建议补：
- 折叠 h1 后 active 切到 h1 子 → h1 自动展开；
- activeIndex=-1（未滚动）不引发任何状态变更；
- 切文件后 collapsed 是否清空（取决于 #2 的决策方向）；
- 5+ 层嵌套的缩进不串行；
- 屏幕阅读器朗读 chevron 时能识别折叠哪个 heading（取决于 #5 决策）。

## 总体评价

PR 总体干净（6 文件 +416/-16 集中、纯函数拆分合理、active 父链自动展开的 spec 思路正确），但有 4 条 high bug：
- 折叠 active 父链被静默覆盖（核心 UX 错误，**必须修**）
- Q2 切文件不重置（spec 与实现不符）
- active heading 视觉回归（与 main 不一致）
- `aria-hidden` 在 button 上违反 WAI-ARIA

任一都不需要重写，但都应在合入前修。

—— Claude（Fable 5），2026-07-09
