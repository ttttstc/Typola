import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type UsePaneResizeOptions = {
  /** 拖动中每帧回调（rAF 节流）：收到最新 clientX，由调用方换算成宽度或比例。 */
  onMove: (clientX: number) => void;
  /** 拖动结束（松手 / pointercancel）回调，用于持久化最终值。 */
  onEnd?: () => void;
};

type UsePaneResizeResult = {
  isResizing: boolean;
  handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/**
 * 分栏拖拽的通用指针管线：rAF 节流 + pointerup/pointercancel/blur 统一清理，
 * 与 useLeftRail 的 resizer 行为保持一致。
 * 宽度 / 比例的换算与 clamp 由调用方在 onMove 里完成，
 * 避免大纲栏、检视分栏各自实现一套事件清理逻辑（issue #264 实现原则）。
 */
export function usePaneResize({ onMove, onEnd }: UsePaneResizeOptions): UsePaneResizeResult {
  const [isResizing, setIsResizing] = useState(false);
  // 用 ref 转发回调，保证拖动过程中总能拿到最新闭包（如 dragWidth 局部状态）。
  // 在 effect 中同步而不是 render 期写 ref（react-hooks/refs）。
  const onMoveRef = useRef(onMove);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onMoveRef.current = onMove;
    onEndRef.current = onEnd;
  });

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setIsResizing(true);
    let latestClientX = event.clientX;
    let frameId: number | null = null;

    const flush = () => {
      frameId = null;
      onMoveRef.current(latestClientX);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestClientX = moveEvent.clientX;
      if (frameId === null) frameId = window.requestAnimationFrame(flush);
    };

    const finish = () => {
      // 松手时若还有未执行的 rAF 帧，先同步提交最后一次移动再结束，
      // 否则快速拖动后立即松手会丢失最终位置（PR #265 检视意见）。
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        flush();
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      setIsResizing(false);
      onEndRef.current?.();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    // 拖出窗口后松开时本窗口收不到 pointerup/pointercancel，
    // 失焦时强制收尾（与 useLeftRail / useRightPanel 的 blur 处理一致）。
    window.addEventListener('blur', finish);
  }, []);

  return { isResizing, handlePointerDown };
}
