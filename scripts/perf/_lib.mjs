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
  // Strip every trailing hash-like segment. A hash segment is 8-16
  // alphanumeric/underscore chars preceded by `-`. Rolldown's default
  // content hash is 8 chars; double-hash chunks (8+8) are handled by
  // repeated stripping. The 8-char lower bound is chosen so that
  // legitimate 6-char name segments like `vendor` in `docx-vendor`
  // are NOT misclassified as a hash and stripped.
  const hashSegment = /-(?:[A-Za-z0-9_]{8,16})$/;
  let result = base;
  let m;
  while ((m = result.match(hashSegment))) {
    const candidate = result.slice(0, -m[0].length);
    if (candidate.length === 0) break;
    result = candidate;
  }
  return result;
}

function groupByKey(dir = DIST) {
  const groups = new Map();
  for (const f of readAllJs(dir)) {
    const buf = fs.readFileSync(path.join(dir, f));
    const gz = zlib.gzipSync(buf).length;
    const name = logicalName(f);
    const prev = groups.get(name) || { size: 0 };
    groups.set(name, { size: prev.size + gz });
  }
  const out = {};
  for (const [k, v] of groups.entries()) {
    out[`${k}-*.js`] = { size: Math.round((v.size / 1024) * 100) / 100 };
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
