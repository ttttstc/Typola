import { describe, expect, it } from 'vitest';
import { createArtifactManifest, inferArtifactKind, inferConversationId, manifestPathForArtifact } from './manifest';
import { recoverArtifactOutput } from './recover';

describe('artifact manifest helpers', () => {
  it('infers kinds from Typola artifact names', () => {
    expect(inferArtifactKind('C:/w/.typola-output/conv/a.ai改2.md')).toBe('revision');
    expect(inferArtifactKind('C:/w/.typola-output/conv/page.html')).toBe('html');
    expect(inferArtifactKind('C:/w/.typola-output/conv/note.md')).toBe('markdown');
  });

  it('creates parseable manifest with conversation and actions', () => {
    const manifest = createArtifactManifest({
      artifactPath: 'C:/work/.typola-output/conv-1/draft.ai改1.md',
      documentPath: 'C:/work/source.md',
      provider: 'claude',
      model: 'sonnet',
      toolName: 'Write',
      now: new Date('2026-06-29T00:00:00.000Z'),
    });
    expect(manifest.source.conversationId).toBe('conv-1');
    expect(manifest.source.documentPath).toBe('C:/work/source.md');
    expect(manifest.kind).toBe('revision');
    expect(manifest.actions).toContain('compareWithCurrent');
    expect(JSON.parse(JSON.stringify(manifest)).id).toMatch(/^artifact-/u);
  });

  it('uses stable sidecar path without moving flat outputs', () => {
    expect(manifestPathForArtifact('C:/work/.typola-output/conv/deck.html')).toBe('C:/work/.typola-output/conv/deck.html.artifact.json');
    expect(inferConversationId('C:/work/.typola-output/conv/deck.html')).toBe('conv');
  });

  it('recovers fenced html output', () => {
    const recovered = recoverArtifactOutput('```html\n<html><body>ok</body></html>\n```');
    expect(recovered.kind).toBe('html');
    expect(recovered.content).toContain('<html>');
    expect(recovered.partial).toBe(false);
  });
});
