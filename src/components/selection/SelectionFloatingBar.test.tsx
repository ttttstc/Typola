// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionFloatingBar } from './SelectionFloatingBar';
import '../../styles/app.css';
import type { I18nKey } from '../../services/i18n';

vi.mock('../../services/i18n', () => ({
  translate: (_locale: string, key: I18nKey) => {
    const dict: Record<string, string> = {
      floatingBarTooltip: '选中文字时浮现 · Esc 关闭 · 本页不再展示 · 全局隐藏',
      floatingBarHideThisPage: '本页不再展示',
      floatingBarHideGlobal: '全局隐藏',
    };
    return dict[key] ?? key;
  },
  I18nKey: undefined as unknown as I18nKey,
  LOCALE_OPTIONS: [],
}));

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ locale: 'zh-CN', selectionFloatingBarEnabled: true }),
}));

vi.mock('../ui/Tooltip', () => ({
  Tooltip: () => null,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
      root.render(<SelectionFloatingBar rect={null} hasSelection={false} stableTick={0} onPick={() => {}} />);
    });
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
  });

  it('回归:选中文字 + stableTick 递增 + 过 debounce → 浮条必须出现(死锁版永不出现)', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection stableTick={0} onPick={() => {}} />);
    });
    // stableTick=0 时 mouseup 还没发生,即使有 rect 也不应启动 debounce
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
    // 父组件触发 mouseup → stableTick +1 → 浮条才允许开始 debounce
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection stableTick={1} onPick={() => {}} />);
    });
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // debounce 后必须出现 —— 这条正是抓"position 死锁导致永不渲染"的回归测试
    const bar = host.querySelector('.selection-floating-bar');
    expect(bar).not.toBeNull();
    // 3 个高频动作按钮(润色/名词解释/加检视意见)+ 1 ⋯ 子按钮(默认未传 onDismissSession/onHideGlobally 故不渲染)
    expect(host.querySelectorAll('.selection-floating-bar-item')).toHaveLength(3);
  });

  it('回归:浮条和按钮宽度按内容收缩,不被主题按钮规则撑满', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection stableTick={1} onPick={() => {}} />);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const bar = host.querySelector('.selection-floating-bar');
    const item = host.querySelector('.selection-floating-bar-item');

    expect(bar).not.toBeNull();
    expect((bar as HTMLElement).style.width).toBe('max-content');
    expect((bar as HTMLElement).style.maxWidth).toBe('calc(100vw - 12px)');
    expect((item as HTMLElement).style.flex).toBe('0 0 auto');
    expect((item as HTMLElement).style.width).toBe('auto');
  });

  it('点动作按钮 → onPick(action, origin) 带视口坐标', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection stableTick={1} onPick={onPick} />);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const buttons = host.querySelectorAll('.selection-floating-bar-item');
    act(() => {
      (buttons[0] as HTMLButtonElement).click();
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBe('polish');
    expect(onPick.mock.calls[0][1]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  });

    it('最后一个 action 按钮仍是 review,接着是 ⋯ 更多子按钮(onDismissSession / onHideGlobally)', () => {
    const onPick = vi.fn();
    const onDismissSession = vi.fn();
    const onHideGlobally = vi.fn();
    act(() => {
      root.render(
        <SelectionFloatingBar
          rect={mkRect()}
          hasSelection
          stableTick={1}
          onPick={onPick}
          onDismissSession={onDismissSession}
          onHideGlobally={onHideGlobally}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(200); });
    const items = host.querySelectorAll('.selection-floating-bar-item');
    // 3 actions + 1 more(⋯) = 4
    expect(items).toHaveLength(4);
    // index 2 仍是 review
    act(() => { (items[2] as HTMLButtonElement).click(); });
    expect(onPick.mock.calls[0][0]).toBe('review');
    // index 3 是 ⋯ 按钮
    const moreBtn = items[3] as HTMLButtonElement;
    expect(moreBtn.textContent).toContain('⋯');
    // Menu 交互(visible-after-mouseenter)留手测(jsx-dom 无法模拟 state update)
    expect(moreBtn).toBeTruthy();
    // aria-haspopup / aria-expanded 给屏幕阅读器
    expect(moreBtn.getAttribute('aria-haspopup')).toBe('menu');
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('未传 onDismissSession / onHideGlobally 时不渲染 ⋯', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection stableTick={1} onPick={() => {}} />);
    });
    act(() => { vi.advanceTimersByTime(200); });
    expect(host.querySelector('.selection-floating-bar-more')).toBeNull();
    expect(host.querySelectorAll('.selection-floating-bar-item')).toHaveLength(3);
  });

  it('选区消失(rect 变 null)→ 浮条立即隐藏', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection stableTick={1} onPick={() => {}} />);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(host.querySelector('.selection-floating-bar')).not.toBeNull();
    act(() => {
      root.render(<SelectionFloatingBar rect={null} hasSelection={false} stableTick={1} onPick={() => {}} />);
    });
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
  });

  it('Esc 隐藏当前选区的浮条', () => {
    act(() => {
      root.render(<SelectionFloatingBar rect={mkRect()} hasSelection stableTick={1} onPick={() => {}} />);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(host.querySelector('.selection-floating-bar')).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(host.querySelector('.selection-floating-bar')).toBeNull();
  });
});
