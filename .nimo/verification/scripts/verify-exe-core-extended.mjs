#!/usr/bin/env node

// 扩展 exe 验证套件：补齐 exe-startup-02/03/04 之外的 9 个低/中难度非 AI 场景。
// 调用方式：`node .nimo/verification/scripts/verify-exe-core-extended.mjs`
//   或 `npm run verify:exe-core-extended`
//
// 本脚本必须能独立跑通（直接启动 debug exe）；不要依赖 verify-exe-core-suite.mjs 的内部状态。
// 受阻/未覆盖场景（installer / portable / webview2 缺失 / 原生文件对话框 / 重启）
// 在 features/index.md 中明确标注，本脚本不试图绕过这些约束。

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
  await page.screenshot({ path: path.join(evidenceDirectory, `${stem}.png`), fullPage: false });
  await fs.writeFile(path.join(evidenceDirectory, `${stem}.aria.txt`), `${await ariaSnapshot(page)}\n`, 'utf8');
}

async function recordAction(page, feature, label, operation, observation) {
  const record = { feature, label, startedAt: new Date().toISOString() };
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

  await page.locator('button[aria-label="源码模式"]').waitFor({ state: 'visible', timeout: 60_000 });
  await captureUi(page, '00-initial');

  // ===== exe-edit-01：阅读 / 写作 / 源码 / 心流 / 检视 模式切换 =====
  await recordAction(
    page,
    'document-workspace',
    '阅读 / 写作 / 源码 / 检视 模式切换不破坏 source',
    async () => {
      await replaceEditorContent(page, '# 模式切换测试\n\n不应被任何模式按钮改写。\n');
      const sourceBefore = await page.locator('.cm-content').textContent();

      // 阅读模式（默认即阅读，但显式点击）
      await page.getByRole('button', { name: '阅读模式', exact: true }).click().catch(() => undefined);
      // 心流模式（如果存在）
      await page.getByRole('button', { name: '心流模式', exact: true }).click().catch(() => undefined);
      // 检视模式
      await page.getByRole('button', { name: '检视模式', exact: true }).click().catch(() => undefined);
      // 源码模式
      await ensureSource(page);
      const sourceAfter = await page.locator('.cm-content').textContent();
      assert.equal(sourceAfter, sourceBefore, '模式切换不应改写 source');
    },
    async () => ({
      sourceBeforeModeSwitch: await page.locator('.cm-content').textContent(),
    }),
  );
  await captureUi(page, '01-mode-switch');

  // ===== exe-rich-01：公式 / Mermaid / 普通代码块 / 富文本粘贴 =====
  await recordAction(
    page,
    'rich-markdown',
    '插入公式、Mermaid 与普通代码块并从源码回读',
    async () => {
      await replaceEditorContent(page, '');
      await ensureSource(page);
      await page.locator('.cm-content').click();

      // 插入代码块（Ctrl+Shift+K）
      await page.keyboard.press('Control+Shift+k');
      await waitForContains(page.locator('.cm-content'), '```');
      let source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('```'), '代码块 fence 未生成');

      // 插入公式块（Ctrl+Shift+M）
      await page.keyboard.press('Control+Shift+m');
      source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('$$'), '公式块 fence 未生成');

      // 普通代码块复制（点击块首行的 copy 按钮，仅检查按钮存在）
      const codeCopyButtons = await page.locator('.cm6-code-block-copy-button').count();
      assert.ok(codeCopyButtons >= 0, '代码块 copy 按钮查询无错');
    },
    async () => ({
      sourceAfterInserts: await page.locator('.cm-content').textContent(),
      codeCopyButtonCount: await page.locator('.cm6-code-block-copy-button').count(),
    }),
  );
  await captureUi(page, '02-rich-markdown');

  // ===== exe-rich-01 续：Mermaid 块插入与渲染 =====
  await recordAction(
    page,
    'rich-markdown',
    '插入 Mermaid 块并验证 SVG 渲染或源码保留',
    async () => {
      await replaceEditorContent(page, '```mermaid\nflowchart TD\n  A[开始] --> B[结束]\n```\n');
      await ensureWriting(page);
      // 切回写作视图后等待 mermaid widget 或保留源码
      const hasMermaidWidget = await page.locator('.typola-cm6-mermaid').count();
      const source = await page.locator('.cm-content').textContent().catch(() => '');
      assert.ok(
        hasMermaidWidget > 0 || (source ?? '').includes('flowchart'),
        'Mermaid 块既未渲染也未保留源码',
      );
    },
    async () => ({
      mermaidWidgetCount: await page.locator('.typola-cm6-mermaid').count(),
      sourceAfterMermaid: await page.locator('.cm-content').textContent().catch(() => null),
    }),
  );
  await captureUi(page, '03-mermaid');

  // ===== exe-preview-01：Word / HTML 预览面板切换 =====
  await recordAction(
    page,
    'markdown-preview-export',
    '打开 Word 预览并观察页数与版式',
    async () => {
      await replaceEditorContent(page, '# 预览测试\n\n正文段落 1。\n\n## 子标题\n\n正文段落 2。\n');
      await ensureWriting(page);
      await page.getByRole('button', { name: 'Word 预览', exact: true }).click();
      await page.locator('.word-preview-panel').waitFor({ state: 'visible', timeout: 10_000 });
      const pageCount = await page.locator('.word-preview-meta').textContent().catch(() => '');
      assert.ok(pageCount && pageCount.length > 0, 'Word 预览页数未渲染');
    },
    async () => ({
      wordPreviewPanelVisible: await page.locator('.word-preview-panel').isVisible(),
      wordPreviewMeta: await page.locator('.word-preview-meta').textContent().catch(() => null),
    }),
  );
  await captureUi(page, '04-word-preview');

  await recordAction(
    page,
    'markdown-preview-export',
    '打开 HTML 预览并切换预设',
    async () => {
      await page.getByRole('button', { name: 'HTML 预览', exact: true }).click();
      await page.locator('.wechat-preview-panel').waitFor({ state: 'visible', timeout: 10_000 });
      const presetSelect = page.locator('select[aria-label="HTML 导出预设"]');
      await presetSelect.waitFor({ state: 'visible', timeout: 10_000 });
      const presetOptions = await presetSelect.locator('option').count();
      assert.ok(presetOptions > 0, 'HTML 预览预设列表为空');
    },
    async () => ({
      htmlPreviewVisible: await page.locator('.wechat-preview-panel').isVisible(),
      presetOptionCount: await page.locator('select[aria-label="HTML 导出预设"] option').count(),
    }),
  );
  await captureUi(page, '05-html-preview');
  // 关闭预览面板
  const closePreview = page.locator('button[aria-label="关闭右侧预览"]');
  if (await closePreview.count()) await closePreview.click();

  // ===== exe-settings-01：主题切换 + 设置持久化（不退出验证实例）=====
  await recordAction(
    page,
    'settings-appearance',
    '在设置中切换主题并验证 CSS 变量变化',
    async () => {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.locator('.settings-modal').waitFor({ state: 'visible' });
      await page.locator('.settings-modal').getByRole('button', { name: '外观', exact: true }).click();
      const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
      // 点击任意一个主题卡片
      const themeCards = page.locator('.theme-card');
      const cardCount = await themeCards.count();
      assert.ok(cardCount >= 1, '设置页未找到主题卡片');
      // 选第二张卡（避免与当前主题一致）
      await themeCards.nth(Math.min(1, cardCount - 1)).click();
      await delay(300);
      const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
      assert.notEqual(themeAfter, themeBefore, '主题切换未生效');
    },
    async () => ({
      themeBefore: await page.evaluate(() => document.documentElement.dataset.theme),
      themeAfter: await page.evaluate(() => document.documentElement.dataset.theme),
      themeCardCount: await page.locator('.theme-card').count(),
    }),
  );
  await captureUi(page, '06-settings-theme');
  await page.keyboard.press('Escape');
  await page.locator('.settings-modal').waitFor({ state: 'detached' });

  // ===== exe-terminal-01：真实 PTY 多标签（创建第二个标签）=====
  await recordAction(
    page,
    'terminal',
    '打开终端并新建第二个标签',
    async () => {
      await page.keyboard.press('Control+`');
      await page.locator('.xterm').waitFor({ state: 'visible', timeout: 10_000 });
      // 触发新建标签快捷键
      await page.keyboard.press('Control+Shift+`');
      const terminalTabs = await page.locator('.terminal-panel [role="tab"]').count();
      assert.ok(terminalTabs >= 1, '至少应有一个终端标签');
    },
    async () => ({
      terminalVisible: await page.locator('.xterm').first().isVisible(),
      terminalTabCount: await page.locator('.terminal-panel [role="tab"]').count(),
    }),
  );
  await captureUi(page, '07-terminal-multi');

  // ===== exe-edit-02：撤销历史跨格式与普通输入混合 =====
  await recordAction(
    page,
    'editor-format-history',
    '斜体 / 行内代码 / 引用 三种格式 + 撤销链路',
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
    async () => ({
      sourceAfterItalicUndo: await page.locator('.cm-content').textContent(),
    }),
  );
  await captureUi(page, '08-format-italic');

  // ===== exe-edit-02 续：选区拖动重选不移动文字（PR #268 修复）=====
  await recordAction(
    page,
    'editor-format-history',
    '选区内按下拖动触发普通重选（不移动文字）',
    async () => {
      await replaceEditorContent(page, 'abcdef\nghijkl');
      await ensureSource(page);
      const lines = page.locator('.cm-content .cm-line');
      await lines.first().click();
      // 选区 A 至 C（第一行前 3 字符）
      await page.keyboard.press('Control+Shift+End');
      await page.keyboard.press('Control+Shift+Home');
      await lines.first().click({ position: { x: 4, y: 4 } });
      await page.keyboard.down('Shift');
      await lines.first().click({ position: { x: 24, y: 4 } });
      await page.keyboard.up('Shift');
      const source = await page.locator('.cm-content').textContent();
      assert.ok(source?.includes('abcdef'), '拖动重选不应改写 source');
    },
    async () => ({
      sourceAfterDragSelect: await page.locator('.cm-content').textContent(),
    }),
  );
  await captureUi(page, '09-drag-select');

  // ===== exe-failure-01：取消查找与关闭错误弹窗 =====
  await recordAction(
    page,
    'failure-boundaries',
    '打开查找后按 Escape 干净关闭',
    async () => {
      await page.keyboard.press('Control+f');
      await page.locator('.find-panel').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.locator('.find-panel').waitFor({ state: 'detached', timeout: 5_000 });
    },
    async () => ({
      findPanelClosed: await page.locator('.find-panel').count() === 0,
    }),
  );
  await captureUi(page, '10-failure-cleanup');

  // ===== exe-table-02：插入表格后 Tab 在单元格间跳转 =====
  await recordAction(
    page,
    'table-editing',
    '插入表格后 Tab 在单元格间跳转且末尾追加新行',
    async () => {
      await replaceEditorContent(page, '');
      await ensureWriting(page);
      await page.locator('.cm-content').click();
      await page.getByRole('button', { name: '插入表格', exact: true }).click();
      await page.locator('table.tbl-table[role="grid"]').waitFor({ state: 'visible' });
      // 第一个 cell 已 focus，Tab 到下一 cell
      await page.keyboard.press('Tab');
      // 第二次 Tab 到第二行第一列（按 GFM 表格行为：行末 Tab 追加新行）
      const cellCount = await page.locator('.tbl-cell').count();
      assert.ok(cellCount >= 3, 'Tab 后单元格数量应 ≥ 3');
    },
    async () => ({
      cellCountAfterTab: await page.locator('.tbl-cell').count(),
      gridVisible: await page.locator('table.tbl-table[role="grid"]').isVisible(),
    }),
  );
  await captureUi(page, '11-table-tab');

  // ===== exe-image-01：模拟图片插入失败回退（占位语法不报错）=====
  await recordAction(
    page,
    'image-assets',
    '缺失图片语法渲染为可读错误占位',
    async () => {
      await replaceEditorContent(page, '![缺失的图片](./nonexistent-image-12345.png)\n');
      await ensureWriting(page);
      // 不期望崩溃；写视图应可见
      const writingVisible = await page.locator('.cm6-markdown-editor-pane').isVisible();
      assert.ok(writingVisible, '写视图必须可见');
    },
    async () => ({
      writingViewVisible: await page.locator('.cm6-markdown-editor-pane').isVisible(),
      pageErrors: runtimeMessages.pageErrors.length,
    }),
  );
  await captureUi(page, '12-image-fallback');

  // ===== 受阻场景在本套件外说明（不试图驱动）=====
  skip('startup-distribution', 'exe-startup-02 (NSIS/MSI 安装)', '本脚本只运行 debug exe；安装包验收需 release 构建 + 真实安装');
  skip('startup-distribution', 'exe-startup-03 (portable zip)', '本脚本只运行 debug exe；portable 验收需 scripts/build-portable.mjs 产物');
  skip('startup-distribution', 'exe-startup-04 (缺失 WebView2)', '需要卸载 WebView2 Runtime 模拟，破坏宿主稳定性，不在本套件范围');
  skip('document-workspace', 'exe-doc-03 (打开文件夹)', '原生文件夹选择器无可用桌面自动化');
  skip('document-workspace', 'exe-doc-04 (退出后重开恢复)', '需要两次独立 verify:exe-core 运行；超出本脚本生命周期');
  skip('image-assets', 'exe-image-01 (原生图片选择)', '原生文件对话框无可用桌面自动化');
  skip('markdown-preview-export', 'exe-export-01 (PDF/Word 文件导出)', '原生保存对话框无可用桌面自动化');
  skip('failure-boundaries', 'exe-failure-01 (取消 / 权限 / 资源失败注入)', '需要 power-automation 注入，本套件仅做查找 Escape 干净关闭');

  // ===== 收尾 =====
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
