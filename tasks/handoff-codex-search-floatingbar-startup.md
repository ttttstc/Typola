# Handoff — 搜索锚点 / 浮条干扰 / 启动优化(Codex 修复)

实测环境:`codex/search-jump-regression` 分支,本地 build(`src-tauri/target/release/typola.exe`,2026-06-25 08:09)。
实测方法:打开测试文档,内容包含 `_alpha_ _beta_ _gamma_` 三连斜体 + `foo first foo second foo third beta last`,Ctrl+F 搜 `beta`。

行为标准:对齐 Typora(快捷键除外)—— 输入即时高亮所有匹配,Enter / F3 跳转只 scrollIntoView + 选中匹配文本,**不弹任何 AI 浮条**,选中文本必须是被搜的词本身。

---

## P0-1:WYSIWYG 浮条抑制完全失效

**现象**:阅读模式 / 心流模式下,Ctrl+F 搜 `beta` 后按 Enter,选区浮条(润色 / 缩写 / 扩写 / 解释术语 / 校对 / 自定义 / 加检视意见)弹出,覆盖文档内容。

**根因**:`src/components/WysiwygEditorPane.tsx:388-390`

```tsx
// 搜索跳转期间临时抑制浮条——revealSearchMatch 设 selection 会触发
// selectionchange,但搜索高亮不需要浮条。
if (suppressFloatingBarRef.current) return;          // ← BUG:在 useEffect 顶层
const handleSelectionChange = () => {
  const editor = editorRef.current;
  ...
};
```

这行 `if (...) return;` 写在 `useEffect` 顶层 / `handleSelectionChange` 定义之外。等价于:**只在 effect 首次挂载那一瞬检查一次 flag**,之后 selectionchange 触发时根本不会再读 flag —— `revealSearchMatch` 把 flag 设 true 后再 set selection,handler 照常跑,浮条照常弹。

**对照正确实现**:`src/components/EditorPane.tsx:94-95`

```tsx
const computeFromSelection = () => {
  if (suppressFloatingBarRef.current) return;       // ← 在函数体内,每次触发都检查
  ...
};
```

**修复**:把 WysiwygEditorPane.tsx 那行移进 `handleSelectionChange` 函数体内第一行:

```tsx
const handleSelectionChange = () => {
  if (suppressFloatingBarRef.current) return;   // ← 移到这里
  const editor = editorRef.current;
  const ir = editor ? getIrElement(editor) : null;
  ...
};
```

(原 useEffect 顶层那行删除。)

**验收**:重新 build,测试文档搜 `beta` 按 Enter,浮条**不**出现,只有蓝色选区高亮在 `beta` 上。

---

## P0-2:WYSIWYG 搜索锚点偏移

**现象**:测试文档(IR 模式)搜 `beta`,显示 `2/2`,按 Enter 跳到第 2 个匹配,**选中的是 `third` 单词中的 `rd`**(偏移 -3 字符),不是 `beta`。

**根因**(根据 `951b53c` commit 信息):`src/services/documentSearchService.ts:186-211` 里 `sourceToPlain` 回溯找前一个 plain 字符判断 `_斜体_` / `*斜体*` 边界,但实测在三连斜体 `_alpha_ _beta_ _gamma_` + 后续普通段落 `foo first foo second foo third beta last` 场景下,IR DOM 映射结果仍然偏 -3。

需要做的事:
1. 跑 `npx vitest run src/services/documentSearchService` 看现有单测覆盖的场景
2. 加一条最小复现单测:
   - source = `_alpha_ _beta_ _gamma_\n\nfoo first foo second foo third beta last\n`
   - 在 Vditor IR DOM(`<em>alpha</em> <em>beta</em> <em>gamma</em><p>foo first...</p>`)里搜 `beta`,期望 2 个匹配,索引 = source 偏移 `[8, 12]` 和 `[58, 62]`
   - 当前实现要么少找一个,要么第 2 个匹配返回的 IR DOM Range 落在了 `third` 末尾
3. 根据失败单测的诊断,继续修 `findIrDomRange` / `sourceToPlain`。重点排查:
   - `<em>` 等 inline token 的 source marker(`_`/`*`)长度在映射时是否被正确计入(每个 marker 是 1 个 source char,0 个 plain char)
   - 三连相邻斜体之间的空格(1 个 source char = 1 个 plain char)是否引起 marker 计数错位
   - 跨越段落边界(`\n\n`)时 plain↔source 累加是否漏算

**验收**:
1. 新加的最小复现单测通过
2. 重新 build,实测搜 `beta` 两次,每次选中的都是文本里真正的 `beta`(在 IR 里斜体那个 `beta` 和末段 `beta` 都对)

---

## P0-3:diff 模块 eager import 拖慢启动

**现象**:用户主观感受启动变慢。客观数据 257ms 窗口出现,但首屏 bundle 含 `DiffReviewPane`(184 行 React)+ `markdownDiff`(302 行算法),与首屏渲染无关。

**根因**:`src/app/AppLayout.tsx:41-42`

```tsx
import { useDiffReview } from '../hooks/useDiffReview';
import { DiffReviewPane } from '../components/diff/DiffReviewPane';
```

`useDiffReview` 因为返回 controller 给同层 `AppLayout` 用,**不便 lazy**(且本身只有 useState/useCallback,无副作用,影响小)。
`DiffReviewPane` 只在 `state.isOpen=true` 时显示,**完全可以 lazy**,带 `Suspense` fallback null 即可。

**修复**:

```tsx
// AppLayout.tsx
import { lazy, Suspense } from 'react';
const DiffReviewPane = lazy(() => import('../components/diff/DiffReviewPane').then(m => ({ default: m.DiffReviewPane })));

// 渲染处(AppLayout.tsx:1359 附近)
<Suspense fallback={null}>
  <DiffReviewPane controller={diffReviewController} />
</Suspense>
```

**验收**:
1. `npm run build` 看 dist/assets 分块,确认有独立 `DiffReviewPane-xxxx.js` chunk(几十 KB),首屏主 chunk 减小
2. `npm run tauri:build:local` 重新 build,启动 typola 不打开 diff,功能正常;触发 AI 审阅时 DiffReviewPane 正常显示
3. 不需要看启动时间数字 —— 用户主观感受 + bundle 体积下降即可

---

## 验收清单(全部 build 后实测)

```
npm run tauri:build:local
```

然后用 `tasks/handoff-codex-search-floatingbar-startup.md` 同目录里写个临时 md,内容:

```md
# Search Test

foo bar foo bar baz

_alpha_ _beta_ _gamma_

foo first foo second foo third beta last
```

用 typola 打开它,逐项验证:

- [ ] **Bug 1**:Ctrl+F 搜 `beta`,显示 `1/2`。按 Enter 跳第 1 个,选中**斜体 beta**(`<em>beta</em>` 文本)。再按 Enter 跳第 2 个,选中**末段 beta**。两次都不能是 `rd` / `gamm` / `third` 等错位结果。
- [ ] **Bug 2**:上述跳转过程**没有任何 AI 浮条**弹出。
- [ ] **Bug 3**(回归保护):双击 typola.exe 启动,窗口可见、不自动最小化。
- [ ] **Bug 4**:`dist/assets/` 下 `DiffReviewPane` / `markdownDiff` 是独立 chunk,不在首屏主 chunk。

全部通过后报告完成。

---

## 不在范围内

- 搜索框关闭 / 替换 / Ctrl+G 上一个 / 高亮所有匹配的视觉样式 —— 这次不动
- AI 浮条本身的功能(润色 / 缩写 etc.)—— 只动「搜索期间不该弹」
- diff 模块算法 / UI —— 只动启动期 lazy
- 任何快捷键改动 —— 用户明确不要改键
