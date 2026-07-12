// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { copyHtmlExportAssets } from './exportAssetResolver';

describe('copyHtmlExportAssets', () => {
  it('copies local images and leaves remote images untouched', async () => {
    const copyFile = vi.fn(async () => undefined); const mkdir = vi.fn(async () => undefined);
    const html = await copyHtmlExportAssets('<img src="./cover.png"><img src="https://example.com/a.png">', 'D:/out/post.html', 'D:/docs/post.md', 'assets/{filename}', { copyFile, mkdir });
    expect(copyFile).toHaveBeenCalledWith('D:/docs/./cover.png', 'D:/out/assets/post/cover.png');
    expect(html).toContain('src="assets/post/cover.png"'); expect(html).toContain('https://example.com/a.png');
  });
});
