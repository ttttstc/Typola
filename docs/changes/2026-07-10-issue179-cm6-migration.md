# Issue #179：CM6 写作主链路迁移说明

## 已切换能力

- Markdown 写作与源码模式统一渲染 `Cm6MarkdownEditorPane`；模式切换只改变 live preview widget，不再切换编辑器实现。
- `TypolaEditorKernel` 是 AppLayout、文件 Tab、图片插入、AI 选区、检视跳转和查找替换唯一使用的编辑器契约。
- AI anchor 使用当前 CM6 source offset 校验后通过 `replaceRange` 采纳；CM6 history 负责 `Ctrl/Cmd+Z` 撤销。
- 单个与全部查找替换经 `replaceRanges` 作为单个 CM6 transaction 提交。
- 工具栏、Markdown 快捷键与右键菜单经 `format` 调用同一份 CM6 command；基础格式、引用、链接、任务、代码块和语言编辑均不操作编辑器 DOM。
- 写作模式启用任务列表、表格、图片、KaTeX 与 Mermaid live preview；源码模式保留标题折叠、滚轮缩放、预览同步和 search reveal，关闭上述 preview widget。

## 保留的工程 fallback

- `WysiwygEditorPane` 与 Vditor 相关格式服务未进入用户可见编辑分支，仅保留为工程内部遗留实现；`AppLayout` 不再导入或渲染它。
- Vditor 继续服务既有 Markdown 预览与导出 renderer，不承担写作编辑职责。

## 后续独立范围

- Review Decoration、MarkdownAnalysisService、复杂表格编辑、Mermaid/KaTeX block widget 深化和导出 renderer 去 Vditor 化，按 Issue #179 的拆分建议另行实施。

## 回归入口

- 单元测试覆盖格式 transaction、查找替换、CM6 扩展、图片与标题折叠。
- Playwright 覆盖 CM6 写作/源码模式、格式撤销、图片、IME、标题折叠与搜索自动展开。
