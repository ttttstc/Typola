#!/usr/bin/env node
// Typola 性能基线:拉起 release exe + CDP,量化四类核心操作。
// 用法: node scripts/perf/bench-exe.mjs [--runs N] [--out file.json]
// 产物: perf/bench/ 下的 JSON 结果 + 控制台摘要

import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const defaultExecutable = path.join(repositoryRoot, 'src-tauri', 'target', 'release', 'typola.exe');
const executablePath = process.env.TYPOLA_VERIFY_EXE ?? defaultExecutable;
const perfRoot = path.join(repositoryRoot, 'perf');
const benchRoot = path.join(perfRoot, 'bench');

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index !== -1 ? Number(args[index + 1]) : fallback;
}
const RUNS = argValue('--runs', 10);
const outIndex = args.indexOf('--out');
const OUT_FILE = outIndex !== -1
  ? path.resolve(args[outIndex + 1])
  : path.join(benchRoot, `baseline-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`);

function percentile(data, q) {
  const sorted = [...data].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function fmt(ms) {
  return ms == null ? '—' : `${ms.toFixed(0)}ms`;
}

function summarize(samples) {
  return { p50: percentile(samples, 0.5), p75: percentile(samples, 0.75), p95: percentile(samples, 0.95), n: samples.length };
}

async function allocatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForCdp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.status === 200) return;
    } catch { /* retry */ }
    await delay(150);
  }
  throw new Error('等待 CDP 超时');
}

async function launchExe(cdpPort, profileDirectory, launchArgs = []) {
  const child = spawn(executablePath, launchArgs, {
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profileDirectory,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  return child;
}

async function connectPage(cdpEndpoint, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 15_000 });
      const context = browser.contexts()[0];
      if (!context) throw new Error('CDP 没有浏览器上下文,重试');
      const page = context.pages().find((candidate) => !candidate.url().startsWith('devtools:'));
      if (page) return { browser, page };
      await browser.close().catch(() => {});
      lastError = new Error('还没有 Typola 页面,重试');
    } catch (error) {
      lastError = error;
      // 单实例插件:新实例转发参数后立即退出,CDP 随之消失,等一会让调用方重新拉起
    }
    await delay(300);
  }
  throw lastError ?? new Error('connectPage 超时');
}

function killProcessTree(child) {
  if (!child) return Promise.resolve();
  const exited = new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) return resolve();
    const timer = setTimeout(resolve, 8000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (child.pid && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else if (!child.killed) {
    child.kill('SIGTERM');
  }
  return exited;
}

async function waitEditorVisible(page) {
  // 「能打字」判定: CM6 内容区已挂载(比工具栏按钮可见更严格)
  await page.locator('.cm-editor .cm-content').first().waitFor({ state: 'visible', timeout: 90_000 });
}

// ---------- 场景 A: 冷启动到能打字(每次真冷启动) ----------
async function scenarioColdStart({ cdpPort, profileDirectory }) {
  const t0 = performance.now();
  const child = await launchExe(cdpPort, profileDirectory, []);
  try {
    await waitForCdp(`http://127.0.0.1:${cdpPort}`);
    const { browser, page } = await connectPage(`http://127.0.0.1:${cdpPort}`);
    await waitEditorVisible(page);
    const tVisible = performance.now();
    // 编辑器 DOM 真就绪:内容区存在
    const editorReady = await page.evaluate(() =>
      document.querySelector('.cm-editor .cm-content, .vditor') !== null);
    // 首屏资源画像(仅第一次跑时记录,避免重复开销)
    const resourcePaint = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint');
      return {
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
        loadEvent: nav ? nav.loadEventEnd : null,
        firstPaint: paints.find((e) => e.name === 'first-paint')?.startTime ?? null,
        fcip: paints.find((e) => e.name === 'first-contentful-paint')?.startTime ?? null,
      };
    });
    await browser.close().catch(() => {});
    return { spawnToEditorVisible: tVisible - t0, editorReady, resourcePaint };
  } finally {
    killProcessTree(child);
  }
}

// ---------- 场景 B: 大文件打开与滚动 ----------
async function scenarioLargeFile({ page }) {
  const sourceButton = page.locator('button[aria-label="源码模式"]');
  if (await sourceButton.getAttribute('aria-pressed') !== 'true') await sourceButton.click();
  await page.locator('.cm-editor').waitFor({ state: 'visible' });
  const content = page.locator('.cm-content');
  await content.click();
  // CM6 的选区不体现在 DOM Selection API 上:全选后直接 Delete 清空
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(
    '# 大文档性能夹具\n\n'
    + Array.from({ length: 2000 }, (_, i) => `第${i}行内容,包含中文与**加粗**与\`code\`。\n`).join(''),
  );
  const tTyped = performance.now();
  await page.waitForFunction(() => {
    const el = document.querySelector('.cm-content');
    return el && el.textContent.includes('第1999行');
  }, { timeout: 30_000 });
  const tSettled = performance.now();

  // 滚动流畅度: 20 次滚动期间统计长任务(不 buffered,只算滚动期间新产生的)
  const scrollMetrics = await page.evaluate(() => new Promise((resolve) => {
    const entries = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) entries.push(entry.duration);
    });
    observer.observe({ type: 'longtask' });
    let scrollCount = 0;
    const scroller = document.querySelector('.cm-scroller') || document.scrollingElement || document.body;
    const timer = setInterval(() => {
      scroller.scrollTop += 600;
      scrollCount += 1;
      if (scrollCount >= 20) {
        clearInterval(timer);
        setTimeout(() => { observer.disconnect(); resolve(entries); }, 300);
      }
    }, 50);
  }));

  return {
    insertToSettle: tSettled - tTyped,
    scrollLongTaskCount: scrollMetrics.length,
    scrollLongTaskTotal: scrollMetrics.reduce((s, d) => s + d, 0),
    scrollLongTaskMax: scrollMetrics.length ? Math.max(...scrollMetrics) : 0,
  };
}

// ---------- 场景 C: 打字流畅度 ----------
async function scenarioTyping({ page }) {
  // 先在页面里装好测量探针(rAF 帧间隔 + 长任务),返回句柄 id;结束后取数
  await page.evaluate(() => {
    window.__typingProbe = {
      frames: [],
      longTasks: [],
      started: false,
    };
  });
  const startProbe = () => page.evaluate(() => {
    const probe = window.__typingProbe;
    if (!probe || probe.started) return;
    probe.started = true;
    probe.frames = [];
    probe.longTasks = [];
    probe.rafId = requestAnimationFrame(function tick(t) {
      probe.frames.push(t);
      probe.rafId = requestAnimationFrame(tick);
    });
    probe.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTasks.push(entry.duration);
    });
    probe.observer.observe({ type: 'longtask' });
  });
  const stopProbe = () => page.evaluate(() => new Promise((done) => {
    const probe = window.__typingProbe;
    cancelAnimationFrame(probe.rafId);
    probe.observer.disconnect();
    const intervals = probe.frames.slice(1).map((t, i) => t - probe.frames[i]).sort((a, b) => a - b);
    const at = (x) => (intervals.length ? intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * x))] : null);
    done({
      frameCount: intervals.length,
      frameP50: at(0.5),
      frameP95: at(0.95),
      frameMax: intervals.length ? intervals[intervals.length - 1] : null,
      longTaskCount: probe.longTasks.length,
      longTaskTotal: probe.longTasks.reduce((s, d) => s + d, 0),
    });
  }));

  await page.locator('.cm-content').click();
  await page.keyboard.press('End');
  await startProbe();
  // 真实按键序列(走完整输入管线): 中文整句 + 方向键 + 追加
  await page.keyboard.type('这是打字流畅度的测量句子,包含中文标点。', { delay: 30 });
  for (let i = 0; i < 30; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.type('追加一段尾巴用于测量。', { delay: 20 });
  return await stopProbe();
}

// ---------- 场景 D: 切换视图(渲染⇄源码) ----------
async function scenarioSwitch({ page }) {
  const sourceButton = page.locator('button[aria-label="源码模式"]');
  const writingButton = page.locator('button[aria-label="渲染模式"]');
  const viewSwitchTimes = [];
  for (let i = 0; i < 5; i += 1) {
    let t0 = performance.now();
    await writingButton.click();
    await page.locator('.cm6-markdown-editor-pane').waitFor({ state: 'visible', timeout: 30_000 });
    viewSwitchTimes.push(performance.now() - t0);
    t0 = performance.now();
    await sourceButton.click();
    await page.locator('.cm-editor').waitFor({ state: 'visible', timeout: 30_000 });
    viewSwitchTimes.push(performance.now() - t0);
  }
  return { viewSwitchTimes, summary: summarize(viewSwitchTimes) };
}

// ---------- 主流程 ----------

async function main() {
  await fs.mkdir(benchRoot, { recursive: true });
  const stat = await fs.stat(executablePath).catch(() => null);
  if (!stat) throw new Error(`找不到 exe: ${executablePath},先跑 npm run tauri:build:local`);
  const exeIdentity = { path: executablePath, size: stat.size, mtime: stat.mtime.toISOString() };
  console.log(`[bench] exe: ${exeIdentity.path}`);
  console.log(`[bench] mtime: ${exeIdentity.mtime}, ${(exeIdentity.size / 1024 / 1024).toFixed(1)}MB`);
  console.log(`[bench] runs per scenario: ${RUNS}`);

  const results = { meta: { exeIdentity, runs: RUNS, startedAt: new Date().toISOString() }, scenarios: {} };

  // A. 冷启动
  console.log(`\n[A] 冷启动到能打字 — ${RUNS} 次冷启动`);
  const coldSamples = [];
  let firstPaintProfile = null;
  for (let i = 0; i < RUNS; i += 1) {
    const cdpPort = await allocatePort();
    const profileDirectory = path.join(benchRoot, `profile-cold-${Date.now()}-${i}`);
    const sample = await scenarioColdStart({ cdpPort, profileDirectory });
    coldSamples.push(sample.spawnToEditorVisible);
    if (!firstPaintProfile) firstPaintProfile = sample.resourcePaint;
    console.log(`  run ${i + 1}/${RUNS}: spawn→editorVisible ${fmt(sample.spawnToEditorVisible)}${sample.editorReady ? '' : ' (DOM 未就绪!)'}`);
    await fs.rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
    await delay(400);
  }
  results.scenarios.coldStart = { summary: summarize(coldSamples), samples: coldSamples, paintProfile: firstPaintProfile };
  console.log(`  p50=${fmt(results.scenarios.coldStart.summary.p50)} p75=${fmt(results.scenarios.coldStart.summary.p75)} p95=${fmt(results.scenarios.coldStart.summary.p95)}`);
  if (firstPaintProfile) console.log(`  首绘画像: FCP=${fmt(firstPaintProfile.fcip)} DCL=${fmt(firstPaintProfile.domContentLoaded)} load=${fmt(firstPaintProfile.loadEvent)}`);

  // B/C/D 在同一长驻实例
  console.log('\n[B/C/D] 大文件 / 打字 / 视图切换 — 单实例');
  const cdpPort = await allocatePort();
  const profileDirectory = path.join(benchRoot, `profile-long-${Date.now()}`);
  let child = null;
  try {
    child = await launchExe(cdpPort, profileDirectory, []);
    const { browser, page } = await connectPage(`http://127.0.0.1:${cdpPort}`);
    await waitEditorVisible(page);

    const largeFile = await scenarioLargeFile({ page });
    results.scenarios.largeFile = largeFile;
    console.log(`  [B] 100KB 插入到渲染稳定: ${fmt(largeFile.insertToSettle)}, 滚动期长任务 ${largeFile.scrollLongTaskCount} 个 / 总 ${fmt(largeFile.scrollLongTaskTotal)} / 最长 ${fmt(largeFile.scrollLongTaskMax)}`);

    const typing = await scenarioTyping({ page });
    results.scenarios.typing = typing;
    console.log(`  [C] 打字期: 帧数 ${typing.frameCount}, 帧间隔 p50=${fmt(typing.frameP50)} p95=${fmt(typing.frameP95)} max=${fmt(typing.frameMax)}, 长任务 ${typing.longTaskCount} 个 / 总 ${fmt(typing.longTaskTotal)}`);

    const switchView = await scenarioSwitch({ page });
    results.scenarios.switchView = switchView;
    console.log(`  [D] 视图切换(渲染⇄源码): p50=${fmt(switchView.summary.p50)} p75=${fmt(switchView.summary.p75)} p95=${fmt(switchView.summary.p95)} (n=${switchView.viewSwitchTimes.length})`);

    await browser.close().catch(() => {});
  } finally {
    await delay(300);
    killProcessTree(child);
    await fs.rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
  }

  await fs.writeFile(OUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n[bench] 结果已写入 ${path.relative(repositoryRoot, OUT_FILE)}`);
}

main().catch((error) => {
  console.error('[bench] 失败:', error);
  process.exit(1);
});
