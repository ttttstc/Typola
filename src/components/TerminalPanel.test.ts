import { describe, expect, it } from 'vitest';
import { friendlyTerminalError } from '../services/terminalError';

describe('friendlyTerminalError', () => {
  it('explains missing shell configuration', () => {
    expect(friendlyTerminalError('shell not found')).toContain('设置 → 终端');
  });

  it('prioritizes permission failures even when the message mentions a shell', () => {
    expect(friendlyTerminalError('shell spawn permission denied')).toContain('权限');
  });

  it('keeps unknown errors actionable without exposing them as primary copy', () => {
    expect(friendlyTerminalError('opaque runtime failure')).toContain('展开诊断信息');
  });
});
