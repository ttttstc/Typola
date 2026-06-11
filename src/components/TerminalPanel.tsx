import { Clipboard, Copy, Eraser, Maximize2, Plus, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useSettings } from '../hooks/useSettings';
import {
  clearTerminal,
  createTerminal,
  directoryFromPath,
  killTerminal,
  onTerminalData,
  onTerminalExit,
  resizeTerminal,
  writeTerminal,
  type TerminalCreateResult,
} from '../services/terminalService';

type TerminalPanelProps = {
  visible: boolean;
  height: number;
  currentFilePath?: string;
  createRequest: number;
  onHeightChange: (height: number) => void;
  onHide: () => void;
};

type TerminalTab = {
  localId: string;
  termId?: number;
  title: string;
  cwd?: string;
  status: 'connecting' | 'ready' | 'exited' | 'error';
  error?: string;
};

type TerminalRuntime = {
  terminal: XTerm;
  fitAddon: FitAddon;
  opened: boolean;
  termId?: number;
};

const MIN_HEIGHT = 180;
const MAX_HEIGHT = 520;

function createLocalId(): string {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampHeight(value: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));
}

export function TerminalPanel({
  visible,
  height,
  currentFilePath,
  createRequest,
  onHeightChange,
  onHide,
}: TerminalPanelProps) {
  const settings = useSettings();
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeLocalId, setActiveLocalId] = useState<string | null>(null);
  const runtimesRef = useRef(new Map<string, TerminalRuntime>());
  const termIdToLocalIdRef = useRef(new Map<number, string>());
  const terminalSettingsRef = useRef(settings);
  const lastCreateRequestRef = useRef(0);

  useEffect(() => {
    terminalSettingsRef.current = settings;
  }, [settings]);

  const fitRuntime = useCallback((runtime: TerminalRuntime) => {
    try {
      runtime.fitAddon.fit();
      if (runtime.termId) {
        void resizeTerminal(runtime.termId, runtime.terminal.cols, runtime.terminal.rows);
      }
    } catch (error) {
      console.warn('Failed to fit terminal:', error);
    }
  }, []);

  const attachTerminal = useCallback((localId: string, node: HTMLDivElement | null) => {
    if (!node) return;
    const runtime = runtimesRef.current.get(localId);
    if (!runtime || runtime.opened) return;

    runtime.terminal.open(node);
    runtime.opened = true;
    fitRuntime(runtime);
    runtime.terminal.focus();
  }, [fitRuntime]);

  const openNewTab = useCallback(() => {
    const localId = createLocalId();
    const tabNumber = tabs.length + 1;
    const fitAddon = new FitAddon();
    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: settings.terminalCursorBlink,
      cursorStyle: settings.terminalCursorStyle,
      fontFamily: settings.terminalFontFamily,
      fontSize: settings.terminalFontSize,
      scrollback: 5000,
      theme: settings.theme === 'dark'
        ? { background: '#1f1d1a', foreground: '#f2ece3', cursor: '#f0b06d' }
        : { background: '#fffdfa', foreground: '#2c2924', cursor: '#9f5137' },
    });

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => {
      window.open(uri, '_blank', 'noopener,noreferrer');
    }));
    terminal.onData((data) => {
      const runtime = runtimesRef.current.get(localId);
      if (runtime?.termId) void writeTerminal(runtime.termId, data);
    });
    terminal.writeln('Starting terminal...');

    runtimesRef.current.set(localId, { terminal, fitAddon, opened: false });
    setTabs((current) => [
      ...current,
      {
        localId,
        title: `terminal ${tabNumber}`,
        status: 'connecting',
      },
    ]);
    setActiveLocalId(localId);

    void createTerminal({
      cwd: directoryFromPath(currentFilePath),
      shell: settings.terminalShellPath.trim() || undefined,
      cols: terminal.cols,
      rows: terminal.rows,
    })
      .then((result: TerminalCreateResult) => {
        const runtime = runtimesRef.current.get(localId);
        if (!runtime) return;
        runtime.termId = result.termId;
        termIdToLocalIdRef.current.set(result.termId, localId);
        setTabs((current) => current.map((tab) => (
          tab.localId === localId
            ? {
              ...tab,
              termId: result.termId,
              title: result.processName || tab.title,
              cwd: result.cwd,
              status: 'ready',
            }
            : tab
        )));
        fitRuntime(runtime);
      })
      .catch((error) => {
        const runtime = runtimesRef.current.get(localId);
        runtime?.terminal.writeln(`\r\nFailed to start terminal: ${String(error)}`);
        setTabs((current) => current.map((tab) => (
          tab.localId === localId
            ? { ...tab, status: 'error', error: String(error) }
            : tab
        )));
      });
  }, [
    currentFilePath,
    fitRuntime,
    settings.terminalCursorBlink,
    settings.terminalCursorStyle,
    settings.terminalFontFamily,
    settings.terminalFontSize,
    settings.terminalShellPath,
    settings.theme,
    tabs.length,
  ]);

  const closeTab = useCallback((localId: string) => {
    const runtime = runtimesRef.current.get(localId);
    if (runtime?.termId) {
      void killTerminal(runtime.termId).catch((error) => console.warn('Failed to kill terminal:', error));
      termIdToLocalIdRef.current.delete(runtime.termId);
    }
    runtime?.terminal.dispose();
    runtimesRef.current.delete(localId);
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.localId === localId);
      const next = current.filter((tab) => tab.localId !== localId);
      if (activeLocalId === localId) {
        setActiveLocalId(next[Math.max(0, index - 1)]?.localId ?? next[0]?.localId ?? null);
      }
      return next;
    });
  }, [activeLocalId]);

  const activeTab = tabs.find((tab) => tab.localId === activeLocalId);

  const getActiveRuntime = useCallback(() => (
    activeLocalId ? runtimesRef.current.get(activeLocalId) : undefined
  ), [activeLocalId]);

  const handleClear = useCallback(() => {
    const activeRuntime = getActiveRuntime();
    if (!activeRuntime) return;
    activeRuntime.terminal.clear();
    if (activeRuntime.termId) void clearTerminal(activeRuntime.termId);
  }, [getActiveRuntime]);

  const handleCopy = useCallback(() => {
    const activeRuntime = getActiveRuntime();
    const selection = activeRuntime?.terminal.getSelection();
    if (selection) void navigator.clipboard?.writeText(selection);
  }, [getActiveRuntime]);

  const handlePaste = useCallback(async () => {
    const activeRuntime = getActiveRuntime();
    if (!activeRuntime?.termId || !navigator.clipboard) return;
    const text = await navigator.clipboard.readText();
    if (!text) return;
    if (
      terminalSettingsRef.current.terminalConfirmMultilinePaste
      && text.includes('\n')
      && !window.confirm('要粘贴多行内容到终端吗？')
    ) {
      return;
    }
    await writeTerminal(activeRuntime.termId, text);
  }, [getActiveRuntime]);

  const handleSelectAll = useCallback(() => {
    const activeRuntime = getActiveRuntime();
    activeRuntime?.terminal.selectAll();
  }, [getActiveRuntime]);

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      onHeightChange(clampHeight(startHeight - (moveEvent.clientY - startY)));
    };
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [height, onHeightChange]);

  useEffect(() => {
    if (!visible) return;
    if (tabs.length === 0) openNewTab();
    window.setTimeout(() => {
      const runtime = activeLocalId ? runtimesRef.current.get(activeLocalId) : undefined;
      if (runtime) fitRuntime(runtime);
    }, 0);
  }, [activeLocalId, fitRuntime, openNewTab, tabs.length, visible]);

  useEffect(() => {
    if (!visible || createRequest === lastCreateRequestRef.current) return;
    lastCreateRequestRef.current = createRequest;
    openNewTab();
  }, [createRequest, openNewTab, visible]);

  useEffect(() => {
    const handleResize = () => {
      const runtime = activeLocalId ? runtimesRef.current.get(activeLocalId) : undefined;
      if (runtime) fitRuntime(runtime);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeLocalId, fitRuntime]);

  useEffect(() => {
    let unlistenData: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    let cancelled = false;

    void onTerminalData((payload) => {
      const localId = termIdToLocalIdRef.current.get(payload.termId);
      if (!localId) return;
      runtimesRef.current.get(localId)?.terminal.write(payload.data);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenData = unlisten;
    });

    void onTerminalExit((payload) => {
      const localId = termIdToLocalIdRef.current.get(payload.termId);
      if (!localId) return;
      const runtime = runtimesRef.current.get(localId);
      runtime?.terminal.writeln(`\r\n[process exited${payload.exitCode == null ? '' : ` with code ${payload.exitCode}`}]`);
      setTabs((current) => current.map((tab) => (
        tab.localId === localId ? { ...tab, status: 'exited' } : tab
      )));
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenExit = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenData?.();
      unlistenExit?.();
    };
  }, []);

  useEffect(() => () => {
    for (const runtime of runtimesRef.current.values()) {
      if (runtime.termId) void killTerminal(runtime.termId);
      runtime.terminal.dispose();
    }
    runtimesRef.current.clear();
    termIdToLocalIdRef.current.clear();
  }, []);

  if (!visible) return null;

  return (
    <section className="terminal-panel" style={{ height }} aria-label="终端">
      <div
        className="terminal-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={MAX_HEIGHT}
        aria-valuenow={height}
        onPointerDown={handleResizePointerDown}
        onDoubleClick={() => onHeightChange(300)}
      />
      <div className="terminal-header">
        <div className="terminal-tabs" role="tablist" aria-label="终端标签">
          {tabs.map((tab) => (
            <div
              key={tab.localId}
              role="tab"
              className={`terminal-tab ${tab.localId === activeLocalId ? 'active' : ''} ${tab.status}`}
              title={tab.cwd ?? tab.error ?? tab.title}
            >
              <button type="button" className="terminal-tab-main" onClick={() => setActiveLocalId(tab.localId)}>
                <span>{tab.title}</span>
              </button>
              <button
                type="button"
                className="terminal-tab-close"
                aria-label={`关闭 ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.localId);
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="terminal-actions">
          <button type="button" onClick={openNewTab} title="新建终端">
            <Plus size={15} />
          </button>
          <button type="button" onClick={handleCopy} title="复制选中内容" disabled={!activeTab}>
            <Copy size={15} />
          </button>
          <button type="button" onClick={handlePaste} title="粘贴" disabled={!activeTab}>
            <Clipboard size={15} />
          </button>
          <button type="button" onClick={handleSelectAll} title="全选" disabled={!activeTab}>
            <Maximize2 size={15} />
          </button>
          <button type="button" onClick={handleClear} title="清屏" disabled={!activeTab}>
            <Eraser size={15} />
          </button>
          <button type="button" onClick={onHide} title="隐藏终端">
            <Square size={14} />
          </button>
        </div>
      </div>
      <div className="terminal-body">
        {tabs.length === 0 && (
          <div className="terminal-empty">
            <button type="button" onClick={openNewTab}>打开终端</button>
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.localId}
            className={`terminal-session ${tab.localId === activeLocalId ? 'active' : ''}`}
            ref={(node) => attachTerminal(tab.localId, node)}
          />
        ))}
      </div>
      {activeTab?.cwd && <div className="terminal-cwd">{activeTab.cwd}</div>}
    </section>
  );
}
