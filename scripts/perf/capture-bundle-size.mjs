import { existsSync } from "node:fs";
import { computeSizes, readLedger, writeLedger } from "./_lib.mjs";

let ledger = {};
if (existsSync("perf-budget.json")) {
  ledger = readLedger();
}

const sizes = computeSizes();
const now = new Date().toISOString().slice(0, 16).replace("T", " ");

const out = { ...ledger };
for (const [key, kb] of Object.entries(sizes)) {
  out[key] = Math.round(kb * 100) / 100;
}
out._meta = { ...(out._meta || {}), capturedAt: now, source: "npm run build" };

writeLedger(out);
console.log(`perf-budget.json captured (${Object.keys(sizes).length} keys)`);