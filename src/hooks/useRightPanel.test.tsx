// @vitest-environment jsdom
import { act, createRef, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useRightPanel, type RightPanelMode } from './useRightPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useRightPanel', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('折叠只改变显示状态，不修改右栏模式', async () => {
    let setMode: ((mode: RightPanelMode) => void) | undefined;
    let toggleCollapsed: (() => void) | undefined;
    let currentMode: RightPanelMode = 'none';
    let collapsed = false;
    const containerRef = createRef<HTMLDivElement>();

    function Harness() {
      const panel = useRightPanel({
        containerRef,
        minWidth: 320,
        maxWidth: 760,
        getDefaultRightPanelWidth: () => 420,
      });
      useEffect(() => {
        setMode = panel.setRightPanelMode;
        toggleCollapsed = panel.toggleRightPanelCollapsed;
        currentMode = panel.rightPanelMode;
        collapsed = panel.rightPanelCollapsed;
      }, [panel]);
      return null;
    }

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Harness />));
    await act(async () => setMode!('review'));
    await act(async () => toggleCollapsed!());

    expect(currentMode).toBe('review');
    expect(collapsed).toBe(true);
  });

  it('关闭内容模式后重置折叠显示状态', async () => {
    let setMode: ((mode: RightPanelMode) => void) | undefined;
    let toggleCollapsed: (() => void) | undefined;
    let collapsed = false;
    const containerRef = createRef<HTMLDivElement>();

    function Harness() {
      const panel = useRightPanel({
        containerRef,
        minWidth: 320,
        maxWidth: 760,
        getDefaultRightPanelWidth: () => 420,
      });
      useEffect(() => {
        setMode = panel.setRightPanelMode;
        toggleCollapsed = panel.toggleRightPanelCollapsed;
        collapsed = panel.rightPanelCollapsed;
      }, [panel]);
      return null;
    }

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Harness />));
    await act(async () => setMode!('word'));
    await act(async () => toggleCollapsed!());
    expect(collapsed).toBe(true);
    await act(async () => setMode!('none'));
    expect(collapsed).toBe(false);
  });
});
