#!/usr/bin/env node

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
const evidenceDirectory = path.join(repositoryRoot, '.nimo', 'verification', 'evidence', `${runId}-exe-core-editor`);

let ownedProcess = null;
let browser = null;
let profileDirectory = null;
let cdpPort = null;
let cdpEndpoint = null;
let cleanupResult = {
  processPid: null,
  processStopped: false,
  profileRemoved: false,
  cdpClosed: false,
};
const actions = [];
const runtimeMessages = {
  stdout: '',
  stderr: '',
  console: [],
  pageErrors: [],
  requestFailures: [],
};
let failure = null;

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
  const worktreeMaterial = [diff.stdout, status.stdout, untracked.stdout].join('\n');
  return {
    head: head.stdout.trim() || null,
    worktreeDiffId: sha256(worktreeMaterial),
    status: status.stdout.trim().split(/\r?\n/gu).filter(Boolean),
  };
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
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
    const candidate = context.pages().find((page) => !page.url().startsWith('devtools:'));
    if (candidate) return candidate;
    await delay(250);
  }
  throw new Error('CDP 已连接，但没有发现 Typola WebView 页面');
}

async function ariaSnapshot(page) {
  try {
    return await page.locator('body').ariaSnapshot();
  } catch {
    return await page.locator('body').innerText();
  }
}

async function recordAction(page, label, operation, observation) {
  const startedAt = new Date().toISOString();
  const result = { label, startedAt };
  try {
    await operation();
    result.status = 'passed';
    result.observation = await observation();
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    result.finishedAt = new Date().toISOString();
    actions.push(result);
  }
}

async function captureUi(page, stem) {
  await page.screenshot({ path: path.join(evidenceDirectory, `${stem}.png`), fullPage: false });
  await fs.writeFile(path.join(evidenceDirectory, `${stem}.aria.txt`), `${await ariaSnapshot(page)}\n`, 'utf8');
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
  cleanupResult.processPid = ownedProcess.pid ?? null;
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
  await Promise.race([
    new Promise((resolve) => ownedProcess.once('close', resolve)),
    delay(10_000),
  ]);
  cleanupResult.processStopped = ownedProcess.exitCode !== null || ownedProcess.killed;
}

async function closeCdp() {
  if (!browser) return;
  try {
    await browser.close();
  } finally {
    browser = null;
  }
}

async function confirmCdpClosed() {
  if (!cdpEndpoint) return;
  try {
    await fetchText(`${cdpEndpoint}/json/version`);
    cleanupResult.cdpClosed = false;
  } catch {
    cleanupResult.cdpClosed = true;
  }
}

async function main() {
  await ensureDirectory(evidenceDirectory);
  const git = collectGitIdentity();
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const executableStat = await fs.stat(executablePath);
  const executableBytes = await fs.readFile(executablePath);
  const executableMetadata = {
    path: executablePath,
    size: executableStat.size,
    lastWriteTime: executableStat.mtime.toISOString(),
    sha256: sha256(executableBytes),
  };
  cdpPort = await allocatePort();
  cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
  profileDirectory = path.join(repositoryRoot, '.nimo', 'verification', 'runtime', runId);
  await ensureDirectory(profileDirectory);

  const command = process.platform === 'win32' ? executablePath : executablePath;
  ownedProcess = spawn(command, [], {
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
  if (!context) throw new Error('CDP 已连接，但没有发现浏览器上下文');
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
    product: document.querySelector('.app-layout')?.getAttribute('aria-label') ?? null,
  }));
  if (runtime.runtime !== 'tauri') {
    throw new Error(`当前页面不是 Tauri WebView：data-runtime=${runtime.runtime ?? 'missing'}`);
  }

  await captureUi(page, '00-initial');
  await recordAction(
    page,
    '打开设置的关于页确认应用身份',
    async () => {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.locator('.settings-modal').getByRole('button', { name: '关于', exact: true }).click();
      await page.locator('.about-product-name').waitFor({ state: 'visible' });
    },
    async () => ({
      productName: await page.locator('.about-product-name').innerText(),
      version: await page.locator('.about-info-row').first().innerText(),
    }),
  );
  await captureUi(page, '00-identity-about');
  await page.keyboard.press('Escape');
  await page.locator('.settings-modal').waitFor({ state: 'detached' });

  await recordAction(
    page,
    '切换到源码模式',
    async () => {
      await page.getByRole('button', { name: '源码模式' }).click();
      await page.locator('.cm-editor').waitFor({ state: 'visible' });
    },
    async () => ({
      sourceEditorVisible: await page.locator('.cm-editor').isVisible(),
      buttonCount: await page.getByRole('button', { name: '源码模式' }).count(),
    }),
  );
  await captureUi(page, '01-source-mode');

  const markdown = '# exe 验证文档\n\n真实二进制编辑路径。\n\n## 可观察结果\n\n- 源码可编辑\n- 写作视图可回读';
  await recordAction(
    page,
    '在 CM6 源码编辑器输入 Markdown',
    async () => {
      await page.locator('.cm-content').click();
      await page.keyboard.insertText(markdown);
    },
    async () => {
      const source = await page.locator('.cm-content').textContent();
      if (!source?.includes('# exe 验证文档') || !source.includes('真实二进制编辑路径。')) {
        throw new Error('CM6 源码视图没有出现本次输入的完整 Markdown');
      }
      return { sourceContainsTitle: true, sourceContainsBody: true, sourceLength: source.length };
    },
  );
  await captureUi(page, '02-source-input');

  await recordAction(
    page,
    '切回写作视图并从第二个视图确认内容',
    async () => {
      await page.getByRole('button', { name: '源码模式' }).click();
      await page.locator('.cm6-markdown-editor-pane').waitFor({ state: 'visible' });
    },
    async () => {
      const writingView = await page.locator('.cm6-markdown-editor-pane').innerText();
      if (!writingView.includes('exe 验证文档') || !writingView.includes('真实二进制编辑路径。')) {
        throw new Error('写作视图没有回读源码编辑结果');
      }
      return {
        writingViewContainsTitle: true,
        writingViewContainsBody: true,
        editorPane: '.cm6-markdown-editor-pane',
      };
    },
  );
  await captureUi(page, '03-writing-view');

  const summary = {
    status: 'passed',
    verificationId: 'editor-source-roundtrip',
    runId,
    observedAt: new Date().toISOString(),
    packageVersion: packageJson.version,
    command: executablePath,
    commandLine: executablePath,
    processPid: ownedProcess.pid ?? null,
    cdp: {
      endpoint: cdpEndpoint,
      port: cdpPort,
      browser: cdpVersion.Browser ?? null,
      protocolVersion: cdpVersion['Protocol-Version'] ?? null,
    },
    runtime,
    executable: executableMetadata,
    git,
    actions,
    runtimeMessages,
    cleanup: cleanupResult,
  };
  await fs.writeFile(path.join(evidenceDirectory, 'run.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

async function writeFailureEvidence(error) {
  const git = collectGitIdentity();
  const summary = {
    status: 'failed',
    verificationId: 'editor-source-roundtrip',
    runId,
    observedAt: new Date().toISOString(),
    command: executablePath,
    commandLine: executablePath,
    processPid: ownedProcess?.pid ?? null,
    cdp: { endpoint: cdpEndpoint, port: cdpPort },
    git,
    actions,
    error: error instanceof Error ? error.message : String(error),
    runtimeMessages,
    cleanup: cleanupResult,
  };
  await fs.writeFile(path.join(evidenceDirectory, 'run.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

try {
  await main();
} catch (error) {
  failure = error;
} finally {
  await closeCdp().catch(() => undefined);
  await stopOwnedProcess().catch(() => undefined);
  await confirmCdpClosed().catch(() => undefined);
  if (profileDirectory) {
    await fs.rm(profileDirectory, { recursive: true, force: true }).catch(() => undefined);
    try {
      await fs.access(profileDirectory);
      cleanupResult.profileRemoved = false;
    } catch {
      cleanupResult.profileRemoved = true;
    }
  }
  if (failure) {
    await writeFailureEvidence(failure).catch(() => undefined);
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stdout.log'), runtimeMessages.stdout, 'utf8').catch(() => undefined);
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stderr.log'), runtimeMessages.stderr, 'utf8').catch(() => undefined);
    console.error(`Typola exe 核心验证失败：${failure instanceof Error ? failure.message : String(failure)}`);
    console.error(`证据目录：${evidenceDirectory}`);
    process.exitCode = 1;
  } else {
    const runFile = path.join(evidenceDirectory, 'run.json');
    const run = JSON.parse(await fs.readFile(runFile, 'utf8'));
    run.cleanup = cleanupResult;
    run.runtimeMessages = runtimeMessages;
    await fs.writeFile(runFile, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stdout.log'), runtimeMessages.stdout, 'utf8');
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stderr.log'), runtimeMessages.stderr, 'utf8');
    console.log(JSON.stringify({ status: 'passed', evidenceDirectory, runId, processPid: cleanupResult.processPid }, null, 2));
  }
}
