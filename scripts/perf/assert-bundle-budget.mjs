#!/usr/bin/env node
import fs from 'node:fs';
import { groupByKey, loadLedger, buildProject, compareToLedger } from './_lib.mjs';

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');

if (!skipBuild) {
  buildProject();
}

if (!fs.existsSync('dist/assets')) {
  console.error('dist/assets not found. Run npm run build first.');
  process.exit(1);
}

const ledger = loadLedger();
const current = groupByKey();
const { regressions, rows, untracked } = compareToLedger(current, ledger);

console.error(`\n=== Bundle Budget Check ===`);
console.error(`Ledger: ${ledger.gitSha.slice(0, 7)} (${ledger.capturedAt})`);
console.error(`Source: ${ledger.source}\n`);

const sorted = [...rows].sort((a, b) => b.ledger - a.ledger);
const fmt = (n) => n.toFixed(2).padStart(8);
for (const r of sorted) {
  if (r.ledger < 0.5 && r.current < 0.5) continue;
  const flag = r.missing ? 'MISSING' : r.delta > 0 ? '!! REGRESSION' : 'ok';
  const deltaStr = r.delta >= 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2);
  console.error(`  ${r.key.padEnd(42)} ${fmt(r.ledger)} -> ${fmt(r.current)}  (${deltaStr} kB)  ${flag}`);
}

if (untracked.length > 0) {
  console.error(`\nUntracked dist chunks (not in ledger):`);
  for (const u of untracked) {
    console.error(`  ${u.key.padEnd(42)} ${fmt(u.size)} kB  (new)`);
  }
}

if (regressions.length > 0) {
  console.error(`\n${regressions.length} chunk(s) regressed beyond ledger budget.`);
  for (const r of regressions) {
    console.error(`  ${r.key}: ${r.ledger.toFixed(2)} -> ${r.current.toFixed(2)} (+${r.delta.toFixed(2)} kB)`);
  }
  process.exit(1);
}

console.error(`\nAll chunks within budget.`);
