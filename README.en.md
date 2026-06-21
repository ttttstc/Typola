# Typola

> [中文](./README.md) · English

Typola is a lightweight, focused, cross-platform desktop Markdown editor. It is built for everyday writing, technical documentation, long-form editing, HTML/Word delivery, and local development workflows. It offers a Typora-like WYSIWYG editing experience while keeping source mode, Word/HTML preview and export, and an integrated terminal close at hand.

## Capabilities

- WYSIWYG Markdown editing: powered by Vditor IR mode, balancing Markdown control with a clean reading-like surface.
- Source mode: powered by CodeMirror 6 for precise Markdown, HTML, and table edits.
- File open and save: supports `.md`, `.markdown`, `.html`, `.htm`, and read-only `.docx` preview.
- Multi-file tabs: opening multiple documents from the file tree, recents, OS file association, or drag-and-drop creates lightweight tabs; dirty tabs show a leading `*`, and the tab bar hides automatically when only one file is open.
- Left workspace file tree: open a directory, lazily expand subfolders, and open supported documents straight from the tree; dirty files are marked with `*`.
- Word paper preview: open an A4-style preview panel on demand, inspect multi-page output, and export `.docx`.
- HTML preview and export: preview article-style HTML, export full HTML, and copy rich HTML for external editors.
- Editor-to-preview scroll sync: editor scroll position drives Word / HTML preview by ratio (one-way, rAF-throttled, no extra re-render).
- Floating outline: extract headings automatically, expand the outline on hover, pin it as a sidebar, and jump to sections.
- Find/replace and quick open: `Cmd/Ctrl+F` and `Cmd/Ctrl+H` share one panel with case / whole-word / regex options; `Cmd/Ctrl+P` filters recents by filename or path fragment.
- Editing utilities: insert links / images / Markdown tables in one click; pasted clipboard images are saved to a sibling `assets/` folder and inserted as a relative path.
- Document statistics: the status bar reports word count, characters, paragraphs, and estimated reading time on debounced updates so typing stays fluid.
- Integrated terminal: multi-tab bottom terminal with copy, paste, clear, link opening, custom shell, and file-directory startup.
- Local image resolution: relative Markdown images render correctly in the editor, previews, and export flows.
- Data safety: closing a tab or window with unsaved changes prompts a single "Save / Discard / Cancel" dialog; external file changes surface in the status bar.
- Preferences: configure theme, fonts, encoding, language, auto-save, update checks, and Word/HTML export presets.
- Native desktop behavior: file associations, drag-and-drop open, single-instance forwarding, external file change notices, and auto-update support.

## Document modes and AI co-authoring

Typola wraps the same document in three modes — Reading / Flow / Review — switched via a recessed segmented control in the top-right toolbar; left and right panels glide in and out automatically.

- **Reading mode**: the default. Focused reading and writing; toggle the file tree on the left and Word / WeChat preview on the right as needed.
- **Flow mode**: the left panel opens an AI Workbench chat; the right panel surfaces skill scenarios (daily/weekly report, summary, slide deck, HTML, WeChat article, data analysis); the window auto-maximizes. AI artifacts (HTML / Markdown / decks) land in `<workspace>/.typola-output/<conversation>/` and appear as chips in the right panel — one-click open in the main editor, archive to the workspace, or delete.
- **Review mode**: treats the document as a draft for review. The right panel shows a Review pane. Select a paragraph, add a comment via the floating bar, jump to it from the summary list, "Export review version" to write an in-paragraph-suffix Markdown copy (each commented segment followed by `> **Review comment, please address**: …`), or "Send to AI" to package the full document plus all comments into a prompt and let AI emit a revised draft.

### Selection floating bar and in-place loop

When you select text, a floating bar appears above the selection with these actions:

- **Polish / Shorten / Expand / Proofread / Explain**: a oneshot Claude call returns a diff card pinned next to the selection ("original vs new"); click "Accept replacement" to apply without leaving the editor. Polish also accepts pre-call instructions (e.g. "more casual", "tighter"); other actions use the default template.
- **Custom**: drops the selection as a quote into the AI Workbench composer for free-form requests.
- **Add review comment**: opens an inline editor and saves the comment into the Review pane.

The floating bar can be disabled at Settings → Editor → Selection floating bar. The right-click menu and `Ctrl+K` still reach the same actions.

### AI edits are undoable

Each AI replacement snapshots the editor content first. `Ctrl+Z` inside the editor is intercepted: if the document hasn't been hand-edited since, the AI change is reverted directly; if you've also hand-edited, native undo cleans up your hand edits first, then your next `Ctrl+Z` pops the AI snapshot — they never collide. Stepwise rollback, cleared automatically on file switch, capped at 50 AI snapshots.

### Claude CLI and skills

The AI Workbench drives your locally installed `claude` CLI (headless mode), and skill scenarios reference skills under `~/.claude/skills/`. No API key configuration inside Typola — every call inherits your own CLI environment and permissions.

## Strengths

- Direct writing flow: Typola opens into WYSIWYG editing by default, so writing does not require constant preview switching.
- Complete delivery path: one Markdown document can stay editable, preview as Word pages, export to `.docx`, or become HTML.
- Safer long-form editing: outline navigation, source mode, external file change notices, and unsaved-change prompts reduce accidental loss.
- Local-workflow friendly: the integrated terminal starts in the current file directory when possible.
- Cross-platform packaging: Tauri v2 keeps the app lightweight and supports Windows and macOS.
- Installer and portable builds: Windows provides both setup packages and portable zip packages.

## Installation

### Windows Installer

Download from GitHub Releases:

- `Typola_*_x64-setup.exe`
- `Typola_*_x64_*.msi`

Run the installer. This is the best option for regular use, file associations, and auto-updates.

### Windows Portable

Download from GitHub Releases:

- `Typola_*_windows-x64_portable.zip`

Extract the archive and run `Typola.exe`. The portable package does not install into `Program Files`, which makes it useful for temporary testing or portable use.

Windows still needs the Microsoft Edge WebView2 Runtime. Most modern Windows installations already include it.

### macOS

Download the `.dmg` for your chip architecture, open it, and drag `Typola.app` into Applications.

If you download a portable zip, extract it and run `Typola.app`. If macOS shows a security prompt on first launch, allow it from Privacy & Security settings.

## Basic Usage

- Open files with the toolbar button or by dragging Markdown, HTML, or Word files into the window.
- Edit in WYSIWYG mode by default, and switch to source mode for precise changes.
- Save with the toolbar or shortcut; use Save As to create a new Markdown or HTML file.
- Use the floating outline to inspect headings or pin it as a sidebar.
- Open Word preview to inspect page layout before exporting `.docx`.
- Open HTML preview to copy rich HTML or export a full HTML file.
- Open the bottom terminal to run commands from the current file directory.
- Configure theme, fonts, default encoding, language, auto-save, update checks, and export presets in Settings.

Common shortcuts:

- `Cmd/Ctrl + O`: Open file
- `Cmd/Ctrl + S`: Save
- `Cmd/Ctrl + Shift + S`: Save as
- `Cmd/Ctrl + F`: Find
- `Cmd/Ctrl + H`: Replace
- `Cmd/Ctrl + P`: Quick open
- `Cmd/Ctrl + Shift + I`: Editing utilities
- `Cmd/Ctrl + Alt + S`: Toggle source mode
- `Cmd/Ctrl + Alt + P`: Toggle Word preview
- `Cmd/Ctrl + Alt + M`: Toggle HTML preview
- `Cmd/Ctrl + K`: Open the AI action menu for the current selection
- `Cmd/Ctrl + Z`: Undo (covers AI replacements too)
- `Shift + A`: Toggle Flow mode
- `Cmd/Ctrl + ,`: Open Settings

## Development

Prerequisites:

- Node.js and npm
- Rust stable toolchain
- Tauri platform prerequisites for Windows/macOS

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run tauri dev
```

Run frontend-only development:

```bash
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Packaging

Build local installer packages:

```bash
npm run tauri:build:local
```

Windows installer outputs:

- `src-tauri/target/release/bundle/msi/*.msi`
- `src-tauri/target/release/bundle/nsis/*-setup.exe`

Build a local portable package:

```bash
npm run tauri:build:portable
```

Windows portable output:

- `src-tauri/target/release/bundle/portable/*_windows-x64_portable.zip`

Build release artifacts with updater signatures:

```bash
npm run tauri:build:update
```

macOS CI produces `.dmg` files and portable zip packages for each target:

- `src-tauri/target/aarch64-apple-darwin/release/bundle/portable/*_macos-arm64_portable.zip`
- `src-tauri/target/x86_64-apple-darwin/release/bundle/portable/*_macos-x64_portable.zip`

## Stack

- Tauri v2
- React 19
- TypeScript
- Vite 8
- Vditor
- CodeMirror 6
- xterm.js
- portable-pty

## License

Typola is licensed under the Apache License 2.0.
