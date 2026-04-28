import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { extractOpenDocumentPaths } from '../electron/openTargets';

describe('extractOpenDocumentPaths', () => {
  it('keeps only openable document args and deduplicates them', () => {
    const cwd = path.resolve('workspace', 'Typola');
    const notePath = path.resolve(cwd, 'notes', 'todo.md');

    const result = extractOpenDocumentPaths(
      ['Typola.exe', '.', '--inspect=5858', 'electron/main.js', 'notes/todo.md', 'notes/todo.md'],
      cwd
    );

    expect(result).toEqual([notePath]);
  });

  it('supports additional markdown-like extensions', () => {
    const cwd = path.resolve('workspace', 'Typola');

    const result = extractOpenDocumentPaths(
      ['Typola.exe', 'docs/guide.markdown', 'drafts/spec.MDX', 'plain.txt'],
      cwd
    );

    expect(result).toEqual([
      path.resolve(cwd, 'docs', 'guide.markdown'),
      path.resolve(cwd, 'drafts', 'spec.MDX'),
      path.resolve(cwd, 'plain.txt'),
    ]);
  });

  it('resolves relative paths against the provided second-instance working directory', () => {
    const firstInstanceCwd = path.resolve('workspace', 'Typola');
    const secondInstanceCwd = path.resolve('workspace', 'notes-app');

    const result = extractOpenDocumentPaths(
      ['Typola.exe', 'notes/todo.md'],
      secondInstanceCwd
    );

    expect(result).toEqual([path.resolve(secondInstanceCwd, 'notes', 'todo.md')]);
    expect(result).not.toEqual([path.resolve(firstInstanceCwd, 'notes', 'todo.md')]);
  });
});
