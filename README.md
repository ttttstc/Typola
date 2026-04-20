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

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New file | `Ctrl+N` |
| Save | `Ctrl+S` |
| Toggle sidebar | `Ctrl+\` |
| Toggle outline | `Ctrl+Shift+\` |
| Toggle theme | `Ctrl+Shift+D` |
| H1 / H2 / H3 | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` |
| Body text | `Ctrl+0` |
| Bold / Italic / Strikethrough | `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+S` |
| Inline code / Link | `` Ctrl+` `` / `Ctrl+K` |

---

## Installation

### Installer (Recommended)

Download `Typola-Setup-0.1.0.exe` from the `release/` folder and run it.

### Portable Version

Download `Typola-portable-0.1.0.exe` from the `release/` folder and run it directly. No installation required.

**Requirements**: Windows 10/11 with WebView2 Runtime (pre-installed on most Windows 10/11 systems).

---

## Building from Source

### Prerequisites

- Node.js 18+
- Windows 10/11

### Build Steps

```bash
npm install
npm run electron:build
```

The built executables will be in:
- `release/win-unpacked/` — Unpacked application
- `release/` — NSIS installer and portable executable

---

## Tech Stack

- **Electron 33.x** — Desktop shell (Node.js + Chromium)
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
│   ├── main.ts             # Main process entry
│   ├── preload.ts          # Preload script
│   └── electron.d.ts       # TypeScript declarations
├── resources/              # Icons
├── release/                # Built executables
└── design/                # Design documents
```

---

## License

MIT
