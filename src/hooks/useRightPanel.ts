import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';

export type RightPanelMode = 'none' | 'word' | 'wechat' | 'flow' | 'review' | 'artifacts' | 'htmlPreview';

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

    const updateWidth = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const maxAllowedWidth = Math.min(maxWidth, Math.round(rect.width * 0.5));
      const nextWidth = rect.right - clientX;
      setRightPanelWidth(Math.min(maxAllowedWidth, Math.max(minWidth, nextWidth)));
    };

    updateWidth(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateWidth(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
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
