import { describe, expect, it } from 'vitest';
import { resolveWorkbenchWorkspaceRoot } from './workbenchWorkspace';

describe('resolveWorkbenchWorkspaceRoot', () => {
  it('prefers the explicitly configured AI workspace', () => {
    expect(resolveWorkbenchWorkspaceRoot({
      configuredWorkspaceRoot: 'D:\\ai-workspace',
      fileTreeRoot: 'D:\\file-tree',
      currentFilePath: 'D:\\docs\\current.md',
    })).toBe('D:\\ai-workspace');
  });

  it('falls back to the file tree root when no AI workspace is configured', () => {
    expect(resolveWorkbenchWorkspaceRoot({
      configuredWorkspaceRoot: '',
      fileTreeRoot: 'D:\\file-tree',
      currentFilePath: 'D:\\docs\\current.md',
    })).toBe('D:\\file-tree');
  });

  it('falls back to the current document directory when no workspace root is available', () => {
    expect(resolveWorkbenchWorkspaceRoot({
      configuredWorkspaceRoot: '',
      fileTreeRoot: '',
      currentFilePath: 'D:\\docs\\current.md',
    })).toBe('D:\\docs');
  });
});
