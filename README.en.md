# Typola

> [中文](./README.md) · English

**Typola is a local Markdown workbench built for writers in the AI era.**

Not "AI writes for you" — your document is the artifact, produced by your own AI pipeline. Select text to invoke AI inline; artifacts land directly back in the editor; AI edits can be undone with one keystroke. The same document runs in three modes — Reading / Flow / Review — with side panels gliding to match the task. Every AI call goes through your locally installed `claude` CLI: no API key inside Typola, no uploads, cross-platform, offline-first.

## How Typola is different

| What you want to do | With other tools | With Typola |
|---|---|---|
| Have AI rewrite a paragraph | Switch to ChatGPT / Claude Desktop → paste paragraph → type prompt → copy result → switch back → paste over | Select → click "Polish" on the floating bar → click "Accept replacement". You never leave the editor. |
| Have AI draft a whole document | Long chat in a web AI → copy-paste into your editor | Flow mode → pick a scenario template (daily report / slide deck / HTML / WeChat article) → AI writes the file straight into your workspace |
| Review a document | Word comments → send to colleague → wait → merge changes yourself | Review mode → select a paragraph, add a comment → "Export review version" for the reviewer, or "Send to AI" to apply every comment in one revision |
| Undo an AI change | `Ctrl+Z` N times — and accidentally undo your own edits too | `Ctrl+Z` is smart: it pops your manual edits first, then the AI snapshot — they never collide |
| Give AI your writing voice | Paste a system prompt every time | Skills under `~/.claude/skills/` plug straight into Typola's scenario cards — Claude Code users adapt at zero cost |

## AI co-authoring

### Document modes: Reading / Flow / Review

A recessed segmented control sits at the top-right of the toolbar. One click switches modes; the left and right panels glide in and out:

- **Reading mode** — the default. Focused reading and writing; toggle the file tree and Word/WeChat previews as needed.
- **Flow mode** — left panel opens the AI Workbench chat; right panel surfaces skill scenarios (daily/weekly report, summary, slide deck, HTML, WeChat article, data analysis); the window auto-maximizes. AI artifacts (HTML / Markdown / decks) land in `<workspace>/.typola-output/<conversation>/` and appear as chips in the right panel — open in the main editor, archive to the workspace, or delete with one click.
- **Review mode** — treats the document as a draft for review. The right panel shows a Review pane. Select a paragraph, add a comment via the floating bar, jump back from the summary list; "Export review version" writes an in-paragraph-suffix Markdown copy (each commented segment followed by `> **Review comment, please address**: …`) for collaborators, or "Send to AI" packages the full document plus all comments into a single prompt for a revised draft.

### Selection floating bar: act on selection, close the loop in place

When you select text, a floating bar appears above the selection:

- **Polish / Shorten / Expand / Proofread / Explain** — a silent Claude call returns a diff card ("original vs new") pinned next to the selection; click "Accept replacement" to apply, **without leaving the editor**. Polish also accepts pre-call instructions (e.g. "more casual", "tighter"); other actions use the default template.
- **Custom** — drops the selection as a quote into the AI Workbench composer for free-form requests.
- **Add review comment** — opens an inline editor and saves the comment into the Review pane.

The floating bar can be disabled at Settings → Editor → Selection floating bar. The right-click menu and `Ctrl+K` still reach the same actions.

### AI edits are undoable

Every AI replacement snapshots the editor content first. `Ctrl+Z` is smart:

- Document untouched after the AI edit → revert the AI change directly
- Hand-edited after the AI edit → native undo cleans up your hand edits first; the next `Ctrl+Z` pops the AI snapshot

Stepwise rollback, cleared automatically on file switch, capped at 50 AI snapshots, never pollutes ordinary editing history.

### Claude CLI + skills ecosystem

The AI Workbench drives your locally installed `claude` CLI (headless mode), and skill scenarios reference skills under `~/.claude/skills/`. **No API key configuration inside Typola** — every call inherits your own CLI environment, model, permissions, and quota. If you already run Claude Code, Typola plugs in at zero cost.

## Markdown editing and delivery

- WYSIWYG Markdown editing (Vditor IR mode) + source mode (CodeMirror 6), switchable
- Files: `.md` / `.markdown` / `.html` / `.htm`, plus read-only `.docx` preview
- Multi-file tabs, left workspace file tree, floating outline (hover / pin as sidebar / click to jump)
- Word paper preview (A4) + `.docx` export
- HTML preview + rich-text copy + full HTML export
- Editor-to-preview scroll sync by ratio (rAF-throttled, no extra render)
- Find/replace (`Cmd/Ctrl+F` / `Cmd/Ctrl+H`, case / whole-word / regex) + quick open (`Cmd/Ctrl+P`)
- Editing utilities: insert links / images / Markdown tables in one click; pasted clipboard images save to a sibling `assets/` and insert as a relative path
- Document statistics (word count / chars / paragraphs / reading time, debounced, never blocks typing)
- Integrated terminal (multi-tab at the bottom, starts in the current file directory)
- Local image resolution (relative paths work consistently in editor, preview, and export)
- Data safety (unsaved close prompts a single Save/Discard/Cancel dialog; external file changes surface in the status bar)
- Native desktop (file associations, drag-and-drop open, single-instance forwarding, auto-update)

## Installation

### Windows installer

Download `Typola_*_x64-setup.exe` or `Typola_*_x64_*.msi` from GitHub Releases and run it. Best for regular use, file associations, and auto-updates.

### Windows portable

Download `Typola_*_windows-x64_portable.zip`, extract, and run `Typola.exe`. Does not install into `Program Files`; useful for temporary testing or portable use.

Windows still needs the Microsoft Edge WebView2 Runtime. Modern Windows installations typically include it.

### macOS

Download the `.dmg` for your chip architecture, open it, and drag `Typola.app` into Applications. Portable zip works extracted. If macOS shows a security prompt on first launch, allow it under Privacy & Security.

## Basic usage

- Open files via the toolbar button or by dragging Markdown / HTML / Word files into the window
- Switch document mode via the segmented control at the top-right (Reading / Flow / Review)
- Selection AI: select text → click an action on the floating bar → accept replacement / drop into composer / add a comment
- Flow mode: switch to Flow → chat in the left panel or pick a scenario in the right panel → AI artifacts land in your workspace
- Review mode: switch to Review → add comments per paragraph → export `review.md` or send to AI
- Undo AI: `Ctrl+Z` (smart about manual vs AI edits)
- Preferences: themes, fonts, encoding, auto-save, selection-bar toggle, export presets

Common shortcuts:

- `Cmd/Ctrl + O` — Open file
- `Cmd/Ctrl + S` — Save
- `Cmd/Ctrl + Shift + S` — Save as
- `Cmd/Ctrl + F` / `H` — Find / Replace
- `Cmd/Ctrl + P` — Quick open
- `Cmd/Ctrl + Shift + I` — Editing utilities
- `Cmd/Ctrl + Alt + S` / `P` / `M` — Toggle source / Word preview / HTML preview
- `Cmd/Ctrl + K` — Open the AI action menu for the current selection
- `Cmd/Ctrl + Z` — Undo (covers AI replacements too)
- `Shift + A` — Toggle Flow mode
- `Cmd/Ctrl + ,` — Open Settings

## Development

Prereqs: Node.js + npm, Rust stable, Tauri prerequisites (Windows / macOS).

```bash
npm install
npm run tauri dev        # desktop dev mode
npm run dev              # frontend-only dev mode
npm test                 # unit tests
npm run typecheck        # TypeScript check
cargo test --manifest-path src-tauri/Cargo.toml
```

## Packaging

```bash
npm run tauri:build:local      # local installer (msi + nsis)
npm run tauri:build:portable   # local portable zip
npm run tauri:build:update     # release build with updater signatures
```

Outputs:

- Windows installer: `src-tauri/target/release/bundle/{msi,nsis}/*`
- Windows portable: `src-tauri/target/release/bundle/portable/*_windows-x64_portable.zip`
- macOS (via CI): `.dmg` and `*_macos-{arm64,x64}_portable.zip`

## Stack

Tauri v2 · React 19 · TypeScript · Vite 8 · Vditor · CodeMirror 6 · xterm.js · portable-pty · Claude CLI (headless)

## License

Apache License 2.0
