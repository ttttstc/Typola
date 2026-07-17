// @vitest-environment jsdom
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDocumentMode, type DocMode } from './useDocumentMode';
import type { LeftRailMode } from './useLeftRail';
import type { RightPanelMode } from './useRightPanel';

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useDocumentMode', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('进入检视模式时收起左侧栏', async () => {
    let setMode: ((mode: DocMode) => Promise<void>) | undefined;
    let currentLeftRail: LeftRailMode = 'workspace';

    function Harness() {
      const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>('workspace');
      const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');
      const [rightPanelWidth, setRightPanelWidth] = useState(480);
      const [terminalVisible, setTerminalVisible] = useState(false);
      const [, setWorkspacePanelWidth] = useState(320);
      const result = useDocumentMode({
        enabled: true,
        isTauriRuntime: false,
        leftRailMode,
        setLeftRailMode,
        rightPanelMode,
        setRightPanelMode,
        rightPanelWidth,
        setRightPanelWidth,
        terminalVisible,
        setTerminalVisible,
        setWorkspacePanelWidth,
        flowLeftPanelWidth: 420,
        flowRightPanelWidth: 420,
      });
      useEffect(() => {
        setMode = result.setDocMode;
        currentLeftRail = leftRailMode;
      }, [leftRailMode, result.setDocMode]);
      return null;
    }

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Harness />));
    await act(async () => setMode!('review'));

    expect(currentLeftRail).toBe('none');
  });
});
