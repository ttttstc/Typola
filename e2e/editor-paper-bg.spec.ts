import { expect, test, type Page } from '@playwright/test';

const THEMES = ['plain-paper', 'night-current', 'ink-basin', 'abstract', 'brutalist'] as const;
const MODES = [false, true] as const;
const SCREENSHOT_CASES = new Set(['plain-paper-off', 'plain-paper-on', 'brutalist-on']);
test.setTimeout(60_000);

async function openAppearance(page: Page) {
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '外观' }).click();
}

for (const theme of THEMES) {
  for (const enabled of MODES) {
    test(`${theme} paper texture ${enabled ? 'on' : 'off'}`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(page.locator('.cm6-markdown-editor-pane')).toBeVisible();

      await openAppearance(page);
      await page.locator(`[data-theme-card="${theme}"]`).click();
      const toggle = page.getByRole('button', { name: '编辑器纸纹' });
      if (enabled && await toggle.isEnabled()) {
        await toggle.click();
      }
      await page.keyboard.press('Escape');

      const expectedShader = enabled && theme !== 'night-current' && theme !== 'abstract';
      await expect(page.locator('.editor-paper-background-texture')).toHaveCount(expectedShader ? 1 : 0);
      if (enabled && expectedShader) {
        await expect(page.locator('.editor-paper-background-texture canvas')).toBeVisible();
      }
      await page.evaluate(async () => {
        await document.fonts?.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const screenshotName = `${theme}-${enabled ? 'on' : 'off'}`;
      if (SCREENSHOT_CASES.has(screenshotName)) {
        await expect(page.locator('.cm6-markdown-editor-pane')).toHaveScreenshot(
          `${screenshotName}.png`,
          { animations: 'disabled', caret: 'hide' },
        );
      }
    });
  }
}
