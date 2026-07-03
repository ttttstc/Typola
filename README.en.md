# Typola

> [中文](./README.md) · English

**Typola is a desktop writing workbench that brings Markdown authoring, AI revision, and document delivery into one window.**

The hardest part of writing is often not the writing itself. It is the copy-paste dance between an editor, an AI chat page, a terminal, a preview tool, and an export tool. Typola pulls those pieces together: write Markdown, ask AI to polish a selection, turn workspace material into reports / slides / HTML, review a draft, and export PDF, Word, HTML, or review.md without leaving the flow.

Most importantly, AI output does not stay buried in chat history. It becomes local files in your workspace: open them, compare them, archive them, overwrite the source, or undo that overwrite later.

> Think of Typola as a **Markdown editor + AI document assistant + local artifact center**.

## What You Can Do With It

- **Write with less friction** — edit Markdown while seeing a near-final reading experience, including images, tables, code blocks, math, and Mermaid diagrams.
- **Revise faster** — select text to polish, rewrite, shorten, expand, proofread, or explain terms; review the diff before applying changes.
- **Review clearly** — attach comments to specific passages, manage all feedback in one place, export review.md, or ask AI to produce a revised draft.
- **Generate real files** — turn the current document or workspace material into reports, slide drafts, HTML pages, and other local artifacts.
- **Deliver without tool hopping** — export PDF, Word, HTML, or copy rich HTML for editors such as WeChat-style publishing flows.
- **Keep context close** — the AI Workbench can use the current document, attachments, and workspace context; when information is missing, it asks through an in-app form.
- **Use your local setup** — connect to Claude Code / OpenCode already installed on your machine. Accounts, permissions, models, and quota remain managed by your local CLI.

## Feature Tour

### Writing and reading

- Markdown live preview for writing in a near-final layout.
- Source mode, find/replace, quick open, editing helpers, document statistics, scroll sync, and outline navigation.
- Task lists, tables, code blocks, images, KaTeX math, and Mermaid diagrams.
- Local relative images, clipboard image paste into `assets/`, remote image preview, and export consistency.
- Multi-file tabs, file tree, drag-and-drop open, and safe prompts for unsaved changes.

### AI revision and review

- Select text to open a floating action bar: polish, rewrite, shorten, expand, proofread, explain terms, custom request, or add review comment.
- AI results appear as diff cards, so you decide before replacing the source text.
- Typola snapshots AI edits, and `Ctrl/Cmd+Z` can roll them back step by step.
- Review comments can be managed together, exported as review.md, or used as input for another AI revision pass.

### AI Workbench

- Supports Claude Code and OpenCode, switchable from the composer footer.
- Multi-turn conversations, multiple sessions, session rename, stop generation, and follow-up questions.
- Thinking, answers, tool calls, and question forms render as native cards; low-priority tool activity is folded by default.
- Current document, attachments, and workspace context can be included when asking AI.
- If AI needs more information, Typola shows an interactive form and continues the task after submission.

### SkillHub and Artifact Center

- Built-in scenario entries for report generation, PPT creation, HTML creation, and more.
- Recommended skills show installation state and guidance; installed local skills can be added to scenarios.
- AI-generated files are collected under `.typola-output` in the active workspace.
- The Artifact Center can show current-session artifacts or all artifacts, with open, diff, archive, delete, overwrite original, and undo overwrite actions.
- AI revision outputs are also listed as artifacts instead of being trapped in the conversation.

### Export and delivery

- PDF export runs in the background and reports success or failure with a toast.
- Word export includes paper preview and `.docx` output.
- HTML export supports full HTML, rich HTML copy, and WeChat-style article preview.
- `.docx` files can be opened as read-only previews.

### Desktop experience

- Windows and macOS support.
- File associations, single-instance open, and auto-update support.
- Integrated bottom terminal that starts from the selected workspace or current file directory.
- Auto-save exists as a setting, but is off by default to avoid accidental overwrites.

## Installation

### Windows installer

Download one of the following from GitHub Releases:

- `Typola_*_x64-setup.exe`

Use the installer if you want file associations and auto-update support. Windows ships both `setup.exe` and `.msi` installers, and each package includes the WebView2 bootstrapper in the single installer file so machines without WebView2 can be repaired automatically.

### Windows portable

Download `Typola_*_windows-x64_portable.zip`, fully extract it, and run `Typola.exe` directly. It checks Microsoft Edge WebView2 Runtime before creating the app window. This does not install into `Program Files` and is useful for quick testing or portable use.

> The portable build does not write into Program Files, but the first launch runs the bundled WebView2 bootstrapper when the runtime is missing. If the computer is offline or installation fails, Typola shows a visible error and opens the official installation page. `Start-Typola.cmd` is kept only as a diagnostic fallback.
> Do not distribute the inner `Typola.exe` as a standalone artifact. Windows releases are distributed as installers and portable zip packages.

### macOS

Download the `.dmg` matching your architecture, open it, and drag `Typola.app` into Applications. If macOS blocks first launch, allow it under Privacy & Security.

## AI CLI Setup

Typola does not bundle a model account. Install the CLI tools you want to use through their official channels, then verify the commands are available:

```bash
claude --version
opencode --version
```

Then open **Settings → AI Runtime** and run detection. Model choice, permissions, MCP, plugins, and quotas remain controlled by your local CLI environment.

## Quick Start

1. Open a Markdown / HTML / Word file, or drag it into the window.
2. Write in Reading mode; switch to source mode when you need raw Markdown.
3. Select text and use the floating bar for AI edits or review comments.
4. Enter Flow mode, pick a SkillHub scenario, or ask directly in the AI Workbench.
5. Use the Artifact Center to open, diff, archive, or overwrite generated files.
6. Export PDF / Word / HTML / review.md when ready to deliver.

Common shortcuts:

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Shift + S` | Save as |
| `Ctrl/Cmd + F` / `H` | Find / Replace |
| `Ctrl/Cmd + Shift + P` | Quick open |
| `Ctrl/Cmd + P` | Export PDF |
| `Ctrl/Cmd + Shift + I` | Editing helpers |
| `Ctrl/Cmd + K` | Open AI actions for selection |
| `Ctrl/Cmd + Z` | Undo, including AI edit snapshots |
| `Shift + A` | Toggle Flow mode |
| `Ctrl/Cmd + ,` | Open Settings |

## Development

Prerequisites:

- Node.js + npm
- Rust stable
- Tauri v2 platform prerequisites
- Optional on Windows: WebView2 Runtime, NSIS packaging tools

```bash
npm install
npm run tauri dev        # desktop dev mode
npm run dev              # frontend-only dev mode
npm run typecheck        # TypeScript check
npm test                 # Vitest unit tests
cargo test --manifest-path src-tauri/Cargo.toml
```

## Packaging

```bash
npm run tauri:build:local      # local installers: NSIS setup.exe + MSI
npm run tauri:build:portable   # local portable zip
npm run tauri:build:update     # release build with updater artifacts
```

Outputs:

- Windows executable: `src-tauri/target/release/typola.exe`
- Windows NSIS installer: `src-tauri/target/release/bundle/nsis/`
- Windows MSI installer: `src-tauri/target/release/bundle/msi/`
- Windows portable: `src-tauri/target/release/bundle/portable/`
- macOS: `.dmg` and portable zip from CI

## Project Layout

```text
src/                 React frontend, editor, AI Workbench, export UI
src-tauri/           Tauri / Rust backend, filesystem, terminal, CLI spawn, export commands
docs/                Architecture, AI Workbench, editor, export, and feature specs
config/              Vite / TypeScript / Playwright / ESLint configuration
public/vditor/dist/  Local Vditor assets
scripts/             Packaging, portable, and updater-manifest helpers
```

## Stack

- Desktop: Tauri v2, Rust, portable-pty
- Frontend: React 19, TypeScript, Vite 8
- Editor: CodeMirror 6, Atomic Editor, Vditor
- Markdown: KaTeX, Mermaid, DOMPurify
- Terminal: xterm.js
- AI CLI: Claude Code, OpenCode

## Design Principles

- **The document is the finished artifact; AI chat is scratch space.**
- **Generated artifacts must return to local files and the main editor, not stay buried in chat.**
- **Reuse the user's local CLI and skill ecosystem instead of locking model accounts into the app.**
- **Preview, export, and editing should derive from the same Markdown source whenever possible.**
- **Risky operations require explicit confirmation; unsaved work is never silently lost.**

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [AI Workbench Skill OS](./docs/AI_WORKBENCH_SKILL_OS.md)
- [OpenCode Provider PRD](./docs/AI_WORKBENCH_OPENCODE_PRD.md)
- [AI Diff Preview](./docs/AI_DIFF_PREVIEW_SPEC.md)
- [AI Editing and Review](./docs/AI_EDIT_AND_REVIEW_SPEC.md)
- [PDF Export](./docs/PDF_EXPORT_SPEC.md)
- [Mermaid Support](./docs/MERMAID_SPEC.md)

## License

Apache License 2.0
