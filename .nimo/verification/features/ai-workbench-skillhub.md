# AI 工作台与 SkillHub

用户可以在 AI 工作台选择本机 Claude Code 或 OpenCode，注入当前文档/附件上下文，使用 SkillHub 场景编排可复用能力，并查看流式响应和完成状态。

## 子功能

- `provider-diagnostics` 检测 Claude/OpenCode 路径、版本和可用性。
- `conversation-context` 选择 Provider、模型、工作目录，注入当前文档和附件。
- `skillhub-scene` 扫描本机 Skill/command，按 Provider 过滤并把场景预填到 Composer。
- `agent-run` 发送、停止、重试请求，读取助手消息、工具卡和退出状态。

## 用户视角入口

- 左栏 `打开 AI 工作台`、`AI 工作台` Composer 和会话 pill。
- `设置 → AI 执行` 的检测卡片和 Provider 配置。
- 心流模式右侧 SkillHub/场景面板、附件入口、工作目录选择器和发送按钮。
- `Ctrl/Cmd+Enter` 发送，`停止` 终止长任务。

## 用 exe-CDP harness 驱动

- 直接 exe 套件可以打开 `aside[aria-label="AI 工作台"]` 并记录 Composer 可见性；这只证明用户面入口可达。
- 完整配方必须在一次性工作目录中使用用户已经配置并认证的 Provider，发送无修改请求和一次产物请求，读取可见消息、CLI 退出状态、工作目录和脱敏日志。
- SkillHub 必须核对当前 Provider 过滤、场景预填内容和发送后的实际命令；不得用 fixture JSON、网络 mock 或测试 setter 冒充本机能力。

## 陷阱

- Codex 检测卡片只证明版本探测，不证明可发送、模型执行或 Skill 产物。
- 工作目录决定 CLI 的 cwd 和产物范围，不能偷偷把文件树目录当作 AI 工作目录。
- Provider 切换会取消当前运行并建立新的 Provider 会话；不能把两个会话的消息混在一起。
- 凭据、完整授权输出和用户文件路径不能进入截图、run.json 或最终报告。

维护信息：相关入口在 `src/components/conversation/ConversationPanel.tsx`、`src/components/conversation/Composer.tsx`、`src/components/SkillHubPanel.tsx`、`src/hooks/useAgentSession.ts` 和 `src/services/agent/skillHub.ts`；最近核对日期为 2026-09-11，真实 exe 已执行工作台入口，Provider/SkillHub/模型请求因外部认证未执行。
