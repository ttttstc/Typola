# Typola

Typola is a lightweight desktop Markdown editor.

It focuses on a clean writing surface, dependable Markdown rendering, Word/HTML export previews, and an integrated terminal for local workflows.

## Features

- Open and save `.md`, `.markdown`, `.html`, `.htm`, and read-only `.docx` files.
- Typora-like WYSIWYG Markdown editing powered by Vditor, with CodeMirror source mode fallback.
- Floating table of contents with click-to-jump navigation.
- Word paper preview and `.docx` export.
- HTML preview/export with rich-text clipboard output for external editors.
- Theme, font, encoding, language, preview width, and auto-save settings.
- Integrated terminal panel with tabs, resize, copy, paste, clear, and selectable shell.
- Windows and macOS desktop builds via Tauri.

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

Build a local desktop bundle:

```bash
npm run tauri:build:local
```

## License

Typola is licensed under the Apache License 2.0.
