import { expect, test, type Page } from '@playwright/test';

const DOC = [
  '# 文档标题',
  '',
  '正文段落一',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
  '参考[链接](https://example.com)结尾',
].join('\n');

// 源码模式输入测试文档后切回写作模式(与 cm6-table.spec.ts 相同的构造方式)。
async function setupDoc(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '源码模式' }).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(DOC);
  await page.getByRole('button', { name: '源码模式' }).click();
}

test('右键正文段落后"段落>H2"作用于右键所在行而非旧光标行', async ({ page }) => {
  await setupDoc(page);

  // 光标仍在文档末尾(输入后未移动),右键"正文段落一"行。
  await page.getByText('正文段落一').click({ button: 'right' });
  const menu = page.locator('.editor-ctx-menu');
  await expect(menu).toBeVisible();

  await menu.getByRole('menuitem', { name: '段落' }).hover();
  await menu.locator('.editor-ctx-heading-row button[title="二级标题 (Ctrl+2)"]').click();

  // 右键所在行变 H2;旧光标所在的链接行不受影响。
  await page.getByRole('button', { name: '源码模式' }).click();
  const source = page.locator('.cm-content');
  await expect(source).toContainText('## 正文段落一');
  await expect(source).toContainText('参考[链接](https://example.com)结尾');
});

test('右键代码块内任意行可"编辑语言"并生效', async ({ page }) => {
  await setupDoc(page);

  await page.getByText('const x = 1;').click({ button: 'right' });
  const menu = page.locator('.editor-ctx-menu');
  await expect(menu).toBeVisible();

  await menu.getByRole('menuitem', { name: '段落' }).hover();
  await menu.getByText('编辑语言').click();

  const popover = page.locator('.cm6-edit-popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('input')).toHaveValue('js');
  await popover.locator('input').fill('ts');
  await popover.getByRole('button', { name: '保存' }).click();

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-content')).toContainText('```ts');
});
