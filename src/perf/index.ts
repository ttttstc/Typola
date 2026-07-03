const samples: number[] = [];
const MAX = 500;

export function recordCm6InputToPaint() {
  try {
    performance.mark("cm6-input");
  } catch {
    return; /* noop outside browser */
  }
  requestAnimationFrame(() => {
    try {
      const m = performance.measure("cm6-to-paint", "cm6-input");
      samples.push(m.duration);
      if (samples.length > MAX) samples.shift();
      performance.clearMarks("cm6-input");
      performance.clearMeasures("cm6-to-paint");
    } catch {
      /* mark may be cleared in test environments */
    }
  });
}

export function getCm6Latency(): { p50: number; p99: number; n: number } | null {
  if (samples.length < 2) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p99 = percentile(sorted, 0.99);
  return { p50, p99, n: samples.length };
}

function percentile(sorted: number[], q: number): number {
  const n = sorted.length;
  const idx = q * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

export function resetCm6Latency() {
  samples.length = 0;
}