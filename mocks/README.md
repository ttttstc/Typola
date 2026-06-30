# Typola Agent CLI mocks

This folder is the small mock/golden base for issue #112 Phase 3.

The mocks intentionally emit provider **raw stdout JSONL**. Tests should feed
that raw output into Typola parsers and assert the resulting `AgentEvent[]`.
Do not make mocks emit already-parsed Typola events, otherwise parser regressions
will be invisible.

## PATH overlay

For local manual checks, prepend `mocks/bin` to `PATH` before launching Typola:

```powershell
$env:PATH = "$PWD\mocks\bin;$env:PATH"
npm run tauri dev
```

The current Phase 3 scope only needs runtime detection:

- `claude --version`
- `opencode --version`
- `codex --version`

Future parser/execution work can add recorded traces under `mocks/golden/` and
route them through `mocks/mock-agent.mjs`.

## Not in scope yet

- Codex execution provider
- Codex stdout parser
- Sidecar or HTTP daemon mocks
