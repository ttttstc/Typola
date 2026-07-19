import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  assertReleaseTag,
  assertReleaseVersionChanged,
  assertStableVersion,
  synchronizeVersionText,
} from '../../scripts/sync-version.mjs';

describe('release version synchronization', () => {
  it('accepts stable versions only', () => {
    expect(assertStableVersion('2.0.6')).toBe('2.0.6');
    expect(() => assertStableVersion('v2.0.6')).toThrow(/without a leading v/);
    expect(() => assertStableVersion('2.0')).toThrow(/stable SemVer/);
    expect(() => assertStableVersion('2.1.0-beta.1')).toThrow(/stable SemVer/);
    expect(() => assertStableVersion('02.0.6')).toThrow(/stable SemVer/);
  });

  it('updates both package-lock version fields', () => {
    const source = `{
  "name": "typola",
  "version": "2.0.4",
  "packages": {
    "": {
      "name": "typola",
      "version": "2.0.4",
      "dependencies": {}
    }
  }
}`;
    const synchronized = synchronizeVersionText('package-lock.json', source, '2.0.6');
    expect(synchronized.match(/2\.0\.6/g)).toHaveLength(2);
    expect(synchronized).not.toContain('2.0.4');
  });

  it('requires the exact v-prefixed release tag', () => {
    expect(() => assertReleaseTag('v2.0.6', '2.0.6')).not.toThrow();
    expect(() => assertReleaseTag('2.0.6', '2.0.6')).toThrow(/must equal/);
    expect(() => assertReleaseTag('v2.0.7', '2.0.6')).toThrow(/must equal/);
  });

  it('requires the release commit to change VERSION', () => {
    expect(() => assertReleaseVersionChanged('2.0.5', '2.0.6')).not.toThrow();
    expect(() => assertReleaseVersionChanged('2.0.6', '2.0.6')).toThrow(/unchanged/);
  });

  it('syncs derived versions inside release workflows', async () => {
    const [tagWorkflow, packageWorkflow] = await Promise.all([
      readFile('.github/workflows/release.yml', 'utf8'),
      readFile('.github/workflows/package.yml', 'utf8'),
    ]);
    expect(tagWorkflow).toContain('node scripts/sync-version.mjs --tag "${{ github.ref_name }}"');
    expect(tagWorkflow).toContain('--require-version-change "HEAD^"');
    expect(packageWorkflow).toContain('node scripts/sync-version.mjs --tag "v${{ inputs.version }}"');
    expect(packageWorkflow).toContain('--require-version-change "HEAD^"');
  });

  it('keeps the local Tauri build independent from VERSION', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['tauri:build:local']).not.toMatch(/version:(sync|check)/);
    expect(packageJson.scripts['tauri:build:local']).toMatch(/createUpdaterArtifacts\\":false/);
  });
});
