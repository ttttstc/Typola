import { describe, expect, it } from 'vitest';
import { diagnoseOpenCodeCliFailure } from './opencodeDiagnostics';

describe('diagnoseOpenCodeCliFailure', () => {
  it('explains missing OpenCode CLI installs', () => {
    const diagnostic = diagnoseOpenCodeCliFailure({
      error: 'failed to start OpenCode headless run: 系统找不到指定的文件。 (os error 2)',
      agentPath: 'opencode.cmd',
    });

    expect(diagnostic?.code).toBe('OPENCODE_NOT_FOUND');
    expect(diagnostic?.detail).toContain('npm install -g opencode-ai');
    expect(diagnostic?.detail).toContain('opencode.cmd');
  });

  it('explains invalid fixed model strings', () => {
    const diagnostic = diagnoseOpenCodeCliFailure({
      exitCode: 1,
      stderrTail: 'invalid model',
      model: 'claude-sonnet-4',
    });

    expect(diagnostic?.code).toBe('OPENCODE_MODEL_INVALID');
    expect(diagnostic?.detail).toContain('provider/model');
  });
});
