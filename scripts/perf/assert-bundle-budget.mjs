import { readLedger, computeExactSizes, compare } from "./_lib.mjs";

const ledger = readLedger();
const sizes = computeExactSizes();
const { deltas, ledgerTotal, currentTotal } = compare(sizes, ledger);

let failed = false;
for (const d of deltas) {
  // untracked/regressed 都算失败:新增文件必须先 capture 登记;rename 对账已放行等价改名
  const mark = d.status === "regressed" || d.status === "untracked" ? "FAIL" : " OK ";
  const line = `${mark}  ${d.status.toUpperCase().padEnd(9)}  ${d.key}  ${d.baseline?.toFixed(2) ?? "—"} → ${d.current?.toFixed(2) ?? "—"} kB${d.delta !== null ? ` (${d.delta > 0 ? "+" : ""}${d.delta.toFixed(2)})` : ""}`;
  console.log(line);
  if (d.status === "regressed" || d.status === "untracked") failed = true;
}

console.log(`\nTotal: ${currentTotal.toFixed(2)} kB (ledger: ${ledgerTotal.toFixed(2)} kB)`);
if (failed) process.exit(1);