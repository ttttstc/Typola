import { invoke } from '@tauri-apps/api/core';
import { getAgentRuntimeDef } from './agent/runtime/registry';
import type { AgentRuntimeId } from './agent/runtime/types';
import type { AgentDiagnostic } from './agent/runtime/types';

export type AgentDetectResult = {
  runtimeId?: AgentRuntimeId;
  available: boolean;
  path: string;
  executablePath?: string;
  version?: string;
  authStatus?: 'unknown' | 'ok' | 'missing' | 'expired';
  diagnostics?: AgentDiagnostic[];
  detectedAt?: string;
  error?: string;
  exitCode?: number | null;
  stdoutPreview?: string;
  stderrPreview?: string;
};

export function detectAgent(agentPath?: string, runtimeId?: AgentRuntimeId): Promise<AgentDetectResult> {
  const runtime = getAgentRuntimeDef(runtimeId ?? 'claude');
  return invoke<AgentDetectResult>('agent_detect', {
    request: {
      runtimeId: runtime.id,
      provider: runtime.id,
      customPath: agentPath?.trim() || undefined,
      agentPath: agentPath?.trim() || undefined,
      defaultCommand: runtime.defaultCommand,
      versionArgs: runtime.versionArgs,
    },
  });
}
