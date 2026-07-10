import { expect, test, type Page } from '@playwright/test';

async function openSourceMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm6-markdown-editor-pane .cm-editor')).toBeVisible();
}

test('默认布局只挂载 CM6 写作内核', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.cm6-markdown-editor-pane .cm-editor')).toBeVisible();
  await expect(page.locator('.wysiwyg-editor-pane')).toHaveCount(0);
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
});

test('工具栏切换源码模式但不切换编辑器内核', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.cm6-markdown-editor-pane .cm-editor');

  await expect(editor).toBeVisible();
  await openSourceMode(page);
  await expect(editor).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(editor).toBeVisible();
});

test('源码编辑切回写作模式后保留 Markdown', async ({ page }) => {
  await page.goto('/');
  await openSourceMode(page);
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('# 标题\n\n正文内容');

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm6-markdown-editor-pane')).toContainText('标题');
  await expect(page.locator('.cm6-markdown-editor-pane')).toContainText('正文内容');
});

test('Word 预览在右栏打开且编辑器保持可见', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.cm6-markdown-editor-pane');

  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
  await expect(editor).toBeVisible();

  await page.getByLabel('视图与导出').getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
});
