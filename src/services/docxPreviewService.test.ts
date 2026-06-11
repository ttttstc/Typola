import { describe, expect, it } from 'vitest';
import { normalizeWordPreviewTables } from './docxPreviewService';

function compactHtml(html: string): string {
  return html.replace(/>\s+</g, '><').trim();
}

describe('normalizeWordPreviewTables', () => {
  it('keeps the first header-like row and converts later body headers to data cells', () => {
    const html = compactHtml(normalizeWordPreviewTables(`
      <table>
        <tr><th>序号</th><th>证据名称</th></tr>
        <tr><th>1</th><th class="body-cell">付款记录</th></tr>
      </table>
    `));

    expect(html).toContain('<tr><th>序号</th><th>证据名称</th></tr>');
    expect(html).toContain('<tr><td>1</td><td class="body-cell">付款记录</td></tr>');
  });

  it('preserves explicit thead cells and normalizes tbody cells', () => {
    const html = compactHtml(normalizeWordPreviewTables(`
      <table>
        <thead>
          <tr><th colspan="2">表头</th></tr>
        </thead>
        <tbody>
          <tr><th rowspan="2">1</th><th>较长正文</th></tr>
          <tr><th>继续正文</th></tr>
        </tbody>
      </table>
    `));

    expect(html).toContain('<thead><tr><th colspan="2">表头</th></tr></thead>');
    expect(html).toContain('<tbody><tr><td rowspan="2">1</td><td>较长正文</td></tr><tr><td>继续正文</td></tr></tbody>');
  });

  it('moves body rows out of a thead-only table emitted by docx conversion', () => {
    const html = compactHtml(normalizeWordPreviewTables(`
      <table>
        <thead>
          <tr><th><strong>序号</strong></th><th><strong>证据名称</strong></th></tr>
          <tr><th>1</th><th>付款记录</th></tr>
        </thead>
      </table>
    `));

    expect(html).toContain('<thead><tr><th><strong>序号</strong></th><th><strong>证据名称</strong></th></tr></thead>');
    expect(html).toContain('<tbody><tr><td>1</td><td>付款记录</td></tr></tbody>');
  });
});
