import { describe, expect, it } from 'vitest';
import { getAgentRuntimeDef, listAgentRuntimeDefs, normalizeAgentRuntimeId } from './registry';
import { normalizeAgentDiagnostics } from './detection';

describe('agent runtime detection config', () => {
  it('lists Typola-supported CLI runtimes', () => {
    const runtimes = listAgentRuntimeDefs();

    expect(runtimes.map((runtime) => runtime.id)).toEqual(['claude', 'opencode', 'codex']);
    expect(runtimes.map((runtime) => runtime.defaultCommand)).toEqual(['claude', 'opencode', 'codex']);
    expect(runtimes.every((runtime) => runtime.versionArgs.length > 0)).toBe(true);
    expect(getAgentRuntimeDef('codex').detectionOnly).toBe(true);
  });

  it('normalizes unknown runtime ids to Claude', () => {
    expect(normalizeAgentRuntimeId('opencode')).toBe('opencode');
    expect(normalizeAgentRuntimeId('unknown')).toBe('claude');
    expect(getAgentRuntimeDef('claude').label).toBe('Claude Code');
  });

  it('normalizes structured diagnostics from the Rust detector', () => {
    expect(normalizeAgentDiagnostics([
      {
        code: 'windows_path_issue',
        level: 'warning',
        title: 'Windows PATH 不一致',
        detail: '填写 .cmd 完整路径',
        fix: { label: '重新检测', action: 'rescan' },
      },
      { code: 'bad', level: 'invalid', title: '', detail: 42 },
      null,
    ])).toEqual([
      {
        code: 'windows_path_issue',
        level: 'warning',
        title: 'Windows PATH 不一致',
        detail: '填写 .cmd 完整路径',
        fix: { label: '重新检测', action: 'rescan', payload: undefined },
      },
      {
        code: 'bad',
        level: 'error',
        title: 'Agent CLI 检测结果',
        detail: '',
        fix: null,
      },
    ]);
  });
});
