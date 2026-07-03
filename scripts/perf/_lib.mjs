import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = "dist/assets";
const EXT_RE = /\.(js|css|ttf|woff2?)$/;

/** Strip 8-16 char hex hash + optional prefix dash to produce a glob key. */
export function logicalName(filename) {
  const base = filename.replace(/\.(js|css|ttf|woff2?)$/, "");
  return (
    base.replace(/-?[0-9a-f]{8,16}/g, "*") +
    filename.slice(filename.lastIndexOf("."))
  );
}

export function gzipKb(buf) {
  return gzipSync(buf).length / 1024;
}

export function readLedger(path = "perf-budget.json") {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeLedger(ledger, path = "perf-budget.json") {
  writeFileSync(path, JSON.stringify(ledger, null, 2) + "\n");
}

export function computeSizes(dir = ASSETS) {
  const files = readdirSync(dir).filter((f) => EXT_RE.test(f));
  const result = {};
  for (const name of files) {
    const key = logicalName(name);
    const buf = readFileSync(join(dir, name));
    result[key] = (result[key] || 0) + gzipKb(buf);
  }
  // round to 2 decimals so ledger comparison is stable
  for (const key of Object.keys(result)) {
    result[key] = Math.round(result[key] * 100) / 100;
  }
  return result;
}

function ledgerEntries(ledger) {
  return Object.entries(ledger).filter(
    ([, v]) => typeof v === "number",
  );
}

export function compare(sizes, ledger) {
  const leds = Object.fromEntries(ledgerEntries(ledger));
  const ledgerTotal = Object.values(leds).reduce((a, b) => a + b, 0);
  const currentTotal = Object.values(sizes).reduce((a, b) => a + b, 0);
  const deltas = [];

  for (const [key, current] of Object.entries(sizes)) {
    const baseline = leds[key];
    if (baseline === undefined) {
      deltas.push({ key, baseline: null, current, delta: null, status: "untracked" });
    } else {
      const diff = current - baseline;
      // tolerance for floating-point rounding at 0.01 kB
      const status = diff > 0.005 ? "regressed" : diff < -0.005 ? "improved" : "ok";
      deltas.push({ key, baseline, current, delta: Math.round(diff * 100) / 100, status });
    }
  }

  for (const [key, baseline] of Object.entries(leds)) {
    if (sizes[key] === undefined) {
      deltas.push({ key, baseline, current: null, delta: null, status: "removed" });
    }
  }

  return { deltas, ledgerTotal, currentTotal };
}