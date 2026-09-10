import { expect, type Page, test } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('.cm-content').click();
}

function liveEditor(page: Page) {
  return page.locator('.cm6-markdown-editor-pane');
}

function liveEditorSurface(page: Page) {
  return page.locator('.cm-scroller');
}

function liveEditorContent(page: Page) {
  return page.locator('.cm-content');
}

async function typeMarkdown(page: Page, markdown: string): Promise<void> {
  await openEditor(page);
  await page.keyboard.insertText(markdown);
  await page.getByLabel('视图与外观').getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
}

async function waitForElementAnimations(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
}

test('default layout shows the CM6 writing editor only', async ({ page }) => {
  await page.goto('/');

  await expect(liveEditor(page)).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  await expect(page.locator('.cm-editor')).toBeVisible();
});

test('toolbar hides the app name and keeps draggable space around controls', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.wordmark')).toHaveCount(0);
  await expect(page.locator('.app-toolbar')).not.toContainText('Typola');
  await expect(page.locator('.toolbar-title .file-name')).toHaveCount(0);
  const toolbarState = await page.evaluate(() => {
    const toolbar = document.querySelector('.app-toolbar')?.getBoundingClientRect();
    const title = document.querySelector('.toolbar-title')?.getBoundingClientRect();

    return {
      spacer: document.querySelector('.toolbar-spacer')?.hasAttribute('data-tauri-drag-region') ?? false,
      titleDrag: document.querySelector('.toolbar-title')?.hasAttribute('data-tauri-drag-region') ?? false,
      overlayCount: document.querySelectorAll('.toolbar-drag-region').length,
      fallback: document.querySelector('.app-toolbar')?.getAttribute('data-window-drag-fallback') ?? '',
      groups: Array.from(document.querySelectorAll('.toolbar-group')).map((group) => (
        group.getAttribute('aria-label')
      )),
      centerOffset: toolbar && title
        ? Math.abs((title.left + title.width / 2) - (toolbar.left + toolbar.width / 2))
        : Number.POSITIVE_INFINITY,
    };
  });
  expect(toolbarState).toEqual(expect.objectContaining({
    spacer: true,
    titleDrag: true,
    overlayCount: 0,
    fallback: 'manual',
    groups: ['导航', '文件操作', '插入', 'Markdown 格式', '视图与外观', '导航设置', '文档模式'],
  }));
  expect(toolbarState.centerOffset).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: '大纲', exact: true })).toHaveCount(0);
});

test('CM6 writing editor keeps its paper surface transparent over the page background', async ({ page }) => {
  await page.goto('/');
  await expect(liveEditor(page)).toBeVisible();

  const colors = {
    editor: await liveEditorSurface(page).evaluate((el) => getComputedStyle(el).backgroundColor),
    paper: await page.locator('.editor-paper-background').evaluate((el) => getComputedStyle(el).backgroundColor),
    inner: await liveEditorContent(page).evaluate((el) => getComputedStyle(el).backgroundColor),
    body: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  };

  expect(colors.editor).toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
  expect(colors.paper).not.toBe(colors.body);
  expect(colors.inner).not.toBe('rgb(255, 255, 255)');
});

test('ordinary Markdown remains editable in writing mode', async ({ page }) => {
  await page.goto('/');
  await expect(liveEditor(page)).toBeVisible();
  const editor = liveEditorContent(page);
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.insertText('普通 Markdown 可编辑');

  await expect(editor).toContainText('普通 Markdown 可编辑');
});

test('writing mode keeps Markdown live-preview widgets enabled', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('- [ ] 即时渲染任务');
  await page.getByRole('button', { name: '源码模式' }).click();

  await expect(page.locator('.cm-atomic-task-checkbox')).toBeVisible();
});

test('editor and preview panes keep compact vertical reading space', async ({ page }) => {
  await page.goto('/');
  await expect(liveEditor(page)).toBeVisible();

  // issue #264:留白模型重构 — .cm-scroller 不再持有 padding,
  // 正文呼吸留白落在 .cm-content 的水平 padding-inline(clamp 32px~96px)。
  const editorPadding = await liveEditorContent(page).evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      inlineStart: parseFloat(style.paddingInlineStart),
      inlineEnd: parseFloat(style.paddingInlineEnd),
    };
  });

  expect(editorPadding.inlineStart).toBeGreaterThanOrEqual(32);
  expect(editorPadding.inlineEnd).toBeGreaterThanOrEqual(32);
  expect(editorPadding.inlineStart).toBeLessThanOrEqual(96);
  expect(editorPadding.inlineEnd).toBeLessThanOrEqual(96);
});

test('toolbar toggles source mode without showing Word preview', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.editor-pane')).toBeVisible();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(liveEditor(page)).toBeVisible();
  await expect(page.locator('.cm-editor')).toBeVisible();
});

test('source mode keeps long documents scrollable', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText(
    Array.from({ length: 140 }, (_, index) => `第 ${index + 1} 行：源码模式滚动回归测试`).join('\n'),
  );

  const scrollMetrics = await page.locator('.cm-scroller').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
  });

  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight + 200);
  expect(scrollMetrics.scrollTop).toBeGreaterThan(120);
});

test('Word preview button opens and closes the right paper preview panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: '导出 Word' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
  await expect(page.getByLabel('Word 导出预设')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 Word' })).toBeVisible();

  await page.getByLabel('视图与外观').getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
});

test('HTML preview uses the shared right panel and is mutually exclusive with Word preview', async ({ page }) => {
  await page.goto('/');

  const editor = liveEditor(page);
  const viewToolbar = page.getByLabel('视图与外观');
  const wordButton = viewToolbar.getByRole('button', { name: 'Word 预览' });
  const htmlButton = viewToolbar.getByRole('button', { name: 'HTML 预览' });

  await expect(editor).toBeVisible();
  await htmlButton.click();
  await expect(page.locator('.wechat-preview-panel')).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  await expect(htmlButton).toHaveClass(/active/);
  await expect(wordButton).not.toHaveClass(/active/);
  await expect(page.getByRole('separator', { name: '调整右侧预览宽度' })).toBeVisible();

  const editorBeforeResize = await editor.boundingBox();
  const handle = await page.getByRole('separator', { name: '调整右侧预览宽度' }).boundingBox();
  expect(editorBeforeResize).not.toBeNull();
  expect(handle).not.toBeNull();

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 90, handle!.y + handle!.height / 2);
  await page.mouse.up();

  const editorAfterResize = await editor.boundingBox();
  expect(editorAfterResize).not.toBeNull();
  expect(editorAfterResize!.width).toBeGreaterThan(240);
  await expect(page.locator('.wechat-preview-panel')).toBeVisible();

  await wordButton.click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
  await expect(page.locator('.wechat-preview-panel')).toHaveCount(0);
  await expect(wordButton).toHaveClass(/active/);
  await expect(htmlButton).not.toHaveClass(/active/);

  await htmlButton.click();
  await expect(page.locator('.wechat-preview-panel')).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  await expect(htmlButton).toHaveClass(/active/);
  await expect(wordButton).not.toHaveClass(/active/);

  await page.locator('.wechat-preview-panel').getByRole('button', { name: '关闭预览' }).click();
  await expect(page.locator('.wechat-preview-panel')).toHaveCount(0);
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  await expect(editor).toBeVisible();
});

test('HTML export settings switch subpages and import custom CSS slots', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.localStorage.setItem('e2e-clipboard-text', text);
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: 'HTML 导出', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'HTML 导出预设' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '预设库' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '删除/停用' })).toHaveCount(0);
  const htmlSubnav = page.locator('.settings-subnav');
  const htmlSubnavMetrics = await htmlSubnav.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    tabs: Array.from(el.querySelectorAll('[role="tab"]')).map((tab) => tab.getBoundingClientRect().width),
  }));
  expect(htmlSubnavMetrics.tabs).toHaveLength(3);
  expect(htmlSubnavMetrics.tabs.every((width) => width > htmlSubnavMetrics.width / 4)).toBe(true);
  await expect(page.getByLabel('HTML 导出预设列表')).toContainText('简洁图文');
  await expect(page.getByText(/来源：/)).toHaveCount(0);
  await expect(page.getByLabel(/HTML 文章预览/)).toBeVisible();

  await page.locator('.settings-preset-select-button').filter({ hasText: '清爽正文' }).click();
  await expect(page.getByLabel(/清爽正文 HTML 文章预览/)).toBeVisible();
  await expect(page.getByText(/点击文章放大查看/)).toHaveCount(0);
  await expect(page.locator('.settings-preset-preview-meta small')).toHaveCount(0);
  await page.getByRole('button', { name: /放大查看 .* HTML 预览/ }).click();
  await expect(page.getByRole('dialog', { name: /HTML 预览放大/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /HTML 预览放大/ }).locator('.settings-html-preview-article')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /HTML 预览放大/ })).toHaveCount(0);

  await page.getByRole('tab', { name: '自定义槽位' }).click();
  await expect(page.getByText('自定义 CSS 槽位', { exact: true })).toBeVisible();
  await expect(page.getByText('0/8', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/HTML 文章预览/)).toHaveCount(0);
  await expect(page.locator('.settings-preset-workbench--full')).toBeVisible();
  await expect(page.getByRole('button', { name: '导入 CSS 预设文件', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存 CSS 预设' })).toHaveCount(0);
  await expect(page.getByLabel('自定义 HTML 预设名称')).toHaveCount(0);
  await expect(page.getByLabel('自定义 HTML CSS')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导入 CSS 预设文件到槽位 1' })).toBeVisible();
  await page.locator('.settings-file-input').setInputFiles({
    name: 'team-html-style.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      id: 'team-html-style',
      name: '团队 HTML 样式',
      description: '团队统一 HTML 预设',
      base: 'html-wechat-style',
      css: '.typola-html-article p { color: rgb(9, 8, 7); }',
    }, null, 2)),
  });
  await expect(page.getByText('已保存「团队 HTML 样式」')).toBeVisible();
  await expect(page.getByText('1/8', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /槽位 1 团队 HTML 样式/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出当前 CSS 预设' })).toBeVisible();
  await page.getByRole('button', { name: '导出当前 CSS 预设' }).click();
  await expect(page.getByText('当前 CSS 预设 JSON 已复制')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('e2e-clipboard-text') ?? '')).toContain(
    '"name": "团队 HTML 样式"',
  );

  await expect(page.getByLabel('CSS 预设交换 JSON')).toHaveCount(0);
  await page.locator('.settings-file-input').setInputFiles({
    name: 'E2E 文件样式.css',
    mimeType: 'text/css',
    buffer: Buffer.from('.typola-html-article h2 { color: rgb(1, 2, 3); }'),
  });
  await expect(page.getByText('已保存「E2E 文件样式」')).toBeVisible();
  await expect(page.getByText('2/8', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /槽位 2 E2E 文件样式/ })).toBeVisible();

  await page.getByRole('tab', { name: 'CSS 示例' }).click();
  await expect(page.locator('.settings-json-example pre').first()).toContainText('.typola-html-article h2');
  await expect(page.getByLabel(/HTML 文章预览/)).toHaveCount(0);
  await expect(page.locator('.settings-preset-workbench--full')).toBeVisible();
  await expect(page.getByRole('button', { name: '复制 CSS 示例' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制 CSS 预设 JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导出当前 CSS 预设' })).toHaveCount(0);
  await expect(page.getByText('不支持的写法')).toHaveCount(0);
  await expect(page.getByText('安全预检结果')).toHaveCount(0);
});

test('Word preview keeps a true A4 page and scales it to the side panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-rendered-paper')).toBeVisible();
  await expect(page.locator('.word-page-label').first()).toHaveText('第 1 页');

  const metrics = await page.locator('.word-rendered-paper').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      paddingLeft: parseFloat(style.paddingLeft),
    };
  });
  const scale = await page.locator('.word-preview-stage').evaluate((el) => (
    parseFloat(getComputedStyle(el).getPropertyValue('--word-preview-scale') || '1')
  ));

  expect(metrics.width).toBeGreaterThan(780);
  expect(metrics.width).toBeLessThan(805);
  expect(metrics.height).toBeGreaterThan(1110);
  expect(metrics.paddingLeft).toBeGreaterThan(115);
  expect(scale).toBeGreaterThan(0.45);
  expect(scale).toBeLessThan(0.7);
});

test('Word preview paginates long documents with page labels', async ({ page }) => {
  await page.goto('/');
  await typeMarkdown(page, Array.from({ length: 90 }, (_, index) => (
    `## 第 ${index + 1} 段\n\n这是用于分页预览的较长段落，确保 Word 预览会拆分成多张 A4 纸。`
  )).join('\n\n'));

  await expect(page.locator('.word-page-label').nth(1)).toHaveText('第 2 页');
  const labels = await page.locator('.word-page-label').allTextContents();
  expect(labels.length).toBeGreaterThan(1);
});

test('Word preview resizer changes panel width', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();

  const panel = page.locator('.word-preview-panel');
  const resizer = page.getByRole('separator', { name: '调整右侧预览宽度' });
  const before = await panel.boundingBox();
  const handle = await resizer.boundingBox();

  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 140, handle!.y + handle!.height / 2);
  await page.mouse.up();

  const after = await panel.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width + 80);
});

test('source edits are reflected when switching back to writing mode', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('# 证据目录\n\n正文内容');

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(liveEditor(page)).toContainText('证据目录');
});

test('ordinary Markdown editing is the default in the writing pane (no preview toggle)', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('# 大文件\n\n这是一个很长的 Markdown 文件开头。\n\n后续还有大量正文，需要普通 Markdown 预览继续阅读。');

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(liveEditor(page)).toBeVisible();
  await expect(liveEditor(page)).toContainText('大文件');
  await expect(page.getByRole('button', { name: '退出 HTML 预览' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'HTML 阅读预览' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑表格' })).toHaveCount(0);
  await expect(page.locator('.html-reading-pane')).toHaveCount(0);
  await expect(page.locator('.html-preview-pane')).toHaveCount(0);
});

test('legacy Markdown preview is not mounted by default', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.preview-area')).toHaveCount(0);
  await expect(page.locator('.preview-content')).toHaveCount(0);
});

test('Word preview uses the right panel instead of replacing the editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();

  await expect(liveEditor(page)).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
});

test('Word preview panel keeps the editor visible while resizing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();

  const editor = liveEditor(page);
  const resizer = page.getByRole('separator', { name: '调整右侧预览宽度' });
  const before = await editor.boundingBox();
  const handle = await resizer.boundingBox();

  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 120, handle!.y + handle!.height / 2);
  await page.mouse.up();

  const after = await editor.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeLessThan(before!.width - 60);
});

test('settings modal keeps a fixed size across sections', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();

  const modal = page.locator('.settings-modal');
  await expect(modal).toBeVisible();
  await waitForElementAnimations(page, '.settings-modal');
  const before = await modal.boundingBox();
  expect(before).not.toBeNull();

  await page.getByRole('button', { name: 'Word 导出', exact: true }).click();
  const after = await modal.boundingBox();
  expect(after).not.toBeNull();

  expect(Math.round(after!.width)).toBe(Math.round(before!.width));
  expect(Math.round(after!.height)).toBe(Math.round(before!.height));
});

test('general settings can switch the interface to Japanese', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();

  await page.locator('.settings-select').first().selectOption('ja-JP');

  await expect(page.getByRole('heading', { name: '一般' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Word 書き出し', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'HTML 書き出し', exact: true })).toBeVisible();
});

test('preview font settings split Chinese, English, and heading choices', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '预览', exact: true }).click();

  await expect(page.getByLabel('中文字体')).toHaveValue('Default');
  await expect(page.getByLabel('英文字体')).toHaveValue('Default');
  await expect(page.getByLabel('标题字体')).toHaveValue('Body');

  await page.getByLabel('中文字体').selectOption('Songti SC');
  await page.getByLabel('英文字体').selectOption('Georgia');
  await page.getByLabel('标题字体').selectOption('Latin');

  const fontState = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.app-layout');
    const settings = JSON.parse(localStorage.getItem('typola-settings') || '{}') as {
      previewChineseFontFamily?: string;
      previewLatinFontFamily?: string;
      previewHeadingFontFamily?: string;
    };
    const style = app ? getComputedStyle(app) : null;
    return {
      settings,
      reading: style?.getPropertyValue('--reading-font-family') ?? '',
      heading: style?.getPropertyValue('--reading-heading-font-family') ?? '',
    };
  });

  expect(fontState.settings.previewChineseFontFamily).toBe('Songti SC');
  expect(fontState.settings.previewLatinFontFamily).toBe('Georgia');
  expect(fontState.settings.previewHeadingFontFamily).toBe('Latin');
  expect(fontState.reading).toContain('Georgia');
  expect(fontState.reading).toContain('Songti SC');
  expect(fontState.heading).toContain('Georgia');
});

test('preview body text consumes the selected Chinese font stack', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('中文正文 English');

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await page.getByLabel('中文字体').selectOption('Songti SC');
  await page.getByLabel('英文字体').selectOption('Georgia');

  const readingFontFamily = await page.locator('.app-layout').evaluate((el) => (
    getComputedStyle(el).getPropertyValue('--reading-font-family')
  ));

  expect(readingFontFamily).toContain('Georgia');
  expect(readingFontFamily).toContain('Songti SC');
});

test('Word export settings make the paper preview expandable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: 'Word 导出', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Word 导出预设' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '预设库' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: '自定义槽位' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'JSON 示例' })).toBeVisible();
  await expect(page.getByRole('button', { name: '删除/停用' })).toHaveCount(0);
  const wordSubnav = page.locator('.settings-subnav');
  const wordSubnavMetrics = await wordSubnav.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    tabs: Array.from(el.querySelectorAll('[role="tab"]')).map((tab) => tab.getBoundingClientRect().width),
  }));
  expect(wordSubnavMetrics.tabs).toHaveLength(3);
  expect(wordSubnavMetrics.tabs.every((width) => width > wordSubnavMetrics.width / 4)).toBe(true);
  const presetList = page.getByLabel('Word 导出预设列表');
  await expect(presetList).toBeVisible();
  await expect(presetList.getByText('预设库', { exact: true })).toBeVisible();
  await expect(page.getByText('自定义预设槽位', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/点击纸张放大查看/)).toHaveCount(0);
  await expect(page.locator('.settings-preset-preview-meta small')).toHaveCount(0);
  await page.getByRole('button', { name: /放大查看 .* Word 预览/ }).click();
  await expect(page.getByRole('dialog', { name: /Word 预览放大/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Word 预览放大/ }).locator('.word-paper')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Word 预览放大/ })).toHaveCount(0);

  await page.getByRole('tab', { name: '自定义槽位' }).click();
  await expect(page.getByText('自定义预设槽位', { exact: true })).toBeVisible();
  await expect(page.getByText('0/8', { exact: true })).toBeVisible();
  await expect(page.locator('.settings-preset-slot-empty')).toHaveCount(8);
  await expect(page.getByRole('button', { name: '导入 JSON', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导入 JSON 到自定义槽位 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: /放大查看 .* Word 预览/ })).toHaveCount(0);
  await expect(page.locator('.settings-preset-workbench--full')).toBeVisible();

  await page.getByRole('tab', { name: 'JSON 示例' }).click();
  await expect(page.locator('.settings-json-example pre')).toContainText('"id"');
  await expect(page.getByRole('button', { name: '导入 JSON', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制示例 JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /放大查看 .* Word 预览/ })).toHaveCount(0);
  await expect(page.locator('.settings-preset-workbench--full')).toBeVisible();
  await expect(page.locator('.settings-modal')).toBeVisible();
});

test('settings about section exposes update controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '关于' }).click();

  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
  await expect(page.getByText('面向 Windows 的 Markdown 写作、AI 改稿与文档交付桌面工作台')).toBeVisible();
  await expect(page.getByText('稳定预览包含 HTML 表格的 Markdown 文档，并支持 Word 纸张预览与导出。')).toHaveCount(0);
  await expect(page.getByText(/法律、财税/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '自动检查更新' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('尚未检查更新。')).toHaveCount(0);
  await expect(page.getByText('Typola 0.3.7')).toHaveCount(0);
  await expect(page.getByText('dev', { exact: true })).toBeVisible();
  await expect(page.getByText(/启动后延迟检查/)).toHaveCount(0);
  await expect(page.getByText('专注于法律 AI 研究，以及资产、数据与 AI 类法律业务')).toHaveCount(0);
  await expect(page.getByText('ywxlaw')).toHaveCount(0);
  await expect(page.getByAltText('微信二维码')).toHaveCount(0);
  await expect(page.getByText('个人介绍')).toHaveCount(0);
  await expect(page.getByText('github.com/cat-xierluo/Typola')).toHaveCount(0);
  await expect(page.getByText('更新源')).toHaveCount(0);
});

test('settings nav exposes 10 sections and hides the legacy shortcuts tab (ISS-153)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();

  const navButtons = page.locator('.settings-nav .settings-nav-item');
  await expect(navButtons).toHaveCount(10);
  await expect(navButtons).toHaveText([
    '通用',
    '编辑器',
    '图像',
    '预览',
    '外观',
    'Word 导出',
    'HTML 导出',
    '终端',
    'AI 执行',
    '关于',
  ]);
  await expect(page.getByRole('button', { name: '快捷键', exact: true })).toHaveCount(0);
});

test('toolbar buttons expose hover tooltips without native titles (ISS-153)', async ({ page }) => {
  await page.goto('/');

  // 2.0.8-beta 起移除 native title 双 tooltip,悬浮提示统一走 data-tooltip。
  const names: Array<RegExp | string> = [
    '打开文件',
    '保存当前文件',
    // 同类动作归组后：另存为/打开文件夹/插入图片收进各组 chevron 下拉,
    // 工具栏上对应按钮为「主按钮 + 分组选项」。
    '保存选项',
    '打开选项',
    '插入选项',
    '源码模式',
    'Word 预览',
    'HTML 预览',
    '设置',
  ];

  for (const name of names) {
    const button = page.getByRole('button', { name }).first();
    const tooltip = await button.getAttribute('data-tooltip');
    expect(tooltip ?? '', `Toolbar button "${name}" should declare a data-tooltip`).not.toBe('');
    expect(await button.getAttribute('title'), `Toolbar button "${name}" should not keep a native title`).toBeNull();
  }
});

test('toolbar split menus are keyboard accessible (open, arrows, Esc return)', async ({ page }) => {
  await page.goto('/');

  // 保存分组:键盘聚焦 chevron → Enter 打开 → 首项聚焦 → Esc 关闭并还给 trigger 焦点。
  const saveChevron = page.getByRole('button', { name: '保存选项' });
  await saveChevron.focus();
  await page.keyboard.press('Enter');
  const saveMenu = page.getByRole('menu', { name: '保存选项' });
  await expect(saveMenu).toBeVisible();
  await expect(saveMenu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(saveMenu).toBeHidden();
  await expect(saveChevron).toBeFocused();

  // 导出菜单(两项):ArrowDown/ArrowUp 在菜单项间循环移动。
  // 菜单可访问名来自 useRole 注入的 aria-labelledby(指向「导出」按钮)。
  const exportButton = page.getByRole('button', { name: '导出', exact: true });
  await exportButton.focus();
  await page.keyboard.press('Enter');
  const exportMenu = page.getByRole('menu', { name: '导出', exact: true });
  await expect(exportMenu).toBeVisible();
  const pdfItem = exportMenu.getByRole('menuitem', { name: '导出 PDF' });
  const wordItem = exportMenu.getByRole('menuitem', { name: '导出 Word' });
  await expect(pdfItem).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(wordItem).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(pdfItem).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(exportMenu).toBeHidden();
  await expect(exportButton).toBeFocused();
});

test('chevron hit target stays at least 24px wide (WCAG 2.2)', async ({ page }) => {
  await page.goto('/');

  const widths = await page.evaluate(() => Array.from(
    document.querySelectorAll<HTMLButtonElement>('.app-toolbar .toolbar-split > .split-chevron'),
  ).map((button) => button.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(0);
  for (const width of widths) {
    expect(width).toBeGreaterThanOrEqual(24);
  }
});

test('editor/left/right tab bars share the same 38px header height', async ({ page }) => {
  await page.goto('/');

  // 新建一个命名 tab 让编辑器标签栏挂载(单未命名 tab 时 tabbar 隐藏)。
  await page.getByRole('button', { name: '新建文档' }).click();
  await expect(page.locator('.editor-tabbar')).toBeVisible();

  // 文件树默认可能收起:仅在不可见时通过工具栏打开。
  if (await page.locator('.left-rail-tabs').count() === 0) {
    await page.getByRole('button', { name: '打开文件树' }).click();
  }
  await expect(page.locator('.left-rail-tabs')).toBeVisible();

  // Word 预览打开右栏,让 right-rail-tabs 挂载。
  await page.getByLabel('视图与外观').getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.right-rail-tabs')).toBeVisible();

  const heights = await page.evaluate(() => {
    const height = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().height ?? 0;
    return {
      editor: height('.editor-tabbar'),
      left: height('.left-rail-tabs'),
      right: height('.right-rail-tabs'),
    };
  });
  expect(heights.editor).toBe(38);
  expect(heights.left).toBe(38);
  expect(heights.right).toBe(38);
});

test('settings modal switches tabs by lazy loading each section on demand (ISS-152)', async ({ page }) => {
  await page.goto('/');

  // Measure end-to-end latency from clicking the settings button until the
  // main content heading becomes visible. Cold chunk downloads should not
  // noticeably block the default section.
  const settingsButton = page.getByRole('button', { name: '设置' });
  const start = Date.now();
  await settingsButton.click();
  await expect(page.locator('.settings-modal')).toBeVisible();
  await expect(page.getByRole('heading', { name: '通用' })).toBeVisible();
  const coldOpenMs = Date.now() - start;

  // Each tab should resolve its own section chunk on demand. We assert only
  // that switching to every non-default tab eventually surfaces its heading
  // — the lazy chunks must be loaded after the initial render.
  const sections: Array<{ tab: string; heading: RegExp }> = [
    { tab: '编辑器', heading: /编辑器/ },
    { tab: '图像', heading: /图像/ },
    { tab: '预览', heading: /预览/ },
    { tab: '外观', heading: /外观/ },
    { tab: 'Word 导出', heading: /Word 导出预设/ },
    { tab: 'HTML 导出', heading: /HTML 导出预设/ },
    { tab: '终端', heading: /终端/ },
    { tab: 'AI 执行', heading: /AI 执行/ },
    { tab: '关于', heading: /关于/ },
  ];

  for (const { tab, heading } of sections) {
    // 「终端」与工具栏终端按钮同名,须限定在设置导航内点击
    await page.locator('.settings-nav .settings-nav-item').filter({ hasText: tab }).click();
    await expect(page.getByRole('heading', { heading })).toBeVisible();
  }

  // The cold open should feel snappy; we set a generous 2.5s budget to absorb
  // CI jitter while still catching major regressions vs. the original
  // ~5s+ skeleton experience reported in ISS-152.
  expect(coldOpenMs).toBeLessThan(2500);
});

test('Cmd+, opens the settings modal from anywhere (ISS-153)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.settings-modal')).toHaveCount(0);
  await page.keyboard.press('Meta+,');
  // The skeleton renders immediately, but the real SettingsPage (which
  // registers the Escape handler) only mounts after the lazy chunk resolves.
  // Wait for the skeleton to disappear before exercising the shortcut.
  await expect(page.locator('.settings-modal-skeleton')).toHaveCount(0);
  await expect(page.locator('.settings-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.settings-modal')).toHaveCount(0);
});

test('long HTML evidence tables wrap inside the preview pane', async ({ page }) => {
  await page.goto('/');
  await typeMarkdown(
    page,
    [
      '<table>',
      '<thead><tr><th>序号</th><th>证据名称</th><th>证明目的</th><th>备注</th></tr></thead>',
      '<tbody>',
      '<tr>',
      '<td>1</td>',
      '<td>关于项目付款、交付、验收及后续沟通记录的完整证据目录附件一二三四五六七八九十</td>',
      '<td>证明双方在合同履行过程中已经就付款节点、交付范围、验收方式及违约责任进行了连续沟通并形成明确意思表示</td>',
      '<td>file:///Users/example/Documents/case-materials/very-long-folder-name/evidence-index-with-extra-long-name-and-no-natural-breakpoints.pdf</td>',
      '</tr>',
      '</tbody>',
      '</table>',
    ].join('\n'),
  );

  const table = page.locator('.word-rendered-paper .word-paper-content table').first();
  const shell = page.locator('.word-rendered-paper').first();
  await expect(table).toBeVisible();

  const horizontalOverflow = await shell.evaluate((el) => el.scrollWidth - el.clientWidth);
  const cellWhiteSpace = await page.locator('.word-rendered-paper .word-paper-content td').first()
    .evaluate((el) => getComputedStyle(el).whiteSpace);

  expect(horizontalOverflow).toBeLessThanOrEqual(2);
  expect(cellWhiteSpace).toBe('normal');
});

test('floating toc rail opens the outline while panel buttons pin and close it', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText([
    '# 证据目录',
    '',
    '目录前正文。'.repeat(90),
    '',
    '## 第一组 权利基础',
    '',
    '第一组正文。'.repeat(90),
    '',
    '### 登记证书',
  ].join('\n'));
  await page.getByRole('button', { name: '源码模式' }).click();

  await expect(page.getByRole('button', { name: '大纲', exact: true })).toHaveCount(0);
  const toc = page.locator('.floating-toc');
  // issue #264 后非固定态 aside 宽度为 0(常驻 rail/tick 已移除),只断言挂载与热区存在
  await expect(toc).toHaveCount(1);
  await expect(page.locator('.floating-toc-edge-trigger')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '查看大纲' })).toBeVisible();
  await expect(page.locator('.floating-toc-pin')).toHaveCount(0);

  const collapsedState = await toc.evaluate((el) => ({
    pinned: el.classList.contains('pinned'),
    expanded: getComputedStyle(el.querySelector('.floating-toc-panel') as HTMLElement).visibility,
    hitWidth: el.getBoundingClientRect().width,
    left: el.getBoundingClientRect().left,
  }));
  expect(collapsedState.pinned).toBe(false);
  expect(collapsedState.expanded).toBe('hidden');
  expect(collapsedState.hitWidth).toBeLessThanOrEqual(24);
  expect(collapsedState.left).toBeLessThanOrEqual(24);

  await page.getByRole('button', { name: '查看大纲' }).click();
  await expect(page.locator('.floating-toc-panel')).toBeVisible();
  await expect(toc).not.toHaveClass(/pinned/);
  await expect(page.getByRole('button', { name: '固定大纲' })).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭大纲' })).toBeVisible();
  await expect(page.getByRole('button', { name: '总是固定大纲' })).toHaveCount(0);

  await page.getByRole('button', { name: '关闭大纲' }).click();
  await expect(page.locator('.floating-toc-panel')).toBeHidden();
  await expect(toc).not.toHaveClass(/pinned/);

  // 悬停左缘热区展开(热区高度修复后可达)
  await page.locator('.floating-toc-edge-trigger').hover();
  await expect(page.locator('.floating-toc-panel')).toBeVisible();
  await expect(page.locator('.floating-toc-item')).toHaveCount(3);

  const secondItem = page.locator('.floating-toc-item').nth(1);
  const secondItemBox = await secondItem.boundingBox();
  expect(secondItemBox).not.toBeNull();
  await page.mouse.move(secondItemBox!.x + secondItemBox!.width / 2, secondItemBox!.y + secondItemBox!.height / 2);
  await expect(page.locator('.floating-toc-panel')).toBeVisible();
  await secondItem.click();
  await expect(page.locator('.cm-scroller')).toBeVisible();

  const editorBeforePin = await liveEditor(page).boundingBox();
  const metrics = await toc.evaluate((el) => {
    const item = el.querySelector('.floating-toc-item');
    const trigger = el.querySelector('.floating-toc-edge-trigger');
    const itemStyle = item ? getComputedStyle(item) : null;
    const triggerRect = trigger?.getBoundingClientRect();
    const panelRect = el.querySelector('.floating-toc-panel')?.getBoundingClientRect();
    return {
      triggerWidth: triggerRect?.width ?? 0,
      opensRight: Boolean(triggerRect && panelRect && panelRect.left >= triggerRect.right),
      itemFontSize: itemStyle ? parseFloat(itemStyle.fontSize) : 0,
      itemLineHeight: itemStyle ? parseFloat(itemStyle.lineHeight) : 0,
    };
  });

  expect(metrics.triggerWidth).toBeLessThanOrEqual(8);
  expect(metrics.opensRight).toBe(true);
  expect(metrics.itemFontSize).toBeGreaterThanOrEqual(13);
  expect(metrics.itemLineHeight).toBeGreaterThanOrEqual(19);

  await page.getByRole('button', { name: '固定大纲' }).click();
  await expect(toc).toHaveClass(/pinned/);
  await expect(page.getByRole('button', { name: '取消固定大纲' })).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭大纲' })).toBeVisible();
  await expect(page.getByRole('button', { name: '总是固定大纲' })).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(20, 20);
  await expect(page.locator('.floating-toc-panel')).toBeVisible();

  const editorAfterPin = await liveEditor(page).boundingBox();
  const tocAfterPin = await toc.boundingBox();
  expect(editorBeforePin).not.toBeNull();
  expect(editorAfterPin).not.toBeNull();
  expect(tocAfterPin).not.toBeNull();
  expect(tocAfterPin!.width).toBeGreaterThanOrEqual(200);
  expect(editorAfterPin!.x).toBeGreaterThan(editorBeforePin!.x + 180);
  expect(editorAfterPin!.width).toBeLessThan(editorBeforePin!.width - 180);

  await page.getByRole('button', { name: '取消固定大纲' }).click();
  await expect(toc).not.toHaveClass(/pinned/);
  await expect(page.locator('.floating-toc-panel')).toBeVisible();

  await page.getByRole('button', { name: '固定大纲' }).click();
  await expect(toc).toHaveClass(/pinned/);
  await page.getByRole('button', { name: '关闭大纲' }).click();
  await expect(toc).not.toHaveClass(/pinned/);
  await expect(page.locator('.floating-toc-panel')).toBeHidden();
  await expect(page.getByRole('button', { name: '查看大纲' })).toBeVisible();
  await expect(page.getByRole('button', { name: '总是固定大纲' })).toHaveCount(0);
});

test('floating toc can persist an always-pinned outline preference from the pinned panel', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('# 证据目录\n\n## 第一组 权利基础\n\n### 登记证书');
  const toc = page.locator('.floating-toc');

  // 非固定态 aside 宽度为 0,只断言挂载;悬停左缘热区展开面板
  await expect(toc).toHaveCount(1);
  await expect(toc).not.toHaveClass(/pinned/);
  await page.locator('.floating-toc-edge-trigger').hover();
  await expect(page.getByRole('button', { name: '总是固定大纲' })).toHaveCount(0);

  await page.getByRole('button', { name: '固定大纲' }).click();
  const alwaysPinned = page.getByRole('button', { name: '总是固定大纲' });
  await expect(toc).toHaveClass(/pinned/);
  await expect(alwaysPinned).toBeVisible();
  await expect(alwaysPinned).toHaveAttribute('aria-pressed', 'false');

  await alwaysPinned.click();
  await expect(alwaysPinned).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(() => (
    JSON.parse(localStorage.getItem('typola-settings') || '{}').tocAlwaysPinned
  ))).toBe(true);

  await page.reload();
  await openEditor(page);
  await page.keyboard.insertText('# 新文档\n\n## 默认固定');
  await expect(toc).toHaveClass(/pinned/);
  await expect(page.getByRole('button', { name: '总是固定大纲' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '取消固定大纲' }).click();
  await expect(toc).not.toHaveClass(/pinned/);
  await expect(page.getByRole('button', { name: '总是固定大纲' })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => (
    JSON.parse(localStorage.getItem('typola-settings') || '{}').tocAlwaysPinned
  ))).toBe(false);
});

test('floating toc tracks CM6 writing scroll after the editor mounts', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText(
    Array.from({ length: 10 }, (_, index) => (
      `## 第 ${index + 1} 节\n\n${'用于滚动定位的正文内容。'.repeat(80)}`
    )).join('\n\n'),
  );
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(liveEditor(page)).toBeVisible();

  await page.locator('.floating-toc-edge-trigger').hover();
  await page.getByRole('button', { name: '固定大纲' }).click();
  await page.locator('.cm-scroller').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect(page.locator('.floating-toc-row.active')).not.toContainText('第 1 节');
});

test('floating toc jumps to headings in source mode', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText(
    Array.from({ length: 24 }, (_, index) => (
      `## 第 ${index + 1} 节\n\n${Array.from({ length: 8 }, (_unused, lineIndex) => `第 ${index + 1} 节正文 ${lineIndex + 1}`).join('\n')}`
    )).join('\n\n'),
  );
  await expect(page.locator('.cm-editor')).toBeVisible();

  const scroller = page.locator('.cm-scroller');
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });

  await page.locator('.floating-toc-edge-trigger').hover();
  await page.getByRole('button', { name: '固定大纲' }).click();
  await page.getByRole('button', { name: '第 18 节' }).click();

  await expect.poll(async () => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(800);
  await expect(page.locator('.floating-toc-row.active')).toContainText('第 18 节');
});

test('floating toc stays bounded with many headings', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText(
    Array.from({ length: 160 }, (_, index) => `## 第 ${index + 1} 节\n\n正文`).join('\n\n'),
  );
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(liveEditor(page)).toBeVisible();

  await page.locator('.floating-toc-edge-trigger').hover();
  await expect(page.locator('.floating-toc-panel')).toBeVisible();

  const tocMetrics = await page.locator('.floating-toc').evaluate((el) => {
    const panel = el.querySelector('.floating-toc-panel') as HTMLElement | null;
    const list = el.querySelector('.floating-toc-list') as HTMLElement | null;
    const panelRect = panel?.getBoundingClientRect();
    const statusRect = document.querySelector('.status-bar')?.getBoundingClientRect();
    return {
      listOverflows: list ? list.scrollHeight > list.clientHeight : false,
      panelBottomGap: panelRect && statusRect ? statusRect.top - panelRect.bottom : 0,
    };
  });

  expect(tocMetrics.listOverflows).toBe(true);
  expect(tocMetrics.panelBottomGap).toBeGreaterThanOrEqual(0);
});

test('appearance settings switch the app into Night Current theme', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('# 证据目录\n\n## 第一组 权利基础');
  await page.getByRole('button', { name: '源码模式' }).click();

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '外观' }).click();
  await page.locator('[data-theme-card="night-current"]').click();

  await expect(page.locator('html')).toHaveAttribute('data-theme-id', 'night-current');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(page.locator('[data-theme-card="night-current"]')).toHaveAttribute('aria-checked', 'true');

  const darkColors = await page.evaluate(() => {
    const app = document.querySelector('.app-layout') as HTMLElement | null;
    const settingsModal = document.querySelector('.settings-modal') as HTMLElement | null;
    return {
      appBg: app ? getComputedStyle(app).getPropertyValue('--theme-canvas').trim() : '',
      bodyBg: getComputedStyle(document.body).backgroundColor,
      settingsBg: settingsModal ? getComputedStyle(settingsModal).backgroundColor : '',
    };
  });

  expect(darkColors.appBg).toBe('#11161c');
  expect(darkColors.bodyBg).not.toBe('rgb(255, 255, 255)');
  expect(darkColors.settingsBg).not.toBe('rgb(255, 255, 255)');

  await page.keyboard.press('Escape');
  await page.locator('.floating-toc-edge-trigger').hover();
  const tocBg = await page.locator('.floating-toc-panel').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(tocBg).not.toBe('rgb(255, 255, 255)');
});

test('settings modal first frame is non-blank on cold start (no preload window)', async ({ page }) => {
  /* Cold start: navigate to the page, dismiss any preload window by NOT
     hovering the settings button first, then click immediately. The first
     frame after clicking must already be non-blank — the entrance animation
     must NOT start from opacity 0. */
  await page.goto('/');

  const settingsButton = page.getByRole('button', { name: '设置' });
  await settingsButton.click({ noWaitAfter: true });

  /* Inspect the first frame synchronously. */
  const firstFrame = await page.evaluate(() => {
    const overlay = document.querySelector('.settings-overlay') as HTMLElement | null;
    const modal = document.querySelector('.settings-modal') as HTMLElement | null;
    if (!overlay || !modal) {
      return { overlay: false, modal: false, overlayOpacity: 0, modalOpacity: 0 };
    }
    const overlayStyle = getComputedStyle(overlay);
    const modalStyle = getComputedStyle(modal);
    return {
      overlay: true,
      modal: true,
      overlayOpacity: parseFloat(overlayStyle.opacity),
      modalOpacity: parseFloat(modalStyle.opacity),
    };
  });

  expect(firstFrame.overlay).toBe(true);
  expect(firstFrame.modal).toBe(true);
  /* The entrance animation must not start from an invisible state — first
     frame opacity must be at least 50%, so the user never sees a blank
     overlay / modal before the animation starts. */
  expect(firstFrame.overlayOpacity).toBeGreaterThan(0.5);
  expect(firstFrame.modalOpacity).toBeGreaterThan(0.5);

  /* After the entrance animation settles, the modal must be fully visible. */
  await waitForElementAnimations(page, '.settings-modal');
  await expect(page.locator('.settings-modal-content')).toBeVisible();
});

test('settings modal first frame is non-blank after cache is cleared', async ({ page }) => {
  /* Cache clear: open the page, clear localStorage, reload, then click
     settings. This simulates a user who has cleared browser data and
     reopens the app — the settings chunk must still resolve fast enough
     to avoid a blank first frame. */
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();

  const settingsButton = page.getByRole('button', { name: '设置' });
  await settingsButton.click({ noWaitAfter: true });

  const firstFrame = await page.evaluate(() => {
    const overlay = document.querySelector('.settings-overlay') as HTMLElement | null;
    const modal = document.querySelector('.settings-modal') as HTMLElement | null;
    if (!overlay || !modal) {
      return { overlay: false, modal: false, overlayOpacity: 0, modalOpacity: 0 };
    }
    return {
      overlay: true,
      modal: true,
      overlayOpacity: parseFloat(getComputedStyle(overlay).opacity),
      modalOpacity: parseFloat(getComputedStyle(modal).opacity),
    };
  });

  expect(firstFrame.overlay).toBe(true);
  expect(firstFrame.modal).toBe(true);
  expect(firstFrame.overlayOpacity).toBeGreaterThan(0.5);
  expect(firstFrame.modalOpacity).toBeGreaterThan(0.5);

  await waitForElementAnimations(page, '.settings-modal');
  await expect(page.locator('.settings-modal-content')).toBeVisible();
});

test('status bar shows the no-file placeholder and keeps a fixed height when no document is open', async ({ page }) => {
  await page.goto('/');

  const statusBar = page.locator('.status-bar');
  await expect(statusBar).toBeVisible();

  const path = page.locator('.status-path');
  await expect(path).toHaveText('未打开文件');

  const box = await statusBar.boundingBox();
  expect(box?.height ?? 0).toBeLessThanOrEqual(22);
});

/* 状态栏路径样式设置(statusBarPathStyle)已随外观设置重构移除,相关用例删除。 */

/* ===== ISS-150: Right panel must not squeeze the main editor ===== */

test('Word preview keeps the main editor at least 480px wide on a standard 1280px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();

  const editor = liveEditor(page);
  const editorBox = await editor.boundingBox();
  expect(editorBox).not.toBeNull();
  expect(editorBox!.width).toBeGreaterThanOrEqual(480);
});

test('Word preview auto-collapses on a narrow 800x600 viewport so the editor stays readable', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');

  const editor = liveEditor(page);

  const initialBox = await editor.boundingBox();
  expect(initialBox).not.toBeNull();
  const initialWidth = initialBox!.width;
  expect(initialWidth).toBeLessThanOrEqual(800);

  await page.getByRole('button', { name: 'Word 预览' }).click();

  /* At 800px the panel cannot host both the 480px main editor and the 360px
     right panel, so the toggle is a no-op and the editor keeps its full
     width. */
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  const afterBox = await editor.boundingBox();
  expect(afterBox).not.toBeNull();
  expect(afterBox!.width).toBeGreaterThanOrEqual(480);
  expect(afterBox!.width).toBeCloseTo(initialWidth, 0);
});

test('Word preview auto-collapses when the viewport shrinks below 850px while open', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();

  /* Shrink the viewport — WordPaperPreviewPane's resize listener should
     auto-close the panel so the editor keeps its readability floor. */
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  const editorBox = await liveEditor(page).boundingBox();
  expect(editorBox).not.toBeNull();
  expect(editorBox!.width).toBeGreaterThanOrEqual(480);
});

test('HTML presentation view keeps at least 480px width on a narrow 800x600 viewport', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');

  /* The HTML presentation layout is the only place where the editor pane
     is replaced by an isolated iframe. Verify the CSS keeps the pane at
     the readable floor even when the FloatingToc claims its pinned
     width. We do this by applying the layout class directly and checking
     the resolved min-width. */
  const minWidth = await page.evaluate(() => {
    const main = document.createElement('div');
    main.className = 'main-content html-presentation-layout';
    main.style.width = '800px';
    main.style.display = 'flex';

    const toc = document.createElement('div');
    toc.className = 'floating-toc pinned';
    toc.style.flex = '0 0 260px';
    toc.style.minWidth = '200px';
    main.appendChild(toc);

    const pane = document.createElement('div');
    pane.className = 'html-presentation-pane';
    pane.style.flex = '1';
    main.appendChild(pane);

    document.body.appendChild(main);
    const computed = getComputedStyle(pane).minWidth;
    document.body.removeChild(main);
    return parseFloat(computed);
  });

  /* The CSS rule sets `min-width: var(--main-min-width)` which is 480px.
     When the FloatingToc is pinned (260px) and the viewport is 800px, the
     pane's resolved min-width must be at least 480px so the iframe inside
     never gets squeezed below the readable line length. */
  expect(minWidth).toBeGreaterThanOrEqual(480);
});
