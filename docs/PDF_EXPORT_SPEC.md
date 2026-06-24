# PDF Export Spec

## Goal

为 Typola 提供桌面端 PDF 导出能力，输出结果遵循当前阅读视图的 Markdown 渲染效果，不污染主编辑窗口状态。

## Current Scope

- 前端把当前 Markdown 渲染成独立的 PDF HTML 片段。
- Rust 端创建离屏 hidden webview 加载 `public/pdf-print-shell.html`。
- hidden webview 注入 HTML，等待字体和图片完成首轮渲染后调用 WebView2 `Page.printToPDF`。
- 当前实现仅支持 Windows WebView2；其他平台明确返回“暂不支持”错误。

## Request Contract

`export_pdf(request)`

- `savePath: string`
- `html: string`

其中 `html` 是已经渲染完成、可直接打印的 HTML 片段，包含：

- Vditor 预览输出内容
- PDF 专用样式
- 代码高亮样式
- Mermaid 渲染结果

## Frontend Responsibilities

- 负责保存路径选择。
- 负责 Markdown → HTML 片段渲染。
- 负责应用当前主题、正文字体、标题字体、字号和行高。
- 负责本地图片地址重写与首轮图片等待。
- 负责导出互斥和“导出中”遮罩反馈。

## Backend Responsibilities

- 校验 `.pdf` 输出路径。
- 串行化 PDF 导出，避免并发写入和多 hidden webview 竞争。
- 创建 hidden webview，而不是复用主窗口打印。
- 在离屏窗口内等待内容 ready 后执行 `printToPDF`。
- 写入最终 PDF 文件并返回实际保存路径。

## Defaults

- 页面尺寸：A4
- 页边距：2cm
- 图片等待超时：30s
- 渲染 ready 总超时：45s
- 打印超时：60s

## Non-goals

- 本期不做页面设置对话框。
- 本期不做 macOS / Linux PDF 导出实现。
- 本期不做“导出后自动打开文件 / 在文件夹中显示”动作按钮。
