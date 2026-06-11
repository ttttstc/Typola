import { expect, type Page, test } from '@playwright/test';

async function loadedResourcePaths(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance.getEntriesByType('resource')
      .map((entry) => {
        const url = new URL(entry.name);
        return `${url.pathname}${url.search}`;
      })
      .sort(),
  );
}

function expectMissing(resources: string[], fragment: string): void {
  expect(resources.filter((resource) => resource.includes(fragment))).toEqual([]);
}

function expectPresent(resources: string[], fragment: string): void {
  expect(resources.some((resource) => resource.includes(fragment))).toBe(true);
}

test('cold start shows WYSIWYG editing while keeping source editor and Word preview lazy', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await page.waitForTimeout(900);

  const resources = await loadedResourcePaths(page);

  expectMissing(resources, '/src/components/EditorPane.tsx');
  expectMissing(resources, '/src/components/WordPaperPreviewPane.tsx');
});

test('source editor loads only after the source mode button is used', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();

  const resources = await loadedResourcePaths(page);
  expectPresent(resources, '/src/components/EditorPane.tsx');
});

test('Word preview pane loads only after the Word preview button is used', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
  await expect(page.locator('.word-rendered-paper')).toBeVisible();

  const resources = await loadedResourcePaths(page);
  expectPresent(resources, '/src/components/WordPaperPreviewPane.tsx');
});
