#!/usr/bin/env node
import { groupByKey, loadLedger } from './_lib.mjs';

const ledger = loadLedger();
const current = groupByKey();

const rows = [];
for (const [key, ledgerSize] of Object.entries(ledger.chunks)) {
  const cur = current[key];
  const curSize = cur ? cur.size : 0;
  const delta = curSize - ledgerSize;
  rows.push({ key, ledger: ledgerSize, current: curSize, delta });
}
for (const [key, info] of Object.entries(current)) {
  if (!(key in ledger.chunks)) {
    rows.push({ key, ledger: 0, current: info.size, delta: info.size });
  }
}

rows.sort((a, b) => b.current - a.current);

const fmt = (n) => n.toFixed(2);

console.log(`# Bundle Size Report (${ledger.gitSha.slice(0, 7)} @ ${ledger.capturedAt})`);
console.log('');
console.log('| Chunk | Ledger (kB) | Current (kB) | Delta (kB) |');
console.log('|---|---:|---:|---:|');
for (const r of rows) {
  if (r.current < 0.5 && r.ledger < 0.5) continue;
  const deltaStr = r.delta >= 0 ? `+${fmt(r.delta)}` : fmt(r.delta);
  console.log(`| \`${r.key}\` | ${fmt(r.ledger)} | ${fmt(r.current)} | ${deltaStr} |`);
}
console.log('');
console.log(`_Total: ${fmt(rows.reduce((a, r) => a + r.current, 0))} kB (ledger: ${fmt(Object.values(ledger.chunks).reduce((a, v) => a + v, 0))} kB)_`);
