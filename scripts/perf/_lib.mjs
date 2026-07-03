import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';

const DIST = 'dist/assets';

function readAllJs(dir = DIST) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
}

function gzipSize(filePath) {
  const buf = fs.readFileSync(filePath);
  return zlib.gzipSync(buf).length;
}

function logicalName(filename) {
  const base = filename.replace(/\.js$/, '');
  const m = base.match(/^(.+?)-[A-Za-z0-9_]{8}(?:-[A-Za-z0-9_]{8})?$/);
  return m ? m[1] : base;
}

function groupByKey(dir = DIST) {
  const groups = new Map();
  for (const f of readAllJs(dir)) {
    const buf = fs.readFileSync(path.join(dir, f));
    const gz = zlib.gzipSync(buf).length;
    const base = f.replace(/\.js$/, '');
    const m = base.match(/^(.+?)-[A-Za-z0-9_]{8}(?:-[A-Za-z0-9_]{8})?$/);
    const name = m ? m[1] : base;
    const prev = groups.get(name) || { size: 0, matched: !!m };
    groups.set(name, { size: prev.size + gz, matched: prev.matched && !!m });
  }
  const out = {};
  for (const [k, v] of groups.entries()) {
    const key = v.matched ? `${k}-*.js` : `${k}.js`;
    out[key] = { size: Math.round((v.size / 1024) * 100) / 100, matched: v.matched };
  }
  return out;
}

function loadLedger(ledgerPath = 'perf-budget.json') {
  if (!fs.existsSync(ledgerPath)) {
    throw new Error(`Ledger not found: ${ledgerPath}. Run scripts/perf/collect-bundle-size.mjs first.`);
  }
  return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
}

function buildProject() {
  console.error('Running npm run build...');
  execSync('npm run build', { stdio: 'inherit' });
}

function compareToLedger(current, ledger) {
  const regressions = [];
  const rows = [];
  for (const [key, ledgerSize] of Object.entries(ledger.chunks)) {
    const cur = current[key];
    const curSize = cur ? cur.size : 0;
    const delta = curSize - ledgerSize;
    rows.push({ key, ledger: ledgerSize, current: curSize, delta, missing: !cur });
    if (curSize > ledgerSize) {
      regressions.push({ key, ledger: ledgerSize, current: curSize, delta });
    }
  }
  const untracked = [];
  for (const [key, info] of Object.entries(current)) {
    if (!(key in ledger.chunks)) {
      untracked.push({ key, size: info.size });
    }
  }
  return { regressions, rows, untracked };
}

export { readAllJs, gzipSize, logicalName, groupByKey, loadLedger, buildProject, compareToLedger };
