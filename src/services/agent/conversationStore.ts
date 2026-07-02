import type { AgentMessage, AgentRunState, SelectionAnchor } from './types';
import type { AgentProvider } from './provider';
import { DEFAULT_AGENT_PROVIDER } from './provider';

export type PendingInjection = {
  text: string;
  anchor: SelectionAnchor;
  queuedAt: number;
};

// stream-json AskUserQuestion 提交状态机:
// - submitting:点击提交后立即置位,卡片禁用按钮防双击
// - submitted:JSONL tool_result 已写入 stdin,卡片显示已提交
// - error:write 失败,卡片显示错误+重新提交入口,runState 保持 waitingForUser
export type SubmittedToolResultStatus = 'submitting' | 'submitted' | 'error';

export type SubmittedToolResult = {
  status: SubmittedToolResultStatus;
  text?: string;
  error?: string;
};

export type ConversationData = {
  id: string;
  title: string;
  provider: AgentProvider;
  skillRef?: string;
  messages: AgentMessage[];
  runState: AgentRunState;
  lastError: string;
  sessionStarted: boolean; // 首轮后置 true → send 改走 resume；session UUID 不在前端存，由 Rust 按 conversationId 维护(registry)
  runId?: string;
  // 当前 run 是否支持 stream-json 同轮 tool_result 写回:Rust 启动 Claude 默认 stream-json,
  // OpenCode 走 text。AskUserQuestion 提交时分流(stream-json → stdin tool_result;text → 新一轮 resume)。
  inputMode?: 'text' | 'streamJson';
  cancelRequested?: boolean;
  pendingInjection?: PendingInjection;
  // 最近一次投递到 Composer 的选区 anchor。send() 把它附到新 user 消息上,便于后续「替换选区」按钮锚定。
  // 投递后清空，避免干扰后续普通消息。
  lastDeliveredAnchor?: SelectionAnchor;
  // 本会话是否已经把"当前文档"文件路径作为 context 注入过 prompt：首轮注入后置 true,
  // 后续 send 不再重复啰嗦同样的"参考以下文件"。chip 仍然展示供用户参考。
  fileContextInjected?: boolean;
  currentFileContextPath?: string;
  // 当前 AI Provider 进程实际运行的模型(从 headless init/status 事件拿到),
  // Composer 优先显示这个,fallback 才用 settings 里的 provider 模型。
  // 跟着中转/CC Switch 走,跟用户终端 claude 看到的一致。
  currentModel?: string;
  // AskUserQuestion 卡片提交状态记录(按 tool_use_id 索引),
  // 覆盖 submitting / submitted / error 三态,跨 render 持久,卡片可据此展示"已提交/提交中/失败重试"。
  submittedToolResults?: Record<string, SubmittedToolResult>;
};

export type ConversationStoreState = {
  conversations: Map<string, ConversationData>;
  activeConvId: string;
};

export function createConversationData(
  id: string,
  title: string,
  skillRef?: string,
  provider: AgentProvider = DEFAULT_AGENT_PROVIDER,
): ConversationData {
  return {
    id,
    title,
    provider,
    skillRef,
    messages: [],
    runState: 'idle',
    lastError: '',
    sessionStarted: false,
  };
}
