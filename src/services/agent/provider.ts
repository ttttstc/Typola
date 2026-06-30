import {
  getAgentRuntimeDef,
  isExecutableAgentRuntimeId,
  listAgentRuntimeDefs,
} from './runtime/registry';
import type { AgentRuntimeDef, AgentRuntimeId } from './runtime/types';

export type AgentProvider = Exclude<AgentRuntimeId, 'codex'>;

export const DEFAULT_AGENT_PROVIDER: AgentProvider = 'claude';

export type AgentProviderConfig = {
  id: AgentProvider;
  label: string;
  defaultCommand: string;
};

function isSendableRuntime(runtime: AgentRuntimeDef): runtime is AgentRuntimeDef & { id: AgentProvider } {
  return !runtime.detectionOnly && isExecutableAgentRuntimeId(runtime.id);
}

export const AGENT_PROVIDERS: AgentProviderConfig[] = listAgentRuntimeDefs()
  .filter(isSendableRuntime)
  .map((runtime) => ({
    id: runtime.id,
    label: runtime.label,
    defaultCommand: runtime.defaultCommand,
  }));

export function getAgentProviderConfig(provider: AgentProvider): AgentProviderConfig {
  const runtime = getAgentRuntimeDef(provider);
  return {
    id: provider,
    label: runtime.label,
    defaultCommand: runtime.defaultCommand,
  };
}

export function isAgentProvider(value: unknown): value is AgentProvider {
  return isExecutableAgentRuntimeId(value);
}

export function normalizeAgentProvider(value: unknown): AgentProvider {
  return isAgentProvider(value) ? value : 'claude';
}
