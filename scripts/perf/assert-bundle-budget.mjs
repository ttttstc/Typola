import { readLedger, computeSizes, compare } from "./_lib.mjs";

const ledger = readLedger();
const sizes = computeSizes();
const { deltas, ledgerTotal, currentTotal } = compare(sizes, ledger);

let failed = false;
for (const d of deltas) {
  const line = `${d.status === "regressed" ? "FAIL" : " OK "}  ${d.key}  ${d.baseline?.toFixed(2) ?? "—"} → ${d.current?.toFixed(2) ?? "—"} kB${d.delta !== null ? ` (${d.delta > 0 ? "+" : ""}${d.delta.toFixed(2)})` : ""}`;
  console.log(line);
  if (d.status === "regressed") failed = true;
}

console.log(`\nTotal: ${currentTotal.toFixed(2)} kB (ledger: ${ledgerTotal.toFixed(2)} kB)`);
if (failed) process.exit(1);