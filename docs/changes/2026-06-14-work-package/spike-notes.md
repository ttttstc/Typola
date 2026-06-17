# Spike Notes — 心流模式 R1/R2 验证

日期：2026-06-16  
分支：`codex/flow-mode-mvp`  
环境：Windows 11，`npm run tauri dev`，Typola 内嵌 `TerminalPanel` + Rust `portable-pty`

## R1：Windows 下 Claude 在 PTY 启动

结论：OK

验证方式：
- 临时让 `TerminalPanel` 在 dev 环境中自动打开终端 tab。
- 复用现有 `openNewTab` / `terminal_create` 起默认 shell。
- tab ready 后调用 `writeTerminal(termId, 'claude\r')`。
- 另一次临时把 `settings.aiClaudePath` 设为 `C:\Users\泥巴猪\AppData\Roaming\npm\claude.cmd`，再从 `settings.aiClaudePath.trim() || 'claude'` 读取并写入终端。

观察到的现象：
- 默认 PATH 形式 `claude` 可以在 Typola 底部内嵌 PTY 中启动 Claude Code TUI。
- 配置路径 `C:\Users\泥巴猪\AppData\Roaming\npm\claude.cmd` 也能进入 Claude Code 启动流程，说明 `aiClaudePath` 作为 shell 命令来源可生效。
- Claude TUI 显示 `Welcome back ttttstc!`、模型/账号信息、tips/release notes 或 workspace trust 提示。
- 中文内容、英文状态栏、图标/边框混排在 xterm 中显示正常，未观察到明显宽字符错位或乱码。

fallback：无。

阻断：
- 首次或特定 cwd 下 Claude 会先显示 workspace trust / security guide，例如 `Do you trust the files in this folder?`。这不是 Typola PTY 阻断，但会挡住后续 prompt 注入；正式实现不应自动处理该权限，用户需要在终端里自行确认。

## R2：Bracketed paste 落为可编辑输入行

结论：OK，带前置条件。

验证方式：
- 在 Claude TUI 启动后，通过 `writeTerminal(termId, '\x1b[200~把 a.md 生成 HTML 演示\x1b[201~')` 注入。
- 严格不追加 `\r`。
- 因第一次注入遇到 workspace trust 提示，第二轮 spike 临时先确认 trust，再延迟注入 bracketed paste。

观察到的现象：
- 注入文本 `把 a.md 生成 HTML 演示` 作为一整段出现在 Claude 输入行。
- 输入行末尾有光标，未自动提交，符合“用户可继续补参数后再 Enter”的交互要求。
- 没有出现逐行执行、提前提交、换行断裂或中文乱码。

fallback：暂不需要。

阻断：
- 如果 Claude 当前停在 workspace trust、权限确认、任务选择等 TUI 中间状态，bracketed paste 会被当前 TUI 状态消费或挡住。正式实现应只负责注入到当前终端，不解析/绕过 TUI 状态；用户需要先在终端里完成 Claude 原生确认。
- 为避免 spike 误触发真实生成/写盘，本轮没有实际按 Enter 提交该 HTML 生成指令；已验证文本落为可编辑输入行且未自动回车。

## 对正式实现的提示

- `startAgentTerminal` 可以按 spec 继续复用 `openNewTab` 起普通 shell，再用 `settings.aiClaudePath.trim() || 'claude'` 写入 `\r` 启动 Claude。
- 场景卡注入应使用 bracketed paste 包裹，并且不要追加 `\r`。
- 正式实现不要替用户处理 workspace trust、权限模式或 Shift+Tab；这些都留在 Claude TUI 内完成。
- 如果用户在 Claude TUI 处于非普通输入态，注入结果取决于 TUI 当前焦点；MVP 可在说明文案中提示“先确认终端里的 Claude 提示，再应用场景卡”。
