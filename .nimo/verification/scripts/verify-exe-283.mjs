#!/usr/bin/env node

// Issue #283 定向 exe 验证：六个修复在真实 Typola.exe（WebView2 CDP）中的可观察终态。
//
// Phase A（argv = md 夹具）：dirty 误报 / 折叠图标方向 / 行号渲染 / 绿色主题选中态
// Phase B（argv = 工作区目录）：目录以工作区打开 / 文件树右键「删除」菜单项
//
// 边界：删除的二次确认与安装包注册表写入属于原生对话框/安装器路径，按 SKILL.md
// 记录为受阻，不伪装成通过。

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
const executablePath = path.resolve(process.env.TYPOLA_VERIFY_EXE ?? path.join(repositoryRoot, 'src-tauri', 'target', 'debug', 'typola.exe'));
const runId = `issue283-${new Date().toISOString().replace(/[:.]/gu, '-')}-${process.pid}`;
const verificationRoot = path.join(repositoryRoot, '.nimo', 'verification');
const evidenceDirectory = path.join(verificationRoot, 'evidence', `${runId}-exe-283`);
const runtimeDirectory = path.join(verificationRoot, 'runtime', runId);

const fixtureFileName = 'issue283-fixture.md';
const fixturePath = path.join(runtimeDirectory, fixtureFileName);
const workspaceDirectory = path.join(runtimeDirectory, 'workspace');
const workspaceFileA = path.join(workspaceDirectory, 'alpha.md');
const workspaceFileB = path.join(workspaceDirectory, 'beta.md');

const lineNumberDoc = Array.from({ length: 30 }, (_, index) => {
  const number = index + 1;
  return number === 23 ? '第 23 行锚点内容' : `line ${number}`;
}).join('\n');
const foldDoc = '# 一级标题\n\n一级正文段落。\n\n## 二级标题甲\n\n甲的正文段落。\n\n## 二级标题乙\n\n乙的正文段落。\n';

const actions = [];
const skipped = [];
let screenshotIndex = 0;

function record(feature, label, status, observation) {
  actions.push({ feature, label, status, observation, at: new Date().toISOString() });
}

function skip(feature, item, reason) {
  skipped.push({ feature, item, reason });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function collectGitIdentity() {
  const head = runGit(['rev-parse', 'HEAD']);
  const diff = runGit(['diff', '--binary', 'HEAD', '--no-ext-diff']);
  const status = runGit(['status', '--short', '--untracked-files=all']);
  return {
    head: head.stdout.trim() || null,
    worktreeDiffId: sha256(`${diff.stdout}\n${status.stdout}`),
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
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForCdp(url, ownedProcess, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'CDP 尚未就绪';
  while (Date.now() < deadline) {
    if (ownedProcess.exitCode !== null) throw new Error(`exe 在 CDP 就绪前退出，退出码 ${ownedProcess.exitCode}`);
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.status === 200) return await response.json();
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

async function captureUi(page, stem) {
  const index = String(screenshotIndex).padStart(2, '0');
  screenshotIndex += 1;
  await page.screenshot({ path: path.join(evidenceDirectory, `${index}-${stem}.png`), fullPage: false });
  const aria = await page.locator('body').ariaSnapshot().catch(() => page.locator('body').innerText());
  await fs.writeFile(path.join(evidenceDirectory, `${index}-${stem}.aria.txt`), `${aria}\n`, 'utf8');
}

async function assertClean(page, label) {
  const dirtyIndicator = page.locator('.status-save-state[data-save-state="dirty"]');
  const dirtyVisible = await dirtyIndicator.count();
  assert.equal(dirtyVisible, 0, `${label}：出现 data-save-state=dirty（误标已修改）`);
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

async function launchPhase(args, profileDirectory) {
  const cdpPort = await allocatePort();
  const cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
  await fs.mkdir(profileDirectory, { recursive: true });
  const stdoutChunks = [];
  const stderrChunks = [];
  const ownedProcess = spawn(executablePath, args, {
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profileDirectory,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  ownedProcess.stdout?.on('data', (chunk) => stdoutChunks.push(chunk.toString()));
  ownedProcess.stderr?.on('data', (chunk) => stderrChunks.push(chunk.toString()));
  const cdpVersion = await waitForCdp(cdpEndpoint, ownedProcess);
  const browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 15_000 });
  const context = browser.contexts()[0];
  assert.ok(context, 'CDP 没有浏览器上下文');
  const page = await waitForPage(context);
  const consoleMessages = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  await page.locator('button[aria-label="源码模式"]').waitFor({ state: 'visible', timeout: 60_000 });
  const runtime = await page.evaluate(() => ({
    title: document.title,
    href: location.href,
    runtime: document.documentElement.dataset.runtime ?? null,
  }));
  assert.equal(runtime.title, 'Typola');
  assert.equal(runtime.href, 'http://tauri.localhost/');
  assert.equal(runtime.runtime, 'tauri');
  return {
    browser, page, ownedProcess, cdpEndpoint, cdpPort, cdpVersion, consoleMessages,
    stdout: () => stdoutChunks.join('').slice(-50_000),
    stderr: () => stderrChunks.join('').slice(-50_000),
  };
}

async function stopPhase(phase) {
  await phase.browser.close().catch(() => undefined);
  const pid = phase.ownedProcess.pid;
  if (pid && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true });
  } else if (!phase.ownedProcess.killed) {
    phase.ownedProcess.kill('SIGTERM');
  }
  if (phase.ownedProcess.exitCode === null && !phase.ownedProcess.killed) {
    await Promise.race([
      new Promise((resolve) => phase.ownedProcess.once('close', resolve)),
      delay(10_000),
    ]);
  }
  await delay(500);
  let cdpClosed = false;
  try {
    await fetch(`${phase.cdpEndpoint}/json/version`);
  } catch {
    cdpClosed = true;
  }
  return { processStopped: phase.ownedProcess.exitCode !== null || phase.ownedProcess.killed, cdpClosed };
}

async function phaseA() {
  await fs.mkdir(path.dirname(fixturePath), { recursive: true });
  await fs.writeFile(fixturePath, '# Issue 283 夹具\n\n打开即可见的正文段落。\n\n第二段正文，用于点击定位。\n', 'utf8');
  const phase = await launchPhase([fixturePath], path.join(runtimeDirectory, 'webview2-a'));
  const { page } = phase;
  try {
    await captureUi(page, 'phaseA-initial');

    // ---- 场景 1：打开/点击不误标「已修改」 ----
    await page.locator('.cm6-markdown-editor-pane').waitFor({ state: 'visible' });
    await page.locator('.status-path').waitFor({ state: 'visible' });
    await assertClean(page, '初始打开');
    record('issue283-dirty', '文件关联打开后初始状态为未修改', 'passed', {
      statusPath: await page.locator('.status-path').innerText(),
      dirtyIndicatorCount: 0,
    });

    await page.locator('.cm-content').click({ position: { x: 60, y: 40 } });
    await delay(200);
    await page.locator('.cm-content').click({ position: { x: 90, y: 90 } });
    await delay(200);
    await ensureSource(page);
    await page.locator('.cm-content').click({ position: { x: 80, y: 60 } });
    await delay(200);
    await ensureWriting(page);
    await assertClean(page, '点击正文多处');
    record('issue283-dirty', '渲染/源码模式下点击正文多处不出现已修改标记', 'passed', { dirtyIndicatorCount: 0 });

    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await page.locator('.editor-tab').filter({ hasText: '未命名' }).first().waitFor({ state: 'visible' });
    await assertClean(page, '新建未命名标签后');
    const fixtureTab = page.locator('.editor-tab').filter({ hasText: fixtureFileName }).first();
    await fixtureTab.click();
    await page.locator('.cm6-markdown-editor-pane').filter({ hasText: '打开即可见的正文段落' }).waitFor({ state: 'visible' });
    await assertClean(page, '从未命名标签切回夹具标签');
    record('issue283-dirty', '新建标签后切回原文件：程序性整篇替换不误标已修改', 'passed', {
      fixtureVisible: (await page.locator('.cm6-markdown-editor-pane').innerText()).includes('打开即可见的正文段落'),
      dirtyIndicatorCount: 0,
    });
    await captureUi(page, 'dirty-after-tab-switch');

    // ---- 场景 5：标题折叠图标方向（收起 ▶ / 展开 ▼） ----
    await replaceEditorContent(page, foldDoc);
    await ensureWriting(page);
    const toggle = page.locator('.typola-heading-fold-toggle').first();
    await toggle.waitFor({ state: 'visible', timeout: 15_000 });
    const initialGlyph = (await toggle.innerText()).trim();
    assert.equal(initialGlyph, '▼', `折叠初始(展开态)应为 ▼，实际 ${initialGlyph}`);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await toggle.click();
    await delay(300);
    const foldedGlyph = (await page.locator('.typola-heading-fold-toggle').first().innerText()).trim();
    assert.equal(foldedGlyph, '▶', `折叠后(收起态)应为 ▶，实际 ${foldedGlyph}`);
    assert.equal(await page.locator('.typola-heading-fold-toggle').first().getAttribute('aria-expanded'), 'false');
    const foldedLineHidden = await page.locator('.typola-cm-line-folded').count();
    assert.ok(foldedLineHidden > 0, '折叠后应有隐藏行');
    record('issue283-fold', '标题折叠箭头方向：展开 ▼ / 收起 ▶，折叠行隐藏', 'passed', {
      initialGlyph, foldedGlyph, foldedLineHiddenCount: foldedLineHidden,
    });
    await captureUi(page, 'fold-glyph');

    // ---- 场景 6：行号渲染（源码 + 写作模式，第 23 行锚点） ----
    await replaceEditorContent(page, lineNumberDoc);
    await ensureSource(page);
    const sourceNumbers = page.locator('.cm-lineNumbers');
    await sourceNumbers.first().waitFor({ state: 'visible' });
    const sourceGutterText = await sourceNumbers.innerText();
    assert.ok(sourceGutterText.includes('23'), '源码模式行号应包含 23');
    const sourceNumberColor = await sourceNumbers.evaluate((el) => getComputedStyle(el).color);
    record('issue283-linenumber', '源码模式行号列包含第 23 行且使用 gutter 文字色', 'passed', {
      has23: sourceGutterText.includes('23'),
      gutterColor: sourceNumberColor,
    });
    await ensureWriting(page);
    const writingGutter = page.locator('.cm-block-line-number-gutter');
    await writingGutter.waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.cm-content').click({ position: { x: 40, y: 40 } });
    await delay(600);
    const writingGutterText = await writingGutter.innerText();
    assert.ok(writingGutterText.includes('23'), '写作模式行号应包含 23');
    const writingNumber = page.locator('.cm-block-source-line-number').first();
    const writingFont = await writingNumber.evaluate((el) => getComputedStyle(el).fontFamily);
    const writingNumericVariant = await writingNumber.evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    assert.ok(/mono/i.test(writingFont), `写作模式行号应锁定等宽字体，实际 ${writingFont}`);
    record('issue283-linenumber', '写作模式行号包含 23 且锁定等宽字体', 'passed', {
      has23: writingGutterText.includes('23'),
      fontFamily: writingFont,
      fontVariantNumeric: writingNumericVariant,
    });
    await captureUi(page, 'line-number-23');

    // ---- 场景 3：绿色(brutalist)主题下设置选中态高对比 ----
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const settingsModal = page.locator('.settings-modal');
    await settingsModal.waitFor({ state: 'visible' });
    await settingsModal.getByRole('button', { name: '外观', exact: true }).click();
    const brutalistCard = settingsModal.locator('.theme-card[data-theme-card="brutalist"]');
    await brutalistCard.waitFor({ state: 'visible' });
    await brutalistCard.click();
    await page.locator('html[data-theme-id="brutalist"]').waitFor({ timeout: 10_000 });
    assert.equal(await settingsModal.locator('.theme-card.active').getAttribute('data-theme-card'), 'brutalist');
    const activeCardShadow = await settingsModal.locator('.theme-card.active').evaluate((el) => getComputedStyle(el).boxShadow);
    const activeModeButton = settingsModal.locator('.appearance-mode-switch button.active');
    assert.equal(await activeModeButton.innerText(), '主题模式');
    const activeModeBackground = await activeModeButton.evaluate((el) => getComputedStyle(el).backgroundColor);
    const inactiveModeBackground = await settingsModal.locator('.appearance-mode-switch button:not(.active)').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.notEqual(activeModeBackground, inactiveModeBackground, '外观模式选中/未选中底色应可区分');
    record('issue283-theme', 'brutalist 主题下主题卡与外观模式选中态高对比可辨', 'passed', {
      themeId: 'brutalist',
      activeCardBoxShadow: activeCardShadow,
      activeModeBackground,
      inactiveModeBackground,
    });
    await captureUi(page, 'theme-brutalist-active');
    // 切回默认主题，避免影响后续
    await settingsModal.locator('.theme-card[data-theme-card="plain-paper"]').click();
    await page.locator('html[data-theme-id="plain-paper"]').waitFor({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await settingsModal.waitFor({ state: 'detached' });
    record('issue283-theme', '切回 plain-paper 默认主题', 'passed', { themeId: 'plain-paper' });
  } finally {
    const cleanup = await stopPhase(phase);
    record('cleanup', `Phase A 实例清理（PID ${phase.ownedProcess.pid}）`, cleanup.processStopped && cleanup.cdpClosed ? 'passed' : 'failed', cleanup);
    return phase;
  }
}

async function phaseB() {
  await fs.mkdir(workspaceDirectory, { recursive: true });
  await fs.writeFile(workspaceFileA, '# Alpha\n\nalpha 正文。\n', 'utf8');
  await fs.writeFile(workspaceFileB, '# Beta\n\nbeta 正文。\n', 'utf8');
  const phase = await launchPhase([workspaceDirectory], path.join(runtimeDirectory, 'webview2-b'));
  const { page } = phase;
  try {
    // ---- 场景 2：argv 目录 → 以工作区方式打开 ----
    const sidebar = page.locator('aside.workspace-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 20_000 });
    const rootPathText = await page.locator('.workspace-root-path').innerText();
    assert.ok(rootPathText.includes('workspace'), `工作区根应指向传入目录，实际 ${rootPathText}`);
    const treeItems = await page.locator('.file-tree-item').count();
    assert.ok(treeItems >= 2, `文件树应列出夹具文件，实际 ${treeItems} 项`);
    const treeText = await page.locator('.file-tree-list').innerText();
    assert.ok(treeText.includes('alpha.md') && treeText.includes('beta.md'), '文件树应包含 alpha.md 与 beta.md');
    record('issue283-folder-open', '以目录参数启动：目录被分流为工作区打开，文件树可见', 'passed', {
      rootPath: rootPathText,
      treeItemCount: treeItems,
      treeHasFixtures: true,
    });
    await captureUi(page, 'phaseB-workspace-root');

    // ---- 场景 4：文件树右键「删除」菜单项 ----
    const alphaNode = page.locator('.file-tree-item').filter({ hasText: 'alpha.md' }).first();
    await alphaNode.click({ button: 'right' });
    const deleteItem = page.locator('.file-tree-context-menu .file-tree-menu-delete');
    await deleteItem.waitFor({ state: 'visible', timeout: 10_000 });
    const menuText = await page.locator('.file-tree-context-menu').innerText();
    assert.ok(menuText.includes('删除'), `右键菜单应包含删除项，实际 ${menuText}`);
    record('issue283-delete', '文件树右键菜单出现「删除」危险色菜单项', 'passed', {
      menuItems: menuText.split(/\r?\n/gu).filter(Boolean),
    });
    await captureUi(page, 'delete-context-menu');
    skip('issue283-delete', '删除确认与实际删除执行', '二次确认走 Tauri 原生对话框（plugin-dialog confirm），CDP 无法交互；Rust 侧 delete_workspace_entry 的边界校验另由单测覆盖，本次不制造不可自动化的等待窗口。');
    await page.keyboard.press('Escape');
    await page.locator('.file-tree-context-menu').waitFor({ state: 'detached', timeout: 10_000 });
    skip('issue283-folder-open', 'Explorer 目录右键注册表项', 'NSIS installerHooks 的注册表写入只随安装包执行；debug --no-bundle 不安装，需安装包验证（exe-startup-02 同类受阻）。');
  } finally {
    const cleanup = await stopPhase(phase);
    record('cleanup', `Phase B 实例清理（PID ${phase.ownedProcess.pid}）`, cleanup.processStopped && cleanup.cdpClosed ? 'passed' : 'failed', cleanup);
  }
}

const executableStat = await fs.stat(executablePath);
const executableBytes = await fs.readFile(executablePath);
const summary = {
  status: 'running',
  verificationId: 'issue283-targeted',
  runId,
  observedAt: new Date().toISOString(),
  executable: {
    path: executablePath,
    size: executableStat.size,
    lastWriteTime: executableStat.mtime.toISOString(),
    sha256: sha256(executableBytes),
  },
  git: collectGitIdentity(),
  scenarios: {
    'issue283-dirty': 'Phase A',
    'issue283-fold': 'Phase A',
    'issue283-linenumber': 'Phase A',
    'issue283-theme': 'Phase A',
    'issue283-folder-open': 'Phase B',
    'issue283-delete': 'Phase B',
  },
  actions,
  skipped,
};

try {
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.mkdir(runtimeDirectory, { recursive: true });
  await phaseA();
  await phaseB();
  const failedActions = actions.filter((action) => action.status === 'failed');
  summary.status = failedActions.length === 0 ? 'passed_with_gaps' : 'failed';
} catch (error) {
  summary.status = 'failed';
  summary.error = error instanceof Error ? error.message : String(error);
  summary.actions = actions;
  summary.skipped = skipped;
} finally {
  try {
    await fs.rm(runtimeDirectory, { recursive: true, force: true });
    summary.runtimeRemoved = true;
  } catch {
    summary.runtimeRemoved = false;
  }
  await fs.writeFile(path.join(evidenceDirectory, 'run.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: summary.status, evidenceDirectory, runId, actions: actions.length, skipped: skipped.length }, null, 2));
  if (summary.status === 'failed') process.exitCode = 1;
}
