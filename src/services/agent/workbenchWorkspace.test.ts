import { describe, expect, it } from 'vitest';
import { resolveWorkbenchWorkspaceRoot } from './workbenchWorkspace';

describe('resolveWorkbenchWorkspaceRoot', () => {
  it('prefers the explicitly configured AI workspace', () => {
    expect(resolveWorkbenchWorkspaceRoot({
      configuredWorkspaceRoot: 'D:\\ai-workspace',
      defaultWorkspaceRoot: 'D:\\default-workspace',
    })).toBe('D:\\ai-workspace');
  });

  it('falls back to the default workspace when no AI workspace is configured', () => {
    expect(resolveWorkbenchWorkspaceRoot({
      configuredWorkspaceRoot: '',
      defaultWorkspaceRoot: 'D:\\default-workspace',
    })).toBe('D:\\default-workspace');
  });

  it('returns undefined when neither configured nor default workspace is available', () => {
    expect(resolveWorkbenchWorkspaceRoot({
      configuredWorkspaceRoot: '',
      defaultWorkspaceRoot: '',
    })).toBeUndefined();
  });
});
