// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionsPanel } from './QuestionsPanel';
import { formatQuestionFormSkipped } from './questionForm';
import type { QuestionFormBlock } from './questionForm';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeForm(overrides: Partial<QuestionFormBlock> = {}): QuestionFormBlock {
  return {
    id: 'demo',
    title: '补充信息',
    questions: [
      { id: 'audience', label: '受众', type: 'radio', options: ['dev', 'pm'], required: true },
      { id: 'note', label: '备注', type: 'text', options: [] },
    ],
    raw: '',
    ...overrides,
  };
}

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('QuestionsPanel', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('keeps Submit disabled when a required field is unanswered', async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        <QuestionsPanel form={makeForm()} status="pending" onSubmit={onSubmit} />,
      );
    });

    const button = host.querySelector<HTMLButtonElement>('.questions-panel-submit');
    expect(button?.disabled).toBe(true);

    // 选 radio(必修)之后应该 enable
    const radio = host.querySelector<HTMLInputElement>('input[type="radio"]');
    await act(async () => {
      radio?.click();
    });
    expect(button?.disabled).toBe(false);

    // 清掉:点 Skip 才调用 onSubmit — 这里只验证按钮 enabled
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clicking Skip fires onSubmit with a user-skipped status string', async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        <QuestionsPanel form={makeForm()} status="pending" onSubmit={onSubmit} />,
      );
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.questions-panel-skip')?.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]?.[0] as string;
    expect(payload).toBe(formatQuestionFormSkipped(makeForm(), false));
    expect(payload).toContain('[form answers — demo]');
    expect(payload).toContain('Form status: skipped');
    expect(payload).toContain('user skipped the form');
    expect(payload).not.toContain('auto skipped after timeout');
  });

  it('renders the readonly panel once status flips to answered/skipped', () => {
    const submitted = '[form answers — demo]\n- 答案: OK';
    act(() => {
      root.render(
        <QuestionsPanel
          form={makeForm()}
          status="pending"
          onSubmit={() => undefined}
        />,
      );
    });
    expect(host.querySelector('.questions-panel')).toBeTruthy();
    expect(host.querySelector('.questions-panel-readonly')).toBeNull();

    act(() => {
      root.render(
        <QuestionsPanel
          form={makeForm()}
          status="answered"
          submittedText={submitted}
          onSubmit={() => undefined}
        />,
      );
    });
    expect(host.querySelector('.questions-panel-readonly')).toBeTruthy();
    expect(host.textContent).toContain('你的回答');
    expect(host.textContent).toContain(submitted);

    act(() => {
      root.render(
        <QuestionsPanel
          form={makeForm()}
          status="skipped"
          submittedText={'[form answers — demo]\n- Form status: skipped'}
          onSubmit={() => undefined}
        />,
      );
    });
    expect(host.querySelector('.questions-panel-readonly')).toBeTruthy();
    expect(host.textContent).toContain('已跳过');
  });

  it('invokes onClose when the header close button is clicked', async () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <QuestionsPanel form={makeForm()} status="pending" onSubmit={() => undefined} onClose={onClose} />,
      );
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.questions-panel-close')?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the default 300s autoSkip countdown when autoSkipSeconds is missing', () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        <QuestionsPanel
          form={makeForm({ autoSkipSeconds: undefined })}
          status="pending"
          onSubmit={onSubmit}
        />,
      );
    });

    // 5:00 = 300s 默认值
    expect(host.querySelector('.questions-panel-countdown')?.textContent).toBe('5:00');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('auto-skips after the countdown reaches zero and emits a form answers string', async () => {
    vi.useFakeTimers();
    try {
      const onSubmit = vi.fn();
      act(() => {
        root.render(
          <QuestionsPanel
            form={makeForm({ autoSkipSeconds: 5 })}
            status="pending"
            onSubmit={onSubmit}
          />,
        );
      });

      // 起始显示 0:05
      expect(host.querySelector('.questions-panel-countdown')?.textContent).toBe('0:05');

      // 跑满 5 秒计时器
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0]?.[0] as string;
      // 第 6 个 tick 才会触发 (prev <= 1 清 interval):实际效果是当 prev=1 → prev-1=0 → 下一帧触发 onSubmit
      // 这里只断言它已经发出,具体时机留给实现细节。
      expect(payload).toContain('[form answers — demo]');
      expect(payload).toContain('Form status: skipped');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a textarea field with the user-provided value', async () => {
    const form: QuestionFormBlock = makeForm({
      questions: [
        { id: 'bio', label: '自我介绍', type: 'textarea', options: [], required: true },
      ],
    });
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        <QuestionsPanel form={form} status="pending" onSubmit={onSubmit} />,
      );
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).toBeTruthy();
    await act(async () => {
      setInputValue(textarea!, '我是谁');
    });
    expect(textarea?.value).toBe('我是谁');
  });

  it('keeps Submit disabled when only optional fields are filled', async () => {
    // 必修字段未填时,即使非必修字段已经填了值,Submit 仍 disabled(hasRequiredAnswered=false)
    const onSubmit = vi.fn();
    const form: QuestionFormBlock = makeForm({
      questions: [
        { id: 'must', label: '必填', type: 'text', options: [], required: true },
        { id: 'opt', label: '可选', type: 'text', options: [] },
      ],
    });
    act(() => {
      root.render(
        <QuestionsPanel form={form} status="pending" onSubmit={onSubmit} />,
      );
    });

    const textInputs = host.querySelectorAll<HTMLInputElement>('input[type="text"]');
    await act(async () => {
      setInputValue(textInputs[1]!, 'optional value');
    });
    const submit = host.querySelector<HTMLButtonElement>('.questions-panel-submit');
    expect(submit?.disabled).toBe(true);

    // 填了必修 → enabled
    await act(async () => {
      setInputValue(textInputs[0]!, 'required value');
    });
    expect(submit?.disabled).toBe(false);
  });
});
