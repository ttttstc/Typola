import { describe, expect, it } from 'vitest';
import type { ArtifactRecord } from './types';
import { filterArtifactRecords } from './scanner';

const records: ArtifactRecord[] = [
  {
    path: 'C:/work/.typola-output/conv-a/a.md',
    name: 'a.md',
    ts: 3,
    kind: 'markdown',
    status: 'ready',
    legacy: false,
    manifest: {
      version: 1,
      id: 'a',
      title: 'a.md',
      kind: 'markdown',
      status: 'ready',
      createdAt: '',
      updatedAt: '',
      source: { conversationId: 'conv-a', documentPath: 'C:/work/doc.md' },
      files: [],
      actions: [],
    },
  },
  {
    path: 'C:/work/.typola-output/conv-b/b.html',
    name: 'b.html',
    ts: 2,
    kind: 'html',
    status: 'partial',
    legacy: false,
    manifest: {
      version: 1,
      id: 'b',
      title: 'b.html',
      kind: 'html',
      status: 'partial',
      createdAt: '',
      updatedAt: '',
      source: { conversationId: 'conv-b' },
      files: [],
      actions: [],
    },
  },
];

describe('filterArtifactRecords', () => {
  it('filters by session, document, kind, status and query', () => {
    expect(filterArtifactRecords(records, 'session', { conversationId: 'conv-a' }).map((r) => r.name)).toEqual(['a.md']);
    expect(filterArtifactRecords(records, 'document', { documentPath: 'C:/work/doc.md' }).map((r) => r.name)).toEqual(['a.md']);
    expect(filterArtifactRecords(records, 'all', { kind: 'html', status: 'partial', query: 'b.' }).map((r) => r.name)).toEqual(['b.html']);
  });
});
