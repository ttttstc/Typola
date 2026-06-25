# AI Workbench OpenCode Provider PRD

## Problem Statement

Typola 当前 AI Workbench 只支持 Claude Code CLI。用户已经在左侧工作台、Composer、AI 工作区、Artifact Return 等流程里形成了稳定心智，但如果想使用 OpenCode，就必须离开 Typola 或走独立终端，导致 AI 工作台不再是统一的文档协作入口。

目标不是新增一个 OpenCode 专用工作台，而是在同一个 AI Workbench 中增加 OpenCode 这个 AI Provider，让用户可以在 Claude Code 和 OpenCode 之间切换，同时保留当前文档中心、左侧草稿区、产物回流和设置页 AI CLI 配置体验。

## Solution

AI Workbench 增加 AI Provider 抽象。Claude Code 保持现有能力，OpenCode 作为第二个 Provider 接入，同样通过 Rust 启动 CLI、前端解析 stdout、统一映射到 AI Workbench 消息流。

用户在 AI Workbench Composer 底部选择当前 Provider。切换 Provider 时，Typola 提示会开启新对话，并创建新的 Provider-bound Conversation。Settings 的 AI CLI 分区增加 OpenCode CLI 路径和 OpenCode 模型配置；路径和模型都允许留空，留空时使用 OpenCode CLI 自身默认值。

OpenCode 第一版使用 `opencode run`，不使用 `opencode serve`。第一版验收重点是稳定对话闭环、完成状态、错误诊断、取消和 Artifact Return；thinking 与 tool-card 事件等到 OpenCode JSON 输出协议被验证后再映射。

## User Stories

1. As a Typola 用户, I want 在同一个 AI Workbench 中选择 Claude Code 或 OpenCode, so that 我不需要离开文档编辑上下文。
2. As a Typola 用户, I want Provider 切换控件出现在 Composer 底部, so that 我发送 prompt 前能确认当前会话使用哪个 CLI。
3. As a Typola 用户, I want 切换 Provider 时开启新对话, so that 我不会误以为 Claude Code 和 OpenCode 共享同一段 CLI 上下文。
4. As a Typola 用户, I want 旧 Provider 的对话不被悄悄串到新 Provider, so that 历史消息和实际 CLI session 保持一致。
5. As a Typola 用户, I want 在 Settings 的 AI CLI 分区配置 OpenCode 路径, so that 我可以使用系统 PATH 中的 `opencode` 或自定义安装路径。
6. As a Typola 用户, I want OpenCode 路径留空时自动使用默认命令, so that 普通安装不需要额外配置。
7. As a Typola 用户, I want 在 Settings 中配置 OpenCode 模型字符串, so that 我可以固定 OpenCode 使用的 provider/model。
8. As a Typola 用户, I want OpenCode 模型留空时交给 CLI 默认值, so that 我不需要理解所有模型配置才能开始使用。
9. As a Typola 用户, I want 检测 OpenCode CLI 是否可用, so that 配置错误时能在设置页提前发现。
10. As a Windows 用户, I want Typola 优先解析 npm CLI 的 `.cmd` 或 `.exe` 包装器, so that PowerShell execution policy 不会因为 `.ps1` 包装器阻断 OpenCode。
11. As a Typola 用户, I want OpenCode 对话像 Claude Code 一样显示 assistant 正文, so that 我能在左侧工作台完成基础协作。
12. As a Typola 用户, I want OpenCode 运行结束后看到完成状态, so that 我知道本轮响应已经结束。
13. As a Typola 用户, I want OpenCode 报错时看到可理解的错误信息, so that 我能区分未安装、路径错误、模型错误和 CLI 运行失败。
14. As a Typola 用户, I want 能取消正在运行的 OpenCode 会话, so that 长任务或误发 prompt 不会卡住工作台。
15. As a Typola 用户, I want OpenCode 生成的本地文件也通过右下角 chips 回流, so that 不同 Provider 的产物处理方式一致。
16. As a Typola 用户, I want 点击 OpenCode 生成的产物 chip 后仍在中间编辑器打开, so that AI 产物是文档工作流的一部分，而不是聊天附件。
17. As a Typola 用户, I want OpenCode 使用当前 AI 工作区作为运行上下文, so that 它能围绕我选择的项目目录工作。
18. As a Typola 用户, I want OpenCode 产物默认写入 `.typola-output/<conversation>/`, so that 临时生成文件不会污染工作区根目录。
19. As a Typola 用户, I want 当前文档和附件 chips 继续作为 prompt-only context 发送给 OpenCode, so that 切换 Provider 不改变我组织上下文的方式。
20. As a Typola 用户, I want Claude Code 的 plugin directory / `.mcp.json` 等既有能力不被 OpenCode 改造破坏, so that 已有 Claude 工作流保持稳定。
21. As a Typola 用户, I want OpenCode 第一版即使没有 thinking/tool-card 也能稳定使用, so that 功能可以先落地而不是等待协议完全追平 Claude。
22. As a 维护者, I want AI Provider 抽象集中表达 Provider 差异, so that 新增 OpenCode 不会把 Claude 专有逻辑继续散落到 UI、hook 和 Rust 命令里。
23. As a 维护者, I want Provider parser 只映射已验证的 OpenCode JSON 事件, so that 未知协议变化不会破坏消息流。
24. As a 维护者, I want 保留 `opencode serve` 的后续可能性, so that 如果 CLI 模式不足，未来可以有计划地升级，而不是现在扩大范围。

## Implementation Decisions

- OpenCode 是 AI Provider，不是独立 AI Workbench。
- AI Workbench 的当前会话绑定 Provider；切换 Provider 时开启新会话，不跨 Provider resume。
- Provider 切换控件放在 Composer 底部；Settings 不作为主要切换入口。
- Settings 的 AI CLI 分区增加 OpenCode CLI 路径和 OpenCode 模型字段，形态与 Claude Code 保持一致。
- OpenCode 第一版使用 `opencode run`，不接 `opencode serve`。
- Rust headless 层需要从 Claude 专线演进为 Provider-aware：按 Provider 选择默认命令、版本检测命令、参数构造、运行目录和取消逻辑。
- Windows 裸命令解析需要支持 `opencode`，并优先选择 `.cmd` / `.exe`，避免落到 `.ps1`。
- 前端会话层需要从固定 Claude parser 演进为按 Provider 选择 parser。
- OpenCode parser 第一版只承诺稳定正文、完成、错误和原始事件兜底；thinking/tool-card 只映射经验证的 JSON 事件。
- Artifact Return 是 Provider-neutral 行为。OpenCode 也从 `.typola-output/<conversation>/` 运行，生成文件继续通过 watcher 和 chips 回流。
- Claude Code 专有能力不能被 OpenCode 抽象稀释：plugin directory、`.mcp.json` 和 Claude stream-json 完整 tool/thinking 渲染继续保留。
- OpenCode 读写 AI 工作区的权限参数只使用官方 CLI 已验证的参数；不能猜测 Claude `--add-dir` 的等价物。

## Testing Decisions

测试尽量从最高行为入口切入，验证用户能观察到的结果，而不是绑定内部实现细节。优先复用现有 AI Workbench、settings service、headless 参数构造和 parser 单测形态。

- 设置测试：验证 OpenCode 路径和模型可以保存、读取、留空默认，并且不会影响既有 Claude Code 配置。
- Rust 参数构造测试：验证 Claude Code 既有 argv 不变，OpenCode 使用 `opencode run` 形态，并正确处理模型、cwd/session 参数和 Windows 默认命令解析。
- Provider 切换测试：验证切换 Provider 会开启新的 Provider-bound Conversation，不复用旧 Provider session。
- Parser 测试：用 OpenCode JSON 样例验证正文、完成、错误和未知事件兜底；未知事件不应导致 UI 崩溃。
- Artifact Return 测试：验证 OpenCode 运行目录仍落在 `.typola-output/<conversation>/`，文件变化能进入现有产物 chips 流程。
- 回归测试：验证 Claude Code 的 stream-json parser、diagnostics、plugin directory 和 Artifact Return 仍按原有行为工作。

## Out of Scope

- 不新增独立 OpenCode 工作台或独立左侧面板。
- 不接 `opencode serve`、本地 HTTP server、SSE 或后台 server 生命周期管理。
- 不做模型列表查询、Provider marketplace 或复杂模型管理。
- 不要求 OpenCode 第一版完整渲染 thinking 卡、tool-card、usage 成本等 Claude 等价能力。
- 不改造终端面板，不把 OpenCode 作为终端内交互流程接入。
- 不恢复多标签工作区、全局搜索、法律行业专项或旧 Electron/Milkdown 实现。

## Further Notes

本 PRD 对应 ADR：[0001-ai-workbench-opencode-cli-provider](./adr/0001-ai-workbench-opencode-cli-provider.md)。

OpenCode CLI 能力以官方文档为准。第一版实现前需要用真实 `opencode run --format json` 输出样例确认 parser 输入形态；在 Windows 上还需要验证 npm 安装后的 `opencode.cmd` 路径解析。
