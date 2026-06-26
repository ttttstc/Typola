import { describe, expect, it } from 'vitest';
import { AGENT_PROVIDERS, getAgentProviderConfig, normalizeAgentProvider } from '../provider';
import { buildAgentCommandSpec } from './commandSpec';
import { getAgentRuntimeDef, listAgentRuntimeDefs, normalizeAgentRuntimeId } from './registry';
import { checkRuntimePromptBudget } from './promptBudget';

describe('agent runtime registry', () => {
  it('lists only Typola-supported runtimes without duplicate ids', () => {
    const runtimes = listAgentRuntimeDefs();
    expect(runtimes.map((runtime) => runtime.id)).toEqual(['claude', 'opencode']);
    expect(new Set(runtimes.map((runtime) => runtime.id)).size).toBe(runtimes.length);
  });

  it('keeps the legacy provider facade compatible', () => {
    expect(AGENT_PROVIDERS).toEqual([
      { id: 'claude', label: 'Claude Code', defaultCommand: 'claude' },
      { id: 'opencode', label: 'OpenCode', defaultCommand: 'opencode' },
    ]);
    expect(getAgentProviderConfig('opencode')).toEqual({
      id: 'opencode',
      label: 'OpenCode',
      defaultCommand: 'opencode',
    });
    expect(normalizeAgentProvider('unknown')).toBe('claude');
    expect(normalizeAgentRuntimeId('opencode')).toBe('opencode');
  });

  it('builds Claude command specs matching the current Rust headless behavior', () => {
    const spec = buildAgentCommandSpec({
      runtimeId: 'claude',
      prompt: 'hello',
      sessionId: 'session-123',
      model: 'sonnet',
      pluginDirs: ['C:\\plugins'],
      extraAllowedDirs: ['D:\\workspace'],
    });

    expect(spec.command).toBe('claude');
    expect(spec.promptViaStdin).toBe(true);
    expect(spec.promptInputFormat).toBe('text');
    expect(spec.outputFormat).toBe('stream-json');
    expect(spec.args).toEqual([
      '-p',
      '--input-format',
      'text',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
      '--session-id',
      'session-123',
      '--model',
      'sonnet',
      '--plugin-dir',
      'C:\\plugins',
      '--add-dir',
      'D:\\workspace',
    ]);
  });

  it('builds OpenCode command specs without changing the current argv prompt behavior', () => {
    const spec = buildAgentCommandSpec({
      runtimeId: 'opencode',
      prompt: 'hello',
      resumed: true,
      cwd: 'D:\\output',
      extraAllowedDirs: ['D:\\workspace'],
      model: 'anthropic/claude-sonnet-4-5',
      commandName: '/write-report',
      promptContextPaths: ['D:\\workspace\\a.md'],
    });

    expect(spec.command).toBe('opencode');
    expect(spec.promptViaStdin).toBe(false);
    expect(spec.outputFormat).toBe('json');
    expect(spec.args).toEqual([
      'run',
      '--format',
      'json',
      '--dangerously-skip-permissions',
      '--continue',
      '--dir',
      'D:\\workspace',
      '--model',
      'anthropic/claude-sonnet-4-5',
      '--command',
      'write-report',
      'hello',
      '--file',
      'D:\\workspace\\a.md',
    ]);
  });

  it('warns only for argv-bound runtimes that exceed the prompt budget', () => {
    const claude = getAgentRuntimeDef('claude');
    const claudeSpec = buildAgentCommandSpec({ runtimeId: 'claude', prompt: 'x'.repeat(50_000) });
    expect(checkRuntimePromptBudget(claude, claudeSpec)).toBeNull();

    const opencode = getAgentRuntimeDef('opencode');
    const opencodeSpec = buildAgentCommandSpec({ runtimeId: 'opencode', prompt: 'x'.repeat(30_000) });
    expect(checkRuntimePromptBudget(opencode, opencodeSpec)?.code).toBe('AGENT_PROMPT_TOO_LARGE');
  });
});
