// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from './AssistantMessage';
import {
  formatAskUserQuestionAnswers,
  formatQuestionFormAnswers,
  parseQuestionForms,
  questionFormFromAskUserQuestion,
} from './questionForm';
import type { AgentMessage } from '../../services/agent/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../PreviewPane', () => ({
  PreviewPane: ({ source }: { source: string }) => <div data-testid="preview">{source}</div>,
}));

function assistant(content: string, tools: Extract<AgentMessage, { role: 'assistant' }>['tools'] = []): Extract<AgentMessage, { role: 'assistant' }> {
  return {
    id: 'a1',
    role: 'assistant',
    content,
    thinking: '',
    tools,
    createdAt: Date.now(),
    done: true,
  };
}

describe('QuestionForm', () => {
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

  it('parses question-form blocks and strips them from markdown', () => {
    const parsed = parseQuestionForms(`前文
<question-form id="task-type" title="选择任务类型">
{"questions":[{"id":"kind","label":"类型","type":"radio","options":["日报","PPT"]}]}
</question-form>
后文`);

    expect(parsed.markdown).toContain('前文');
    expect(parsed.markdown).toContain('后文');
    expect(parsed.markdown).not.toContain('question-form');
    expect(parsed.forms[0]?.id).toBe('task-type');
    expect(parsed.forms[0]?.questions[0]?.options).toEqual(['日报', 'PPT']);
  });

  it('formats submitted answers as a user message payload', () => {
    const form = parseQuestionForms(`<question-form id="f1" title="T">
{"questions":[{"id":"a","label":"选项","type":"checkbox","options":["A","B"]},{"id":"b","label":"说明","type":"text"}]}
</question-form>`).forms[0]!;

    expect(formatQuestionFormAnswers(form, { a: ['A', 'B'], b: '补充' })).toBe([
      '[form answers - f1]',
      '选项: A, B',
      '说明: 补充',
    ].join('\n'));
  });

  it('normalizes AskUserQuestion tool input into a form payload', () => {
    const form = questionFormFromAskUserQuestion({
      questions: [{
        header: '确认输出类型',
        question: '你想生成什么？',
        options: [{ label: '报告' }, { label: 'PPT' }],
      }],
    }, 'tool-1');

    expect(form?.title).toBe('确认输出类型');
    expect(form?.questions[0]).toMatchObject({
      label: '你想生成什么？',
      type: 'radio',
      options: ['报告', 'PPT'],
    });
    expect(formatAskUserQuestionAnswers(form!, { q1: 'PPT' })).toBe([
      '你想生成什么？',
      'PPT',
    ].join('\n'));
  });

  it('renders form cards and submits answers without showing raw tags', async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        <AssistantMessage
          message={assistant(`请先选择：
<question-form id="task-type" title="选择任务类型">
{"questions":[{"id":"kind","label":"类型","type":"radio","options":["日报","PPT"]},{"id":"note","label":"备注","type":"text"}]}
</question-form>`)}
          onSubmitQuestionForm={(_, text) => onSubmit(text)}
        />,
      );
    });

    expect(host.textContent).toContain('请先选择');
    expect(host.textContent).toContain('选择任务类型');
    expect(host.textContent).not.toContain('<question-form');

    const radio = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
      .find((input) => input.parentElement?.textContent?.includes('PPT'));
    const text = host.querySelector<HTMLInputElement>('input[type="text"]');
    await act(async () => {
      radio?.click();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(text, '用于周会');
      text!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.question-form-card footer button')?.click();
    });

    expect(onSubmit).toHaveBeenCalledWith([
      '[form answers - task-type]',
      '类型: PPT',
      '备注: 用于周会',
    ].join('\n'));
  });

  it('keeps submit disabled until at least one answer is provided', async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        <AssistantMessage
          message={assistant(`<question-form id="empty-check" title="补充信息">
{"questions":[{"id":"note","label":"备注","type":"text"}]}
</question-form>`)}
          onSubmitQuestionForm={(_, text) => onSubmit(text)}
        />,
      );
    });

    const button = host.querySelector<HTMLButtonElement>('.question-form-card footer button');
    expect(button?.disabled).toBe(true);

    const text = host.querySelector<HTMLInputElement>('input[type="text"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(text, '已经补充');
      text!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(button?.disabled).toBe(false);
    await act(async () => {
      button?.click();
    });

    expect(onSubmit).toHaveBeenCalledWith([
      '[form answers - empty-check]',
      '备注: 已经补充',
    ].join('\n'));
  });

  it('renders AskUserQuestion tool_use as an interactive card and submits the answer', async () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        <AssistantMessage
          message={assistant('', [{
            id: 'toolu_question',
            name: 'AskUserQuestion',
            input: {
              questions: [{
                header: '选择方向',
                question: '下一步做什么？',
                options: [{ label: '生成报告' }, { label: '生成 PPT' }],
              }],
            },
          }])}
          onSubmitQuestionForm={(formId, text) => onSubmit(formId, text)}
        />,
      );
    });

    expect(host.textContent).toContain('需要你回答');
    expect(host.textContent).toContain('选择方向');
    expect(host.textContent).toContain('下一步做什么？');
    expect(host.textContent).not.toContain('{"questions"');
    expect(host.querySelector('.op-status-question')).toBeTruthy();
    expect(host.querySelector('.op-status-error')).toBeFalsy();

    const radio = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
      .find((input) => input.parentElement?.textContent?.includes('生成 PPT'));
    await act(async () => {
      radio?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.question-form-card footer button')?.click();
    });

    expect(onSubmit).toHaveBeenCalledWith('tool:toolu_question', [
      '下一步做什么？',
      '生成 PPT',
    ].join('\n'));
  });

  it('groups low-attention research tools into a scrollable disclosure', () => {
    act(() => {
      root.render(
        <AssistantMessage
          message={assistant('处理中', [
            { id: 'read-1', name: 'Read', input: { filePath: 'a.md' } },
            { id: 'grep-1', name: 'Grep', input: { pattern: 'Typola' } },
            { id: 'glob-1', name: 'Glob', input: { pattern: '*.md' } },
            { id: 'write-1', name: 'Write', input: { filePath: 'out.md', content: '# Out' } },
          ])}
        />,
      );
    });

    expect(host.querySelector('.conversation-tool-group')).toBeTruthy();
    expect(host.textContent).toContain('资料检索与读取');
    expect(host.textContent).toContain('3 个工具调用');
    expect(host.textContent).toContain('写入');
  });
});
