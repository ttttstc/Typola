import { detectAgent, type AgentDetectResult } from '../../agentService';
import type { AgentDiagnostic, AgentDiagnosticFix } from './types';
import type { AgentRuntimeId } from './types';

export async function detectAgentRuntime(runtimeId: AgentRuntimeId, customPath?: string): Promise<AgentDetectResult> {
  const result = await detectAgent(customPath, runtimeId);
  return {
    ...result,
    diagnostics: normalizeAgentDiagnostics(result.diagnostics),
  };
}

export function normalizeAgentDiagnostics(input: unknown): AgentDiagnostic[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item): AgentDiagnostic | null => {
      if (!item || typeof item !== 'object') return null;
      const value = item as Record<string, unknown>;
      const level = value.level === 'ok' || value.level === 'warning' || value.level === 'error'
        ? value.level
        : 'error';
      const title = typeof value.title === 'string' && value.title.trim()
        ? value.title.trim()
        : 'Agent CLI 检测结果';
      const detail = typeof value.detail === 'string' ? value.detail.trim() : '';
      return {
        code: typeof value.code === 'string' ? value.code : 'unknown',
        level,
        title,
        detail,
        fix: normalizeFix(value.fix),
      };
    })
    .filter((item): item is AgentDiagnostic => item !== null);
}

function normalizeFix(input: unknown): AgentDiagnosticFix | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  if (typeof value.label !== 'string' || typeof value.action !== 'string') return null;
  const allowed = ['choose_file', 'copy_command', 'open_settings', 'open_doc', 'rescan', 'none'];
  return {
    label: value.label,
    action: allowed.includes(value.action) ? value.action as AgentDiagnosticFix['action'] : 'none',
    payload: typeof value.payload === 'string' ? value.payload : undefined,
  };
}
