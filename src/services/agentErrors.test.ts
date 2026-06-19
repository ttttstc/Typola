import { describe, expect, it } from 'vitest';
import { isClaudeNotFoundError } from './agentErrors';

describe('isClaudeNotFoundError (P1-E Claude CLI 未找到检测)', () => {
  it('Error.message 含 "not found" → true', () => {
    expect(isClaudeNotFoundError(new Error('failed to spawn: claude: not found'))).toBe(true);
  });

  it('Error.message 含 "No such file" → true', () => {
    expect(isClaudeNotFoundError(new Error('failed: No such file or directory (os error 2)'))).toBe(true);
  });

  it('Error.message 含 "ENOENT" → true', () => {
    expect(isClaudeNotFoundError(new Error('spawn ENOENT'))).toBe(true);
  });

  it('Error.message 含 "cannot find" → true(Windows 常见)', () => {
    expect(isClaudeNotFoundError(new Error('failed to spawn terminal shell: The system cannot find the file specified.'))).toBe(true);
  });

  it('Error.message 含中文「找不到」→ true', () => {
    expect(isClaudeNotFoundError(new Error('找不到可执行文件'))).toBe(true);
  });

  it('Error.message 大小写不敏感', () => {
    expect(isClaudeNotFoundError(new Error('NOT FOUND'))).toBe(true);
    expect(isClaudeNotFoundError(new Error('Command Not Found'))).toBe(true);
  });

  it('字符串(非 Error)输入也能匹配', () => {
    expect(isClaudeNotFoundError('claude: not found')).toBe(true);
  });

  it('无关错误 → false', () => {
    expect(isClaudeNotFoundError(new Error('permission denied'))).toBe(false);
    expect(isClaudeNotFoundError(new Error('connection refused'))).toBe(false);
    expect(isClaudeNotFoundError(new Error('timeout'))).toBe(false);
  });

  it('null/undefined → false(不抛)', () => {
    expect(isClaudeNotFoundError(null)).toBe(false);
    expect(isClaudeNotFoundError(undefined)).toBe(false);
  });
});
