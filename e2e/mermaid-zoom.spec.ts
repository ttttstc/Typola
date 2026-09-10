// 回归:mermaid 图按自然尺寸渲染 + hover 缩放控件组（−/＋/适宽/1:1）。
// 背景:原先 useMaxWidth 把图压进容器宽,窄窗口下宽图变成缩略图;
// 且放大只能靠无提示的 Ctrl+滚轮,放大溢出还被容器裁切。
import { expect, test, type Page } from '@playwright/test';

const DOC = [
  '# 标题',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[开始节点] --> B[处理很长很长的节点文字] --> C{判断分支一}',
  '  C -->|分支标签甲| D[结果节点甲]',
  '  C -->|分支标签乙| E[结果节点乙]',
  '  D --> F[汇总节点结束]',
  '  E --> F',
  '```',
  '',
  '尾部段落',
].join('\n');

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

function mermaidSvg(page: Page) {
  return page.locator('.typola-cm6-mermaid svg').first();
}

test('mermaid 按自然尺寸渲染,缩放控件可放大/复位,放大后容器横向滚动', async ({ page }) => {
  await setupDoc(page);
  const svg = mermaidSvg(page);
  await expect(svg).toBeVisible();

  // 块 widget 的外边距不能参与 CM6 高度测量，否则图后会出现幻影空白。
  const tailGap = await page.evaluate(() => {
    const widget = document.querySelector<HTMLElement>('.typola-cm6-mermaid');
    const tail = [...document.querySelectorAll<HTMLElement>('.cm-line')]
      .find((line) => line.textContent?.includes('尾部段落'));
    if (!widget || !tail) return Number.POSITIVE_INFINITY;
    return tail.getBoundingClientRect().top - widget.getBoundingClientRect().bottom;
  });
  expect(tailGap).toBeLessThan(24);

  // 1) 归一为自然尺寸:width 是显式像素值,不再是 100%。
  const widthAttr = await svg.getAttribute('width');
  expect(Number(widthAttr)).toBeGreaterThan(0);
  expect(widthAttr).not.toBe('100%');

  // WebView2 可能给同一图写入异常膨胀的 viewBox；归一后画布应接近实际内容。
  const svgGeometry = await svg.evaluate((element) => {
    const box = (element as SVGSVGElement).getBBox();
    const viewBox = element.getAttribute('viewBox')!.split(/\s+/u).map(Number);
    return { contentHeight: box.height, viewBoxHeight: viewBox[3] };
  });
  expect(svgGeometry.viewBoxHeight).toBeLessThan(svgGeometry.contentHeight * 1.25 + 32);

  // 2) hover 图表时缩放控件浮现,四个按钮齐全。
  const widget = page.locator('.typola-cm6-mermaid').first();
  await widget.hover();
  const controls = page.locator('.typola-cm6-mermaid-zoom');
  await expect(controls).toBeVisible();
  for (const label of ['缩小', '放大', '缩放到容器宽度', '恢复原始尺寸']) {
    await expect(controls.getByRole('button', { name: label })).toBeVisible();
  }

  // 3) 点击「放大」:SVG inline width 变为自然宽 × 1.15(取整)。
  const natural = Number(widthAttr);
  await controls.getByRole('button', { name: '放大' }).click();
  await expect(svg).toHaveCSS('width', `${Math.round(natural * 1.15)}px`);

  // 4) 放大溢出容器时,容器出现横向滚动。
  await widget.evaluate((el) => { el.style.width = '360px'; });
  await controls.getByRole('button', { name: '放大' }).click();
  await controls.getByRole('button', { name: '放大' }).click();
  expect(await widget.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  // 5) 点击「1:1」:回到自然尺寸(inline width 覆盖被清除)。
  await controls.getByRole('button', { name: '恢复原始尺寸' }).click();
  await expect(svg).toHaveCSS('width', `${natural}px`);
});
