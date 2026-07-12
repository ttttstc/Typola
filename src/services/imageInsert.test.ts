import { describe, expect, it } from 'vitest';
import {
  formatImageSrc,
  parseTyporaCopyImagesTo,
  parseUploadUrls,
  resolveCopyDestination,
  resolveImageInsertAction,
} from './imageInsert';

describe('imageInsert', () => {
  it('expands filename and date destination tokens', () => {
    expect(resolveCopyDestination('D:/文章/草稿.md', 'assets/{filename}/{year}/{month}')).toMatch(/^assets\/草稿\/\d{4}\/\d{2}$/u);
  });
  it('formats copied image paths as relative paths without ./ by default', () => {
    expect(formatImageSrc(
      'D:/docs/post/assets/a b.png',
      'D:/docs/post/周报.md',
      { imagePreferRelative: true, imageEnsureDotPrefix: false, imageEscapeUrl: false },
    )).toBe('assets/a b.png');
  });

  it('can force ./ prefix and URL escaping', () => {
    expect(formatImageSrc(
      'D:/docs/post/assets/a b.png',
      'D:/docs/post/周报.md',
      { imagePreferRelative: true, imageEnsureDotPrefix: true, imageEscapeUrl: true },
    )).toBe('./assets/a%20b.png');
  });

  it('falls back to absolute paths across Windows drives', () => {
    expect(formatImageSrc(
      'E:/images/a.png',
      'D:/docs/post.md',
      { imagePreferRelative: true, imageEnsureDotPrefix: true, imageEscapeUrl: false },
    )).toBe('E:/images/a.png');
  });

  it('extracts typora-copy-images-to from front matter', () => {
    expect(parseTyporaCopyImagesTo('---\ntitle: A\ntypora-copy-images-to: "_media"\n---\nbody'))
      .toBe('_media');
  });

  it('resolves YAML upload only when the setting allows it', () => {
    const base = {
      imageInsertAction: 'copy' as const,
      imageCopyDestination: 'assets',
      imageAllowYamlUpload: false,
      imagePreferRelative: true,
      imageEnsureDotPrefix: false,
      imageEscapeUrl: false,
    };
    expect(resolveImageInsertAction(base, '---\ntypora-copy-images-to: upload\n---\n').action).toBe('copy');
    expect(resolveImageInsertAction({ ...base, imageAllowYamlUpload: true }, '---\ntypora-copy-images-to: upload\n---\n').action)
      .toBe('upload');
  });

  it('replaces ${filename} in copy destinations', () => {
    expect(resolveCopyDestination('D:/docs/周报.md', '${filename}.assets')).toBe('周报.assets');
  });

  it('uses stdout last N lines as uploaded URLs', () => {
    expect(parseUploadUrls('Upload Success:\nhttps://cdn/a.png\nhttps://cdn/b.png\n', 2))
      .toEqual(['https://cdn/a.png', 'https://cdn/b.png']);
  });

  it('rejects upload output without enough URL lines', () => {
    expect(() => parseUploadUrls('Upload Success:\nnot-a-url\n', 1)).toThrow();
  });
});
