import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'high-contrast.css'),
  'utf8',
);

describe('high contrast tooltip exceptions', () => {
  it('keeps tooltip labels contrasted against their dark surface', () => {
    expect(stylesheet).toMatch(/\.typola-floating-tooltip[\s\S]*color:\s*var\(--theme-canvas\)\s*!important;/u);
  });
});
