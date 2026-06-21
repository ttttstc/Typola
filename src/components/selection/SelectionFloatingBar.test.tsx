// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionFloatingBar } from './SelectionFloatingBar';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 的 getBoundingClientRect 返回全 0;组件对 bar 尺寸有 ESTIMATED 兜底,
// 渲染只 gate 在 visible && rect 上,所以这些测试能验证"是否出现"。
function mkRect(): { selRect: DOMRect } {
  return {
    selRect: { top: 100, left: 100, width: 80, height: 20, bottom: 120, right: 180 } as unknown as DOMRect,
  };
}

describe('SelectionFloatingBar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it('rect=null 时不显示', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={null} hasSelection={false} onPick={() => {}} />);
    });
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
  });

  it('回归:选中文字 + 过 debounce → 浮条必须出现(死锁版永不出现)', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection onPick={() => {}} />);
    });
    // debounce 期间不显示
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    // debounce 后必须出现 —— 这条正是抓"position 死锁导致永不渲染"的回归测试
    const bar = host.querySelector('.selection-floating-bar');
    expect(bar).not.toBeNull();
    // 7 个动作按钮齐全(改写已砍)
    expect(host.querySelectorAll('.selection-floating-bar-item')).toHaveLength(7);
  });

  it('点动作按钮 → onPick(action, origin) 带视口坐标', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection onPick={onPick} />);
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const buttons = host.querySelectorAll('.selection-floating-bar-item');
    act(() => {
      (buttons[0] as HTMLButtonElement).click();
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBe('polish');
    expect(onPick.mock.calls[0][1]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  });

  it('最后一个按钮是「加检视意见」(review)', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection onPick={onPick} />);
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const buttons = host.querySelectorAll('.selection-floating-bar-item');
    act(() => {
      (buttons[buttons.length - 1] as HTMLButtonElement).click();
    });
    expect(onPick.mock.calls[0][0]).toBe('review');
  });

  it('选区消失(rect 变 null)→ 浮条立即隐藏', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection onPick={() => {}} />);
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(host.querySelector('.selection-floating-bar')).not.toBeNull();
    act(() => {
      root.render(<SelectionFloatingBar rect={null} hasSelection={false} onPick={() => {}} />);
    });
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
  });

  it('Esc 隐藏当前选区的浮条', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection onPick={() => {}} />);
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(host.querySelector('.selection-floating-bar')).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
  });
});
