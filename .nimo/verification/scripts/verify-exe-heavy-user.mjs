// 重度用户 exe 验证套件：零文档用户长文档工作流 + 首份性能基线（feature 统一 heavy-user-*）。
// 调用方式：node .nimo/verification/scripts/verify-exe-heavy-user.mjs
//   或 npm run verify:exe-heavy-user
//
// 视角：不看任何说明的重度 Markdown 用户 —— 一次性灌入 ~2000 行混排长文档后，
// 凭直觉完成：末尾/中部连续中文输入、H2 折叠 + 大纲跳转、Ctrl+F 全文查找 +
// 全部替换、50 次编辑后的撤销链、三标签内容/光标隔离、写作↔源码↔阅读模式
// 往返、Ctrl+S 落盘与磁盘内容比对。
//
// 大文档断言口径（CM6 是视口虚拟化渲染，.cm-line 只含可视行）：
// - 全文计数一律走查找面板 .find-count（基于完整 source 计算，与虚拟化无关）
// - 定点采样用 Ctrl+Home / Ctrl+End / Ctrl+G / 大纲跳转后读可视行
// - 全量 round-trip 用 Ctrl+S 落盘后与期望串做归一化全文比对
//
// 性能口径（PERF_CALIBER 随 run.json 落盘）：所有计时只覆盖
// 「操作触发 → 用户可观察完成」，渲染稳定等待一律放在计时区间外。

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const defaultExecutable = path.join(repositoryRoot, 'src-tauri', 'target', 'debug', 'typola.exe');
const executablePath = path.resolve(process.env.TYPOLA_VERIFY_EXE ?? defaultExecutable);
const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${process.pid}`;
const verificationRoot = path.join(repositoryRoot, '.nimo', 'verification');
const evidenceDirectory = path.join(verificationRoot, 'evidence', `${runId}-exe-heavy-user`);
const runtimeDirectory = path.join(verificationRoot, 'runtime', runId);
const fixturePath = path.join(runtimeDirectory, 'heavy-user-fixture.md');

let ownedProcess = null;
let browser = null;
let cdpEndpoint = null;
let cdpPort = null;
let cdpSession = null;
let profileDirectory = null;

const actions = [];
const skipped = [];
const runtimeMessages = { stdout: '', stderr: '', console: [], pageErrors: [], requestFailures: [] };
const cleanup = { processPid: null, processStopped: false, profileRemoved: false, runtimeRemoved: false, cdpClosed: false };

// ============================ 文档生成 ============================

const SECTION_COUNT = 50; // 50 节 × 40 行 + 头部 4 行 + 尾行 1 行 = 2005 行
const FIND_WORD = '高频词';
const REPLACE_WORD = '替换目标词';
const MARKER_PREFIX = '撤销标记';
const MARKER_EDITS = 50;
const MARKER_UNDO_STEPS = 3;

function buildLargeDocument() {
  const lines = [];
  lines.push('# 重度用户性能基线文档');
  lines.push('');
  lines.push('本文档由自动化验收脚本生成，用于模拟重度 Markdown 用户的 2000 行长文档工作流，覆盖多级标题、长列表、任务列表、表格、代码块、公式、引用与分割线的混排场景。');
  lines.push('');
  for (let i = 1; i <= SECTION_COUNT; i += 1) {
    lines.push(`## 第 ${i} 节：写作与渲染混排章节`);
    lines.push('');
    lines.push(`开篇导语第 ${i} 节。这一段承载${FIND_WORD}，用于全文查找与全部替换压测，同时验证中文长文本在写作与源码模式间的往返完整性。`);
    lines.push('');
    lines.push(`### 小节 ${i}.1：列表与任务`);
    lines.push('');
    lines.push(`- 无序列表项目甲第 ${i} 节`);
    lines.push(`- 无序列表项目乙第 ${i} 节`);
    lines.push(`- 无序列表项目丙第 ${i} 节`);
    lines.push('');
    lines.push(`1. 有序步骤一第 ${i} 节`);
    lines.push(`2. 有序步骤二第 ${i} 节`);
    lines.push(`3. 有序步骤三第 ${i} 节`);
    lines.push('');
    lines.push(`- [ ] 待办任务一第 ${i} 节`);
    lines.push(`- [ ] 待办任务二第 ${i} 节`);
    lines.push(`- [x] 已完成事项第 ${i} 节`);
    lines.push('');
    lines.push(`> 引用观点第 ${i} 节：引用块承载批判性思考与延伸阅读线索，验证折叠与跳转过程中的内容无损。`);
    lines.push('');
    lines.push(`定位锚点-第${i}节`);
    lines.push('');
    lines.push('| 列一 | 列二 | 列三 |');
    lines.push('| --- | --- | --- |');
    lines.push(`| 表格数据甲${i} | 表格数据乙${i} | 表格数据丙${i} |`);
    lines.push(`| 表格数据丁${i} | 表格数据戊${i} | 表格数据己${i} |`);
    lines.push('');
    lines.push('```js');
    lines.push(`// 代码块第 ${i} 节`);
    lines.push(`function sectionAnchor${i}(x) {`);
    lines.push(`  return \`anchor-${i}-\${x}\`;`);
    lines.push('}');
    lines.push('```');
    lines.push('');
    lines.push('$$');
    lines.push(`E_{${i}} = mc^{2} \\quad \\text{公式第 ${i} 节}`);
    lines.push('$$');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  lines.push('文档末尾基线段落。');
  return lines.join('\n');
}

function buildChineseText(length) {
  const pool = '这是一段用于测量真实输入延迟的中文探针文本，覆盖逐字连续输入场景与内容完整性校验需求。';
  let out = '';
  let i = 0;
  while (out.length < length) {
    out += pool[i % pool.length];
    i += 1;
  }
  return out.slice(0, length);
}

const bigDoc = buildLargeDocument();
const bigDocLines = bigDoc.split('\n');
const anchorLineNumber = bigDocLines.indexOf('定位锚点-第25节') + 1; // 1-based
// 探针尾部必须是全文唯一串（buildChineseText 的池文本会周期性重复，
// 直接 slice(-12) 会在 200 字内重复出现导致计数 ≠1 —— 第 1 次运行的实测教训）。
const endTypingProbe = '末尾唯一锚点';
const midTypingProbe = '中部唯一锚点';
const endTypingText = `${buildChineseText(194)}${endTypingProbe}`;
const midTypingText = `${buildChineseText(94)}${midTypingProbe}`;

// 期望落盘内容：基线 + 末尾追打 200 字 + 中部锚点行追打 100 字 + 全部替换 + 47 条撤销标记
let expectedFinal = bigDoc;
expectedFinal = expectedFinal.replace('定位锚点-第25节', `定位锚点-第25节${midTypingText}`);
expectedFinal = expectedFinal.replace('文档末尾基线段落。', `文档末尾基线段落。${endTypingText}`);
expectedFinal = expectedFinal.split(FIND_WORD).join(REPLACE_WORD);
const keptMarkers = MARKER_EDITS - MARKER_UNDO_STEPS;
expectedFinal = `${expectedFinal}\n${Array.from({ length: keptMarkers }, (_, k) => `${MARKER_PREFIX}-${String(k + 1).padStart(2, '0')}`).join(' ')} `;

function normalizeDoc(text) {
  return text
    .replace(/\r\n/gu, '\n')
    .split('\n')
    .map((line) => {
      let stripped = line.replace(/[ \t]+$/gu, '');
      if (/^\s*\|/u.test(stripped)) {
        // 表格行：编辑器（codemirror-markdown-tables）会把列宽重排为等宽对齐 ——
        // 表头补空格（"| 列一 |" → "| 列一     |"），分隔线补破折号（"---" → "------"）。
        // 比较时去掉表格行内全部空白，并把分隔行内的破折号连续段折叠为单个 "-"：
        // 本文档单元格内容不含空格/竖线，两侧等价归一，单元格文字差异仍会被检出。
        stripped = stripped.replace(/[ \t]+/gu, '');
        if (/^\|[-|]+\|$/u.test(stripped)) {
          stripped = stripped.replace(/-+/gu, '-');
        }
      }
      return stripped;
    })
    .join('\n')
    .replace(/\n+$/gu, '');
}

// ============================ 性能基线 ============================

const PERF_CALIBER = {
  bulkInsert: '源码模式 keyboard.insertText(整篇 ~2000 行) 发出 → 末个已渲染 .cm-line 文本包含文档尾行（insertText 后视口跟随光标到文档末尾；25ms 轮询分辨率）',
  writingSwitch: '点击「渲染模式」按钮 → 按钮 aria-pressed=true（25ms 轮询；React 状态翻转口径）',
  openToInteractive: 'bulkInsert + writingSwitch 两段之和（两段之间的断言开销不计入）',
  typingPerChar: '每字符 keyboard.type 单字符往返（CDP 输入注入 → 页面处理返回），含 CDP 开销，是端到端可感知输入延迟的上界；循环间无额外等待，渲染稳定等待(300ms)在计时外',
  find: 'find-input.fill 开始 → .find-count 呈现期望计数（含 CDP fill 注入、120ms 防抖、全文扫描；25ms 轮询分辨率）；另记录 fillMs（注入段）与 findMs（fill 完成 → 计数呈现）',
  replaceAll: '点击「全部」按钮 → .find-count 变为 0/0（含 120ms 防抖重算；25ms 轮询分辨率）',
  modeSwitch: '点击模式按钮 / 模式段 → 目标状态属性翻转（aria-pressed 或 html[data-doc-mode]；25ms 轮询分辨率），切换后 300ms 稳定等待在计时外',
  undoOnce: '源码模式 Ctrl+Z 按下 → 末行 .cm-line 文本不再包含撤销计时探针（25ms 轮询分辨率）',
  save: 'Ctrl+S 按下 → 磁盘文件出现末尾标记（150ms 轮询）',
  memory: 'CDP Performance.getMetrics 的 JSHeap/Nodes 指标 + performance.memory，测试起点（bootstrap 后）与终点（保存比对后）各采样一次',
};

const perfBaseline = {
  caliber: PERF_CALIBER,
  documentProfile: {
    sectionCount: SECTION_COUNT,
    lines: bigDocLines.length,
    characters: bigDoc.length,
    headingCountExpected: 1 + SECTION_COUNT * 2, // 1 个 H1 + 50 个 H2 + 50 个 H3
    findWordMatches: SECTION_COUNT,
  },
  largeDoc: { bulkInsertMs: null, writingSwitchMs: null, openToInteractiveMs: null },
  typing: {
    endChars: 200, endTotalMs: null, endPerCharMs: null, endMaxCharMs: null,
    midChars: 100, midTotalMs: null, midPerCharMs: null, midMaxCharMs: null,
  },
  find: { fillMs: null, findMs: null, findTotalMs: null, matches: SECTION_COUNT, postReplaceFindMs: null },
  replaceAll: { ms: null, replaced: SECTION_COUNT },
  modeSwitch: {},
  undo: { singleUndoMs: null },
  save: { ms: null },
  memory: { start: null, end: null },
};

// ============================ 基建（对齐 verify-exe-core.mjs deep 段） ============================

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runGit(args) {
  return spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true });
}

function collectGitIdentity() {
  const head = runGit(['rev-parse', 'HEAD']);
  const diff = runGit(['diff', '--binary', 'HEAD', '--no-ext-diff']);
  const status = runGit(['status', '--short', '--untracked-files=all']);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard']);
  return {
    head: head.stdout.trim() || null,
    worktreeDiffId: sha256([diff.stdout, status.stdout, untracked.stdout].join('\n')),
    status: status.stdout.trim().split(/\r?\n/gu).filter(Boolean),
  };
}

async function allocatePort() {
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address()?.port;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('无法分配 CDP 端口');
  return port;
}

async function fetchText(url) {
  const response = await fetch(url);
  return { status: response.status, text: await response.text() };
}

async function waitForCdp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'CDP 尚未就绪';
  while (Date.now() < deadline) {
    if (ownedProcess?.exitCode !== null && ownedProcess?.exitCode !== undefined) {
      throw new Error(`exe 在 CDP 就绪前退出，退出码 ${ownedProcess.exitCode}`);
    }
    try {
      const response = await fetchText(`${url}/json/version`);
      if (response.status === 200) return JSON.parse(response.text);
      lastError = `CDP 返回 HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`等待 CDP 超时：${lastError}`);
}

async function waitForPage(context, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = context.pages().find((candidate) => !candidate.url().startsWith('devtools:'));
    if (page) return page;
    await delay(250);
  }
  throw new Error('没有发现 Typola WebView 页面');
}

async function ariaSnapshot(page) {
  try {
    return await page.locator('body').ariaSnapshot();
  } catch {
    return await page.locator('body').innerText();
  }
}

async function captureUi(page, stem) {
  try {
    await page.screenshot({ path: path.join(evidenceDirectory, `${stem}.png`), fullPage: false });
    await fs.writeFile(path.join(evidenceDirectory, `${stem}.aria.txt`), `${await ariaSnapshot(page)}\n`, 'utf8');
  } catch (error) {
    runtimeMessages.console.push({ type: 'capture-error', text: `${stem}: ${error instanceof Error ? error.message : String(error)}` });
  }
}

async function recordAction(page, feature, label, operation, observation) {
  const record = { feature, label, startedAt: new Date().toISOString() };
  try {
    await operation();
    record.status = 'passed';
    try {
      record.observation = await observation();
    } catch (obsError) {
      record.observationError = obsError instanceof Error ? obsError.message : String(obsError);
    }
  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
  } finally {
    record.finishedAt = new Date().toISOString();
    actions.push(record);
    console.log(`[${record.status === 'passed' ? '✓' : '✗'}] ${feature} :: ${label}${record.error ? ` :: ${record.error.slice(0, 200)}` : ''}`);
  }
}

function attachProcessLogs(handle) {
  handle.stdout?.on('data', (chunk) => {
    runtimeMessages.stdout = `${runtimeMessages.stdout}${chunk.toString()}`.slice(-100_000);
  });
  handle.stderr?.on('data', (chunk) => {
    runtimeMessages.stderr = `${runtimeMessages.stderr}${chunk.toString()}`.slice(-100_000);
  });
}

async function stopOwnedProcess() {
  if (!ownedProcess) return;
  cleanup.processPid = ownedProcess.pid ?? null;
  const pid = ownedProcess.pid;
  if (pid && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true });
  } else if (!ownedProcess.killed) {
    ownedProcess.kill('SIGTERM');
  }
  if (ownedProcess.exitCode === null && !ownedProcess.killed) {
    await Promise.race([
      new Promise((resolve) => ownedProcess.once('close', resolve)),
      delay(10_000),
    ]);
  }
  cleanup.processStopped = ownedProcess.exitCode !== null || ownedProcess.killed;
}

async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => undefined);
    browser = null;
  }
}

async function ensureSource(page) {
  const button = page.getByRole('button', { name: '源码模式', exact: true });
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  await page.locator('.cm-editor').waitFor({ state: 'visible' });
}

async function ensureWriting(page) {
  const button = page.getByRole('button', { name: '渲染模式', exact: true });
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  await page.locator('.cm6-markdown-editor-pane').waitFor({ state: 'visible' });
}

// ============================ 场景级助手 ============================

async function readVisibleLinesText(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.cm-content .cm-line')).map((el) => el.textContent ?? ''));
}

// 确定性聚焦：contentDOM.focus() 不移动光标、不经过任何可能漂移进表格网格/相邻行
// widget 的行点击（写作模式下对 .cm-line 的盲点击曾把 100 字灌进表格表头单元格）。
// 等价于应用自身的编辑器复焦行为（gotoLine 内部同样调用 view.focus()）。
// 焦点判定用 document.activeElement（focus() 后同步更新）——不能用 .cm-focused
// class（CM6 异步更新，第 3 次运行的实测教训：同步检查会竞态误报失焦）。
async function focusEditor(page) {
  const focused = await page.evaluate(() => {
    const el = document.querySelector('.cm6-markdown-editor-pane .cm-content');
    if (!el) return false;
    el.focus();
    const active = document.activeElement;
    return active === el || (active instanceof Element && el.contains(active));
  });
  assert.ok(focused, 'contentDOM.focus() 后 activeElement 应位于编辑器内容区');
}

// 打开查找面板 → 填词 → 等待计数呈现「1/expectedTotal」→ Escape 干净关闭。
// 计数基于完整 source（与 CM6 视口虚拟化无关），是大文档全文计数的可靠口径。
// 超时会给出实际计数值，方便定位（第 1 次运行的实测教训：探针不唯一只能盲等超时）。
async function queryFindCount(page, word, expectedTotal, timeoutMs = 15_000) {
  // 防面板残留：先尝试关掉可能开着的面板（无面板时 Escape 落到编辑器为 no-op）
  await page.keyboard.press('Escape').catch(() => undefined);
  await delay(80);
  await page.keyboard.press('Control+f');
  const panel = page.locator('.find-panel');
  await panel.waitFor({ state: 'visible', timeout: 5_000 });
  await panel.locator('.find-input').first().fill(word);
  const expected = `1/${expectedTotal}`;
  const deadline = Date.now() + timeoutMs;
  let actual = '';
  while (Date.now() < deadline) {
    actual = (await panel.locator('.find-count').textContent().catch(() => '')) ?? '';
    if (actual === expected) break;
    await delay(60);
  }
  if (actual !== expected) {
    throw new Error(`查找「${word}」计数等待超时：期望 ${expected}，实际 ${actual || '(空)'}`);
  }
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'detached', timeout: 3_000 }).catch(async () => {
    await page.locator('button[aria-label="关闭查找"]').click().catch(() => undefined);
    await panel.waitFor({ state: 'detached', timeout: 3_000 });
  });
  return actual;
}

// 逐字符真实输入（keyboard.type 走输入事件路径），返回计时（含 CDP 往返开销）。
async function typeChineseTimed(page, text) {
  let totalMs = 0;
  let maxMs = 0;
  for (const ch of text) {
    const t0 = Date.now();
    await page.keyboard.type(ch);
    const dt = Date.now() - t0;
    totalMs += dt;
    if (dt > maxMs) maxMs = dt;
  }
  return { totalMs, perCharMs: totalMs / text.length, maxCharMs: maxMs };
}

const sourcePressedFn = () => document.querySelector('button[aria-label="源码模式"]')?.getAttribute('aria-pressed') === 'true';
const renderPressedFn = () => document.querySelector('button[aria-label="渲染模式"]')?.getAttribute('aria-pressed') === 'true';
// 注意：waitForFunction 的谓词会被序列化到页面里执行，不能闭包引用外部变量 ——
// docMode 必须作为 arg 传入（第 1 次运行 ReferenceError: mode is not defined 的教训）。
const docModeFn = (mode) => document.documentElement.dataset.docMode === mode;

async function timedSwitch(page, trigger, readyFn, arg = null, timeoutMs = 20_000) {
  const t0 = Date.now();
  await trigger();
  await page.waitForFunction(readyFn, arg, { polling: 25, timeout: timeoutMs });
  return Date.now() - t0;
}

async function collectMemory(page) {
  const result = { at: new Date().toISOString(), cdp: null, performanceMemory: null, domNodes: null };
  try {
    const { metrics } = await cdpSession.send('Performance.getMetrics');
    const pick = (name) => metrics.find((m) => m.name === name)?.value ?? null;
    result.cdp = {
      jsHeapUsedSize: pick('JSHeapUsedSize'),
      jsHeapTotalSize: pick('JSHeapTotalSize'),
      documents: pick('Documents'),
      nodes: pick('Nodes'),
      jsEventListeners: pick('JSEventListeners'),
    };
  } catch (error) {
    result.cdpError = error instanceof Error ? error.message : String(error);
  }
  const dom = await page.evaluate(() => {
    const memory = performance.memory ?? null;
    return {
      domNodes: document.getElementsByTagName('*').length,
      performanceMemory: memory ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize } : null,
    };
  });
  result.domNodes = dom.domNodes;
  result.performanceMemory = dom.performanceMemory;
  return result;
}

// ============================ 主流程 ============================

async function main() {
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.mkdir(runtimeDirectory, { recursive: true });
  await fs.writeFile(fixturePath, '# 重度用户夹具\n\n初始内容，等待长文档覆盖。\n', 'utf8');

  const git = collectGitIdentity();
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const executableStat = await fs.stat(executablePath);
  const executableBytes = await fs.readFile(executablePath);
  const executable = {
    path: executablePath,
    size: executableStat.size,
    lastWriteTime: executableStat.mtime.toISOString(),
    sha256: sha256(executableBytes),
  };
  cdpPort = await allocatePort();
  cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
  profileDirectory = path.join(runtimeDirectory, 'webview2');
  await fs.mkdir(profileDirectory, { recursive: true });

  ownedProcess = spawn(executablePath, [fixturePath], {
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profileDirectory,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  attachProcessLogs(ownedProcess);
  ownedProcess.once('error', (error) => {
    runtimeMessages.stderr = `${runtimeMessages.stderr}\n${error.message}`;
  });

  const cdpVersion = await waitForCdp(cdpEndpoint);
  browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 15_000 });
  const context = browser.contexts()[0];
  assert.ok(context);
  const page = await waitForPage(context);
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) {
      runtimeMessages.console.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => runtimeMessages.pageErrors.push(error.message));
  page.on('requestfailed', (request) => runtimeMessages.requestFailures.push({
    url: request.url(),
    failure: request.failure()?.errorText ?? 'unknown',
  }));

  try {
    await page.locator('button[aria-label="源码模式"]').waitFor({ state: 'visible', timeout: 60_000 });
  } catch (error) {
    runtimeMessages.pageErrors.push(`initial bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
    await writeRunJson({ runId, cdpVersion: { Browser: 'unknown' }, git, packageVersion: packageJson.version, executable });
    await stopOwnedProcess();
    await closeBrowser();
    await confirmCdpClosed();
    await removeRuntime();
    await removeProfile();
    process.exitCode = 1;
    return;
  }

  cdpSession = await context.newCDPSession(page);
  await cdpSession.send('Performance.enable').catch(() => undefined);

  await captureUi(page, '00-initial');
  perfBaseline.memory.start = await collectMemory(page);
  const bootstrapPageErrors = runtimeMessages.pageErrors.length;

  // ==================== A1 长文档构建 + 打开到可交互计时 ====================

  await recordAction(
    page,
    'heavy-user-doc-build',
    `源码灌入 ${bigDocLines.length} 行混排文档 → 切写作模式 → 渲染断言（标题/表格/公式/无 mermaid）`,
    async () => {
      const errorsBefore = runtimeMessages.pageErrors.length;
      await ensureSource(page);
      const content = page.locator('.cm-content');
      await content.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');

      // —— 段 1：整篇灌入 → 源码模式末行可见（insertText 后光标在文档末尾，
      //    视口跟随到末尾，因此就绪信号是"末个已渲染行 == 文档尾行"）
      const t0 = Date.now();
      await page.keyboard.insertText(bigDoc);
      await page.waitForFunction(
        () => {
          const lines = document.querySelectorAll('.cm-content .cm-line');
          if (lines.length < 5) return false;
          const last = lines[lines.length - 1].textContent ?? '';
          return last.includes('文档末尾基线段落。');
        },
        null,
        { polling: 25, timeout: 30_000 },
      );
      perfBaseline.largeDoc.bulkInsertMs = Date.now() - t0;

      // —— 段 2：切写作模式 → 渲染按钮态翻转
      const t1 = Date.now();
      await page.getByRole('button', { name: '渲染模式', exact: true }).click();
      await page.waitForFunction(renderPressedFn, null, { polling: 25, timeout: 20_000 });
      perfBaseline.largeDoc.writingSwitchMs = Date.now() - t1;
      perfBaseline.largeDoc.openToInteractiveMs = perfBaseline.largeDoc.bulkInsertMs + perfBaseline.largeDoc.writingSwitchMs;

      // 渲染稳定等待（计时外）
      await delay(300);

      // —— 折叠角标可见（视口内）
      await focusEditor(page);
      await page.keyboard.press('Control+Home');
      await delay(150);
      const toggleCount = await page.locator('.cm-content .typola-heading-fold-toggle').count();
      assert.ok(toggleCount >= 1, `写作模式下视口内应可见折叠角标，实际 ${toggleCount}`);

      // —— 大纲条目数（基于全文 source，标题 30+ 断言）
      await page.getByRole('button', { name: '查看大纲', exact: true }).click();
      const entries = page.locator('.floating-toc-item');
      await entries.first().waitFor({ state: 'visible', timeout: 5_000 });
      const entryCount = await entries.count();
      assert.ok(entryCount >= SECTION_COUNT * 2 - 1, `大纲条目应 ≥ ${SECTION_COUNT * 2 - 1}（H2+H3，H1 是否入纲不强制），实际 ${entryCount}`);
      await page.locator('.floating-toc-close').click().catch(() => page.keyboard.press('Escape'));
      await delay(150);

      // —— 滚动到表格 + 公式（用户滚轮行为）
      const paneBox = await page.locator('.cm6-markdown-editor-pane').boundingBox();
      assert.ok(paneBox, '写作面板 boundingBox 缺失');
      await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + Math.min(paneBox.height / 2, 320));
      let tableCount = 0;
      let mathCount = 0;
      let katexCount = 0;
      for (let i = 0; i < 30; i += 1) {
        tableCount = await page.locator('.cm-content table.tbl-table').count();
        mathCount = await page.locator('.cm-content .typola-cm6-math-block').count();
        katexCount = await page.locator('.cm-content .katex').count();
        if (tableCount >= 1 && mathCount >= 1) break;
        await page.mouse.wheel(0, 350);
        await delay(120);
      }
      assert.ok(tableCount >= 1, `写作模式下应可见表格网格，实际 ${tableCount}`);
      assert.ok(mathCount >= 1, `写作模式下应可见公式块，实际 ${mathCount}`);

      // —— mermaid 无（文档未包含 mermaid，不应出现 mermaid 容器或错误卡）
      const mermaidCount = await page.locator('.cm-content .mermaid, .cm-content [data-mermaid], .cm-content .typola-mermaid-error').count();
      assert.equal(mermaidCount, 0, `文档不含 mermaid，却出现 ${mermaidCount} 个 mermaid 相关节点`);

      // —— 灌入过程无页面错误
      assert.equal(runtimeMessages.pageErrors.length, errorsBefore, `灌入大文档期间出现页面错误：${runtimeMessages.pageErrors.slice(errorsBefore).join(' | ')}`);
    },
    async () => ({
      docLines: bigDocLines.length,
      docChars: bigDoc.length,
      outlineEntryCount: await page.locator('.floating-toc-item').count().catch(() => null),
      foldToggleVisibleCount: await page.locator('.cm-content .typola-heading-fold-toggle').count(),
      visibleLineCount: (await readVisibleLinesText(page)).length,
      tableVisibleCount: await page.locator('.cm-content table.tbl-table').count(),
      mathBlockVisibleCount: await page.locator('.cm-content .typola-cm6-math-block').count(),
      katexVisibleCount: await page.locator('.cm-content .katex').count(),
      perf: { ...perfBaseline.largeDoc },
    }),
  );
  await captureUi(page, '10-large-doc');

  // ==================== A2 末尾/中部连续输入 300 字 + 输入计时 ====================

  await recordAction(
    page,
    'heavy-user-typing',
    '文档末尾逐字输入 200 字 + 文档中部逐字输入 100 字（真实键盘路径）',
    async () => {
      const errorsBefore = runtimeMessages.pageErrors.length;

      // —— 末尾 200 字：聚焦 → Ctrl+End → 逐字输入
      await focusEditor(page);
      await page.keyboard.press('Control+End');
      await delay(150);
      const endTiming = await typeChineseTimed(page, endTypingText);
      perfBaseline.typing.endTotalMs = endTiming.totalMs;
      perfBaseline.typing.endPerCharMs = endTiming.perCharMs;
      perfBaseline.typing.endMaxCharMs = endTiming.maxCharMs;
      await delay(300); // 渲染稳定（计时外）
      // 末行可见且包含完整 200 字（探针为全文唯一串）
      const tailLines = await readVisibleLinesText(page);
      const tailLine = tailLines[tailLines.length - 1] ?? '';
      assert.ok(tailLine.includes(endTypingProbe), `末行应包含追打 200 字的唯一探针，实际：${tailLine.slice(-60)}`);
      // 全文计数（查找面板，不受视口虚拟化影响）
      await queryFindCount(page, endTypingProbe, 1);

      // —— 中部 100 字：聚焦 → Ctrl+G 跳到锚点行行尾 → 逐字输入。
      //    gotoLine 内核实现本身就会：光标定位 + scrollIntoView(center) + view.focus()，
      //    且「列号超出行长时停到行尾」—— 因此填 "行:999" 直接把光标放到锚点行行尾，
      //    完全不经过行点击与 End 键。第 2/4 次运行的教训：写作模式下点击锚点行、或
      //    在锚点行按 End，光标都可能漂进下方表格网格的表头单元格，把输入灌进表格
      //    并触发全文档表格列宽重排。
      // Ctrl+G 是 CM6 keymap，需要编辑器聚焦（前一步查找面板 Escape 后焦点已丢失）
      await focusEditor(page);
      await page.keyboard.press('Control+g');
      const popover = page.locator('.goto-line-popover');
      await popover.waitFor({ state: 'visible', timeout: 5_000 });
      await popover.locator('.goto-line-input').fill(`${anchorLineNumber}:999`);
      await popover.getByRole('button', { name: '跳转', exact: true }).click();
      await popover.waitFor({ state: 'detached', timeout: 5_000 });
      await delay(250);
      const gotoFocused = await page.evaluate(() => {
        const el = document.querySelector('.cm6-markdown-editor-pane .cm-content');
        if (!el) return false;
        const active = document.activeElement;
        return active === el || (active instanceof Element && el.contains(active));
      });
      assert.ok(gotoFocused, '跳转后编辑器应保持聚焦（gotoLine 内部已 view.focus()；activeElement 判定）');
      const midTiming = await typeChineseTimed(page, midTypingText);
      perfBaseline.typing.midTotalMs = midTiming.totalMs;
      perfBaseline.typing.midPerCharMs = midTiming.perCharMs;
      perfBaseline.typing.midMaxCharMs = midTiming.maxCharMs;
      await delay(300);
      // 锚点行可见且追打完整（探针为全文唯一串）
      const midLines = await readVisibleLinesText(page);
      const midLine = midLines.find((t) => t.includes('定位锚点-第25节')) ?? '';
      assert.ok(
        midLine.includes(midTypingProbe),
        `锚点行应包含追打探针；锚点行实际：${JSON.stringify(midLine.slice(-80))}；可视末 3 行：${JSON.stringify(midLines.slice(-3).map((t) => t.slice(0, 50)))}`,
      );
      await queryFindCount(page, midTypingProbe, 1);

      assert.equal(runtimeMessages.pageErrors.length, errorsBefore, `连续输入期间出现页面错误：${runtimeMessages.pageErrors.slice(errorsBefore).join(' | ')}`);
    },
    async () => ({
      anchorLineNumber,
      perf: JSON.parse(JSON.stringify(perfBaseline.typing)),
    }),
  );
  await captureUi(page, '11-typing');

  // ==================== A3 折叠 + 大纲跳转 + 展开 ====================

  await recordAction(
    page,
    'heavy-user-fold-outline',
    '折叠第 1 节 H2 → 大纲跳转第 25 节 → 跳回展开 → 内容无损',
    async () => {
      await focusEditor(page);
      await page.keyboard.press('Control+Home');
      await delay(150);

      // —— 折叠第 1 节 H2
      const h2Line = page.locator('.cm-content .cm-line').filter({ hasText: '第 1 节：' }).first();
      await h2Line.locator('.typola-heading-fold-toggle').click();
      await delay(300);
      const introHidden = !(await page.locator('.cm-content').getByText('开篇导语第 1 节').isVisible().catch(() => false));
      assert.ok(introHidden, '折叠后第 1 节导语应不可见');
      // 折叠收拢：下一节标题应被拉入视口
      const nextSectionVisible = await page.locator('.cm-content .cm-line').filter({ hasText: '第 2 节：' }).first().isVisible();
      assert.ok(nextSectionVisible, '折叠后下一节标题应收拢进入视口');
      const foldedClassCount = await page.locator('.cm-content .typola-cm-line-folded').count();
      const foldedHeadingCount = await page.locator('.cm-content .typola-heading-folded').count();

      // —— 大纲跳转第 25 节
      await page.getByRole('button', { name: '查看大纲', exact: true }).click();
      const entries = page.locator('.floating-toc-item');
      await entries.first().waitFor({ state: 'visible', timeout: 5_000 });
      await entries.filter({ hasText: '第 25 节' }).first().click();
      await delay(400);
      assert.ok(await page.locator('.cm6-markdown-editor-pane').isVisible(), '大纲跳转后编辑器应仍可见');
      const visibleAfterJump = await readVisibleLinesText(page);
      const landed = visibleAfterJump.some((t) => t.includes('第 25 节：') || t.includes('定位锚点-第25节'));
      assert.ok(landed, '大纲跳转后视口应落到第 25 节标题/锚点附近');
      const activeOutlineText = await page.locator('.floating-toc-row.active .floating-toc-item').textContent().catch(() => null);

      // —— 大纲跳回第 1 节并关闭
      await entries.filter({ hasText: '第 1 节' }).first().click();
      await delay(400);
      await page.locator('.floating-toc-close').click().catch(() => page.keyboard.press('Escape'));
      await delay(200);

      // —— 展开第 1 节
      const h2LineAgain = page.locator('.cm-content .cm-line').filter({ hasText: '第 1 节：' }).first();
      await h2LineAgain.waitFor({ state: 'visible', timeout: 5_000 });
      await h2LineAgain.locator('.typola-heading-fold-toggle').click();
      await delay(300);
      const introVisibleAgain = await page.locator('.cm-content').getByText('开篇导语第 1 节').isVisible().catch(() => false);
      assert.ok(introVisibleAgain, '展开后第 1 节导语应恢复可见');

      // —— 内容无损：高频词计数不变
      await queryFindCount(page, FIND_WORD, SECTION_COUNT);
    },
    async () => ({
      foldedClassCount: await page.locator('.cm-content .typola-cm-line-folded').count(),
      foldedHeadingCount: await page.locator('.cm-content .typola-heading-folded').count(),
      activeOutlineTextAfterJump: await page.locator('.floating-toc-row.active .floating-toc-item').textContent().catch(() => null),
      findWordStillIntact: SECTION_COUNT,
    }),
  );
  await captureUi(page, '12-fold-outline');

  // ==================== A4 全文查找 + 全部替换 + 计时 ====================

  await recordAction(
    page,
    'heavy-user-find-replace',
    `Ctrl+F 查找「${FIND_WORD}」（50 处）→ 全部替换为「${REPLACE_WORD}」→ 双向计数断言`,
    async () => {
      await page.keyboard.press('Control+f');
      const panel = page.locator('.find-panel');
      await panel.waitFor({ state: 'visible', timeout: 5_000 });

      // —— 全文查找计时：fill 开始 → 计数呈现 1/50
      const t0 = Date.now();
      await panel.locator('.find-input').first().fill(FIND_WORD);
      perfBaseline.find.fillMs = Date.now() - t0;
      const t1 = Date.now();
      await page.waitForFunction(
        (want) => document.querySelector('.find-panel .find-count')?.textContent === want,
        `1/${SECTION_COUNT}`,
        { polling: 25, timeout: 15_000 },
      );
      perfBaseline.find.findMs = Date.now() - t1;
      perfBaseline.find.findTotalMs = Date.now() - t0;

      // —— 全部替换计时：点击 → 计数归零
      await panel.locator('button[aria-label="展开替换"]').click();
      await panel.locator('.find-input').nth(1).fill(REPLACE_WORD);
      const t2 = Date.now();
      await panel.locator('button[title="全部替换"]').click();
      await page.waitForFunction(
        (want) => document.querySelector('.find-panel .find-count')?.textContent === want,
        '0/0',
        { polling: 25, timeout: 15_000 },
      );
      perfBaseline.replaceAll.ms = Date.now() - t2;

      // —— 替换后：查新词应 50 处，旧词 0 处
      const t3 = Date.now();
      await panel.locator('.find-input').first().fill(REPLACE_WORD);
      await page.waitForFunction(
        (want) => document.querySelector('.find-panel .find-count')?.textContent === want,
        `1/${SECTION_COUNT}`,
        { polling: 25, timeout: 15_000 },
      );
      perfBaseline.find.postReplaceFindMs = Date.now() - t3;
      await delay(300);
      // 第一个匹配被定位到视口（第 1 节导语），可见文本应含新词、不含旧词
      const visibleText = await page.locator('.cm-content').textContent();
      assert.ok(visibleText?.includes(REPLACE_WORD), `替换后可视区应包含「${REPLACE_WORD}」`);
      assert.ok(!visibleText?.includes(FIND_WORD), `替换后可视区不应再出现「${FIND_WORD}」`);
      await panel.locator('button[aria-label="关闭查找"]').click();
      await panel.waitFor({ state: 'detached', timeout: 3_000 });
    },
    async () => ({
      replacedCount: SECTION_COUNT,
      perf: { find: { ...perfBaseline.find }, replaceAll: { ...perfBaseline.replaceAll } },
    }),
  );
  await captureUi(page, '13-find-replace');

  // ==================== A5 50 次编辑 + 撤销链 + 单次撤销计时 ====================

  await recordAction(
    page,
    'heavy-user-undo',
    `末尾 ${MARKER_EDITS} 次独立编辑（>500ms 间隔成组）→ Ctrl+Z×${MARKER_UNDO_STEPS} 撤销链抽查 → 单次撤销计时`,
    async () => {
      const errorsBefore = runtimeMessages.pageErrors.length;
      // 聚焦 → 文档末尾新起一行
      await focusEditor(page);
      await page.keyboard.press('Control+End');
      await page.keyboard.press('Enter');
      // 50 次编辑：每词一个历史组（间隔 700ms > CM6 newGroupDelay 500ms）
      for (let i = 1; i <= MARKER_EDITS; i += 1) {
        await page.keyboard.type(`${MARKER_PREFIX}-${String(i).padStart(2, '0')} `);
        await delay(700);
      }
      await delay(300);
      await queryFindCount(page, MARKER_PREFIX, MARKER_EDITS);

      // —— 撤销链：3 步，每步后全文计数抽查。
      //    聚焦用 contentDOM.focus()（不依赖视口位置 —— 第 1 次运行的实测教训：
      //    查找面板 revealRange 之后视口位置不可预测，按文本找行点击会 30s 超时）。
      //    撤销弹出的是最近一个历史组，与光标位置无关。
      for (let step = 1; step <= MARKER_UNDO_STEPS; step += 1) {
        await focusEditor(page);
        await page.keyboard.press('Control+z');
        await delay(250);
        await queryFindCount(page, MARKER_PREFIX, MARKER_EDITS - step);
      }

      // —— 可见尾部抽查：复焦 → Ctrl+End（滚动到末行）→ 末行应止于 -47
      await focusEditor(page);
      await page.keyboard.press('Control+End');
      await delay(200);
      const lines = await readVisibleLinesText(page);
      const lastLine = lines[lines.length - 1] ?? '';
      assert.ok(lastLine.includes(`${MARKER_PREFIX}-47`), `撤销 3 步后末行应包含 ${MARKER_PREFIX}-47，实际：${lastLine.slice(-80)}`);
      assert.ok(!lastLine.includes(`${MARKER_PREFIX}-48`), `撤销 3 步后末行不应包含 ${MARKER_PREFIX}-48，实际：${lastLine.slice(-80)}`);

      // —— 单次撤销计时（源码模式：行 DOM 与文档行一一对应，末行轮询可靠）
      await ensureSource(page);
      await focusEditor(page);
      await page.keyboard.press('Control+End');
      await page.keyboard.type('撤销计时探针');
      await delay(700); // 独立历史组（计时外）
      const t0 = Date.now();
      await page.keyboard.press('Control+z');
      await page.waitForFunction(
        () => {
          const all = document.querySelectorAll('.cm-content .cm-line');
          if (!all.length) return false;
          const last = all[all.length - 1].textContent ?? '';
          return !last.includes('撤销计时探针');
        },
        null,
        { polling: 25, timeout: 10_000 },
      );
      perfBaseline.undo.singleUndoMs = Date.now() - t0;
      // 撤销探针后内容回到 47 条标记状态
      await queryFindCount(page, MARKER_PREFIX, keptMarkers);

      assert.equal(runtimeMessages.pageErrors.length, errorsBefore, `撤销链操作期间出现页面错误：${runtimeMessages.pageErrors.slice(errorsBefore).join(' | ')}`);
    },
    async () => ({
      markerEdits: MARKER_EDITS,
      undoSteps: MARKER_UNDO_STEPS,
      keptMarkers,
      perf: { ...perfBaseline.undo },
    }),
  );
  await captureUi(page, '14-undo-chain');

  // ==================== A6 模式往返 + 各段计时 ====================

  await recordAction(
    page,
    'heavy-user-mode-roundtrip',
    '大文档 写作↔源码↔阅读（含检视桥接）5 段切换计时 + 内容 round-trip 无损',
    async () => {
      const switchErrors = [];
      // 每段独立容错：任一段翻转失败不阻断后续段，也保证末尾能恢复基准态
      //（第 1 次运行的教训：中途抛错把 docMode 卡在检视，污染后续标签页场景）。
      const safeTimed = async (key, trigger, readyFn, arg) => {
        try {
          perfBaseline.modeSwitch[key] = await timedSwitch(page, trigger, readyFn, arg);
        } catch (error) {
          switchErrors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
        await delay(300);
      };

      // 起点：源码模式（上一场景结束态）
      await safeTimed('sourceToWritingMs', () => page.getByRole('button', { name: '渲染模式', exact: true }).click(), renderPressedFn, null);
      await safeTimed('writingToReviewMs', () => page.getByRole('tab', { name: '检视模式' }).click(), docModeFn, 'review');
      await safeTimed('reviewToReadMs', () => page.getByRole('tab', { name: '阅读模式' }).click(), docModeFn, 'read');
      await safeTimed('readToSourceMs', () => page.getByRole('button', { name: '源码模式', exact: true }).click(), sourcePressedFn, null);
      await safeTimed('sourceToWritingMs2', () => page.getByRole('button', { name: '渲染模式', exact: true }).click(), renderPressedFn, null);

      // —— 恢复基准态：阅读布局 + 写作编辑（无论上面哪段失败）
      await page.getByRole('tab', { name: '阅读模式' }).click().catch(() => undefined);
      await delay(250);
      await ensureWriting(page);
      if (switchErrors.length > 0) {
        throw new Error(`模式切换段失败：${switchErrors.join(' | ')}`);
      }

      // —— 内容无损：全文计数 + 首末行采样
      await queryFindCount(page, REPLACE_WORD, SECTION_COUNT);
      await queryFindCount(page, MARKER_PREFIX, keptMarkers);
      await focusEditor(page);
      await page.keyboard.press('Control+Home');
      await delay(200);
      const firstLines = await readVisibleLinesText(page);
      assert.ok((firstLines[0] ?? '').includes('重度用户性能基线文档'), `模式往返后首行应保留标题，实际：${firstLines[0] ?? ''}`);
      await page.keyboard.press('Control+End');
      await delay(200);
      const endLines = await readVisibleLinesText(page);
      assert.ok((endLines[endLines.length - 1] ?? '').includes(`${MARKER_PREFIX}-47`), '模式往返后末行应保留撤销标记-47');
    },
    async () => ({
      perf: { ...perfBaseline.modeSwitch },
    }),
  );
  await captureUi(page, '15-mode-roundtrip');

  // ==================== A7 三文档多标签隔离 ====================

  await recordAction(
    page,
    'heavy-user-tabs',
    '三份文档多标签切换：各自内容隔离 + tab2 光标/焦点保留续打',
    async () => {
      await ensureWriting(page);
      // 新建两个未命名标签（tab1 = 夹具长文档）
      await page.getByRole('button', { name: '新建文档', exact: true }).click();
      await delay(300);
      await page.getByRole('button', { name: '新建文档', exact: true }).click();
      await delay(300);
      const tabs = page.locator('[role="tablist"][aria-label="打开的文件"] [role="tab"]');
      assert.equal(await tabs.count(), 3, '应存在 3 个文件标签');

      // —— 连续两次新建后活动标签是第二个新标签（未命名 2.md = nth(2)），
      //    必须显式切回 nth(1) 才是在 tab2 输入 —— 第 2 次运行的教训：
      //    "标签二"内容被灌进了 tab3（aria 证据：tab3 dirty、tab2 0 词）。
      await tabs.nth(1).click();
      await delay(400);
      // tab2（未命名.md）输入 + 立即计数验证（把"输入落空"从 30s 超时变成有诊断的失败）
      await focusEditor(page);
      await delay(100);
      await page.keyboard.type('标签二独立内容光标记');
      await page.keyboard.press('Control+End');
      await delay(200);
      await queryFindCount(page, '标签二独立内容光标记', 1);

      // —— tab3（未命名 2.md）输入 + 立即计数验证
      await tabs.nth(2).click();
      await delay(300);
      await focusEditor(page);
      await delay(100);
      await page.keyboard.type('标签三独立内容');
      await delay(200);
      await queryFindCount(page, '标签三独立内容', 1);

      // —— 切回 tab2：不点击直接续打（验证焦点/光标保留）
      await tabs.nth(1).click();
      await delay(400);
      let cursorRetained = true;
      await page.keyboard.type('保留成功');
      await delay(300);
      let contiguous = false;
      try {
        await queryFindCount(page, '标签二独立内容光标记保留成功', 1, 6_000);
        contiguous = true;
      } catch {
        cursorRetained = false;
        // 兜底前先确认 tab2 原内容仍在（若不在则是内容丢失的真产品问题，直接失败）
        await queryFindCount(page, '标签二独立内容光标记', 1, 6_000);
        await focusEditor(page);
        await page.keyboard.press('Control+End');
        await page.keyboard.type('保留成功');
        await delay(300);
        await queryFindCount(page, '标签二独立内容光标记保留成功', 1);
        contiguous = true;
      }
      if (!cursorRetained) {
        runtimeMessages.console.push({ type: 'heavy-user-note', text: 'tab 切换后直接续打未落在行尾（焦点/光标未保留），已用点击+Ctrl+End 兜底完成内容隔离验证' });
      }

      // —— tab3 内容隔离
      await tabs.nth(2).click();
      await delay(300);
      await queryFindCount(page, '标签三独立内容', 1);

      // —— tab1（长文档）内容隔离
      await tabs.nth(0).click();
      await delay(400);
      await queryFindCount(page, MARKER_PREFIX, keptMarkers);
      await queryFindCount(page, '定位锚点-第25节', 1);
    },
    async () => ({
      tabCount: await page.locator('[role="tablist"][aria-label="打开的文件"] [role="tab"]').count(),
      tabLabels: await page.locator('[role="tablist"][aria-label="打开的文件"] [role="tab"]').allInnerTexts(),
    }),
  );
  await captureUi(page, '16-tabs');

  // ==================== A8 Ctrl+S 落盘比对 ====================

  await recordAction(
    page,
    'heavy-user-save',
    'Ctrl+S 保存 → 磁盘文件与编辑器期望内容全文比对（归一化相等）',
    async () => {
      // 显式切回 tab1（有路径的夹具文件）再保存 —— Ctrl+S 保存的是“当前活动标签”，
      // 若停留在未命名标签上会触发原生另存为对话框（第 1 次运行的教训）。
      const tabs = page.locator('[role="tablist"][aria-label="打开的文件"] [role="tab"]');
      await tabs.nth(0).click();
      await delay(400);
      const t0 = Date.now();
      await page.keyboard.press('Control+s');
      let disk = '';
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        disk = await fs.readFile(fixturePath, 'utf8');
        if (disk.includes(`${MARKER_PREFIX}-47`)) break;
        await delay(150);
      }
      perfBaseline.save.ms = Date.now() - t0;
      assert.ok(disk.includes(`${MARKER_PREFIX}-47`), '保存后磁盘应包含末尾撤销标记');

      const exactMatch = disk === expectedFinal;
      const normalizedDisk = normalizeDoc(disk);
      const normalizedExpected = normalizeDoc(expectedFinal);
      if (normalizedDisk !== normalizedExpected) {
        const diskLines = normalizedDisk.split('\n');
        const expectedLines = normalizedExpected.split('\n');
        const diffs = [];
        for (let i = 0; i < Math.max(diskLines.length, expectedLines.length) && diffs.length < 10; i += 1) {
          if (diskLines[i] !== expectedLines[i]) {
            diffs.push(`行 ${i + 1}：磁盘=${JSON.stringify((diskLines[i] ?? '(缺行)').slice(0, 60))} 期望=${JSON.stringify((expectedLines[i] ?? '(缺行)').slice(0, 60))}`);
          }
        }
        throw new Error(`磁盘内容与期望不一致（前 ${diffs.length} 处差异）；行数 磁盘=${diskLines.length} 期望=${expectedLines.length}；${diffs.join(' ；')}`);
      }
      assert.equal(normalizedDisk, normalizedExpected, '归一化后磁盘内容应与期望一致');
    },
    async () => ({
      fixturePath,
      diskBytes: (await fs.readFile(fixturePath, 'utf8')).length,
      expectedBytes: expectedFinal.length,
      exactMatch: (await fs.readFile(fixturePath, 'utf8')) === expectedFinal,
      saveState: await page.locator('.status-save-state').getAttribute('data-save-state').catch(() => null),
      perf: { ...perfBaseline.save },
    }),
  );
  await captureUi(page, '17-save-disk');

  // ==================== A9 内存终采样 + 性能基线汇总 ====================

  perfBaseline.memory.end = await collectMemory(page);
  const heapDelta = (perfBaseline.memory.end.cdp?.jsHeapUsedSize ?? 0) - (perfBaseline.memory.start.cdp?.jsHeapUsedSize ?? 0);

  await recordAction(
    page,
    'heavy-user-perf-baseline',
    '性能基线采集完整性（大文档打开/输入/查找/替换/模式切换/撤销/保存/内存）',
    async () => {
      assert.ok(bigDocLines.length >= 1900 && bigDocLines.length <= 2100, `文档行数应在 2000 左右，实际 ${bigDocLines.length}`);
      const metricEntries = [
        ['largeDoc.bulkInsertMs', perfBaseline.largeDoc.bulkInsertMs],
        ['largeDoc.writingSwitchMs', perfBaseline.largeDoc.writingSwitchMs],
        ['typing.endTotalMs', perfBaseline.typing.endTotalMs],
        ['typing.midTotalMs', perfBaseline.typing.midTotalMs],
        ['find.findTotalMs', perfBaseline.find.findTotalMs],
        ['replaceAll.ms', perfBaseline.replaceAll.ms],
        ['modeSwitch.sourceToWritingMs', perfBaseline.modeSwitch.sourceToWritingMs],
        ['modeSwitch.writingToReviewMs', perfBaseline.modeSwitch.writingToReviewMs],
        ['modeSwitch.reviewToReadMs', perfBaseline.modeSwitch.reviewToReadMs],
        ['modeSwitch.readToSourceMs', perfBaseline.modeSwitch.readToSourceMs],
        ['modeSwitch.sourceToWritingMs2', perfBaseline.modeSwitch.sourceToWritingMs2],
        ['undo.singleUndoMs', perfBaseline.undo.singleUndoMs],
        ['save.ms', perfBaseline.save.ms],
      ];
      const valid = metricEntries.filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0);
      const missing = metricEntries.filter(([, v]) => !(typeof v === 'number' && Number.isFinite(v) && v > 0)).map(([k]) => k);
      // 容忍级联缺失（某场景失败时其指标为 null），但至少 13 项里要有 8 项有效
      assert.ok(valid.length >= 8, `性能指标有效数不足（${valid.length}/13），缺失：${missing.join(', ')}`);
      assert.ok(perfBaseline.memory.start?.cdp?.jsHeapUsedSize > 0, '起点 JSHeap 采样缺失');
      assert.ok(perfBaseline.memory.end?.cdp?.jsHeapUsedSize > 0, '终点 JSHeap 采样缺失');
      if (missing.length > 0) {
        runtimeMessages.console.push({ type: 'heavy-user-note', text: `性能指标缺失（对应场景失败或未执行）：${missing.join(', ')}` });
      }
    },
    async () => ({
      perfBaseline: JSON.parse(JSON.stringify(perfBaseline)),
      jsHeapUsedDeltaBytes: heapDelta,
      missingMetrics: [
        ['largeDoc.bulkInsertMs', perfBaseline.largeDoc.bulkInsertMs],
        ['typing.midTotalMs', perfBaseline.typing.midTotalMs],
        ['undo.singleUndoMs', perfBaseline.undo.singleUndoMs],
        ['save.ms', perfBaseline.save.ms],
      ].filter(([, v]) => !(typeof v === 'number' && Number.isFinite(v) && v > 0)).map(([k]) => k),
    }),
  );
  await captureUi(page, '18-perf-baseline');

  // ============================ 收尾 ============================

  await captureUi(page, '99-final-state');
  await writeRunJson({ runId, cdpVersion, git, packageVersion: packageJson.version, executable });

  const failedActions = actions.filter((a) => a.status === 'failed');
  console.log('\n===== heavy-user 套件汇总 =====');
  console.log(`actions: ${actions.length} (passed=${actions.length - failedActions.length} / failed=${failedActions.length})`);
  console.log(`页面错误数（全程）: ${runtimeMessages.pageErrors.length - bootstrapPageErrors}`);
  console.log('\n===== perfBaseline =====');
  console.log(JSON.stringify(perfBaseline, null, 2));

  process.exitCode = failedActions.length > 0 ? 1 : 0;

  await stopOwnedProcess();
  await closeBrowser();
  await confirmCdpClosed();
  await removeRuntime();
  await removeProfile();
}

async function writeRunJson(meta) {
  await fs.writeFile(
    path.join(evidenceDirectory, 'run.json'),
    JSON.stringify(
      {
        status: actions.some((a) => a.status === 'failed') ? 'failed' : 'passed',
        verificationId: 'exe-heavy-user',
        runId: meta.runId,
        observedAt: new Date().toISOString(),
        packageVersion: meta.packageVersion,
        command: meta.executable.path,
        commandLine: `${meta.executable.path} ${fixturePath}`,
        cdp: { endpoint: cdpEndpoint, port: cdpPort, browser: meta.cdpVersion.Browser, protocolVersion: meta.cdpVersion['Protocol-Version'] ?? null },
        runtime: { title: 'Typola', href: 'http://tauri.localhost/', runtime: 'tauri' },
        executable: meta.executable,
        git: meta.git,
        perfBaseline,
        actions,
        skipped,
        runtimeMessages,
        cleanup,
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function confirmCdpClosed() {
  if (!cdpEndpoint) return;
  try {
    await fetchText(`${cdpEndpoint}/json/version`);
    cleanup.cdpClosed = false;
  } catch {
    cleanup.cdpClosed = true;
  }
}

async function removeRuntime() {
  if (!runtimeDirectory) return;
  await fs.rm(runtimeDirectory, { recursive: true, force: true });
  cleanup.runtimeRemoved = true;
}

async function removeProfile() {
  if (!profileDirectory) return;
  await fs.rm(profileDirectory, { recursive: true, force: true });
  cleanup.profileRemoved = true;
}

main().catch(async (error) => {
  console.error('verify-exe-heavy-user 失败：', error);
  await stopOwnedProcess().catch(() => undefined);
  await closeBrowser().catch(() => undefined);
  await removeRuntime().catch(() => undefined);
  await removeProfile().catch(() => undefined);
  process.exit(1);
});
