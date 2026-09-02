// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePaneResize } from './usePaneResize';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 的 rAF 是异步定时器。用微任务模拟"下一帧":
// act(await) 会冲刷微任务,且赋值顺序与真实 rAF 一致(先返回 id,回调后跑)。
const originalRaf = window.requestAnimationFrame;
const originalCancelRaf = window.cancelAnimationFrame;
beforeEach(() => {
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
});

afterEach(() => {
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancelRaf;
});

type Api = ReturnType<typeof usePaneResize>;

function Harness({ expose, onMove, onEnd }: {
  expose: (api: Api) => void;
  onMove: (clientX: number) => void;
  onEnd?: () => void;
}) {
  const api = usePaneResize({ onMove, onEnd });
  expose(api);
  return (
    <div
      data-resizing={String(api.isResizing)}
      onPointerDown={api.handlePointerDown}
    />
  );
}

function fire(target: EventTarget, type: string, clientX: number, button = 0): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button }));
}

describe('usePaneResize — 通用分栏拖拽管线 (issue #264)', () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: Api | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    api = undefined;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('拖动期间按帧回调 onMove,松手后触发 onEnd 并复位 isResizing', async () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    act(() => root.render(
      <Harness expose={(next) => { api = next; }} onMove={onMove} onEnd={onEnd} />,
    ));

    const handle = host.firstElementChild as HTMLElement;
    expect(handle.getAttribute('data-resizing')).toBe('false');

    act(() => fire(handle, 'pointerdown', 100));
    expect(api?.isResizing).toBe(true);

    // 同一帧内的多次 pointermove 合并为一次 onMove,携带最新 clientX。
    await act(async () => {
      fire(window, 'pointermove', 160);
      fire(window, 'pointermove', 220);
    });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenLastCalledWith(220);

    // 下一帧的移动再次生效。
    await act(async () => { fire(window, 'pointermove', 300); });
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMove).toHaveBeenLastCalledWith(300);

    await act(async () => { fire(window, 'pointerup', 300); });
    expect(onEnd).toHaveBeenCalledOnce();
    expect(api?.isResizing).toBe(false);
  });

  it('pointercancel 与松手等价,同样清理并触发 onEnd', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    act(() => root.render(
      <Harness expose={(next) => { api = next; }} onMove={onMove} onEnd={onEnd} />,
    ));

    const handle = host.firstElementChild as HTMLElement;
    act(() => fire(handle, 'pointerdown', 40));
    act(() => fire(window, 'pointermove', 90));
    act(() => fire(window, 'pointercancel', 90));

    expect(onEnd).toHaveBeenCalledOnce();
    expect(api?.isResizing).toBe(false);
  });

  it('忽略非主键按下,不进入拖拽', () => {
    const onMove = vi.fn();
    act(() => root.render(
      <Harness expose={(next) => { api = next; }} onMove={onMove} />,
    ));

    const handle = host.firstElementChild as HTMLElement;
    act(() => fire(handle, 'pointerdown', 100, 2));
    expect(api?.isResizing).toBe(false);

    act(() => fire(window, 'pointermove', 160));
    expect(onMove).not.toHaveBeenCalled();
  });
});
