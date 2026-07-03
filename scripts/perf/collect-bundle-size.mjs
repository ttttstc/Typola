import { computeSizes, readLedger, compare } from "./_lib.mjs";

const ledger = readLedger();
const sizes = computeSizes();
const { deltas, ledgerTotal, currentTotal } = compare(sizes, ledger);

console.log("| chunk | before (kB) | after (kB) | delta (kB) |");
console.log("| --- | ---: | ---: | ---: |");
for (const d of deltas) {
  const b = d.baseline?.toFixed(2) ?? "—";
  const c = d.current?.toFixed(2) ?? "—";
  const delta = d.delta !== null ? `${d.delta > 0 ? "+" : ""}${d.delta.toFixed(2)}` : "—";
  console.log(`| ${d.key} | ${b} | ${c} | ${delta} |`);
}
console.log(`| **Total** | **${ledgerTotal.toFixed(2)}** | **${currentTotal.toFixed(2)}** | **${(currentTotal - ledgerTotal).toFixed(2)}** |`);