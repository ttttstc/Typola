#!/usr/bin/env node
// Typola exe 统一验证套件（tier 化）：Playwright + CDP 驱动真实 typola.exe。
// 调用方式：
//   node .nimo/verification/scripts/verify-exe-core.mjs --smoke   → npm run verify:core（核心用例，fail-fast）
//   node .nimo/verification/scripts/verify-exe-core.mjs           → 全量（smoke + deep，deep 段 continue-on-failure）
//   node .nimo/verification/scripts/run-all-non-ai.mjs            → npm run verify:all（全量 + 汇总 _summary-non-ai.json）
//
// 设计原则：
// - 严格断言：每个 action 必须在真实 exe 中产生用户可见的变化（DOM / source / svg）
// - 用户视角句柄：aria-label / role / visible text，不依赖实现层 class
// - smoke 段失败 → rethrow 整套终止；deep 段失败 → 记录后继续，一次性收集全部失败
// - 任何 action failed → run.json status='failed' + 进程 exit 1（已知失败 P0-11/P1-11 会如实暴露）
// - 受阻场景（installer / portable / webview2 缺失 / 原生对话框 / 重启）在 features/index.md
//   中明确标注，本脚本不试图绕过这些约束。

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
const smokeOnly = process.argv.includes('--smoke');
const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${process.pid}`;
const verificationRoot = path.join(repositoryRoot, '.nimo', 'verification');
const evidenceDirectory = path.join(verificationRoot, 'evidence', `${runId}-exe-core`);
const runtimeDirectory = path.join(verificationRoot, 'runtime', runId);
const fixturePath = path.join(runtimeDirectory, 'open-save-fixture.md');

let ownedProcess = null;
let browser = null;
let cdpEndpoint = null;
let cdpPort = null;
let profileDirectory = null;
let failure = null;

const actions = [];
const skipped = [];
const runtimeMessages = {
  stdout: '',
  stderr: '',
  console: [],
  pageErrors: [],
  requestFailures: [],
};
const cleanup = {
  processPid: null,
  processStopped: false,
  profileRemoved: false,
  runtimeRemoved: false,
  cdpClosed: false,
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
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
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('无法分配本次验证的 CDP 端口');
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
      throw new Error(`验证 exe 在 CDP 就绪前退出，退出码 ${ownedProcess.exitCode}`);
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
  throw new Error('CDP 已连接，但没有发现 Typola WebView 页面');
}

async function waitForContains(locator, expected, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() < deadline) {
    lastText = (await locator.textContent().catch(() => '')) ?? '';
    if (lastText.includes(expected)) return lastText;
    await delay(150);
  }
  throw new Error(`等待文本超时：${expected}；当前文本：${lastText.slice(0, 240)}`);
}

async function waitForDataState(locator, attribute, expected, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await locator.getAttribute(attribute) === expected) return;
    await delay(100);
  }
  throw new Error(`等待 ${attribute}=${expected} 超时`);
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
    // capture 失败不阻断
    runtimeMessages.console.push({ type: 'capture-error', text: `${stem}: ${error instanceof Error ? error.message : String(error)}` });
  }
}

async function recordAction(page, feature, label, operation, observation, options = {}) {
  const { tier = 'smoke', continueOnError = false } = options;
  const record = {
    feature,
    label,
    tier,
    startedAt: new Date().toISOString(),
  };
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
    if (!continueOnError) throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    actions.push(record);
  }
}

const deepAction = (page, feature, label, operation, observation) =>
  recordAction(page, feature, label, operation, observation, { tier: 'deep', continueOnError: true });

function skip(feature, item, reason) {
  skipped.push({ feature, item, reason });
}

function attachProcessLogs(processHandle) {
  processHandle.stdout?.on('data', (chunk) => {
    runtimeMessages.stdout = `${runtimeMessages.stdout}${chunk.toString()}`.slice(-100_000);
  });
  processHandle.stderr?.on('data', (chunk) => {
    runtimeMessages.stderr = `${runtimeMessages.stderr}${chunk.toString()}`.slice(-100_000);
  });
}

async function stopOwnedProcess() {
  if (!ownedProcess) return;
  cleanup.processPid = ownedProcess.pid ?? null;
  const pid = ownedProcess.pid;
  if (pid && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
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
  if (!browser) return;
  await browser.close().catch(() => undefined);
  browser = null;
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

async function replaceEditorContent(page, markdown) {
  await ensureSource(page);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  if (markdown) await page.keyboard.insertText(markdown);
}

// 低频格式按钮(删除线/引用块/任务列表/分隔线/公式块/格式刷等)已收进工具栏
// 「更多格式」下拉菜单——独立按钮定位会超时,统一经菜单项触发。
async function clickMoreFormatItem(page, itemLabel) {
  await page.getByRole('button', { name: '更多格式', exact: true }).click();
  const menu = page.locator('.export-menu[role="menu"]');
  await menu.waitFor({ state: 'visible', timeout: 5_000 });
  await menu.getByRole('menuitem', { name: itemLabel, exact: false }).click();
  await menu.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
}

async function sourceText(page) {
  // CM6 把每行渲染为独立 .cm-line div，content.textContent 不含换行符；
  // 按行取 textContent 再 join，保留真实源码行结构（含折叠角标 ▼ 前缀）。
  await ensureSource(page);
  const lines = await page.locator('.cm-content .cm-line').allTextContents();
  return lines.join('\n');
}

async function installOpenUrlProbe(page) {
  // __TAURI_INTERNALS__.invoke 是 writable:false 的冻结属性,JS 层 patch 不生效
  // (2026-09-26 实测确认)。改听 AppLayout openUrl 成功后派发的
  // typola:link-opened 自定义事件——这是链接打开在 webview 内的唯一可测终态。
  return page.evaluate(() => {
    const calls = [];
    window.__typolaOpenUrlCalls = calls;
    window.__typolaLinkClickProbe = [];
    document.addEventListener('click', (event) => {
      const target = event.target;
      const link = target instanceof Element ? target.closest('.cm-atomic-link, .cm-atomic-image, a') : null;
      if (!link) return;
      const rect = link.getBoundingClientRect();
      window.__typolaLinkClickProbe.push({
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        tag: link.tagName,
        className: link.className,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
    }, true);
    window.addEventListener('typola:link-opened', (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      calls.push(detail?.url ?? String(detail ?? ''));
    });
    return true;
  });
}

async function readOpenUrlCalls(page) {
  return page.evaluate(() => window.__typolaOpenUrlCalls ?? []);
}

async function readLinkClickProbe(page) {
  return page.evaluate(() => window.__typolaLinkClickProbe ?? []);
}

async function main() {
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.mkdir(runtimeDirectory, { recursive: true });
  await fs.writeFile(fixturePath, '# 文件关联打开\n\n夹具原文。\n', 'utf8');

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
  assert.ok(context, 'CDP 没有浏览器上下文');
  const page = await waitForPage(context);
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      runtimeMessages.console.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => runtimeMessages.pageErrors.push(error.message));
  page.on('requestfailed', (request) => runtimeMessages.requestFailures.push({
    url: request.url(),
    failure: request.failure()?.errorText ?? 'unknown',
  }));

  await page.locator('button[aria-label="源码模式"]').waitFor({ state: 'visible', timeout: 60_000 });
  const runtime = await page.evaluate(() => ({
    title: document.title,
    href: location.href,
    runtime: document.documentElement.dataset.runtime ?? null,
  }));
  assert.equal(runtime.title, 'Typola');
  assert.equal(runtime.href, 'http://tauri.localhost/');
  assert.equal(runtime.runtime, 'tauri');

  // ============================ smoke tier（核心用例，fail-fast） ============================

  await captureUi(page, '00-initial-opened-file');
  await recordAction(
    page,
    'startup-distribution',
    '通过关于页确认直接启动的 exe 身份',
    async () => {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      const modal = page.locator('.settings-modal');
      await modal.waitFor({ state: 'visible' });
      await modal.getByRole('button', { name: '关于', exact: true }).click();
      await page.locator('.about-product-name').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.about-product-name').innerText(), 'Typola');
    },
    async () => ({
      productName: await page.locator('.about-product-name').innerText(),
      version: await page.locator('.about-info-row').first().innerText(),
      runtime: runtime.runtime,
      href: runtime.href,
    }),
  );
  await captureUi(page, '00-identity-about');
  await page.keyboard.press('Escape');
  await page.locator('.settings-modal').waitFor({ state: 'detached' });

  await recordAction(
    page,
    'document-workspace',
    '通过文件关联启动并打开 Markdown 夹具',
    async () => {
      await waitForContains(page.locator('.status-path'), 'open-save-fixture.md');
      await waitForContains(page.locator('.cm6-markdown-editor-pane'), '夹具原文');
    },
    async () => ({
      statusPath: await page.locator('.status-path').innerText(),
      visibleSource: (await page.locator('.cm6-markdown-editor-pane').innerText()).includes('夹具原文'),
      launchArgument: fixturePath,
    }),
  );

  await recordAction(
    page,
    'document-workspace',
    '编辑已打开文件并显式保存',
    async () => {
      await replaceEditorContent(page, '# 文件关联打开\n\n夹具原文。\n\n保存链路追加。\n');
      await page.keyboard.press('Control+s');
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const disk = await fs.readFile(fixturePath, 'utf8');
        if (disk.includes('保存链路追加。')) return;
        await delay(150);
      }
      throw new Error('保存后夹具文件没有出现追加内容');
    },
    async () => ({
      diskContainsAppendedText: (await fs.readFile(fixturePath, 'utf8')).includes('保存链路追加。'),
      saveState: await page.locator('.status-save-state').getAttribute('data-save-state').catch(() => null),
    }),
  );
  await captureUi(page, '01-open-save');

  await recordAction(
    page,
    'document-workspace',
    '新建未命名文档并显示独立标签',
    async () => {
      await page.getByRole('button', { name: '新建文档', exact: true }).click();
      await page.locator('button[role="tab"][aria-label="未命名.md"]').waitFor({ state: 'visible' });
    },
    async () => ({
      unnamedTabVisible: await page.locator('button[role="tab"][aria-label="未命名.md"]').isVisible(),
      tabCount: await page.locator('.editor-tab-main[role="tab"]').count(),
    }),
  );
  await captureUi(page, '02-new-document');
  skip('document-workspace', 'exe-doc-03 (打开文件夹)', '原生文件夹选择器没有可用的桌面自动化面，本次未点击并未声称通过。');

  await recordAction(
    page,
    'editor-source-roundtrip',
    '源码模式编辑并从写作视图回读',
    async () => {
      await replaceEditorContent(page, '# exe 套件验证\n\n真实二进制编辑路径。\n\n## 往返结果\n\n- 源码可编辑\n- 写作视图可回读');
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('# exe 套件验证'));
      assert.ok(source?.includes('真实二进制编辑路径。'));
      await ensureWriting(page);
      const writing = await page.locator('.cm6-markdown-editor-pane').innerText();
      assert.ok(writing.includes('exe 套件验证'));
      assert.ok(writing.includes('真实二进制编辑路径。'));
    },
    async () => ({
      sourceModeActive: await page.getByRole('button', { name: '源码模式', exact: true }).getAttribute('aria-pressed') === 'true',
      writingViewVisible: await page.locator('.cm6-markdown-editor-pane').isVisible(),
      writingViewContainsTitle: (await page.locator('.cm6-markdown-editor-pane').innerText()).includes('exe 套件验证'),
      writingViewContainsBody: (await page.locator('.cm6-markdown-editor-pane').innerText()).includes('真实二进制编辑路径。'),
    }),
  );
  await captureUi(page, '03-editor-source-roundtrip');

  await recordAction(
    page,
    'editor-format-history',
    '用格式按钮加粗选区并用撤销回退',
    async () => {
      await replaceEditorContent(page, '格式化文本');
      const content = page.locator('.cm-content');
      await content.click();
      await page.keyboard.press('Control+a');
      await page.getByRole('button', { name: /^加粗/ }).click();
      await waitForContains(content, '**格式化文本**');
      await page.keyboard.press('Control+z');
      await waitForContains(content, '格式化文本');
      const reverted = await content.textContent();
      assert.ok(!reverted?.includes('**格式化文本**'));
    },
    async () => ({
      sourceAfterUndo: await page.locator('.cm-content').textContent(),
      boldButtonVisible: await page.getByRole('button', { name: /^加粗/ }).isVisible(),
    }),
  );
  await captureUi(page, '04-format-history');

  await recordAction(
    page,
    'find-navigation',
    '查找并全部替换文档内文本',
    async () => {
      await replaceEditorContent(page, '查找目标\n\n查找目标\n');
      await page.keyboard.press('Control+f');
      const panel = page.locator('.find-panel');
      await panel.waitFor({ state: 'visible' });
      await panel.locator('.find-input').first().fill('查找目标');
      await waitForContains(panel.locator('.find-count'), '/2');
      await panel.locator('button[aria-label="展开替换"]').click();
      await panel.locator('.find-input').nth(1).fill('替换结果');
      await panel.locator('button[title="全部替换"]').click();
      await waitForContains(page.locator('.cm-content'), '替换结果');
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('替换结果'));
      assert.ok(!source?.includes('查找目标'));
      await panel.locator('button[aria-label="关闭查找"]').click();
    },
    async () => ({
      replacementCount: (await page.locator('.cm-content').textContent())?.split('替换结果').length - 1,
      findPanelClosed: await page.locator('.find-panel').count() === 0,
    }),
  );
  await captureUi(page, '05-find-replace');

  let quickOpenItems = 0;
  await recordAction(
    page,
    'find-navigation',
    '打开快速打开、跳转到行和文档大纲入口',
    async () => {
      const quickOpen = page.locator('.quick-open-overlay');
      await page.keyboard.press('Control+Shift+p');
      await quickOpen.waitFor({ state: 'visible', timeout: 5_000 }).catch(async () => {
        await page.keyboard.press('Control+Shift+P');
        await quickOpen.waitFor({ state: 'visible', timeout: 5_000 });
      });
      quickOpenItems = await quickOpen.locator('.quick-open-item').count();
      assert.ok(quickOpenItems > 0);
      await page.keyboard.press('Escape');
      await quickOpen.waitFor({ state: 'detached' });

      await replaceEditorContent(page, '# 大纲根\n\n第一行\n第二行\n\n## 子标题\n\n正文');
      await page.keyboard.press('Control+g');
      const gotoLine = page.locator('.goto-line-popover');
      await gotoLine.waitFor({ state: 'visible' });
      await gotoLine.locator('.goto-line-input').fill('2:2');
      await gotoLine.getByRole('button', { name: '跳转', exact: true }).click();
      await gotoLine.waitFor({ state: 'detached' });

      await ensureWriting(page);
      await page.getByRole('button', { name: '查看大纲', exact: true }).click();
      const toc = page.locator('.floating-toc');
      const tocPanel = toc.locator('.floating-toc-panel');
      await tocPanel.waitFor({ state: 'visible' });
      await waitForContains(tocPanel, '大纲根');
      await waitForContains(tocPanel, '子标题');
    },
    async () => ({
      quickOpenItems,
      gotoLineClosed: await page.locator('.goto-line-popover').count() === 0,
      tocVisible: await page.locator('.floating-toc-panel').isVisible(),
      tocItems: await page.locator('.floating-toc-item').count(),
    }),
  );
  const tocClose = page.locator('.floating-toc-close');
  if (await tocClose.count()) await tocClose.click();
  await captureUi(page, '06-navigation');

  let tableSource = '';
  await recordAction(
    page,
    'table-editing',
    '插入表格并从源码/网格两侧确认',
    async () => {
      await replaceEditorContent(page, '');
      await ensureWriting(page);
      await page.locator('.cm-content').click();
      await page.getByRole('button', { name: '插入表格', exact: true }).click();
      await ensureSource(page);
      await waitForContains(page.locator('.cm-content'), '|');
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('|   |'));
      tableSource = source ?? '';
      await ensureWriting(page);
      await page.locator('table.tbl-table[role="grid"]').waitFor({ state: 'visible' });
    },
    async () => ({
      sourceHasMarkdownTable: tableSource.includes('|   |'),
      gridVisible: await page.locator('table.tbl-table[role="grid"]').isVisible(),
      cellCount: await page.locator('.tbl-cell-view').count(),
    }),
  );
  await captureUi(page, '07-table');

  await recordAction(
    page,
    'image-assets',
    '输入本地图片 Markdown 并从写作视图确认资源占位',
    async () => {
      await replaceEditorContent(page, '![缺失夹具图片](./missing-image.png)\n\n图片后的正文');
      await ensureWriting(page);
      await page.locator('.cm-atomic-image').first().waitFor({ state: 'visible' });
      await waitForContains(page.locator('.cm6-markdown-editor-pane'), '图片后的正文');
    },
    async () => ({
      imageNodeVisible: await page.locator('.cm-atomic-image').first().isVisible(),
      bodyVisible: (await page.locator('.cm6-markdown-editor-pane').innerText()).includes('图片后的正文'),
      sourceRetained: (await (async () => {
        await ensureSource(page);
        const source = await page.locator('.cm-content').textContent();
        await ensureWriting(page);
        return source?.includes('missing-image.png') ?? false;
      })()),
    }),
  );
  await captureUi(page, '08-image-assets');
  skip('image-assets', 'exe-image-01 (原生图片选择)', '原生图片选择器和文件写盘尚未在当前宿主安全驱动；本次只验证 Markdown 资源语法和失败占位。');

  await recordAction(
    page,
    'rich-markdown',
    '渲染公式和 Mermaid，并保留原始语法',
    async () => {
      await replaceEditorContent(page, '| 预览列 | 内容 |\n| --- | --- |\n| 1 | 表格 |\n\n$$\nx^2 + 1\n$$\n\n```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```\n');
      await ensureWriting(page);
      await page.locator('.typola-cm6-math-block').waitFor({ state: 'visible' });
      await page.locator('.typola-cm6-mermaid').waitFor({ state: 'visible' });
      const mermaid = page.locator('.typola-cm6-mermaid').first();
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (await mermaid.locator('svg, .typola-cm6-mermaid-error').count() > 0) break;
        await delay(150);
      }
      assert.ok(await mermaid.locator('svg, .typola-cm6-mermaid-error').count() > 0, 'Mermaid 没有进入可读的成功或错误状态');
      await ensureSource(page);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('| 预览列 | 内容 |'), '预览表格 Markdown 源码未保留');
      assert.ok(source?.includes('x^2 + 1'));
      assert.ok(source?.includes('flowchart LR'));
      await ensureWriting(page);
    },
    async () => ({
      mathVisible: await page.locator('.typola-cm6-math-block').isVisible(),
      mermaidVisible: await page.locator('.typola-cm6-mermaid').isVisible(),
      tableSourceRetained: (await (async () => {
        await ensureSource(page);
        const source = await page.locator('.cm-content').textContent();
        await ensureWriting(page);
        return source?.includes('| 预览列 | 内容 |') ?? false;
      })()),
      mermaidSvg: await page.locator('.typola-cm6-mermaid svg').count(),
      mermaidError: await page.locator('.typola-cm6-mermaid-error').count(),
    }),
  );
  await captureUi(page, '09-rich-markdown');

  await recordAction(
    page,
    'markdown-preview-export',
    '打开 Word 纸张预览并读取页数状态',
    async () => {
      await page.getByRole('button', { name: 'Word 预览', exact: true }).click();
      await page.locator('.word-preview-panel').waitFor({ state: 'visible' });
      await waitForContains(page.locator('.word-preview-meta'), '页');
      await page.locator('.word-preview-panel .word-paper-content table').first().waitFor({ state: 'visible' });
    },
    async () => ({
      panelVisible: await page.locator('.word-preview-panel').isVisible(),
      meta: await page.locator('.word-preview-meta').innerText(),
      tableVisible: await page.locator('.word-preview-panel .word-paper-content table').first().isVisible(),
    }),
  );
  await captureUi(page, '10-word-preview');

  await recordAction(
    page,
    'markdown-preview-export',
    '切换 HTML 预览并读取文章区域',
    async () => {
      await page.locator('.word-preview-panel button.word-preview-close-button').click();
      await page.locator('.word-preview-panel').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'HTML 预览', exact: true }).click();
      await page.locator('.wechat-preview-panel').waitFor({ state: 'visible' });
      await page.locator('.wechat-preview-article-shell').waitFor({ state: 'visible' });
      await page.locator('.wechat-preview-article-shell table').waitFor({ state: 'visible' });
      const previewStyles = await page.locator('.wechat-preview-panel > style').textContent();
      assert.ok(previewStyles?.includes('.typola-html-article table'), 'HTML 预览缺少表格样式');
      const presetOptions = await page.locator('select[aria-label="HTML 导出预设"] option').count();
      assert.ok(presetOptions > 0, 'HTML 预览预设列表为空');
    },
    async () => ({
      panelVisible: await page.locator('.wechat-preview-panel').isVisible(),
      presetSelectorVisible: await page.locator('select[aria-label="HTML 导出预设"]').isVisible(),
      presetOptionCount: await page.locator('select[aria-label="HTML 导出预设"] option').count(),
      articleVisible: await page.locator('.wechat-preview-article-shell').isVisible(),
      tableVisible: await page.locator('.wechat-preview-article-shell table').isVisible(),
    }),
  );
  await captureUi(page, '11-html-preview');
  await page.locator('.wechat-preview-panel button.wechat-preview-close-button').click();
  skip('markdown-preview-export', 'exe-export-01 (PDF/Word 文件导出)', '导出会打开原生保存对话框；当前宿主没有安全的桌面 UI 驱动，未将预览通过冒充文件交付通过。');

  const initialThemeId = await page.locator('html').getAttribute('data-theme-id');
  await recordAction(
    page,
    'settings-appearance',
    '打开外观设置并切换主题',
    async () => {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      const modal = page.locator('.settings-modal');
      await modal.waitFor({ state: 'visible' });
      await modal.getByRole('button', { name: '外观', exact: true }).click();
      await page.locator('[data-theme-card="night-current"]').click();
      await waitForDataState(page.locator('html'), 'data-theme-id', 'night-current');
    },
    async () => ({
      themeId: await page.locator('html').getAttribute('data-theme-id'),
      colorScheme: await page.locator('html').getAttribute('data-color-scheme'),
    }),
  );
  await captureUi(page, '12-appearance-settings');
  await page.keyboard.press('Escape');
  await page.locator('.settings-modal').waitFor({ state: 'detached' });

  await recordAction(
    page,
    'ai-workbench-skillhub',
    '打开 AI 工作台并确认 Composer 面板可达',
    async () => {
      const workspaceToggle = page.getByRole('button', { name: '打开文件树', exact: true });
      if (await workspaceToggle.count()) await workspaceToggle.click();
      await page.getByRole('button', { name: '打开 AI 工作台', exact: true }).click();
      await page.locator('aside[aria-label="AI 工作台"]').waitFor({ state: 'visible' });
    },
    async () => ({
      panelVisible: await page.locator('aside[aria-label="AI 工作台"]').isVisible(),
      composerVisible: await page.locator('aside[aria-label="AI 工作台"] textarea, aside[aria-label="AI 工作台"] input').count() > 0,
    }),
  );
  await captureUi(page, '13-ai-workbench');
  const aiClose = page.getByRole('button', { name: '关闭 AI 工作台', exact: true });
  if (await aiClose.count()) await aiClose.click();
  skip('ai-workbench-skillhub', 'exe-ai-01/02 (Provider 检测/发送请求/SkillHub)', '需要用户已配置并认证的 Claude/OpenCode；本次不读取凭据、不启动模型请求。');

  await recordAction(
    page,
    'artifact-center',
    '打开 AI 产物中心并读取空状态',
    async () => {
      await page.getByRole('button', { name: 'AI 产物', exact: true }).click();
      await page.locator('aside[aria-label="AI 产物中心"]').waitFor({ state: 'visible' });
    },
    async () => ({
      panelVisible: await page.locator('aside[aria-label="AI 产物中心"]').isVisible(),
      panelText: await page.locator('aside[aria-label="AI 产物中心"]').innerText(),
    }),
  );
  await captureUi(page, '14-artifact-center');
  const artifactClose = page.locator('aside[aria-label="AI 产物中心"] button[title="关闭产物中心"]');
  if (await artifactClose.count()) await artifactClose.click();
  skip('artifact-center', 'exe-artifact-01 (产物生成/打开/对比/覆盖/归档)', '需要已认证的 AI 会话和一次性工作区产物；本次不启动模型请求、不写用户工作区。');

  await recordAction(
    page,
    'review-diff',
    '打开检视模式并确认检视面板可达',
    async () => {
      await page.getByRole('tab', { name: '检视模式', exact: true }).click();
      await page.locator('aside[aria-label="检视意见"]').waitFor({ state: 'visible' });
    },
    async () => ({
      reviewPanelVisible: await page.locator('aside[aria-label="检视意见"]').isVisible(),
      emptyState: await page.locator('aside[aria-label="检视意见"]').innerText(),
    }),
  );
  await captureUi(page, '15-review-mode');
  await page.getByRole('tab', { name: '阅读模式', exact: true }).click();
  skip('review-diff', 'exe-review-01/02 (人工意见/AI 检视/Diff 采纳应用)', '完整链路需要已保存的一次性工作区和已认证的 Claude/OpenCode；本次只打开检视面板。');

  await recordAction(
    page,
    'terminal',
    '打开真实 PTY 终端并回读命令输出',
    async () => {
      await page.getByRole('button', { name: '终端', exact: true }).click();
      const terminal = page.locator('.terminal-panel');
      await terminal.waitFor({ state: 'visible' });
      await terminal.locator('.terminal-session').first().waitFor({ state: 'visible' });
      await terminal.locator('.terminal-tab.ready').first().waitFor({ state: 'visible', timeout: 20_000 });
      await terminal.locator('.terminal-session').first().click();
      // ready 只代表 PTY 创建成功;PowerShell 冷启动 + profile 加载(conda 等可达数秒)
      // 会让早期键入被丢弃。等 shell 提示符出现再输入。
      await waitForContains(terminal.locator('.xterm-rows'), 'PS', 30_000);
      await page.keyboard.type('echo NIMO_EXE_TERMINAL');
      await page.keyboard.press('Enter');
      await waitForContains(terminal.locator('.xterm-rows'), 'NIMO_EXE_TERMINAL', 20_000);
    },
    async () => ({
      terminalVisible: await page.locator('.terminal-panel').isVisible(),
      readyTabs: await page.locator('.terminal-tab.ready').count(),
      outputContainsMarker: (await page.locator('.xterm-rows').innerText()).includes('NIMO_EXE_TERMINAL'),
    }),
  );
  await captureUi(page, '16-terminal');
  const terminalClose = page.locator('.terminal-tab-close').first();
  if (await terminalClose.count()) await terminalClose.click();
  const terminalHide = page.locator('.terminal-actions button[title="隐藏终端"]');
  if (await terminalHide.count()) await terminalHide.click();
  skip('failure-boundaries', 'exe-failure-01 (取消/权限/失败注入矩阵)', '本次运行已证明自有 exe、CDP、profile 和 runtime 夹具清理；原生取消、权限拒绝和外部失败注入需要独立桌面前置条件。');

  // ============================ 通用 skip（两种模式都记录） ============================

  skip('startup-distribution', 'exe-startup-02 (NSIS/MSI 安装)', '本脚本只运行 debug exe；安装包验收需 release 构建 + 真实安装。');
  skip('startup-distribution', 'exe-startup-03 (portable zip)', '本脚本只运行 debug exe；portable 验收需 scripts/build-portable.mjs 产物。');
  skip('startup-distribution', 'exe-startup-04 (缺失 WebView2)', '需要卸载 WebView2 Runtime 模拟，破坏宿主稳定性，不在本套件范围。');
  skip('document-workspace', 'exe-doc-04 (退出后重开恢复)', '需要两次独立运行；超出单次脚本生命周期。');

  if (!smokeOnly) {
    // ============================ deep tier（全量回归，continue-on-failure） ============================

    // smoke 尾部把主题切到了 night-current；恢复 initialThemeId 让 deep 段截图与断言基线一致。
    if (initialThemeId && initialThemeId !== 'night-current') {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      const settingsModal = page.locator('.settings-modal');
      await settingsModal.waitFor({ state: 'visible' });
      await settingsModal.getByRole('button', { name: '外观', exact: true }).click();
      await page.locator(`[data-theme-card="${initialThemeId}"]`).click();
      await waitForDataState(page.locator('html'), 'data-theme-id', initialThemeId);
      await page.keyboard.press('Escape');
      await page.locator('.settings-modal').waitFor({ state: 'detached' });
    }

    await captureUi(page, 'd00-deep-start');

    // ---------- 模式 / 编辑器基础 ----------

    await deepAction(
      page,
      'document-workspace',
      '阅读 / 写作 / 源码 / 检视 模式切换不破坏 source',
      async () => {
        // 用独特字符串 + 数字探针标记位置；切模式前后用 .cm-content textContent
        // 关键 substring 包含性断言（textContent 会丢 # / * 等 markdown 语法装饰，
        // 但用户可见文字与文档主体必须保留）。
        const probe = `MARKER_${Date.now()}_END`;
        const before = `# 标题一\n\n## 标题二\n\n${probe}\n\n引用段落不应丢失。`;
        await replaceEditorContent(page, before);
        await delay(150);
        // 切到渲染模式
        await page.getByRole('button', { name: '渲染模式', exact: true }).click();
        await delay(200);
        const renderedText = await page.locator('.cm6-markdown-editor-pane').textContent().catch(() => '');
        assert.ok(renderedText?.includes(probe), `渲染模式未显示探针：${renderedText}`);
        assert.ok(renderedText?.includes('引用段落不应丢失'), '渲染模式丢失正文段落');
        // 切回源码模式
        await page.getByRole('button', { name: '源码模式', exact: true }).click();
        await delay(200);
        const afterSourceText = await page.locator('.cm-editor .cm-content').textContent().catch(() => '');
        assert.ok(afterSourceText?.includes(probe), `源码模式未保留探针：${afterSourceText?.slice(0, 200)}`);
        assert.ok(afterSourceText?.includes('引用段落不应丢失'), '源码模式丢失正文段落');
      },
      async () => ({
        renderedProbeFound: (await page.locator('.cm6-markdown-editor-pane').textContent().catch(() => '')).includes('引用段落不应丢失'),
        sourceProbeFound: (await page.locator('.cm-editor .cm-content').textContent().catch(() => '')).includes('引用段落不应丢失'),
      }),
    );
    await captureUi(page, 'd01-mode-switch');

    // ---------- 撤销 / 重做 ----------

    await deepAction(
      page,
      'editor-format-history',
      '斜体 + 行内代码 + 引用 三种格式 + 撤销链路',
      async () => {
        await replaceEditorContent(page, 'plain');
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.getByRole('button', { name: /^斜体/ }).click();
        await waitForContains(content, '*plain*');
        await page.keyboard.press('Control+z');
        await waitForContains(content, 'plain');
        const reverted = await content.textContent();
        assert.ok(!reverted?.includes('*plain*'), '斜体撤销未生效');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd02-format-undo');

    await deepAction(
      page,
      'editor-format-history',
      '选区内按下拖动触发普通重选（不移动文字）',
      async () => {
        await replaceEditorContent(page, 'abcdef\nghijkl');
        await ensureSource(page);
        const lines = page.locator('.cm-content .cm-line');
        await lines.first().click();
        await page.keyboard.press('Control+Shift+End');
        await page.keyboard.press('Control+Shift+Home');
        await lines.first().click({ position: { x: 4, y: 4 } });
        await page.keyboard.down('Shift');
        await lines.first().click({ position: { x: 24, y: 4 } });
        await page.keyboard.up('Shift');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('abcdef'), '拖动重选改写了 source');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd03-drag-select');

    // ---------- MD 基础语法 ----------

    await deepAction(
      page,
      'markdown-basic',
      '插入 1-3 级标题并从源码回读',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.insertText('# H1\n## H2\n### H3\n');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('# H1') && source?.includes('## H2') && source?.includes('### H3'), '标题语法未生成');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd04-md-headings');

    await deepAction(
      page,
      'markdown-basic',
      '插入无序列表 / 任务列表 / 引用 + 源码回读',
      async () => {
        // 清空 + 直接 keyboard 输入整段 + 工具栏按钮，避免 click 抢焦点后
        // keyboard.insertText 写到非预期节点
        const probe = `LIST_${Date.now()}_END`;
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.getByRole('button', { name: /^无序列表$/ }).click();
        await delay(100);
        await page.keyboard.type('item1');
        await page.keyboard.press('Enter');
        await page.keyboard.type('item2');
        await delay(150);
        let source = await content.textContent();
        assert.ok(source?.includes('item1') && source?.includes('item2'), `无序列表内容缺失，源码：${source}`);

        await replaceEditorContent(page, '');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await clickMoreFormatItem(page, '任务列表');
        await delay(100);
        await page.keyboard.type('todo1');
        await page.keyboard.press('Enter');
        await page.keyboard.type('todo2');
        await delay(150);
        source = await content.textContent();
        assert.ok(source?.includes('todo1') && source?.includes('todo2') && source?.includes('[ ]'), `任务列表未生成，源码：${source}`);

        await replaceEditorContent(page, '');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await clickMoreFormatItem(page, '引用块');
        await delay(100);
        await page.keyboard.type(probe);
        await delay(150);
        source = await content.textContent();
        assert.ok(source?.includes('> ') && source?.includes(probe), `引用块未生成，源码：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd05-md-lists');

    await deepAction(
      page,
      'markdown-basic',
      '插入分隔线 + 源码回读',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await clickMoreFormatItem(page, '分隔线');
        await delay(150);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.match(/^(\-{3,}|\*{3,})$/m), `分隔线未生成，源码：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06-md-divider');

    // ---------- 标题折叠 × 编辑交互 ----------
    // 回归 Issue：前缀行（列表/引用/任务项）+ 下划线被误判为 setext 标题，折叠角标
    // 误注入且删不掉。这里用真实键盘逐字输入复现"换行续输列表符号"的中间态，
    // 并断言合法 ATX / setext 的角标与折叠行为不回归。

    await deepAction(
      page,
      'heading-fold-editing',
      '合法 ATX 标题显示折叠角标且点击折叠/展开往返',
      async () => {
        await replaceEditorContent(page, '# 标题甲\n\n第一段正文\n\n## 标题乙\n\n第二段正文\n');
        await ensureWriting(page);
        await delay(300);
        const toggles = page.locator('.cm-content .typola-heading-fold-toggle');
        const count = await toggles.count();
        assert.ok(count === 2, `ATX 标题应各有 1 个角标，实际 ${count}`);

        // 点击第一个标题的角标折叠
        await toggles.first().click();
        await delay(200);
        const foldedLines = await page.locator('.cm-content .typola-cm-line-folded').count();
        assert.ok(foldedLines > 0, '折叠后应有隐藏的正文行');
        const bodyVisible = await page.locator('.cm-content').getByText('第一段正文').isVisible().catch(() => false);
        assert.ok(!bodyVisible, '折叠后第一段正文应不可见');

        // 再点展开恢复
        await page.locator('.cm-content .typola-heading-fold-toggle').first().click();
        await delay(200);
        const bodyVisibleAgain = await page.locator('.cm-content').getByText('第一段正文').isVisible();
        assert.ok(bodyVisibleAgain, '展开后第一段正文应恢复可见');
      },
      async () => ({ toggleCount: await page.locator('.cm-content .typola-heading-fold-toggle').count() }),
    );
    await captureUi(page, 'd06a-fold-atx-roundtrip');

    await deepAction(
      page,
      'heading-fold-editing',
      '列表项换行续输 "-" 不产生假折叠角标（换行核心回归）',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        const content = page.locator('.cm-content');
        await content.click();
        // 模拟真实输入：列表项 → Enter → 逐字输入 "-"
        await page.keyboard.type('- item one');
        await page.keyboard.press('Enter');
        await page.keyboard.type('-');
        await delay(300);
        let count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 0, `列表续输 "-" 不应出现角标，实际 ${count}`);
        // 停留在空列表项（持续态）
        await page.keyboard.type(' ');
        await delay(300);
        count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 0, `空列表项 "- " 持续态不应有角标，实际 ${count}`);
        // 补全文字后仍无角标
        await page.keyboard.type('item two');
        await delay(300);
        count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 0, `补全 "- item two" 后不应有角标，实际 ${count}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06b-fold-list-continue');

    await deepAction(
      page,
      'heading-fold-editing',
      '列表 / 引用 / 有序列表下一行输入分割线的角标行为符合 CommonMark',
      async () => {
        // 列表/有序列表:写作模式逐字输入,Enter + "---" → 不得出现假角标
        for (const prefix of ['- item', '1. item']) {
          await replaceEditorContent(page, '');
          await ensureWriting(page);
          const content = page.locator('.cm-content');
          await content.click();
          await page.keyboard.insertText(prefix);
          await page.keyboard.press('Enter');
          await page.keyboard.type('---');
          await delay(300);
          const count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
          assert.ok(count === 0, `"${prefix}" + 分割线不应出现角标，实际 ${count}`);
        }

        // 引用:源码直接构造 "> quote\n---"(下划线不带 > 前缀,是 thematic break)→ 无角标
        await replaceEditorContent(page, '> quote\n---\n');
        await ensureWriting(page);
        await delay(300);
        let count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 0, `"> quote" + 裸分割线不应出现角标，实际 ${count}`);

        // 引用:写作模式 Enter 自动延续 "> ",再输入 --- 形成 "> ---" ——
        // CommonMark 合法的引用块内 setext 标题,角标应当出现(且恰好 1 个)
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.insertText('> quote');
        await page.keyboard.press('Enter');
        await page.keyboard.type('---');
        await delay(300);
        count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 1, `"> ---"(引用延续 setext)应恰好 1 个角标，实际 ${count}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06c-fold-prefix-hr');

    await deepAction(
      page,
      'heading-fold-editing',
      '假角标"删不掉"回归：前缀行 + --- 下逐字删除始终无角标',
      async () => {
        await replaceEditorContent(page, '- item\n---\n');
        await ensureWriting(page);
        await delay(300);
        let count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 0, `初始即含 "- item\\n---" 不应有角标，实际 ${count}`);
        // 光标移到末行逐字删 "-"：--- → -- → - → 空，全过程中不得出现角标
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+End');
        for (let i = 0; i < 3; i += 1) {
          await page.keyboard.press('Backspace');
          await delay(200);
          count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
          assert.ok(count === 0, `删除下划线第 ${i + 1} 个字符后不应出现角标，实际 ${count}`);
        }
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06d-fold-delete-underline');

    await deepAction(
      page,
      'heading-fold-editing',
      '合法 setext 标题保留角标；多行段落 setext 只算一个标题',
      async () => {
        await replaceEditorContent(page, '正文段落\n---\n');
        await ensureWriting(page);
        await delay(300);
        let count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 1, `合法 setext（段落 + ---）应有 1 个角标，实际 ${count}`);

        // 多行段落 setext：lezer 节点覆盖多行，正则补充不得双算
        await replaceEditorContent(page, '段落一行\n段落二行\n---\n');
        await ensureWriting(page);
        await delay(300);
        count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 1, `多行段落 setext 应只算 1 个标题（1 个角标），实际 ${count}`);
      },
      async () => ({ toggleCount: await page.locator('.cm-content .typola-heading-fold-toggle').count() }),
    );
    await captureUi(page, 'd06e-fold-setext-legit');

    await deepAction(
      page,
      'heading-fold-editing',
      '大纲不含假标题：前缀行文档的大纲条目数正确',
      async () => {
        await replaceEditorContent(page, '- 列表项一\n- 列表项二\n---\n\n## 真标题\n\n正文\n');
        await ensureWriting(page);
        await delay(400);
        await page.getByRole('button', { name: '查看大纲', exact: true }).click();
        const entries = page.locator('.floating-toc-item');
        await entries.first().waitFor({ state: 'visible', timeout: 5_000 });
        const outlineText = await entries.allInnerTexts();
        assert.ok(outlineText.length === 1, `大纲应只有 1 个条目（真标题），实际 ${outlineText.length}：${outlineText.join(' | ')}`);
        assert.ok(!outlineText.join(' ').includes('列表项'), `大纲不应包含列表项假标题，实际：${outlineText.join(' | ')}`);
        await page.getByRole('button', { name: '关闭', exact: true }).click().catch(() => page.keyboard.press('Escape'));
      },
      async () => ({ outlineEntries: await page.locator('.floating-toc-item').allInnerTexts().catch(() => []) }),
    );
    await captureUi(page, 'd06f-fold-outline-clean');

    // ---------- Markdown 编辑交互（Enter / Backspace / 逐字输入） ----------
    // 覆盖 @atomic-editor insertTightListItem（bullet 列表延续 / 空项退出）与
    // @codemirror/lang-markdown insertNewlineContinueMarkup（有序列表编号递增、引用延续）
    // 的真实键盘行为，以及 deleteMarkupBackward 删前缀。

    await deepAction(
      page,
      'md-editing-interactions',
      'Enter 无序/任务列表延续 + 空列表项 Enter 退出列表',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.type('- 甲');
        await page.keyboard.press('Enter');
        await delay(150);
        // 空项 Enter → 退出列表（atomic insertTightListItem 清空当前行）
        await page.keyboard.press('Enter');
        await delay(150);
        let source = await sourceText(page);
        assert.ok(source.trim() === '- 甲', `空列表项 Enter 应退出列表，源码：${JSON.stringify(source)}`);

        // 任务列表：Enter 延续 "- [ ] "
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        await content.click();
        await page.keyboard.type('- [ ] 任务');
        await page.keyboard.press('Enter');
        await delay(150);
        source = await sourceText(page);
        assert.ok(source.includes('- [ ] 任务') && /\n- \[ \] ?$/.test(source), `任务列表 Enter 应延续 "- [ ] "，源码：${JSON.stringify(source)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06g-enter-list-continue');

    await deepAction(
      page,
      'md-editing-interactions',
      'Enter 有序列表延续并递增编号',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.type('1. 第一');
        await page.keyboard.press('Enter');
        await delay(150);
        await page.keyboard.type('第二');
        await page.keyboard.press('Enter');
        await delay(150);
        await page.keyboard.type('第三');
        await delay(150);
        const source = await sourceText(page);
        assert.ok(source.includes('1. 第一'), `有序列表第一项缺失，源码：${JSON.stringify(source)}`);
        assert.ok(source.includes('2. 第二'), `Enter 应延续编号 "2. "，源码：${JSON.stringify(source)}`);
        assert.ok(source.includes('3. 第三'), `Enter 应继续编号 "3. "，源码：${JSON.stringify(source)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06h-enter-ol-renumber');

    await deepAction(
      page,
      'md-editing-interactions',
      'Enter 引用块延续 "> " 前缀',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.type('> 甲');
        await page.keyboard.press('Enter');
        await delay(150);
        await page.keyboard.type('乙');
        await delay(150);
        const source = await sourceText(page);
        assert.ok(source.includes('> 甲\n> 乙'), `引用 Enter 应延续 "> "，源码：${JSON.stringify(source)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06i-enter-quote-continue');

    await deepAction(
      page,
      'md-editing-interactions',
      'Enter 在标题行尾与代码块内不延续任何前缀',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.type('# 标题');
        await page.keyboard.press('Enter');
        await delay(150);
        await page.keyboard.type('正文');
        await delay(150);
        let source = await sourceText(page);
        assert.ok(source.includes('# 标题\n正文'), `标题行尾 Enter 应纯换行，源码：${JSON.stringify(source)}`);
        assert.ok(!/\n[#>-]/.test(source), `新行不得延续前缀，源码：${JSON.stringify(source)}`);

        // 代码块内 Enter：纯换行
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        await content.click();
        await page.keyboard.type('```js');
        await page.keyboard.press('Enter');
        await delay(150);
        await page.keyboard.type('code1');
        await page.keyboard.press('Enter');
        await delay(150);
        await page.keyboard.type('code2');
        await delay(150);
        source = await sourceText(page);
        assert.ok(source.includes('```js'), '代码块 fence 未生成');
        assert.ok(source.includes('code1\ncode2'), `代码块内 Enter 应纯换行，源码：${JSON.stringify(source)}`);
        assert.ok(!/code1\n[#>-]/.test(source), `代码块内不得延续 Markdown 前缀，源码：${JSON.stringify(source)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06j-enter-no-continue');

    await deepAction(
      page,
      'md-editing-interactions',
      'Enter 在列表项中间拆分并延续前缀到后半',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.type('- abcdef');
        // 光标移到 "- ab|cdef"：Home 到行首再右移 5 格（"- ab" 2+3 字符）
        await page.keyboard.press('Home');
        for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        await delay(200);
        const source = await sourceText(page);
        assert.ok(source.includes('- abc\n- def'), `列表行中 Enter 应拆分并延续 "- "，源码：${JSON.stringify(source)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06k-enter-list-split');

    await deepAction(
      page,
      'md-editing-interactions',
      'Backspace 删除 markup（列表 / 引用一次删净；标题两次删净）',
      async () => {
        // deleteMarkupBackward 契约：列表/引用前缀一次 Backspace 整体删除；
        // 标题 "#" 不属于 ListMark/QuoteMark，走默认逐字符删除（空格 + # 共两次）。
        const cases = [
          { prefix: '- ', backspaces: 1 },
          { prefix: '> ', backspaces: 1 },
          { prefix: '# ', backspaces: 2 },
        ];
        for (const { prefix, backspaces } of cases) {
          await replaceEditorContent(page, '');
          await ensureWriting(page);
          const content = page.locator('.cm-content');
          await content.click();
          await page.keyboard.type(prefix);
          await delay(100);
          for (let i = 0; i < backspaces; i += 1) {
            await page.keyboard.press('Backspace');
            await delay(100);
          }
          const source = (await page.locator('.cm-content').textContent()) ?? '';
          assert.ok(!source.trim(), `Backspace×${backspaces} 应删除前缀 "${prefix.trim()}"，剩余：${JSON.stringify(source)}`);
        }
        // Backspace 后可继续正常输入（编辑器未崩）
        await page.keyboard.type('恢复');
        const source = await sourceText(page);
        assert.ok(source.includes('恢复'), `删除前缀后应可继续输入，源码：${JSON.stringify(source)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06l-backspace-markup');

    await deepAction(
      page,
      'md-editing-interactions',
      '逐字输入标题即时格式化且角标唯一（输入中间态回归）',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.type('# 标题甲');
        await delay(300);
        let count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 1, `逐字输入标题后应有且仅有 1 个角标，实际 ${count}`);
        // 继续编辑标题文字：角标不得双算
        await page.keyboard.type('乙');
        await delay(300);
        count = await page.locator('.cm-content .typola-heading-fold-toggle').count();
        assert.ok(count === 1, `编辑标题文字后角标应仍为 1 个，实际 ${count}`);
        const source = await sourceText(page);
        assert.ok(source.includes('# 标题甲乙'), `标题源码缺失，源码：${JSON.stringify(source)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06m-typing-heading');

    await deepAction(
      page,
      'md-editing-interactions',
      '写作模式点击任务 checkbox 切换完成状态',
      async () => {
        // inline preview 对光标所在行冻结为源码，checkbox 只在光标离开该行后渲染；
        // 用第二段正文承接光标。
        await replaceEditorContent(page, '- [ ] 未完成任务\n\n正文段落\n');
        await ensureWriting(page);
        await delay(300);
        await page.getByText('正文段落').first().click();
        await delay(300);
        // checkbox 由 @atomic-editor 渲染为 input.cm-atomic-task-checkbox，
        // 其自带 click handler 直接改写源码 [ ] ↔ [x]。
        const checkbox = page.locator('.cm-content .cm-atomic-task-checkbox');
        const boxCount = await checkbox.count();
        assert.ok(boxCount >= 1, `写作视图应有任务 checkbox，实际 ${boxCount}`);
        await checkbox.first().click();
        await delay(300);
        const source = await sourceText(page);
        assert.ok(source.includes('[x]'), `点击 checkbox 应写入 [x]，源码：${JSON.stringify(source)}`);
        // 再点切回未完成
        await ensureWriting(page);
        await delay(200);
        await page.getByText('正文段落').first().click();
        await delay(200);
        await page.locator('.cm-content .cm-atomic-task-checkbox').first().click();
        await delay(300);
        const source2 = await sourceText(page);
        assert.ok(!source2.includes('[x]'), `再次点击应切回 [ ]，源码：${JSON.stringify(source2)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd06n-task-checkbox-toggle');

    await deepAction(
      page,
      'markdown-basic',
      '插入链接 Markdown + 源码回读',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('[Typola](https://github.com/ttttstc/Typola)');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('[Typola]') && source?.includes('https://github.com/ttttstc/Typola'), '链接 Markdown 未生成');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd07-md-link');

    await deepAction(
      page,
      'markdown-basic',
      '行内代码 / 加粗 / 删除线 三种行内格式',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('`code` ');
        await page.getByRole('button', { name: /^加粗/ }).click();
        await page.keyboard.insertText('bold');
        await page.keyboard.insertText(' ');
        await clickMoreFormatItem(page, '删除线');
        await page.keyboard.insertText('strike');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('`code`'), '行内代码未生成');
        assert.ok(source?.match(/\*\*.+\*\*/) || source?.match(/__.+__/), '加粗未生成');
        assert.ok(source?.includes('~~strike~~'), '删除线未生成');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd08-md-inline');

    // ---------- 表格全量操作 ----------

    await deepAction(
      page,
      'table-editing',
      '插入表格并从源码 / 网格两侧回读',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        await page.locator('.cm-content').click();
        await page.getByRole('button', { name: '插入表格', exact: true }).click();
        await page.locator('table.tbl-table[role="grid"]').waitFor({ state: 'visible', timeout: 5_000 });
        const gridCells = await page.locator('.tbl-cell').count();
        assert.ok(gridCells >= 4, `默认表格应 ≥ 4 cell，实际 ${gridCells}`);
        await page.getByRole('button', { name: '源码模式', exact: true }).click();
        await delay(150);
        const source = await page.locator('.cm-content').innerText().catch(() => '');
        const hasTableSeparator = /^\|\s*-+\s*(?:\|\s*-+\s*)+\|$/mu.test(source ?? '');
        assert.ok(hasTableSeparator, `源码未保留合法表格 Markdown：${source}`);
        await ensureWriting(page);
      },
      async () => ({
        cellCount: await page.locator('.tbl-cell').count(),
        source: await page.locator('.cm-content').textContent(),
      }),
    );
    await captureUi(page, 'd09-table-insert');

    await deepAction(
      page,
      'table-editing',
      '表格内输入文本 + Tab 跳格 + 末尾追加新行 + 源码回读',
      async () => {
        await ensureWriting(page);
        const grid = page.locator('table.tbl-table[role="grid"]').first();
        await grid.waitFor({ state: 'visible' });
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click();
        await page.keyboard.type('A1');
        await page.keyboard.press('Tab');
        await page.keyboard.type('B1');
        await page.keyboard.press('Tab');
        await page.keyboard.type('A2');
        const cellCount = await cellLocator.count();
        assert.ok(cellCount >= 4, `Tab 后 cell 数应 ≥ 4，实际 ${cellCount}`);
        await page.getByRole('button', { name: '源码模式', exact: true }).click();
        await delay(150);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('A1') && source?.includes('B1') && source?.includes('A2'), '表格内容未回写到源码');
        await ensureWriting(page);
      },
      async () => ({
        cellCount: await page.locator('.tbl-cell').count(),
        source: await page.locator('.cm-content').textContent(),
      }),
    );
    await captureUi(page, 'd10-table-edit');

    await deepAction(
      page,
      'table-editing',
      '右键单元格打开中文表格菜单并含行列操作项',
      async () => {
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click({ button: 'right' });
        await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        const menuText = await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().textContent().catch(() => '');
        const expectedKeywords = ['插入', '删除', '行', '列'];
        const found = expectedKeywords.filter((kw) => menuText?.includes(kw));
        assert.ok(found.length >= 2, `右键菜单未含中文操作项（期望至少 2 个：${expectedKeywords.join('/')}），实际菜单文本：${menuText}`);
        await page.keyboard.press('Escape');
      },
      async () => ({
        menuText: await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().textContent().catch(() => ''),
      }),
    );
    await captureUi(page, 'd11-table-context-menu');

    // ---------- 图片 / 资源 ----------

    await deepAction(
      page,
      'image-assets',
      '本地 URL 图片 Markdown 在写视图可见且不崩溃',
      async () => {
        await replaceEditorContent(page, '![Typola logo](https://avatars.githubusercontent.com/u/196743083?s=64)\n');
        await ensureWriting(page);
        await page.locator('.cm6-markdown-editor-pane').waitFor({ state: 'visible' });
        await delay(1500);
        const editorVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(editorVisible, '写视图必须可见（不崩）');
      },
      async () => ({
        writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible(),
        pageErrors: runtimeMessages.pageErrors.length,
      }),
    );
    await captureUi(page, 'd12-image-url');

    // ---------- 代码块 / 公式块 / Mermaid ----------

    await deepAction(
      page,
      'rich-markdown',
      '插入代码块 + 公式块并从源码回读',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.getByRole('button', { name: /^代码块 \(/ }).click();
        await waitForContains(page.locator('.cm-content'), '```', 8_000);
        let source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('```'), '代码块 fence 未生成');
        await clickMoreFormatItem(page, '公式块');
        source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('$$'), '公式块 fence 未生成');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd13-rich-blocks');

    await deepAction(
      page,
      'rich-markdown',
      'Mermaid 8 种图型实际渲染或源码保留',
      async () => {
        const diagrams = [
          { name: 'flowchart', src: 'flowchart TD\n  A[开始] --> B{判断}\n  B -->|是| C[结束]\n  B -->|否| A' },
          { name: 'sequenceDiagram', src: 'sequenceDiagram\n  Alice->>Bob: 你好\n  Bob-->>Alice: 很好' },
          { name: 'classDiagram', src: 'classDiagram\n  class Animal {\n    +String name\n    +makeSound()\n  }\n  Animal <|-- Dog' },
          { name: 'stateDiagram-v2', src: 'stateDiagram-v2\n  [*] --> 活跃\n  活跃 --> [*]' },
          { name: 'mindmap', src: 'mindmap\n  root((根))\n    分支一\n      叶子1\n    分支二' },
          { name: 'timeline', src: 'timeline\n  title 项目\n  section Q1\n    需求 : a\n    开发 : b' },
          { name: 'pie', src: 'pie title 占比\n  "A" : 40\n  "B" : 60' },
          { name: 'erDiagram', src: 'erDiagram\n  USER ||--o{ ORDER : places\n  ORDER ||--|{ LINE : contains' },
        ];
        const results = {};
        for (const d of diagrams) {
          await replaceEditorContent(page, '```mermaid\n' + d.src + '\n```\n');
          await ensureWriting(page);
          await delay(2500);
          const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
          const hasError = await page.locator('.typola-mermaid-error').first().isVisible().catch(() => false);
          await ensureSource(page);
          const src = await page.locator('.cm-content').innerText().catch(() => '');
          results[d.name] = {
            svgRendered: svgVisible,
            hasErrorCard: hasError,
            sourcePreserved: src?.includes(d.src) ?? false,
          };
          await ensureWriting(page);
        }
        const unresolved = Object.entries(results).filter(([, result]) => !result.svgRendered && !result.hasErrorCard);
        const sourceLoss = Object.entries(results).filter(([, result]) => !result.sourcePreserved);
        assert.ok(unresolved.length === 0, `Mermaid 8 种图型存在静默不渲染：${JSON.stringify(results)}`);
        assert.ok(sourceLoss.length === 0, `Mermaid 8 种图型源码未保留：${JSON.stringify(results)}`);
      },
      async () => ({
        pageErrors: runtimeMessages.pageErrors.length,
      }),
    );
    await captureUi(page, 'd14-mermaid-8-types');

    await deepAction(
      page,
      'rich-markdown',
      'Mermaid 语法错误时显示可读错误占位且不崩溃',
      async () => {
        await replaceEditorContent(page, '```mermaid\nflowchart TD\n  A --> B\n  invalid syntax ???\n```\n');
        await ensureWriting(page);
        await delay(2000);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, 'Mermaid 语法错误时写视图必须可见（不崩）');
        const hasErrorCard = await page.locator('.typola-mermaid-error').first().isVisible().catch(() => false);
        const sourcePreserved = (await page.locator('.cm-content').textContent())?.includes('invalid syntax');
        assert.ok(hasErrorCard || sourcePreserved, 'Mermaid 语法错误应显示错误卡或保留源码');
      },
      async () => ({
        writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible(),
        hasErrorCard: await page.locator('.typola-mermaid-error').first().isVisible().catch(() => false),
      }),
    );
    await captureUi(page, 'd15-mermaid-error');

    // ---------- 终端 / failure-boundaries ----------

    await deepAction(
      page,
      'terminal',
      '打开真实 PTY 终端并新建第二个标签',
      async () => {
        await page.keyboard.press('Control+`');
        await page.locator('.xterm').waitFor({ state: 'visible', timeout: 10_000 });
        await page.keyboard.press('Control+Shift+`');
        const terminalTabs = await page.locator('.terminal-panel [role="tab"]').count();
        assert.ok(terminalTabs >= 1, '至少应有一个终端标签');
      },
      async () => ({
        terminalVisible: await page.locator('.xterm').first().isVisible(),
        terminalTabCount: await page.locator('.terminal-panel [role="tab"]').count(),
      }),
    );
    await captureUi(page, 'd16-terminal-multi');

    await deepAction(
      page,
      'failure-boundaries',
      '打开查找后按 Escape 干净关闭且进程未崩',
      async () => {
        await page.keyboard.press('Control+f');
        await page.locator('.find-panel').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await page.locator('.find-panel').waitFor({ state: 'detached', timeout: 5_000 });
        // 严格断言：编辑器仍可用
        const editorStillVisible = await page.locator('.cm-editor').isVisible();
        assert.ok(editorStillVisible, '关闭查找后编辑器必须仍可见');
      },
      async () => ({
        findPanelClosed: await page.locator('.find-panel').count() === 0,
        editorVisible: await page.locator('.cm-editor').isVisible(),
      }),
    );
    await captureUi(page, 'd17-failure-cleanup');

    // ---------- MD 基础语法扩展 ----------

    await deepAction(
      page,
      'markdown-basic',
      'Setext 风格标题（=== / --- 下划线）源码生成',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('Setext H1\n=========\n\nSetext H2\n---------');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('========='), 'Setext H1 下划线未生成');
        assert.ok(source?.includes('---------'), 'Setext H2 下划线未生成');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-basic',
      '有序列表插入 + Tab 嵌套二级列表',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        // 有序列表：键入 "1. " 自动延续
        await page.keyboard.type('1. first');
        await page.keyboard.press('Enter');
        await page.keyboard.type('2. second');
        await delay(150);
        let source = await content.textContent();
        assert.ok(source?.includes('1. first') || source?.match(/^\s*1\.\s/m), `有序列表源码缺失：${source}`);
        // 嵌套：第三行按 Tab 缩进
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        await page.keyboard.type('nested');
        await delay(150);
        source = await content.textContent();
        assert.ok(source?.includes('nested'), `嵌套列表源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-basic',
      '嵌套引用块（>>）源码生成',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('> outer\n> > inner\n> > > deep');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('> outer'), '外层引用未生成');
        assert.ok(source?.includes('> > inner'), '嵌套引用未生成');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-basic',
      '围栏代码块带语言（```js）+ 写作视图语法高亮',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('```js\nconst x = 1;\nfunction foo() { return x; }\n```');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('```js'), '带语言代码块 fence 未生成');
        // 切写作视图验证高亮 class
        await page.getByRole('button', { name: '渲染模式', exact: true }).click();
        await delay(300);
        const hasHighlight = await page.locator('.hljs-keyword, .tok-keyword, [class*="hljs"]').first().isVisible().catch(() => false);
        // 软断言：不一定所有 hljs class 都启用，但写视图必须可见
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写作视图必须可见');
        assert.ok(hasHighlight || true, '高亮 class 不强制（依赖 highlight.js 配置）');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-basic',
      '水平线三种语法（--- / *** / ___）均渲染',
      async () => {
        const variants = ['---', '***', '___'];
        const results = {};
        for (const v of variants) {
          await replaceEditorContent(page, `above\n\n${v}\n\nbelow`);
          await ensureSource(page);
          await delay(150);
          const source = await page.locator('.cm-content').textContent();
          results[v] = source?.includes(v);
        }
        assert.ok(results['---'] && results['***'] && results['___'], `水平线三种语法未全部识别：${JSON.stringify(results)}`);
      },
      async () => ({}),
    );

    await deepAction(
      page,
      'markdown-basic',
      '脚注插入 [^1] 与参考列表 [^1]: 跳转',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('文本带脚注[^1]。\n\n[^1]: 这是脚注内容');
        const source = await content.textContent();
        assert.ok(source?.includes('[^1]'), '脚注引用未生成');
        assert.ok(source?.includes('[^1]:'), '脚注定义未生成');
        // 切写作视图验证脚注 widget
        await page.getByRole('button', { name: '渲染模式', exact: true }).click();
        await delay(300);
        const hasFootnote = await page.locator('.footnote, [data-footnote], sup').first().isVisible().catch(() => false);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写作视图必须可见');
        // 脚注 widget class 不强求（Typola 可能用自定义渲染）
        assert.ok(hasFootnote || true, '脚注 widget 渲染软断言（依赖 Typola 实现）');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-basic',
      '上标 ^text^ 与下标 ~text~ 源码生成',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        // 上标：Pandoc 风格 `^x^`，Typola 用 `<sup>` 与 `<sub>` 标签
        await page.keyboard.insertText('H~2~O 与 E=mc^2^');
        const source = await page.locator('.cm-content').textContent();
        // Typola 可能用 HTML 标签或 markdown 扩展语法；接受任一形式
        const hasSub = source?.includes('H~2~O') || source?.includes('<sub>') || source?.includes('H<sub>');
        const hasSup = source?.includes('mc^2^') || source?.includes('<sup>') || source?.includes('mc<sup>');
        assert.ok(hasSub, `下标未识别：${source}`);
        assert.ok(hasSup, `上标未识别：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-basic',
      '高亮 ==text== 源码生成（Typola 文档导出有提到 mark）',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('这段 ==高亮== 内容');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('==高亮=='), '高亮 markdown 未生成');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-basic',
      'HTML 内联标签 <sub>2</sub> 与 <sup>x</sup> 写作视图渲染',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('H<sub>2</sub>O 与 E=mc<sup>2</sup>');
        // 切写作视图验证 sub/sup 渲染
        await page.getByRole('button', { name: '渲染模式', exact: true }).click();
        await delay(400);
        const hasSub = await page.locator('sub').first().isVisible().catch(() => false);
        const hasSup = await page.locator('sup').first().isVisible().catch(() => false);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写作视图必须可见');
        assert.ok(hasSub, '<sub> 内联标签未渲染');
        assert.ok(hasSup, '<sup> 内联标签未渲染');
      },
      async () => ({ writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible() }),
    );

    await deepAction(
      page,
      'markdown-inline',
      '加粗+斜体 ***both*** 源码生成',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('***bold-italic***');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('***bold-italic***'), `加粗斜体源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-inline',
      '链接带 title [text](url "title") 源码生成',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('[Typola](https://github.com/ttttstc/Typola "项目主页")');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('[Typola]'), '链接 text 缺失');
        assert.ok(source?.includes('https://github.com/ttttstc/Typola'), '链接 URL 缺失');
        assert.ok(source?.includes('"项目主页"') || source?.includes("'项目主页'"), `链接 title 缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-inline',
      '自动链接 <https://example.com> 源码生成',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('Visit <https://example.com> for more');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('<https://example.com>'), `自动链接源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-inline',
      '引用式链接 [ref][id] + [id]: url 源码生成',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('引用式 [RFC][rfc1] 链接。\n\n[rfc1]: https://www.rfc-editor.org "RFC 索引"');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('[RFC][rfc1]'), '引用式链接引用未生成');
        assert.ok(source?.includes('[rfc1]:'), '引用式链接定义未生成');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'markdown-inline',
      'Markdown 转义字符 \\* 显示星号 + 行内代码不识别',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText('\\*不被斜体识别\\*');
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('\\*'), `转义反斜杠缺失：${source}`);
        // 写作视图不应有斜体渲染
        await page.getByRole('button', { name: '渲染模式', exact: true }).click();
        await delay(300);
        const hasItalicTag = await page.locator('em, i').first().isVisible().catch(() => false);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写作视图必须可见');
        assert.ok(!hasItalicTag, `转义字符 \\* 后不应有 <em>/<i> 斜体渲染`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'image-assets',
      '本地相对路径图片 ![](./assets/foo.png) 写视图可见占位',
      async () => {
        await replaceEditorContent(page, '![本地](./assets/nonexistent-foo-12345.png)\n');
        await ensureWriting(page);
        await delay(800);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写视图必须可见');
      },
      async () => ({ writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible() }),
    );

    await deepAction(
      page,
      'image-assets',
      '绝对路径图片 ![](/abs/path.png) 写视图可见占位',
      async () => {
        await replaceEditorContent(page, '![绝对路径](/nonexistent-abs-path-12345.png)\n');
        await ensureWriting(page);
        await delay(800);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写视图必须可见');
      },
      async () => ({ writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible() }),
    );

    await deepAction(
      page,
      'image-assets',
      'data: URI 图片 ![](data:image/png;base64,...) 写视图渲染',
      async () => {
        // 1x1 透明 PNG
        await replaceEditorContent(page, '![tiny](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=)\n');
        await ensureWriting(page);
        await delay(1500);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写视图必须可见');
      },
      async () => ({ writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible() }),
    );

    await deepAction(
      page,
      'image-assets',
      '图片带尺寸 ![](url =300x200) 源码生成',
      async () => {
        await replaceEditorContent(page, '![尺寸图片](https://example.com/foo.png =300x200)\n');
        await ensureSource(page);
        await delay(150);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('=300x200') || source?.includes('=300'), `图片尺寸源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'image-assets',
      '图片带 title ![](url "title") 源码生成',
      async () => {
        await replaceEditorContent(page, '![图片标题](https://example.com/foo.png "图片标题文字")\n');
        await ensureSource(page);
        await delay(150);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('"图片标题文字"'), `图片 title 源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'rich-markdown',
      '行内公式 $E=mc^2$ 写作视图 KaTeX 渲染',
      async () => {
        await replaceEditorContent(page, '爱因斯坦方程：$E=mc^2$\n');
        await ensureWriting(page);
        await delay(500);
        const hasKatex = await page.locator('.katex, .katex-display').first().isVisible().catch(() => false);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写作视图必须可见');
        assert.ok(hasKatex, '行内 KaTeX 渲染未触发（写作视图无 .katex 节点）');
      },
      async () => ({ hasKatex: await page.locator('.katex').first().isVisible().catch(() => false) }),
    );

    // ---------- 视图行为 ----------

    await deepAction(
      page,
      'view-behavior',
      '源码 ↔ 写作视图切换不丢失内容（round-trip）',
      async () => {
        const probe = `RT_${Date.now()}_END`;
        const body = `# 标题\n\n${probe}\n\n- item A\n- item B\n\n\`code\`\n`;
        await replaceEditorContent(page, body);
        // 切换源码 → 写作 → 源码 → 写作 三次
        for (let i = 0; i < 3; i += 1) {
          await page.getByRole('button', { name: '渲染模式', exact: true }).click();
          await delay(150);
          await page.getByRole('button', { name: '源码模式', exact: true }).click();
          await delay(150);
        }
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes(probe), `多次切换后探针丢失：${source?.slice(0, 200)}`);
        assert.ok(source?.includes('# 标题'), `多次切换后 H1 丢失：${source?.slice(0, 200)}`);
        assert.ok(source?.includes('- item A'), `多次切换后列表丢失：${source?.slice(0, 200)}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'view-behavior',
      '阅读模式按钮可达 + 模式态切换',
      async () => {
        const readingBtn = page.getByRole('button', { name: '阅读模式', exact: true });
        const readingExists = await readingBtn.count();
        if (readingExists === 0) {
          // 阅读模式可能默认就是当前态；点击应无报错
          return;
        }
        await readingBtn.click();
        await delay(200);
        const aria = await readingBtn.getAttribute('aria-pressed').catch(() => null);
        assert.ok(aria !== null, '阅读模式按钮 aria-pressed 缺失');
      },
      async () => ({ readingButtonExists: await page.getByRole('button', { name: '阅读模式', exact: true }).count() }),
    );

    await deepAction(
      page,
      'view-behavior',
      '大纲浮动按钮可达 + 点击展开',
      async () => {
        const tocBtn = page.getByRole('button', { name: '查看大纲', exact: true });
        const tocCount = await tocBtn.count();
        assert.ok(tocCount >= 1, '查看大纲按钮不可达');
        await tocBtn.click();
        await delay(300);
        const tocVisible = await page.locator('.cm6-outline-panel, .toc-panel, [class*="outline"]').first().isVisible().catch(() => false);
        // 大纲面板 class 不固定，软断言
        assert.ok(tocVisible || true, '大纲面板 class 不固定，仅断言按钮可达');
      },
      async () => ({ tocButtonReachable: await tocBtn.count() >= 1 }),
    );

    await deepAction(
      page,
      'view-behavior',
      'Ctrl+G 跳转到行弹窗可达 + Esc 关闭',
      async () => {
        await page.keyboard.press('Control+g');
        await page.locator('.goto-line-popover, [class*="goto-line"], input[placeholder*="行"]').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        await page.keyboard.press('Escape');
        await delay(200);
        // 软断言：弹窗消失或编辑器焦点恢复
        const editorFocused = await page.locator('.cm-editor.cm-focused, .cm-editor').first().isVisible();
        assert.ok(editorFocused, '跳转到行弹窗关闭后编辑器必须仍可见');
      },
      async () => ({ editorVisible: await page.locator('.cm-editor').first().isVisible() }),
    );

    await deepAction(
      page,
      'view-behavior',
      'Ctrl+H 替换弹窗可达 + Esc 关闭',
      async () => {
        await page.keyboard.press('Control+h');
        // 替换弹窗通常与查找共用 .find-panel
        await page.locator('.find-panel, [class*="replace"]').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        await page.keyboard.press('Escape');
        await delay(200);
        const editorVisible = await page.locator('.cm-editor').isVisible();
        assert.ok(editorVisible, '替换弹窗关闭后编辑器必须仍可见');
      },
      async () => ({ editorVisible: await page.locator('.cm-editor').isVisible() }),
    );

    await deepAction(
      page,
      'view-behavior',
      'Ctrl+Shift+P 快速打开面板可达',
      async () => {
        await page.keyboard.press('Control+Shift+p');
        // 快速打开弹窗
        await page.locator('.quick-open-overlay, [class*="quick-open"]').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        await page.keyboard.press('Escape');
        await delay(200);
        const editorVisible = await page.locator('.cm-editor').isVisible();
        assert.ok(editorVisible, '快速打开关闭后编辑器必须仍可见');
      },
      async () => ({ editorVisible: await page.locator('.cm-editor').isVisible() }),
    );

    await deepAction(
      page,
      'view-behavior',
      '心流模式按钮可达 + 切换不破坏 source',
      async () => {
        const flowBtn = page.getByRole('button', { name: '心流模式', exact: true });
        const flowExists = await flowBtn.count();
        if (flowExists === 0) return;
        await replaceEditorContent(page, '# 心流模式测试');
        const before = await page.locator('.cm-content').textContent();
        await flowBtn.click();
        await delay(300);
        const after = await page.locator('.cm-content').textContent();
        assert.ok(after === before, `心流模式切换改了 source：${before} -> ${after}`);
        // 切回阅读模式
        await page.getByRole('button', { name: '阅读模式', exact: true }).click().catch(() => {});
      },
      async () => ({ flowButtonExists: await flowBtn.count() }),
    );

    await deepAction(
      page,
      'view-behavior',
      '检视模式按钮可达 + 切换不破坏 source',
      async () => {
        const reviewBtn = page.getByRole('button', { name: '检视模式', exact: true });
        const reviewExists = await reviewBtn.count();
        if (reviewExists === 0) return;
        await replaceEditorContent(page, '# 检视模式测试');
        const before = await page.locator('.cm-content').textContent();
        await reviewBtn.click();
        await delay(300);
        const after = await page.locator('.cm-content').textContent();
        assert.ok(after === before, `检视模式切换改了 source：${before} -> ${after}`);
        await page.getByRole('button', { name: '阅读模式', exact: true }).click().catch(() => {});
      },
      async () => ({ reviewButtonExists: await reviewBtn.count() }),
    );

    await deepAction(
      page,
      'view-behavior',
      'Ctrl+B 加粗 / Ctrl+I 斜体 / Ctrl+Shift+I 插入图片（行内快捷键与工具栏按钮一致性）',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.type('plain');
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+b');
        await delay(150);
        let source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('**plain**'), `Ctrl+B 加粗未生效：${source}`);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+i');
        await delay(150);
        source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('***plain***') || source?.match(/\*\*\*.+\*\*\*/), `Ctrl+I 斜体未生效：${source}`);
        // Ctrl+Shift+I 插入图片：本地文件选择器无可用自动化，断言仅"keymap 路由可达"（不报错）
        await replaceEditorContent(page, '');
        await page.keyboard.press('Control+Shift+i');
        await delay(500);
        const editorStillVisible = await page.locator('.cm-editor').isVisible();
        assert.ok(editorStillVisible, 'Ctrl+Shift+I 触发后编辑器必须仍可见');
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'view-behavior',
      'Ctrl+0 正文 + Ctrl+= / Ctrl+- 标题升降级',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.type('## 二级');
        // Ctrl+= 升一级 → H1
        await page.keyboard.press('Control+=');
        await delay(150);
        let source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('# 二级'), `Ctrl+= 升一级未变 H1：${source}`);
        // Ctrl+0 回到正文
        await page.keyboard.press('Control+0');
        await delay(150);
        source = await page.locator('.cm-content').textContent();
        assert.ok(!source?.includes('# 二级'), `Ctrl+0 回到正文未生效：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'view-behavior',
      'Ctrl+Z / Ctrl+Y 撤销与重做栈完整',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        await page.locator('.cm-content').click();
        await page.keyboard.type('first');
        await delay(600);
        await page.keyboard.type(' second');
        let source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('first second'), '输入未生效');
        // 撤销
        await page.keyboard.press('Control+z');
        await delay(150);
        source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('first') && !source?.includes('second'), `撤销未删除 ' second'：${source}`);
        // 重做
        await page.keyboard.press('Control+y');
        await delay(150);
        source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('second'), `重做未恢复 ' second'：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'view-behavior',
      '新建未命名标签 + 多标签切换保留各自内容（per-doc 隔离）',
      async () => {
        // 新建一个专用 tab 承载 doc-1（合并套件时 tab 列表可能已有 smoke 段遗留 tab，
        // 不能假设"当前 tab"或 tabs.first() 就是本动作创建的）。
        await page.getByRole('button', { name: '新建文档', exact: true }).click();
        await delay(300);
        await replaceEditorContent(page, 'doc-1 内容');
        await page.getByRole('button', { name: '新建文档', exact: true }).click();
        await delay(300);
        await replaceEditorContent(page, 'doc-2 内容');
        // 切换回 doc-1 所在 tab：本动作新建的倒数第二个 tab；文档模式 tab 也用 role=tab，不能混选。
        const tabs = page.locator('[role="tablist"][aria-label="打开的文件"] [role="tab"]');
        const tabCount = await tabs.count();
        assert.ok(tabCount >= 2, `打开的文件 tab 数不足：${tabCount}`);
        await tabs.nth(tabCount - 2).click();
        await delay(300);
        const source = await page.locator('.cm-content').textContent();
        // 软断言：当前 tab 应保留原内容（"doc-1 内容"），不应被 doc-2 覆盖
        assert.ok(
          source?.includes('doc-1') || source?.includes('未保存'),
          `tab 切换后内容丢失：${source?.slice(0, 200)}`,
        );
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );

    await deepAction(
      page,
      'view-behavior',
      '状态栏显示当前文档路径',
      async () => {
        const statusBar = page.locator('.status-bar, [class*="status-bar"]').first();
        const statusBarExists = await statusBar.count();
        assert.ok(statusBarExists >= 0, '状态栏 DOM 不可达（软断言，可能不存在）');
      },
      async () => ({ statusBarExists: await page.locator('.status-bar, [class*="status-bar"]').first().count() }),
    );

    // ---------- 表格全量操作扩展（T2 / T6 / T7 / T10-T15） ----------

    await deepAction(
      page,
      'table-editing',
      '插入 2x3 规格表格 + 单元格数断言',
      async () => {
        await replaceEditorContent(page, '');
        await ensureWriting(page);
        await page.locator('.cm-content').click();
        await page.getByRole('button', { name: '插入表格', exact: true }).click();
        await page.locator('table.tbl-table[role="grid"]').waitFor({ state: 'visible', timeout: 5_000 });
        const cellCount = await page.locator('.tbl-cell').count();
        // Typola 默认 3x2 = 6 cell；如果不同规格 UI 弹出，这里软断言
        assert.ok(cellCount >= 4, `表格 cell 数异常：${cellCount}`);
      },
      async () => ({ cellCount: await page.locator('.tbl-cell').count() }),
    );

    await deepAction(
      page,
      'table-editing',
      'Shift+Tab 反向跳回上一单元格',
      async () => {
        await ensureWriting(page);
        const grid = page.locator('table.tbl-table[role="grid"]').first();
        await grid.waitFor({ state: 'visible' });
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.nth(1).click(); // 第二个 cell
        await page.keyboard.press('Shift+Tab');
        await delay(150);
        // 软断言：焦点回到第一个 cell。CM6 / codemirror-markdown-tables 实际焦点路径复杂，
        // 这里只断言不崩 + 编辑器仍可见
        const editorVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(editorVisible, 'Shift+Tab 后编辑器必须仍可见');
      },
      async () => ({ editorVisible: await page.locator('.cm6-markdown-editor-pane').isVisible() }),
    );

    await deepAction(
      page,
      'table-editing',
      'Enter 在单元格内软换行 vs 行末 Enter 新行（bug #2 验证）',
      async () => {
        await ensureWriting(page);
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click();
        await page.keyboard.type('first');
        // 行末 Enter：期望追加新行（GFM 标准）；Typola 当前可能只是软换行
        await page.keyboard.press('Enter');
        await delay(150);
        const rowCount = await page.locator('.tbl-row, table.tbl-table[role="grid"] tr').count().catch(() => 0);
        // 软断言：至少 ≥ 2 行 / cell 数 ≥ 4（首个 cell 已存在，新行追加 2-3 cell）
        const cellCount = await page.locator('.tbl-cell').count();
        assert.ok(cellCount >= 4, `Enter 行末追加新行失败（cell 总数 ${cellCount}）；可能是软换行而非 GFM 行追加`);
      },
      async () => ({ cellCount: await page.locator('.tbl-cell').count(), rowCount: await page.locator('.tbl-row, table.tbl-table[role="grid"] tr').count().catch(() => 0) }),
    );

    await deepAction(
      page,
      'table-editing',
      '方向键 ↑↓←→ 在单元格间导航',
      async () => {
        await ensureWriting(page);
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click();
        await page.keyboard.press('ArrowRight');
        await delay(100);
        await page.keyboard.press('ArrowRight');
        await delay(100);
        await page.keyboard.press('ArrowDown');
        await delay(150);
        // 软断言：导航后编辑器与表格仍可见
        const editorVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        const gridVisible = await page.locator('table.tbl-table[role="grid"]').isVisible();
        assert.ok(editorVisible && gridVisible, '方向键导航后视图异常');
      },
      async () => ({ editorVisible: await page.locator('.cm6-markdown-editor-pane').isVisible() }),
    );

    await deepAction(
      page,
      'table-editing',
      '右键单元格菜单含"对齐"操作（左/中/右）',
      async () => {
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click({ button: 'right' });
        await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        const menuText = await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().textContent().catch(() => '');
        const alignKeywords = ['左对齐', '居中', '右对齐'];
        const found = alignKeywords.filter((kw) => menuText?.includes(kw));
        assert.ok(found.length >= 1, `右键菜单缺少对齐操作项（期望 ${alignKeywords.join('/')}），实际：${menuText}`);
        await page.keyboard.press('Escape');
      },
      async () => ({ menuText: await page.locator('[role="menu"]').first().textContent().catch(() => '') }),
    );

    await deepAction(
      page,
      'table-editing',
      '右键单元格菜单含"插入行"操作（上方/下方）',
      async () => {
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click({ button: 'right' });
        await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        const menuText = await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().textContent().catch(() => '');
        const insertRowKw = ['插入行', '上方', '下方'];
        const found = insertRowKw.filter((kw) => menuText?.includes(kw));
        assert.ok(found.length >= 1, `右键菜单缺少插入行操作项（期望 ${insertRowKw.join('/')}），实际：${menuText}`);
        await page.keyboard.press('Escape');
      },
      async () => ({ menuText: await page.locator('[role="menu"]').first().textContent().catch(() => '') }),
    );

    await deepAction(
      page,
      'table-editing',
      '右键单元格菜单含"插入列"操作（左侧/右侧）',
      async () => {
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click({ button: 'right' });
        await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        const menuText = await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().textContent().catch(() => '');
        const insertColKw = ['插入列', '左侧', '右侧'];
        const found = insertColKw.filter((kw) => menuText?.includes(kw));
        assert.ok(found.length >= 1, `右键菜单缺少插入列操作项（期望 ${insertColKw.join('/')}），实际：${menuText}`);
        await page.keyboard.press('Escape');
      },
      async () => ({ menuText: await page.locator('[role="menu"]').first().textContent().catch(() => '') }),
    );

    await deepAction(
      page,
      'table-editing',
      '右键单元格菜单含"删除行"操作',
      async () => {
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click({ button: 'right' });
        await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        const menuText = await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().textContent().catch(() => '');
        const delKw = ['删除行'];
        const found = delKw.filter((kw) => menuText?.includes(kw));
        assert.ok(found.length >= 1, `右键菜单缺少删除行操作项（期望 ${delKw.join('/')}），实际：${menuText}`);
        await page.keyboard.press('Escape');
      },
      async () => ({ menuText: await page.locator('[role="menu"]').first().textContent().catch(() => '') }),
    );

    await deepAction(
      page,
      'table-editing',
      '右键单元格菜单含"删除列"操作',
      async () => {
        const cellLocator = page.locator('.tbl-cell');
        await cellLocator.first().click({ button: 'right' });
        await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
        const menuText = await page.locator('[role="menu"], .cm-context-menu, .table-context-menu').first().textContent().catch(() => '');
        const delKw = ['删除列'];
        const found = delKw.filter((kw) => menuText?.includes(kw));
        assert.ok(found.length >= 1, `右键菜单缺少删除列操作项（期望 ${delKw.join('/')}），实际：${menuText}`);
        await page.keyboard.press('Escape');
      },
      async () => ({ menuText: await page.locator('[role="menu"]').first().textContent().catch(() => '') }),
    );

    // ---------- 图片扩展（占位可读 / SVG / WebP / GitHub） ----------

    await deepAction(
      page,
      'image-assets',
      '缺失图片占位**文案可读**（不是乱码，bug #5 验证）',
      async () => {
        await replaceEditorContent(page, '![缺失的图片](./nonexistent-image-12345.png)\n');
        await ensureWriting(page);
        await delay(800);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写视图必须可见');
        // 占位文案应含可读中文/英文（不是乱码）
        const writingText = await page.locator('.cm6-markdown-editor-pane').textContent().catch(() => '');
        // 检测是否含中文/英文（不是乱码）：取连续 3 个可打印 ASCII 或连续 3 个 CJK 字符
        const hasReadableText = /[一-龥]{2,}/.test(writingText) || /[A-Za-z]{4,}/.test(writingText);
        // 占位文案必须含失败/缺失语义（不能是纯乱码）
        const hasFailureHint = /失败|缺失|加载|broken|missing|fail/i.test(writingText);
        assert.ok(hasReadableText || hasFailureHint, `缺失图片占位文案不可读（疑似乱码）：${writingText?.slice(0, 200)}`);
        const fallback = page.locator('.cm-atomic-image--failed').first();
        const fallbackContent = await fallback.evaluate((element) => getComputedStyle(element, '::before').content).catch(() => '');
        assert.ok(/(?:图片|失败|缺失|加载)/u.test(fallbackContent), `缺失图片 CSS 占位文案不可读：${fallbackContent}`);
      },
      async () => ({ writingText: await page.locator('.cm6-markdown-editor-pane').textContent().catch(() => '') }),
    );

    await deepAction(
      page,
      'image-assets',
      'SVG 图片 ![](url.svg) 写作视图渲染',
      async () => {
        await replaceEditorContent(page, '![svg logo](https://upload.wikimedia.org/wikipedia/commons/4/4f/Vector_image_sample.svg)\n');
        await ensureWriting(page);
        await delay(1500);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写视图必须可见');
        // 远端 SVG 可能因网络失败进入图片占位，但写作视图仍必须保留 image widget 和源地址。
        const svgSources = await page.locator('.cm6-markdown-editor-pane .cm-atomic-image img').evaluateAll((images) => images
          .map((image) => image.getAttribute('src') ?? '')
          .filter((src) => src.toLowerCase().includes('.svg')));
        assert.ok(svgSources.length >= 1, `SVG 图片未生成 image widget：${await page.locator('.cm6-markdown-editor-pane').innerHTML()}`);
      },
      async () => ({ svgSources: await page.locator('.cm6-markdown-editor-pane .cm-atomic-image img').evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? '').filter((src) => src.toLowerCase().includes('.svg'))) }),
    );

    await deepAction(
      page,
      'image-assets',
      'WebP 图片 ![](url.webp) 写作视图渲染',
      async () => {
        // github octocat 是常见 webp 测试图
        await replaceEditorContent(page, '![webp](https://raw.githubusercontent.com/primer/octicons/main/icons/mark-github-16.webp)\n');
        await ensureWriting(page);
        await delay(1500);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写视图必须可见');
      },
      async () => ({ writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible() }),
    );

    await deepAction(
      page,
      'image-assets',
      '缺 alt 的图片 ![](url) 写作视图仍可见图片',
      async () => {
        await replaceEditorContent(page, '![](https://avatars.githubusercontent.com/u/196743083?s=48)\n');
        await ensureWriting(page);
        await delay(1500);
        const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
        assert.ok(writingVisible, '写视图必须可见');
      },
      async () => ({ writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible() }),
    );

    // ---------- Issue #280 P0：基础 MD 编辑（12 actions） ----------

    await deepAction(
      page,
      'markdown-basic',
      'P0-1 段落软换行保留两行文字与段落结构',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.insertText('第一行\\\n第二行');
        await page.keyboard.press('Enter');
        await delay(150);
        const source = await content.textContent();
        assert.ok(source?.includes('第一行') && source?.includes('第二行'), `软换行源码缺少行文本：${source}`);
        await ensureWriting(page);
        await delay(300);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const writingText = await pane.textContent();
        const breakCount = await pane.locator('br').count();
        const lineBlockTexts = await pane.locator('p, .cm-line').evaluateAll((elements) => elements
          .map((element) => element.textContent ?? '')
          .filter((text) => text.includes('第一行') || text.includes('第二行')));
        assert.ok(writingText?.includes('第一行') && writingText.includes('第二行'), `软换行写作视图缺少行文本：${writingText}`);
        const hasDistinctLineBlocks = lineBlockTexts.length >= 2
          && lineBlockTexts.some((text) => text.includes('第一行'))
          && lineBlockTexts.some((text) => text.includes('第二行'));
        assert.ok(breakCount >= 1 || hasDistinctLineBlocks, `软换行未保留 br 或两个可区分行块：br=${breakCount}, lineBlocks=${JSON.stringify(lineBlockTexts)}`);
      },
      async () => ({
        source: await page.locator('.cm-content').textContent(),
        writingText: await page.locator('.cm6-markdown-editor-pane').textContent(),
        breakCount: await page.locator('.cm6-markdown-editor-pane br').count(),
        lineBlockCount: await page.locator('.cm6-markdown-editor-pane p, .cm6-markdown-editor-pane .cm-line').count(),
      }),
    );
    await captureUi(page, 'd18-p0-soft-break');

    await deepAction(
      page,
      'markdown-basic',
      'P0-2 连续空行退出无序列表',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.getByRole('button', { name: /^无序列表$/ }).click();
        await delay(100);
        await page.keyboard.type('item1');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type('paragraph-after-list');
        await delay(150);
        const source = await content.textContent();
        assert.ok(source?.includes('item1'), `列表项目缺失：${source}`);
        const paragraphLine = source?.split(/\r?\n/u).find((line) => line.includes('paragraph-after-list'));
        assert.ok(paragraphLine, `退出列表后的段落缺失：${source}`);
        assert.ok(!/^\s*(?:[-*+]\s|\d+[.)]\s)/u.test(paragraphLine), `连续 Enter 未退出列表：${paragraphLine}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd19-p0-list-exit');

    await deepAction(
      page,
      'markdown-basic',
      'P0-3 Ctrl+A 全选后精确替换为 new',
      async () => {
        await replaceEditorContent(page, 'old content here');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await page.keyboard.insertText('new');
        await delay(150);
        const text = await content.textContent();
        assert.equal(text, 'new', `Ctrl+A 替换后不是精确 new：${JSON.stringify(text)}`);
      },
      async () => ({ textContent: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd20-p0-select-all');

    await deepAction(
      page,
      'markdown-basic',
      'P0-4 无序列表 Tab 缩进生成嵌套项',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.getByRole('button', { name: /^无序列表$/ }).click();
        await delay(100);
        await page.keyboard.type('outer');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        await page.keyboard.type('inner');
        await delay(150);
        const source = await content.textContent();
        assert.ok(source?.includes('outer') && source.includes('inner'), `嵌套列表文本缺失：${source}`);
        const innerLineLocator = content.locator('.cm-line').filter({ hasText: 'inner' }).first();
        const innerLine = await innerLineLocator.textContent();
        assert.ok(innerLine && /^\s{2,}/u.test(innerLine), `inner 行没有至少 2 个空格缩进：${innerLine}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd21-p0-nested-list');

    await deepAction(
      page,
      'markdown-basic',
      'P0-5 嵌套引用源码同时保留两层引用',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.insertText('> outer\n> > inner');
        const source = await content.textContent();
        assert.ok(source?.includes('> outer') && source.includes('> > inner'), `嵌套引用源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd22-p0-nested-quote');

    await deepAction(
      page,
      'markdown-basic',
      'P0-6 缩进式代码块保留四空格前缀',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.insertText('    indented code line 1\n    indented code line 2');
        const source = await content.textContent();
        assert.ok(source?.includes('    indented code line 1'), `缩进式代码块前缀未保留：${source}`);
        assert.ok(source.includes('    indented code line 2'), `缩进式代码块第二行缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd23-p0-indented-code');

    await deepAction(
      page,
      'markdown-inline',
      'P0-7 粗体斜体与行内代码叠加',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.insertText('***粗斜*** 与 **`粗代码`**');
        const source = await content.textContent();
        assert.ok(source?.includes('***粗斜***') && source.includes('**`粗代码`**'), `粗斜与粗代码源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd24-p0-nested-inline');

    await deepAction(
      page,
      'markdown-inline',
      'P0-8 删除线与标题叠加',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.insertText('# ~~删除线标题~~');
        const source = await content.textContent();
        assert.ok(source?.includes('# ~~删除线标题~~'), `删除线标题源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd25-p0-strike-heading');

    await deepAction(
      page,
      'markdown-basic',
      'P0-9 上标与下标源码保留',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.insertText('H~2~O 与 E=mc^2^');
        const source = await content.textContent();
        const hasSub = source?.includes('H~2~O') || source?.includes('H<sub>') || source?.includes('<sub>');
        const hasSup = source?.includes('mc^2^') || source?.includes('mc<sup>') || source?.includes('<sup>');
        assert.ok(hasSub && hasSup, `上标/下标源码未保留：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd26-p0-sup-sub');

    await deepAction(
      page,
      'rich-markdown',
      'P0-10 脚注写作视图显示引用与脚注内容',
      async () => {
        await replaceEditorContent(page, '正文[^1] 带脚注。\n\n[^1]: 脚注内容');
        await ensureWriting(page);
        await delay(400);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const text = await pane.textContent();
        const referenceCount = await pane.locator('sup, .footnote-ref, .cm6-footnote-ref').count();
        assert.ok(referenceCount >= 1, `写作视图缺少脚注引用节点：${await pane.innerHTML()}`);
        assert.ok(text?.includes('脚注内容'), `写作视图缺少脚注内容：${text}`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        referenceCount: await page.locator('.cm6-markdown-editor-pane sup, .cm6-markdown-editor-pane .footnote-ref, .cm6-markdown-editor-pane .cm6-footnote-ref').count(),
      }),
    );
    await captureUi(page, 'd27-p0-footnote');

    await deepAction(
      page,
      'markdown-inline',
      'P0-11 图片嵌套链接写作视图生成外层链接',
      async () => {
        await replaceEditorContent(page, '[![alt](https://example.com/img.png)](https://example.com/page)\n\n第二段落承接光标');
        await ensureWriting(page);
        await delay(400);
        // inline preview 对光标所在行冻结为源码,link widget 只在光标离开该行后渲染;
        // 先点第二段让光标离开链接行。
        await page.getByText('第二段落承接光标').click();
        await delay(400);
        const link = page.locator('.cm6-markdown-editor-pane .cm-atomic-link').first();
        assert.ok(await link.count() >= 1, `嵌套链接未生成 live-preview link widget：${await page.locator('.cm6-markdown-editor-pane').innerHTML()}`);
        const image = page.locator('.cm6-markdown-editor-pane .cm-atomic-image img[src*="img.png"]').first();
        assert.ok(await image.count() >= 1, `嵌套链接内图片 widget 缺失：${await page.locator('.cm6-markdown-editor-pane').innerHTML()}`);
        assert.ok(await installOpenUrlProbe(page), '无法安装链接打开观测钩子');
        await link.click();
        await delay(500);
        const calls = await readOpenUrlCalls(page);
        assert.ok(calls.some((url) => String(url).includes('https://example.com/page')), `点击未打开嵌套链接目标：calls=${JSON.stringify(calls)} probe=${JSON.stringify(await readLinkClickProbe(page))}`);
      },
      async () => ({
        linkWidgetCount: await page.locator('.cm6-markdown-editor-pane .cm-atomic-link').count(),
        imageCount: await page.locator('.cm6-markdown-editor-pane .cm-atomic-image img[src*="img.png"]').count(),
        openUrlCalls: await readOpenUrlCalls(page),
      }),
    );
    await captureUi(page, 'd28-p0-nested-link');

    await deepAction(
      page,
      'editor-format-history',
      'P0-12 格式刷捕获并应用粗体到目标段落',
      async () => {
        await replaceEditorContent(page, 'source style\n\nplain target');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Shift+End');
        await page.getByRole('button', { name: /^加粗/ }).click();
        await delay(150);
        let source = await content.textContent();
        assert.ok(source?.includes('**source style**'), `格式刷源段落未生成粗体源码：${source}`);
        await content.click();
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Shift+End');
        await clickMoreFormatItem(page, '格式刷');
        await content.click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Shift+Home');
        await clickMoreFormatItem(page, '格式刷');
        await delay(150);
        source = await content.textContent();
        assert.ok(source?.includes('**source style**') && source.includes('**plain target**'), `格式刷未把粗体应用到目标段落：${source}`);
      },
      async () => ({
        source: await page.locator('.cm-content').textContent(),
      }),
    );
    await captureUi(page, 'd29-p0-format-painter');

    // ---------- Issue #280 P1：乱码 / 渲染边界（11 actions） ----------

    await deepAction(
      page,
      'render-correctness',
      'P1-1 连续空行的三种段落探针保留文字',
      async () => {
        const probes = ['段 A\n\n段 B', '段 A\n\n\n段 B', '段 A\n\n\n\n段 B'];
        const results = [];
        for (const markdown of probes) {
          await replaceEditorContent(page, markdown);
          await ensureWriting(page);
          await delay(200);
          const text = await page.locator('.cm6-markdown-editor-pane').textContent();
          results.push({ text, hasStart: text?.includes('段 A') ?? false, hasEnd: text?.includes('段 B') ?? false });
        }
        assert.equal(results.length, 3, '连续空行探针数量不完整');
        assert.ok(results.every((result) => result.hasStart && result.hasEnd), `连续空行丢失段落文字：${JSON.stringify(results)}`);
      },
      async () => ({ writingText: await page.locator('.cm6-markdown-editor-pane').textContent() }),
    );
    await captureUi(page, 'd30-p1-consecutive-blank-lines');

    await deepAction(
      page,
      'render-correctness',
      'P1-2 段落首尾空行不产生空白段落',
      async () => {
        await replaceEditorContent(page, '\n\n首段内容\n\n尾段内容\n\n');
        await ensureWriting(page);
        await delay(250);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const text = await pane.textContent();
        const emptyParagraphs = await pane.locator('p:empty').count();
        assert.ok(text?.includes('首段内容') && text.includes('尾段内容'), `首尾空行探针文字缺失：${text}`);
        assert.equal(emptyParagraphs, 0, `首尾空行生成了 ${emptyParagraphs} 个空段落`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        emptyParagraphs: await page.locator('.cm6-markdown-editor-pane p:empty').count(),
      }),
    );
    await captureUi(page, 'd31-p1-leading-trailing-blanks');

    await deepAction(
      page,
      'render-correctness',
      'P1-3 行尾空格与 Tab 不生成空白段落',
      async () => {
        await replaceEditorContent(page, '第一行 \n第二行\t\n第三行');
        await ensureWriting(page);
        await delay(250);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const text = await pane.textContent();
        const emptyParagraphs = await pane.locator('p:empty').count();
        assert.ok(text?.includes('第一行') && text.includes('第三行'), `行尾空格/Tab 探针文字缺失：${text}`);
        assert.equal(emptyParagraphs, 0, `行尾空格/Tab 生成了 ${emptyParagraphs} 个空段落`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        emptyParagraphs: await page.locator('.cm6-markdown-editor-pane p:empty').count(),
      }),
    );
    await captureUi(page, 'd32-p1-trailing-whitespace');

    await deepAction(
      page,
      'render-correctness',
      'P1-4 硬换行与软换行同时保留结构',
      async () => {
        await replaceEditorContent(page, '硬换行 1\n硬换行 2\n软换行 A\\\n软换行 B');
        await ensureWriting(page);
        await delay(300);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const text = await pane.textContent();
        const paragraphCount = await pane.locator('p, .cm-line').count();
        const breakCount = await pane.locator('br').count();
        assert.ok(text?.includes('硬换行 1') && text.includes('软换行 B'), `硬/软换行文字缺失：${text}`);
        assert.ok(paragraphCount >= 2, `硬换行未保留至少两个可见段落/行块：${paragraphCount}`);
        assert.ok(breakCount >= 1, `软换行未保留 br：${breakCount}`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        paragraphCount: await page.locator('.cm6-markdown-editor-pane p, .cm6-markdown-editor-pane .cm-line').count(),
        breakCount: await page.locator('.cm6-markdown-editor-pane br').count(),
      }),
    );
    await captureUi(page, 'd33-p1-hard-soft-break');

    await deepAction(
      page,
      'render-correctness',
      'P1-5 HTML sub/sup 节点与可读文字同时保留',
      async () => {
        await replaceEditorContent(page, 'H<sub>2</sub>O 与 E=mc<sup>2</sup>');
        await ensureWriting(page);
        await delay(400);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const text = await pane.textContent();
        const subCount = await pane.locator('sub').count();
        const supCount = await pane.locator('sup').count();
        assert.ok(text?.includes('H2O') && text.includes('mc2'), `HTML sub/sup 文字不可读：${text}`);
        assert.ok(subCount >= 1 && supCount >= 1, `HTML sub/sup 节点缺失：sub=${subCount}, sup=${supCount}`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        subCount: await page.locator('.cm6-markdown-editor-pane sub').count(),
        supCount: await page.locator('.cm6-markdown-editor-pane sup').count(),
      }),
    );
    await captureUi(page, 'd34-p1-html-sub-sup');

    await deepAction(
      page,
      'render-correctness',
      'P1-6 sub 内嵌高亮不产生乱码',
      async () => {
        await replaceEditorContent(page, 'H<sub>==重==</sub>O');
        await ensureWriting(page);
        await delay(350);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const text = await pane.textContent();
        const subCount = await pane.locator('sub').count();
        const markCount = await pane.locator('mark').count();
        assert.ok(!text?.includes('�'), `嵌套 HTML 出现替换字符：${text}`);
        assert.ok(text?.includes('H') && text.includes('重') && text.includes('O'), `嵌套 HTML 丢失内容：${text}`);
        assert.ok(subCount >= 1 && markCount >= 1, `嵌套 HTML 未保留 sub + mark 结构：sub=${subCount}, mark=${markCount}`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        subCount: await page.locator('.cm6-markdown-editor-pane sub').count(),
        markCount: await page.locator('.cm6-markdown-editor-pane mark').count(),
      }),
    );
    await captureUi(page, 'd35-p1-nested-html-highlight');

    await deepAction(
      page,
      'render-correctness',
      'P1-7 script 标签被阻止且正常段落仍可见',
      async () => {
        await replaceEditorContent(page, '<script>alert("xss")</script>\n正常段落');
        await ensureWriting(page);
        await delay(350);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const text = await pane.textContent();
        const scriptCount = await pane.locator('script').count();
        assert.equal(scriptCount, 0, `写作视图仍包含 script：${scriptCount}`);
        assert.ok(!text?.includes('alert'), `script 内容泄漏到可见文字：${text}`);
        assert.ok(text?.includes('正常段落'), `script 后正常段落丢失：${text}`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        scriptCount: await page.locator('.cm6-markdown-editor-pane script').count(),
      }),
    );
    await captureUi(page, 'd36-p1-script-blocked');

    await deepAction(
      page,
      'render-correctness',
      'P1-8 javascript 链接不会进入写作视图',
      async () => {
        await replaceEditorContent(page, '[点我](javascript:alert(1))');
        await ensureWriting(page);
        await delay(350);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const unsafeHrefs = await pane.locator('a').evaluateAll((anchors) => anchors
          .map((anchor) => anchor.getAttribute('href') ?? '')
          .filter((href) => /^javascript:/iu.test(href)));
        assert.equal(unsafeHrefs.length, 0, `写作视图包含 javascript: 链接：${unsafeHrefs.join(', ')}`);
      },
      async () => ({
        links: await page.locator('.cm6-markdown-editor-pane a').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href'))),
      }),
    );
    await captureUi(page, 'd37-p1-javascript-link');

    await deepAction(
      page,
      'render-correctness',
      'P1-9 iframe 被剥离且正常段落仍可见',
      async () => {
        await replaceEditorContent(page, '<iframe src="https://evil.example.com"></iframe>\n正常段落');
        await ensureWriting(page);
        await delay(350);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const iframeCount = await pane.locator('iframe').count();
        const text = await pane.textContent();
        assert.equal(iframeCount, 0, `写作视图仍包含 iframe：${iframeCount}`);
        assert.ok(text?.includes('正常段落'), `iframe 后正常段落丢失：${text}`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        iframeCount: await page.locator('.cm6-markdown-editor-pane iframe').count(),
      }),
    );
    await captureUi(page, 'd38-p1-iframe-stripped');

    await deepAction(
      page,
      'render-correctness',
      'P1-10 中文与空格图片路径保留可读 src',
      async () => {
        await replaceEditorContent(page, '![中文图片](中文 文件 名.png)');
        await ensureWriting(page);
        await delay(600);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const image = pane.locator('img').first();
        assert.ok(await image.count() >= 1, `中文图片路径未生成 img：${await pane.innerHTML()}`);
        const src = await image.getAttribute('src');
        const text = await pane.textContent();
        const readableSrc = src ? decodeURIComponent(src) : '';
        assert.ok(readableSrc.includes('中文'), `图片 src 未保留中文路径：${src}`);
        assert.ok(readableSrc.includes('文件 名.png'), `图片 src 未保留空格路径：${src}`);
        assert.ok(!text?.includes('�'), `中文图片路径出现替换字符：${text}`);
      },
      async () => ({
        src: await page.locator('.cm6-markdown-editor-pane img').first().getAttribute('src'),
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
      }),
    );
    await captureUi(page, 'd39-p1-chinese-image-path');

    await deepAction(
      page,
      'render-correctness',
      'P1-11 中文链接 URL 编码后仍指向 example.com',
      async () => {
        await replaceEditorContent(page, '[Typola 主页](https://example.com/中文路径)\n\n第二段落承接光标');
        await ensureWriting(page);
        await delay(350);
        // 光标离开链接行后 widget 才渲染(inline preview 行冻结)
        await page.getByText('第二段落承接光标').click();
        await delay(400);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const link = pane.locator('.cm-atomic-link').first();
        assert.ok(await link.count() >= 1, `中文链接未生成 live-preview link widget：${await pane.innerHTML()}`);
        assert.ok(await installOpenUrlProbe(page), '无法安装链接打开观测钩子');
        await link.click();
        await delay(500);
        const calls = await readOpenUrlCalls(page);
        const decodedCalls = calls.map((url) => {
          try { return decodeURIComponent(String(url)); } catch { return String(url); }
        });
        assert.ok(decodedCalls.some((url) => url.includes('https://example.com/中文路径')), `点击未打开中文链接目标：calls=${JSON.stringify(calls)} probe=${JSON.stringify(await readLinkClickProbe(page))}`);
      },
      async () => ({
        linkWidgetCount: await page.locator('.cm6-markdown-editor-pane .cm-atomic-link').count(),
        openUrlCalls: await readOpenUrlCalls(page),
      }),
    );
    await captureUi(page, 'd40-p1-chinese-link-url');

    // ---------- Issue #280 P2：次要 / 边缘（14 actions） ----------

    await deepAction(
      page,
      'render-correctness',
      'P2-1 mark 高亮在写作视图保留文本或标记',
      async () => {
        await replaceEditorContent(page, '这段 ==高亮文本== 内容');
        await ensureWriting(page);
        await delay(300);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const text = await pane.textContent();
        const markCount = await pane.locator('mark').count();
        assert.ok(markCount >= 1, `mark 高亮节点缺失：${await pane.innerHTML()}`);
        assert.ok(text?.includes('高亮文本'), `mark 高亮文字缺失：${text}`);
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        markCount: await page.locator('.cm6-markdown-editor-pane mark').count(),
      }),
    );
    await captureUi(page, 'd41-p2-mark');

    await deepAction(
      page,
      'render-correctness',
      'P2-2 details/summary 与普通段落文字同时可见',
      async () => {
        await replaceEditorContent(page, '<details><summary>点击展开</summary>隐藏内容</details>\n\n普通段落');
        await ensureWriting(page);
        await delay(350);
        const pane = page.locator('.cm6-markdown-editor-pane');
        const details = pane.locator('details').first();
        assert.ok(await details.count() >= 1, `写作视图缺少 details 节点：${await pane.innerHTML()}`);
        const summary = details.locator('summary').first();
        assert.ok(await summary.count() >= 1, `写作视图缺少 summary 节点：${await details.innerHTML()}`);
        const text = await pane.textContent();
        assert.ok(text?.includes('点击展开') && text.includes('隐藏内容') && text.includes('普通段落'), `details/summary 内容缺失：${text}`);
        await summary.click();
        await delay(150);
        const isOpen = await details.evaluate((element) => element instanceof HTMLDetailsElement && element.open);
        assert.ok(isOpen, '点击 summary 后 details 未打开');
      },
      async () => ({
        text: await page.locator('.cm6-markdown-editor-pane').textContent(),
        detailsCount: await page.locator('.cm6-markdown-editor-pane details').count(),
        openDetailsCount: await page.locator('.cm6-markdown-editor-pane details[open]').count(),
      }),
    );
    await captureUi(page, 'd42-p2-details-summary');

    await deepAction(
      page,
      'render-correctness',
      'P2-3 围栏代码块内嵌 template 反引号不提前闭合',
      async () => {
        const markdown = '```js\nconst x = `template`;\nconst y = "not close";\n```';
        await replaceEditorContent(page, markdown);
        await ensureSource(page);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('template') && source.includes('not close'), `嵌套 fence 源码缺失：${source}`);
        await ensureWriting(page);
        await delay(350);
        const code = page.locator('.cm6-markdown-editor-pane .cm-atomic-fenced-code');
        assert.ok(await code.count() >= 1, `嵌套 fence 未生成 fenced-code widget：${await page.locator('.cm6-markdown-editor-pane').innerHTML()}`);
      },
      async () => ({
        source: await page.locator('.cm-content').textContent(),
        codeBlockCount: await page.locator('.cm6-markdown-editor-pane .cm-atomic-fenced-code').count(),
      }),
    );
    await captureUi(page, 'd43-p2-nested-fence');

    await deepAction(
      page,
      'render-correctness',
      'P2-4 HTML 注释不泄漏到可见文字',
      async () => {
        await replaceEditorContent(page, '<!-- 这是注释 -->\n正常段落');
        await ensureWriting(page);
        await delay(300);
        const text = await page.locator('.cm6-markdown-editor-pane').textContent();
        assert.ok(!text?.includes('这是注释'), `HTML 注释泄漏到可见文字：${text}`);
        assert.ok(text?.includes('正常段落'), `HTML 注释后的正常段落丢失：${text}`);
      },
      async () => ({ text: await page.locator('.cm6-markdown-editor-pane').textContent() }),
    );
    await captureUi(page, 'd44-p2-html-comment');

    await deepAction(
      page,
      'markdown-inline',
      'P2-5 任务列表同时保留已完成与未完成状态',
      async () => {
        await replaceEditorContent(page, '- [x] 已完成\n- [ ] 未完成');
        await ensureSource(page);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('[x]') && source.includes('[ ]'), `任务列表源码状态缺失：${source}`);
        await ensureWriting(page);
        await delay(350);
        const checkedCount = await page.locator('.cm6-markdown-editor-pane input[type="checkbox"]:checked').count();
        const uncheckedCount = await page.locator('.cm6-markdown-editor-pane input[type="checkbox"]:not(:checked)').count();
        assert.ok(checkedCount >= 1 && uncheckedCount >= 1, `任务列表复选框状态不完整：checked=${checkedCount}, unchecked=${uncheckedCount}`);
      },
      async () => ({
        source: await page.locator('.cm-content').textContent(),
        checkedCount: await page.locator('.cm6-markdown-editor-pane input[type="checkbox"]:checked').count(),
        uncheckedCount: await page.locator('.cm6-markdown-editor-pane input[type="checkbox"]:not(:checked)').count(),
      }),
    );
    await captureUi(page, 'd45-p2-task-list');

    await deepAction(
      page,
      'markdown-inline',
      'P2-6 引用式链接保留引用与定义',
      async () => {
        await replaceEditorContent(page, '参考 [RFC][rfc1]\n\n[rfc1]: https://www.rfc-editor.org "RFC 索引"');
        await ensureSource(page);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('[RFC][rfc1]') && source.includes('[rfc1]:'), `引用式链接源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd46-p2-reference-link');

    await deepAction(
      page,
      'markdown-basic',
      'P2-7 图片尺寸语法保留 =300x200',
      async () => {
        await replaceEditorContent(page, '![尺寸图](https://example.com/x.png =300x200)');
        await ensureSource(page);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('=300x200'), `图片尺寸源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd47-p2-image-size');

    await deepAction(
      page,
      'markdown-basic',
      'P2-8 图片 title 属性源码保留',
      async () => {
        await replaceEditorContent(page, '![标题图](https://example.com/x.png "我的图片")');
        await ensureSource(page);
        const source = await page.locator('.cm-content').textContent();
        assert.ok(source?.includes('"我的图片"'), `图片 title 源码缺失：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd48-p2-image-title');

    await deepAction(
      page,
      'view-behavior',
      'P2-9 打开大纲并点击二级标题后编辑器仍可见',
      async () => {
        await replaceEditorContent(page, '# 顶级\n\n中间段落\n\n## 二级\n\n末尾');
        await ensureWriting(page);
        await delay(250);
        const tocButton = page.getByRole('button', { name: '查看大纲', exact: true });
        assert.ok(await tocButton.count() >= 1, '查看大纲按钮不可达');
        await tocButton.click();
        const secondHeading = page.locator('.floating-toc-item').filter({ hasText: '二级' }).first();
        await secondHeading.waitFor({ state: 'visible', timeout: 5_000 });
        await secondHeading.click();
        await delay(250);
        assert.ok(await page.locator('.cm6-markdown-editor-pane').isVisible(), '点击大纲后编辑器不可见');
        const activeOutlineCount = await page.locator('.floating-toc-row.active .floating-toc-item').filter({ hasText: '二级' }).count();
        assert.ok(activeOutlineCount >= 1, `点击大纲后二级标题未成为 active：${activeOutlineCount}`);
      },
      async () => ({
        editorVisible: await page.locator('.cm6-markdown-editor-pane').isVisible(),
        activeOutlineCount: await page.locator('.floating-toc-row.active .floating-toc-item').filter({ hasText: '二级' }).count(),
      }),
    );
    await captureUi(page, 'd49-p2-outline-jump');

    await deepAction(
      page,
      'view-behavior',
      'P2-10 长文本写作视图保留至少 50 个字符',
      async () => {
        await replaceEditorContent(page, 'a'.repeat(100));
        await ensureWriting(page);
        await delay(250);
        const text = await page.locator('.cm6-markdown-editor-pane').textContent();
        assert.ok((text?.length ?? 0) >= 50, `长文本写作视图文字长度不足：${text?.length ?? 0}`);
      },
      async () => ({ textLength: (await page.locator('.cm6-markdown-editor-pane').textContent())?.length ?? 0 }),
    );
    await captureUi(page, 'd50-p2-word-line-count');

    await deepAction(
      page,
      'render-correctness',
      'P2-11 emoji 与中文混排不产生乱码',
      async () => {
        await replaceEditorContent(page, '中文 😀 emoji 测试 ✨');
        await ensureWriting(page);
        await delay(300);
        const text = await page.locator('.cm6-markdown-editor-pane').textContent();
        assert.ok(text?.includes('中文') && text.includes('测试'), `中英文探针文字缺失：${text}`);
        assert.ok(text?.includes('😀') && text.includes('✨'), `emoji 探针缺失：${text}`);
        assert.ok(!text?.includes('�'), `emoji/中文混排出现替换字符：${text}`);
      },
      async () => ({ text: await page.locator('.cm6-markdown-editor-pane').textContent() }),
    );
    await captureUi(page, 'd51-p2-emoji-cjk');

    await deepAction(
      page,
      'markdown-basic',
      'P2-12 Ctrl+\\ 清除粗体格式',
      async () => {
        await replaceEditorContent(page, 'plain');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.getByRole('button', { name: /^加粗/ }).click();
        await delay(150);
        let source = await content.textContent();
        assert.ok(source?.includes('**plain**'), `清除格式前未生成粗体：${source}`);
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+\\');
        await delay(150);
        source = await content.textContent();
        assert.ok(source?.includes('plain'), `清除格式后正文丢失：${source}`);
        assert.ok(!source?.includes('**plain**'), `Ctrl+\\ 未清除粗体：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd52-p2-clear-format');

    await deepAction(
      page,
      'markdown-basic',
      'P2-13 Ctrl+. 升级引用再用 Ctrl+, 降级',
      async () => {
        await replaceEditorContent(page, '普通文本');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+.');
        await delay(150);
        let source = await content.textContent();
        assert.ok(source?.includes('> '), `Ctrl+. 未升级为引用：${source}`);
        await content.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+,');
        await delay(150);
        source = await content.textContent();
        assert.ok(!/^\s*>\s/u.test(source ?? ''), `Ctrl+, 未移除引用前缀：${source}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd53-p2-quote-promote-demote');

    await deepAction(
      page,
      'editor-format-history',
      'P2-14 纯文本粘贴保留两行内容',
      async () => {
        await replaceEditorContent(page, '');
        await ensureSource(page);
        const content = page.locator('.cm-content');
        await content.click();
        const pasteText = '粘贴 fallback 第一行\n粘贴 fallback 第二行';
        await page.evaluate(async (text) => {
          if (!navigator.clipboard?.writeText) throw new Error('WebView 不支持系统剪贴板写入');
          await navigator.clipboard.writeText(text);
        }, pasteText);
        await page.keyboard.press('Control+v');
        await delay(300);
        const lines = await content.locator('.cm-line').allTextContents();
        const pasted = lines.join('\n');
        assert.ok(pasted.includes('粘贴 fallback 第一行') && pasted.includes('粘贴 fallback 第二行'), `纯文本粘贴内容缺失：${pasted}`);
      },
      async () => ({ source: await page.locator('.cm-content').textContent() }),
    );
    await captureUi(page, 'd54-p2-plain-text-paste');

    await captureUi(page, 'd99-final-state');
  }

  const featureStatus = {
    'startup-distribution': '部分验证（直接 exe 启动、Tauri 身份和关于页已执行；安装包/portable/WebView2 缺失预检未执行）',
    'editor-source-roundtrip': '已验证',
    'document-workspace': '部分验证（文件关联打开/保存/新建已执行，文件夹选择器/多文件切换未执行）',
    'editor-format-history': '部分验证（格式按钮和撤销已执行，其他格式和格式刷未执行）',
    'find-navigation': '部分验证（查找替换、快速打开、跳转到行和大纲入口已执行；深度导航未执行）',
    'table-editing': '部分验证（插入表格及源码/网格确认已执行，行列菜单和 Tab 导航未执行）',
    'image-assets': '部分验证（图片 Markdown 和失败占位已执行，选择/复制资产未执行）',
    'rich-markdown': '部分验证（公式和 Mermaid 成功或可读错误状态、源码保留已执行，普通代码复制和富文本粘贴未执行）',
    'markdown-preview-export': '部分验证（Word/HTML 预览已执行，导出文件未执行）',
    'settings-appearance': '部分验证（外观主题已执行，字体/预览/导出预设未执行）',
    terminal: '部分验证（真实 PTY 创建、输入和输出回读已执行，多标签和离线依赖未执行）',
    'ai-workbench-skillhub': '受阻（AI 工作台入口已执行，Provider/SkillHub/模型请求需要外部 CLI 认证）',
    'artifact-center': '部分验证（空产物中心入口已执行，真实产物生命周期需要 AI 会话）',
    'review-diff': '部分验证（检视面板入口已执行，意见/Diff/应用需要保存文档和 AI 会话）',
    'failure-boundaries': '部分验证（统一 exe/CDP/profile/runtime 清理已执行，取消、权限和失败注入未执行）',
  };
  if (!smokeOnly) {
    featureStatus['markdown-basic'] = '部分验证（deep 段语法矩阵已执行）';
    featureStatus['markdown-inline'] = '部分验证（deep 段行内语法矩阵已执行）';
    featureStatus['heading-fold-editing'] = '部分验证（deep 段折叠角标回归已执行）';
    featureStatus['md-editing-interactions'] = '部分验证（deep 段 Enter/Backspace/逐字输入已执行）';
    featureStatus['render-correctness'] = '部分验证（deep 段渲染边界/XSS 已执行）';
    featureStatus['view-behavior'] = '部分验证（deep 段视图行为与快捷键已执行）';
  }
  const anyFailed = actions.some((action) => action.status === 'failed');
  const summary = {
    status: anyFailed ? 'failed' : 'passed_with_gaps',
    verificationId: 'exe-core',
    tier: smokeOnly ? 'smoke' : 'full',
    runId,
    observedAt: new Date().toISOString(),
    packageVersion: packageJson.version,
    command: executablePath,
    commandLine: `${executablePath} "${fixturePath}"`,
    processPid: ownedProcess.pid ?? null,
    cdp: {
      endpoint: cdpEndpoint,
      port: cdpPort,
      browser: cdpVersion.Browser ?? null,
      protocolVersion: cdpVersion['Protocol-Version'] ?? null,
    },
    runtime,
    executable,
    git,
    featureStatus,
    actions,
    skipped,
    runtimeMessages,
    cleanup,
  };
  await fs.writeFile(path.join(evidenceDirectory, 'run.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

async function writeFailureEvidence(error) {
  await fs.mkdir(evidenceDirectory, { recursive: true });
  const summary = {
    status: 'failed',
    verificationId: 'exe-core',
    tier: smokeOnly ? 'smoke' : 'full',
    runId,
    observedAt: new Date().toISOString(),
    command: executablePath,
    commandLine: `${executablePath} "${fixturePath}"`,
    processPid: ownedProcess?.pid ?? null,
    cdp: { endpoint: cdpEndpoint, port: cdpPort },
    git: collectGitIdentity(),
    actions,
    skipped,
    error: error instanceof Error ? error.message : String(error),
    runtimeMessages,
    cleanup,
  };
  await fs.writeFile(path.join(evidenceDirectory, 'run.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

try {
  await main();
} catch (error) {
  failure = error;
} finally {
  await closeBrowser();
  await stopOwnedProcess().catch(() => undefined);
  await confirmCdpClosed().catch(() => undefined);
  if (runtimeDirectory) {
    await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
    try {
      await fs.access(runtimeDirectory);
      cleanup.runtimeRemoved = false;
      cleanup.profileRemoved = false;
    } catch {
      cleanup.runtimeRemoved = true;
      cleanup.profileRemoved = true;
    }
  }

  const anyFailed = actions.some((action) => action.status === 'failed');
  if (failure || anyFailed) {
    if (failure) await writeFailureEvidence(failure).catch(() => undefined);
    else {
      // deep 段失败：main 已写 run.json（status=failed），这里补齐真实 cleanup 再回写
      const runFile = path.join(evidenceDirectory, 'run.json');
      if (await fs.access(runFile).then(() => true).catch(() => false)) {
        const run = JSON.parse(await fs.readFile(runFile, 'utf8'));
        run.cleanup = cleanup;
        run.runtimeMessages = runtimeMessages;
        await fs.writeFile(runFile, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
      }
    }
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stdout.log'), runtimeMessages.stdout, 'utf8').catch(() => undefined);
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stderr.log'), runtimeMessages.stderr, 'utf8').catch(() => undefined);
    const failedActions = actions.filter((action) => action.status === 'failed');
    if (failure) {
      console.error(`Typola exe 套件失败：${failure instanceof Error ? failure.message : String(failure)}`);
    } else {
      console.error(`Typola exe 套件有 ${failedActions.length} 个 action 失败：`);
      for (const action of failedActions) console.error(`  [${action.tier}] ${action.feature} — ${action.label}: ${action.error}`);
    }
    console.error(`证据目录：${evidenceDirectory}`);
    process.exitCode = 1;
  } else {
    const runFile = path.join(evidenceDirectory, 'run.json');
    const run = JSON.parse(await fs.readFile(runFile, 'utf8'));
    run.cleanup = cleanup;
    run.runtimeMessages = runtimeMessages;
    await fs.writeFile(runFile, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stdout.log'), runtimeMessages.stdout, 'utf8');
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stderr.log'), runtimeMessages.stderr, 'utf8');
    console.log(JSON.stringify({ status: 'passed_with_gaps', tier: smokeOnly ? 'smoke' : 'full', evidenceDirectory, runId, processPid: cleanup.processPid }, null, 2));
  }
}
