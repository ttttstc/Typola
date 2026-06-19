export type AgentEvent =
  | { type: 'status'; label: unknown; model?: unknown; sessionId?: unknown; ttftMs?: unknown }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_use'; id: unknown; name: unknown; input: unknown }
  | { type: 'artifact_file'; path: string; content?: string; toolName: string }
  | { type: 'tool_input_delta'; id: unknown; name: unknown; delta: string }
  | { type: 'tool_result'; toolUseId: unknown; content: string; isError: boolean }
  | { type: 'turn_end'; stopReason: unknown }
  | { type: 'usage'; usage: unknown; costUsd: unknown; durationMs: unknown; stopReason: unknown }
  | { type: 'error'; message: string; code?: unknown }
  | { type: 'fabricated_role_marker'; marker: string; messageId: string }
  | { type: 'raw'; line: string };

export type AgentMessage =
  | { id: string; role: 'user'; content: string; createdAt: number }
  | {
      id: string;
      role: 'assistant';
      content: string;
      thinking: string;
      tools: AgentToolCall[];
      usage?: AgentUsageSummary;
      error?: string;
      createdAt: number;
      done?: boolean;
    };

export type AgentToolCall = {
  id: string;
  name: string;
  input?: unknown;
  inputDelta?: string;
  result?: string;
  isError?: boolean;
};

export type AgentUsageSummary = {
  usage: unknown;
  costUsd: unknown;
  durationMs: unknown;
  stopReason: unknown;
};

export type AgentRunState = 'idle' | 'running' | 'stalled' | 'error';

export type AgentStdoutPayload = {
  runId: string;
  conversationId: string;
  sessionUuid: string;
  line: string;
};

export type AgentExitPayload = {
  runId: string;
  conversationId: string;
  sessionUuid: string;
  exitCode?: number | null;
  cancelled: boolean;
  stderrTail: string;
};

export type AgentStallPayload = {
  runId: string;
  conversationId: string;
  sessionUuid: string;
  idleMs: number;
  stderrTail: string;
};
