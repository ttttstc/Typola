# Markdown 预览与导出

用户可以在编辑 Markdown 的同时打开 Word 纸张预览或 HTML 预览，并从导出菜单生成 PDF/Word 交付文件。

## 子功能

- `word-preview` 打开 Word 纸张预览并观察页数、版式和正文变化。
- `html-preview` 打开 HTML 阅读预览并切换 HTML 导出预设。
- `pdf-export` 通过导出菜单选择 PDF，并确认目标文件已生成。
- `word-export` 通过导出菜单选择 Word，并确认目标文件可读取。

## 用户视角入口

- 工具栏 `Word 预览`。
- 工具栏 `HTML 预览`；右侧面板内对应标签显示为 `微信预览`。
- 工具栏 `导出` 菜单中的 `导出 PDF`、`导出 Word`。
- Word 预览面板内的导出按钮、HTML 预览面板内的导出按钮。

## 用 exe-CDP harness 驱动

前置条件：

- 真实 exe 已启动并在内存文档中驱动 Word/HTML 预览；最新套件已记录 Word 页数、HTML 文章区域和 HTML 预设选择器。
- Word 预览不需要 Pandoc；PDF 导出还需要系统可用的 Chrome、Chromium 或 Microsoft Edge。
- 导出夹具路径和目标文件由本次运行创建，保存对话框和实际字节必须可核对。

- **Word 预览。** 点击 `button[aria-label="Word 预览"]`；预期 `aside.word-preview-panel` 可见，`.word-preview-meta` 显示页数和纸张尺寸。最新套件已执行并截图。
- **HTML 预览。** 点击 `button[aria-label="HTML 预览"]`；预期 `aside.wechat-preview-panel` 可见，`select[aria-label="HTML 导出预设"]` 可用，文章区域可读。最新套件已执行并截图。
- **导出 PDF。** 点击 `button[aria-label="导出"]` 后选择 `role=menuitem` 的 `导出 PDF`；预期看到阶段性导出状态，完成后在用户选定的夹具目标路径发现 PDF，并检查文件存在且大小大于零。
- **导出 Word。** 选择 `role=menuitem` 的 `导出 Word` 或 Word 面板导出按钮；预期出现完成状态，再用 ZIP/文件类型检查确认目标是可读取的 `.docx`，不能只凭“导出成功”文字。
- **清理预览。** 关闭 `关闭右侧预览` 或面板关闭按钮，确认正文仍可见；导出目标若是临时夹具则删除，证据截图和文件摘要不删除。

## 陷阱

- `HTML 预览` 和右侧面板标签 `微信预览` 是同一用户面能力的两个可见入口，不要把其中一个入口通过另一个入口的结果冒充覆盖。
- 预览可见不代表导出成功；导出必须核对实际文件路径、大小和类型。
- PDF 环境依赖 Chrome/Chromium/Edge；缺少它时标为受阻，不要安装或下载软件来掩盖环境缺口。
- Word 预览/导出不依赖 Pandoc；把 Pandoc 错误当作 Typola 失败会误诊。
- Word/HTML 导出样式不跟随应用主题；主题截图不能证明导出外观。

维护信息：相关实现位于 `src/components/WordPaperPreviewPane.tsx`、`src/components/WechatPreviewPane.tsx`、`src/services/word/`、`src/services/pdfExportService.ts` 与 `src/services/markdownExportRenderer.ts`；最近核对日期为 2026-09-11，Word/HTML 预览已在真实 exe 执行，PDF/Word 文件导出未执行。
