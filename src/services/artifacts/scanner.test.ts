import { describe, expect, it } from 'vitest';
import { createArtifactManifest } from './manifest';
import { filterArtifacts, parseArtifactTime } from './scanner';
import type { ArtifactRecord } from './types';

function record(path: string, options: {
  conversationId?: string;
  documentPath?: string;
  updatedAt: string;
}): ArtifactRecord {
  const manifest = createArtifactManifest({
    primaryFile: path,
    conversationId: options.conversationId,
    documentPath: options.documentPath,
    sourceType: 'flow_generation',
  });
  manifest.updatedAt = options.updatedAt;
  return { manifest, legacy: false };
}

describe('artifact scanner helpers', () => {
  it('parses both ISO and millisecond timestamps', () => {
    expect(parseArtifactTime('2026-06-27T10:00:00.000Z')).toBe(Date.parse('2026-06-27T10:00:00.000Z'));
    expect(parseArtifactTime('1782554400000')).toBe(1782554400000);
    expect(parseArtifactTime('not-a-date')).toBe(0);
  });

  it('sorts records with legacy millisecond timestamps newest first', () => {
    const older = record('C:/work/.typola-output/a/old.md', {
      conversationId: 'a',
      updatedAt: '2026-06-26T10:00:00.000Z',
    });
    const newer = record('C:/work/.typola-output/a/new.md', {
      conversationId: 'a',
      updatedAt: String(Date.parse('2026-06-27T10:00:00.000Z')),
    });

    const result = filterArtifacts([older, newer], 'session', { conversationId: 'a' });

    expect(result.map((item) => item.manifest.primaryFile)).toEqual([
      'C:/work/.typola-output/a/new.md',
      'C:/work/.typola-output/a/old.md',
    ]);
  });

  it('filters by active session while all mode keeps every artifact', () => {
    const docA = 'C:/docs/a.md';
    const docB = 'C:/docs/b.md';
    const records = [
      record('C:/work/.typola-output/a/one.md', { conversationId: 'conv-a', documentPath: docA, updatedAt: '1' }),
      record('C:/work/.typola-output/b/two.md', { conversationId: 'conv-b', documentPath: docB, updatedAt: '2' }),
    ];

    expect(filterArtifacts(records, 'session', { conversationId: 'conv-a' })).toHaveLength(1);
    expect(filterArtifacts(records, 'all', {})).toHaveLength(2);
  });
});
