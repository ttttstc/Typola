import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('generated theme CSS', () => {
  it('stays in sync with the theme registry', () => {
    const result = spawnSync(process.execPath, ['scripts/build-themes.mjs', '--check'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
