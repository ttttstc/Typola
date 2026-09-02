import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';

export type RightPanelMode = 'none' | 'word' | 'wechat' | 'flow' | 'review' | 'artifacts' | 'toc';

type UseRightPanelOptions = {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  minWidth: number;
  maxWidth: number;
  getDefaultRightPanelWidth: () => number;
  /** 拖拽结束回调（携带最终宽度），供调用方按模式持久化（issue #264 检视模式）。 */
  onResizeEnd?: (width: number) => void;
};

type UseRightPanelResult = {
  rightPanelMode: RightPanelMode;
  setRightPanelMode: Dispatch<SetStateAction<RightPanelMode>>;
  rightPanelCollapsed: boolean;
  toggleRightPanelCollapsed: () => void;
  rightPanelWidth: number;
  setRightPanelWidth: Dispatch<SetStateAction<number>>;
  resizing: boolean;
  handleRightPanelResizerPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/**
 * Keeps right-side preview/workflow panel sizing logic isolated from AppLayout.
 */
export function useRightPanel({
  containerRef,
  minWidth,
  maxWidth,
  getDefaultRightPanelWidth,
  onResizeEnd,
}: UseRightPanelOptions): UseRightPanelResult {
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [resizing, setResizing] = useState(false);
  // latest-ref 转发回调，避免拖拽闭包拿到过期引用。
  const onResizeEndRef = useRef(onResizeEnd);
  useEffect(() => {
    onResizeEndRef.current = onResizeEnd;
  });

  useEffect(() => {
    if (rightPanelMode === 'none') return;

    const handleResize = () => {
      setRightPanelWidth(getDefaultRightPanelWidth());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getDefaultRightPanelWidth, rightPanelMode]);

  // 切换面板模式时自动取消折叠，避免打开新面板仍是隐藏态。
  useEffect(() => {
    if (rightPanelMode !== 'none') setRightPanelCollapsed(false);
  }, [rightPanelMode]);

  const toggleRightPanelCollapsed = useCallback(() => {
    if (rightPanelMode === 'none') return;
    setRightPanelCollapsed((collapsed) => !collapsed);
  }, [rightPanelMode]);

  const handleRightPanelResizerPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    event.preventDefault();
    setResizing(true);
    const containerRect = container.getBoundingClientRect();
    const rightEdge = containerRect.right;
    const maxAllowedWidth = Math.min(maxWidth, Math.round(containerRect.width * 0.5));
    let latestClientX = event.clientX;
    let frameId: number | null = null;
    let finished = false;

    const updateWidth = (clientX: number) => {
      const nextWidth = rightEdge - clientX;
      const clamped = Math.min(maxAllowedWidth, Math.max(minWidth, nextWidth));
      setRightPanelWidth(clamped);
      return clamped;
    };

    updateWidth(event.clientX);

    const flushWidth = () => {
      frameId = null;
      updateWidth(latestClientX);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestClientX = moveEvent.clientX;
      if (frameId === null) frameId = window.requestAnimationFrame(flushWidth);
    };

    const finishResize = () => {
      if (finished) return;
      finished = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      const finalWidth = updateWidth(latestClientX);
      setResizing(false);
      onResizeEndRef.current?.(finalWidth);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      window.removeEventListener('blur', finishResize);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
    window.addEventListener('blur', finishResize);
  }, [containerRef, maxWidth, minWidth]);

  return {
    rightPanelMode,
    setRightPanelMode,
    rightPanelCollapsed,
    toggleRightPanelCollapsed,
    rightPanelWidth,
    setRightPanelWidth,
    resizing,
    handleRightPanelResizerPointerDown,
  };
}
