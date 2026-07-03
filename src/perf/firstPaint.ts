/**
 * First-paint reporting.
 *
 * Calls `performance.getEntriesByType('paint')` and emits the
 * `first-paint` entry's `startTime` (ms since navigationStart) as
 * a `typola://first-paint` Tauri event. The backend can listen for
 * it; e2e tests can `await listen('typola://first-paint', ...)`.
 *
 * Call exactly once after the document is interactive — calling
 * from `main.tsx` after `createRoot(...).render(...)` is fine.
 *
 * Note: this module lives under `src/perf/`, so the prod build
 * stub in `config/vite-plugin-perf-stub.ts` replaces it with a
 * no-op. The first-paint baseline is therefore captured in dev
 * (`tauri dev`) or via e2e (Playwright reads
 * `performance.getEntriesByType('paint')` directly off the
 * release webview).
 */
import { emit } from '@tauri-apps/api/event';

export async function reportFirstPaint(): Promise<void> {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return;
  }
  const entries = performance.getEntriesByType('paint');
  const first = entries.find((e) => e.name === 'first-paint') ?? entries[0];
  if (!first) return;
  const costMs = first.startTime;
  try {
    await emit('typola://first-paint', costMs);
  } catch {
    // Outside Tauri (e.g. `vite dev` in a plain browser tab) emit
    // is unavailable. The number is still observable via
    // `performance.getEntriesByType('paint')` for any consumer.
  }
}
