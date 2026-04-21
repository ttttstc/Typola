// @vitest-environment node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildExportDocumentHtml,
  getPdfPrintOptions,
  rewriteHtmlImages,
} from '../electron/export';

const tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typola-export-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('export utils', () => {
  it('copies local images for relative HTML export', () => {
    const workspaceDir = createTempDir();
    const resourcesDir = path.join(workspaceDir, '.resources');
    fs.mkdirSync(resourcesDir, { recursive: true });

    const imagePath = path.join(resourcesDir, 'diagram.png');
    fs.writeFileSync(imagePath, Buffer.from('png-data'));

    const currentFilePath = path.join(workspaceDir, 'note.md');
    const outputPath = path.join(createTempDir(), 'note.html');
    const html = '<p><img src="./.resources/diagram.png" /></p>';

    const rewritten = rewriteHtmlImages(html, currentFilePath, outputPath, 'relative');
    const copiedImagePath = path.join(path.dirname(outputPath), '.resources', 'diagram.png');

    expect(rewritten).toContain('.resources/diagram.png');
    expect(fs.existsSync(copiedImagePath)).toBe(true);
    expect(fs.readFileSync(copiedImagePath, 'utf-8')).toBe('png-data');
  });

  it('embeds local images as base64 when requested', () => {
    const workspaceDir = createTempDir();
    const resourcesDir = path.join(workspaceDir, '.resources');
    fs.mkdirSync(resourcesDir, { recursive: true });

    const imagePath = path.join(resourcesDir, 'diagram.png');
    fs.writeFileSync(imagePath, Buffer.from('png-data'));

    const currentFilePath = path.join(workspaceDir, 'note.md');
    const outputPath = path.join(createTempDir(), 'note.html');
    const html = '<p><img src="./.resources/diagram.png" /></p>';

    const rewritten = rewriteHtmlImages(html, currentFilePath, outputPath, 'base64');

    expect(rewritten).toContain('data:image/png;base64,');
  });

  it('prepares print HTML with CSS-driven page settings', () => {
    const documentHtml = buildExportDocumentHtml('Doc', '<pre><code>code</code></pre>', 'light', {
      forPrint: true,
      pageSize: 'Letter',
      margin: 'wide',
    });

    expect(documentHtml).toContain('@page');
    expect(documentHtml).toContain('size: Letter;');
    expect(documentHtml).toContain('margin: 24mm;');
    expect(documentHtml).toContain('page-break-inside: auto;');
  });

  it('uses CSS page margins instead of Electron margins', () => {
    const options = getPdfPrintOptions({
      pageSize: 'A4',
      margin: 'normal',
      printBackground: true,
      displayHeaderFooter: false,
    });

    expect(options.pageSize).toBe('A4');
    expect(options.printBackground).toBe(true);
    expect(options.margins).toEqual({ marginType: 'none' });
  });
});
