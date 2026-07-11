// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWordPreviewArtifact } from './wordPreviewArtifactService';

const markdownToDocxMock = vi.hoisted(() => vi.fn(async () => {
  throw new Error('Word preview should not generate a docx artifact');
}));

vi.mock('./word', () => ({
  markdownToDocx: markdownToDocxMock,
}));

vi.mock('./markdownExportRenderer', () => ({
  markdownToExportHtml: vi.fn(async () => '<h1>标题</h1><p>正文段落</p>'),
}));

describe('createWordPreviewArtifact', () => {
  afterEach(() => {
    markdownToDocxMock.mockClear();
    vi.clearAllMocks();
  });

  it('renders Markdown directly to preview HTML without generating a docx artifact', async () => {
    const artifact = await createWordPreviewArtifact('# 标题\n\n正文段落');

    expect(artifact.source).toBe('markdown-html');
    expect(artifact.html).toContain('标题');
    expect(artifact.html).toContain('正文段落');
    expect(markdownToDocxMock).not.toHaveBeenCalled();
  });
});
