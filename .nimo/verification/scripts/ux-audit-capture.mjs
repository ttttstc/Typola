#!/usr/bin/env node

// 易用性走查采集脚本：以产品/交互专家视角，对真实 exe 做全状态截图走查。
// 复用 verify-exe-core-extended.mjs 的 CDP harness 启动/清理逻辑，但不做功能断言，
// 每个状态只截图 + aria 快照，供后续人工(Read 工具)逐张评审。
// 调用：`node .nimo/verification/scripts/ux-audit-capture.mjs`

import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const executablePath = path.resolve(process.env.TYPOLA_VERIFY_EXE ?? path.join(repositoryRoot, 'src-tauri', 'target', 'debug', 'typola.exe'));
const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${process.pid}`;
const evidenceDirectory = path.join(repositoryRoot, '.nimo', 'verification', 'evidence', `${runId}-ux-audit`);
const runtimeDirectory = path.join(repositoryRoot, '.nimo', 'verification', 'runtime', `ux-${runId}`);
const fixturePath = path.join(runtimeDirectory, 'ux-audit-fixture.md');

let ownedProcess = null;
let browser = null;
let cdpEndpoint = null;

const captured = [];
const captureErrors = [];

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

async function waitForCdp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.status === 200) return await response.json();
    } catch { /* retry */ }
    await delay(250);
  }
  throw new Error('等待 CDP 超时');
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

async function shot(page, stem, note = '') {
  try {
    await page.screenshot({ path: path.join(evidenceDirectory, `${stem}.png`), fullPage: false });
    const aria = await page.locator('body').ariaSnapshot().catch(() => '');
    await fs.writeFile(path.join(evidenceDirectory, `${stem}.aria.txt`), `${aria}\n`, 'utf8');
    captured.push({ stem, note });
    console.log(`[shot] ${stem} ${note}`);
  } catch (error) {
    captureErrors.push({ stem, note, error: error instanceof Error ? error.message : String(error) });
    console.log(`[shot-FAIL] ${stem}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 每步操作失败不阻断，记录后继续走查。 */
async function step(label, fn) {
  try {
    await fn();
  } catch (error) {
    captureErrors.push({ stem: label, note: 'step', error: error instanceof Error ? error.message : String(error) });
    console.log(`[step-FAIL] ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const RICH_DOC = [
  '# 走查示例文档',
  '',
  '这是一段**加粗**与*斜体*混排的正文，含 [Typola 链接](https://example.com) 与 `行内代码`。',
  '',
  '## 列表示例',
  '',
  '- 普通列表项一',
  '- 普通列表项二',
  '- [ ] 未完成任务',
  '- [x] 已完成任务',
  '',
  '## 表格与代码',
  '',
  '| 名称 | 类型 | 说明 |',
  '| --- | --- | --- |',
  '| 编辑器 | CM6 | 写作与源码共用 |',
  '| 导出 | docx | 内置生成器 |',
  '',
  '```js',
  'const hello = "world";',
  'console.log(hello);',
  '```',
  '',
  '> 这是一段引用，用来检查引用块样式。',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '---',
  '',
  '### 三级标题',
  '',
  '结尾段落。',
  '',
].join('\n');

async function main() {
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.mkdir(runtimeDirectory, { recursive: true });
  await fs.writeFile(fixturePath, RICH_DOC, 'utf8');

  const cdpPort = await allocatePort();
  cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
  const profileDirectory = path.join(runtimeDirectory, 'webview2');
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
  ownedProcess.stderr?.on('data', () => undefined);

  await waitForCdp(cdpEndpoint);
  browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 15_000 });
  const context = browser.contexts()[0];
  const page = await waitForPage(context);
  await page.locator('button[aria-label="源码模式"]').waitFor({ state: 'visible', timeout: 60_000 });
  await delay(600);

  // 01 启动初始态（带夹具文档）
  await shot(page, '01-startup', '启动初始态');

  // 02 写作模式富内容
  await step('ensure-writing', async () => {
    const btn = page.getByRole('button', { name: '渲染模式', exact: true });
    if (await btn.getAttribute('aria-pressed') !== 'true') await btn.click();
    await page.locator('.cm6-markdown-editor-pane').waitFor({ state: 'visible' });
  });
  await delay(800);
  await shot(page, '02-writing-rich', '写作模式富内容');

  // 03 源码模式
  await step('source-mode', async () => {
    await page.getByRole('button', { name: '源码模式', exact: true }).click();
    await delay(400);
  });
  await shot(page, '03-source-mode', '源码模式');

  // 04 阅读模式
  await step('reading-mode', async () => {
    await page.getByRole('button', { name: '阅读模式', exact: true }).click();
    await delay(500);
  });
  await shot(page, '04-reading-mode', '阅读模式');

  // 05 检视模式
  await step('review-mode', async () => {
    await page.getByRole('button', { name: '检视模式', exact: true }).click();
    await delay(600);
  });
  await shot(page, '05-review-mode', '检视模式');
  await step('back-writing', async () => {
    await page.getByRole('button', { name: '阅读模式', exact: true }).click().catch(() => undefined);
    await delay(300);
    const btn = page.getByRole('button', { name: '渲染模式', exact: true });
    if (await btn.count() && await btn.getAttribute('aria-pressed') !== 'true') await btn.click();
    await delay(400);
  });

  // 06 查找面板
  await step('find-panel', async () => {
    await page.keyboard.press('Control+f');
    await delay(400);
  });
  await shot(page, '06-find-panel', '查找面板');
  await step('close-find', async () => { await page.keyboard.press('Escape'); await delay(200); });

  // 07 替换面板
  await step('replace-panel', async () => {
    await page.keyboard.press('Control+h');
    await delay(400);
  });
  await shot(page, '07-replace-panel', '替换面板');
  await step('close-replace', async () => { await page.keyboard.press('Escape'); await delay(200); });

  // 08 快速打开
  await step('quick-open', async () => {
    await page.keyboard.press('Control+Shift+p');
    await delay(400);
  });
  await shot(page, '08-quick-open', '快速打开面板');
  await step('close-quick-open', async () => { await page.keyboard.press('Escape'); await delay(200); });

  // 09 跳转到行
  await step('goto-line', async () => {
    await page.keyboard.press('Control+g');
    await delay(400);
  });
  await shot(page, '09-goto-line', '跳转到行弹窗');
  await step('close-goto', async () => { await page.keyboard.press('Escape'); await delay(200); });

  // 10 浮动大纲
  await step('floating-toc', async () => {
    await page.getByRole('button', { name: '查看大纲', exact: true }).click();
    await delay(500);
  });
  await shot(page, '10-floating-toc', '浮动大纲展开');
  await step('close-toc', async () => { await page.keyboard.press('Escape'); await delay(200); });

  // 11 文件树
  await step('file-tree', async () => {
    const btn = page.getByRole('button', { name: '打开文件树', exact: true });
    if (await btn.count()) await btn.click();
    await delay(500);
  });
  await shot(page, '11-file-tree', '文件树');
  await step('close-file-tree', async () => {
    const btn = page.getByRole('button', { name: '关闭文件树', exact: true });
    if (await btn.count()) await btn.click();
    await delay(300);
  });

  // 12 Word 预览
  await step('word-preview', async () => {
    await page.getByRole('button', { name: 'Word 预览', exact: true }).click();
    await delay(900);
  });
  await shot(page, '12-word-preview', 'Word 纸张预览');
  await step('close-word-preview', async () => {
    await page.getByRole('button', { name: 'Word 预览', exact: true }).click().catch(() => undefined);
    await delay(300);
  });

  // 13 HTML 预览
  await step('html-preview', async () => {
    await page.getByRole('button', { name: 'HTML 预览', exact: true }).click();
    await delay(900);
  });
  await shot(page, '13-html-preview', 'HTML 预览');
  await step('close-html-preview', async () => {
    await page.getByRole('button', { name: 'HTML 预览', exact: true }).click().catch(() => undefined);
    await delay(300);
  });

  // 14-17 设置页各分区
  await step('open-settings', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await delay(500);
  });
  await shot(page, '14-settings-general', '设置-通用');
  await step('settings-editor', async () => {
    await page.getByRole('button', { name: '编辑器', exact: true }).first().click();
    await delay(400);
  });
  await shot(page, '15-settings-editor', '设置-编辑器');
  await step('settings-appearance', async () => {
    await page.getByRole('button', { name: '外观', exact: true }).first().click();
    await delay(400);
  });
  await shot(page, '16-settings-appearance', '设置-外观');
  await step('settings-ai', async () => {
    await page.getByRole('button', { name: 'AI 执行', exact: true }).first().click();
    await delay(400);
  });
  await shot(page, '17-settings-ai', '设置-AI 执行');
  await step('close-settings', async () => { await page.keyboard.press('Escape'); await delay(300); });

  // 18 AI 工作台
  await step('ai-workbench', async () => {
    await page.getByRole('button', { name: '打开 AI 工作台', exact: true }).click();
    await delay(700);
  });
  await shot(page, '18-ai-workbench', 'AI 工作台');

  // 19 AI 产物中心
  await step('artifact-center', async () => {
    await page.getByRole('button', { name: 'AI 产物', exact: true }).click();
    await delay(600);
  });
  await shot(page, '19-artifact-center', 'AI 产物中心');

  // 20 终端
  await step('terminal', async () => {
    await page.getByRole('button', { name: '终端', exact: true }).click();
    await delay(900);
  });
  await shot(page, '20-terminal', '终端面板');

  // 21 多标签（3 个，含未保存标记）
  await step('multi-tabs', async () => {
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await delay(300);
    await page.locator('.cm-content').click();
    await page.keyboard.type('第二个未命名文档的内容');
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await delay(300);
    await page.locator('.cm-content').click();
    await page.keyboard.type('第三个未命名文档的内容');
    await delay(400);
  });
  await shot(page, '21-multi-tabs-unsaved', '多标签含未保存');

  // 22 未保存关闭确认对话框
  await step('unsaved-dialog', async () => {
    const closeBtn = page.locator('[class*="tab"] [aria-label*="关闭"], [class*="tab-close"]').last();
    await closeBtn.click({ timeout: 5_000 });
    await delay(500);
  });
  await shot(page, '22-unsaved-close-dialog', '未保存关闭确认');
  await step('cancel-close', async () => {
    const cancel = page.getByRole('button', { name: '取消', exact: true });
    if (await cancel.count()) await cancel.click();
    await delay(300);
  });

  // 23 状态栏特写（底部 200px 区域裁剪）
  await step('statusbar-clip', async () => {
    const size = page.viewportSize();
    await page.screenshot({
      path: path.join(evidenceDirectory, '23-statusbar.png'),
      clip: { x: 0, y: (size?.height ?? 800) - 60, width: size?.width ?? 1280, height: 60 },
    });
    captured.push({ stem: '23-statusbar', note: '状态栏特写' });
    console.log('[shot] 23-statusbar');
  });

  // 24 空文档（新用户第一眼）
  await step('empty-doc', async () => {
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await delay(500);
  });
  await shot(page, '24-empty-new-doc', '新建空白文档（新用户第一眼）');

  await fs.writeFile(
    path.join(evidenceDirectory, 'capture.json'),
    JSON.stringify({ runId, captured, captureErrors }, null, 2),
    'utf8',
  );
  console.log(`\nDONE captured=${captured.length} errors=${captureErrors.length}\nevidence=${evidenceDirectory}`);
}

main()
  .catch((error) => {
    console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => undefined);
    if (ownedProcess?.pid && process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(ownedProcess.pid), '/T', '/F'], { windowsHide: true });
    }
    await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
  });
