import { describe, expect, it } from 'vitest';
import { SELECTION_ACTIONS, buildInjectionText, fileNameFromPath, findUniqueAnchor } from './selectionActions';

describe('fileNameFromPath', () => {
  it('returns the basename for POSIX-style paths', () => {
    expect(fileNameFromPath('/home/user/notes.md')).toBe('notes.md');
  });
  it('returns the basename for Windows-style paths', () => {
    expect(fileNameFromPath('D:\\暂存\\Typola\\README.md')).toBe('README.md');
  });
  it('falls back to the full path when no separator is present', () => {
    expect(fileNameFromPath('README.md')).toBe('README.md');
  });
});

describe('buildInjectionText', () => {
  it('emits 5 fixed templates with the expected shape', () => {
    const fixed: Array<keyof typeof SELECTION_ACTIONS> = ['polish', 'rewrite', 'shorten', 'expand', 'explain'];
    for (const action of fixed) {
      const out = buildInjectionText(action, 'D:\\暂存\\notes.md', '需要润色的一句话');
      // 引用 header 必须包含文件名(不带路径)
      expect(out).toMatch(/^> 引用自当前文档「notes\.md」/);
      // 必须把选区文本每行加 > 前缀
      expect(out).toContain('> 需要润色的一句话');
      // 模板文本必须出现
      expect(out).toContain(SELECTION_ACTIONS[action].template);
      // 必须以末位空行结束(让光标停在末位)
      expect(out.endsWith('\n\n')).toBe(true);
    }
  });

  it('does NOT include a "翻译" template (per spec)', () => {
    const ids = Object.keys(SELECTION_ACTIONS);
    for (const id of ids) {
      const out = buildInjectionText(id as keyof typeof SELECTION_ACTIONS, 'a.md', 'x');
      expect(out).not.toContain('翻译');
    }
  });

  it('omits the prompt template for custom action and ends with empty line', () => {
    const out = buildInjectionText('custom', 'a.md', 'x');
    expect(out).toMatch(/^> 引用自当前文档「a\.md」\n> x\n\n$/);
  });

  it('prefixes every line of multi-line selections with >', () => {
    const out = buildInjectionText('polish', 'a.md', 'line1\nline2\nline3');
    const lines = out.split('\n');
    // 期望: header, line1, line2, line3, 空行, template, 空行
    expect(lines[0]).toBe('> 引用自当前文档「a.md」');
    expect(lines[1]).toBe('> line1');
    expect(lines[2]).toBe('> line2');
    expect(lines[3]).toBe('> line3');
    expect(lines[4]).toBe(''); // 引用与 prompt 之间的空行
  });

  it('includes a trailing empty line as "> " in the quote block (still valid markdown)', () => {
    // 选区以 \n 结尾时,空行仍以 "> " 渲染——这是合法的 markdown 空引用行,
    // 也保证 prefixHint+originalText 搜索能精确匹配到换行边界。
    const out = buildInjectionText('polish', 'a.md', 'line1\n');
    const lines = out.split('\n');
    expect(lines[0]).toBe('> 引用自当前文档「a.md」');
    expect(lines[1]).toBe('> line1');
    expect(lines[2]).toBe('> '); // 末尾空行的 > 前缀
  });

  it('handles Windows path with mixed separators in filename extraction', () => {
    const out = buildInjectionText('polish', 'C:/Users/test/file.md', 'text');
    expect(out).toMatch(/^> 引用自当前文档「file\.md」/);
  });
});

describe('findUniqueAnchor', () => {
  it('returns null when originalText is empty (defensive)', () => {
    expect(findUniqueAnchor('any source', '')).toBeNull();
    expect(findUniqueAnchor('any source', '', 'hint')).toBeNull();
  });

  it('returns null when needle is missing (stale)', () => {
    expect(findUniqueAnchor('hello world', 'foo')).toBeNull();
    expect(findUniqueAnchor('hello world', 'world', 'hello foo')).toBeNull();
  });

  it('returns null when needle appears more than once (ambiguous)', () => {
    // 同一 originalText 在文档里出现 2 次,即使有 prefixHint 帮忙,prefixHint+originalText 也可能重复
    const source = 'aaaXbbbXccc';
    // 无 prefixHint:anchor 文本「X」出现 2 次 → 歧义
    expect(findUniqueAnchor(source, 'X')).toBeNull();
    // 有 prefixHint:needle「aaaX」唯一 → 命中
    expect(findUniqueAnchor(source, 'X', 'aaa')).toEqual({ start: 3, length: 1 });
  });

  it('returns null when prefixHint+originalText appears more than once (ambiguous even with hint)', () => {
    // 即使 prefixHint 能让 prefixHint+originalText 唯一,但若 prefixHint 在文档中也多次出现,
    // prefixHint+originalText 仍可能多处重复
    const source = 'preXabc...preXabc';
    // needle = preXabc,出现 2 次 → 歧义,应拒绝替换
    expect(findUniqueAnchor(source, 'abc', 'preX')).toBeNull();
  });

  it('returns the hit with start adjusted past prefixHint when unique', () => {
    // 前文前文 = 4 chars,SELECTED = 8 chars。needle = 前文前文SELECTED 在 source 起始 0,
    // prefixHint.length = 4,hit.start = 0 + 4 = 4(指向 SELECTED 的 'S')
    const source = '前文前文SELECTED尾巴';
    const hit = findUniqueAnchor(source, 'SELECTED', '前文前文');
    expect(hit).toEqual({ start: 4, length: 8 });
  });

  it('returns hit.start === needleStart when no prefixHint', () => {
    const source = 'xxx SELECTED yyy';
    expect(findUniqueAnchor(source, 'SELECTED')).toEqual({ start: 4, length: 8 });
  });

  it('handles multiline originalText correctly (CR/LF preserved)', () => {
    const source = 'header\nSELECTED\nline2\nmore';
    // SELECTED\nline2 = 8 + 1 + 5 = 14 chars
    const hit = findUniqueAnchor(source, 'SELECTED\nline2', 'header\n');
    expect(hit).toEqual({ start: 7, length: 14 });
  });

  it('accepts null prefixHint (treats same as undefined)', () => {
    const source = 'xxx SELECTED yyy';
    expect(findUniqueAnchor(source, 'SELECTED', null)).toEqual({ start: 4, length: 8 });
  });
});
