import { detectAgent, type AgentDetectResult } from '../../agentService';
import type { AgentProvider } from '../provider';
import { normalizeAgentDiagnostics } from './diagnostics';

export async function detectAgentRuntime(provider: AgentProvider, customPath?: string): Promise<AgentDetectResult> {
  const result = await detectAgent(customPath, provider);
  return {
    ...result,
    diagnostics: normalizeAgentDiagnostics(result.diagnostics),
  };
}
