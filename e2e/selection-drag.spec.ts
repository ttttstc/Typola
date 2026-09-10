// 回归:在已有选区内按下并拖动(调整选区)不应触发拖放移动文字(Typora 行为)。
// 复现路径:双击/拖选留下选区 → 在选区内按下再拖 → CM6 默认把选中文字
// "移动"到松手位置(文字跑进下一行、段落结构破坏),用户表现为"选不中本行"。
import { expect, test, type Page } from '@playwright/test';

const DOC = [
  '# 标题',
  '',
  '第一行甲乙丙丁',
  '',
  '第二行戊己庚辛',
  '',
  '尾部',
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

/** 取目标文本中某字符的精确中心坐标(TreeWalker + Range,不受行盒影响)。 */
async function charCenter(page: Page, needle: string, charIdx: number): Promise<{ x: number; y: number }> {
  return page.evaluate(({ needle, charIdx }) => {
    const walker = document.createTreeWalker(document.querySelector('.cm-content')!, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const idx = node.textContent?.indexOf(needle) ?? -1;
      if (idx < 0) continue;
      const range = document.createRange();
      range.setStart(node, idx + charIdx);
      range.setEnd(node, idx + charIdx + 1);
      const r = range.getClientRects()[0];
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    throw new Error(`text not found: ${needle}`);
  }, { needle, charIdx });
}

/** 源码模式下的正文快照(含行号/折叠标记,仅做内容级断言)。 */
async function sourceSnapshot(page: Page): Promise<string> {
  await page.getByRole('button', { name: '源码模式' }).click();
  const text = await page.locator('.cm-content').innerText();
  await page.getByRole('button', { name: '源码模式' }).click();
  return text.replace(/\s+/gu, '');
}

test('在选区内按下拖动:文字不被移动,选区可正常重选', async ({ page }) => {
  await setupDoc(page);

  // 双击"乙"字留下选区
  const yi = await charCenter(page, '第一行甲乙丙丁', 2);
  await page.mouse.dblclick(yi.x, yi.y);

  // 在选区内按下,拖到下一行"戊"字处松手(用户想扩大/调整选区)
  const wu = await charCenter(page, '第二行戊己庚辛', 2);
  await page.mouse.move(yi.x, yi.y);
  await page.mouse.down();
  await page.mouse.move(wu.x, wu.y, { steps: 10 });
  await page.mouse.up();

  // 文档必须保持原样:两行文字原位保留,没有出现"第一行被移动到第二行里"的错乱拼接
  const snapshot = await sourceSnapshot(page);
  expect(snapshot).toContain('第一行甲乙丙丁');
  expect(snapshot).toContain('第二行戊己庚辛');
  expect(snapshot).not.toContain('第二第一行甲乙丙丁行戊己庚辛');

  // 重选生效:再从"戊"字按下拖回本行"甲"字,文档仍不变
  const jia = await charCenter(page, '第一行甲乙丙丁', 0);
  await page.mouse.move(wu.x, wu.y);
  await page.mouse.down();
  await page.mouse.move(jia.x, jia.y, { steps: 10 });
  await page.mouse.up();
  const snapshot2 = await sourceSnapshot(page);
  expect(snapshot2).toContain('第一行甲乙丙丁');
  expect(snapshot2).toContain('第二行戊己庚辛');
});

test('普通拖选(选区外起点)不受影响', async ({ page }) => {
  await setupDoc(page);

  // 从"甲"字按下拖到"丁"字(经典行内拖选)
  const jia = await charCenter(page, '第一行甲乙丙丁', 0);
  const ding = await charCenter(page, '第一行甲乙丙丁', 6);
  await page.mouse.move(jia.x, jia.y);
  await page.mouse.down();
  await page.mouse.move(ding.x, ding.y, { steps: 10 });
  await page.mouse.up();

  const snapshot = await sourceSnapshot(page);
  expect(snapshot).toContain('第一行甲乙丙丁');
  expect(snapshot).toContain('第二行戊己庚辛');
});
