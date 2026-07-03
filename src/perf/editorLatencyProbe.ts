/**
 * Latency samples for the editor input → paint probe.
 *
 * Sprint 0 only needs to capture a small number of samples per
 * measurement session (a fixture run, a Playwright scenario) and
 * read a percentile. We keep this intentionally tiny: no ring
 * buffer, no reset, no public `size()`. The number of samples is
 * bounded by the session length, which is small.
 *
 * `percentile(p)` uses numpy "type 7" linear interpolation so the
 * numbers are comparable to what R / Pandas / numpy default to.
 */
export class EditorLatencyProbe {
  private samples: number[] = [];

  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
  }

  /**
   * Percentile in [0, 100]. Returns 0 for an empty probe.
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
}
