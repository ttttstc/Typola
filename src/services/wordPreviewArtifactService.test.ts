// @vitest-environment jsdom
import Vditor from 'vditor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWordPreviewArtifact } from './wordPreviewArtifactService';

const markdownToDocxMock = vi.hoisted(() => vi.fn(async () => {
  throw new Error('Word preview should not generate a docx artifact');
}));

vi.mock('./word', () => ({
  markdownToDocx: markdownToDocxMock,
}));

vi.mock('vditor', () => ({
  default: {
    preview: vi.fn((element: HTMLDivElement, markdown: string, options: { after?: () => void }) => {
      element.innerHTML = markdown
        .replace(/^# (.+)$/m, '<h1>$1</h1>')
        .replace(/\n\n(.+)$/m, '<p>$1</p>');
      options.after?.();
    }),
  },
}));

vi.mock('vditor/dist/index.css', () => ({}));

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
    expect(Vditor.preview).toHaveBeenCalledWith(expect.any(HTMLDivElement), '# 标题\n\n正文段落', expect.any(Object));
  });
});
