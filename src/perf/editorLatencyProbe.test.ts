import { describe, expect, it } from 'vitest';
import { EditorLatencyProbe } from './editorLatencyProbe';

describe('EditorLatencyProbe', () => {
  it('returns 0 for empty percentiles', () => {
    const p = new EditorLatencyProbe();
    expect(p.size()).toBe(0);
    expect(p.p50()).toBe(0);
    expect(p.p99()).toBe(0);
  });

  it('records samples and reports p50/p99', () => {
    const p = new EditorLatencyProbe();
    for (let i = 1; i <= 100; i++) p.record(i);
    expect(p.size()).toBe(100);
    // Linear-interp: p50 of 1..100 = 50.5, p99 ~ 99.01
    expect(p.p50()).toBeCloseTo(50.5, 5);
    expect(p.p99()).toBeCloseTo(99.01, 5);
  });

  it('caps at maxSamples (FIFO drop)', () => {
    const p = new EditorLatencyProbe(5);
    for (let i = 1; i <= 10; i++) p.record(i);
    expect(p.size()).toBe(5);
    // last 5 samples: 6, 7, 8, 9, 10
    expect(p.p50()).toBe(8);
  });

  it('ignores invalid samples', () => {
    const p = new EditorLatencyProbe();
    p.record(Number.NaN);
    p.record(-1);
    p.record(Number.POSITIVE_INFINITY);
    p.record(5);
    expect(p.size()).toBe(1);
    expect(p.p50()).toBe(5);
  });

  it('reset clears all samples', () => {
    const p = new EditorLatencyProbe();
    p.record(1);
    p.record(2);
    p.reset();
    expect(p.size()).toBe(0);
    expect(p.p50()).toBe(0);
  });
});
