/**
 * Typed wrappers around `performance.mark` / `performance.measure`.
 *
 * The marks are the contract between the editor (which calls `mark`)
 * and any consumer that wants to read the latency (tests, dashboards,
 * Playwright via `page.evaluate(() => performance.getEntriesByType(...))`).
 *
 * Mark names are constrained to a string-literal union so a typo at
 * a call site becomes a compile error rather than a silent orphan entry.
 */

export type MarkName = 'cm6-input';

const VALID: ReadonlySet<string> = new Set<MarkName>(['cm6-input']);

function hasPerformance(): boolean {
  return typeof performance !== 'undefined' && typeof performance.mark === 'function';
}

export function mark(name: MarkName): void {
  if (!hasPerformance()) return;
  if (!VALID.has(name)) {
    throw new Error(`Unknown mark name: ${name}`);
  }
  performance.mark(name);
}

/**
 * Measure from the named start mark to now, return duration in ms.
 * Clears the measure and the start mark to keep `performance.getEntries`
 * bounded. Multiple marks with the same name in a frame collapse to the
 * oldest one; that is acceptable for input-latency measurement because
 * the worst-case in a frame is what the user perceives.
 */
export function measure(measureName: string, startMark: MarkName): number {
  if (!hasPerformance()) return 0;
  if (!VALID.has(startMark)) {
    throw new Error(`Unknown start mark: ${startMark}`);
  }
  performance.measure(measureName, startMark);
  const entries = performance.getEntriesByName(measureName, 'measure');
  const last = entries[entries.length - 1];
  const duration = last?.duration ?? 0;
  performance.clearMeasures(measureName);
  performance.clearMarks(startMark);
  return duration;
}
