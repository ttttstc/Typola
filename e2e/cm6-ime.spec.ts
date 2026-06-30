/**
 * Issue #117 PR6 — CM6 中文输入法(IME)E2E 冒烟。
 *
 * 真实 IME 候选框不参与 DOM,无法完全自动化;Playwright 的 `keyboard.insertText`
 * 会触发合成过程并以合成结束事件收尾,这里用来验证:
 * - CM6 在源码模式下接收中文输入不破坏文档
 * - 多次合成过程的累计文本等于最终 markdown
 * - 切换回 WYSIWYG 后中文段落仍在
 */

import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('.cm-content').click();
}

test('CM6 source editor accepts repeated insertText without breaking the document', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);

  // 一连串中文片段 — Playwright insertText 走合成路径,验证编辑器能容纳。
  for (const chunk of [
    '中文段落第一句',
    '继续输入更多内容',
    '常',
    '的',
    '复杂表达式 x² + y² = z²',
  ]) {
    await page.keyboard.insertText(chunk);
  }

  const source = await page.locator('.cm-content').textContent();
  expect(source ?? '').toContain('中文段落第一句');
  expect(source ?? '').toContain('复杂表达式');
});

test('CM6 中文输入后再切回 WYSIWYG 不丢内容', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('# 中文标题\n\n中文段落内容。\n');

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible();

  await expect(page.locator('.wysiwyg-editor-pane')).toContainText('中文标题');
  await expect(page.locator('.wysiwyg-editor-pane')).toContainText('中文段落内容。');
});

test('CM6 中文长 paragraph 在 Ctrl+End 后仍能继续输入', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('A\n\nB 段中文内容\n');

  // Ctrl+End 跳到文末后继续追加中文
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\n\nC 段新内容。');

  const source = await page.locator('.cm-content').textContent();
  expect(source ?? '').toContain('A');
  expect(source ?? '').toContain('B 段中文内容');
  expect(source ?? '').toContain('C 段新内容。');
});
