# 编辑器源码模式往返

用户可以在 CM6 写作视图和源码模式之间切换，输入 Markdown，并在另一个用户可见视图中确认标题和正文没有丢失。

## 子功能

- `mode-source` 切换到显示 Markdown 标记的源码模式。
- `source-edit` 在源码编辑器中输入标题、正文和列表。
- `mode-writing` 返回写作视图并保留同一份 Markdown。
- `roundtrip-proof` 从第二个视图读取标题和正文，确认往返成功。

## 用户视角入口

- 顶部工具栏的 `源码模式` 按钮。
- 快捷键 `Ctrl/Cmd+Alt+S`。
- 再次选择 `源码模式` 返回写作视图；工具栏的 `渲染模式` 是明确的返回入口。

## 用 exe-CDP harness 驱动

前置条件：

- 已按 `../SKILL.md` 构建 `src-tauri\target\debug\typola.exe`。
- 没有把正式同标识 Typola 实例当作本次验证目标。
- 从仓库根目录执行 `npm run verify:exe-core`。

- **确认真实应用。** `npm run verify:exe-core` 直接启动 `src-tauri\target\debug\typola.exe`；最新套件 `run.json` 的 `runtime.runtime` 为 `tauri`、页面地址为 `http://tauri.localhost/`，并由 `startup-distribution` 动作从 `设置 → 关于` 读取 `Typola` 与版本。
- **切换源码。** 套件点击 `button[aria-label="源码模式"]`，等待 `.cm-editor` 可见，并在 `run.json.actions` 和对应 ARIA 快照中记录源码编辑器可达。
- **输入 Markdown。** 套件点击 `.cm-content` 后输入标题、正文和列表；动作结果同时记录 source 包含标题/正文的结果。
- **回到写作视图。** 套件再次点击 `源码模式`，读取 `.cm6-markdown-editor-pane`；动作结果必须报告标题和正文均可回读，对应截图是可视证明。
- **复核清理。** 脚本结束后读取 `run.json.cleanup`；`processStopped`、`profileRemoved`、`cdpClosed` 均为 `true`，证据目录仍存在。

## 陷阱

- 只运行 `npm run test:e2e` 会走 Vite `webServer`，不能证明 exe 的 WebView2、Tauri IPC 或窗口启动。
- 不要用 `page.evaluate` 直接写编辑器状态；必须点击 `源码模式`、聚焦 `.cm-content` 并从写作视图回读。
- 未保存文档只存在本次内存状态，不能把状态栏的 `未保存` 当作磁盘保存证明。
- 已有正式 Typola 进程时不要用相同标识的 exe 重放；使用验证配置重新构建的独立标识。

维护信息：源码主要位于 `src/components/editor/cm6/`、`src/components/Toolbar.tsx` 和 `src/app/AppLayout.tsx`；最近核对日期为 2026-09-11，已在真实 exe 套件中执行。
