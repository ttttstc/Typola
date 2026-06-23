# Typola Architecture

Typola is a Tauri v2 desktop Markdown editor built with React 19, TypeScript, Vite 8, Vditor, CodeMirror 6, and a Rust backend.

## Core Shape

- `src/app/AppLayout.tsx` owns the document lifecycle, lightweight opened-file tab state, editor mode, preview panels, update flow, and terminal panel visibility.
- `src/components/FileTreePanel.tsx` provides the left workspace file tree. It opens a user-selected directory, lazily expands folders, and delegates file reads back to the same controlled open path used by dialogs and OS file association. The workspace file tree is collapsed by default.
- `src/components/WysiwygEditorPane.tsx` wraps Vditor IR mode for WYSIWYG Markdown editing.
- `src/components/EditorPane.tsx` provides CodeMirror source editing.
- `src/components/FindReplacePanel.tsx`, `QuickOpenPanel.tsx`, and `EditAssistPanel.tsx` provide on-demand editing utilities. Their matching, recent-file, statistics, and snippet logic lives in small service modules so the main editor path stays light.
- `src/components/WordPaperPreviewPane.tsx` and `src/services/word/*` provide Word-style preview and `.docx` export.
- `src/components/WechatPreviewPane.tsx` is the HTML preview compatibility component. User-facing copy is generic rich HTML export/copy.
- `src/components/TerminalPanel.tsx` uses xterm.js for the bottom terminal panel.
- `src/components/conversation/ConversationPanel.tsx` provides the left AI Workbench conversation surface for Skill OS M1.
- `src/hooks/useAgentSession.ts` and `src/services/agent/*` bridge AI Provider headless stdout into typed message state and UI-friendly diagnostics. Claude Code is the current provider; OpenCode is planned as a second provider using the same CLI-shaped integration path.
- `src/services/documentWatchService.ts` bridges file watcher commands/events for the active document.
- `src-tauri/src/lib.rs` owns system file open/read/write commands, directory listing, document watching, single-instance forwarding, terminal PTY commands, AI CLI detection (`agent_detect`), and the headless AI Provider session commands used by the AI Workbench.

## Desktop File Flow

- File open paths can come from the native open dialog, drag/drop, OS file association, second-instance forwarding, or reopen-last-file.
- `read_opened_document` and `write_opened_document` are the controlled Rust read/write path for supported document types. `saveFileAs` uses the same Rust write command in Tauri builds, so unsupported extensions are rejected consistently.
- `rename_opened_document` renames an already-saved writable document within its current directory. The frontend exposes it from the title/tab rename dialog and syncs the resulting path back into tabs, recent files, and the active document state.
- Tauri capabilities keep filesystem plugin access scoped to common user document locations and dialog-granted paths. The desktop CSP allows Vditor's required `unsafe-eval`, but does not allow `script-src 'unsafe-inline'`.
- Opening another document creates or switches to a lightweight file tab instead of replacing the active document. Dirty state is stored per opened tab; dirty tabs and matching file-tree entries show a leading `*`. The active file state is mirrored into refs for close confirmation, so a just-edited tab cannot close before the tab snapshot catches up. Closing a dirty tab uses the same save / discard / cancel decision model as window close; choosing save writes the tab first and aborts the close if saving fails or Save As is cancelled. The Tauri close-request listener is registered once and reads that live dirty ref. Close requests are always intercepted first; dirty sessions ask whether to save before closing, discard changes, or cancel. If the user chooses save, Typola saves every dirty writable tab before closing and aborts if any save fails. After the decision Typola explicitly calls `window.destroy()`, allows repeated close events while destruction is in progress, and falls back to the Rust `force_close_main_window` command if the frontend close API fails. The tab bar is hidden while only one file is open.
- `list_directory_entries` lists a user-selected workspace directory for the file tree. It includes directories and supported document files, excludes hidden/build-heavy folders such as `.git`, `node_modules`, `dist`, and `target`, and sorts folders before files.
- The left workspace tree and right preview panel are width-adjustable. The right Word preview can shrink to a compact width and keeps paper pages close to the resizer to reduce dead space.
- `tauri-plugin-single-instance` forwards secondary process argv paths to the running window through the existing `opened-paths` event.
- The active file is watched by Rust `notify` through `watch_opened_document` / `unwatch_opened_document`. External changes emit `file-changed`; the frontend suppresses events that arrive within 1.5s of a known self-write.
- If reopen-last-file fails, the stale path is cleared so the next launch does not retry a permanently missing document.
- Recently opened files are stored as lightweight local metadata in `localStorage` and filtered in memory for `Cmd/Ctrl+P`; Typola does not scan the filesystem or workspace during quick open.
- Pasted clipboard images are written through the Rust `write_attachment_file` command into a sibling `assets/` directory for the current document, returning a relative Markdown image path to the editor.

## Editing Utilities

- File search uses `documentSearchService` with debounced panel input. It supports plain text, regex, case-sensitive, and whole-word matching, with a hard match cap to keep very large documents responsive.
- Document statistics use `documentStatsService` on a debounced copy of the current document, so typing does not synchronously recompute counts.
- Source mode exposes precise CodeMirror insert and reveal operations through an editor command handle. WYSIWYG mode uses Vditor's insertion API and browser text find as a best-effort navigation path.
- Mermaid rendering is centralized in `mermaidRenderer`. It lazy-loads the Mermaid library, converts `language-mermaid` code blocks to SVG after Vditor has rendered Markdown, preserves editable source blocks in WYSIWYG mode, and leaves syntax failures as source plus an inline error message. The same renderer feeds Markdown preview, AI/review previews, HTML preview output, and Word preview artifacts.

## Terminal

The terminal is implemented with Tauri commands plus event streaming:

- `terminal_create` resolves a working directory and shell, creates a `portable-pty` PTY, and emits terminal output through `terminal_data`.
- `terminal_write`, `terminal_resize`, `terminal_kill`, and `terminal_clear` are exposed as front-end commands.
- `terminal_data` carries raw bytes from Rust. The frontend decodes bytes with `TextDecoder` using the current default encoding, which avoids Rust-side lossy UTF-8 replacement on Windows shells.
- Terminal registry locks are held only while resolving session handles. PTY write/resize/kill operations run outside the global registry lock so one blocked session does not freeze other sessions.
- `terminal_clear` writes `ESC[3J ESC[2J ESC[H` to the PTY in addition to clearing the xterm viewport.
- Windows shell resolution prefers `pwsh.exe`, then `powershell.exe`, then `cmd.exe`.
- macOS/Linux shell resolution prefers `$SHELL`, then `/bin/zsh`, `/bin/bash`, and `/bin/sh`.
- The front end derives terminal cwd from the selected workspace tree first, then the opened file path; otherwise Rust falls back to the user home directory.

## AI Workbench

- The AI Workbench is provider-shaped. An AI Provider is a CLI backend such as Claude Code or OpenCode; each provider owns its executable path, optional model string, argument builder, stdout parser, diagnostics, and resume/session behavior.
- `agent_detect` runs the selected provider's version command through Rust and supports either PATH lookup or a user-configured executable path. On Windows, bare commands should resolve to `.cmd` / `.exe` wrappers before `.ps1`, so npm-installed CLIs work without PowerShell execution-policy failures. Child processes spawn with `CREATE_NO_WINDOW` so `.cmd` wrappers do not flash a console.
- The Settings → AI CLI section surfaces provider-specific availability and version checks. Claude Code keeps an optional Claude model string; OpenCode adds the same optional path and model shape. Empty path values use the provider default command (`claude` or `opencode`), and empty model values let the CLI choose its default model.
- The active provider switcher lives in the AI Workbench composer footer, not as the primary control in Settings. Changing the active provider confirms the switch and starts a new provider-bound conversation.
- Skill OS M1 uses separate headless commands (`agent_session_start`, `agent_session_resume`, and `agent_session_cancel`) instead of the PTY terminal. Rust spawns the selected provider with ordinary pipes, writes prompts through stdin or the provider's matching non-interactive input path, and forwards each stdout line as the `agent-stdout` Tauri event.
- Claude Code currently runs with `claude -p --input-format text --output-format stream-json --verbose`, plus session, model, plugin directory, and allowed-directory arguments. OpenCode should follow the same integration style with `opencode run`, JSON output, an optional model argument, the selected working directory, and permission flags only where they match OpenCode's documented CLI behavior.
- Conversation sessions are provider-bound. Switching editor files does not reset message history, but switching between Claude Code and OpenCode starts a new AI conversation instead of resuming the previous provider's CLI session.
- Frontend parsing is isolated in provider parser modules under `src/services/agent/`. The Claude Code parser maps stream-json into assistant text, thinking deltas, tool cards, usage summaries, and diagnostics. OpenCode's first pass must provide stable assistant text, completion state, errors, and cancellation; thinking and tool-card events are mapped only after OpenCode's JSON output shape is verified.
- The AI Workbench cwd is independent from the file tree. Typola uses only the user-selected `aiWorkspaceRoot`; if empty, no cwd is passed and Claude uses the process default directory. The current file-tree workspace is only surfaced as a recent-directory suggestion in the Composer WorkingDirPicker and never acts as an implicit cwd fallback.
- Changing the AI workspace starts a new conversation: the frontend confirms the change, cancels any active headless run, clears local messages, and lets the next prompt create/resume a fresh in-memory Claude session for the new cwd.
- Composer context chips are prompt-only context: the current document and attached files are appended to stdin text as reference paths. The current document chip is removable for the current file, and switching files restores a new current-document chip without resetting the global conversation. Chips do not change Claude CLI argv.
- The Composer `+` menu exposes three Claude-native integrations for M1: file attachment, `.mcp.json` editing under the selected cwd, and Plugin directories. Plugin directories are persisted as `aiPluginDirs` and forwarded to Rust so `build_claude_headless_args` appends repeated `--plugin-dir <path>` pairs.
- For M2 artifact return, headless requests can pass provider-specific allowed-directory arguments where supported. Typola runs providers from `<aiWorkspaceRoot>/.typola-output/<conversation>/` so relative writes land in a temporary local artifact area; provider-specific read/write access to `<aiWorkspaceRoot>` should be added only through documented CLI flags.
- Provider parsers may emit an `artifact_file` event when JSON output reports Write/Edit-style tool calls with a file path. The workspace watcher also listens to the AI workspace and filters changes under `.typola-output/` as a provider-neutral fallback. The UI shows these artifacts as right-bottom filename chips only; clicking a chip opens the file in the central editor, and `archive_artifact_to_workspace` moves a temporary artifact into the workspace with automatic name de-duplication.
- The headless workbench coexists with the terminal-based flow-mode agent path. The left rail is a single state machine (`none` / `workspace` / `aiWorkbench`), so file tree and AI Workbench are mutually exclusive and never create a fourth column. The existing bottom PTY terminal remains unchanged and flow mode no longer auto-opens it.

## Product Rules

- Product name is `Typola`.
- Auto-save exists as a setting but defaults to off.
- Custom Word and HTML export presets are open by default with an 8-slot cap.
- Legal-industry-only UX, beta authorization UI, and complex-table original-view workflows are not part of the rewritten product.

## Packaging

- `npm run tauri dev` 运行时，Vite 会忽略 `src-tauri/target/**`，避免前端 dev server 监听 Rust 构建产物并在 Windows 上撞到 `app_lib.dll` 文件锁。
- Installer builds continue to use `tauri build` and produce Windows `MSI` plus `NSIS` setup packages from `src-tauri/target/release/bundle/`.
- Portable builds are produced by `scripts/build-portable.mjs`.
- On Windows, the portable packager copies `typola.exe` plus a small runtime note into a staging folder and emits `bundle/portable/*_windows-x64_portable.zip`.
- On macOS, the portable packager zips the generated `.app` bundle into `bundle/portable/*_macos-*_portable.zip`.
