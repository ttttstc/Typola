import { expect, test } from '@playwright/test';

test('CM6 快捷键格式化进入 history 且可撤销', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('foo');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+B');

  await expect(editor).toContainText('**foo**');

  await page.keyboard.press('Control+Z');
  await expect(editor).toContainText('foo');
  await expect(editor).not.toContainText('**foo**');
});
