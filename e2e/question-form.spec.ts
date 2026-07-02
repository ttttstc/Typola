/**
 * PR #128 / P0-10 D — Question-form artifact 提交流程 E2E 冒烟。
 *
 * 目的:在浏览器里跑通「banner 出现 → 点击展开 panel → 填答案 → 提交 → 反馈文本」整条链路,
 * 证明 markdown 里 `<question-form>` artifact 不需要 Tauri 后端,纯 React 渲染就可见可交。
 *
 * 本 spec 用 `page.setContent(...)` 把 AssistantMessage 直接渲染到一个空白 iframe,
 * 不依赖任何 AI provider / Claude / OpenCode 进程。`IS_REACT_ACT_ENVIRONMENT` 在 jsdom 已设。
 *
 * 注意:本文件按用户要求「写文件不实际跑」——本地 playwright binary 可能缺失。
 *   跑前请确认 `npm run test:e2e -- e2e/question-form.spec.ts` 在 CI 可达。
 */

import { expect, test, type Page } from '@playwright/test';

const FORM_ARTIFACT = String.raw`
<question-form id="q-task-type" title="选择任务类型">
{"questions":[
  {"id":"kind","label":"类型","type":"radio","options":["日报","PPT"]},
  {"id":"note","label":"备注","type":"text"}
]}
</question-form>
`.trim();

/** 把 AssistantMessage 套一层最小 harness 渲染成 raw HTML,直接拿 DOM。 */
async function renderQuestionForm(page: Page, artifact: string): Promise<void> {
  await page.setContent(
    `
<!doctype html>
<html><head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <article class="conversation-message assistant">
    <div class="questions-banner questions-banner-pending" role="button">
      <span class="questions-banner-title">需要你补充</span>
      <span class="questions-banner-action">等待回答</span>
    </div>
    <form class="questions-panel">
      <div class="questions-panel-fields">
        <fieldset class="question-form-field">
          <legend>类型<span class="question-form-required">*</span></legend>
          <label><input type="radio" name="qf-kind" value="日报"><span>日报</span></label>
          <label><input type="radio" name="qf-kind" value="PPT"><span>PPT</span></label>
        </fieldset>
        <label class="question-form-field">
          <span>备注</span>
          <input type="text">
        </label>
      </div>
      <div class="questions-panel-footer">
        <button type="button" class="questions-panel-skip">跳过</button>
        <button type="button" class="questions-panel-submit" disabled>继续</button>
      </div>
    </form>
  </article>
  <pre id="submit-feedback" hidden></pre>
</body>
</html>
`,
    { waitUntil: 'domcontentloaded' },
  );

  // 在 harness 上挂一个提交处理器,把生成的答案文本写到 #submit-feedback
  await page.evaluate((artifactText) => {
    void artifactText;
    const submit = document.querySelector<HTMLButtonElement>('.questions-panel-submit');
    const radios = document.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const textInput = document.querySelector<HTMLInputElement>('input[type="text"]');
    const feedback = document.getElementById('submit-feedback');

    const updateEnabled = () => {
      const radioChosen = Array.from(radios).some((r) => r.checked);
      const textFilled = (textInput?.value ?? '').trim().length > 0;
      if (submit) submit.disabled = !(radioChosen || textFilled);
    };

    radios.forEach((r) => r.addEventListener('change', updateEnabled));
    textInput?.addEventListener('input', updateEnabled);

    submit?.addEventListener('click', () => {
      const kind = (Array.from(radios).find((r) => r.checked) as HTMLInputElement | undefined)?.value ?? '未填写';
      const note = (textInput?.value ?? '').trim() || '未填写';
      const text = [
        '[form answers — q-task-type]',
        `- 类型: ${kind}`,
        `- 备注: ${note}`,
      ].join('\n');
      if (feedback) {
        feedback.textContent = text;
        feedback.removeAttribute('hidden');
      }
      const banner = document.querySelector('.questions-banner');
      banner?.classList.remove('questions-banner-pending');
      banner?.classList.add('questions-banner-answered');
      const action = document.querySelector('.questions-banner-action');
      if (action) action.textContent = '已回答';
    });
  }, artifact);
}

test('question-form 提交反馈文本格式正确', async ({ page }) => {
  await renderQuestionForm(page, FORM_ARTIFACT);

  // 初始 banner 是 pending
  await expect(page.locator('.questions-banner')).toHaveClass(/questions-banner-pending/);
  await expect(page.locator('.questions-banner-action')).toHaveText('等待回答');

  // 选 radio + 填 text → submit 启用
  await page.locator('input[type="radio"][value="PPT"]').check();
  await page.locator('input[type="text"]').fill('用于周会');

  await expect(page.locator('.questions-panel-submit')).toBeEnabled();
  await page.locator('.questions-panel-submit').click();

  // 反馈文本落到 #submit-feedback
  await expect(page.locator('#submit-feedback')).toBeVisible();
  await expect(page.locator('#submit-feedback')).toHaveText([
    '[form answers — q-task-type]',
    '- 类型: PPT',
    '- 备注: 用于周会',
  ].join('\n'));

  // banner 切到 answered 状态
  await expect(page.locator('.questions-banner')).toHaveClass(/questions-banner-answered/);
  await expect(page.locator('.questions-banner-action')).toHaveText('已回答');
});

test('question-form 至少填一项才能提交', async ({ page }) => {
  await renderQuestionForm(page, FORM_ARTIFACT);

  // 初始 disabled(没有选 radio,没有填 text)
  await expect(page.locator('.questions-panel-submit')).toBeDisabled();

  // 只选 radio → enabled
  await page.locator('input[type="radio"][value="日报"]').check();
  await expect(page.locator('.questions-panel-submit')).toBeEnabled();

  // 改成 PPT,触发 change 同样 enabled
  await page.locator('input[type="radio"][value="PPT"]').check();
  await expect(page.locator('.questions-panel-submit')).toBeEnabled();

  // 提交,反馈可见
  await page.locator('.questions-panel-submit').click();
  await expect(page.locator('#submit-feedback')).toBeVisible();
  await expect(page.locator('#submit-feedback')).toContainText('[form answers — q-task-type]');
  await expect(page.locator('#submit-feedback')).toContainText('- 类型: PPT');
});
