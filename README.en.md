# Typola

> [中文](./README.md) · English

**Typola is a local Markdown document workbench for the AI era.**

It is not a Markdown editor with a chat box bolted on. Typola keeps the document at the center and turns AI into a drafting, reviewing, and artifact-producing workflow around it. Conversations are scratch space; generated work returns to local files and the main editor.

Typola is local-first by default. The desktop app is powered by Tauri, and AI features reuse CLI tools you already run locally, such as Claude Code and OpenCode. Typola does not ask you to paste API keys into the app, and it does not take over your model account, permissions, or quota.

## Why Typola

| Task | Typical workflow | Typola workflow |
| --- | --- | --- |
| Rewrite a paragraph | Copy into a web AI, wait, copy back, replace manually | Select text, choose a floating-bar action, review the diff, accept replacement |
| Draft a new document | Chat for a long time, then manually save the answer as a file | Enter Flow mode, pick a report / slide / HTML scenario, and let the artifact land in `.typola-output` |
| Review a document | Use Word comments or free-form notes, then merge manually | Add review comments by selection, manage them in one panel, export review.md or ask AI to revise |
| Manage AI output | Scroll through chat history to find the final answer | Use the Artifact Center to open, diff, archive, delete, overwrite, or undo generated files |
| Use local agents | Open a terminal outside your writing context | Switch Claude Code / OpenCode inside the AI Workbench and keep the document visible |

## Core Features

### Three document modes

- **Reading mode** — the default writing and reading environment. File tree, outline, Word preview, HTML preview, and WeChat-style preview stay out of the way until needed.
- **Flow mode** — AI Workbench on the left, SkillHub and artifacts on the right. It is designed for summarizing, rewriting, generating reports, creating HTML pages, and producing slide-related artifacts from your current document or workspace.
- **Review mode** — a document review workflow. Select text, add comments, manage them in the right panel, export a review.md snapshot, or ask AI to produce a revised draft from all comments.

### AI Workbench

- Supports **Claude Code** and **OpenCode** providers, switchable from the composer footer.
- Settings provide lightweight CLI detection: path, version, timestamp, and diagnostics, without running model requests.
- Claude uses a headless stream-json pipeline; OpenCode uses `opencode run`. Both feed the same message renderer for text, thinking, tool calls, and artifact return.
- Runtime conversations use a pill menu for switch / create / close / rename, separate from editor file tabs.
- Supports `<question-form>` cards: when AI needs missing information, Typola renders a native form card; the submitted answers continue as a normal next-turn message.
- Supports current-document and attachment context chips; visible context files are passed to the CLI when sending.
- Tool calls are folded by default, so file reads, searches, and shell commands do not flood the conversation.

### SkillHub and Artifact Center

- SkillHub ships with curated scenario templates, such as report generation, PPT creation, and HTML creation.
- Claude scenarios read skills from `~/.claude/skills/`; OpenCode scenarios read global or project command definitions.
- Missing recommended skills are shown disabled with installation guidance. Users can also add installed local skills to a scenario.
- AI-generated files are written under the active AI workspace: `.typola-output/<conversation>/`.
- The Artifact Center scans the current session or the whole output directory, and supports open, diff, archive, delete, overwrite original, and undo overwrite.
- AI revision outputs are also normalized into the artifact list instead of being trapped in the chat log.

### Selection AI and undoable edits

- Select text to open a floating action bar: polish, rewrite, shorten, expand, proofread, explain terms, custom request, and add review comment.
- AI results appear as diff cards and can be accepted or ignored.
- Typola snapshots the editor before AI replacements. `Ctrl/Cmd+Z` can distinguish manual edits from AI edits and roll them back step by step.
- Anchor validation ensures replacement still targets the original selection; if the source text changed, Typola asks you to relocate manually.

### Markdown editing and reading

- Default editor: **CodeMirror 6 live preview**, with task lists, tables, images, KaTeX math, and Mermaid diagrams.
- Vditor WYSIWYG remains available as a transitional fallback via local `typola.editorEngine=vditor`.
- Source mode, find/replace, quick open, editing helpers, document statistics, scroll sync, and outline navigation are built in.
- Images support local relative paths, pasted clipboard images saved into `assets/`, remote image preview, and export consistency.
- Mermaid and KaTeX render consistently across reading, preview, and export paths.

### Export and delivery

- **PDF export** runs in the background and reports success or failure through toast notifications.
- **Word export** includes A4 paper preview and `.docx` output.
- **HTML / WeChat preview** supports rich HTML copy, full HTML export, and WeChat-style article preview.
- **Review export** writes review comments into a Markdown snapshot for collaborators or AI follow-up.
- `.docx` files can be opened as read-only previews.

### Desktop experience

- Native Tauri desktop app for Windows and macOS packaging.
- File associations, drag-and-drop open, single-instance forwarding, and auto-update support.
- Workspace file tree, multi-file tabs, and a Save / Discard / Cancel prompt for unsaved changes.
- Integrated bottom terminal with multiple tabs; new terminals start from the selected workspace or current file directory.
- Auto-save exists as a setting, but is off by default.

## Installation

### Windows installer

Download one of the following from GitHub Releases:

- `Typola_*_x64-setup.exe`
- `Typola_*_x64_en-US.msi`

Use the installer if you want file associations and auto-update support.

### Windows portable

Download `Typola_*_windows-x64_portable.zip`, extract it, and run `Typola.exe`. This does not install into `Program Files` and is useful for quick testing or portable use.

> Typola requires Microsoft Edge WebView2 Runtime on Windows. Modern Windows installations usually include it.

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
- Optional on Windows: WebView2 Runtime, WiX / NSIS packaging tools

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
npm run tauri:build:local      # local installers: msi + nsis
npm run tauri:build:portable   # local portable zip
npm run tauri:build:update     # release build with updater artifacts
```

Outputs:

- Windows executable: `src-tauri/target/release/typola.exe`
- Windows installers: `src-tauri/target/release/bundle/{msi,nsis}/`
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
