# Handoff — Mermaid 编辑/展示对齐 Typora → 交给 Codex

你冷启动接手 Typola(Tauri v2 + React 19 + TypeScript + Vite,桌面 Markdown 编辑器,Vditor 做 WYSIWYG/预览)。任务:让 ` ```mermaid ` 代码块在阅读/心流/检视三态以及微信/Word 预览里**渲染成 SVG 图**,对齐 Typora。

## 唯一权威依据

**`docs/MERMAID_SPEC.md`** —— 完整行为规格 + 根因 + 文件清单 + 实施顺序 + 验收 + 红线。**严格照它实现。** 先完整读一遍再动手。

## 分支策略

- 从最新 `main` 起新分支 `codex/mermaid`(图片展示 #62 已合 main,跟它配套)。
- 实施完成跑验证,**不要自行 commit**,等用户。

## 实测起点(已确认)

`test-mermaid.md`(根目录,工作树里已有)含 3 个 mermaid 块。**当前状态:阅读模式 + 心流模式都只显示纯文本代码,不渲染图。** 已验证。

## 关键根因(SPEC §1 详)

- ✅ `public/vditor/dist/js/mermaid/mermaid.min.js` 已 bundled
- ✅ `markdownFeatureDetector.ts` 已知 mermaid 需渲染
- ❌ 代码里 `grep mermaidRender|useMaxWidth` 零结果 —— **从未显式触发**,纯靠 Vditor 默认,默认 dead
- ❌ 4 个组件统一 `markdown: { sanitize: true }` —— 怀疑过滤了 mermaid 输出的 SVG
- ❌ `WysiwygEditorPane` 多了 `preview.markdown.codeBlockPreview: false`,可能阻断 IR 模式代码块渲染

## 5 个最易踩错的点(SPEC 里钉过,这里再强调)

1. **不要依赖 Vditor 的"默认 mermaid"** —— 它在 Typola 这种 CDN=`/vditor` 的本地部署下不会自动触发。我们**自己写 `mermaidRenderer.ts`**,在 4 个组件的 `after()` 里调,绕过 Vditor 内部不靠谱的触发管线。
2. **`renderMermaidIn` 必须幂等** —— 多次 input 触发不能叠加 DOM。已渲染的块加 `data-typola-mermaid-rendered="true"` 标记跳过。
3. **心流模式下光标在的 mermaid 块要跳过渲染** —— 否则用户正在编辑的代码会被你转成 SVG 弹出来,体验毁。selection 命中的祖先 pre 块 → 不渲染。
4. **sanitize 别动** —— 默认情况下,Vditor 的 sanitize 只影响 markdown 转 HTML 步骤;我们的 `renderMermaidIn` 在 `after()` 跑,运行时手动 DOM 操作不过 sanitize。**实施时验证这个假设**,若验证失败再讨论。
5. **流式(AI 生成)中的不完整 mermaid 块不要渲染** —— 围栏 ` ``` ` 不闭合的代码块,跳过 mermaid 渲染(否则用户用 AI 写 mermaid 时会满屏闪烁红错误条)。

## 文件清单

**新增**:
- `src/services/mermaidRenderer.ts` —— 共享渲染器(扫 + 渲染 + 错误兜底,幂等)
- `src/services/mermaidRenderer.test.ts` —— 单测(纯函数:HTML 进、断言输出含 SVG / 错误条)

**改动**:
- `src/components/PreviewPane.tsx` —— `Vditor.preview` 的 `after()` 里调 `renderMermaidIn(el)`
- `src/components/WechatPreviewPane.tsx` —— 同上,且**必须在 `setPreviewResult(...)` 之前**(微信预览的 HTML 序列化要含 SVG)
- `src/components/WordPaperPreviewPane.tsx` —— 同上,**必须在 applyTextStyle / 段后插 caption 之前**
- `src/components/WysiwygEditorPane.tsx` —— `after()` + `input` debounce 收尾都调 `renderMermaidIn(host)`;在 `renderMermaidIn` 里**排除当前 selection 所在祖先 pre**
- `src/components/EditorContextMenu.tsx` —— 右键命中 `.typola-mermaid` 时菜单加「复制为 SVG」
- `src/styles/preview.css`(或新建 `mermaid.css`)—— `.typola-mermaid` + `.typola-mermaid-error` 样式
- `package.json` —— 加 `mermaid` 依赖(版本走最新 stable;不复用 Vditor bundled 的旧版,跟 Vditor 解耦)

**不动**:
- `markdownFeatureDetector.ts`(已正确)
- `tauri.conf.json` / `lib.rs` / Rust 端 —— Mermaid 是纯前端,Rust 完全不碰

## 编码规范

- 注释、UI 文案一律中文
- **surgical**:只碰必要的,别顺手重构相邻代码
- mermaid 库 **lazy import**(`await import('mermaid')`),首次调用才加载,避免冷启动负担
- 错误处理:`try/catch` 包整个 render,失败时**保留原 `<pre>`** + append `.typola-mermaid-error` 红条,不抛
- 非平凡逻辑留单测:`renderMermaidIn` 的扫描 selector、幂等标记、错误兜底、流式不完整块跳过

## 验证套件

```bash
npm run typecheck
npm test -- --run
cd src-tauri && cargo check && cd ..
npm run tauri:build:local
```

完成后让用户实测:

- 打开 `test-mermaid.md`,**阅读 / 心流 / 检视** 三态都把 3 个 mermaid 块渲染成图(flowchart 有节点连线、sequence 有时序、class 有类框继承)
- **心流模式**点击 mermaid 图 → 进入源码编辑;改字 300ms 后实时重渲染;移出光标 → 收回为图
- 故意写错语法(如 `flowchart TD\n  A --> B[` 缺括号)→ 红错误条,文档其他部分正常
- 右键图 → 「复制为 SVG」 → 粘到 VS Code/记事本能看到 SVG XML 文本
- **微信预览 / Word 预览**也显图

## 红线(不做)

- PNG 复制 / 导出(本期只做 SVG;PNG 要 canvas 序列化,留下期)
- mermaid 主题动态切换 UI(代码里读 `settings.theme` 留接口即可;切换 UI 跟全局主题一起做)
- fork Vditor IR 渲染管线实现"完美 Typora 双态过渡动画"(MVP 接受 Vditor 默认行为)
- AI 流式生成中**逐字渲染** mermaid(围栏不闭合就跳过)

## 完成后

按 SPEC §四「实施顺序」做(8 步),每步跑验证。全做完报告各阶段验证结果 + 改动文件清单,**不 commit**。
