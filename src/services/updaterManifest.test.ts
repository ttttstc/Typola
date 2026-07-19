import { describe, expect, it } from 'vitest';
import { createWindowsManifest, selectNsisSignature } from '../../scripts/create-updater-manifest.mjs';

describe('Windows updater manifest', () => {
  it('selects the single signed NSIS setup executable', () => {
    expect(selectNsisSignature([
      'bundle/msi/Typola.msi.sig',
      'bundle/nsis/Typola_2.0.6_x64-setup.exe.sig',
    ])).toContain('setup.exe.sig');
    expect(() => selectNsisSignature([])).toThrow(/exactly one/);
  });

  it('creates a strict windows-x86_64 manifest', () => {
    const manifest = createWindowsManifest({
      version: '2.0.6',
      notes: 'Typola 2.0.6',
      signature: ' signed-value\n',
      assetName: 'Typola_2.0.6_x64-setup.exe',
      publishedAt: '2026-07-19T00:00:00.000Z',
    });
    expect(manifest.platforms['windows-x86_64']).toEqual({
      signature: 'signed-value',
      url: 'https://github.com/ttttstc/Typola/releases/download/v2.0.6/Typola_2.0.6_x64-setup.exe',
    });
  });

  it('rejects prerelease versions and empty signatures', () => {
    const base = {
      notes: 'notes',
      assetName: 'Typola-setup.exe',
      publishedAt: '2026-07-19T00:00:00.000Z',
    };
    expect(() => createWindowsManifest({ ...base, version: '2.1.0-beta.1', signature: 'sig' }))
      .toThrow(/stable release/);
    expect(() => createWindowsManifest({ ...base, version: '02.1.0', signature: 'sig' }))
      .toThrow(/stable release/);
    expect(() => createWindowsManifest({ ...base, version: '2.1.0', signature: ' ' }))
      .toThrow(/empty/);
  });
});
