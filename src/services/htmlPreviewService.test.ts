import { describe, expect, it } from 'vitest';
import {
  buildHtmlPreviewDocument,
  buildHtmlPreviewDocumentWithLocalResources,
  createFileBaseHref,
  resolveLocalResourcePath,
} from './htmlPreviewService';

describe('htmlPreviewService', () => {
  it('creates a file base href for a POSIX HTML path', () => {
    expect(createFileBaseHref('/Users/demo/decks/case.html')).toBe('file:///Users/demo/decks/');
  });

  it('creates a file base href for a Windows HTML path', () => {
    expect(createFileBaseHref('C:\\Users\\demo\\decks\\case.html')).toBe('file:///C:/Users/demo/decks/');
  });

  it('encodes spaces and non-ASCII path segments in file base hrefs', () => {
    expect(createFileBaseHref('/Users/demo/My Deck/演示.html')).toBe(
      'file:///Users/demo/My%20Deck/',
    );
  });

  it('returns undefined for paths without a directory component', () => {
    expect(createFileBaseHref('index.html')).toBeUndefined();
    expect(createFileBaseHref(undefined)).toBeUndefined();
  });

  describe('buildHtmlPreviewDocument', () => {
    it('wraps an HTML fragment in a document shell with base href', () => {
      const doc = buildHtmlPreviewDocument('<section>Fragment</section>', {
        filePath: '/Users/demo/decks/case.html',
      });

      expect(doc.toLowerCase()).toContain('<!doctype html>');
      expect(doc).toContain('<section>Fragment</section>');
      expect(doc).toContain('<base href="file:///Users/demo/decks/">');
    });

    it('injects base href into an existing <head> without duplicating the document shell', () => {
      const html = [
        '<!doctype html>',
        '<html>',
        '<head><title>Case</title></head>',
        '<body>',
        '<main>Case</main>',
        '</body>',
        '</html>',
      ].join('');

      const doc = buildHtmlPreviewDocument(html, { filePath: '/Users/demo/decks/case.html' });

      expect(doc).toContain('<base href="file:///Users/demo/decks/">');
      expect(doc.indexOf('<base href="file:///Users/demo/decks/">')).toBeLessThan(
        doc.indexOf('<title>Case</title>'),
      );
      expect(doc).toContain('<main>Case</main>');
      expect((doc.match(/<html\b/gi) ?? []).length).toBe(1);
    });

    it('keeps an existing base href without overwriting it', () => {
      const html = '<html><head><base href="https://example.test/dir/"></head><body>x</body></html>';
      const doc = buildHtmlPreviewDocument(html, { filePath: '/Users/demo/decks/case.html' });

      expect(doc).toContain('<base href="https://example.test/dir/">');
      expect(doc).not.toContain('file:///Users/demo/decks/');
    });

    it('skips base href injection when no filePath is supplied', () => {
      const doc = buildHtmlPreviewDocument('<p>Hello</p>');
      expect(doc).toContain('<p>Hello</p>');
      expect(doc).not.toMatch(/<base\b/i);
    });
  });

  describe('resolveLocalResourcePath', () => {
    it('resolves relative resource paths against the HTML file directory', () => {
      expect(resolveLocalResourcePath('/Users/demo/decks/case.html', './assets/deck.js')).toBe(
        '/Users/demo/decks/assets/deck.js',
      );
      expect(resolveLocalResourcePath('/Users/demo/decks/case.html', '../shared/theme.css')).toBe(
        '/Users/demo/shared/theme.css',
      );
      expect(resolveLocalResourcePath('C:\\Users\\demo\\decks\\case.html', 'assets\\deck.js')).toBe(
        'C:\\Users\\demo\\decks\\assets\\deck.js',
      );
    });

    it('does not resolve external, data, anchor, or protocol-relative resource URLs', () => {
      expect(resolveLocalResourcePath('/Users/demo/decks/case.html', 'https://example.test/a.js')).toBeUndefined();
      expect(resolveLocalResourcePath('/Users/demo/decks/case.html', 'data:text/plain,ok')).toBeUndefined();
      expect(resolveLocalResourcePath('/Users/demo/decks/case.html', '#slide-2')).toBeUndefined();
      expect(resolveLocalResourcePath('/Users/demo/decks/case.html', '//example.test/a.js')).toBeUndefined();
    });

    it('returns undefined when filePath is missing', () => {
      expect(resolveLocalResourcePath(undefined, './style.css')).toBeUndefined();
    });
  });

  describe('buildHtmlPreviewDocumentWithLocalResources', () => {
    it('inlines same-directory scripts, stylesheets, images, video and audio before building the iframe document', async () => {
      const reads = new Map<string, Uint8Array>([
        ['/Users/demo/decks/assets/deck.js', new TextEncoder().encode('window.x = 1;')],
        ['/Users/demo/decks/assets/deck.css', new TextEncoder().encode('body { color: red; }')],
        ['/Users/demo/decks/assets/logo.png', new Uint8Array([137, 80, 78, 71])],
        ['/Users/demo/decks/assets/clip.mp4', new Uint8Array([0, 0, 0, 32])],
        ['/Users/demo/decks/assets/clip.mp3', new Uint8Array([255, 251])],
      ]);

      const doc = await buildHtmlPreviewDocumentWithLocalResources(
        [
          '<!doctype html><html><head>',
          '<link rel="stylesheet" href="./assets/deck.css">',
          '<script src="./assets/deck.js"></script>',
          '</head><body>',
          '<img src="./assets/logo.png" alt="Logo">',
          '<video src="./assets/clip.mp4" poster="./assets/logo.png"></video>',
          '<audio src="./assets/clip.mp3"></audio>',
          '</body></html>',
        ].join(''),
        {
          filePath: '/Users/demo/decks/case.html',
          readFile: async (path) => {
            const data = reads.get(path);
            if (!data) throw new Error(`missing fixture: ${path}`);
            return data;
          },
        },
      );

      expect(doc).toContain('<style>body { color: red; }</style>');
      expect(doc).toContain('<script>window.x = 1;</script>');
      expect(doc).toContain('src="data:image/png;base64,iVBORw=="');
      expect(doc).toContain('src="data:video/mp4;base64');
      expect(doc).toContain('src="data:audio/mpeg;base64');
      expect(doc).toContain('poster="data:image/png;base64,iVBORw=="');
      expect(doc).not.toContain('./assets/deck.css');
      expect(doc).not.toContain('./assets/deck.js');
      expect(doc).not.toContain('./assets/logo.png');
    });

    it('keeps unresolved local resources instead of failing the whole preview', async () => {
      const doc = await buildHtmlPreviewDocumentWithLocalResources(
        '<html><head><script src="./missing.js"></script></head><body>x</body></html>',
        {
          filePath: '/Users/demo/decks/case.html',
          readFile: async () => {
            throw new Error('missing');
          },
        },
      );

      expect(doc).toContain('src="./missing.js"');
    });

    it('skips remote resources and leaves their URLs untouched', async () => {
      const doc = await buildHtmlPreviewDocumentWithLocalResources(
        '<html><head><script src="https://cdn.example.test/a.js"></script></head><body>x</body></html>',
        {
          filePath: '/Users/demo/decks/case.html',
          readFile: async () => {
            throw new Error('should not be called for remote URLs');
          },
        },
      );

      expect(doc).toContain('src="https://cdn.example.test/a.js"');
    });

    it('returns source unchanged when no filePath is provided', async () => {
      const source = '<p>Fragment</p>';
      const doc = await buildHtmlPreviewDocumentWithLocalResources(source, {
        readFile: async () => new Uint8Array(),
      });

      expect(doc).toContain('<p>Fragment</p>');
    });
  });
});