import { invoke } from '@tauri-apps/api/core';

export type AgentDetectResult = {
  available: boolean;
  path: string;
  version?: string;
  error?: string;
};

export function detectAgent(agentPath?: string): Promise<AgentDetectResult> {
  return invoke<AgentDetectResult>('agent_detect', {
    request: { agentPath: agentPath?.trim() || undefined },
  });
}
