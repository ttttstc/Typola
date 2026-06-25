# 将 OpenCode 作为 AI CLI Provider 接入

Typola 的 AI Workbench 以文档为中心，现有 Claude Code 集成已经通过 Rust 启动 headless CLI、前端解析 stdout 的方式跑通。OpenCode 将作为同一个 AI Workbench 内的第二个 AI Provider 接入，第一版使用 `opencode run`，不接 `opencode serve`，以保持和当前 Claude Code CLI 管线一致，并避免提前引入本地 server 生命周期、端口、鉴权和 SSE 管理。

## Considered Options

- `opencode run`：和现有 Claude Code headless CLI 形态一致，适合第一版。
- `opencode serve`：能力更完整，但会引入本地服务管理，暂不作为第一版入口。

## Consequences

AI Workbench 需要围绕 CLI 检测、参数构造、stdout 解析、诊断和设置形成 Provider 抽象。会话绑定 Provider：在 Claude Code 与 OpenCode 之间切换时直接开启新的 AI 对话，不 resume 旧 Provider 的 CLI session。两个 Provider 使用一致的设置形态：可选 CLI 路径和可选模型字符串，留空时交给 CLI 默认值。

当前 Provider 切换控件放在 AI Workbench Composer 底部，靠近模型/状态控制；Settings 只负责配置各 Provider 的路径和模型。OpenCode 第一版只要求稳定对话闭环、完成状态、错误诊断、取消，以及和 Claude Code 一致的 Artifact Return；thinking 和 tool-card 事件只在验证 OpenCode JSON 输出结构后再映射。OpenCode server 集成保留为后续选项。
