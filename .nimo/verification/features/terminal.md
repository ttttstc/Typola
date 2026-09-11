# 集成终端与离线工作

用户可以在 Typola 底部打开多标签终端，运行本机 PowerShell、cmd 或 AI CLI；无网络时仍可继续本地编辑、保存、预览和 Word 导出。

## 子功能

- `pty-start` 创建真实 portable-pty 会话并显示 ready 状态。
- `terminal-input` 向当前终端输入命令并读取实际输出。
- `terminal-tabs` 新建、切换和关闭多个终端标签。
- `offline-boundary` 区分本地编辑/导出与 AI、图床、远程图片的网络依赖。

## 用户视角入口

- 工具栏 `终端` 打开或隐藏底部终端。
- `Ctrl/Cmd+`` 切换终端，`Ctrl/Cmd+Shift+`` 新建终端标签。
- 终端标签、shell 选择和关闭按钮。

## 用 exe-CDP harness 驱动

- 运行 `npm run verify:exe-core`，点击 `button[aria-label="终端"]`，等待 `.terminal-panel`、`.terminal-session` 和 `.terminal-tab.ready`。
- 聚焦真实终端，输入 `echo NIMO_EXE_TERMINAL`，从 `.xterm-rows` 读取相同输出；这证明 PTY 接线和键盘输入，不只是面板存在。
- 关闭本次创建的终端标签并隐藏面板；运行日志记录终端关闭警告，但不能把它改写成无错误。

## 陷阱

- 只看终端面板或 `ready` 标签不能证明命令已执行，必须读取 shell 返回文本。
- AI CLI 的交互授权、工作目录信任和模型请求属于 AI 配方，不因终端能 echo 就标为通过。
- 终端关闭必须只作用于本次脚本创建的会话，不按进程名杀用户已有 shell。
- 离线可用边界要按能力记录；远程图片、图床和 AI 可能仍然不可用。

维护信息：相关入口在 `src/components/TerminalPanel.tsx`、`src/components/settings/TerminalSection.tsx`、`src-tauri/src/terminal.rs` 和 `src-tauri/src/main.rs`；最近核对日期为 2026-09-11，真实 exe 已创建 PTY、输入命令并回读输出。
