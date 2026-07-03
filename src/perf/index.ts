/**
 * Public surface of `src/perf/`. Editor code imports `recordCm6InputToPaint`;
 * tests import `editorLatencyProbe` and `EditorLatencyProbe` directly.
 *
 * Recording is a no-op when `requestAnimationFrame` is unavailable
 * (jsdom in some test paths, or SSR), so the editor can call it
 * unconditionally without crashing the host.
 */
import { EditorLatencyProbe } from './editorLatencyProbe';
import { mark, measure } from './marks';

export { EditorLatencyProbe } from './editorLatencyProbe';
export { mark, measure, type MarkName } from './marks';

export const editorLatencyProbe = new EditorLatencyProbe();

export function recordCm6InputToPaint(): void {
  mark('cm6-input');
  if (typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(() => {
    try {
      const ms = measure('cm6-input-paint', 'cm6-input');
      editorLatencyProbe.record(ms);
    } catch {
      // Mark was already cleared (e.g. by a concurrent sample or
      // test cleanup). Skipping is the correct behavior — we just
      // don't have a latency sample for this frame.
    }
  });
}
