import { expect, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Vite dev 按模块粒度加载,资源数容易超过 Chromium 默认 250 条的
  // resource timing buffer 上限,导致后加载的模块(如 Word 预览懒加载
  // chunk)不进 buffer。放大 buffer 保证断言可见。
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(20000);
  });
});

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

test('cold start loads CM6 writing editor while keeping Word preview lazy', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cm6-markdown-editor-pane .cm-editor')).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  await page.waitForTimeout(900);

  const resources = await loadedResourcePaths(page);

  expectPresent(resources, '/src/components/editor/cm6/Cm6MarkdownEditorPane.tsx');
  expectMissing(resources, '/src/components/WordPaperPreviewPane.tsx');
});

test('source mode reuses the loaded CM6 editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await expect(page.locator('.wysiwyg-editor-pane')).toHaveCount(0);
});

test('Word preview pane loads only after the Word preview button is used', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
  await expect(page.locator('.word-rendered-paper')).toBeVisible();

  const resources = await loadedResourcePaths(page);
  expectPresent(resources, '/src/components/WordPaperPreviewPane.tsx');
});
