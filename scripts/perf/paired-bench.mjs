#!/usr/bin/env node
// 配对测量:A(基线 exe) 与 B(优化 exe) 交替冷启动,同机同时段,消除负载漂移。
// 用法: node scripts/perf/paired-bench.mjs --a <baseline.exe> --b <optimized.exe> --pairs N

import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
const EXE_A = argValue('--a');
const EXE_B = argValue('--b');
const PAIRS = Number(argValue('--pairs') ?? 8);

function percentile(data, q) {
  const sorted = [...data].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

async function allocatePort() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}

async function coldStartOnce(exePath) {
  const port = await allocatePort();
  const profileDir = path.join(os.tmpdir(), `typola-paired-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const t0 = performance.now();
  const child = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profileDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  try {
    const deadline = Date.now() + 90_000;
    let browser = null;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.status === 200) break;
      } catch { /* retry */ }
      await delay(120);
    }
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15_000 });
    const ctx = browser.contexts()[0];
    let page = null;
    const pd = Date.now() + 60_000;
    while (Date.now() < pd) {
      page = ctx?.pages().find((p) => !p.url().startsWith('devtools:'));
      if (page) break;
      await delay(100);
    }
    if (!page) throw new Error('no page');
    await page.locator('.cm-editor .cm-content').first().waitFor({ state: 'visible', timeout: 90_000 });
    const tVisible = performance.now();
    await browser.close().catch(() => {});
    return tVisible - t0;
  } finally {
    if (child.pid && process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    }
    // 等进程真正退出(单实例插件:残留实例会让下一轮拉起即退出)
    const exited = new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(resolve, 8000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    await Promise.race([exited, delay(8000)]);
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  if (!EXE_A || !EXE_B) {
    console.error('用法: node scripts/perf/paired-bench.mjs --a <baseline.exe> --b <optimized.exe> --pairs 8');
    process.exit(1);
  }
  const statA = await fs.stat(EXE_A);
  const statB = await fs.stat(EXE_B);
  console.log(`A(基线): ${EXE_A} ${(statA.size / 1048576).toFixed(1)}MB`);
  console.log(`B(优化): ${EXE_B} ${(statB.size / 1048576).toFixed(1)}MB`);
  console.log(`配对轮数: ${PAIRS} (每轮 A→B,共 ${PAIRS * 2} 次冷启动)\n`);

  const samplesA = [];
  const samplesB = [];
  for (let round = 1; round <= PAIRS; round += 1) {
    const a = await coldStartOnce(EXE_A);
    samplesA.push(a);
    console.log(`  round ${round}: A=${a.toFixed(0)}ms`);
    await delay(400);
    const b = await coldStartOnce(EXE_B);
    samplesB.push(b);
    console.log(`           B=${b.toFixed(0)}ms`);
    await delay(400);
  }

  const fmt = (arr) => `p50=${percentile(arr, 0.5).toFixed(0)} p75=${percentile(arr, 0.75).toFixed(0)} p95=${percentile(arr, 0.95).toFixed(0)}`;
  console.log('\n===== 配对结果 =====');
  console.log(`A(基线) n=${samplesA.length}: ${fmt(samplesA)}`);
  console.log(`B(优化) n=${samplesB.length}: ${fmt(samplesB)}`);
  const a75 = percentile(samplesA, 0.75);
  const b75 = percentile(samplesB, 0.75);
  console.log(`\np75 降幅: ${a75.toFixed(0)}ms → ${b75.toFixed(0)}ms  (-${(((a75 - b75) / a75) * 100).toFixed(1)}%)`);
  const result = { exeA: EXE_A, exeB: EXE_B, pairs: PAIRS, samplesA, samplesB, summary: { a75, b75 } };
  const out = path.join('perf', 'bench', `paired-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(result, null, 2), 'utf8');
  console.log(`已写入 ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
