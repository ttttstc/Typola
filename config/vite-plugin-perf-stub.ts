import type { Plugin } from "vite";

const PERF_MODULES = ["src/perf/index.ts"];

export function perfStub(): Plugin {
  return {
    name: "perf-stub",
    apply: "build",
    resolveId(id) {
      if (PERF_MODULES.some((m) => id.endsWith(m))) return "\0perf-stub";
      return undefined;
    },
    load(id) {
      if (id === "\0perf-stub") return "export function recordCm6InputToPaint(){}\nexport function getCm6Latency(){return null}\nexport function resetCm6Latency(){}";
      return undefined;
    },
  };
}