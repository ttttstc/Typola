import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { LeftRailMode } from './useLeftRail';
import type { RightPanelMode } from './useRightPanel';

type FlowSnapshot = {
  leftRailMode: LeftRailMode;
  rightPanelMode: RightPanelMode;
  rightPanelWidth: number;
  terminalVisible: boolean;
  maximized: boolean;
};

type UseFlowModeOptions = {
  enabled: boolean;
  isTauriRuntime: boolean;
  leftRailMode: LeftRailMode;
  setLeftRailMode: Dispatch<SetStateAction<LeftRailMode>>;
  rightPanelMode: RightPanelMode;
  setRightPanelMode: Dispatch<SetStateAction<RightPanelMode>>;
  rightPanelWidth: number;
  setRightPanelWidth: Dispatch<SetStateAction<number>>;
  terminalVisible: boolean;
  setTerminalVisible: Dispatch<SetStateAction<boolean>>;
  setWorkspacePanelWidth: Dispatch<SetStateAction<number>>;
  flowLeftPanelWidth: number;
  flowRightPanelWidth: number;
};

type UseFlowModeResult = {
  flowMode: boolean;
  setFlowMode: Dispatch<SetStateAction<boolean>>;
  handleToggleFlowMode: () => Promise<void>;
};

/**
 * Preserves the existing enter/exit flow-mode snapshot behavior as a dedicated hook.
 */
export function useFlowMode({
  enabled,
  isTauriRuntime,
  leftRailMode,
  setLeftRailMode,
  rightPanelMode,
  setRightPanelMode,
  rightPanelWidth,
  setRightPanelWidth,
  terminalVisible,
  setTerminalVisible,
  setWorkspacePanelWidth,
  flowLeftPanelWidth,
  flowRightPanelWidth,
}: UseFlowModeOptions): UseFlowModeResult {
  const [flowMode, setFlowMode] = useState(false);
  const flowSnapshotRef = useRef<FlowSnapshot | null>(null);

  const handleToggleFlowMode = useCallback(async () => {
    if (!enabled) return;

    if (!flowMode) {
      let maximized = false;
      if (isTauriRuntime) {
        try {
          const appWindow = getCurrentWindow();
          maximized = await appWindow.isMaximized();
          if (!maximized) await appWindow.maximize();
        } catch {
          // Preserve the old "best effort" maximize behavior.
        }
      }

      flowSnapshotRef.current = {
        leftRailMode,
        rightPanelMode,
        rightPanelWidth,
        terminalVisible,
        maximized,
      };

      // 心流模式默认让 AI 工作台占据左侧栏(文档驾驶舱形态),退出时 snapshot 还原原 mode
      setLeftRailMode('aiWorkbench');
      setWorkspacePanelWidth((width) => Math.max(width, flowLeftPanelWidth));
      setRightPanelMode('flow');
      setRightPanelWidth(flowRightPanelWidth);
      setFlowMode(true);
      return;
    }

    const snapshot = flowSnapshotRef.current;

    if (isTauriRuntime) {
      try {
        const appWindow = getCurrentWindow();
        const currentlyMaximized = await appWindow.isMaximized();
        if (currentlyMaximized && !snapshot?.maximized) {
          await appWindow.unmaximize();
        }
      } catch {
        // Preserve the old "best effort" restore behavior.
      }
    }

    if (snapshot) {
      setLeftRailMode(snapshot.leftRailMode);
      setRightPanelMode(snapshot.rightPanelMode);
      setRightPanelWidth(snapshot.rightPanelWidth);
      setTerminalVisible(snapshot.terminalVisible);
    } else {
      setRightPanelMode('none');
    }

    flowSnapshotRef.current = null;
    setFlowMode(false);
  }, [
    enabled,
    flowMode,
    flowLeftPanelWidth,
    flowRightPanelWidth,
    isTauriRuntime,
    leftRailMode,
    rightPanelMode,
    rightPanelWidth,
    setLeftRailMode,
    setRightPanelMode,
    setRightPanelWidth,
    setTerminalVisible,
    setWorkspacePanelWidth,
    terminalVisible,
  ]);

  return {
    flowMode,
    setFlowMode,
    handleToggleFlowMode,
  };
}
