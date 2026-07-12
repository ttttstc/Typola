import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// The function checks for __TAURI_INTERNALS__ in window before loading
// convertFileSrc. We need to mock both the global and the dynamic import.

const mockConvertFileSrc = (filePath: string) => `https://asset.localhost${filePath}`;
const mockInvoke = vi.fn();

describe('resolveLocalImages', () => {
  let originalInternals: unknown;

  beforeEach(() => {
    mockInvoke.mockClear();
    originalInternals = (window as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {
      convertFileSrc: mockConvertFileSrc,
    };
    // Reset the cached function so it re-initializes each test
    // We re-import the module to reset the module-level cache
  });

  afterEach(() => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = originalInternals;
    vi.restoreAllMocks();
  });

  async function importFresh(): Promise<typeof import('./localImageResolver')> {
    vi.resetModules();
    vi.doMock('@tauri-apps/api/core', () => ({
      convertFileSrc: mockConvertFileSrc,
      invoke: mockInvoke,
    }));
    return import('./localImageResolver');
  }

  function createContainerWithImages(images: Array<{ src: string; alt?: string }>): HTMLElement {
    const container = document.createElement('div');
    for (const { src, alt } of images) {
      const img = document.createElement('img');
      img.setAttribute('src', src);
      if (alt) img.alt = alt;
      container.appendChild(img);
    }
    return container;
  }

  it('does nothing when filePath is undefined', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: './photo.webp' }]);
    await resolve(container, undefined);
    // The src attribute should still be the relative path
    expect(container.querySelector('img')?.getAttribute('src')).toBe('./photo.webp');
  });

  it('resolves relative image paths to asset URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: './photo.webp' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    const src = img!.getAttribute('src');
    expect(src).toContain('asset.localhost');
    expect(src).toContain('/Users/demo/docs/photo.webp');
  });

  it('resolves images in subdirectories', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'assets/images/logo.png' }]);
    await resolve(container, '/Users/demo/projects/readme.md');
    const src = container.querySelector('img')?.getAttribute('src');
    expect(src).toContain('/Users/demo/projects/assets/images/logo.png');
  });

  it('resolves parent directory references', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: '../images/photo.jpg' }]);
    await resolve(container, '/Users/demo/docs/sub/notes.md');
    const src = container.querySelector('img')?.getAttribute('src');
    expect(src).toContain('/Users/demo/docs/images/photo.jpg');
  });

  it('resolves absolute Windows image paths to asset URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'D:/images/photo.jpg' }]);
    await resolve(container, 'D:/docs/note.md');
    const src = container.querySelector('img')?.getAttribute('src');
    expect(src).toContain('asset.localhost');
    expect(src).toContain('D:\\images\\photo.jpg');
    expect(mockInvoke).toHaveBeenCalledWith('allow_asset_directory', { dir: 'D:\\images' });
  });

  it('skips data: URIs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'data:image/png;base64,abc123' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,abc123');
  });

  it('skips https:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'https://example.com/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/photo.png');
  });

  it('skips http:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'http://example.com/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('http://example.com/photo.png');
  });

  it('skips file:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'file:///Users/demo/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('file:///Users/demo/photo.png');
  });

  it('handles multiple images in one container', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([
      { src: './local.webp' },
      { src: 'https://remote.com/img.png' },
      { src: '../parent.gif' },
      { src: 'data:image/svg+xml,<svg></svg>' },
    ]);
    await resolve(container, '/Users/demo/docs/sub/note.md');
    const imgs = container.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toContain('asset.localhost');
    expect(imgs[0].getAttribute('src')).toContain('/Users/demo/docs/sub/local.webp');
    expect(imgs[1].getAttribute('src')).toBe('https://remote.com/img.png');
    expect(imgs[2].getAttribute('src')).toContain('/Users/demo/docs/parent.gif');
    expect(imgs[3].getAttribute('src')).toBe('data:image/svg+xml,<svg></svg>');
  });
});
