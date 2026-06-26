import { describe, expect, it } from 'vitest';
import { normalizeAgentDiagnostics } from './diagnostics';

describe('agent runtime diagnostics', () => {
  it('normalizes structured diagnostics from the Rust detector', () => {
    expect(normalizeAgentDiagnostics([
      {
        code: 'not_found',
        level: 'error',
        title: 'Claude CLI 未找到',
        detail: '请填写完整 claude.cmd 路径。',
        fix: { label: '重新检测', action: 'rescan' },
      },
    ])).toEqual([
      {
        code: 'not_found',
        level: 'error',
        title: 'Claude CLI 未找到',
        detail: '请填写完整 claude.cmd 路径。',
        fix: { label: '重新检测', action: 'rescan', payload: undefined },
      },
    ]);
  });

  it('drops malformed entries and defaults unknown levels to error', () => {
    expect(normalizeAgentDiagnostics([
      null,
      { code: 'x', level: 'surprised', title: '', detail: 1 },
    ])).toEqual([
      {
        code: 'x',
        level: 'error',
        title: 'Agent CLI 检测结果',
        detail: '',
        fix: null,
      },
    ]);
  });
});
