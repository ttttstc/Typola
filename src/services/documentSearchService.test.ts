import { describe, expect, it } from 'vitest';
import {
  findSearchMatches,
  getSearchMatchOccurrenceIndex,
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

  it('finds and replaces multi-line matches', () => {
    const source = '```ts\nconst a = 1;\nconst b = 2;\n```\n\nconst a = 1;\nconst b = 2;\n';
    const query = 'const a = 1;\nconst b = 2;';
    const matches = findSearchMatches(source, query, {
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    });

    expect(matches.map((match) => match.text)).toEqual([query, query]);
    expect(replaceSearchMatch(source, matches[0], 'const sum = a + b;')).toContain('```ts\nconst sum = a + b;\n```');
    expect(replaceAllSearchMatches(source, matches, 'const sum = a + b;')).toBe(
      '```ts\nconst sum = a + b;\n```\n\nconst sum = a + b;\n',
    );
  });

  it('tracks repeated visible search terms across adjacent emphasis markers', () => {
    const source = '_alpha_ _beta_ _gamma_\n\nfoo first foo second foo third beta last\n';
    const options = { caseSensitive: false, wholeWord: false, regex: false };
    const matches = findSearchMatches(source, 'beta', options);

    expect(matches.map((match) => source.slice(match.index, match.index + match.length))).toEqual(['beta', 'beta']);
    expect(matches.map((match) => getSearchMatchOccurrenceIndex(source, match, 'beta', options))).toEqual([0, 1]);
  });

  it('counts occurrences using options (case-insensitive matches different cases)', () => {
    // 关键回归保护:旧实现用 source.indexOf(match.text) 数 occurrence,case-insensitive
    // 搜 "Beta" 在 "BETA beta Beta" 上时,indexOf("Beta") 只数 case-sensitive 命中,
    // 导致 IR 跳转 occurrenceIndex 漂移。新实现走 buildSearchRegExp 跟 findSearchMatches
    // 对齐,case-insensitive 三次出现都要数到。
    const source = 'BETA beta Beta';
    const options = { caseSensitive: false, wholeWord: false, regex: false };
    const matches = findSearchMatches(source, 'beta', options);
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => getSearchMatchOccurrenceIndex(source, m, 'beta', options))).toEqual([0, 1, 2]);
  });

  it('counts occurrences using options (regex matches different literals)', () => {
    // 同上,regex 搜 "b.t" 命中 "bat" "bit" "but",旧实现 indexOf("bat") 漏数另两个。
    const source = 'bat bit but bat';
    const options = { caseSensitive: false, wholeWord: false, regex: true };
    const matches = findSearchMatches(source, 'b.t', options);
    expect(matches).toHaveLength(4);
    expect(matches.map((m) => getSearchMatchOccurrenceIndex(source, m, 'b.t', options))).toEqual([0, 1, 2, 3]);
  });

  it('counts occurrences using options (wholeWord excludes embedded hits)', () => {
    const source = 'cat scatter cat';
    const options = { caseSensitive: false, wholeWord: true, regex: false };
    const matches = findSearchMatches(source, 'cat', options);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => getSearchMatchOccurrenceIndex(source, m, 'cat', options))).toEqual([0, 1]);
  });
});
