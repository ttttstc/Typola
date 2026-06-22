import { invoke } from '@tauri-apps/api/core';
import type { AgentProvider } from './agent/provider';

export type AgentDetectResult = {
  available: boolean;
  path: string;
  version?: string;
  error?: string;
};

export function detectAgent(agentPath?: string, provider?: AgentProvider): Promise<AgentDetectResult> {
  return invoke<AgentDetectResult>('agent_detect', {
    request: { provider, agentPath: agentPath?.trim() || undefined },
  });
}
