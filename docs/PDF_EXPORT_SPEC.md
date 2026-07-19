# PDF Export Spec

## Goal

为 Typola 提供桌面端 PDF 导出能力，输出结果遵循统一的 Markdown 导出渲染效果，不污染主编辑窗口状态。

## Current Scope

- 前端先通过 `markdownToExportHtml` 将当前 Markdown source 转为独立 HTML。
- 导出 HTML 使用 remark/rehype 管线，包含 GFM、代码高亮、KaTeX、Mermaid SVG、本地图片解析和 HTML sanitize，不依赖 Vditor preview DOM。
- 用户先通过原生保存对话框选择目标 `.pdf` 路径；取消保存时不会执行 Markdown 解析或启动浏览器。
- Rust 后端把 HTML 写入临时目录，启动已安装的 Chrome、Chromium 或 Edge，以 headless `--print-to-pdf` 生成临时 PDF，再复制到目标路径。
- 浏览器路径只在当前应用进程首次导出时探测并缓存；每次导出使用隔离的临时 profile，避免污染用户浏览器状态。
- 当前发布目标为 Windows；后端同时保留常见 Linux/macOS 浏览器命令名的发现逻辑。

## Request Contract

`export_pdf_file(path, html)`

- `path: string`：用户在保存对话框中选择的 `.pdf` 目标路径。
- `html: string`：已经包装为完整 HTML 文档的可打印内容，包含 PDF 专用样式和导出渲染结果。

## Frontend Responsibilities

- 负责默认导出路径和保存对话框。
- 负责 Markdown → HTML 渲染、frontmatter 清理、代码/公式/Mermaid 处理和本地图片解析。
- 负责生成 PDF 专用页面样式（默认 A4、18mm 页边距）以及文件名。
- 通过顶端非阻塞 toast 报告阶段进度：选择保存位置、解析资源、页面排版、生成 PDF 页面和写入完成。
- 与 Word 导出共享互斥状态；导出中重复触发会被忽略。

## Backend Responsibilities

- 检查可用浏览器；未找到 Chrome、Chromium 或 Edge 时返回可读错误。
- 使用临时 `index.html`、`output.pdf` 和隔离 profile 启动 headless 浏览器。
- 轮询输出文件，等待非空文件大小稳定 350ms；45 秒内未完成则终止渲染进程并返回失败。
- 只在生成有效 PDF 后复制到用户选择的目标路径，并清理临时目录。

## Defaults

- 页面尺寸：A4（210 × 297mm）
- 页边距：18mm
- 浏览器渲染超时：45s
- 输出文件稳定窗口：350ms

## Non-goals

- 本期不做页面设置对话框。
- 不在应用内捆绑完整 Chromium，也不恢复 WebView2 `Page.printToPDF` hidden webview 路径。
- 不做“导出后自动打开文件 / 在文件夹中显示”动作按钮。
