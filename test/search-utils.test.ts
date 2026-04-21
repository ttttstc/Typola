// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  previewReplaceText,
  replaceSingleMatch,
  searchText,
  shouldSearchPath,
} from '../src/shared/search';

describe('search utils', () => {
  it('matches top-level and nested files with default include globs', () => {
    const includeGlob = '**/*.md, **/*.mdx, **/*.markdown, **/*.txt';
    const excludeGlob = '**/node_modules/**, **/.git/**, **/dist/**, **/release/**';

    expect(shouldSearchPath('note.md', includeGlob, excludeGlob)).toBe(true);
    expect(shouldSearchPath('docs/guide.md', includeGlob, excludeGlob)).toBe(true);
    expect(shouldSearchPath('node_modules/pkg/readme.md', includeGlob, excludeGlob)).toBe(false);
  });

  it('supports case-sensitive and whole-word matching', () => {
    const content = 'Alpha alpha alphabet\nalpha';

    const insensitive = searchText(content, 'alpha', {
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
    });
    const wholeWord = searchText(content, 'alpha', {
      caseSensitive: false,
      wholeWord: true,
      useRegex: false,
    });
    const sensitive = searchText(content, 'alpha', {
      caseSensitive: true,
      wholeWord: true,
      useRegex: false,
    });

    expect(insensitive).toHaveLength(4);
    expect(wholeWord).toHaveLength(3);
    expect(sensitive).toHaveLength(2);
  });

  it('builds preview replacements across the whole document', () => {
    const preview = previewReplaceText(
      'foo one\nfoo two',
      'foo',
      'bar',
      {
        caseSensitive: false,
        wholeWord: false,
        useRegex: false,
      }
    );

    expect(preview.replacementCount).toBe(2);
    expect(preview.nextContent).toBe('bar one\nbar two');
    expect(preview.changes.map((change) => change.lineNumber)).toEqual([1, 2]);
  });

  it('replaces a single regex match while preserving replacement groups', () => {
    const result = replaceSingleMatch(
      'foo foo',
      '(f)(oo)',
      '$2$1',
      {
        caseSensitive: false,
        wholeWord: false,
        useRegex: true,
      },
      1
    );

    expect(result.replaced).toBe(true);
    expect(result.nextContent).toBe('foo oof');
  });
});
