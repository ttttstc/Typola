#!/usr/bin/env node
// 快速校验:浮动大纲面板计算背景是否不透明。
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const executablePath = path.join(repositoryRoot, 'src-tauri', 'target', 'debug', 'typola.exe');
const runtimeDirectory = path.join(repositoryRoot, '.nimo', 'verification', 'runtime', `tocbg-${Date.now()}`);
const fixturePath = path.join(runtimeDirectory, 'toc-fixture.md');

let ownedProcess = null;
let browser = null;

async function main() {
  await fs.mkdir(runtimeDirectory, { recursive: true });
  await fs.writeFile(fixturePath, '# 标题一\n\n正文段落一。\n\n## 标题二\n\n正文段落二。\n', 'utf8');
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address()?.port;
  await new Promise((resolve) => server.close(resolve));
  const endpoint = `http://127.0.0.1:${port}`;

  ownedProcess = spawn(executablePath, [fixturePath], {
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: path.join(runtimeDirectory, 'webview2'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`${endpoint}/json/version`);
      if (res.status === 200) break;
    } catch { /* retry */ }
    if (Date.now() > deadline) throw new Error('CDP timeout');
    await delay(250);
  }
  browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
  const context = browser.contexts()[0];
  let page;
  for (let i = 0; i < 120 && !page; i += 1) {
    page = context.pages().find((p) => !p.url().startsWith('devtools:'));
    if (!page) await delay(250);
  }
  await page.locator('button[aria-label="源码模式"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: '查看大纲', exact: true }).click();
  await delay(600);
  const result = await page.evaluate(() => {
    const panel = document.querySelector('.floating-toc-panel');
    if (!panel) return { found: false };
    const cs = getComputedStyle(panel);
    return {
      found: true,
      background: cs.background,
      backgroundColor: cs.backgroundColor,
      backdropFilter: cs.backdropFilter,
      ariaHidden: panel.getAttribute('aria-hidden'),
      expandedClass: document.querySelector('.floating-toc')?.className,
    };
  });
  console.log(JSON.stringify(result, null, 2));

  // Esc 关闭验证
  await page.keyboard.press('Escape');
  await delay(400);
  const afterEsc = await page.evaluate(() => document.querySelector('.floating-toc')?.className ?? 'GONE');
  console.log('after Esc className:', afterEsc);
}

main().catch((e) => console.error('fatal:', e)).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (ownedProcess?.pid && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(ownedProcess.pid), '/T', '/F'], { windowsHide: true });
  }
  await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
});
