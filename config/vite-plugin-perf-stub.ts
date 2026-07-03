/**
 * Production stub for `src/perf/*`.
 *
 * Sprint 0 brings the perf probe, marks, and the editor updateListener
 * hook to measure input-to-paint latency. None of that code should
 * ship in the release bundle — it has no user-facing value, it
 * enlarges the bundle, and it leaks the internal mark namespace.
 *
 * Dev and test modes are unaffected: the plugin is gated to
 * `apply: 'build'`, so vitest sees the real modules and `tauri dev`
 * still wires the updateListener through the real probe. Only
 * `vite build` (which feeds `tauri build` and the CI bundle gate)
 * replaces every `src/perf/*` file with this stub.
 *
 * The stub must export every name that `src/perf/index.ts` re-exports,
 * because the import site (`createMarkdownExtensions.ts`) uses
 * named imports and Rollup will fail the build if a name is missing.
 */

const STUB_SOURCE = `
export class EditorLatencyProbe {
  constructor(_capacity) {}
  record(_ms) {}
  percentile(_p) { return 0; }
  snapshot() { return []; }
  reset() {}
}
export const editorLatencyProbe = new EditorLatencyProbe();
export function mark(_name) {}
export function measure(_name, _start) { return 0; }
export function recordCm6InputToPaint() {}
export async function reportFirstPaint() {}
`;

export function perfStub() {
  return {
    name: 'typola:perf-stub',
    apply: 'build' as const,
    enforce: 'pre' as const,
    transform(_code: string, id: string) {
      // Vite passes absolute paths with forward slashes. The regex
      // matches `src/perf/` as a directory boundary so that
      // coincidental prefixes (e.g. `src/perf-budget.json` — not a
      // module — would not match, though no such file exists).
      if (/\/src\/perf\//.test(id)) {
        return { code: STUB_SOURCE, map: null };
      }
      return null;
    },
  };
}
