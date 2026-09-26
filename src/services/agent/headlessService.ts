import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentExitPayload, AgentStdoutPayload } from './types';
import type { AgentProvider } from './provider';

export type AgentSessionStartRequest = {
  provider?: AgentProvider;
  conversationId: string;
  sessionUuid?: string;
  prompt: string;
  cwd?: string;
  agentPath?: string;
  model?: string;
  pluginDirs?: string[];
  extraAllowedDirs?: string[];
  promptContextPaths?: string[];
  commandName?: string;
};

export type AgentSessionStartResult = {
  runId: string;
  conversationId: string;
  sessionUuid: string;
  resumed: boolean;
  agentPath: string;
  provider: AgentProvider;
};

export function startAgentSession(request: AgentSessionStartRequest): Promise<AgentSessionStartResult> {
  return invoke<AgentSessionStartResult>('agent_session_start', { request });
}

export function resumeAgentSession(request: AgentSessionStartRequest): Promise<AgentSessionStartResult> {
  return invoke<AgentSessionStartResult>('agent_session_resume', { request });
}

export function cancelAgentSession(runId: string): Promise<void> {
  return invoke('agent_session_cancel', { request: { runId } });
}

export function onAgentStdout(handler: (payload: AgentStdoutPayload) => void): Promise<UnlistenFn> {
  // Rust 侧按 16ms/64 行批量 emit(同一事件名),这里拆回逐行回调,消费者无感
  type BatchPayload = AgentStdoutPayload & { lines?: string[] };
  return listen<BatchPayload>('agent-stdout', (event) => {
    const payload = event.payload;
    if (Array.isArray(payload.lines) && payload.lines.length > 0) {
      const { lines: _lines, ...single } = payload;
      for (const line of payload.lines) {
        handler({ ...single, line });
      }
      return;
    }
    handler(payload);
  });
}

export function onAgentExit(handler: (payload: AgentExitPayload) => void): Promise<UnlistenFn> {
  return listen<AgentExitPayload>('agent-exit', (event) => handler(event.payload));
}
