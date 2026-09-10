/**
 * PR #269 检视意见回归测试:当前行去整行底色(Typora 式)后,
 * 光标所在行的选区必须仍然可见。
 *
 * 背景:CM6 选区层在内容之下(.cm-selectionLayer z-index:-2),
 * 不透明的 activeLine 底色会把光标所在行的选区整段盖住,造成「选不到本行」。
 * 修复契约:
 * - 普通行:光标行不再上整行底色(activeLine 透明),只有选中文字本身着色。
 * - fenced code 行(.cm-atomic-fenced-code):豁免透明规则保留灰底,
 *   但行内选区同样必须可见。
 */

import { expect, test } from '@playwright/test';

type SelectionRect = { width: number; height: number; top: number; bottom: number } | null;

async function selectionRect(page: import('@playwright/test').Page): Promise<SelectionRect> {
  return page.evaluate(() => {
    const selection = document.querySelector<HTMLElement>('.cm-editor .cm-selectionBackground');
    if (!selection) return null;
    const rect = selection.getBoundingClientRect();
    return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom };
  });
}

test('selection on the cursor line stays visible (normal line)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '源码模式' }).click();
  const content = page.locator('.cm-content');
  await expect(content).toBeVisible();
  await content.click();
  await page.keyboard.insertText('hello selection line\n');

  // 光标停在本行,选中本行若干字符 → 命中「当前行上的选区」场景。
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Shift+ArrowLeft');
  }

  const rect = await selectionRect(page);
  expect(rect, 'selection layer should render a rect on the cursor line').not.toBeNull();
  expect(rect!.width).toBeGreaterThan(0);
  expect(rect!.height).toBeGreaterThan(0);

  // 关键契约:当前行不整行上底色,否则会盖住 z-index:-2 的选区层。
  // (Chromium 对 transparent 背景返回 'rgba(0, 0, 0, 0)'。)
  const activeLineBackground = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>('.cm-activeLine');
    return line ? getComputedStyle(line).backgroundColor : '';
  });
  expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(activeLineBackground);
});

test('selection stays visible inside fenced code on the cursor line', async ({ page }) => {
  await page.goto('/');
  // 源码模式输入 fenced code,再切回所见即所得得到 atomic code 行。
  await page.getByRole('button', { name: '源码模式' }).click();
  const content = page.locator('.cm-content');
  await expect(content).toBeVisible();
  await content.click();
  await page.keyboard.insertText('```js\nconst value = 42;\n```\n');
  await page.getByRole('button', { name: '源码模式' }).click();

  const codeLine = page.locator('.cm-atomic-fenced-code').getByText('const value = 42;');
  await expect(codeLine).toBeVisible();
  await codeLine.click();
  await page.keyboard.press('End');
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Shift+ArrowLeft');
  }

  const rect = await selectionRect(page);
  expect(rect, 'selection layer should render a rect inside the fenced code line').not.toBeNull();
  expect(rect!.width).toBeGreaterThan(0);
  expect(rect!.height).toBeGreaterThan(0);

  // 选区应落在代码行范围内(而不是被代码行灰底顶掉/错位)。
  const codeLineRect = await codeLine.boundingBox();
  expect(codeLineRect).not.toBeNull();
  expect(rect!.top).toBeGreaterThanOrEqual(codeLineRect!.y - 1);
  expect(rect!.bottom).toBeLessThanOrEqual(codeLineRect!.y + codeLineRect!.height + 1);
});
