import { expect, test, type Page } from '@playwright/test';

const TABLE = [
  '| A | B | C |',
  '| --- | --- | --- |',
  '| 1 | 2 | 3 |',
  '| 4 | 5 | 6 |',
].join('\n');

async function openTable(page: Page): Promise<void> {
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.insertText(TABLE);
  await page.getByRole('button', { name: '源码模式' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await expect(page.locator('.tbl-table')).toBeVisible();
}

test('CM6 table exposes upstream grid selection controls and Typola right-click actions', async ({ page }) => {
  await page.goto('/');
  await openTable(page);

  await expect(page.locator('.tbl-table')).toHaveAttribute('role', 'grid');
  await expect(page.locator('.tbl-cell-view')).toHaveCount(9);
  await expect(page.locator('.tbl-handle')).not.toHaveCount(0);

  const bodyCells = page.locator('.tbl-table-body .tbl-cell-view');
  await bodyCells.nth(0).dragTo(bodyCells.nth(5));
  await expect(page.locator('.tbl-cell[data-outline]')).not.toHaveCount(0);

  await page.locator('.tbl-cell-view').first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menu').getByText('在上方插入行')).toBeVisible();
  await expect(page.getByRole('menu').getByText('当前列左对齐')).toBeVisible();
  await expect(page.getByRole('menu').getByText('当前列居中')).toBeVisible();
  await expect(page.getByRole('menu').getByText('当前列右对齐')).toBeVisible();
});
