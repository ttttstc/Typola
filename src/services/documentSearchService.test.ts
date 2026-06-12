import { describe, expect, it } from 'vitest';
import {
  findSearchMatches,
  replaceAllSearchMatches,
  replaceSearchMatch,
} from './documentSearchService';

describe('documentSearchService', () => {
  it('finds plain text matches case-insensitively by default', () => {
    const matches = findSearchMatches('Alpha beta alpha', 'alpha', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    });
    expect(matches.map((match) => match.index)).toEqual([0, 11]);
  });

  it('supports whole-word matching', () => {
    const matches = findSearchMatches('cat scatter cat', 'cat', {
      caseSensitive: false,
      wholeWord: true,
      regex: false,
    });
    expect(matches.map((match) => match.index)).toEqual([0, 12]);
  });

  it('replaces current and all matches without changing unrelated text', () => {
    const source = 'one two one';
    const matches = findSearchMatches(source, 'one', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    });
    expect(replaceSearchMatch(source, matches[0], '1')).toBe('1 two one');
    expect(replaceAllSearchMatches(source, matches, '1')).toBe('1 two 1');
  });
});
