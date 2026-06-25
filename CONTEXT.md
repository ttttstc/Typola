# Typola

Typola 是一个以本地 Markdown 文档为中心的编辑器，AI 工作台只承担围绕文档的临时草稿与协作工序。

## Language

**AI Workbench**:
左侧 AI 对话工作区，用户在这里让 AI CLI 围绕当前文档或选中的 AI 工作区协助写作、修改和生成产物。
_Avoid_: AI chat, bot panel, separate agent app

**AI Provider**:
AI 工作台用来运行会话的 CLI 后端，例如 Claude Code 或 OpenCode。
_Avoid_: AI type, model, engine

**Provider-bound Conversation**:
绑定到某一个 AI Provider 的 AI 工作台会话；它的 CLI session、解析器和 resume 状态都属于该 Provider。切换 Provider 时开启新对话，而不是延续旧会话。
_Avoid_: shared AI conversation, cross-provider resume

**Artifact Return**:
AI Provider 生成的文件先写入 Typola 临时产物区，再以本地文件 chip 回流到编辑器的流程。
_Avoid_: cloud artifact, chat attachment
