#!/usr/bin/env node
// Capture a fresh bundle-size ledger from the current `dist/assets/`.
// Used to re-baseline after legitimate changes that move the chunk
// landscape (hash format changes, library upgrades). Compare
// `assert-bundle-budget.mjs` is the reader; this is the writer.
//
// Usage:
//   npm run build && node scripts/perf/capture-bundle-size.mjs
//
// Output: rewrites `perf-budget.json` at the repo root with the
// current chunk sizes, `gitSha`, and `capturedAt`. Total is the
// sum of every tracked chunk's gzip kB.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { groupByKey } from './_lib.mjs';

const ledger = groupByKey();
const chunks = Object.fromEntries(
  Object.entries(ledger).map(([key, info]) => [key, info.size]),
);
const total = Object.values(chunks).reduce((a, b) => a + b, 0);
const capturedAt = new Date().toISOString();
const gitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const doc = {
  capturedAt,
  gitSha,
  source: 'npm run build (runs typecheck then vite build --config config/vite.config.ts)',
  schema:
    'chunks keyed by glob pattern matching dist/assets/<key>; * matches all rolldown hash segments. Logical name is derived by stripping trailing 8-16 char alphanumeric hash segments (see scripts/perf/_lib.mjs:logicalName).',
  keyScheme: 'scripts/perf/_lib.mjs:logicalName',
  total: Math.round(total * 100) / 100,
  chunks,
};

writeFileSync('perf-budget.json', JSON.stringify(doc, null, 2) + '\n');
console.log(`Captured ${Object.keys(chunks).length} chunks, total ${doc.total} kB`);
