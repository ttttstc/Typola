# 公式、Mermaid 与富 Markdown

用户可以在同一份 Markdown 中编辑代码块、公式、Mermaid、引用、列表和任务列表，并在写作视图看到对应的渲染或可读错误。

## 子功能

- `math-render` 渲染块级 `$$...$$` 和行内 `$...$` 公式。
- `mermaid-render` 渲染 Mermaid fenced code，并支持缩放、复制 SVG 和错误状态。
- `code-block` 编辑普通代码块并使用代码块复制入口。
- `rich-paste` 将结构化 HTML、表格或纯文本粘贴为可回读的 Markdown。

## 用户视角入口

- 工具栏 `公式块`、`代码块`、`引用块`、列表和任务列表按钮。
- 源码模式中的 `$$...$$`、```` ```mermaid ```` 和普通 fenced code。
- 编辑器右键插入/编辑菜单、代码块复制按钮和富文本粘贴。

## 用 exe-CDP harness 驱动

- 运行 `npm run verify:exe-core`，输入公式和 Mermaid fenced code，返回写作视图，等待 `.typola-cm6-math-block` 与 `.typola-cm6-mermaid`。
- Mermaid 必须进入 `svg` 或 `.typola-cm6-mermaid-error` 之一；随后切回 `.cm-content`，确认原始公式和 Mermaid 语法仍存在。
- 完整配方还要分别验证普通代码块复制、富文本 HTML 粘贴和 Mermaid 缩放/右键复制，记录剪贴板或 source 的实际结果。

## 陷阱

- “渲染中”不是成功；超时或语法错误必须作为用户可读终态记录。
- Mermaid SVG 的显示不能取代源码保留证明，复制 SVG 也不能证明 Markdown 被修改。
- 公式、Mermaid 和普通代码块的装饰互斥；不能用普通代码块复制按钮替代专用 widget。
- 远程字体、网络图片和 CSP 可能影响外观；记录错误，不把环境问题改写成产品通过。

维护信息：相关入口在 `src/components/editor/cm6/mathPreviewExtension.ts`、`src/components/editor/cm6/mermaidPreviewExtension.ts`、`src/components/editor/cm6/codeBlockCopyExtension.ts`、`src/services/markdownPasteService.ts` 和 `src/services/markdownExportRenderer.ts`；最近核对日期为 2026-09-11，真实 exe 已执行公式/Mermaid 渲染与源码保留。
