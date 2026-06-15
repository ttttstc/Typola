# Typola Architecture

Typola is a Tauri v2 desktop Markdown editor built with React 19, TypeScript, Vite 8, Vditor, CodeMirror 6, and a Rust backend.

## Core Shape

- `src/app/AppLayout.tsx` owns the document lifecycle, lightweight opened-file tab state, editor mode, preview panels, update flow, and terminal panel visibility.
- `src/components/FileTreePanel.tsx` provides the left workspace file tree. It opens a user-selected directory, lazily expands folders, and delegates file reads back to the same controlled open path used by dialogs and OS file association. The workspace file tree is collapsed by default and shares the left side slot with the AI workbench.
- `src/components/WysiwygEditorPane.tsx` wraps Vditor IR mode for WYSIWYG Markdown editing.
- `src/components/EditorPane.tsx` provides CodeMirror source editing.
- `src/components/FindReplacePanel.tsx`, `QuickOpenPanel.tsx`, and `EditAssistPanel.tsx` provide on-demand editing utilities. Their matching, recent-file, statistics, and snippet logic lives in small service modules so the main editor path stays light.
- `src/components/WordPaperPreviewPane.tsx` and `src/services/word/*` provide Word-style preview and `.docx` export.
- `src/components/WechatPreviewPane.tsx` is the HTML preview compatibility component. User-facing copy is generic rich HTML export/copy.
- `src/components/TerminalPanel.tsx` uses xterm.js for the bottom terminal panel.
- `src/components/AIWorkspacePanel.tsx` provides the left push-aside AI document workbench. It talks to Claude CLI through `src/services/agentService.ts` and never writes generated content directly to disk.
- `src/services/documentWatchService.ts` bridges file watcher commands/events for the active document.
- `src-tauri/src/lib.rs` owns system file open/read/write commands, directory listing, document watching, single-instance forwarding, terminal PTY commands, and the first Claude CLI agent commands.
- AI workbench architecture and phased acceptance criteria are tracked in `docs/AI_WORKBENCH_SPEC.md`.

## Desktop File Flow

- File open paths can come from the native open dialog, drag/drop, OS file association, second-instance forwarding, or reopen-last-file.
- `read_opened_document` and `write_opened_document` are the controlled Rust read/write path for supported document types. `saveFileAs` uses the same Rust write command in Tauri builds, so unsupported extensions are rejected consistently.
- Tauri capabilities keep filesystem plugin access scoped to common user document locations and dialog-granted paths. The desktop CSP allows Vditor's required `unsafe-eval`, but does not allow `script-src 'unsafe-inline'`.
- Opening another document creates or switches to a lightweight file tab instead of replacing the active document. Dirty state is stored per opened tab; dirty tabs and matching file-tree entries show a leading `*`. The active file state is mirrored into refs for close confirmation, so a just-edited tab cannot close before the tab snapshot catches up. Closing a dirty tab uses the same save / discard / cancel decision model as window close; choosing save writes the tab first and aborts the close if saving fails or Save As is cancelled. The Tauri close-request listener is registered once and reads that live dirty ref. Close requests are always intercepted first; dirty sessions ask whether to save before closing, discard changes, or cancel. If the user chooses save, Typola saves every dirty writable tab before closing and aborts if any save fails. After the decision Typola explicitly calls `window.destroy()`, allows repeated close events while destruction is in progress, and falls back to the Rust `force_close_main_window` command if the frontend close API fails. The tab bar is hidden while only one file is open.
- `list_directory_entries` lists a user-selected workspace directory for the file tree. It includes directories and supported document files, excludes hidden/build-heavy folders such as `.git`, `node_modules`, `dist`, and `target`, and sorts folders before files.
- The left workspace tree, AI workbench, and right preview panel are all width-adjustable. The left slot is mutually exclusive (`none` / `workspace` / `ai`) so the workspace tree and AI workbench never stack horizontally. The right Word preview can shrink to a compact width and keeps paper pages close to the resizer to reduce dead space.
- `tauri-plugin-single-instance` forwards secondary process argv paths to the running window through the existing `opened-paths` event.
- The active file is watched by Rust `notify` through `watch_opened_document` / `unwatch_opened_document`. External changes emit `file-changed`; the frontend suppresses events that arrive within 1.5s of a known self-write.
- If reopen-last-file fails, the stale path is cleared so the next launch does not retry a permanently missing document.
- Recently opened files are stored as lightweight local metadata in `localStorage` and filtered in memory for `Cmd/Ctrl+P`; Typola does not scan the filesystem or workspace during quick open.
- Pasted clipboard images are written through the Rust `write_attachment_file` command into a sibling `assets/` directory for the current document, returning a relative Markdown image path to the editor.

## Editing Utilities

- File search uses `documentSearchService` with debounced panel input. It supports plain text, regex, case-sensitive, and whole-word matching, with a hard match cap to keep very large documents responsive.
- Document statistics use `documentStatsService` on a debounced copy of the current document, so typing does not synchronously recompute counts.
- Source mode exposes precise CodeMirror insert and reveal operations through an editor command handle. WYSIWYG mode uses Vditor's insertion API and browser text find as a best-effort navigation path.

## Terminal

The terminal is implemented with Tauri commands plus event streaming:

- `terminal_create` resolves a working directory and shell, creates a `portable-pty` PTY, and emits terminal output through `terminal_data`.
- `terminal_write`, `terminal_resize`, `terminal_kill`, and `terminal_clear` are exposed as front-end commands.
- `terminal_data` carries raw bytes from Rust. The frontend decodes bytes with `TextDecoder` using the current default encoding, which avoids Rust-side lossy UTF-8 replacement on Windows shells.
- Terminal registry locks are held only while resolving session handles. PTY write/resize/kill operations run outside the global registry lock so one blocked session does not freeze other sessions.
- `terminal_clear` writes `ESC[3J ESC[2J ESC[H` to the PTY in addition to clearing the xterm viewport.
- Windows shell resolution prefers `pwsh.exe`, then `powershell.exe`, then `cmd.exe`.
- macOS/Linux shell resolution prefers `$SHELL`, then `/bin/zsh`, `/bin/bash`, and `/bin/sh`.
- The front end derives terminal cwd from the opened file path when available; otherwise Rust falls back to the user home directory.

## AI Workbench

The AI workbench is intentionally on-demand:

- The toolbar Bot button toggles a left-side panel that pushes the editor instead of covering it.
- `agent_detect` runs `claude --version` through Rust and supports either PATH lookup or a user-configured executable path.
- `agent_run_create` starts Claude Code with Open Design-compatible CLI arguments: `-p --input-format stream-json --output-format stream-json --verbose --permission-mode bypassPermissions`. The composed prompt is wrapped as one JSONL user message on stdin, parsed stdout JSONL is streamed through `agent_event`, and per-document session mappings are stored in the Tauri app data directory. On Windows, Claude child processes are spawned with `CREATE_NO_WINDOW` so `.cmd` wrappers do not flash a console.
- First runs use `--session-id <uuid>`; later runs for the same document use `--resume <uuid>` when the setting is enabled. Legacy non-UUID session records are ignored and replaced with a fresh UUID.
- `agent_run_stop` kills the tracked child process, and `agent_session_clear` removes the local session mapping.
- The frontend builds prompts from the current document, absolute file path, and selected working directory metadata. Generated text is shown in the Open Design-style left message stream first; Typola does not write AI output back to the editor automatically. If the user explicitly asks Claude Code to edit files, the CLI can operate in the selected/current working directory and Typola relies on the existing file watcher to surface external changes.
- The panel listener is registered only while the panel is visible, and no Claude process is started until the user clicks Run.

## Product Rules

- Product name is `Typola`.
- Auto-save exists as a setting but defaults to off.
- Custom Word and HTML export presets are open by default with an 8-slot cap.
- Legal-industry-only UX, beta authorization UI, and complex-table original-view workflows are not part of the rewritten product.

## Packaging

- Installer builds continue to use `tauri build` and produce Windows `MSI` plus `NSIS` setup packages from `src-tauri/target/release/bundle/`.
- Portable builds are produced by `scripts/build-portable.mjs`.
- On Windows, the portable packager copies `typola.exe` plus a small runtime note into a staging folder and emits `bundle/portable/*_windows-x64_portable.zip`.
- On macOS, the portable packager zips the generated `.app` bundle into `bundle/portable/*_macos-*_portable.zip`.
