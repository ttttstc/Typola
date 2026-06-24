import { describe, expect, it } from 'vitest';
import {
  findIrDomRange,
  findSearchMatches,
  replaceAllSearchMatches,
  replaceSearchMatch,
} from './documentSearchService';

/**
 * 用 document + DOM API 模拟 Vditor IR DOM。
 * Vditor 把 markdown 渲染后,可见文本节点按 plain 顺序铺开,被 <p> <strong> <em> 等
 * 元素包住。这里只用最朴素的 span 拼出相同结构,功能上等价。
 */
function buildIrDom(markdown: string): HTMLElement {
  const doc = document.implementation.createHTMLDocument('ir-test');
  const root = doc.createElement('div');
  // 简单解析:行内 **加粗** _斜体_ `代码` ![alt](url) [text](url)
  const lines = markdown.split('\n');
  for (const line of lines) {
    if (!line) continue;
    const p = doc.createElement('p');
    let rest = line;
    while (rest.length > 0) {
      // 优先匹配最长的 marker
      const patterns: Array<[RegExp, string]> = [
        [/^!\[([^\]]*)\]\([^)]*\)/, 'alt'],
        [/^\[([^\]]*)\]\([^)]*\)/, 'link'],
        [/^\*\*([^*]+)\*\*/, 'strong'],
        [/^~~([^~]+)~~/, 'del'],
        [/^`([^`]+)`/, 'code'],
        [/^_([^_]+)_/, 'em'],
        [/^\*([^*]+)\*/, 'em'],
      ];
      let matched = false;
      for (const [pattern, _tag] of patterns) {
        const m = rest.match(pattern);
        if (m) {
          p.appendChild(doc.createTextNode(m[1]));
          rest = rest.slice(m[0].length);
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // 普通字符:取到下一个 marker 起点或行末
      let i = 0;
      while (i < rest.length) {
        if ('*_~`!['.includes(rest[i]) && i > 0) break;
        i += 1;
      }
      p.appendChild(doc.createTextNode(rest.slice(0, i)));
      rest = rest.slice(i);
    }
    root.appendChild(p);
  }
  return root;
}

describe('findIrDomRange', () => {
  it('locates a plain match by source offset', () => {
    const source = 'Hello world hello again';
    const ir = buildIrDom(source);
    const range = findIrDomRange(source, ir, 12, 17);
    expect(range).not.toBeNull();
    expect(range?.toString()).toBe('hello');
  });

  it('skips markdown markers and points at the rendered text node', () => {
    const source = 'a **bold** b';
    const ir = buildIrDom(source);
    // 'bold' 在 source [4, 8)
    const range = findIrDomRange(source, ir, 4, 8);
    expect(range).not.toBeNull();
    expect(range?.toString()).toBe('bold');
    // 命中点必须落在 plain 文本节点上(不是 markdown marker)
    const parent = range?.startContainer.parentElement;
    expect(parent?.tagName).toBe('P');
  });

  it('handles a multi-line document', () => {
    const source = 'first line\nsecond line with target\nthird';
    const ir = buildIrDom(source);
    // 'target' 在 source[28, 34)
    const range = findIrDomRange(source, ir, 28, 34);
    expect(range).not.toBeNull();
    expect(range?.toString()).toBe('target');
  });

  it('returns null when the range is out of bounds', () => {
    const source = 'short';
    const ir = buildIrDom(source);
    expect(findIrDomRange(source, ir, -1, 3)).toBeNull();
    expect(findIrDomRange(source, ir, 0, 999)).toBeNull();
  });

  it('returns null when no IR text nodes are present', () => {
    const source = 'anything';
    const doc = document.implementation.createHTMLDocument('ir-empty');
    const root = doc.createElement('div');
    const range = findIrDomRange(source, root, 0, 4);
    expect(range).toBeNull();
  });
});

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
