import { describe, expect, it } from 'vitest';
import { EditorLatencyProbe } from './editorLatencyProbe';

describe('EditorLatencyProbe', () => {
  it('returns 0 for an empty probe', () => {
    const p = new EditorLatencyProbe();
    expect(p.percentile(50)).toBe(0);
    expect(p.percentile(99)).toBe(0);
  });

  it('records samples and reports percentiles (numpy type-7)', () => {
    const p = new EditorLatencyProbe();
    for (let i = 1; i <= 100; i++) p.record(i);
    // Linear-interp: p50 of 1..100 = 50.5, p99 ~ 99.01
    expect(p.percentile(50)).toBeCloseTo(50.5, 5);
    expect(p.percentile(99)).toBeCloseTo(99.01, 5);
  });

  it('ignores invalid samples', () => {
    const p = new EditorLatencyProbe();
    p.record(Number.NaN);
    p.record(-1);
    p.record(Number.POSITIVE_INFINITY);
    p.record(5);
    expect(p.percentile(50)).toBe(5);
  });
});
