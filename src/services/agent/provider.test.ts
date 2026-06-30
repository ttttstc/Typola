import { describe, expect, it } from 'vitest';
import { AGENT_PROVIDERS, isAgentProvider, normalizeAgentProvider } from './provider';

describe('agent providers', () => {
  it('keeps detection-only runtimes out of sendable providers', () => {
    expect(AGENT_PROVIDERS.map((provider) => provider.id)).toEqual(['claude', 'opencode']);
    expect(isAgentProvider('codex')).toBe(false);
    expect(normalizeAgentProvider('codex')).toBe('claude');
  });
});
