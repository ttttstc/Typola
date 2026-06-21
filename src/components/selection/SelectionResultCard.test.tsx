// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionResultCard } from './SelectionResultCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SelectionResultCard', () => {
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

  it('open=false 时不渲染任何东西', () => {
    act(() => {
      root.render(
        <SelectionResultCard
          open={false}
          x={0}
          y={0}
          state="loading"
          actionLabel="润色"
          originalText=""
          newText={null}
          error={null}
          onAccept={() => {}}
          onCancel={() => {}}
          onRetry={() => {}}
        />,
      );
    });
    expect(host.querySelector('.selection-result-card')).toBeNull();
  });

  it('loading 态展示 "AI 正在<动作>..." + spinner', () => {
    act(() => {
      root.render(
        <SelectionResultCard
          open
          x={0}
          y={0}
          state="loading"
          actionLabel="润色"
          originalText="原文"
          newText={null}
          error={null}
          onAccept={() => {}}
          onCancel={() => {}}
          onRetry={() => {}}
        />,
      );
    });
    const card = host.querySelector('.selection-result-card');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('AI 正在润色');
    expect(host.querySelector('.selection-result-card-spin')).toBeTruthy();
  });

  it('success 态显示原文/新版/按钮,点击采纳调 onAccept', () => {
    const onAccept = vi.fn();
    act(() => {
      root.render(
        <SelectionResultCard
          open
          x={0}
          y={0}
          state="success"
          actionLabel="润色"
          originalText="原文内容"
          newText="新版内容"
          error={null}
          onAccept={onAccept}
          onCancel={() => {}}
          onRetry={() => {}}
        />,
      );
    });
    const card = host.querySelector('.selection-result-card');
    expect(card?.textContent).toContain('原文内容');
    expect(card?.textContent).toContain('新版内容');
    const primary = host.querySelector('.selection-result-card-primary') as HTMLButtonElement | null;
    expect(primary?.textContent).toContain('采纳替换');
    act(() => {
      primary?.click();
    });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('error 态显示错误 + 重试按钮,点击调 onRetry', () => {
    const onRetry = vi.fn();
    act(() => {
      root.render(
        <SelectionResultCard
          open
          x={0}
          y={0}
          state="error"
          actionLabel="润色"
          originalText="原文"
          newText={null}
          error="claude not found"
          onAccept={() => {}}
          onCancel={() => {}}
          onRetry={onRetry}
        />,
      );
    });
    expect(host.querySelector('.selection-result-card-error')?.textContent).toBe('claude not found');
    const primary = host.querySelector('.selection-result-card-primary') as HTMLButtonElement | null;
    expect(primary?.textContent).toContain('重试');
    act(() => {
      primary?.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('按 Esc 调 onCancel', () => {
    const onCancel = vi.fn();
    act(() => {
      root.render(
        <SelectionResultCard
          open
          x={0}
          y={0}
          state="success"
          actionLabel="润色"
          originalText="x"
          newText="y"
          error={null}
          onAccept={() => {}}
          onCancel={onCancel}
          onRetry={() => {}}
        />,
      );
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('点击卡片外部调 onCancel,点击内部不调', () => {
    const onCancel = vi.fn();
    act(() => {
      root.render(
        <SelectionResultCard
          open
          x={0}
          y={0}
          state="success"
          actionLabel="润色"
          originalText="x"
          newText="y"
          error={null}
          onAccept={() => {}}
          onCancel={onCancel}
          onRetry={() => {}}
        />,
      );
    });
    // 点击卡片内部不应触发取消
    const inner = host.querySelector('.selection-result-card-text-new') as HTMLElement | null;
    act(() => {
      inner?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
    // 点击卡片外触发取消
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
