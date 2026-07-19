# Typola

> [中文](./README.md) · English

**Typola is a Windows desktop workbench for Markdown writing, AI revision, and document delivery.**

Write, review, collaborate with AI, and ship a document without shuttling between an editor, a chat page, a terminal, and export tools.

> Markdown editor + AI document assistant + local artifact center.

## Who it is for

- Writers of long-form Markdown, reports, technical documents, or publishable content who want a near-final reading view.
- People who want AI help with revision and review while approving every applied change.
- Teams and individuals who need drafts, AI artifacts, and PDF / Word / HTML deliverables to stay in a local workspace.

## Release highlights

### Markdown stays the source of truth

- CM6 writing and source modes share the same Markdown. Preview images, tables, code, math, and Mermaid diagrams in place.
- Tables support cell / row / column selection, right-click row and column actions, Markdown / TSV / HTML paste, Tab / Enter navigation, and undo / redo.
- Includes file tree, multi-document tabs, find and replace, quick open, scroll sync, and a floating outline.

### AI revision stays under your control

- Select text to polish, rewrite, shorten, expand, proofread, or explain it. Review a diff before applying it.
- Attach review comments to passages, manage them together, and export `review.md`.
- Connect the Claude Code and OpenCode CLIs already installed on your machine. Your CLI remains in charge of models, permissions, MCP, and quota.

### Deliverables return to local files

- Reports, slide drafts, HTML, and other AI outputs are collected under `.typola-output/`. Open, compare, archive, overwrite the source, or undo an overwrite.
- Export the same Markdown document to PDF, Word, or HTML, or copy rich HTML for publishing workflows. Word uses the bundled TypeScript `docx` generator and does not require Pandoc or another external converter.

## Start in 60 seconds

1. Download a Windows installer or portable build from [GitHub Releases](https://github.com/ttttstc/Typola/releases).
2. Open or drag in a Markdown, HTML, or Word file.
3. Write in Writing mode; switch to Source mode when you need raw Markdown.
4. Select text for an AI revision or add a review comment.
5. Manage generated local files in the Artifact Center, then export PDF, Word, or HTML.

## Install

### Windows installer

Download `Typola_*_x64-setup.exe` or `.msi`. Use an installer for long-term use, file associations, and auto-update support.

### Windows portable

Download `Typola_*_windows-x64_portable.zip`, fully extract it, and run `Typola.exe`. This is intended for evaluation and portable use.

> Typola requires Microsoft Edge WebView2 Runtime. Release packages provide guidance when it is missing. Distribute the installer or portable zip, not the inner `Typola.exe` by itself. PDF export also requires an installed Google Chrome, Chromium, or Microsoft Edge browser; Word export does not require Pandoc.

## Before using AI

Typola does not bundle or sell a model account. Install the CLIs you want through their official channels and verify them in a terminal:

```bash
claude --version
opencode --version
```

Then open **Settings → AI Runtime** to detect them. Your existing account, model, permissions, MCP, and plugin configuration stay under your local CLI.

## Common shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + O` | Open file |
| `Ctrl + S` | Save |
| `Ctrl + F` / `Ctrl + H` | Find / Replace |
| `Ctrl + Shift + P` | Quick open |
| `Ctrl + K` | Open AI actions for selected text |
| `Ctrl + Z` | Undo, including AI revisions |
| `Ctrl + P` | Export PDF |
| `Ctrl + ,` | Open Settings |

## Product decisions

- **The document is the product; AI chat is scratch space.** AI output must return to local files and the editor.
- **Markdown is the single source of truth.** Editing, preview, and export derive from the same source whenever possible.
- **Reuse local tools first.** AI uses your local CLI and skill ecosystem instead of locking you into an account.
- **Risky changes stay explicit.** AI replacements, source overwrites, and unsaved closes retain clear confirmation and undo paths.

## Development and packaging

Requirements: Node.js, Rust stable, and Tauri v2 platform prerequisites. Windows packaging also needs WebView2 Runtime and NSIS tooling.

```bash
npm install
npm run tauri dev
npm run typecheck
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

```bash
npm run tauri:build:local      # NSIS setup.exe + MSI
npm run tauri:build:portable   # portable zip
npm run tauri:build:update     # release build with updater artifacts
```

## Technology and docs

- Desktop: Tauri v2, Rust, portable-pty
- Frontend: React, TypeScript, Vite
- Editor: CodeMirror 6, `codemirror-markdown-tables`, Vditor (preview / export compatibility)
- Markdown: KaTeX, Mermaid, DOMPurify

Implementation detail and architecture decisions:

- [Architecture](./docs/ARCHITECTURE.md)
- [AI Workbench Skill OS](./docs/AI_WORKBENCH_SKILL_OS.md)
- [AI Editing and Review](./docs/AI_EDIT_AND_REVIEW_SPEC.md)
- [PDF Export](./docs/PDF_EXPORT_SPEC.md)

## License

Apache License 2.0
