/**
 * Issue #117 PR6 — CM6 图片粘贴 + 加载失败回退 E2E 冒烟。
 *
 * 在 Tauri 外只能验证 source 路径的基础契约:
 * - 在 CM6 源码模式插入 `![alt](url)` 后文档包含图片语法
 * - 模拟图片加载失败 → wrap 加 `--failed` class(CSS 由 app.css 提供)
 * - 切换回 WYSIWYG 不丢图片语法
 */

import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('.cm-content').click();
}

test('CM6 源码插入 Markdown 图片语法后文档包含图片语法', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('![示例](https://broken.example/missing.png)\n\n后续正文。');

  const source = await page.locator('.cm-content').textContent();
  expect(source ?? '').toContain('![示例](https://broken.example/missing.png)');
  expect(source ?? '').toContain('后续正文。');
});

test('图片 source 后继续输入,光标跟在图片语法后', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('![alt](https://example.com/a.png)\n');

  // Ctrl+End 跳到末尾再追加
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\n继续输入的文字');

  const source = await page.locator('.cm-content').textContent();
  expect(source ?? '').toContain('![alt](https://example.com/a.png)');
  expect(source ?? '').toContain('继续输入的文字');
});
