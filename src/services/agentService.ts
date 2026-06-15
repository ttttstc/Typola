import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type AgentDetectResult = {
  available: boolean;
  path: string;
  version?: string;
  error?: string;
};

export type AgentRunCreateResult = {
  runId: string;
  sessionId: string;
  resumed: boolean;
  cwd: string;
};

export type AgentEventPayload = {
  runId: string;
  eventType: 'status' | 'text_delta' | 'thinking_delta' | 'tool_delta' | 'stdout' | 'stderr' | 'exit' | 'error';
  text?: string;
  status?: string;
  code?: number;
  signal?: string;
  message?: string;
  sessionId?: string;
};

export type CreateAgentRunInput = {
  agentPath?: string;
  conversationId: string;
  cwd?: string;
  prompt: string;
  stablePromptHash: string;
};

export function detectAgent(agentPath?: string): Promise<AgentDetectResult> {
  return invoke<AgentDetectResult>('agent_detect', {
    request: { agentPath: agentPath?.trim() || undefined },
  });
}

export function createAgentRun(input: CreateAgentRunInput): Promise<AgentRunCreateResult> {
  return invoke<AgentRunCreateResult>('agent_run_create', {
    request: {
      agentPath: input.agentPath?.trim() || undefined,
      conversationId: input.conversationId,
      cwd: input.cwd?.trim() || undefined,
      prompt: input.prompt,
      stablePromptHash: input.stablePromptHash,
    },
  });
}

export function stopAgentRun(runId: string): Promise<void> {
  return invoke('agent_run_stop', { runId });
}

export function clearAgentSession(conversationId: string, agentId = 'claude'): Promise<void> {
  return invoke('agent_session_clear', {
    request: { conversationId, agentId },
  });
}

export function onAgentEvent(handler: (payload: AgentEventPayload) => void): Promise<UnlistenFn> {
  return listen<AgentEventPayload>('agent_event', (event) => handler(event.payload));
}

export function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}
