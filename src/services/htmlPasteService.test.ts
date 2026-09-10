import { describe, expect, it } from 'vitest';
import { convertHtmlPasteToMarkdown } from './htmlPasteService';

describe('convertHtmlPasteToMarkdown', () => {
  it('转换表格 HTML 为 Markdown 表格', () => {
    const html = '<table><tr><th>Name</th><th>Age</th></tr><tr><td>Tom</td><td>3</td></tr></table>';
    const markdown = convertHtmlPasteToMarkdown(html);
    expect(markdown).not.toBeNull();
    expect(markdown).toContain('| Name | Age |');
    expect(markdown).toContain('| --- | --- |');
    expect(markdown).toContain('| Tom | 3 |');
  });

  it('转换 <pre><code> 为围栏代码块并保留语言', () => {
    const html = '<pre><code class="language-js">const a = 1;</code></pre>';
    const markdown = convertHtmlPasteToMarkdown(html);
    expect(markdown).toBe('```js\nconst a = 1;\n```');
  });

  it('多行代码块完整保留', () => {
    const html = '<pre><code>line1\nline2</code></pre>';
    const markdown = convertHtmlPasteToMarkdown(html);
    expect(markdown).toBe('```\nline1\nline2\n```');
  });

  it('富文本(b/i/a/h1/del)转换为 Markdown 行内语法', () => {
    const html = '<h1>Title</h1><p><b>bold</b> and <i>it</i> and <a href="https://ex.com">link</a> and <del>gone</del></p>';
    const markdown = convertHtmlPasteToMarkdown(html);
    expect(markdown).toContain('# Title');
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('*it*');
    expect(markdown).toContain('[link](https://ex.com)');
    expect(markdown).toContain('~gone~');
  });

  it('图片转换为 Markdown 图片语法', () => {
    const html = '<p><img src="a.png" alt="pic"></p>';
    expect(convertHtmlPasteToMarkdown(html)).toBe('![pic](a.png)');
  });

  it('列表输出 Typola 风格的单空格标记', () => {
    const html = '<ul><li>one</li><li>two</li></ul>';
    expect(convertHtmlPasteToMarkdown(html)).toBe('- one\n- two');
  });

  it('纯 <p>/<span> 包装的普通文本返回 null(走纯文本链路)', () => {
    expect(convertHtmlPasteToMarkdown('<p>hello world</p>')).toBeNull();
    expect(convertHtmlPasteToMarkdown('<div style="color:#ccc"><span>plain code copy</span></div>')).toBeNull();
    expect(convertHtmlPasteToMarkdown('<meta charset="utf-8"><p>plain</p>')).toBeNull();
  });

  it('空输入与空白输入返回 null', () => {
    expect(convertHtmlPasteToMarkdown('')).toBeNull();
    expect(convertHtmlPasteToMarkdown('   \n  ')).toBeNull();
  });

  it('输出已 trim', () => {
    const html = '  <pre><code>x</code></pre>  ';
    expect(convertHtmlPasteToMarkdown(html)).toBe('```\nx\n```');
  });
});
