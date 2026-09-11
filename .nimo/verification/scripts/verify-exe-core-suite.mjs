#!/usr/bin/env node

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
const evidenceDirectory = path.join(verificationRoot, 'evidence', `${runId}-exe-core-suite`);
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
  await page.screenshot({ path: path.join(evidenceDirectory, `${stem}.png`), fullPage: false });
  await fs.writeFile(path.join(evidenceDirectory, `${stem}.aria.txt`), `${await ariaSnapshot(page)}\n`, 'utf8');
}

async function recordAction(page, feature, label, operation, observation) {
  const record = {
    feature,
    label,
    startedAt: new Date().toISOString(),
  };
  try {
    await operation();
    record.status = 'passed';
    record.observation = await observation();
  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    actions.push(record);
  }
}

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
  skip('document-workspace', '打开文件夹', '原生文件夹选择器没有可用的桌面自动化面，本次未点击并未声称通过。');

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
  skip('image-assets', '本地图片选择/复制到 assets', '原生图片选择器和文件写盘尚未在当前宿主安全驱动；本次只验证 Markdown 资源语法和失败占位。');

  await recordAction(
    page,
    'rich-markdown',
    '渲染公式和 Mermaid，并保留原始语法',
    async () => {
      await replaceEditorContent(page, '$$\nx^2 + 1\n$$\n\n```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```\n');
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
      assert.ok(source?.includes('x^2 + 1'));
      assert.ok(source?.includes('flowchart LR'));
      await ensureWriting(page);
    },
    async () => ({
      mathVisible: await page.locator('.typola-cm6-math-block').isVisible(),
      mermaidVisible: await page.locator('.typola-cm6-mermaid').isVisible(),
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
    },
    async () => ({
      panelVisible: await page.locator('.word-preview-panel').isVisible(),
      meta: await page.locator('.word-preview-meta').innerText(),
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
    },
    async () => ({
      panelVisible: await page.locator('.wechat-preview-panel').isVisible(),
      presetSelectorVisible: await page.locator('select[aria-label="HTML 导出预设"]').isVisible(),
      articleVisible: await page.locator('.wechat-preview-article-shell').isVisible(),
    }),
  );
  await captureUi(page, '11-html-preview');
  await page.locator('.wechat-preview-panel button.wechat-preview-close-button').click();
  skip('markdown-preview-export', 'PDF/Word 文件导出', '导出会打开原生保存对话框；当前宿主没有安全的桌面 UI 驱动，未将预览通过冒充文件交付通过。');

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
  skip('ai-workbench-skillhub', 'Provider 检测/发送请求/SkillHub 场景执行', '需要用户已配置并认证的 Claude/OpenCode；本次不读取凭据、不启动模型请求。');

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
  skip('artifact-center', '产物生成/打开/对比/覆盖/归档', '需要已认证的 AI 会话和一次性工作区产物；本次不启动模型请求、不写用户工作区。');

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
  skip('review-diff', '人工意见/AI 检视/Diff 采纳应用', '完整链路需要已保存的一次性工作区和已认证的 Claude/OpenCode；本次只打开检视面板。');

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
  skip('failure-boundaries', '取消/权限/失败注入矩阵', '本次运行已证明自有 exe、CDP、profile 和 runtime 夹具清理；原生取消、权限拒绝和外部失败注入需要独立桌面前置条件。');

  const featureStatus = {
    'startup-distribution': '部分验证（直接 exe 启动、Tauri 身份和关于页已执行；安装包/portable/WebView2 缺失预检未执行）',
    'editor-source-roundtrip': '已验证',
    'document-workspace': '部分验证（文件关联打开/保存/新建已执行，文件夹选择器/多文件切换未执行）',
    'editor-format-history': '部分验证（格式按钮和一次撤销已执行，其他格式和格式刷未执行）',
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
  const summary = {
    status: 'passed_with_gaps',
    verificationId: 'core-exe-suite',
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
    verificationId: 'core-exe-suite',
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

  if (failure) {
    await writeFailureEvidence(failure).catch(() => undefined);
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stdout.log'), runtimeMessages.stdout, 'utf8').catch(() => undefined);
    await fs.writeFile(path.join(evidenceDirectory, 'exe.stderr.log'), runtimeMessages.stderr, 'utf8').catch(() => undefined);
    console.error(`Typola exe 核心套件失败：${failure instanceof Error ? failure.message : String(failure)}`);
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
    console.log(JSON.stringify({ status: 'passed_with_gaps', evidenceDirectory, runId, processPid: cleanup.processPid }, null, 2));
  }
}
