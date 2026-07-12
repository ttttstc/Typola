import { useCallback, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';

export type LeftRailMode = 'none' | 'workspace' | 'aiWorkbench';

type UseLeftRailOptions = {
  aiWorkbenchEnabled: boolean;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  initialMode?: LeftRailMode;
};

type UseLeftRailResult = {
  leftRailMode: LeftRailMode;
  setLeftRailMode: Dispatch<SetStateAction<LeftRailMode>>;
  workspacePanelWidth: number;
  setWorkspacePanelWidth: Dispatch<SetStateAction<number>>;
  leftResizing: LeftRailMode;
  handleTogglePrimaryPanel: () => void;
  handleToggleWorkspacePanel: () => void;
  handleToggleAiPanel: () => void;
  handleLeftPanelResizerPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/**
 * Owns left-rail visibility and resizing state without changing AppLayout behavior.
 */
export function useLeftRail({
  aiWorkbenchEnabled,
  defaultWidth,
  minWidth,
  maxWidth,
  initialMode = 'none',
}: UseLeftRailOptions): UseLeftRailResult {
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>(initialMode);
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(defaultWidth);
  const [leftResizing, setLeftResizing] = useState<LeftRailMode>('none');

  const handleTogglePrimaryPanel = useCallback(() => {
    setLeftRailMode((mode) => mode === 'none' ? 'workspace' : 'none');
  }, []);

  const handleToggleWorkspacePanel = useCallback(() => {
    setLeftRailMode((mode) => mode === 'workspace' ? 'none' : 'workspace');
  }, []);

  const handleToggleAiPanel = useCallback(() => {
    if (!aiWorkbenchEnabled) return;
    setLeftRailMode((mode) => mode === 'aiWorkbench' ? 'none' : 'aiWorkbench');
  }, [aiWorkbenchEnabled]);

  const handleLeftPanelResizerPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (leftRailMode === 'none') return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = workspacePanelWidth;
    setLeftResizing('workspace');

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        maxWidth,
        Math.max(minWidth, startWidth + moveEvent.clientX - startX),
      );
      setWorkspacePanelWidth(nextWidth);
    };

    const handlePointerUp = () => {
      setLeftResizing('none');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [leftRailMode, maxWidth, minWidth, workspacePanelWidth]);

  return {
    leftRailMode,
    setLeftRailMode,
    workspacePanelWidth,
    setWorkspacePanelWidth,
    leftResizing,
    handleTogglePrimaryPanel,
    handleToggleWorkspacePanel,
    handleToggleAiPanel,
    handleLeftPanelResizerPointerDown,
  };
}
