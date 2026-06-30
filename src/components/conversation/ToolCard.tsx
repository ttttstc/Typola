import type { AgentMessage, AgentToolCall } from '../../services/agent/types';
import { ToolCardDispatcher } from './toolCards/dispatcher';

type Props = {
  tool: AgentToolCall;
  message: Extract<AgentMessage, { role: 'assistant' }>;
};

// 薄包装:把 Typola 的 AgentToolCall (result:string) 适配成 OpenDesign
// 派发器期望的 { content, isError } 形状,并推算 running / succeeded 状态。
// running = 父消息未结束 且 本工具无 result
// succeeded = 父消息结束 且 本工具没失败
export function ToolCard({ tool, message }: Props) {
  const runStreaming = !message.done && !tool.result;
  const runSucceeded = !!message.done && !tool.isError;
  const result =
    tool.result !== undefined
      ? { content: tool.result, isError: !!tool.isError }
      : undefined;
  return (
    <ToolCardDispatcher
      name={tool.name}
      input={tool.input ?? tool.inputDelta}
      result={result}
      runStreaming={runStreaming}
      runSucceeded={runSucceeded}
    />
  );
}
