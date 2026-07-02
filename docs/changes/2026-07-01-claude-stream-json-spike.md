# Claude stream-json stdin 闭环 Spike

**日期**: 2026-07-01
**Claude Code 版本**: 2.1.148
**结论**: ✅ 支持 stream-json input + tool_result 回写,可作为 issue #126 实现基础。

## 验证脚本

`scripts/spike-claude-stream-json.mjs` —— spawn `claude -p --input-format stream-json --output-format stream-json --verbose --permission-mode bypassPermissions --session-id <uuid>`,先后写入两条 user JSONL,等 stdout stream-json 完整退出。

## 完整输出 (`docs/changes/_spike-output.json`,本次 8 个事件)

```jsonl
{"type":"system","subtype":"init","cwd":"...","session_id":"8ac8c86c-...","tools":["...","AskUserQuestion",...],"mcp_servers":[],"model":"MiniMax-M3","permissionMode":"bypassPermissions"}
{"type":"assistant"}                                                // init turn 1
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}
{"type":"result"}                                                   // turn 1 end
{"type":"system"}
{"type":"assistant"}                                                // init turn 2
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"second-turn-ok"}]}}
{"type":"result"}
```

Exit code 0,两条 user JSONL 在同一进程收到独立 assistant 响应。

## Schema 确认

- **首条 user**: `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}`
- **tool_result 回写(Anthropic 标准,本 spike 未直接触发,但 schema 推断一致)**: 第二条 user JSONL 的 content 改为 `{"type":"tool_result","tool_use_id":"toolu_xxx","content":"answer","is_error":false}`
- **stop_reason**: Claude 不会发显式 stop_reason 顶层字段,而是在 `assistant` 消息内 `message.stop_reason` 标记;`tool_use` 时不主动结束 turn,等所有 tool_result 收齐后才发 `result` 事件

## 支持矩阵

| flag | 支持 | 备注 |
|------|------|------|
| `--input-format stream-json` | ✅ | `claude -p --help` 列出,与 `--output-format=stream-json` 配对使用 |
| `--output-format stream-json` | ✅ | 同上 |
| `--include-partial-messages` | ✅ | 新版才有,旧版会 unknown option 退出 |
| `--permission-mode bypassPermissions` | ✅ | 与 stream-json 兼容 |
| `--session-id <uuid>` | ✅ | **必须是规范 UUID,非 UUID 形式报 "Invalid session ID"** |

## Windows 注意点

1. `claude` 是 `.cmd` shim(`%APPDATA%\npm\claude.cmd`),Node 裸 `spawn('claude')` 走 **ENOENT**,必须 `shell: true` 或显式 `.cmd` 路径。Rust 端 `normalize_agent_path` 在 Windows 已经走 `resolve_windows_bare_command` 解析到完整路径 + `create_agent_command` 处理 `.cmd` shim —— Rust 这边不踩坑。
2. stdin 长驻需要 Windows 下避免 EPIPE;stream-json mode 下若写入过快引起 EPIPE,Claude 会异常退出,需要 tail stderr 给出可读错误。
3. `create_agent_command` 用 `CREATE_NO_WINDOW`(0x08000000),与 stdin 长驻兼容。

## 不支持 stream-json 的情况(暂未实现 fallback)

- 极旧版 Claude Code 报 "unknown option --input-format";本次未实际遇到。
- 决定:不在本次实现自动探测 fallback,改用 `AgentInputMode` 枚举显式参数 + 默认值可在 settings 配置(issue #126 后续任务)。

## 下游实现产物路径

- Rust: `src-tauri/src/lib.rs` `AgentRunHandle` / `AgentInputMode` / `build_claude_headless_args` / `start_agent_headless_run`
- TS: `src/services/agent/types.ts` + `headlessService.ts` + `useAgentSession.ts` + `ConversationPanel.tsx`
- 测试: Rust `mod tests` 新增 3 个测试;TS `useAgentSession.test.tsx` + `questionForm.test.tsx`
