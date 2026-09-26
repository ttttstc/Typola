#!/usr/bin/env node
// P0.2 首屏 eager 资源棘轮:断言 dist/index.html 实际引用(modulepreload+script+css)的
// gzip 总量不超过 perf-entry-budget.json 登记的上限。新增 eager 资源必须先登记。
// 用法: node scripts/perf/assert-entry-budget.mjs [--capture]

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_PATH = "perf-entry-budget.json";
const args = process.argv.slice(2);
const capture = args.includes("--capture");

const html = readFileSync("dist/index.html", "utf8");
const refs = new Set();
for (const match of html.matchAll(/(?:href|src)="\.\.?\/(assets\/[^"]+)"/g)) {
  refs.add(match[1]);
}
// modulepreload 链
for (const match of html.matchAll(/rel="modulepreload" href="([^"]+)"/g)) {
  refs.add(match[1].replace(/^(\.\.?\/)?/, (m) => (m ? "" : "")) .replace(/^assets\//, "assets/").replace(/^\/?/, (m2) => ""));
}
// 归一化:去掉开头 ./ ../ 等
const normalized = new Set([...refs].map((r) => r.replace(/^(\.\.\/)+/, "").replace(/^\.\//, "")));

const entries = {};
let totalGz = 0;
for (const rel of normalized) {
  const p = join("dist", rel);
  if (!existsSync(p)) continue;
  const gz = gzipSync(readFileSync(p)).length / 1024;
  entries[rel] = Math.round(gz * 100) / 100;
  totalGz += gz;
}
totalGz = Math.round(totalGz * 100) / 100;

if (capture) {
  writeFileSync(BUDGET_PATH, JSON.stringify({
    _meta: { capturedAt: new Date().toISOString().slice(0, 16).replace("T", " "), source: "dist/index.html" },
    totalGzipKb: totalGz,
    entryCount: Object.keys(entries).length,
    entries,
  }, null, 2) + "\n");
  console.log(`entry budget captured: ${Object.keys(entries).length} files, ${totalGz.toFixed(2)} kB gzip`);
  process.exit(0);
}

if (!existsSync(BUDGET_PATH)) {
  console.error(`缺少 ${BUDGET_PATH};先跑 node scripts/perf/assert-entry-budget.mjs --capture`);
  process.exit(1);
}
const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
let failed = false;

// 1. 总量只许降
if (totalGz > budget.totalGzipKb + 0.01) {
  console.error(`FAIL  总量回退: eager gzip ${totalGz.toFixed(2)} kB > 预算 ${budget.totalGzipKb.toFixed(2)} kB`);
  failed = true;
} else {
  console.log(` OK   总量: ${totalGz.toFixed(2)} kB (预算 ${budget.totalGzipKb.toFixed(2)} kB, 省 ${(budget.totalGzipKb - totalGz).toFixed(2)} kB)`);
}

// 2. 新增 eager 条目必须登记
for (const [rel, gz] of Object.entries(entries)) {
  if (budget.entries[rel] === undefined) {
    console.error(`FAIL  新增 eager 资源未登记: ${rel} (${gz.toFixed(2)} kB)`);
    failed = true;
  }
}
// 3. 登记过的条目只许变小
for (const [rel, cap] of Object.entries(budget.entries)) {
  const cur = entries[rel];
  if (cur === undefined) continue;
  if (cur > cap + 0.01) {
    console.error(`FAIL  ${rel}: ${cur.toFixed(2)} kB > ${cap.toFixed(2)} kB`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("entry budget: PASS");
