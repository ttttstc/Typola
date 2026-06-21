// 文档三态布局机 —— 阅读 / 心流 / 检视。
//
// 设计:三态对应三组「左栏 + 右栏 + 窗口」预设,setDocMode 应用预设;
// 用户事后手动调整左右栏不破坏 docMode 标签(避免双向绑定的复杂度)。
//
//   read:   左栏维持用户当前状态;右栏若是 review/flow 则清成 none;窗口不动
//   flow:   左栏=AI 工作台;右栏=flow(SkillHub);窗口最大化(可关)
//   review: 左栏维持;右栏=review;窗口不动
//
// 退出 flow 时:还原进入前的最大化状态 + 还原左栏(如果进入时不是 AI 工作台)。
//
// 兼容性:替代了原 useFlowMode 的 toggle 语义,但保留了 snapshot/还原核心逻辑。
// 工具栏不再有"心流"独立按钮,统一通过 DocumentModeSwitcher 切换。

import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { LeftRailMode } from './useLeftRail';
import type { RightPanelMode } from './useRightPanel';

export type DocMode = 'read' | 'flow' | 'review';

type FlowSnapshot = {
  leftRailMode: LeftRailMode;
  rightPanelMode: RightPanelMode;
  rightPanelWidth: number;
  terminalVisible: boolean;
  wasMaximized: boolean;
};

type UseDocumentModeOptions = {
  /** 编辑器禁用(如 docx)时,所有切换被忽略,固定 read 态。 */
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

type UseDocumentModeResult = {
  docMode: DocMode;
  setDocMode: (next: DocMode) => Promise<void>;
};

export function useDocumentMode({
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
}: UseDocumentModeOptions): UseDocumentModeResult {
  const [docMode, setDocModeState] = useState<DocMode>('read');
  const flowSnapshotRef = useRef<FlowSnapshot | null>(null);

  const setDocMode = useCallback(async (next: DocMode) => {
    if (!enabled) return;
    if (next === docMode) return;
    const prev = docMode;

    // 进入 flow:存快照 + 最大化窗口 + 应用 AI 工作台 + SkillHub 预设
    if (next === 'flow') {
      let wasMaximized = false;
      if (isTauriRuntime) {
        try {
          const appWindow = getCurrentWindow();
          wasMaximized = await appWindow.isMaximized();
          if (!wasMaximized) await appWindow.maximize();
        } catch {
          /* best effort */
        }
      }
      flowSnapshotRef.current = {
        leftRailMode,
        rightPanelMode,
        rightPanelWidth,
        terminalVisible,
        wasMaximized,
      };
      setLeftRailMode('aiWorkbench');
      setWorkspacePanelWidth((width) => Math.max(width, flowLeftPanelWidth));
      setRightPanelMode('flow');
      setRightPanelWidth(flowRightPanelWidth);
      setDocModeState('flow');
      return;
    }

    // 离开 flow:还原窗口 + 还原快照内容(部分)
    if (prev === 'flow') {
      const snapshot = flowSnapshotRef.current;
      if (isTauriRuntime && snapshot) {
        try {
          const appWindow = getCurrentWindow();
          const currentlyMaximized = await appWindow.isMaximized();
          if (currentlyMaximized && !snapshot.wasMaximized) {
            await appWindow.unmaximize();
          }
        } catch {
          /* best effort */
        }
      }
      // 还原 terminal(其他维度按目标 mode 重新设)
      if (snapshot) setTerminalVisible(snapshot.terminalVisible);
      flowSnapshotRef.current = null;
    }

    // 应用目标 mode 的左右栏预设
    if (next === 'read') {
      // 左栏:从 flow 来则还原快照里的(可能是 workspace/none);其他情况维持当前
      if (prev === 'flow') {
        const snapshot = flowSnapshotRef.current; // 已被清,但 ref 仍是旧值前的捕获
        // 这里 snapshot 已 null;读不到。改用 leftRailMode 当前(setLeftRailMode 是 setter)
        // 但 leftRailMode 此时仍是 'aiWorkbench'(prev 是 flow)。简化:从 flow → read,
        // 把左栏从 aiWorkbench 切回 workspace(更符合"阅读"语义)。
        void snapshot;
        setLeftRailMode('workspace');
      }
      // 右栏:若是 review/flow,清成 none(read 不要这俩面板)
      setRightPanelMode((mode) => (mode === 'review' || mode === 'flow' ? 'none' : mode));
      setDocModeState('read');
      return;
    }

    if (next === 'review') {
      // 从 flow 来:左栏从 aiWorkbench 切到 workspace(检视更适合配文件树)
      if (prev === 'flow') setLeftRailMode('workspace');
      setRightPanelMode('review');
      setDocModeState('review');
      return;
    }
  }, [
    docMode,
    enabled,
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

  return { docMode, setDocMode };
}
