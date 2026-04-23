import { describe, expect, it } from 'vitest';
import { computeDocStats } from '../src/shared/docStats';

describe('computeDocStats', () => {
  it('returns zeros for an empty string', () => {
    expect(computeDocStats('')).toEqual({
      characters: 0,
      charactersNoSpace: 0,
      words: 0,
      lines: 0,
    });
  });

  it('counts ASCII words and characters', () => {
    const stats = computeDocStats('Hello world!\nFoo bar baz');
    expect(stats.characters).toBe(24);
    expect(stats.charactersNoSpace).toBe(20);
    expect(stats.words).toBe(5);
    expect(stats.lines).toBe(2);
  });

  it('treats each CJK ideograph as one word', () => {
    const stats = computeDocStats('你好 世界');
    expect(stats.words).toBe(4);
    expect(stats.characters).toBe(5);
  });

  it('handles mixed CJK and ASCII', () => {
    const stats = computeDocStats('Hello 世界 foo');
    expect(stats.words).toBe(4);
  });

  it('counts trailing newline as an extra line', () => {
    expect(computeDocStats('a\nb\n').lines).toBe(3);
  });
});
