# Typola Architecture

Typola is a Tauri v2 desktop Markdown editor built with React 19, TypeScript, Vite 8, Vditor, CodeMirror 6, and a Rust backend.

## Core Shape

- `src/app/AppLayout.tsx` owns the document lifecycle, editor mode, preview panels, update flow, and terminal panel visibility.
- `src/components/WysiwygEditorPane.tsx` wraps Vditor IR mode for WYSIWYG Markdown editing.
- `src/components/EditorPane.tsx` provides CodeMirror source editing.
- `src/components/WordPaperPreviewPane.tsx` and `src/services/word/*` provide Word-style preview and `.docx` export.
- `src/components/WechatPreviewPane.tsx` is the HTML preview compatibility component. User-facing copy is generic rich HTML export/copy.
- `src/components/TerminalPanel.tsx` uses xterm.js for the bottom terminal panel.
- `src/services/documentWatchService.ts` bridges file watcher commands/events for the active document.
- `src-tauri/src/lib.rs` owns system file open/read/write commands, document watching, single-instance forwarding, and terminal PTY commands.

## Desktop File Flow

- File open paths can come from the native open dialog, drag/drop, OS file association, second-instance forwarding, or reopen-last-file.
- `read_opened_document` and `write_opened_document` are the controlled Rust read/write path for supported document types. `saveFileAs` uses the same Rust write command in Tauri builds, so unsupported extensions are rejected consistently.
- Tauri capabilities keep filesystem plugin access scoped to common user document locations and dialog-granted paths. The desktop CSP allows Vditor's required `unsafe-eval`, but does not allow `script-src 'unsafe-inline'`.
- Opening another document checks the current dirty state first. If there are unsaved changes, Typola asks before replacing the active file.
- `tauri-plugin-single-instance` forwards secondary process argv paths to the running window through the existing `opened-paths` event.
- The active file is watched by Rust `notify` through `watch_opened_document` / `unwatch_opened_document`. External changes emit `file-changed`; the frontend suppresses events that arrive within 1.5s of a known self-write.
- If reopen-last-file fails, the stale path is cleared so the next launch does not retry a permanently missing document.

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
