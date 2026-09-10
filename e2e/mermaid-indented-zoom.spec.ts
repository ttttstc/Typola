import { expect, test } from '@playwright/test';

const DOC = [
  '# 缩进场景验证',
  '',
  '> 引用内图表：',
  '> ```mermaid',
  '> graph TD',
  '>   A[开始] --> B{判断}',
  '>   B -->|是| C[处理]',
  '>   B -->|否| D[结束]',
  '>   C --> D',
  '> ```',
  '',
  '中间正文',
  '',
  '- 列表项',
  '  ```mermaid',
  '  graph LR',
  '    A[需求] --> B[上线]',
  '  ```',
  '',
  '顶层图表：',
  '',
  '```mermaid',
  'graph TD',
  '  X[顶层开始] --> Y[顶层结束]',
  '```',
  '',
  '结尾正文',
].join('\n');

test('indented mermaid renders real diagrams and supports ctrl-wheel zoom', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.insertText(DOC);
  await page.getByRole('button', { name: '源码模式' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(2500);

  const before = await page.evaluate(() => Array.from(document.querySelectorAll('.typola-cm6-mermaid')).map((w) => {
    const svg = w.querySelector('svg');
    return {
      h: Math.round(w.getBoundingClientRect().height),
      svgW: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
      viewBox: svg?.getAttribute('viewBox'),
    };
  }));
  console.log('widgets:', JSON.stringify(before, null, 2));
  // 三张图都应渲染出真实尺寸（> 60px；修复前缩进块是 46px 空图）
  expect(before.length).toBe(3);
  for (const w of before) expect(w.h).toBeGreaterThan(60);

  // Ctrl+滚轮缩放：对顶层图放大两档
  const topWidget = page.locator('.typola-cm6-mermaid').nth(2);
  await topWidget.hover();
  const widthBefore = await topWidget.locator('svg').evaluate((el) => el.getBoundingClientRect().width);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  const widthAfter = await topWidget.locator('svg').evaluate((el) => el.getBoundingClientRect().width);
  console.log('zoom:', { widthBefore: Math.round(widthBefore), widthAfter: Math.round(widthAfter) });
  expect(widthAfter).toBeGreaterThan(widthBefore * 1.2);

  // Ctrl+滚轮反向缩小回接近原尺寸
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 240);
  await page.mouse.wheel(0, 240);
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  const widthReset = await topWidget.locator('svg').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(widthReset - widthBefore) / widthBefore).toBeLessThan(0.25);

  await page.screenshot({ path: 'e2e/__mermaid-fixed.png', fullPage: true });
});
