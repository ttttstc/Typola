# Typola Architecture

Typola is a Tauri v2 desktop Markdown editor built with React 19, TypeScript, Vite 8, Vditor, CodeMirror 6, and a Rust backend.

## Core Shape

- `src/app/AppLayout.tsx` owns the document lifecycle, editor mode, preview panels, update flow, and terminal panel visibility.
- `src/components/WysiwygEditorPane.tsx` wraps Vditor IR mode for WYSIWYG Markdown editing.
- `src/components/EditorPane.tsx` provides CodeMirror source editing.
- `src/components/WordPaperPreviewPane.tsx` and `src/services/word/*` provide Word-style preview and `.docx` export.
- `src/components/WechatPreviewPane.tsx` is the HTML preview compatibility component. User-facing copy is generic rich HTML export/copy.
- `src/components/TerminalPanel.tsx` uses xterm.js for the bottom terminal panel.
- `src-tauri/src/lib.rs` owns system file open/read/write commands and terminal PTY commands.

## Terminal

The terminal is implemented with Tauri commands plus event streaming:

- `terminal_create` resolves a working directory and shell, creates a `portable-pty` PTY, and emits terminal output through `terminal_data`.
- `terminal_write`, `terminal_resize`, `terminal_kill`, and `terminal_clear` are exposed as front-end commands.
- Windows shell resolution prefers `pwsh.exe`, then `powershell.exe`, then `cmd.exe`.
- macOS/Linux shell resolution prefers `$SHELL`, then `/bin/zsh`, `/bin/bash`, and `/bin/sh`.
- The front end derives terminal cwd from the opened file path when available; otherwise Rust falls back to the user home directory.

## Product Rules

- Product name is `Typola`.
- Auto-save exists as a setting but defaults to off.
- Custom Word and HTML export presets are open by default with an 8-slot cap.
- Legal-industry-only UX, beta authorization UI, and complex-table original-view workflows are not part of the rewritten product.
