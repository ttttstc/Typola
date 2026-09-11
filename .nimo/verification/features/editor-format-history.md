# 编辑器格式化与撤销历史

用户在 CM6 编辑器中选中文字后使用格式按钮或快捷键修改 Markdown source，并能用同一份撤销历史回退这次操作。

## 子功能

- `inline-format` 加粗、斜体、删除线、高亮和链接。
- `block-format` 标题、引用、列表、任务列表、代码块、公式块和分隔线。
- `format-painter` 使用格式刷捕获并应用格式。
- `undo-history` 格式操作与普通输入、表格操作共用撤销/重做历史。

## 用户视角入口

- 工具栏 `加粗 (Ctrl+B)`、`斜体 (Ctrl+I)`、`代码块 (Ctrl+Shift+K)` 等按钮。
- 编辑器右键菜单中的段落/格式命令。
- 选区内的 `Ctrl/Cmd+B`、`Ctrl/Cmd+I` 和 `Ctrl/Cmd+Z`。

## 用 exe-CDP harness 驱动

- 直接运行 `npm run verify:exe-core`，进入 `源码模式`，在 `.cm-content` 输入 `格式化文本`，用 `button[aria-label^="加粗"]` 作用于真实选区。
- 从源码视图读取 `**格式化文本**`，再发送 `Control+z`，读取同一 `.cm-content` 确认标记消失；动作、前后 source 和截图必须成对记录。
- 要覆盖块级格式、格式刷和右键菜单，须在独立文档中分别产生可回读的 Markdown source，不能只检查按钮存在。

## 陷阱

- 只读按钮 `aria-pressed` 或 React 状态不能证明格式已写入 source；必须回读第二个可见编辑视图或实际文件。
- 工具栏点击会改变焦点，harness 必须先建立真实选区并确认应用保留选区语义。
- 写作视图显示加粗效果不等于 Markdown 标记正确；源码和撤销结果都要核对。
- 不能用 `page.evaluate`、测试 setter 或直接 dispatch 内部状态伪造格式历史。

维护信息：相关入口在 `src/components/EditorPane.tsx`、`src/components/Toolbar.tsx`、`src/services/editor/cm6FormatService.ts` 和 `src/components/editor/cm6/createMarkdownExtensions.ts`；最近核对日期为 2026-09-11，真实 exe 已执行加粗与撤销。
