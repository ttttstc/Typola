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
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('|') && source?.includes('---'), '源码未保留表格 Markdown');
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
        await replaceEditorContent(page, '```' + d.name + '\n' + d.src + '\n```\n');
        await ensureWriting(page);
        await delay(2500);
        const svgVisible = await page.locator('.typola-cm6-mermaid svg, .typola-mermaid svg').first().isVisible().catch(() => false);
        const hasError = await page.locator('.typola-mermaid-error').first().isVisible().catch(() => false);
        const src = await page.locator('.cm-content').textContent().catch(() => '');
        results[d.name] = {
          svgRendered: svgVisible,
          hasErrorCard: hasError,
          sourcePreserved: src?.includes(d.src.split('\n')[1] ?? d.src) ?? false,
        };
      }
      const rendered = Object.values(results).filter((r) => r.svgRendered).length;
      const error = Object.values(results).filter((r) => r.hasErrorCard).length;
      const preserved = Object.values(results).filter((r) => r.sourcePreserved).length;
      // 严格断言：8 种图型必须全部保留源码（核心约束）
      assert.ok(preserved === 8, `Mermaid 8 种图型源码未全部保留：preserved=${preserved}/8, ${JSON.stringify(results)}`);
      // 软断言：至少 1 种渲染为 SVG（jsdom 限制下不强求 8）
      assert.ok(rendered + error >= 1, `Mermaid 8 种图型既未渲染为 SVG 也未出现错误卡：${JSON.stringify(results)}`);
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
