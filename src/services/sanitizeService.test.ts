// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitizeService';

describe('sanitizeHtml', () => {
  it('removes executable tags and event handlers from preview HTML', () => {
    const html = `
      <p onclick="alert(1)">正文</p>
      <img src="x" onerror="alert(2)" />
      <script>alert(3)</script>
    `;

    const sanitized = sanitizeHtml(html);

    expect(sanitized).toContain('<p>正文</p>');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('<script');
  });

  it('removes unsafe URLs and inline styles from imported documents', () => {
    const sanitized = sanitizeHtml(`
      <a href="javascript:alert(1)" style="color:red">链接</a>
      <span style="position:fixed">批注</span>
    `);

    expect(sanitized).toContain('<a>链接</a>');
    expect(sanitized).toContain('<span>批注</span>');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('style=');
  });

  it('removes <style> elements outside SVG but keeps them inside Mermaid SVG', () => {
    const htmlWithPlainStyle = `
      <style>body { display: none; }</style>
      <p>正文</p>
      <svg viewBox="0 0 10 10"><style>.node { fill: #333; }</style><rect width="10" height="10" /></svg>
    `;

    const sanitized = sanitizeHtml(htmlWithPlainStyle);

    expect(sanitized).toContain('<p>正文</p>');
    // 普通 HTML 的 <style> 必须被剥离,不能因 Mermaid 兼容放行而存活。
    expect(sanitized).not.toContain('display: none');
    // Mermaid SVG 内的 <style> 承载节点配色,必须保留。
    expect(sanitized).toContain('.node { fill: #333; }');
    expect(sanitized).toContain('<svg');
  });

  it('removes <style> in non-SVG wrappers but keeps style nested inside SVG elements', () => {
    const sanitized = sanitizeHtml(`
      <div><style>@import url(evil.css);</style><span>包装层</span></div>
      <svg><g><style>.edge { stroke: #999; }</style></g></svg>
    `);

    expect(sanitized).not.toContain('@import');
    expect(sanitized).toContain('包装层');
    // svg 子树内任意层级的 style(如 g 节点内)都属于 Mermaid 输出范围,保留。
    expect(sanitized).toContain('.edge { stroke: #999; }');
  });
});
