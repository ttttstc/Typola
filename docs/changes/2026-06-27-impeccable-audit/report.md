# /impeccable audit 诊断报告

**审计范围**:Typola 桌面应用(`D:\暂存\Typola`),分支 `fork/open-design-cli-ux`(已同步 `origin/main`)
**审计时间**:2026-06-27
**重点**:刚合入的 PR #100(AI 执行控制中心)+ 工具栏导出下拉(刚完成)

---

## Anti-Patterns Verdict(先看这个)

**Pass。** 没找到 gradient text、玻璃拟态默认化、hero metric 模板、eyebrow kicker、数字编号 section marker 等典型 AI 样板。暖米黄底色是 PRODUCT.md 第 3 条原则明确保留的品牌锚点,执行上用 OKLCH 严谨、token 化程度高。

但发现**两处 token 命名失真**(见下,P1),把系统的「token 纪律」拉低了。

---

## Audit Health Score

| # | 维度 | 分数 | 关键发现 |
|---|------|------|---------|
| 1 | Accessibility | 2/4 | 工具栏按钮缺 `:focus-visible`(WCAG 2.4.7);导出菜单无 Escape 关闭(WCAG 2.1.1);`prefers-reduced-motion` 仅覆盖 2 个组件(WCAG 2.3.3) |
| 2 | Performance | 3/4 | 检测按钮无 debounce;Toast 用绝对定位无 portal;Mermaid/cytoscape 等 chunk > 500kB(Vite 警告) |
| 3 | Theming | 2/4 | `--fg-muted` 和 `--border-default` 两个 token 不存在,4-6 处引用全 fallback;focus 描边硬编码 `oklch(58%...)`(亮色主题色),暗色主题失效 |
| 4 | Responsive | 3/4 | 桌面 Tauri 应用,断点非核心;但窄屏下 export-menu 居中可能出屏,无 fallback |
| 5 | Anti-Patterns | 4/4 | 无 AI 样板;`.agent-runtime-meta-grid` 的 84px 列宽定义克制 |
| **总分** | | **14/20** | **Good — 处理弱项维度** |

---

## Executive Summary

- **总分:14/20(Good)**
- **总数**:P0 ×0、P1 ×5、P2 ×6、P3 ×3
- **最大问题**:新合入代码引入的 token 命名 bug(`--fg-muted`、`--border-default`),会在用户切到暗色主题时暴露
- **结构性短板**:无全局 `:focus-visible` 默认样式,各组件按需补 → 系统性散点
- **下一步**:优先跑 `/impeccable polish` 集中修 P1,跑 `/impeccable audit` 时再过一遍暗色主题

---

## Detailed Findings

### P1 Major(必发前修)

#### [P1] Toolbar 按钮缺焦点指示
- **位置**:`src/styles/app.css:370-396`(`.app-toolbar button` 规则)
- **类别**:Accessibility
- **影响**:键盘用户 Tab 到工具栏图标时无视觉反馈,无法判断当前焦点位置
- **WCAG**:2.4.7 Focus Visible(Level AA)— 失败
- **修复**:在 `.app-toolbar button` 加 `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }`
- **建议命令**:`/impeccable polish src/components/Toolbar.tsx`

#### [P1] 导出下拉菜单不支持 Escape / 方向键
- **位置**:`src/components/Toolbar.tsx:89-98`(只听 `mousedown` click-outside)
- **类别**:Accessibility
- **影响**:键盘用户打开菜单后,无法用 Escape 关闭、方向键切换选项,鼠标是唯一操作
- **WCAG**:2.1.1 Keyboard(Level A)— 失败
- **修复**:添加 `keydown` 监听:Escape 关闭、↓↑ 在 menuitem 之间循环、Enter 触发当前项
- **建议命令**:`/impeccable polish src/components/Toolbar.tsx`

#### [P1] `--fg-muted` token 不存在(PR #100 引入)
- **位置**:`src/styles/app.css:5326, 5444, 5507, 5538`
- **类别**:Theming
- **影响**:Agent 设置页的辅助文本、运行时分隔标签在暗色主题下 fallback 到默认色(浏览器通常是黑/灰),对比度失控
- **修复**:全部替换为 `var(--muted)`(这是项目里实际存在的 token),或新增 `--fg-muted` 别名指向 `--muted`
- **建议命令**:`/impeccable polish`(一次扫掉所有 `var(--fg-muted)`)

#### [P1] `--border-default` token 不存在
- **位置**:`src/styles/app.css:461`(.export-menu)
- **类别**:Theming
- **影响**:导出菜单边框在所有主题下 fallback 到默认,亮色看起来像淡线、暗色看不见
- **修复**:替换为 `var(--border)` 或 `var(--border-soft)`
- **建议命令**:`/impeccable polish src/styles/app.css`

#### [P1] Focus 描边硬编码亮色 accent(暗色主题失效)
- **位置**:`src/styles/app.css:1894, 5656, 6033, 6070, 6088`(均硬编码 `oklch(58% 0.16 35 / ...)`)
- **类别**:Theming
- **影响**:暗色主题下 accent 是 `oklch(70% 0.13 42)`,硬编码值在深色背景上对比度可能 < 3:1
- **修复**:全部替换为 `var(--accent)`,或用 `color-mix(in oklch, var(--accent) 28%, transparent)`
- **建议命令**:`/impeccable polish src/styles/app.css`

### P2 Minor(下个迭代)

#### [P2] `prefers-reduced-motion` 覆盖太窄
- **位置**:`src/styles/app.css:5229-5235`
- **类别**:Accessibility
- **影响**:工具栏 `transition: 0.15s`、toast 淡入、按钮 hover、export-menu 弹出均不响应用户偏好,前庭疾病用户会眩晕
- **WCAG**:2.3.3 Animation from Interactions(Level AAA)— 提示性
- **修复**:在 `@media (prefers-reduced-motion: reduce)` 里加 `* { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }` 全局覆盖
- **建议命令**:`/impeccable polish src/styles/app.css`

#### [P2] `position: absolute` 导出菜单 + `!important` 滥用
- **位置**:`src/styles/app.css:452-491`
- **类别**:Anti-Pattern / Theming
- **影响**:`!important` 7 次叠加提示特异性战争;绝对定位可能被未来某天加的 `overflow: hidden` 父容器裁切
- **修复**:用更具体的选择器(`.app-toolbar .export-menu button`)取代 `!important`;改用 `<dialog>` 或 popover API
- **建议命令**:`/impeccable polish src/components/Toolbar.tsx`

#### [P2] 任意 z-index 值(无语义尺度)
- **位置**:`src/styles/app.css` 出现 0、1、2、5、6、7、14、20、80、100、130、2100 共 12 个不同 z-index
- **类别**:Anti-Pattern
- **影响**:语义不清,容易冲突。export-menu 用 100、settings-overlay 用 80,假设未来加 popover 会被埋
- **修复**:建立语义 token `--z-dropdown: 50; --z-sticky: 60; --z-modal: 100; --z-toast: 130; --z-tooltip: 150`
- **建议命令**:`/impeccable polish src/styles/app.css`

#### [P2] 检测按钮无 debounce
- **位置**:`src/components/settings/AiCliSection.tsx:66`
- **类别**:Performance
- **影响**:用户在路径输入框快速输入时,每次按键路径不变也点不到,但若连点检测会产生 N 次并发 IO
- **修复**:在 `handleDetect` 用 `AbortController` 或 200ms debounce
- **建议命令**:`/impeccable polish src/components/settings/AiCliSection.tsx`

#### [P2] AgentDiagnostics 错误文案对比度风险
- **位置**:`src/components/agent/AgentDiagnosticRow.tsx:30`、`app.css:5435-5445`
- **类别**:Accessibility
- **影响**:`--fg-muted` 已 fail,`.agent-diagnostic-row-detail` 因此对比度也 fail;需 4.5:1
- **修复**:依赖 P1 的 token 修复,自动解
- **建议命令**:同 [P1 fg-muted]

#### [P2] Toast z-index 与 export-menu 关系不明确
- **位置**:`app.css:95`(`.export-toast { z-index: 130 }`)vs `.export-menu { z-index: 100 }`
- **类别**:Anti-Pattern
- **影响**:无相关问题,但暴露了 z-index 尺度不一致
- **修复**:跟随 P2 z-index 修复

### P3 Polish(有时间就修)

#### [P3] `useEffect` 闭包 trap 风险
- **位置**:`Toolbar.tsx:89-98`
- **影响**:`handler` 闭包持 `closeExportMenu`,后者持 `setExportMenuOpen` — 当前 OK,但 `exportMenuRef` ref 不会触发 effect 重新订阅,菜单内部重渲染时闭包仍指向旧 ref(实际 ref 是稳定对象,所以安全)。**记录,无需修**。

#### [P3] 检测失败时无 toast 提示
- **位置**:`AiCliSection.tsx:21-36`
- **影响**:异常分支用 inline `<div>` 展示,一致性好;但跨面板看不到

#### [P3] 部分 outline 无 fallback
- **位置**:`app.css:1779`、`:word-preview-preset-popover:focus`、`find-input:focus`
- **影响**:这些都是 `:focus`,而非 `:focus-visible`,鼠标点击也会显示 outline — 略丑但不阻塞

---

## Patterns & Systemic Issues

1. **Token 命名漂移**:项目反复出现「设计稿取名 ≠ 代码 token」的偏差(`--fg-muted` / `--border-default`),需要在 DESIGN.md 明确所有合法 token 列表,CI 加 `grep -r 'var(--[a-z-]*-muted)' src/` 检查
2. **焦点样式散点**:19 处 `outline:` 规则分散在 app.css,无全局 fallback。需要在 base 层加 `:focus-visible` 默认
3. **z-index 自由化**:12 个不同数值,需要在 `tokens` 块定义语义层

---

## Positive Findings

- **OKLCH 全程使用**:从 `--bg` 到 `--accent` 到 `color-mix` 都是 OKLCH,色调一致性极高
- **CJK 字体栈**:fallback 链长而合理(`Songti SC` → `STSong` → `Noto Serif CJK SC` → `Source Han Serif SC` → `SimSun` → `Georgia`)
- **轻量品牌策略**:Restrained 色策略执行彻底,Accent 只用在 active / focus / 状态指示,从未装饰性出现
- **动效克制**:除了 toast 淡入 + 工具栏 0.15s 过渡,几乎无装饰动画
- **新 agent 组件**:DOM 结构清晰(`role="menu"`,`aria-label`,`aria-expanded`),骨架对
- **`color-mix` 用法成熟**:所有半透明边框/背景都用 `color-mix(in oklch, var(--token) X%, ...)` 而非独立 alpha token

---

## Recommended Actions

按优先级:

1. **[P1] `/impeccable polish src/styles/app.css`** — 一次扫掉 5 个 token / 焦点描边 / 暗色失效
2. **[P1] `/impeccable polish src/components/Toolbar.tsx`** — 加 `:focus-visible`、Escape 关闭、方向键
3. **[P2] `/impeccable polish src/components/settings/AiCliSection.tsx`** — 检测按钮 debounce
4. **[P2] `/impeccable adapt`** — 跑一遍 export-menu 在 1024px 以下的展开行为,看 4px 边距是否被裁切
5. **[P3] `/impeccable polish`** — 最后再过一遍 z-index 语义化

修完任意一项可以重跑 `/impeccable audit` 看分。