/**
 * Bounded ring buffer of latency samples with P50/P99 queries.
 *
 * Designed for editor input latency: a CM6 input event records a
 * sample (time from `mark` to the next `requestAnimationFrame`),
 * tests/Playwright read percentiles on demand.
 *
 * Memory: capped at `maxSamples` (default 1000). Older samples are
 * discarded FIFO, matching the "last N keystrokes" semantics that
 * matter for measuring recent regressions rather than historical drift.
 */
export class EditorLatencyProbe {
  private samples: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 1000) {
    if (maxSamples < 1) {
      throw new Error('maxSamples must be >= 1');
    }
    this.maxSamples = maxSamples;
  }

  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  size(): number {
    return this.samples.length;
  }

  /**
   * Percentile in [0, 100], numpy "type 7" (linear interpolation,
   * matches R/Pandas default). Returns 0 for empty.
   */
  percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    if (p <= 0) return Math.min(...this.samples);
    if (p >= 100) return Math.max(...this.samples);
    const sorted = [...this.samples].sort((a, b) => a - b);
    const rank = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sorted[lower]!;
    const frac = rank - lower;
    return sorted[lower]! * (1 - frac) + sorted[upper]! * frac;
  }

  p50(): number {
    return this.percentile(50);
  }

  p99(): number {
    return this.percentile(99);
  }

  reset(): void {
    this.samples = [];
  }
}
