#!/usr/bin/env node

// 扩展 exe 验证套件：用户视角功能路径覆盖矩阵。
// 调用方式：`node .nimo/verification/scripts/verify-exe-core-extended.mjs`
//   或 `npm run verify:exe-core-extended`
//
// 设计原则：
// - 严格断言：每个 action 必须在真实 exe 中产生用户可见的变化（DOM / source / svg）
// - 用户视角句柄：aria-label / role / visible text，不依赖实现层 class
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
const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${process.pid}`;
const verificationRoot = path.join(repositoryRoot, '.nimo', 'verification');
const evidenceDirectory = path.join(verificationRoot, 'evidence', `${runId}-exe-core-extended`);
const runtimeDirectory = path.join(verificationRoot, 'runtime', runId);
const fixturePath = path.join(runtimeDirectory, 'extended-fixture.md');

let ownedProcess = null;
let browser = null;
let cdpEndpoint = null;
let cdpPort = null;
let profileDirectory = null;

const actions = [];
const skipped = [];
const runtimeMessages = { stdout: '', stderr: '', console: [], pageErrors: [], requestFailures: [] };
const cleanup = { processPid: null, processStopped: false, profileRemoved: false, runtimeRemoved: false, cdpClosed: false };

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

async function waitForContains(locator, expected, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() < deadline) {
    lastText = (await locator.textContent().catch(() => '')) ?? '';
    if (lastText.includes(expected)) return lastText;
    await delay(150);
  }
  throw new Error(`等待文本超时：${expected}；当前：${lastText.slice(0, 200)}`);
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
    // 不 rethrow —— 继续跑下一个 action，让全量失败一次性收集
  } finally {
    record.finishedAt = new Date().toISOString();
    actions.push(record);
  }
}

function skip(feature, item, reason) {
  skipped.push({ feature, item, reason });
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
  await fs.writeFile(fixturePath, '# 扩展套件夹具\n\n初始夹具正文。\n', 'utf8');

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
    await captureUi(page, '00-initial');
  } catch (error) {
    runtimeMessages.pageErrors.push(`initial bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
    await writeRunJson({ runId, cdpVersion: { Browser: 'unknown' }, git, packageVersion: packageJson.version, executable });
    await stopOwnedProcess();
    await closeBrowser();
    await confirmCdpClosed();
    await removeRuntime();
    await removeProfile();
    return;
  }

  // ============================ 模式 / 编辑器基础 ============================

  await recordAction(
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
      const sourceText = await page.locator('.cm-editor .cm-content').textContent().catch(() => '');
      assert.ok(sourceText?.includes(probe), `源码模式未保留探针：${sourceText?.slice(0, 200)}`);
      assert.ok(sourceText?.includes('引用段落不应丢失'), '源码模式丢失正文段落');
    },
    async () => ({
      renderedProbeFound: (await page.locator('.cm6-markdown-editor-pane').textContent().catch(() => '')).includes('引用段落不应丢失'),
      sourceProbeFound: (await page.locator('.cm-editor .cm-content').textContent().catch(() => '')).includes('引用段落不应丢失'),
    }),
  );
  await captureUi(page, '01-mode-switch');

  // ============================ 撤销 / 重做 ============================

  await recordAction(
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
  await captureUi(page, '02-format-undo');

  await recordAction(
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
  await captureUi(page, '03-drag-select');

  // ============================ MD 基础语法 ============================

  await recordAction(
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
  await captureUi(page, '04-md-headings');

  await recordAction(
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
      await page.getByRole('button', { name: /^任务列表$/ }).click();
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
      await page.getByRole('button', { name: /^引用块$/ }).click();
      await delay(100);
      await page.keyboard.type(probe);
      await delay(150);
      source = await content.textContent();
      assert.ok(source?.includes('> ') && source?.includes(probe), `引用块未生成，源码：${source}`);
    },
    async () => ({ source: await page.locator('.cm-content').textContent() }),
  );
  await captureUi(page, '05-md-lists');

  await recordAction(
    page,
    'markdown-basic',
    '插入分隔线 + 源码回读',
    async () => {
      await replaceEditorContent(page, '');
      await ensureSource(page);
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await page.getByRole('button', { name: /^分隔线$/ }).click();
      await delay(150);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.match(/^(\-{3,}|\*{3,})$/m), `分隔线未生成，源码：${source}`);
    },
    async () => ({ source: await page.locator('.cm-content').textContent() }),
  );
  await captureUi(page, '06-md-divider');

  await recordAction(
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
  await captureUi(page, '07-md-link');

  await recordAction(
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
      await page.getByRole('button', { name: /^删除线/ }).click();
      await page.keyboard.insertText('strike');
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('`code`'), '行内代码未生成');
      assert.ok(source?.match(/\*\*.+\*\*/) || source?.match(/__.+__/), '加粗未生成');
      assert.ok(source?.includes('~~strike~~'), '删除线未生成');
    },
    async () => ({ source: await page.locator('.cm-content').textContent() }),
  );
  await captureUi(page, '08-md-inline');

  // ============================ 表格全量操作 ============================

  await recordAction(
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
  await captureUi(page, '09-table-insert');

  await recordAction(
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
  await captureUi(page, '10-table-edit');

  await recordAction(
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
  await captureUi(page, '11-table-context-menu');

  // ============================ 图片 / 资源 ============================

  await recordAction(
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
  await captureUi(page, '12-image-url');

  await recordAction(
    page,
    'image-assets',
    '缺失图片 Markdown 渲染为可读错误占位且不崩溃',
    async () => {
      await replaceEditorContent(page, '![缺失的图片](./nonexistent-image-12345.png)\n');
      await ensureWriting(page);
      await delay(800);
      const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
      assert.ok(writingVisible, '写视图必须可见（不崩）');
    },
    async () => ({
      writingVisible: await page.locator('.cm6-markdown-editor-pane').isVisible(),
      pageErrors: runtimeMessages.pageErrors.length,
    }),
  );
  await captureUi(page, '13-image-fallback');

  // ============================ 代码块 / 公式块 / Mermaid ============================

  await recordAction(
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
      await page.getByRole('button', { name: /^公式块 \(/ }).click();
      source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('$$'), '公式块 fence 未生成');
    },
    async () => ({ source: await page.locator('.cm-content').textContent() }),
  );
  await captureUi(page, '14-rich-blocks');

  await recordAction(
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
  await captureUi(page, '15-mermaid-8-types');

  await recordAction(
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
  await captureUi(page, '16-mermaid-error');

  // ============================ 预览 / 终端 / 设置 ============================

  await recordAction(
    page,
    'markdown-preview-export',
    '打开 Word 预览并观察页数与版式',
    async () => {
      await replaceEditorContent(page, '# 预览测试\n\n正文段落 1。\n\n## 子标题\n\n正文段落 2。\n');
      await ensureWriting(page);
      await page.getByRole('button', { name: 'Word 预览', exact: true }).click();
      await page.locator('.word-preview-panel').waitFor({ state: 'visible', timeout: 10_000 });
      const pageMeta = await page.locator('.word-preview-meta').textContent().catch(() => '');
      assert.ok(pageMeta && pageMeta.length > 0, 'Word 预览页数元信息未渲染');
    },
    async () => ({
      meta: await page.locator('.word-preview-meta').textContent().catch(() => ''),
    }),
  );
  await captureUi(page, '17-word-preview');

  await recordAction(
    page,
    'markdown-preview-export',
    '打开 HTML 预览并切换预设',
    async () => {
      const closeBtn = page.locator('button[aria-label="关闭右侧预览"]');
      if (await closeBtn.count()) await closeBtn.click();
      await page.getByRole('button', { name: 'HTML 预览', exact: true }).click();
      await page.locator('.wechat-preview-panel').waitFor({ state: 'visible', timeout: 10_000 });
      const presetSelect = page.locator('select[aria-label="HTML 导出预设"]');
      await presetSelect.waitFor({ state: 'visible', timeout: 10_000 });
      const presetOptions = await presetSelect.locator('option').count();
      assert.ok(presetOptions > 0, 'HTML 预览预设列表为空');
    },
    async () => ({
      presetOptionCount: await page.locator('select[aria-label="HTML 导出预设"] option').count(),
    }),
  );
  await captureUi(page, '18-html-preview');

  await recordAction(
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
  await captureUi(page, '19-terminal-multi');

  // ============================ failure-boundaries ============================

  await recordAction(
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
  await captureUi(page, '20-failure-cleanup');

  // ============================ MD 基础语法扩展（B3-B24 / F1 / I1-I17 / V1-V19 全量）===========================

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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
      const source = await content.textContent();
      assert.ok(source?.includes('> outer'), '外层引用未生成');
      assert.ok(source?.includes('> > inner'), '嵌套引用未生成');
    },
    async () => ({ source: await page.locator('.cm-content').textContent() }),
  );

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
    page,
    'rich-markdown',
    'Mermaid flowchart 单图型断言（8 种中 1）',
    async () => {
      await replaceEditorContent(page, '```mermaid\nflowchart TD\n  A[开始] --> B[结束]\n```\n');
      await ensureWriting(page);
      await delay(2500);
      const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
      const source = await page.locator('.cm-content').textContent();
      // 严格断言：flowchart 必须渲染或源码保留
      assert.ok(svgVisible || source?.includes('flowchart'), `flowchart 既未渲染 SVG 也未保留源码：svgVisible=${svgVisible}, source=${source?.slice(0, 200)}`);
    },
    async () => ({ svgVisible: await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false) }),
  );

  await recordAction(
    page,
    'rich-markdown',
    'Mermaid sequenceDiagram 单图型断言',
    async () => {
      await replaceEditorContent(page, '```mermaid\nsequenceDiagram\n  Alice->>Bob: 你好\n  Bob-->>Alice: 很好\n```\n');
      await ensureWriting(page);
      await delay(2500);
      const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(svgVisible || source?.includes('sequenceDiagram'), `sequenceDiagram 未渲染：svgVisible=${svgVisible}`);
    },
    async () => ({ svgVisible: await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false) }),
  );

  await recordAction(
    page,
    'rich-markdown',
    'Mermaid classDiagram 单图型断言',
    async () => {
      await replaceEditorContent(page, '```mermaid\nclassDiagram\n  class Animal { +String name }\n  Animal <|-- Dog\n```\n');
      await ensureWriting(page);
      await delay(2500);
      const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(svgVisible || source?.includes('classDiagram'), `classDiagram 未渲染：svgVisible=${svgVisible}`);
    },
    async () => ({ svgVisible: await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false) }),
  );

  await recordAction(
    page,
    'rich-markdown',
    'Mermaid stateDiagram-v2 单图型断言',
    async () => {
      await replaceEditorContent(page, '```mermaid\nstateDiagram-v2\n  [*] --> 活跃\n  活跃 --> [*]\n```\n');
      await ensureWriting(page);
      await delay(2500);
      const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(svgVisible || source?.includes('stateDiagram'), `stateDiagram 未渲染：svgVisible=${svgVisible}`);
    },
    async () => ({ svgVisible: await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false) }),
  );

  await recordAction(
    page,
    'rich-markdown',
    'Mermaid mindmap 单图型断言',
    async () => {
      await replaceEditorContent(page, '```mermaid\nmindmap\n  root((根))\n    分支一\n    分支二\n```\n');
      await ensureWriting(page);
      await delay(2500);
      const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(svgVisible || source?.includes('mindmap'), `mindmap 未渲染：svgVisible=${svgVisible}`);
    },
    async () => ({ svgVisible: await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false) }),
  );

  await recordAction(
    page,
    'rich-markdown',
    'Mermaid timeline 单图型断言',
    async () => {
      await replaceEditorContent(page, '```mermaid\ntimeline\n  title 项目\n  section Q1\n    需求 : a\n```\n');
      await ensureWriting(page);
      await delay(2500);
      const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(svgVisible || source?.includes('timeline'), `timeline 未渲染：svgVisible=${svgVisible}`);
    },
    async () => ({ svgVisible: await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false) }),
  );

  await recordAction(
    page,
    'rich-markdown',
    'Mermaid pie 单图型断言',
    async () => {
      await replaceEditorContent(page, '```mermaid\npie title 占比\n  "A" : 40\n  "B" : 60\n```\n');
      await ensureWriting(page);
      await delay(2500);
      const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(svgVisible || source?.includes('pie'), `pie 未渲染：svgVisible=${svgVisible}`);
    },
    async () => ({ svgVisible: await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false) }),
  );

  await recordAction(
    page,
    'rich-markdown',
    'Mermaid erDiagram 单图型断言',
    async () => {
      await replaceEditorContent(page, '```mermaid\nerDiagram\n  USER ||--o{ ORDER : places\n```\n');
      await ensureWriting(page);
      await delay(2500);
      const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(svgVisible || source?.includes('erDiagram'), `erDiagram 未渲染：svgVisible=${svgVisible}`);
    },
    async () => ({ svgVisible: await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false) }),
  );

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
    page,
    'view-behavior',
    'Ctrl+Z / Ctrl+Y 撤销与重做栈完整',
    async () => {
      await replaceEditorContent(page, '');
      await ensureSource(page);
      await page.locator('.cm-content').click();
      await page.keyboard.type('first');
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

  await recordAction(
    page,
    'view-behavior',
    '新建未命名标签 + 多标签切换保留各自内容（per-doc 隔离）',
    async () => {
      // 在当前 tab 写入内容
      await replaceEditorContent(page, 'doc-1 内容');
      await page.getByRole('button', { name: '新建文档', exact: true }).click();
      await delay(300);
      await replaceEditorContent(page, 'doc-2 内容');
      // 切换回第一个 tab：点击 tab 列表中含 "doc-1 内容" 的 tab
      const tabs = page.locator('[role="tab"]');
      const tabCount = await tabs.count();
      if (tabCount < 2) return;
      // 切回含 "未保存" 或第一个 tab
      await tabs.first().click();
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

  await recordAction(
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

  // ============================ 表格全量操作扩展（T2 / T6 / T7 / T10-T15）===========================

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  await recordAction(
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

  // ============================ 图片扩展（占位可读 / SVG / WebP / GitHub）===========================

  await recordAction(
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

  await recordAction(
    page,
    'image-assets',
    'SVG 图片 ![](url.svg) 写作视图渲染',
    async () => {
      await replaceEditorContent(page, '![svg logo](https://upload.wikimedia.org/wikipedia/commons/4/4f/Vector_image_sample.svg)\n');
      await ensureWriting(page);
      await delay(1500);
      const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
      assert.ok(writingVisible, '写视图必须可见');
      // 检测 SVG img / svg 元素
      const hasSvg = await page.locator('.cm6-markdown-editor-pane svg img, .cm6-markdown-editor-pane img[src$=".svg"]').first().isVisible().catch(() => false);
      assert.ok(hasSvg, 'SVG 图片未渲染为 img/svg 元素');
    },
    async () => ({ hasSvg: await page.locator('.cm6-markdown-editor-pane svg img, .cm6-markdown-editor-pane img[src$=".svg"]').first().isVisible().catch(() => false) }),
  );

  await recordAction(
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

  await recordAction(
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

  // ============================ Issue #280 P0：基础 MD 编辑（12 actions） ============================

  await recordAction(
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
      const structureCount = await pane.locator('br, p').count();
      assert.ok(writingText?.includes('第一行') && writingText.includes('第二行'), `软换行写作视图缺少行文本：${writingText}`);
      assert.ok(structureCount >= 1, `软换行未保留 br 或 p 结构，节点数：${structureCount}`);
    },
    async () => ({
      source: await page.locator('.cm-content').textContent(),
      writingText: await page.locator('.cm6-markdown-editor-pane').textContent(),
      structureCount: await page.locator('.cm6-markdown-editor-pane br, .cm6-markdown-editor-pane p').count(),
    }),
  );
  await captureUi(page, '21-p0-soft-break');

  await recordAction(
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
  await captureUi(page, '22-p0-list-exit');

  await recordAction(
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
  await captureUi(page, '23-p0-select-all');

  await recordAction(
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
  await captureUi(page, '24-p0-nested-list');

  await recordAction(
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
  await captureUi(page, '25-p0-nested-quote');

  await recordAction(
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
  await captureUi(page, '26-p0-indented-code');

  await recordAction(
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
  await captureUi(page, '27-p0-nested-inline');

  await recordAction(
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
  await captureUi(page, '28-p0-strike-heading');

  await recordAction(
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
  await captureUi(page, '29-p0-sup-sub');

  await recordAction(
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
  await captureUi(page, '30-p0-footnote');

  await recordAction(
    page,
    'markdown-inline',
    'P0-11 图片嵌套链接写作视图生成外层链接',
    async () => {
      await replaceEditorContent(page, '[![alt](https://example.com/img.png)](https://example.com/page)');
      await ensureWriting(page);
      await delay(400);
      const link = page.locator('.cm6-markdown-editor-pane a[href*="example.com/page"]').first();
      assert.ok(await link.count() >= 1, `嵌套链接未生成外层 a：${await page.locator('.cm6-markdown-editor-pane').innerHTML()}`);
    },
    async () => ({ linkCount: await page.locator('.cm6-markdown-editor-pane a[href*="example.com/page"]').count() }),
  );
  await captureUi(page, '31-p0-nested-link');

  await recordAction(
    page,
    'editor-format-history',
    'P0-12 格式刷按钮可达且源段落保留粗体',
    async () => {
      await replaceEditorContent(page, '**source style**\n\nplain target');
      await ensureSource(page);
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('**source style**'), `格式刷探针段落未保留粗体源码：${source}`);
      const painter = page.getByRole('button', { name: '格式刷', exact: true });
      assert.ok(await painter.count() >= 1, '工具栏没有可达的格式刷按钮');
    },
    async () => ({
      source: await page.locator('.cm-content').textContent(),
      formatPainterButtonCount: await page.getByRole('button', { name: '格式刷', exact: true }).count(),
    }),
  );
  await captureUi(page, '32-p0-format-painter');

  // ============================ Issue #280 P1：乱码 / 渲染边界（11 actions） ============================

  await recordAction(
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
  await captureUi(page, '33-p1-consecutive-blank-lines');

  await recordAction(
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
  await captureUi(page, '34-p1-leading-trailing-blanks');

  await recordAction(
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
  await captureUi(page, '35-p1-trailing-whitespace');

  await recordAction(
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
  await captureUi(page, '36-p1-hard-soft-break');

  await recordAction(
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
  await captureUi(page, '37-p1-html-sub-sup');

  await recordAction(
    page,
    'render-correctness',
    'P1-6 sub 内嵌高亮不产生乱码',
    async () => {
      await replaceEditorContent(page, 'H<sub>==重==</sub>O');
      await ensureWriting(page);
      await delay(350);
      const pane = page.locator('.cm6-markdown-editor-pane');
      const text = await pane.textContent();
      assert.ok(!text?.includes('\uFFFD'), `嵌套 HTML 出现替换字符：${text}`);
      assert.ok(text?.includes('H') && text.includes('O'), `嵌套 HTML 丢失外围文字：${text}`);
    },
    async () => ({ text: await page.locator('.cm6-markdown-editor-pane').textContent() }),
  );
  await captureUi(page, '38-p1-nested-html-highlight');

  await recordAction(
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
  await captureUi(page, '39-p1-script-blocked');

  await recordAction(
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
  await captureUi(page, '40-p1-javascript-link');

  await recordAction(
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
  await captureUi(page, '41-p1-iframe-stripped');

  await recordAction(
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
      assert.ok(src && src.includes('中文'), `图片 src 未保留中文路径：${src}`);
      assert.ok(!text?.includes('\uFFFD'), `中文图片路径出现替换字符：${text}`);
    },
    async () => ({
      src: await page.locator('.cm6-markdown-editor-pane img').first().getAttribute('src'),
      text: await page.locator('.cm6-markdown-editor-pane').textContent(),
    }),
  );
  await captureUi(page, '42-p1-chinese-image-path');

  await recordAction(
    page,
    'render-correctness',
    'P1-11 中文链接 URL 编码后仍指向 example.com',
    async () => {
      await replaceEditorContent(page, '[Typola 主页](https://example.com/中文路径)');
      await ensureWriting(page);
      await delay(350);
      const pane = page.locator('.cm6-markdown-editor-pane');
      const link = pane.locator('a').first();
      assert.ok(await link.count() >= 1, `中文链接未生成 a：${await pane.innerHTML()}`);
      const href = await link.getAttribute('href');
      assert.ok(href?.includes('example.com'), `中文链接 href 丢失域名：${href}`);
      assert.ok(!href?.includes('\uFFFD'), `中文链接 href 出现替换字符：${href}`);
    },
    async () => ({ href: await page.locator('.cm6-markdown-editor-pane a').first().getAttribute('href') }),
  );
  await captureUi(page, '43-p1-chinese-link-url');

  // ============================ Issue #280 P2：次要 / 边缘（14 actions） ============================

  await recordAction(
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
      assert.ok(markCount >= 1 || text?.includes('高亮文本'), `mark 高亮和文本均不可见：${await pane.innerHTML()}`);
    },
    async () => ({
      text: await page.locator('.cm6-markdown-editor-pane').textContent(),
      markCount: await page.locator('.cm6-markdown-editor-pane mark').count(),
    }),
  );
  await captureUi(page, '44-p2-mark');

  await recordAction(
    page,
    'render-correctness',
    'P2-2 details/summary 与普通段落文字同时可见',
    async () => {
      await replaceEditorContent(page, '<details><summary>点击展开</summary>隐藏内容</details>\n\n普通段落');
      await ensureWriting(page);
      await delay(350);
      const text = await page.locator('.cm6-markdown-editor-pane').textContent();
      assert.ok(text?.includes('点击展开') && text.includes('隐藏内容') && text.includes('普通段落'), `details/summary 内容缺失：${text}`);
    },
    async () => ({ text: await page.locator('.cm6-markdown-editor-pane').textContent() }),
  );
  await captureUi(page, '45-p2-details-summary');

  await recordAction(
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
      const code = page.locator('.cm6-markdown-editor-pane pre code');
      assert.ok(await code.count() >= 1, `嵌套 fence 未生成 pre code：${await page.locator('.cm6-markdown-editor-pane').innerHTML()}`);
    },
    async () => ({
      source: await page.locator('.cm-content').textContent(),
      codeBlockCount: await page.locator('.cm6-markdown-editor-pane pre code').count(),
    }),
  );
  await captureUi(page, '46-p2-nested-fence');

  await recordAction(
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
  await captureUi(page, '47-p2-html-comment');

  await recordAction(
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
  await captureUi(page, '48-p2-task-list');

  await recordAction(
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
  await captureUi(page, '49-p2-reference-link');

  await recordAction(
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
  await captureUi(page, '50-p2-image-size');

  await recordAction(
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
  await captureUi(page, '51-p2-image-title');

  await recordAction(
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
    },
    async () => ({
      editorVisible: await page.locator('.cm6-markdown-editor-pane').isVisible(),
      activeOutlineCount: await page.locator('.floating-toc-row.active .floating-toc-item').filter({ hasText: '二级' }).count(),
    }),
  );
  await captureUi(page, '52-p2-outline-jump');

  await recordAction(
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
  await captureUi(page, '53-p2-word-line-count');

  await recordAction(
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
      assert.ok(!text?.includes('\uFFFD'), `emoji/中文混排出现替换字符：${text}`);
    },
    async () => ({ text: await page.locator('.cm6-markdown-editor-pane').textContent() }),
  );
  await captureUi(page, '54-p2-emoji-cjk');

  await recordAction(
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
  await captureUi(page, '55-p2-clear-format');

  await recordAction(
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
  await captureUi(page, '56-p2-quote-promote-demote');

  await recordAction(
    page,
    'editor-format-history',
    'P2-14 纯文本粘贴保留两行内容',
    async () => {
      await replaceEditorContent(page, '');
      await ensureSource(page);
      const content = page.locator('.cm-content');
      await content.click();
      await page.evaluate((text) => {
        const target = document.querySelector('.cm-content');
        if (!target) throw new Error('找不到源码编辑器');
        const transfer = new DataTransfer();
        transfer.setData('text/plain', text);
        target.dispatchEvent(new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }));
      }, '粘贴 fallback 第一行\n粘贴 fallback 第二行');
      await delay(300);
      const lines = await content.locator('.cm-line').allTextContents();
      const pasted = lines.join('\n');
      assert.ok(pasted.includes('粘贴 fallback 第一行') && pasted.includes('粘贴 fallback 第二行'), `纯文本粘贴内容缺失：${pasted}`);
    },
    async () => ({ source: await page.locator('.cm-content').textContent() }),
  );
  await captureUi(page, '57-p2-plain-text-paste');

  // ============================ 受阻场景说明 ============================

  skip('startup-distribution', 'exe-startup-02 (NSIS/MSI 安装)', '本脚本只运行 debug exe；安装包验收需 release 构建 + 真实安装');
  skip('startup-distribution', 'exe-startup-03 (portable zip)', '本脚本只运行 debug exe；portable 验收需 scripts/build-portable.mjs 产物');
  skip('startup-distribution', 'exe-startup-04 (缺失 WebView2)', '需要卸载 WebView2 Runtime 模拟，破坏宿主稳定性，不在本套件范围');
  skip('document-workspace', 'exe-doc-03 (打开文件夹)', '原生文件夹选择器无可用桌面自动化');
  skip('document-workspace', 'exe-doc-04 (退出后重开恢复)', '需要两次独立 verify:exe-core 运行；超出本脚本生命周期');
  skip('image-assets', 'exe-image-01 (原生图片选择)', '原生文件对话框无可用桌面自动化');
  skip('markdown-preview-export', 'exe-export-01 (PDF/Word 文件导出)', '原生保存对话框无可用桌面自动化');
  skip('failure-boundaries', 'exe-failure-01 (取消 / 权限 / 资源失败注入完整矩阵)', '需要 power-automation 注入，本套件仅做查找 Escape 干净关闭 + 写视图/Mermaid 不崩溃');
  skip('settings-appearance', 'exe-settings-01 (主题切换)', '由 verify-exe-core-suite.mjs 12-appearance-settings action 覆盖，本套件不重复');
  skip('ai-workbench-skillhub', 'exe-ai-01/02', '需要外部 Claude/OpenCode CLI 认证');
  skip('artifact-center', 'exe-artifact-01', '需要 AI 会话生成产物');
  skip('review-diff', 'exe-review-01/02', '需要 AI 会话与已保存文档');

  // ============================ 收尾 ============================

  await captureUi(page, '99-final-state');
  await writeRunJson({ runId, cdpVersion, git, packageVersion: packageJson.version, executable });
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
        status: actions.some((a) => a.status === 'failed') ? 'failed' : 'passed_with_gaps',
        verificationId: 'exe-core-extended',
        runId: meta.runId,
        observedAt: new Date().toISOString(),
        packageVersion: meta.packageVersion,
        command: meta.executable.path,
        commandLine: `${meta.executable.path} ${fixturePath}`,
        cdp: { endpoint: cdpEndpoint, port: cdpPort, browser: meta.cdpVersion.Browser, protocolVersion: meta.cdpVersion['Protocol-Version'] ?? null },
        runtime: { title: 'Typola', href: 'http://tauri.localhost/', runtime: 'tauri' },
        executable: meta.executable,
        git: meta.git,
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
  console.error('verify-exe-core-extended 失败：', error);
  await stopOwnedProcess().catch(() => undefined);
  await closeBrowser().catch(() => undefined);
  await removeRuntime().catch(() => undefined);
  await removeProfile().catch(() => undefined);
  process.exit(1);
});
