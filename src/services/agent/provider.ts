export type AgentProvider = 'claude' | 'opencode';

export const DEFAULT_AGENT_PROVIDER: AgentProvider = 'claude';

export type AgentProviderConfig = {
  id: AgentProvider;
  label: string;
  defaultCommand: string;
};

export const AGENT_PROVIDERS: AgentProviderConfig[] = [
  { id: 'claude', label: 'Claude Code', defaultCommand: 'claude' },
  { id: 'opencode', label: 'OpenCode', defaultCommand: 'opencode' },
];

export function getAgentProviderConfig(provider: AgentProvider): AgentProviderConfig {
  return AGENT_PROVIDERS.find((candidate) => candidate.id === provider) ?? AGENT_PROVIDERS[0];
}

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'opencode';
}

export function normalizeAgentProvider(value: unknown): AgentProvider {
  return isAgentProvider(value) ? value : DEFAULT_AGENT_PROVIDER;
}
