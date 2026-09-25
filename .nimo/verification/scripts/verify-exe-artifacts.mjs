#!/usr/bin/env node

// AI 制品体验 exe 验证套件：不依赖真实 Provider，通过向被监听的
// <home>/.typola-output/conv-N/ 写入制品文件，触发 watcher → manifest 推导 →
// 制品中心 → 存为文件（命名弹窗）→ 已归档留痕的完整链路。
// 调用方式：`node .nimo/verification/scripts/verify-exe-artifacts.mjs`
//   或 `npm run verify:exe-artifacts`
//
// 受阻（本脚本不覆盖，原因见 skipped 记录）：
// - 生成后自动打开面板：onArtifactFile 仅由真实 provider artifact_file 事件触发
// - 关闭会话清理确认：confirmDialog 走原生对话框，无桌面自动化

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
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
const evidenceDirectory = path.join(verificationRoot, 'evidence', `${runId}-exe-artifacts`);
const runtimeDirectory = path.join(verificationRoot, 'runtime', runId);
const fixturePath = path.join(runtimeDirectory, 'artifact-fixture.md');

// 与被测 exe 的默认 AI 工作区一致（未设置 aiWorkspaceRoot 且未打开文件夹时
// = <home>/.typola/userdata,见 AppLayout defaultAiWorkspaceRoot）。
// conv 编号取不易与真实会话冲突的大数。测试结束全部清理。
const homeDir = os.homedir();
const aiWorkspaceRoot = path.join(homeDir, '.typola', 'userdata');
const convDirName = 'conv-9901';
const outputRoot = path.join(aiWorkspaceRoot, '.typola-output');
const convDir = path.join(outputRoot, convDirName);
const seededArtifact = path.join(convDir, 'report.html');
const archivedTarget = path.join(aiWorkspaceRoot, '制品体验验证归档.html');
// 第二个会话目录:用于「关闭自动打开面板后未读角标才可观测」的场景(同目录再放文件会覆盖 manifest)。
const convDir2Name = 'conv-9902';
const convDir2 = path.join(outputRoot, convDir2Name);
const seededArtifact2 = path.join(convDir2, 'badge.html');

let ownedProcess = null;
let browser = null;
let cdpEndpoint = null;
let cdpPort = null;
let profileDirectory = null;

const actions = [];
const skipped = [];
const runtimeMessages = { stdout: '', stderr: '', console: [], pageErrors: [], requestFailures: [] };
const cleanup = { processPid: null, processStopped: false, profileRemoved: false, runtimeRemoved: false, cdpClosed: false, seededRemoved: false, archivedRemoved: false };

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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
    const [page] = context.pages();
    if (page) return page;
    await delay(250);
  }
  throw new Error('等待页面超时');
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

async function confirmCdpClosed() {
  if (!cdpEndpoint) return;
  try {
    await fetchText(`${cdpEndpoint}/json/version`);
    cleanup.cdpClosed = false;
  } catch {
    cleanup.cdpClosed = true;
  }
}

async function removeSeededFiles() {
  await fs.rm(convDir, { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(convDir2, { recursive: true, force: true }).catch(() => undefined);
  cleanup.seededRemoved = !(await fs.stat(convDir).then(() => true).catch(() => false));
  await fs.rm(archivedTarget, { force: true }).catch(() => undefined);
  cleanup.archivedRemoved = !(await fs.stat(archivedTarget).then(() => true).catch(() => false));
}

async function writeRunJson(meta) {
  await fs.writeFile(
    path.join(evidenceDirectory, 'run.json'),
    JSON.stringify(
      {
        status: actions.some((a) => a.status === 'failed') ? 'failed' : 'passed_with_gaps',
        verificationId: 'exe-artifacts',
        runId: meta.runId,
        observedAt: new Date().toISOString(),
        packageVersion: meta.packageVersion,
        command: meta.executable.path,
        cdp: { endpoint: cdpEndpoint, port: cdpPort, browser: meta.cdpVersion.Browser },
        executable: meta.executable,
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

async function main() {
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.mkdir(runtimeDirectory, { recursive: true });
  await fs.writeFile(fixturePath, '# 制品体验夹具\n\n初始夹具正文。\n', 'utf8');
  // 预清理上一次可能残留的测试文件
  await removeSeededFiles();

  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const executableStat = await fs.stat(executablePath);
  const executable = {
    path: executablePath,
    size: executableStat.size,
    lastWriteTime: executableStat.mtime.toISOString(),
    sha256: sha256(await fs.readFile(executablePath)),
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

  try {
    await page.locator('button[aria-label="源码模式"]').waitFor({ state: 'visible', timeout: 60_000 });
  } catch (error) {
    runtimeMessages.pageErrors.push(`initial bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
    await writeRunJson({ runId, cdpVersion: { Browser: 'unknown' }, packageVersion: packageJson.version, executable });
    await stopOwnedProcess();
    await closeBrowser();
    await confirmCdpClosed();
    await removeSeededFiles();
    await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
    return;
  }
  await captureUi(page, '00-initial');

  // ============ 场景 1:watcher 落盘 → manifest 语义标题推导 + chips 出现 ============

  await recordAction(
    page,
    'artifact-experience',
    '制品落盘后自动生成 manifest 且标题从 <title> 推导',
    async () => {
      await fs.mkdir(convDir, { recursive: true });
      await fs.writeFile(
        seededArtifact,
        '<html><head><title>制品体验验证标题</title></head><body><h1>正文标题</h1></body></html>',
        'utf8',
      );
      // watcher 防抖 + ensureArtifactManifest 写盘,给足窗口
      const manifestPath = path.join(convDir, 'artifact.json');
      const deadline = Date.now() + 20_000;
      let manifest = null;
      while (Date.now() < deadline) {
        manifest = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => null);
        if (manifest) break;
        await delay(500);
      }
      assert.ok(manifest, '20s 内未生成 artifact.json(watcher 未触发?)');
      assert.equal(manifest.title, '制品体验验证标题', `标题应推导自 <title>,实际:${manifest.title}`);
    },
    async () => ({ convDir }),
  );
  await captureUi(page, '01-artifact-seeded');

  // ============ 场景 1b:chips 面板「保存到工作区」也走命名框 ============
  // 回归点:该入口此前绕过 PromptDialog 直接 move,留下悬空 manifest.primaryFile 且不标 archived。

  await recordAction(
    page,
    'artifact-experience',
    'chips 面板「保存到工作区」弹命名框而非静默落盘',
    async () => {
      // 非产物不应进 chips:conv-N 目录(mkdir 事件)与 artifact.json(manifest 元数据)。
      const chipNames = await page.locator('.artifact-preview .artifact-chip-name').allTextContents();
      for (const junk of ['artifact.json', convDirName]) {
        assert.ok(!chipNames.includes(junk), `chips 不应包含非产物「${junk}」,实际:${chipNames.join(' | ')}`);
      }
      // chip 的归档按钮 hover 才可点(CSS: opacity 0 + pointer-events none),先 hover 行再点。
      const chipRow = page.locator('.artifact-preview .artifact-chip-row', { hasText: 'report.html' }).first();
      await chipRow.waitFor({ state: 'visible', timeout: 15_000 });
      await chipRow.hover();
      await chipRow.locator('.artifact-archive').click();
      const dialog = page.locator('.rename-dialog');
      await dialog.waitFor({ state: 'visible', timeout: 10_000 });
      assert.ok((await dialog.locator('input').inputValue()).trim().length > 0, '默认名不应为空');
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    },
    async () => ({ aria: (await ariaSnapshot(page)).slice(0, 300) }),
  );
  await captureUi(page, '01b-chip-archive-prompt');

  // ============ 场景 1c:生成后 toast「保存到工作区」同样走命名框 ============

  await recordAction(
    page,
    'artifact-experience',
    '生成后 toast「保存到工作区」弹命名框',
    async () => {
      // 单文件启动时左栏初始为 none(无 rail 按钮),先用工具栏「文件树」开关把左栏唤出。
      await page.locator('.toolbar-nav-actions button').first().click();
      await page.locator('button[aria-label="打开 AI 工作台"]').click();
      const toast = page.locator('.artifact-toast');
      await toast.waitFor({ state: 'visible', timeout: 15_000 });
      await toast.getByRole('button', { name: '保存到工作区', exact: true }).click();
      const dialog = page.locator('.rename-dialog');
      await dialog.waitFor({ state: 'visible', timeout: 10_000 });
      assert.ok((await dialog.locator('input').inputValue()).trim().length > 0, '默认名不应为空');
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    },
    async () => ({ aria: (await ariaSnapshot(page)).slice(0, 300) }),
  );
  await captureUi(page, '01c-toast-archive-prompt');

  // ============ 场景 2:watcher 发现的制品自动滑出制品面板 + 卡片语义标题 ============
  // 回归点:自动打开此前只挂在 provider 的 artifact_file 回调上,watcher 兜底发现的制品不触发。

  await recordAction(
    page,
    'artifact-experience',
    'watcher 兜底发现的制品自动滑出右侧制品面板,卡片显示推导标题',
    async () => {
      const panel = page.locator('.artifact-center-panel');
      await panel.waitFor({ state: 'visible', timeout: 15_000 });
      // 切到「全部产物」(conv-9901 不是活动会话)
      await page.getByRole('button', { name: '全部产物', exact: true }).click();
      const card = page.locator('.artifact-center-card', { hasText: '制品体验验证标题' });
      await card.waitFor({ state: 'visible', timeout: 15_000 });
    },
    async () => ({ aria: (await ariaSnapshot(page)).slice(0, 400) }),
  );
  await captureUi(page, '02-artifact-auto-open');

  // ============ 场景 2b:关闭「自动打开面板」后,未读角标才可观测 ============
  // 自动打开默认开启时,面板一开就把新制品写回已读水位,角标必然为 0;
  // 角标是「自动打开关闭」时的兜底提示,所以必须先关掉该设置再造制品。

  await recordAction(
    page,
    'artifact-experience',
    '关闭自动打开设置后,新制品在工具栏「AI 产物」上显示未读角标',
    async () => {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await delay(500);
      await page.getByRole('button', { name: '生成制品后自动打开面板' }).click();
      await delay(300);
      await page.keyboard.press('Escape');
      await delay(400);
      const entry = page.locator('button[aria-label="AI 产物"]');
      // 收起制品面板,让后续新制品处于「未读」状态
      if (await page.locator('.artifact-center-panel').isVisible().catch(() => false)) {
        await entry.click();
        await delay(400);
      }
      // 第二个制品放独立会话目录:同目录再放文件会覆盖 conv-9901 的 manifest
      await fs.mkdir(convDir2, { recursive: true });
      await fs.writeFile(seededArtifact2, '<html><head><title>角标验证</title></head></html>', 'utf8');
      const badge = entry.locator('.toolbar-artifact-badge');
      await badge.waitFor({ state: 'visible', timeout: 20_000 });
      const badgeText = await badge.textContent();
      assert.ok(Number(badgeText) >= 1, `角标计数应 ≥1,实际:${badgeText}`);
    },
    async () => ({ aria: (await ariaSnapshot(page)).slice(0, 400) }),
  );
  await captureUi(page, '02b-artifact-unread-badge');

  // ============ 场景 3:存为文件(命名弹窗)→ 工作区落盘 + 卡片标记已归档 ============

  await recordAction(
    page,
    'artifact-experience',
    '存为文件弹命名框,确认后工作区出现语义命名文件且卡片标记已归档',
    async () => {
      // 场景 2b 收起了面板,这里重新打开(同时也验证入口仍可用)
      await page.locator('button[aria-label="AI 产物"]').click();
      await page.locator('.artifact-center-panel').waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByRole('button', { name: '全部产物', exact: true }).click();
      const card = page.locator('.artifact-center-card', { hasText: '制品体验验证标题' });
      await card.waitFor({ state: 'visible', timeout: 15_000 });
      await card.getByRole('button', { name: '存为文件' }).click();
      const dialog = page.locator('.rename-dialog');
      await dialog.waitFor({ state: 'visible', timeout: 10_000 });
      const input = dialog.locator('input');
      assert.equal(await input.inputValue(), '制品体验验证标题', '默认名应取推导标题');
      await input.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.insertText('制品体验验证归档');
      await dialog.getByRole('button', { name: '存为文件', exact: true }).click();
      // 归档后:工作区(home)出现新文件,原 conv 内文件消失
      const deadline = Date.now() + 15_000;
      let landed = false;
      while (Date.now() < deadline) {
        landed = await fs.stat(archivedTarget).then(() => true).catch(() => false);
        if (landed) break;
        await delay(400);
      }
      assert.ok(landed, `归档文件未落盘:${archivedTarget}`);
      assert.ok(!(await fs.stat(seededArtifact).then(() => true).catch(() => false)), '归档是 move,原文件应消失');
      // 卡片保留并标记已归档(重新扫描可能需要手动刷新)
      await page.locator('.artifact-center-header-actions button').first().click();
      const archivedCard = page.locator('.artifact-center-card', { hasText: '制品体验验证归档' });
      await archivedCard.waitFor({ state: 'visible', timeout: 15_000 });
      const meta = await archivedCard.locator('.artifact-center-meta').textContent();
      assert.ok(meta?.includes('已归档'), `卡片应标记已归档:${meta}`);
      // 归档后主文件已移出 .typola-output,delete_artifact_file 必然被 Rust 拒绝;
      // 存为文件/插入文档同理无意义,三者都不应再出现。
      const archivedLabels = await Promise.all(
        (await archivedCard.locator('.artifact-center-card-actions button').all()).map((button) => button.textContent()),
      );
      for (const gone of ['存为文件', '插入文档', '删除']) {
        assert.ok(
          !archivedLabels.some((label) => label?.includes(gone)),
          `已归档卡片不应再有「${gone}」,实际按钮:${archivedLabels.join(' | ')}`,
        );
      }
    },
    async () => ({ archivedTarget }),
  );
  await captureUi(page, '03-artifact-archived');

  // ============ 受阻场景 ============

  skip('artifact-experience', '关闭会话清理 conv-N 确认', 'confirmDialog 走原生对话框,无桌面自动化;Rust 命令层已由 cargo test 覆盖');

  // ============ 收尾 ============

  // 场景 2b 关掉了「生成制品后自动打开面板」。该设置走 localStorage,为免污染用户配置,恢复为开启。
  try {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await delay(500);
    const toggle = page.getByRole('button', { name: '生成制品后自动打开面板' });
    if ((await toggle.getAttribute('aria-pressed')) === 'false') {
      await toggle.click();
      await delay(300);
    }
    await page.keyboard.press('Escape');
    await delay(300);
  } catch (error) {
    runtimeMessages.console.push({ type: 'cleanup-warning', text: `恢复 autoOpenArtifactPanel 失败: ${String(error)}` });
  }

  await writeRunJson({ runId, cdpVersion, packageVersion: packageJson.version, executable });
  await stopOwnedProcess();
  await closeBrowser();
  await confirmCdpClosed();
  await removeSeededFiles();
  await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
  cleanup.runtimeRemoved = true;
  cleanup.profileRemoved = true;
}

main().catch(async (error) => {
  console.error('verify-exe-artifacts 失败：', error);
  await stopOwnedProcess().catch(() => undefined);
  await closeBrowser().catch(() => undefined);
  await removeSeededFiles().catch(() => undefined);
  await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
  process.exit(1);
});
