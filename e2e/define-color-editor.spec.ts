import { expect, test } from '@playwright/test';

test.describe('Define color editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('opens, applies gradient and pattern, persists, and returns focus on Escape', async ({ page }) => {
    // 2.0.7 起:自定义模式但未选颜色时回退素笺主题(static-theme)
    await expect(page.locator('html')).toHaveAttribute('data-color-system', 'static-theme');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('typola-settings') || '{}').defineColorSettings ?? { l: 1, c: 0, h: 0 })).toMatchObject({ l: 1, c: 0, h: 0 });
    const trigger = page.getByRole('button', { name: '编辑主题颜色' });
    await trigger.click();
    const editor = page.getByTestId('define-color-editor');
    await expect(editor).toBeVisible();
    // 选择预设色后 define-color 生效
    await page.getByTestId('define-preset-8').click();
    await expect(page.locator('html')).toHaveAttribute('data-color-system', 'define-color');

    // preset-8 提交 saturation:72(浓郁),循环从浓郁开始:浓郁→柔和→平衡→浓郁
    const saturation = page.getByTestId('define-saturation-cycle');
    await expect(saturation).toHaveAttribute('aria-label', '切换饱和度，当前浓郁');
    await saturation.click();
    await expect(saturation).toHaveAttribute('aria-label', '切换饱和度，当前柔和');
    await saturation.click();
    await expect(saturation).toHaveAttribute('aria-label', '切换饱和度，当前平衡');
    await saturation.click();
    await expect(saturation).toHaveAttribute('aria-label', '切换饱和度，当前浓郁');

    await page.getByTestId('define-gradient-toggle').click();
    await expect(editor.locator('.dc-wheel-handle.auxiliary')).toHaveCount(2);
    expect(await page.locator('html').evaluate((root) => getComputedStyle(root).getPropertyValue('--dc-gradient-stop-1'))).toContain('oklch(');

    await page.getByTestId('define-gradient-toggle').click();
    await expect(editor.locator('.dc-wheel-handle.auxiliary')).toHaveCount(0);
    expect(await page.locator('html').evaluate((root) => getComputedStyle(root).getPropertyValue('--dc-gradient-stop-1'))).toBe('');

    await page.getByTestId('define-pattern-cycle').click();
    expect(await page.locator('html').evaluate((root) => getComputedStyle(root).getPropertyValue('--dc-pattern-image'))).toContain('stripe');

    const beforeRandom = await page.evaluate(() => JSON.parse(localStorage.getItem('typola-settings') || '{}').defineColorSettings);
    await page.getByTestId('define-randomize').click();
    const afterRandom = await page.evaluate(() => JSON.parse(localStorage.getItem('typola-settings') || '{}').defineColorSettings);
    expect(Object.keys(afterRandom).filter((key) => afterRandom[key] !== beforeRandom[key]).length).toBeGreaterThanOrEqual(3);
    expect(await page.locator('.app-layout').evaluate((layout) => getComputedStyle(layout, '::before').opacity)).toBe(String(afterRandom.patternOpacity / 100));
    expect(await page.locator('html').evaluate((root) => {
      const styles = getComputedStyle(root);
      return styles.getPropertyValue('--theme-control-bg') === styles.getPropertyValue('--dc-background-light-loud');
    })).toBe(true);

    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-color-system', 'define-color');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('typola-settings') || '{}').defineColorSettings)).toEqual(afterRandom);
  });

  test('appearance settings expose custom and theme modes', async ({ page }) => {
    // 未选颜色:自定义模式选中但回退素笺主题
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByRole('button', { name: '外观' }).click();
    await expect(page.getByRole('radio', { name: '自定义模式' })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-color-system', 'static-theme');
    await page.keyboard.press('Escape');

    // 选色后自定义模式真正生效,radio 往返切换属性跟随
    await page.getByRole('button', { name: '编辑主题颜色' }).click();
    await page.getByTestId('define-preset-8').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-color-system', 'define-color');

    await page.getByRole('button', { name: '设置' }).click();
    await page.getByRole('button', { name: '外观' }).click();
    await page.getByRole('radio', { name: '主题模式' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-color-system', 'static-theme');
    await page.getByRole('radio', { name: '自定义模式' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-color-system', 'define-color');
  });

  test('selecting a static theme exits Define mode without deleting Define settings', async ({ page }) => {
    await page.getByRole('button', { name: '编辑主题颜色' }).click();
    await page.getByTestId('define-preset-8').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('typola-settings') || '{}').defineColorSettings);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '设置' }).click();
    await page.getByRole('button', { name: '外观' }).click();
    const theme = page.getByRole('radio').filter({ hasText: '素笺' });
    await theme.click();
    await expect(page.locator('html')).toHaveAttribute('data-color-system', 'static-theme');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('typola-settings') || '{}').defineColorSettings)).toEqual(saved);
  });
});
