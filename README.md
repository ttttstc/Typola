# Typola

A lightweight, AI-friendly Markdown editor for Windows desktop.

[中文](./README_zh.md) | English

---

## Features

- **Notion-like editing** — WYSIWYG Markdown editing without syntax
- **Slash commands** — Type `/` to insert blocks (headings, lists, tables, code, mermaid diagrams)
- **Floating toolbar** — Select text to format (bold, italic, strikethrough, code, link)
- **Right-click context menu** — Quick heading selection
- **Auto-save** — 500ms debounce, never lose your work
- **External change detection** — Detects when files are modified by external editors
- **Mermaid diagrams** — Insert and edit diagrams with live preview
- **Shiki syntax highlighting** — Beautiful code blocks with language labels
- **Light/Dark theme** — Toggle with `Ctrl+Shift+D`
- **File tree & outline** — Navigate large documents easily
- **Tab bar** — Switch between multiple files
- **Right-click delete** — Delete files from file tree

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New file | `Ctrl+N` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Toggle sidebar | `Ctrl+\` |
| Toggle outline | `Ctrl+Shift+\` |
| Toggle theme | `Ctrl+Shift+D` |
| H1 / H2 / H3 | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` |
| Body text | `Ctrl+0` |
| Bold / Italic / Strikethrough | `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+S` |
| Inline code / Link | `` Ctrl+` `` / `Ctrl+K` |

---

## Download & Installation

### System Requirements

Windows 10/11

### Portable Version

Download `Typola-portable.zip`, extract, and run `Typola.exe` directly.

### Build from Source

```bash
npm install
npm run electron:build
```

Built files are in the `release/` directory.

---

## Tech Stack

- **Electron 33.x** — Desktop runtime
- **React 18** + TypeScript — Frontend framework
- **Milkdown** — ProseMirror-based Markdown editor
- **Shiki** — Code syntax highlighting
- **Mermaid** — Diagram rendering (lazy loaded)
- **Zustand** — State management

---

## Project Structure

```
typola/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── editor/             # Milkdown editor setup
│   ├── store/              # Zustand stores
│   └── styles/             # CSS files
├── electron/               # Electron main process
│   ├── main.ts             # Main entry
│   └── preload.ts          # Preload script
├── resources/               # Icons
├── release/                # Built executables
└── design/                 # Design documents
```

---

## License

MIT