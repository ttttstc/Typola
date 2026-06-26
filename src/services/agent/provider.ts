import {
  getAgentRuntimeDef,
  isAgentRuntimeId,
  listAgentRuntimeDefs,
  normalizeAgentRuntimeId,
} from './runtime/registry';
import type { AgentRuntimeId } from './runtime/types';

export type AgentProvider = AgentRuntimeId;

export const DEFAULT_AGENT_PROVIDER: AgentProvider = 'claude';

export type AgentProviderConfig = {
  id: AgentProvider;
  label: string;
  defaultCommand: string;
};

export const AGENT_PROVIDERS: AgentProviderConfig[] = listAgentRuntimeDefs().map((runtime) => ({
  id: runtime.id,
  label: runtime.label,
  defaultCommand: runtime.defaultCommand,
}));

export function getAgentProviderConfig(provider: AgentProvider): AgentProviderConfig {
  const runtime = getAgentRuntimeDef(provider);
  return {
    id: runtime.id,
    label: runtime.label,
    defaultCommand: runtime.defaultCommand,
  };
}

export function isAgentProvider(value: unknown): value is AgentProvider {
  return isAgentRuntimeId(value);
}

export function normalizeAgentProvider(value: unknown): AgentProvider {
  return normalizeAgentRuntimeId(value);
}
