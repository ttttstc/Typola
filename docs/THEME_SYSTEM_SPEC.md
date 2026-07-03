# Typola 主题系统：产品与技术方案

> 版本：v3.0（定稿）
> 适用仓库：`https://github.com/ttttstc/Typola`
> 关联 issue：#70
> 前提：无存量用户迁移负担，按最优雅的方式全新设计。

---

## 0. 结论摘要

Typola 的主题系统 = **主题注册表 + 核心 token 推导 + 静态 CSS 主题层**。

**主题即外观**：没有 light/dark 二值开关，没有「跟随系统」，用户在 3 个完整设计的主题中直接选择，所选即所得。

| 主题 ID | 中文名 | scheme | 定位 |
|---|---|---|---|
| `plain-paper` | 素笺 | 浅色 | **默认主题**。安静的纸感浅色，长文写作的舒适基线 |
| `night-current` | 深海 | 深色 | 低亮度深蓝黑，夜写、终端、AI 长任务 |
| `ink-basin` | 墨池 | 浅色 | 品牌主题。黑白水墨 × 现代排版 × 东方留白 |

核心技术决策：

1. **静态 CSS 规则**：主题编译为 `html[data-theme-id='...']` 变量块，切换只改 data attribute。无 inline style、无闪烁、可 transition、devtools 可调试。
2. **单一变量命名空间**：全代码库统一使用 `--theme-*`，无兼容映射层。
3. **核心 token（~15 个）+ 推导**：主题只定义核心色，其余由 `deriveTokens()` 生成，可显式覆盖。
4. **无背景氛围层**：不引入背景图/纹理，主题差异靠色彩、纸面层次、边线、AI 语义色。

---

## 1. 决策记录（ADR）

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 外观模型 | 主题即外观，无跟随系统 | 单一心智模型：选一个主题，得到一套完整外观 |
| D2 | 默认主题 | 素笺（浅色） | 浅色纸感是文档工具最普适的初见体验 |
| D3 | 兼容层 | 不做 | 无存量用户，变量命名一步到位 |
| D4 | 背景氛围 | 不做 | 主题以纯配色方案呈现，降低复杂度与包体积 |
| D5 | 主题应用机制 | 静态 CSS 规则 | 性能好、无切换闪烁、可维护 |
| D6 | 三态联动 | 全局统一规则，无 per-theme 覆盖 | 避免测试矩阵爆炸 |
| D7 | 导出 | 不跟随主题 | 导出样式由导出预设控制 |
| D8 | 自定义主题 | 首期不开放 | V2 考虑 JSON token 导入 |

---

## 2. 设计原则

1. **正文永远是纸面**：正文底色为不透明 `paper`，任何风格化不得降低可读性。
2. **风格放在边缘与细节**：canvas、侧栏、toolbar、边线、选区、AI 浮层是主题表达的主战场。
3. **AI 语义色独立建模**：选区 AI、diff、trace、rollback 不复用 `accent`。
4. **检视模式增强标注**（全局规则）：`data-doc-mode='review'` 下 review mark 与 diff 对比度提升。
5. **主题不触碰内容**：不影响 Markdown 文件与导出。

不做：背景图/纹理/动态背景、强制换字体、任意外部 CSS、per-theme 三态覆盖。

---

## 3. 三个主题的设计定义

### 3.1 素笺 Plain Paper（默认，P0）

- **定位**：不是「无设计的默认」，而是一个被认真调过的安静浅色主题。目标感受：翻开一本装帧克制的笔记本。
- **色彩方向**：
  - canvas：暖白偏米，低于纸面半档明度，让纸面自然「浮起」；
  - paper：接近纯白但非纯白的暖纸白（如 oklch 0.985 区间），避免屏幕刺白；
  - 正文：深暖灰黑（非纯黑），对比度 ≥ 7:1；
  - accent：沉稳的低饱和蓝或青，只出现在焦点态、链接、选中项；
  - 边线：极浅暖灰，能感知分区但不切割页面。
- **AI 语义色**：inserted 淡青绿、deleted 淡赭红、trace 淡蓝紫，全部低饱和高明度，融于纸面。
- **验收感受**：连续写作两小时不觉得界面「存在」。

### 3.2 深海 Night Current（P0）

- **定位**：真正为夜间设计的深色，不是浅色反转。
- **色彩方向**：
  - canvas：深蓝黑（带一点蓝相，避免死黑）；
  - paper：比 canvas 亮半档的深石墨蓝，维持「纸面浮起」的层次逻辑；
  - 正文：柔和灰白（禁纯白），对比度 ≥ 7:1；
  - accent：青蓝，低亮度不刺眼；
  - 阴影极弱，层次靠明度差而非投影。
- **AI 语义色**：inserted 低亮青、deleted 低亮玫红、pending 呼吸感靠透明度而非亮度脉冲。
- **终端**：ansi 16 色针对深海底色精调，保证 ls/git diff 可读。

### 3.3 墨池 Ink Basin（P0，品牌）

- **定位**：黑白水墨 × 现代文档工作台。是「用色纪律」，不是古风皮肤。
- **色彩方向**：
  - canvas：冷米宣纸白；
  - paper：干净纸白；
  - 正文：墨黑（非纯黑）；次级信息淡墨灰；
  - 边线：干墨浅线；
  - accent：墨黑本身 + **极少量朱砂**，朱砂只用于检视标注与关键强调，全界面朱砂面积 < 1%。
- **表达手段**：
  - 左右栏用比 canvas 略深的冷灰墨调，与纸面形成「留白」对比；
  - 选区 AI 浮条：浅墨晕染底 + 细墨线边框；
  - 检视 mark 用「朱批」隐喻：朱砂细边线 + 极小面积底色；
  - AI diff：inserted 淡墨青、deleted 淡朱砂，均低饱和。
- **禁止项**：卷轴、毛笔字 UI、山水画、印章滥用、大面积黑墨。

### 3.4 V2 Backlog

晨砂 Warm Sand（暖砂）、冷杉 Graphite Forest（工程蓝图风）。

---

## 4. 数据模型

### 4.1 类型定义

```ts
export type ThemeId = 'plain-paper' | 'night-current' | 'ink-basin';

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  description: string;
  scheme: 'light' | 'dark';   // 仅用于原生控件 color-scheme 与编辑器基线
  preview: { canvas: string; paper: string; accent: string };
  core: CoreTokens;
  overrides?: Partial<DerivedTokens>;
};
```

### 4.2 核心 token（主题必填，~15 个）

```ts
export type CoreTokens = {
  canvas: string;        // 外壳底色
  paper: string;         // 正文纸面（不透明）
  surface: string;       // 面板/卡片
  textPrimary: string;
  textSecondary: string;
  border: string;
  accent: string;
  selection: string;
  success: string;
  danger: string;
  warning: string;
  aiPrimary: string;     // AI 交互主色
  aiInserted: string;
  aiDeleted: string;
  reviewMark: string;
};
```

### 4.3 推导 token

由 `deriveTokens(core)` 用 `color-mix()` / oklch 变换生成，`overrides` 可显式覆盖：

```ts
export type DerivedTokens = {
  textMuted: string;
  borderSoft: string;
  borderHover: string;
  accentSoft: string;
  panelBg: string;
  controlBg: string;
  controlHoverBg: string;
  controlActiveBg: string;
  overlayBg: string;
  shadowSoft: string;
  paperShadow: string;
  ai: {
    selectionBg: string; selectionBorder: string;
    pending: string; pendingGlow: string;
    insertedBg: string; insertedText: string;
    deletedBg: string; deletedText: string;
    modifiedBg: string; trace: string; rollback: string;
  };
  markdown: {
    heading: string; link: string;
    quoteBg: string; quoteBorder: string;
    codeBg: string; codeText: string;
    tableBorder: string; hr: string;
  };
  editor: {
    caret: string; activeLine: string;
    gutterText: string; gutterBg: string; searchMatch: string;
  };
  terminal: {
    background: string; foreground: string;
    cursor: string; selection: string;
    ansi?: Record<string, string>;
  };
};
```

### 4.4 设置模型

```ts
export interface AppSettings {
  themeId: ThemeId;   // 默认 'plain-paper'
  themeOptions: {
    reviewEnhanceMarks: boolean;   // 默认 true
  };
}
```

无迁移逻辑。唯一防御：读取到未知 `themeId` 时 fallback 到 `plain-paper`。

---

## 5. 静态 CSS 主题架构

### 5.1 单一变量命名空间

全代码库统一使用 `--theme-*`，无旧变量、无映射层：

```css
/* src/styles/themes.css —— 由 npm run build:themes 从 ThemeDefinition 生成 */
html[data-theme-id='plain-paper'] {
  --theme-canvas: ...;
  --theme-paper: ...;
  --theme-text-primary: ...;
  --theme-accent: ...;
  --theme-ai-inserted-bg: ...;
  /* ... 全量 token ... */
}
html[data-theme-id='night-current'] { /* ... */ }
html[data-theme-id='ink-basin'] { /* ... */ }
```

生成脚本保证 TS 定义与 CSS 单一来源，并为 `color-mix()`/oklch 输出计算后的 hex 值（构建期计算，运行时零成本）。

### 5.2 应用逻辑

```ts
useEffect(() => {
  const root = document.documentElement;
  root.dataset.themeId = theme.id;
  root.dataset.colorScheme = theme.scheme;   // 原生控件、滚动条
  root.style.colorScheme = theme.scheme;
}, [theme]);

useEffect(() => {
  document.documentElement.dataset.docMode = docMode;
}, [docMode]);
```

无 inline setProperty、无 cleanup、无闪烁。

切换过渡（临时挂载，260ms 后移除，避免常驻 transition 影响滚动性能）：

```css
html[data-theme-transition] * {
  transition: background-color 240ms ease, border-color 240ms ease, color 240ms ease;
}
```

### 5.3 纸面层拆分

```css
.app-layout, .editor-workbench, .main-content { background: var(--theme-canvas); }

.wysiwyg-editor-pane .vditor-ir,
.wysiwyg-editor-pane .vditor-wysiwyg,
.editor-pane .cm-editor,
.editor-pane .cm-scroller { background: var(--theme-paper); }
```

### 5.4 三态规则（全局，唯一一条）

```css
html[data-doc-mode='review'] [data-review-mark='true'] {
  background: var(--theme-review-mark-bg-strong);
  box-shadow: inset 3px 0 0 var(--theme-review-mark-border);
}
```

受 `themeOptions.reviewEnhanceMarks` 控制。

---

## 6. 编辑器适配

### 6.1 CodeMirror 6

基线跟随 `theme.scheme`，细节全部走 CSS var，主题热切换无需重建：

```ts
EditorView.theme({
  '&': { backgroundColor: 'var(--theme-paper)', color: 'var(--theme-text-primary)' },
  '.cm-content': { caretColor: 'var(--theme-editor-caret)' },
  '.cm-gutters': {
    backgroundColor: 'var(--theme-editor-gutter-bg)',
    color: 'var(--theme-editor-gutter-text)',
    borderRight: '1px solid var(--theme-border-soft)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--theme-editor-active-line)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--theme-selection)' },
});
```

### 6.2 Vditor

- 初始化按 scheme：`preview.theme.current`、`hljs.style`（dark → `github-dark`）。
- 颜色细节以 CSS var 覆盖 `.vditor-ir` / `.vditor-reset` 的 code/blockquote/table/link/selection。
- **不因主题切换 remount**（保护光标与撤销栈）。同 scheme 切换（素笺↔墨池）纯 CSS 即时生效；跨 scheme 切换时 hljs 样式 MVP 接受「下次打开文档生效」，V2 增强。

### 6.3 xterm.js

```ts
terminal.options.theme = theme.derived.terminal;
terminal.refresh(0, terminal.rows - 1);
```

ansi 色板 MVP 只为深海精调。

### 6.4 AI 与 Review 表面

```css
.selection-floating-bar {
  background: var(--theme-ai-selection-bg);
  border-color: var(--theme-ai-selection-border);
}
.selection-result-card .diff-insert {
  background: var(--theme-ai-inserted-bg);
  color: var(--theme-ai-inserted-text);
  border-left: 2px solid var(--theme-ai-inserted-text); /* 不只靠颜色 */
}
.selection-result-card .diff-delete {
  background: var(--theme-ai-deleted-bg);
  color: var(--theme-ai-deleted-text);
  text-decoration: line-through;
}
[data-review-mark='true'] {
  background: var(--theme-review-mark-bg);
  box-shadow: inset 3px 0 0 var(--theme-review-mark-border);
}
```

---

## 7. 设置页交互

### 7.1 主题画廊

```text
外观

主题
┌────────────┐ ┌────────────┐ ┌────────────┐
│ 素笺        │ │ 深海        │ │ 墨池        │
│ 浅色·默认   │ │ 深色        │ │ 浅色·品牌   │
│ [CSS 微缩预览] │ [CSS 微缩预览] │ [CSS 微缩预览] │
└────────────┘ └────────────┘ └────────────┘

主题行为
[x] 检视模式增强 AI 改动与标注颜色
```

### 7.2 交互规则

- 卡片为纯 CSS 渲染的微型工作台（toolbar 条 + 左栏 + 纸面 + AI 色点），不用截图资源；卡片内颜色直接引用该主题的 token，永远与实际一致。
- **点击即应用并持久化**，配合 240ms 颜色 crossfade；toast「已切换到墨池」+「撤销」。
- Hover 只高亮卡片本身（浮起 + accent 描边），不预览全局。
- 键盘可达：方向键在卡片间移动，Enter 应用。
- 主题入口首期仅在设置页。

### 7.3 说明文案

> 主题会改变 Typola 的界面、编辑器、AI 浮层和检视标记，但不会改变 Markdown 文件内容。导出样式仍由 Word / HTML 导出预设控制。

---

## 8. 可读性验收标准

- 正文对比度 ≥ 7:1（三主题统一按长文标准执行；三者都是低饱和底色，可达）。
- muted 文本 ≥ 3:1，常规辅助文本 ≥ 4.5:1。
- 选区、caret 在三主题下均清晰。
- AI inserted/deleted 不只靠颜色区分（叠加边线/删除线/图标）。
- 深海正文禁纯白；墨池正文禁纯黑。

---

## 9. 里程碑（约 7～8 天）

| 阶段 | 内容 | 估时 |
|---|---|---|
| M0 | 主题模型：类型、注册表、deriveTokens + 单测 | 1 天 |
| M1 | 静态 CSS 架构：生成脚本、themes.css、全库变量统一为 `--theme-*`、素笺上线 | 1.5 天 |
| M2 | 设置页：ThemeGallery / ThemeCard / toast 撤销 | 1 天 |
| M3 | 深海落地 + 墨池视觉初版 | 2 天 |
| M4 | 编辑器适配：CodeMirror / Vditor / xterm / AI 表面 / review mark | 1.5 天 |
| M5 | 墨池打磨 + 检视增强规则 + 视觉回归、对比度检查、双平台验证 | 1～1.5 天 |

无迁移与兼容工作量；M1 的「全库变量统一」是一次性机械替换，风险低。

---

## 10. 测试方案

**单元**：未知 themeId fallback 到 `plain-paper`；`deriveTokens` 输出完整性与 overrides 优先级；生成脚本输出与注册表一致性。

**组件**：画廊渲染 3 卡片；点击更新 `data-theme-id` 并持久化；键盘导航。

**E2E**：切墨池 → 验证 `html[data-theme-id='ink-basin']` → 三态切换验证 `data-doc-mode` → 检视模式 mark 可见 → 源码模式 CodeMirror 可输入且内容不丢。

**视觉回归**：固定长文样本（标题/列表/引用/表格/代码/图片/review 意见/AI diff 卡片），3 主题 × 3 模式 × 2 编辑器视图 = 18 组截图，另加设置页、AI 浮条、result card。

---

## 11. PR 拆分

1. `feat(theme): theme registry, core tokens and derive pipeline` — 模型 + 推导 + 单测
2. `feat(theme): static theme css generation and unified --theme-* variables` — 生成脚本 + 全库变量统一 + 素笺
3. `feat(settings): theme gallery` — 画廊 + 卡片 + toast 撤销
4. `feat(theme): night-current and ink-basin` — 两主题 token 与样式
5. `feat(theme): editor, ai surfaces, review marks and terminal adaptation`

---

## 12. 风险与规避

| 风险 | 规避 |
|---|---|
| Vditor 内联样式对抗 | CSS var 覆盖优先，限定作用域提高特异性，禁止全局 `!important` 泛滥 |
| 墨池变古风 | 禁止项清单写入 PR checklist；朱砂面积 < 1% 作硬约束 |
| 全库变量替换遗漏 | 替换后 grep 旧变量名归零 + 视觉回归兜底 |
| 跨 scheme 切换 hljs 不即时刷新 | MVP 接受下次打开生效，V2 增强 |
| 用户误切主题 | toast 撤销 |
| 双平台渲染差异 | 生成脚本输出计算后的 hex，规避运行时 color-mix 差异；M5 双平台专项 |

---

## 13. V2 Backlog

- 晨砂、冷杉主题
- toolbar 主题快捷入口
- 自定义主题 JSON 导入（仅 CoreTokens）
- Vditor 跨 scheme 热切换增强
- 深色主题按系统时间的可选自动切换（若用户呼声高，以独立开关形式回归，而非绑死主题模型）

---

## 14. 验收清单

**产品**
- [ ] 默认主题为素笺，首启体验安静舒适
- [ ] 三主题差异明显，墨池具备品牌识别度且不古风
- [ ] AI 浮条、diff、review mark 在三主题下清晰
- [ ] 主题切换即点即用、有过渡、可撤销、重启保留
- [ ] 不影响 Markdown 内容与导出

**技术**
- [ ] typecheck / test / build 通过
- [ ] 未知 themeId fallback 正常
- [ ] 全库无旧变量残留（grep 归零）
- [ ] 主题切换无闪烁，Vditor/CodeMirror 不丢内容与光标
- [ ] Windows / macOS 外观一致
- [ ] 18 组视觉回归截图稳定
