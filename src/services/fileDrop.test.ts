import { describe, expect, it } from 'vitest';
import { firstOpenableDocumentPath, isOpenableDocumentPath } from './fileDrop';

describe('fileDrop', () => {
  it('accepts Markdown, HTML, and docx paths', () => {
    expect(isOpenableDocumentPath('/tmp/case.md')).toBe(true);
    expect(isOpenableDocumentPath('/tmp/case.markdown')).toBe(true);
    expect(isOpenableDocumentPath('/tmp/case.HTML')).toBe(true);
    expect(isOpenableDocumentPath('/tmp/case.htm')).toBe(true);
    expect(isOpenableDocumentPath('/tmp/case.DOCX')).toBe(true);
  });

  it('returns the first supported dropped path', () => {
    expect(firstOpenableDocumentPath(['/tmp/a.pdf', '/tmp/b.md', '/tmp/c.docx'])).toBe('/tmp/b.md');
    expect(firstOpenableDocumentPath(['/tmp/a.pdf'])).toBeNull();
  });
});
