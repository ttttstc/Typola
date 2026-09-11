# Markdown 表格编辑

用户可以从工具栏插入 Markdown 表格，在网格中编辑单元格，并通过行列菜单、键盘导航和撤销完成结构化修改。

## 子功能

- `table-insert` 插入默认表格并在写作视图显示网格。
- `table-cell-edit` 直接编辑单元格内容。
- `table-row-column` 插入、移动、复制、清空和删除行列，设置对齐。
- `table-navigation` 用 `Tab`、`Enter` 和撤销历史操作表格。

## 用户视角入口

- 工具栏 `插入表格` 和插入菜单。
- `.tbl-cell-view` 单元格上的右键表格菜单。
- 表格末尾按 `Tab` 追加行，`Ctrl/Cmd+Z` 回退表格操作。
- 粘贴 Markdown、TSV/CSV 或 HTML 表格。

## 用 exe-CDP harness 驱动

- 运行 `npm run verify:exe-core`，点击 `button[aria-label="插入表格"]`，等待 `table.tbl-table[role="grid"]` 和 `.tbl-cell-view`。
- 切换到 `源码模式`，从 `.cm-content` 读取表头、分隔线和数据行，再返回写作视图；网格可见和 source 形状是两个独立观察。
- 完整配方还要在真实单元格上右键并逐项执行行列菜单、Tab 追加行和撤销，记录菜单 ARIA 与 source 变化；当前套件只执行插入及双视图确认。

## 陷阱

- 网格 DOM 不是唯一事实来源；只看到 `role=grid` 不能证明 Markdown 已生成。
- 表格右键落点和当前选区会改变命令目标，重复运行前必须清空或重启实例。
- `Tab` 在表格内应让位于单元格导航，不能用普通列表的缩进结果代替。
- 不能把 Vite `e2e/cm6-table.spec.ts` 的结果写成 WebView2/Tauri exe 证据。

维护信息：相关入口在 `src/components/editor/cm6/table/`、`src/components/EditorPane.tsx`、`src/services/editor/cm6FormatService.ts` 和 `src/services/htmlTableBlockService.ts`；最近核对日期为 2026-09-11，真实 exe 已执行插入和源码/网格确认。
