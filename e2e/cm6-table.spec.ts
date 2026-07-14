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
  const menu = page.getByRole('menu');
  await expect(menu).toHaveCount(1);
  await expect(menu).toBeVisible();
  await expect(menu.getByText('在上方插入行')).toBeVisible();
  await expect(menu.getByText('当前列左对齐')).toBeVisible();
  await expect(menu.getByText('当前列居中')).toBeVisible();
  await expect(menu.getByText('当前列右对齐')).toBeVisible();
  await expect(menu.getByText('插入表格')).toHaveCount(0);
});

test('toolbar exposes table insertion outside table context', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.cm-editor')).toBeVisible();
  await expect(page.getByRole('button', { name: '插入表格' })).toBeVisible();
  await expect(page.getByRole('button', { name: '插入表格' })).toBeEnabled();
  await page.locator('.cm-content').click();
  await page.getByRole('button', { name: '插入表格' }).click();
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-content')).toContainText('|   |   |   |');
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.tbl-table')).toBeVisible();
});

test('right-clicking outside a table exposes table insertion', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('.cm-content').click({ button: 'right', position: { x: 24, y: 24 } });

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByText('插入表格')).toBeVisible();
  await menu.getByText('插入表格').click();

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-content')).toContainText('|   |   |   |');
});

test('supports Typora row insert and delete shortcuts', async ({ page }) => {
  await page.goto('/');
  await openTable(page);

  const bodyRows = page.locator('.tbl-table-body .tbl-table-row');
  await expect(bodyRows).toHaveCount(2);
  await page.locator('.tbl-table-body .tbl-cell-view').first().click();
  await page.keyboard.press('Control+Enter');
  await expect(bodyRows).toHaveCount(3);
  await page.keyboard.press('Control+Shift+Backspace');
  await expect(bodyRows).toHaveCount(2);
  await page.getByRole('button', { name: '源码模式' }).click();
  const source = page.locator('.cm-content');
  await expect(source).toContainText('| cell | cell | cell |');
  await expect(source).not.toContainText('| 1 | 2 | 3 |');
});

test('right-clicking a selected cell applies the column action to that column', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto('/');
  await openTable(page);

  const secondColumnCell = page.locator('.tbl-table-body .tbl-cell').nth(1);
  await page.locator('.tbl-table-body .tbl-cell').first().click();
  await secondColumnCell.click({ button: 'right' });
  await page.getByRole('menu').getByText('当前列右对齐').click({ force: true });

  await page.getByRole('button', { name: '源码模式' }).click();
  const source = page.locator('.cm-content');
  await expect(source).toContainText('| - | -: | - |');
  await expect(source).not.toContainText('| -: | - | - |');
});
