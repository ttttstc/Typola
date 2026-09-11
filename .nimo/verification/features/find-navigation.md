# 查找、快速打开与文档导航

用户可以在当前文档中查找和替换文本，用快速打开定位最近文件，用跳转到行和大纲在长文档中移动。

## 子功能

- `find-replace` 查找当前文档、前后导航、替换当前命中和全部替换。
- `quick-open` 按文件名或路径过滤最近文件并打开。
- `goto-line` 用 1-based 行号或行列号跳转，并自动限制越界值。
- `outline` 打开浮动/固定大纲、折叠层级并跳转到标题。

## 用户视角入口

- `Ctrl/Cmd+F`、`Ctrl/Cmd+H`、`F3` 和 `Shift+F3`。
- `Ctrl/Cmd+Shift+P` 打开 `快速打开最近文件`。
- `Ctrl/Cmd+G` 打开 `跳转到行`。
- 工具栏 `查看大纲`、浮动大纲中的标题按钮和折叠按钮。

## 用 exe-CDP harness 驱动

- 运行 `npm run verify:exe-core`，用 `.find-panel` 输入查找词和替换词，读取匹配数、替换后 source 以及关闭状态。
- 用 `Control+Shift+P` 等待 `.quick-open-overlay`，通过 `.quick-open-item` 选择夹具；用 `Control+G` 填写 `.goto-line-input` 后确认弹窗关闭。
- 输入带 `# 大纲根`、`## 子标题` 的 Markdown，点击 `button[aria-label="查看大纲"]`，从 `.floating-toc-item` 读取标题；点击标题后的滚动/选区也应留下证据。

## 陷阱

- 快速打开依赖最近文件状态；空列表时不能把弹窗出现误报为成功打开文件。
- 查找面板的替换区默认折叠，`全部替换` 必须用 source 内容证明每个命中都已变化。
- 跳转到行的输入是 1-based，越界会 clamp；只证明弹窗关闭不能证明落点正确。
- 大纲条目来自 Markdown 标题；没有标题时浮动大纲不挂载，不能用不存在的 DOM 作为失败依据。

维护信息：相关入口在 `src/components/FindReplacePanel.tsx`、`src/components/QuickOpenPanel.tsx`、`src/components/GoToLinePopover.tsx`、`src/components/FloatingToc.tsx` 和 `src/app/AppLayout.tsx`；最近核对日期为 2026-09-11，真实 exe 已执行查找替换、快速打开、跳转到行和大纲入口。
