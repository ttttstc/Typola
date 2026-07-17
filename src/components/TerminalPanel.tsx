import { Clipboard, Copy, Eraser, Maximize2, Plus, Square, X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
import { waitForPtyReady } from '../services/ptyReady';
import { resolveTerminalTheme } from '../services/themeRegistry';

export type TerminalPanelHandle = {
  startAgentTerminal: (opts: { command: string; cwd?: string }) => Promise<void>;
  sendText: (text: string) => void;
  hasAgentTerminal: () => boolean;
  focusAgentTerminal: () => void;
  fit: () => void;
};

type TerminalPanelProps = {
  visible: boolean;
  height: number;
  currentFilePath?: string;
  workspaceRoot?: string;
  createRequest: number;
  onHeightChange: (height: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  onHide: () => void;
};

type TerminalTab = {
  localId: string;
  termId?: number;
  title: string;
  cwd?: string;
  status: 'connecting' | 'ready' | 'exited' | 'error';
  error?: string;
  isAgent?: boolean;
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

export const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(function TerminalPanel({
  visible,
  height,
  currentFilePath,
  workspaceRoot,
  createRequest,
  onHeightChange,
  onResizeStart,
  onResizeEnd,
  onHide,
}: TerminalPanelProps, ref) {
  const settings = useSettings();
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeLocalId, setActiveLocalId] = useState<string | null>(null);
  const runtimesRef = useRef(new Map<string, TerminalRuntime>());
  const termIdToLocalIdRef = useRef(new Map<number, string>());
  const terminalSettingsRef = useRef(settings);
  const terminalOutputDecoderRef = useRef(new TextDecoder('utf-8'));
  const lastCreateRequestRef = useRef(0);
  const pendingAgentCommandRef = useRef<{ localId: string; command: string } | null>(null);

  useEffect(() => {
    terminalSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const encoding = settings.defaultEncoding === 'UTF-8' ? 'utf-8' : settings.defaultEncoding.toLowerCase();
    terminalOutputDecoderRef.current = new TextDecoder(encoding);
  }, [settings.defaultEncoding]);

  const decodeTerminalData = useCallback((data: number[] | Uint8Array) => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return terminalOutputDecoderRef.current.decode(bytes, { stream: true });
  }, []);

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
    if (!pendingAgentCommandRef.current || pendingAgentCommandRef.current.localId !== localId) {
      runtime.terminal.focus();
    }
  }, [fitRuntime]);

  const openNewTab = useCallback(async (opts?: { isAgent?: boolean; cwd?: string; title?: string }): Promise<void> => {
    const localId = createLocalId();
    const tabNumber = tabs.length + 1;
    const fitAddon = new FitAddon();
    const theme = resolveTerminalTheme(settings.themeId);
    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: settings.terminalCursorBlink,
      cursorStyle: settings.terminalCursorStyle,
      fontFamily: settings.terminalFontFamily,
      fontSize: settings.terminalFontSize,
      scrollback: 5000,
      theme,
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
        title: opts?.title ?? (opts?.isAgent ? 'Claude' : `terminal ${tabNumber}`),
        status: 'connecting',
        isAgent: opts?.isAgent,
      },
    ]);
    setActiveLocalId(localId);

    const cwd = opts?.cwd ?? workspaceRoot ?? directoryFromPath(currentFilePath);
    try {
      const result: TerminalCreateResult = await createTerminal({
        cwd,
        shell: settings.terminalShellPath.trim() || undefined,
        cols: terminal.cols,
        rows: terminal.rows,
      });
      const runtime = runtimesRef.current.get(localId);
      if (!runtime) return;
      runtime.termId = result.termId;
      termIdToLocalIdRef.current.set(result.termId, localId);
      setTabs((current) => current.map((tab) => (
        tab.localId === localId
          ? {
            ...tab,
            termId: result.termId,
            title: opts?.isAgent ? 'Claude' : (result.processName || tab.title),
            cwd: result.cwd,
            status: 'ready',
          }
          : tab
      )));
      fitRuntime(runtime);

      // 若是 agent 终端且有待执行命令,启动 claude
      const pending = pendingAgentCommandRef.current;
      if (opts?.isAgent && pending && pending.localId === localId) {
        await writeTerminal(result.termId, `${pending.command}\r`).catch((err) => {
          console.warn('Failed to launch agent in terminal:', err);
        });
        pendingAgentCommandRef.current = null;
        setTimeout(() => runtime.terminal.focus(), 50);
      }
    } catch (error) {
      const runtime = runtimesRef.current.get(localId);
      runtime?.terminal.writeln(`\r\nFailed to start terminal: ${String(error)}`);
      setTabs((current) => current.map((tab) => (
        tab.localId === localId ? { ...tab, status: 'error', error: String(error) }
          : tab
      )));
    }
  }, [
    currentFilePath,
    fitRuntime,
    settings.terminalCursorBlink,
    settings.terminalCursorStyle,
    settings.terminalFontFamily,
    settings.terminalFontSize,
    settings.terminalShellPath,
    settings.themeId,
    tabs.length,
    workspaceRoot,
  ]);

  useEffect(() => {
    const theme = resolveTerminalTheme(settings.themeId);
    for (const runtime of runtimesRef.current.values()) {
      runtime.terminal.options.theme = theme;
      runtime.terminal.refresh(0, Math.max(0, runtime.terminal.rows - 1));
    }
  }, [settings.themeId]);

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
    onResizeStart();
    const startY = event.clientY;
    const startHeight = height;
    let latestClientY = startY;
    let frameId: number | null = null;
    let finished = false;

    const updateHeight = (clientY: number) => {
      onHeightChange(clampHeight(startHeight - (clientY - startY)));
    };
    const flushHeight = () => {
      frameId = null;
      updateHeight(latestClientY);
    };
    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestClientY = moveEvent.clientY;
      if (frameId === null) frameId = window.requestAnimationFrame(flushHeight);
    };
    const finishResize = () => {
      if (finished) return;
      finished = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      updateHeight(latestClientY);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      window.removeEventListener('blur', finishResize);
      onResizeEnd();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
    window.addEventListener('blur', finishResize);
  }, [height, onHeightChange, onResizeEnd, onResizeStart]);

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
      runtimesRef.current.get(localId)?.terminal.write(decodeTerminalData(payload.data));
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
  }, [decodeTerminalData]);

  useEffect(() => () => {
    for (const runtime of runtimesRef.current.values()) {
      if (runtime.termId) void killTerminal(runtime.termId);
      runtime.terminal.dispose();
    }
    runtimesRef.current.clear();
    termIdToLocalIdRef.current.clear();
  }, []);

  // ========== Expose handle to parent via ref ==========
  useImperativeHandle(ref, () => ({
    startAgentTerminal: async (opts: { command: string; cwd?: string }) => {
      // 只把真正 ready 的 agent tab 算"已存在";exited/error/connecting 都重起
      const existing = tabs.find((tab) => tab.isAgent && tab.status === 'ready' && tab.termId);
      if (existing) {
        setActiveLocalId(existing.localId);
        const runtime = runtimesRef.current.get(existing.localId);
        runtime?.terminal.focus();
        return;
      }

      // 旧 agent tab 存在但死了,先关掉再开新的(否则 claude 进程已 exit,inject 会落到空 pty)
      const stale = tabs.find((tab) => tab.isAgent);
      if (stale) closeTab(stale.localId);

      const localId = createLocalId();
      pendingAgentCommandRef.current = { localId, command: opts.command };
      // 等 PTY 创建 + claude 命令写入完成,然后用 PTY 输出静默检测等真正就绪
      // (替代 1200ms 墙钟猜测;spec §0.1 不解析 TUI)
      // 已知边界:claude 首启对该目录弹 trust/权限确认时,自动注入可能把命令当成 prompt 答案——
      // 这是自动注入固有边界,与检测方式无关;Phase 2 再考虑「首启只启动不注入」
      await openNewTab({ isAgent: true, cwd: opts.cwd, title: 'Claude' });
      const termId = runtimesRef.current.get(localId)?.termId;
      if (termId !== undefined) {
        await waitForPtyReady(onTerminalData, termId, 250, 5000);
      }
    },
    sendText: (text: string) => {
      const agentTab = tabs.find((tab) => tab.isAgent);
      if (!agentTab?.termId) {
        console.warn('sendText called without active agent terminal');
        return;
      }
      // 写裸文本:bracketed paste 包裹由调用方负责(spec §10),不在此层重复包裹
      void writeTerminal(agentTab.termId, text);
    },
    hasAgentTerminal: () => {
      return tabs.some((tab) => tab.isAgent && tab.status !== 'exited' && tab.status !== 'error');
    },
    focusAgentTerminal: () => {
      const agentTab = tabs.find((tab) => tab.isAgent);
      if (!agentTab) return;
      setActiveLocalId(agentTab.localId);
      const runtime = runtimesRef.current.get(agentTab.localId);
      runtime?.terminal.focus();
    },
    fit: () => {
      const runtime = getActiveRuntime();
      if (runtime) fitRuntime(runtime);
    },
  }), [closeTab, fitRuntime, getActiveRuntime, openNewTab, tabs]);

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
              className={`terminal-tab ${tab.localId === activeLocalId ? 'active' : ''} ${tab.status} ${tab.isAgent ? 'agent' : ''}`}
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
          <button type="button" onClick={() => openNewTab()} title="新建终端">
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
            <button type="button" onClick={() => openNewTab()}>打开终端</button>
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
});
