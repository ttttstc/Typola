import { describe, expect, it } from 'vitest';
import {
  SELECTION_ACTIONS,
  buildAnchorContext,
  buildInjectionText,
  buildStructuredInjectionText,
  buildStructuredOneshotPrompt,
  fileNameFromPath,
  findUniqueAnchor,
  recoverAnchorInBlock,
  validateSelectionAnchor,
} from './selectionActions';
import type { SelectionAnchor } from './types';

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
    const fixed: Array<keyof typeof SELECTION_ACTIONS> = ['polish', 'shorten', 'expand', 'explain'];
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

  it('returns null when originalText is missing (stale)', () => {
    expect(findUniqueAnchor('hello world', 'foo')).toBeNull();
  });

  it('错的 prefixHint 不阻止 originalText 唯一命中(prefixHint 仅消歧用)', () => {
    // originalText="world" 在 source 里唯一 → 即使 prefixHint 不匹配,也应直接命中
    // (旧行为是 stale,但实际语义上 originalText 唯一时根本不需 prefixHint)
    expect(findUniqueAnchor('hello world', 'world', 'wrong prefix')).toEqual({ start: 6, length: 5 });
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

  // ----- 兜底层:source 含行内 markdown,选区是 range.toString()(纯文本) -----
  describe('fallback: strip inline markdown then map back', () => {
    it('粗体内段定位:source 是 `**xx**` 选纯文本 xx', () => {
      const source = '这段**Agent 的视野被限制在单一代码仓里**,它根本看不到';
      const hit = findUniqueAnchor(source, 'Agent 的视野被限制在单一代码仓里', '这段');
      expect(hit).not.toBeNull();
      // 反查到 source 的位置(刚好 ** 后的 A)和正确长度(只覆盖 Agent...里 18 字)
      expect(source.slice(hit!.start, hit!.start + hit!.length)).toBe('Agent 的视野被限制在单一代码仓里');
    });

    it('跨越粗体的选区:plain `段Agent的视野被限制在单一代码仓里的` 应映射到含 ** 的 source 段', () => {
      const source = '这段**Agent 的视野被限制在单一代码仓里**,后面';
      // 用户选「段**Agent 的视野被限制在单一代码仓里**,」range.toString() 给纯文本
      const hit = findUniqueAnchor(source, '段Agent 的视野被限制在单一代码仓里,');
      expect(hit).not.toBeNull();
      // length 应覆盖 source 里的 `段**...**,`(含 marker)
      const replaced = source.slice(hit!.start, hit!.start + hit!.length);
      expect(replaced).toContain('**');
      expect(replaced).toContain('Agent 的视野被限制在单一代码仓里');
    });

    it('行内代码内段定位:`code` 选纯文本 code', () => {
      const source = '使用 `useState` 这个 hook';
      const hit = findUniqueAnchor(source, 'useState', '使用 ');
      expect(hit).not.toBeNull();
      expect(source.slice(hit!.start, hit!.start + hit!.length)).toBe('useState');
    });

    it('链接内段定位:[text](url) 选纯文本 text', () => {
      const source = '看 [这篇文章](https://x.com/a) 的解释';
      const hit = findUniqueAnchor(source, '这篇文章', '看 ');
      expect(hit).not.toBeNull();
      expect(source.slice(hit!.start, hit!.start + hit!.length)).toBe('这篇文章');
    });

    it('删除线内段定位:~~text~~ 选纯文本 text', () => {
      const source = '原来 ~~很糟糕~~ 的设计';
      const hit = findUniqueAnchor(source, '很糟糕', '原来 ');
      expect(hit).not.toBeNull();
      expect(source.slice(hit!.start, hit!.start + hit!.length)).toBe('很糟糕');
    });

    it('strip 后多处匹配 → null(歧义)', () => {
      const source = '说 **某事**,又说 **某事** 一次';
      // strip 后 `某事` 在 plain 里出现 2 次 → 拒绝
      expect(findUniqueAnchor(source, '某事')).toBeNull();
      // 用更长的 prefixHint 让 needle 真正唯一(区分两处)
      const hit = findUniqueAnchor(source, '某事', '又说 ');
      expect(hit).not.toBeNull();
    });

    it('精确匹配优先于兜底:source 不含 marker 时不动用映射', () => {
      const source = 'plain 文字 SELECTED 其余';
      const hit = findUniqueAnchor(source, 'SELECTED');
      // 精确层就命中,length 等于 originalText.length
      expect(hit).toEqual({ start: source.indexOf('SELECTED'), length: 'SELECTED'.length });
    });
  });
});

describe('selectionActions structural anchor helpers', () => {
  const source = [
    '# 总览',
    '',
    '## 子节',
    '',
    '请把这段中文改写得简洁一些并保留术语。',
    '',
    '```ts',
    'const x = 1;',
    '```',
  ].join('\n');

  function anchor(from: number, to: number, originalText: string): SelectionAnchor {
    return { filePath: '/tmp/x.md', from, to, originalText };
  }

  it('builds heading path and block context under selection', () => {
    const idx = source.indexOf('请把这段中文');
    const ctx = buildAnchorContext(source, anchor(idx, idx + '请把这段中文'.length, '请把这段中文'));
    expect(ctx.headingPath).toEqual(['总览', '子节']);
    expect(ctx.block.kind).toBe('section');
    expect(ctx.excerpt).toContain('请把这段中文');
  });

  it('honors character budget while preserving selected text', () => {
    const idx = source.indexOf('请把这段中文');
    const ctx = buildAnchorContext(source, anchor(idx, idx + '请把这段中文'.length, '请把这段中文'), 12);
    expect(ctx.excerpt.endsWith('…')).toBe(true);
  });

  it('identifies fenced code blocks via block kind', () => {
    const codeStart = source.indexOf('```ts');
    const ctx = buildAnchorContext(source, anchor(codeStart + 1, codeStart + 5, '```'));
    expect(ctx.block.kind).toBe('code');
  });

  it('recovers anchor with prefixHint within the same block', () => {
    // originalText 在 source 里改成同义短句;prefixHint 保留原文前缀以便 findUniqueAnchor 唯一定位。
    const movedSource = source.replace('请把这段中文', '请改这段文字');
    const a: SelectionAnchor = {
      filePath: '/tmp/x.md',
      from: 0,
      to: 0,
      originalText: '请改这段文字',
      prefixHint: '## 子节\n\n',
    };
    const block = buildAnchorContext(source, {
      ...a,
      originalText: '请把这段中文',
      from: source.indexOf('请把这段中文'),
      to: source.indexOf('请把这段中文') + 6,
    }).block;
    const recovered = recoverAnchorInBlock(movedSource, a, block);
    expect(recovered).not.toBeNull();
  });

  it('rejects recovery that crosses a code block boundary', () => {
    const a: SelectionAnchor = {
      filePath: '/tmp/x.md',
      from: 0,
      to: 0,
      originalText: 'const x',
      prefixHint: '## 子节\n',
    };
    const codeStart = source.indexOf('```ts');
    const block = { kind: 'code' as const, from: codeStart, to: codeStart + 10 };
    expect(recoverAnchorInBlock(source, a, block)).toBeNull();
  });

  it('validateSelectionAnchor returns valid for exact hit in single block', () => {
    const idx = source.indexOf('请把这段中文');
    const result = validateSelectionAnchor(source, anchor(idx, idx + '请把这段中文'.length, '请把这段中文'));
    expect(result.status).toBe('valid');
    expect(result.recovered).toBeUndefined();
  });

  it('validateSelectionAnchor reports stale when text was changed beyond recognition', () => {
    const idx = source.indexOf('请把这段中文');
    const result = validateSelectionAnchor(source, anchor(idx, idx + '请把这段中文'.length, '完全不同的内容'));
    expect(result.status).toBe('stale');
  });

  it('structured prompt prepends heading path and block kind', () => {
    const idx = source.indexOf('请把这段中文');
    const a = anchor(idx, idx + '请把这段中文'.length, '请把这段中文');
    const prompt = buildStructuredOneshotPrompt('polish', a, { source, fileName: 'x.md' });
    expect(prompt).toContain('总览 / 子节');
    expect(prompt).toContain('section');
    expect(prompt).toContain('请把这段中文');
  });

  it('structured injection text falls back to base behavior when source missing', () => {
    const idx = source.indexOf('请把这段中文');
    const a = anchor(idx, idx + '请把这段中文'.length, '请把这段中文');
    const text = buildStructuredInjectionText('polish', a);
    expect(text).toContain('引用自当前文档');
  });
});
