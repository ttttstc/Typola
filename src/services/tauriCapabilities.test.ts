import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tauri capabilities', () => {
  it('allows custom titlebar window interactions used by the toolbar', () => {
    const capability = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
    ) as { permissions?: string[] };

    expect(capability.permissions).toEqual(expect.arrayContaining([
      'core:window:allow-set-title',
      'core:window:allow-start-dragging',
      'core:window:allow-toggle-maximize',
    ]));
  });

  it('keeps local HTML presentation resources inside the desktop CSP', () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { app?: { security?: { csp?: string } } };

    const csp = config.app?.security?.csp ?? '';

    expect(csp).toContain("script-src 'self' 'unsafe-eval'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
    // img-src 放行:本地图(asset/asset.localhost)+ 网络图(https/http)+ 粘贴(data/blob)。
    expect(csp).toContain("img-src 'self'");
    expect(csp).toContain('asset:');
    expect(csp).toContain('asset.localhost');
    expect(csp).toMatch(/img-src[^;]*\bhttps:\s/);
    expect(csp).toContain("frame-src 'self' data: blob:");
    expect(csp).toContain("connect-src 'self'");
  });

  it('keeps filesystem access scoped to user document locations and dialog-granted paths', () => {
    const capability = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
    ) as { permissions?: Array<string | { identifier?: string; allow?: string[] }> };

    const permissions = capability.permissions ?? [];
    expect(permissions).not.toContain('fs:default');
    expect(permissions).toEqual(expect.arrayContaining([
      'fs:allow-read-file',
      'fs:allow-write-file',
      'fs:allow-read-dir',
      'fs:allow-mkdir',
      'fs:allow-stat',
    ]));
    expect(permissions).toContainEqual(expect.objectContaining({
      identifier: 'fs:scope',
      allow: expect.arrayContaining([
        '$DOCUMENT/**',
        '$DOWNLOAD/**',
        '$DESKTOP/**',
        '$HOME/**/.typola-output/**',
      ]),
    }));
  });

  it('declares desktop file associations for documents Typola can open directly', () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as {
      bundle?: {
        fileAssociations?: Array<{ ext?: string[]; description?: string; mimeType?: string }>;
      };
    };

    const associations = config.bundle?.fileAssociations ?? [];

    expect(associations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        description: 'Markdown document',
        ext: expect.arrayContaining(['md', 'markdown']),
        mimeType: 'text/markdown',
      }),
      expect.objectContaining({
        description: 'HTML document',
        ext: expect.arrayContaining(['html', 'htm']),
        mimeType: 'text/html',
      }),
      expect.objectContaining({
        description: 'Word document',
        ext: expect.arrayContaining(['docx']),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ]));

    for (const association of associations) {
      expect(association.description ?? '').toMatch(/^[\x20-\x7E]+$/);
    }
  });
});
