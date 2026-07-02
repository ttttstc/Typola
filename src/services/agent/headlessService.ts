import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentExitPayload, AgentStdoutPayload } from './types';
import type { AgentProvider } from './provider';

export type AgentSessionStartRequest = {
  provider?: AgentProvider;
  conversationId: string;
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
  inputMode: 'text' | 'streamJson';
};

export type AgentSessionSendInputRequest = {
  runId: string;
  message: string;
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

export function sendAgentSessionInput(request: AgentSessionSendInputRequest): Promise<void> {
  return invoke('agent_session_send_input', { request });
}

export function onAgentStdout(handler: (payload: AgentStdoutPayload) => void): Promise<UnlistenFn> {
  return listen<AgentStdoutPayload>('agent-stdout', (event) => handler(event.payload));
}

export function onAgentExit(handler: (payload: AgentExitPayload) => void): Promise<UnlistenFn> {
  return listen<AgentExitPayload>('agent-exit', (event) => handler(event.payload));
}
