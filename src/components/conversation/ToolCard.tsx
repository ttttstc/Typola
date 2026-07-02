import type { AgentMessage, AgentToolCall } from '../../services/agent/types';
import type { SubmittedToolResultStatus } from '../../services/agent/conversationStore';
import { ToolCardDispatcher } from './toolCards/dispatcher';

type Props = {
  tool: AgentToolCall;
  message: Extract<AgentMessage, { role: 'assistant' }>;
  submittedText?: string;
  onSubmitQuestionForm?: (text: string) => void;
  // Claude AskUserQuestion tool_use 同轮 tool_result 通道:toolUseId 是 Anthropic tool_use.id,
  // 把答案作为 JSONL `tool_result` 写回原进程 stdin。useConversationManager.submitAskUserQuestionAnswer
  // 负责根据 inputMode 决定 stream-json 还是 text fallback。
  onSubmitAskUserQuestionToolResult?: (toolUseId: string, text: string) => void;
  // stream-json 提交状态:驱动卡片显示"提交中/已提交/失败重试"。
  submitStatus?: SubmittedToolResultStatus;
  submitError?: string;
};

// 薄包装:把 Typola 的 AgentToolCall (result:string) 适配成 OpenDesign
// 派发器期望的 { content, isError } 形状,并推算 running / succeeded 状态。
// running = 父消息未结束 且 本工具无 result
// succeeded = 父消息结束 且 本工具没失败
export function ToolCard({
  tool,
  message,
  submittedText,
  onSubmitQuestionForm,
  onSubmitAskUserQuestionToolResult,
  submitStatus,
  submitError,
}: Props) {
  const runStreaming = !message.done && !tool.result;
  const runSucceeded = !!message.done && !tool.isError;
  const result =
    tool.result !== undefined
      ? { content: tool.result, isError: !!tool.isError }
      : undefined;
  return (
    <ToolCardDispatcher
      id={tool.id}
      name={tool.name}
      input={tool.input ?? tool.inputDelta}
      result={result}
      runStreaming={runStreaming}
      runSucceeded={runSucceeded}
      submittedText={submittedText}
      onSubmitQuestionForm={onSubmitQuestionForm}
      onSubmitAskUserQuestionToolResult={onSubmitAskUserQuestionToolResult}
      submitStatus={submitStatus}
      submitError={submitError}
    />
  );
}
