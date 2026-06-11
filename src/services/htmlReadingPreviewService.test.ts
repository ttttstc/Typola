// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createHtmlReadingPreviewHtml } from './htmlReadingPreviewService';

describe('htmlReadingPreviewService', () => {
  it('unwraps full HTML documents and keeps safe reading styles', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>不应显示</title>
          <script>alert(1)</script>
        </head>
        <body>
          <h1 align="right">标题</h1>
          <p style="text-align: right; white-space: pre-wrap; position: fixed;">第一行

第二行</p>
          <table><tr><td onclick="alert(2)">正文</td></tr></table>
        </body>
      </html>
    `;

    const previewHtml = createHtmlReadingPreviewHtml(html);

    expect(previewHtml).toContain('<h1 align="right">标题</h1>');
    expect(previewHtml).toContain('style="text-align: right; white-space: pre-wrap"');
    expect(previewHtml).toContain('第一行\n\n第二行');
    expect(previewHtml).toContain('<table><tbody><tr><td>正文</td></tr></tbody></table>');
    expect(previewHtml).not.toContain('<!doctype');
    expect(previewHtml).not.toContain('<html');
    expect(previewHtml).not.toContain('<head');
    expect(previewHtml).not.toContain('<script');
    expect(previewHtml).not.toContain('onclick');
    expect(previewHtml).not.toContain('position');
  });
});
