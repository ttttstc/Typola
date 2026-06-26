import { invoke } from '@tauri-apps/api/core';
import type { AgentProvider } from './agent/provider';
import { getAgentRuntimeDef } from './agent/runtime/registry';
import type { AgentDiagnostic } from './agent/runtime/diagnostics';

export type AgentDetectResult = {
  runtimeId?: AgentProvider;
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

export function detectAgent(agentPath?: string, provider?: AgentProvider): Promise<AgentDetectResult> {
  const runtime = getAgentRuntimeDef(provider ?? 'claude');
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
