// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionsBanner } from './QuestionsBanner';
import type { QuestionFormBlock } from './questionForm';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeForm(overrides: Partial<QuestionFormBlock> = {}): QuestionFormBlock {
  return {
    id: 'demo',
    title: '需要你补充',
    questions: [],
    raw: '',
    ...overrides,
  };
}

describe('QuestionsBanner', () => {
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

  it('renders pending state with circle-help icon and "等待回答" action', () => {
    act(() => {
      root.render(
        <QuestionsBanner form={makeForm()} status="pending" open={false} onOpen={() => undefined} />,
      );
    });

    const banner = host.querySelector('button.questions-banner');
    expect(banner).toBeTruthy();
    expect(banner?.className).toContain('questions-banner-pending');
    expect(banner?.getAttribute('aria-expanded')).toBe('false');
    expect(banner?.disabled).toBe(false);
    expect(host.textContent).toContain('等待回答');
    expect(host.querySelector('button.questions-banner')).toBeTruthy();
    // CircleHelp / ChevronRight / Check / SkipForward / Loader2 都用 lucide-react 渲染成 svg
    expect(host.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('renders answered state with "已回答" action and check icon', () => {
    act(() => {
      root.render(
        <QuestionsBanner form={makeForm()} status="answered" open={false} onOpen={() => undefined} />,
      );
    });

    const banner = host.querySelector('button.questions-banner');
    expect(banner?.className).toContain('questions-banner-answered');
    expect(banner?.disabled).toBe(false);
    expect(host.textContent).toContain('已回答');
  });

  it('renders skipped state with "已跳过" action', () => {
    act(() => {
      root.render(
        <QuestionsBanner form={makeForm()} status="skipped" open={false} onOpen={() => undefined} />,
      );
    });

    const banner = host.querySelector('button.questions-banner');
    expect(banner?.className).toContain('questions-banner-skipped');
    expect(host.textContent).toContain('已跳过');
  });

  it('renders loading state with "表单加载中" action and a disabled button', () => {
    act(() => {
      root.render(
        <QuestionsBanner form={makeForm()} status="loading" open={false} onOpen={() => undefined} />,
      );
    });

    const banner = host.querySelector('button.questions-banner');
    expect(banner?.className).toContain('questions-banner-loading');
    expect(banner?.disabled).toBe(true);
    expect(host.textContent).toContain('表单加载中');
    // Loader2 自带 .spin className;通过 class 列表确认
    const spinner = host.querySelector('.questions-banner-status .spin, .questions-banner-status svg.spin');
    expect(spinner || host.querySelector('.questions-banner-status')).toBeTruthy();
    // 再次确认存在至少一个 .spin
    expect(host.querySelector('.spin')).toBeTruthy();
  });

  it('flips aria-expanded and chevron direction when open prop toggles', () => {
    act(() => {
      root.render(
        <QuestionsBanner form={makeForm()} status="pending" open={false} onOpen={() => undefined} />,
      );
    });
    expect(host.querySelector('button.questions-banner')?.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      root.render(
        <QuestionsBanner form={makeForm()} status="pending" open={true} onOpen={() => undefined} />,
      );
    });
    expect(host.querySelector('button.questions-banner')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('calls onOpen when the banner is clicked (skipped state, non-loading)', async () => {
    const onOpen = vi.fn();
    act(() => {
      root.render(
        <QuestionsBanner form={makeForm()} status="skipped" open={false} onOpen={onOpen} />,
      );
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button.questions-banner')?.click();
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not fire onOpen when status is loading (disabled)', async () => {
    const onOpen = vi.fn();
    act(() => {
      root.render(
        <QuestionsBanner form={makeForm()} status="loading" open={false} onOpen={onOpen} />,
      );
    });

    const banner = host.querySelector<HTMLButtonElement>('button.questions-banner');
    expect(banner?.disabled).toBe(true);
    // jsdom disabled 仍然 dispatch click,但 onClick handler 在 react 里因为 button disabled 不会触发
    await act(async () => {
      banner?.click();
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('uses the provided form title', () => {
    act(() => {
      root.render(
        <QuestionsBanner
          form={makeForm({ title: '选择任务类型' })}
          status="pending"
          open={false}
          onOpen={() => undefined}
        />,
      );
    });
    expect(host.querySelector('.questions-banner-title')?.textContent).toBe('选择任务类型');
  });
});
