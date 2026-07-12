import { describe, expect, it } from 'vitest';
import { analyzeMarkdown, findMarkdownImageAt } from './markdownAnalysisService';

describe('markdownAnalysisService — images', () => {
  it('parses ![alt](url "title") into MarkdownImage', () => {
    const source = '![封面](./cover.png "图片")';
    const analysis = analyzeMarkdown(source);
    expect(analysis.images).toHaveLength(1);
    const image = analysis.images[0];
    expect(image?.alt).toBe('封面');
    expect(image?.url).toBe('./cover.png');
    expect(image?.title).toBe('图片');
    expect(image?.from).toBe(0);
    expect(image?.to).toBe(source.length);
  });

  it('parses image without title', () => {
    const source = '![a](b.png)';
    const analysis = analyzeMarkdown(source);
    expect(analysis.images[0]?.title).toBeUndefined();
    expect(analysis.images[0]?.alt).toBe('a');
    expect(analysis.images[0]?.url).toBe('b.png');
  });

  it('parses HTML image width metadata', () => {
    const image = analyzeMarkdown('<img src="a.png" alt="封面" title="图" width="50%">').images[0];
    expect(image).toMatchObject({ url: 'a.png', alt: '封面', title: '图', width: '50%' });
  });

  it('parses image with empty alt', () => {
    const source = '![](x.png)';
    const analysis = analyzeMarkdown(source);
    expect(analysis.images[0]?.alt).toBe('');
    expect(analysis.images[0]?.url).toBe('x.png');
  });

  it('finds image by offset', () => {
    const source = '![a](x.png)';
    const analysis = analyzeMarkdown(source);
    const image = analysis.images[0]!;
    // offset 0 (start of image syntax) should match
    expect(findMarkdownImageAt(source, image.from)?.url).toBe('x.png');
    // offset in the middle should match
    expect(findMarkdownImageAt(source, image.from + 3)?.url).toBe('x.png');
    // offset past the end should not match
    expect(findMarkdownImageAt(source, image.to + 1)).toBeNull();
    // negative offset returns null
    expect(findMarkdownImageAt(source, -1)).toBeNull();
    // offset beyond source length returns null
    expect(findMarkdownImageAt(source, source.length + 5)).toBeNull();
  });

  it('ignores image syntax inside fenced code blocks', () => {
    const source = [
      '# Title',
      '',
      '```md',
      '![伪图](x.png)',
      '```',
      '',
      '![真图](y.png)',
    ].join('\n');
    const analysis = analyzeMarkdown(source);
    expect(analysis.images).toHaveLength(1);
    expect(analysis.images[0]?.url).toBe('y.png');

    // offset inside fenced block should not match
    const fencedOffset = source.indexOf('![伪图]') + 1;
    expect(findMarkdownImageAt(source, fencedOffset)).toBeNull();

    // offset on real image should match
    const realOffset = source.indexOf('![真图]') + 1;
    expect(findMarkdownImageAt(source, realOffset)?.url).toBe('y.png');
  });

  it('does not let image syntax leak into links array', () => {
    const source = '[link](https://example.com) and ![img](local.png)';
    const analysis = analyzeMarkdown(source);
    expect(analysis.links).toHaveLength(1);
    expect(analysis.links[0]?.url).toBe('https://example.com');
    expect(analysis.images).toHaveLength(1);
    expect(analysis.images[0]?.url).toBe('local.png');
  });

  it('handles multiple images on different lines', () => {
    const source = '![a](a.png)\n\n![b](b.png)\n\n![c](c.png)';
    const analysis = analyzeMarkdown(source);
    expect(analysis.images.map((i) => i.url)).toEqual(['a.png', 'b.png', 'c.png']);
  });
});
