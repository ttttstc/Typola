/**
 * Issue #117 PR6 — CM6 折叠标题 + 搜索命中自动展开。
 *
 * E2E 路径:打开 CM6 源码模式 → 输入带同名 H2 的文档 → 折叠第一个 → 触发 Ctrl+F
 * 查找折叠区域内的文本 → 验证 heading 已自动展开。
 *
 * 折叠 key 加 sectionIndex 维度的对应契约:
 * - 折叠第一个 `## Notes` 后,第二个 `## Notes` 的段落不折叠。
 * - 搜索 `segment` 命中第二段时,因为前面折叠影响,先 expand 再 reveal。
 */

import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('.cm-content').click();
}

async function typeDoc(page: Page, markdown: string): Promise<void> {
  await page.keyboard.insertText(markdown);
}

test('同名 H2 折叠第一个不影响第二个', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await typeDoc(page, '## Notes\n第一段文字\n\n## Notes\n第二段文字\n');
  await expect(page.locator('.cm-editor')).toBeVisible();

  // 第一个 toggle 折叠(第一个 ## Notes 行首)
  const firstToggle = page.locator('.cm-content .typola-heading-fold-toggle').first();
  await expect(firstToggle).toBeVisible();
  await firstToggle.click();

  const folded = await page.locator('.cm-content .typola-cm-line-folded').count();
  // 第一段"第一段文字"被折叠一行。第二个 Notes 及其下文字不受影响。
  expect(folded).toBe(1);

  // 第二个 Notes 那一段下不应有折叠行
  const secondHeading = page.locator('.cm-content').getByText('## Notes').nth(1);
  await expect(secondHeading).toBeVisible();
});

test('搜索命中折叠区时自动展开并定位', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await typeDoc(page, '# Top\n\n## Section\n\n被折叠的隐藏文本\n\n## Section\n\n可见末段\n');
  await expect(page.locator('.cm-editor')).toBeVisible();

  // 折叠第一个 ## Section(被折叠的隐藏文本那一段)
  const firstToggle = page.locator('.cm-content .typola-heading-fold-toggle').first();
  await firstToggle.click();
  await expect(page.locator('.cm-content .typola-cm-line-folded')).toHaveCount(1);

  // 打开查找面板
  await page.keyboard.press('Control+f');
  const findInput = page.locator('.find-panel .find-input');
  await expect(findInput).toBeVisible();
  await findInput.fill('隐藏文本');
  // Enter 跳到第一个命中
  await findInput.press('Enter');

  // 期望:第一个 ## Section 的折叠被自动撤销 — folded 行变成 0
  await expect(page.locator('.cm-content .typola-cm-line-folded')).toHaveCount(0);
});
