import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import {
  closeTerminalTab,
  markTerminalExited,
  openNewTerminalTab,
  useTerminalStore,
} from '../store/terminal';
import { useUIStore } from '../store/ui';
import {
  clampTerminalHeight,
  isTerminalCopyShortcut,
  isTerminalPasteShortcut,
} from '../shared/terminal';
import { getTerminalTheme, type AppTheme } from '../shared/terminal-theme';

interface TerminalRuntime {
  terminal: Terminal;
  fitAddon: FitAddon;
}

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

function isLinkSafe(url: string) {
  return /^https?:\/\//i.test(url);
}

function TabStatusPill({ status }: { status: 'connecting' | 'running' | 'exited' }) {
  const colors: Record<'connecting' | 'running' | 'exited', string> = {
    connecting: 'var(--color-muted)',
    running: 'var(--color-accent)',
    exited: '#d95c5c',
  };

  return (
    <span
      style={{
        width: '7px',
        height: '7px',
        borderRadius: '999px',
        background: colors[status],
        flexShrink: 0,
      }}
    />
  );
}

interface TerminalSessionViewProps {
  tabId: string;
  termId: number | null;
  shellPath: string;
  theme: AppTheme;
  active: boolean;
  visible: boolean;
  fontFamily: string;
  fontSize: number;
  cursorStyle: 'block' | 'bar' | 'underline';
  cursorBlink: boolean;
  shortcutPreset: 'windows' | 'linux';
  confirmMultilinePaste: boolean;
  registerRuntime: (tabId: string, runtime: TerminalRuntime | null) => void;
  onOpenContextMenu: (tabId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
}

function TerminalSessionView({
  tabId,
  termId,
  shellPath,
  theme,
  active,
  visible,
  fontFamily,
  fontSize,
  cursorStyle,
  cursorBlink,
  shortcutPreset,
  confirmMultilinePaste,
  registerRuntime,
  onOpenContextMenu,
}: TerminalSessionViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const latestRef = useRef({
    termId,
    shortcutPreset,
    confirmMultilinePaste,
    shellPath,
  });

  useEffect(() => {
    latestRef.current = {
      termId,
      shortcutPreset,
      confirmMultilinePaste,
      shellPath,
    };
  }, [confirmMultilinePaste, shellPath, shortcutPreset, termId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new Terminal({
      allowTransparency: true,
      cursorBlink,
      cursorStyle,
      fontFamily,
      fontSize,
      scrollback: 5000,
      theme: getTerminalTheme(theme),
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon((event, url) => {
      if (!(event.ctrlKey || event.metaKey) || !isLinkSafe(url)) {
        return;
      }

      void window.electronAPI.openExternal(url);
    });

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(container);
    terminal.onData((data) => {
      const currentTermId = latestRef.current.termId;
      if (currentTermId == null) {
        return;
      }

      void window.electronAPI.termWrite({ termId: currentTermId, data });
    });
    terminal.onResize(({ cols, rows }) => {
      const currentTermId = latestRef.current.termId;
      if (currentTermId == null) {
        return;
      }

      void window.electronAPI.termResize({ termId: currentTermId, cols, rows });
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') {
        return true;
      }

      if (isTerminalCopyShortcut(event, latestRef.current.shortcutPreset)) {
        if (terminal.hasSelection()) {
          void window.electronAPI.writeClipboardText(terminal.getSelection());
          terminal.clearSelection();
        } else if (latestRef.current.termId != null) {
          void window.electronAPI.termWrite({ termId: latestRef.current.termId, data: '\u0003' });
        }

        event.preventDefault();
        return false;
      }

      if (isTerminalPasteShortcut(event, latestRef.current.shortcutPreset)) {
        event.preventDefault();
        void (async () => {
          const currentTermId = latestRef.current.termId;
          if (currentTermId == null) {
            return;
          }

          const text = await window.electronAPI.readClipboardText();
          if (!text) {
            return;
          }

          if (latestRef.current.confirmMultilinePaste && /[\r\n]/.test(text)) {
            const confirmed = window.confirm(t('terminal.confirmMultilinePaste'));
            if (!confirmed) {
              return;
            }
          }

          terminal.focus();
          terminal.paste(text);
        })();
        return false;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        terminal.clear();
        if (latestRef.current.termId != null) {
          void window.electronAPI.termClear(latestRef.current.termId);
          void window.electronAPI.termWrite({
            termId: latestRef.current.termId,
            data: /(^|[\\/])cmd(\.exe)?$/i.test(latestRef.current.shellPath) ? 'cls\r' : 'clear\r',
          });
        }
        return false;
      }

      return true;
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    registerRuntime(tabId, { terminal, fitAddon });

    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    return () => {
      registerRuntime(tabId, null);
      fitAddon.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [registerRuntime, t, tabId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.fontFamily = fontFamily;
    terminal.options.fontSize = fontSize;
    terminal.options.cursorStyle = cursorStyle;
    terminal.options.cursorBlink = cursorBlink;
  }, [cursorBlink, cursorStyle, fontFamily, fontSize]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = getTerminalTheme(theme);
    terminal.refresh(0, Math.max(terminal.rows - 1, 0));
  }, [theme]);

  useEffect(() => {
    if (!active || !visible) {
      return;
    }

    let cancelled = false;

    const refitTerminal = () => {
      requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }

        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
      });
    };

    refitTerminal();

    if ('fonts' in document) {
      void Promise.allSettled([
        document.fonts.ready,
        document.fonts.load(`${fontSize}px ${fontFamily}`),
      ]).then(() => {
        if (!cancelled) {
          refitTerminal();
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [active, visible, fontFamily, fontSize]);

  useEffect(() => {
    if (termId == null) {
      return;
    }

    const cleanupData = window.electronAPI.onTerminalData(termId, (data) => {
      terminalRef.current?.write(data);
    });
    const cleanupExit = window.electronAPI.onTerminalExit(termId, (data) => {
      terminalRef.current?.writeln(
        `\r\n[${t('terminal.processExited', { code: data.exitCode })}]`
      );
      markTerminalExited(termId, data.exitCode);
    });

    return () => {
      cleanupData();
      cleanupExit();
    };
  }, [termId, t]);

  return (
    <div
      onContextMenu={(event) => onOpenContextMenu(tabId, event)}
      style={{
        display: active ? 'block' : 'none',
        height: '100%',
        padding: '8px 10px 10px',
      }}
    >
      <div
        ref={containerRef}
        aria-label={shellPath || 'terminal'}
        style={{
          height: '100%',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-sunken)',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

export function TerminalPanel() {
  const { t } = useTranslation();
  const tabs = useTerminalStore((state) => state.tabs);
  const activeTabId = useTerminalStore((state) => state.activeTabId);
  const setActiveTab = useTerminalStore((state) => state.setActiveTab);
  const renameTab = useTerminalStore((state) => state.renameTab);
  const theme = useUIStore((state) => state.theme);
  const terminalVisible = useUIStore((state) => state.terminalVisible);
  const terminalHeight = useUIStore((state) => state.terminalHeight);
  const setTerminalHeight = useUIStore((state) => state.setTerminalHeight);
  const setTerminalVisible = useUIStore((state) => state.setTerminalVisible);
  const terminalSettings = useUIStore((state) => state.terminalSettings);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const runtimesRef = useRef(new Map<string, TerminalRuntime>());
  const resizeOriginRef = useRef({ y: 0, height: terminalHeight });

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  const registerRuntime = useCallback((tabId: string, runtime: TerminalRuntime | null) => {
    if (!runtime) {
      runtimesRef.current.delete(tabId);
      return;
    }

    runtimesRef.current.set(tabId, runtime);
  }, []);

  const fitActiveTerminal = useCallback(() => {
    if (!terminalVisible || !activeTabId) {
      return;
    }

    const runtime = runtimesRef.current.get(activeTabId);
    if (!runtime) {
      return;
    }

    requestAnimationFrame(() => {
      runtime.fitAddon.fit();
      runtime.terminal.focus();
    });
  }, [activeTabId, terminalVisible]);

  useEffect(() => {
    const handleWindowResize = () => {
      fitActiveTerminal();
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [fitActiveTerminal]);

  useEffect(() => {
    fitActiveTerminal();
  }, [activeTabId, fitActiveTerminal, terminalHeight, terminalVisible]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const delta = resizeOriginRef.current.y - event.clientY;
      setTerminalHeight(clampTerminalHeight(resizeOriginRef.current.height + delta, window.innerHeight));
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setTerminalHeight]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleClick = () => setContextMenu(null);
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const getRuntime = useCallback((tabId: string) => {
    return runtimesRef.current.get(tabId) ?? null;
  }, []);

  const handleCopy = useCallback(async (tabId: string) => {
    const runtime = getRuntime(tabId);
    if (!runtime || !runtime.terminal.hasSelection()) {
      return false;
    }

    await window.electronAPI.writeClipboardText(runtime.terminal.getSelection());
    runtime.terminal.clearSelection();
    return true;
  }, [getRuntime]);

  const handlePaste = useCallback(async (tabId: string) => {
    const runtime = getRuntime(tabId);
    if (!runtime) {
      return;
    }

    const text = await window.electronAPI.readClipboardText();
    if (!text) {
      return;
    }

    if (terminalSettings.confirmMultilinePaste && /[\r\n]/.test(text)) {
      const confirmed = window.confirm(t('terminal.confirmMultilinePaste'));
      if (!confirmed) {
        return;
      }
    }

    runtime.terminal.focus();
    runtime.terminal.paste(text);
  }, [getRuntime, t, terminalSettings.confirmMultilinePaste]);

  const handleSelectAll = useCallback((tabId: string) => {
    getRuntime(tabId)?.terminal.selectAll();
  }, [getRuntime]);

  const handleClear = useCallback(async (tabId: string) => {
    const runtime = getRuntime(tabId);
    const tab = tabs.find((item) => item.id === tabId);
    if (!runtime || !tab) {
      return;
    }

    runtime.terminal.clear();
    if (tab.termId != null) {
      await window.electronAPI.termClear(tab.termId);
      await window.electronAPI.termWrite({
        termId: tab.termId,
        data: /(^|[\\/])cmd(\.exe)?$/i.test(tab.shellPath) ? 'cls\r' : 'clear\r',
      });
    }
  }, [getRuntime, tabs]);

  const beginResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    resizeOriginRef.current = {
      y: event.clientY,
      height: terminalHeight,
    };
    setIsResizing(true);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const startRename = (tabId: string, currentTitle: string) => {
    setRenamingTabId(tabId);
    setRenameDraft(currentTitle);
  };

  const commitRename = () => {
    if (!renamingTabId) {
      return;
    }

    renameTab(renamingTabId, renameDraft);
    setRenamingTabId(null);
    setRenameDraft('');
  };

  const activeTabTitle = activeTab?.title ?? t('terminal.title');

  return (
    <div
      style={{
        height: terminalVisible ? `${terminalHeight}px` : '0px',
        overflow: 'hidden',
        borderTop: terminalVisible ? '1px solid var(--color-line-soft)' : 'none',
        background: 'var(--color-paper)',
        transition: isResizing ? 'none' : 'height 120ms ease',
        flexShrink: 0,
      }}
    >
      <div
        onMouseDown={beginResize}
        style={{
          height: '6px',
          cursor: 'ns-resize',
          background: terminalVisible ? 'var(--color-paper)' : 'transparent',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: terminalVisible ? `calc(${terminalHeight}px - 6px)` : '0px',
        }}
      >
        <div
          style={{
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 10px',
            borderBottom: '1px solid var(--color-line-soft)',
            background: 'var(--color-surface-sunken)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
            }}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const isRenaming = tab.id === renamingTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  onDoubleClick={() => startRename(tab.id, tab.title)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: '0',
                    maxWidth: '220px',
                    padding: '0 10px',
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'var(--color-paper)' : 'transparent',
                    border: isActive ? '1px solid var(--color-line-soft)' : '1px solid transparent',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <TabStatusPill status={tab.status} />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                        if (event.key === 'Enter') {
                          commitRename();
                        }
                        if (event.key === 'Escape') {
                          setRenamingTabId(null);
                          setRenameDraft('');
                        }
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: 'var(--color-ink)',
                        fontSize: '12px',
                      }}
                    />
                  ) : (
                    <span
                      title={tab.title}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '12px',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {tab.title}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={t('terminal.closeTab', { name: tab.title })}
                    onClick={(event) => {
                      event.stopPropagation();
                      void closeTerminalTab(tab.id);
                    }}
                    style={{
                      width: '18px',
                      height: '18px',
                      border: 'none',
                      borderRadius: '999px',
                      background: 'transparent',
                      color: 'var(--color-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            aria-label={t('terminal.newTab')}
            onClick={() => {
              void openNewTerminalTab();
            }}
            style={{
              width: '28px',
              height: '28px',
              border: '1px solid var(--color-line-soft)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-paper)',
              color: 'var(--color-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            aria-label={t('terminal.hidePanel', { name: activeTabTitle })}
            onClick={() => setTerminalVisible(false)}
            style={{
              width: '28px',
              height: '28px',
              border: '1px solid var(--color-line-soft)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-paper)',
              color: 'var(--color-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {tabs.length === 0 ? (
            <div
              style={{
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--color-muted)',
              }}
            >
              <div style={{ display: 'grid', gap: '12px', justifyItems: 'center' }}>
                <div style={{ fontSize: '14px' }}>{t('terminal.empty')}</div>
                <button
                  type="button"
                  onClick={() => {
                    void openNewTerminalTab();
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-line-soft)',
                    background: 'var(--color-paper)',
                    color: 'var(--color-ink)',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {t('terminal.newTab')}
                </button>
              </div>
            </div>
          ) : (
            tabs.map((tab) => (
              <TerminalSessionView
                key={tab.id}
                tabId={tab.id}
                termId={tab.termId}
                shellPath={tab.shellPath}
                theme={theme}
                active={tab.id === activeTabId}
                visible={terminalVisible}
                fontFamily={terminalSettings.fontFamily}
                fontSize={terminalSettings.fontSize}
                cursorStyle={terminalSettings.cursorStyle}
                cursorBlink={terminalSettings.cursorBlink}
                shortcutPreset={terminalSettings.shortcutPreset}
                confirmMultilinePaste={terminalSettings.confirmMultilinePaste}
                registerRuntime={registerRuntime}
                onOpenContextMenu={(nextTabId, event) => {
                  event.preventDefault();
                  setActiveTab(nextTabId);
                  setContextMenu({
                    tabId: nextTabId,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              />
            ))
          )}

          {contextMenu && (
            <div
              style={{
                position: 'fixed',
                left: contextMenu.x,
                top: contextMenu.y,
                minWidth: '160px',
                padding: '4px 0',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-line-soft)',
                background: 'var(--color-paper)',
                boxShadow: '0 10px 24px rgba(0,0,0,0.16)',
                zIndex: 3200,
              }}
            >
              {[
                {
                  key: 'copy',
                  label: t('terminal.copy'),
                  disabled: !getRuntime(contextMenu.tabId)?.terminal.hasSelection(),
                  action: () => void handleCopy(contextMenu.tabId),
                },
                {
                  key: 'paste',
                  label: t('terminal.paste'),
                  action: () => void handlePaste(contextMenu.tabId),
                },
                {
                  key: 'select-all',
                  label: t('terminal.selectAll'),
                  action: () => handleSelectAll(contextMenu.tabId),
                },
                {
                  key: 'clear',
                  label: t('terminal.clear'),
                  action: () => void handleClear(contextMenu.tabId),
                },
                {
                  key: 'close',
                  label: t('terminal.closeTab', {
                    name:
                      tabs.find((tab) => tab.id === contextMenu.tabId)?.title ??
                      t('terminal.title'),
                  }),
                  action: () => void closeTerminalTab(contextMenu.tabId),
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    item.action();
                    setContextMenu(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    color: item.disabled ? 'var(--color-muted)' : 'var(--color-ink)',
                    fontSize: '13px',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
