import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';

export type RightPanelMode = 'none' | 'word' | 'wechat' | 'flow' | 'review' | 'artifacts' | 'toc';

type UseRightPanelOptions = {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  minWidth: number;
  maxWidth: number;
  getDefaultRightPanelWidth: () => number;
};

type UseRightPanelResult = {
  rightPanelMode: RightPanelMode;
  setRightPanelMode: Dispatch<SetStateAction<RightPanelMode>>;
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
}: UseRightPanelOptions): UseRightPanelResult {
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (rightPanelMode === 'none') return;

    const handleResize = () => {
      setRightPanelWidth(getDefaultRightPanelWidth());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getDefaultRightPanelWidth, rightPanelMode]);

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
      setRightPanelWidth(Math.min(maxAllowedWidth, Math.max(minWidth, nextWidth)));
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
      updateWidth(latestClientX);
      setResizing(false);
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
    rightPanelWidth,
    setRightPanelWidth,
    resizing,
    handleRightPanelResizerPointerDown,
  };
}
