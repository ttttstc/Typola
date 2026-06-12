import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { OpenedFile, TocItem } from '../types/document';
import { createEmptyFile } from '../types/document';
import {
  getExportPresetConfig,
  clearLastOpenedPath,
  getLastOpenedPath,
  resolvePreviewFontFamily,
  resolvePreviewHeadingFontFamily,
  setLastOpenedPath,
  updateSettings,
} from '../services/settingsService';
import { firstOpenableDocumentPath, isOpenableDocumentPath } from '../services/fileDrop';
import { useSettings } from '../hooks/useSettings';
import {
  checkForAppUpdate,
  downloadAppUpdate,
  installDownloadedAppUpdate,
  type UpdateCheckResult,
  type UpdateSource,
} from '../services/updateService';
import { scheduleDelayedAutoUpdateCheck } from '../services/autoUpdateScheduler';
import { translate } from '../services/i18n';
import { Toolbar, type EditorMode } from '../components/Toolbar';
import { StatusBar } from '../components/StatusBar';
import { FloatingToc } from '../components/FloatingToc';
import { FindReplacePanel } from '../components/FindReplacePanel';
import { QuickOpenPanel } from '../components/QuickOpenPanel';
import { EditAssistPanel } from '../components/EditAssistPanel';
import type { SourceHeadingScrollRequest } from '../components/EditorPane';
import type { EditorCommandHandle } from '../types/editorCommands';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { calculateDocumentStats } from '../services/documentStatsService';
import { addRecentFile, getRecentFiles, removeRecentFile, type RecentFile } from '../services/recentFilesService';
import { createImageMarkdown, createLinkMarkdown, createTableMarkdown } from '../services/editAssistService';
import type { SearchMatch } from '../services/documentSearchService';

const EditorPane = lazy(() =>
  import('../components/EditorPane').then((module) => ({ default: module.EditorPane })),
);

const WysiwygEditorPane = lazy(() =>
  import('../components/WysiwygEditorPane').then((module) => ({ default: module.WysiwygEditorPane })),
);

const loadSettingsPage = () =>
  import('../components/SettingsPage').then(async (module) => {
    // Warm the default section chunk alongside the settings page so the
    // first tab is interactive as soon as the modal mounts.
    const { preloadGeneralSection } = await import('../components/settings/preloadSections');
    void preloadGeneralSection();
    return { default: module.SettingsPage };
  });

let settingsPagePreload: ReturnType<typeof loadSettingsPage> | undefined;

function preloadSettingsPage() {
  settingsPagePreload ??= loadSettingsPage();
  return settingsPagePreload;
}

function preloadSettingsPageInBackground() {
  if (import.meta.env.MODE === 'test') return;
  void preloadSettingsPage();
}

const SettingsPage = lazy(preloadSettingsPage);

const DocxPreviewPane = lazy(() =>
  import('../components/DocxPreviewPane').then((module) => ({ default: module.DocxPreviewPane })),
);

const WordPaperPreviewPane = lazy(() =>
  import('../components/WordPaperPreviewPane').then((module) => ({ default: module.WordPaperPreviewPane })),
);

const WechatPreviewPane = lazy(() =>
  import('../components/WechatPreviewPane').then((module) => ({ default: module.WechatPreviewPane })),
);

const HtmlPresentationPane = lazy(() =>
  import('../components/HtmlPresentationPane').then((module) => ({ default: module.HtmlPresentationPane })),
);

const TerminalPanel = lazy(() =>
  import('../components/TerminalPanel').then((module) => ({ default: module.TerminalPanel })),
);

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
type RightPanelMode = 'none' | 'word' | 'wechat';
type UpdateInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'ready'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'installing'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'error'; source: UpdateSource; update?: AvailableUpdate; message: string };

const RIGHT_PANEL_MIN_WIDTH = 320;
const RIGHT_PANEL_MAX_WIDTH = 760;
const RIGHT_PANEL_RESIZER_GAP = 9;

function imageExtensionFromMime(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  return 'png';
}

function SettingsPageFallback() {
  return (
    <div className="settings-overlay settings-overlay--loading" aria-hidden="true">
      <div className="settings-modal settings-modal-skeleton">
        <div className="settings-modal-sidebar settings-skeleton-sidebar">
          <div className="settings-skeleton-title" />
          <div className="settings-skeleton-nav">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="settings-skeleton-line" />
            ))}
          </div>
        </div>
        <div className="settings-modal-content settings-skeleton-content">
          <div className="settings-skeleton-heading" />
          <div className="settings-skeleton-row" />
          <div className="settings-skeleton-row" />
          <div className="settings-skeleton-row short" />
        </div>
      </div>
    </div>
  );
}

function extractToc(content: string): TocItem[] {
  const headings: TocItem[] = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = `toc-${idx++}`;
    headings.push({ level, text, id });
  }
  return headings;
}

function toUpdateErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '更新安装失败';
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .cm-editor, .vditor'));
}

function sameDocumentPath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
}

export function AppLayout() {
  const settings = useSettings();
  const isTauriRuntime = '__TAURI_INTERNALS__' in window;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const reopenAttempted = useRef(false);
  const autoUpdateCheckStarted = useRef(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const editorCommandRef = useRef<EditorCommandHandle | null>(null);
  const fileRef = useRef<OpenedFile>(createEmptyFile());
  const defaultEncodingRef = useRef(settings.defaultEncoding);
  const autoSaveFailureRef = useRef({ key: '', count: 0, suspended: false });
  const lastSelfWriteRef = useRef({ path: '', at: 0 });
  const [file, setFile] = useState<OpenedFile>(createEmptyFile());
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocSessionPinned, setTocSessionPinned] = useState(false);
  const [activeTocIndex, setActiveTocIndex] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [findVisible, setFindVisible] = useState(false);
  const [findFocusTarget, setFindFocusTarget] = useState<'find' | 'replace'>('find');
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [editAssistVisible, setEditAssistVisible] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles());
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [sourceHeadingScrollRequest, setSourceHeadingScrollRequest] = useState<SourceHeadingScrollRequest>();
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [resizing, setResizing] = useState(false);
  const [htmlPresentationVisible, setHtmlPresentationVisible] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [terminalCreateRequest, setTerminalCreateRequest] = useState(0);
  const [systemOpenChecked, setSystemOpenChecked] = useState(!isTauriRuntime);
  const [updateState, setUpdateState] = useState<UpdateInstallState>({ phase: 'idle' });
  const [autoSaveError, setAutoSaveError] = useState('');
  const [diskChangeMessage, setDiskChangeMessage] = useState('');
  const [transientMessage, setTransientMessage] = useState('');
  const debouncedStatsSource = useDebouncedValue(file.fileType === 'docx' ? '' : file.content, 260);
  const documentStats = useMemo(
    () => file.fileType === 'docx' ? undefined : calculateDocumentStats(debouncedStatsSource),
    [debouncedStatsSource, file.fileType],
  );

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    defaultEncodingRef.current = settings.defaultEncoding;
  }, [settings.defaultEncoding]);

  useEffect(() => {
    const refreshRecentFiles = () => setRecentFiles(getRecentFiles());
    window.addEventListener('typola-recent-files-changed', refreshRecentFiles);
    return () => window.removeEventListener('typola-recent-files-changed', refreshRecentFiles);
  }, []);

  useEffect(() => {
    if (!transientMessage) return;
    const timeout = window.setTimeout(() => setTransientMessage(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [transientMessage]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    /* Kick off the settings chunk immediately on mount so the modal is fully
       loaded by the time the user first opens it. The dynamic import is small
       (≈10KB after ISS-126) and runs in parallel with the initial render. */
    void preloadSettingsPage();
  }, []);

  const confirmDiscardDirtyFile = useCallback(() => {
    const current = fileRef.current;
    if (!current.dirty) return true;
    return window.confirm(`"${current.name}" 有未保存的修改，确定放弃并打开其他文件吗？`);
  }, []);

  const applyOpenedFile = useCallback((opened: OpenedFile, path?: string) => {
    setFile(opened);
    setToc(opened.fileType === 'docx' ? [] : extractToc(opened.content));
    const openedPath = opened.path || path || '';
    if (openedPath) {
      setLastOpenedPath(openedPath);
      addRecentFile(openedPath, opened.name);
    }
    setDiskChangeMessage('');
    setTransientMessage('');
    setHtmlPresentationVisible(false);
    setFindVisible(false);
    if (opened.fileType === 'docx') {
      setRightPanelMode('none');
    } else {
      setEditorMode('wysiwyg');
    }
  }, []);

  const handleOpen = useCallback(async () => {
    if (!confirmDiscardDirtyFile()) return;
    const { openFile } = await import('../services/fileService');
    const opened = await openFile(defaultEncodingRef.current);
    if (opened) applyOpenedFile(opened);
  }, [applyOpenedFile, confirmDiscardDirtyFile]);

  const handleOpenPath = useCallback(async (path: string) => {
    if (!confirmDiscardDirtyFile()) return;
    const { openPath } = await import('../services/fileService');
    try {
      const opened = await openPath(path, defaultEncodingRef.current);
      applyOpenedFile(opened, path);
    } catch (error) {
      removeRecentFile(path);
      setTransientMessage('打开失败，已从最近文件移除。');
      throw error;
    }
  }, [applyOpenedFile, confirmDiscardDirtyFile]);

  const handleSave = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFile } = await import('../services/fileService');
    const updated = await saveFile(file);
    lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
    autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
    setAutoSaveError('');
    setDiskChangeMessage('');
    setFile(updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file]);

  const handleSaveAs = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFileAs } = await import('../services/fileService');
    const updated = await saveFileAs(file);
    lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
    autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
    setAutoSaveError('');
    setDiskChangeMessage('');
    setFile(updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file]);

  const handleExportWord = useCallback(async () => {
    if (!file.path || file.fileType === 'docx') return;
    try {
      const { exportToWord } = await import('../services/wordExportService');
      await exportToWord(file.content, file.name, getExportPresetConfig());
    } catch (e) {
      console.error('Export failed:', e);
    }
  }, [file]);

  const handleContentChange = useCallback((value: string) => {
    setAutoSaveError('');
    setDiskChangeMessage('');
    setTransientMessage('');
    setFile(prev => ({
      ...prev,
      content: value,
      dirty: value !== prev.lastSavedContent,
    }));
    setToc(extractToc(value));
  }, []);

  const replaceCurrentContent = useCallback((value: string) => {
    handleContentChange(value);
    editorCommandRef.current?.focus();
  }, [handleContentChange]);

  const handleSearchNavigate = useCallback((match: SearchMatch, query: string, backwards = false) => {
    if (editorMode === 'source') {
      editorCommandRef.current?.revealRange(match.index, match.index + match.length);
      return;
    }
    editorCommandRef.current?.revealText(query || match.text, backwards);
  }, [editorMode]);

  const insertMarkdown = useCallback((markdown: string) => {
    if (fileRef.current.fileType === 'docx') return;
    editorCommandRef.current?.insertText(markdown);
  }, []);

  const openFindPanel = useCallback((focusTarget: 'find' | 'replace') => {
    setFindFocusTarget(focusTarget);
    setFindVisible(true);
  }, []);

  const getDefaultRightPanelWidth = useCallback(() => {
    const containerWidth = mainContentRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    return Math.min(
      RIGHT_PANEL_MAX_WIDTH,
      Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round((containerWidth - RIGHT_PANEL_RESIZER_GAP) / 3)),
    );
  }, []);

  const handleToggleEditorMode = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setEditorMode((mode) => mode === 'source' ? 'wysiwyg' : 'source');
  }, [file.fileType]);

  const handleToggleWordPreview = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setRightPanelMode((mode) => {
      if (mode === 'word') return 'none';
      setRightPanelWidth(getDefaultRightPanelWidth());
      return 'word';
    });
  }, [file.fileType, getDefaultRightPanelWidth]);

  const handleToggleWechatPreview = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setRightPanelMode((mode) => {
      if (mode === 'wechat') return 'none';
      setRightPanelWidth(getDefaultRightPanelWidth());
      return 'wechat';
    });
  }, [file.fileType, getDefaultRightPanelWidth]);

  const handleToggleTerminal = useCallback(() => {
    setTerminalVisible((visible) => !visible);
  }, []);

  const handleCreateTerminal = useCallback(() => {
    setTerminalVisible(true);
    setTerminalCreateRequest((request) => request + 1);
  }, []);

  const handleQuickOpenPath = useCallback((path: string) => {
    setQuickOpenVisible(false);
    void handleOpenPath(path).catch((error) => {
      console.warn('Failed to quick open recent file:', error);
    });
  }, [handleOpenPath]);

  const handlePasteImage = useCallback(async (event: ClipboardEvent) => {
    if (fileRef.current.fileType === 'docx') return;
    if (!fileRef.current.path) {
      const hasImage = Array.from(event.clipboardData?.items ?? []).some((item) => item.type.startsWith('image/'));
      if (hasImage) setTransientMessage('请先保存文档，再粘贴图片。');
      return;
    }

    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    const blob = imageItem.getAsFile();
    if (!blob) return;

    event.preventDefault();
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const extension = imageExtensionFromMime(blob.type);
      const fileName = `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
      const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const relativePath = await invoke<string>('write_attachment_file', {
        request: {
          documentPath: fileRef.current.path,
          fileName,
          data,
        },
      });
      insertMarkdown(createImageMarkdown('图片', relativePath));
      setTransientMessage('图片已保存到 assets。');
    } catch (error) {
      console.warn('Failed to paste image:', error);
      setTransientMessage('图片粘贴失败。');
    }
  }, [insertMarkdown]);

  useEffect(() => {
    if (rightPanelMode === 'none') return;

    const handleResize = () => {
      setRightPanelWidth(getDefaultRightPanelWidth());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getDefaultRightPanelWidth, rightPanelMode]);

  const handleRightPanelResizerPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = mainContentRef.current;
    if (!container) return;

    event.preventDefault();
    setResizing(true);

    const updateWidth = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const maxWidth = Math.min(RIGHT_PANEL_MAX_WIDTH, Math.round(rect.width * 0.5));
      const nextWidth = rect.right - clientX;
      setRightPanelWidth(Math.min(maxWidth, Math.max(RIGHT_PANEL_MIN_WIDTH, nextWidth)));
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
  }, []);

  const startBackgroundUpdateDownload = useCallback((source: UpdateSource, update: AvailableUpdate) => {
    if (updateDownloadVersionRef.current === update.version) return;

    updateDownloadVersionRef.current = update.version;
    setUpdateState({ phase: 'downloading', source, update });

    void downloadAppUpdate(update.update)
      .then(() => {
        setUpdateState((current) => {
          if (current.phase !== 'downloading' || current.update.version !== update.version) return current;
          return { phase: 'ready', source, update };
        });
      })
      .catch((error) => {
        updateDownloadVersionRef.current = null;
        setUpdateState({ phase: 'error', source, update, message: toUpdateErrorMessage(error) });
      });
  }, []);

  const handleRestartUpdate = useCallback(async () => {
    if (updateState.phase !== 'ready') return;

    const readyUpdate = updateState.update;
    const source = updateState.source;
    setUpdateState({ phase: 'installing', source, update: readyUpdate });

    try {
      await installDownloadedAppUpdate(readyUpdate.update);
    } catch (error) {
      updateDownloadVersionRef.current = null;
      setUpdateState({ phase: 'error', source, update: readyUpdate, message: toUpdateErrorMessage(error) });
    }
  }, [updateState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openFindPanel('find');
        return;
      }
      if (e.key === 'h' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openFindPanel('replace');
        return;
      }
      if (e.key === 'p' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setQuickOpenVisible(true);
        return;
      }
      if (isEditableShortcutTarget(e.target)) return;
      if (e.key === 'o' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleOpen(); return; }
      if (e.key === 's' && e.shiftKey && !e.altKey) { e.preventDefault(); handleSaveAs(); return; }
      if (e.key === 's' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleSave(); return; }
      if (e.key === 'e' && e.shiftKey && !e.altKey) { e.preventDefault(); handleExportWord(); return; }
      if (e.key === 's' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleEditorMode(); return; }
      if (e.key === 'p' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleWordPreview(); return; }
      if (e.key === 'm' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleWechatPreview(); return; }
      if (e.code === 'Backquote' && e.shiftKey && !e.altKey) { e.preventDefault(); handleCreateTerminal(); return; }
      if (e.code === 'Backquote' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleToggleTerminal(); return; }
      if (e.key === 'i' && e.shiftKey && !e.altKey) { e.preventDefault(); setEditAssistVisible(true); return; }
      if (e.key === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void preloadSettingsPage();
        setSettingsVisible(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    handleOpen,
    handleSave,
    handleSaveAs,
    handleExportWord,
    handleToggleEditorMode,
    handleToggleWordPreview,
    handleToggleWechatPreview,
    handleToggleTerminal,
    handleCreateTerminal,
    openFindPanel,
  ]);

  useEffect(() => {
    const handler = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const items = e.dataTransfer?.files;
      if (!items || items.length === 0) return;
      const f = items[0];
      const path = (f as unknown as { path?: string }).path;
      if (path && isOpenableDocumentPath(path)) await handleOpenPath(path);
    };
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', handler);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', handler);
    };
  }, [handleOpenPath]);

  useEffect(() => {
    window.addEventListener('paste', handlePasteImage);
    return () => window.removeEventListener('paste', handlePasteImage);
  }, [handlePasteImage]);

  useEffect(() => {
    if (!isTauriRuntime) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        const path = firstOpenableDocumentPath(event.payload.paths);
        if (path) void handleOpenPath(path);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => console.warn('Failed to bind Tauri file drop:', e));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleOpenPath, isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const openFirstSystemPath = (paths: unknown) => {
      if (!Array.isArray(paths)) return;
      const path = firstOpenableDocumentPath(paths.filter((candidate): candidate is string => (
        typeof candidate === 'string'
      )));
      if (!path) return;

      reopenAttempted.current = true;
      void handleOpenPath(path).catch((error) => {
        console.warn('Failed to open system file:', error);
      });
    };

    void Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/event'),
    ]).then(async ([{ invoke }, { listen }]) => {
      const listener = await listen<string[]>('opened-paths', (event) => {
        openFirstSystemPath(event.payload);
      });

      if (cancelled) {
        listener();
        return;
      }

      unlisten = listener;
      const pendingPaths = await invoke<string[]>('pending_opened_paths');
      if (!cancelled) {
        openFirstSystemPath(pendingPaths);
        setSystemOpenChecked(true);
      }
    }).catch((error) => {
      if (!cancelled) {
        console.warn('Failed to bind system file open:', error);
        setSystemOpenChecked(true);
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleOpenPath, isTauriRuntime]);

  useEffect(() => {
    if (!systemOpenChecked || !settings.reopenLastFile || file.path || reopenAttempted.current) return;
    const lastPath = getLastOpenedPath();
    if (!lastPath) return;
    reopenAttempted.current = true;
    let idleId: number | undefined;
    const timeout = window.setTimeout(() => {
      const reopen = () => {
        void handleOpenPath(lastPath).catch((e) => {
          console.warn('Failed to reopen last file:', e);
          clearLastOpenedPath();
        });
      };

      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(reopen, { timeout: 1500 });
      } else {
        reopen();
      }
    }, 700);

    return () => {
      window.clearTimeout(timeout);
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [file.path, handleOpenPath, settings.reopenLastFile, systemOpenChecked]);

  useEffect(() => {
    if (!settings.autoUpdateCheck || autoUpdateCheckStarted.current || !isTauriRuntime) return;

    return scheduleDelayedAutoUpdateCheck({
      hasStarted: () => autoUpdateCheckStarted.current,
      markStarted: () => {
        autoUpdateCheckStarted.current = true;
      },
      checkForAppUpdate,
      onUpdateAvailable: (result) => startBackgroundUpdateDownload('auto', result),
    });
  }, [isTauriRuntime, settings.autoUpdateCheck, startBackgroundUpdateDownload]);

  useEffect(() => {
    if (!settings.autoSave || !file.path || !file.dirty || file.fileType === 'docx') return;
    const saveKey = `${file.path}\n${file.content}`;
    const failure = autoSaveFailureRef.current;
    if (failure.key === saveKey && failure.suspended) return;

    const timeout = window.setTimeout(() => {
      void import('../services/fileService')
        .then(({ saveFile }) => saveFile(file))
        .then((updated) => {
          lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
          autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
          setAutoSaveError('');
          setDiskChangeMessage('');
          setFile(updated);
        })
        .catch((e) => {
          const current = autoSaveFailureRef.current;
          const count = current.key === saveKey ? current.count + 1 : 1;
          const suspended = count >= 3;
          autoSaveFailureRef.current = { key: saveKey, count, suspended };
          setAutoSaveError(suspended
            ? '自动保存失败，已暂停本次内容的自动重试，请手动保存或继续编辑后再试。'
            : `自动保存失败（${count}/3），稍后将自动重试。`);
          console.error('Auto-save failed:', e);
        });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [file, settings.autoSave]);

  useEffect(() => {
    if (!isTauriRuntime || !file.path) return;
    const watchedPath = file.path;
    let cancelled = false;

    void import('../services/documentWatchService')
      .then(({ watchOpenedDocument, unwatchOpenedDocument }) => {
        if (cancelled) return undefined;
        void watchOpenedDocument(watchedPath).catch((error) => console.warn('Failed to watch document:', error));
        return () => {
          void unwatchOpenedDocument(watchedPath).catch((error) => console.warn('Failed to unwatch document:', error));
        };
      })
      .then((cleanup) => {
        if (cancelled) cleanup?.();
      });

    return () => {
      cancelled = true;
      void import('../services/documentWatchService')
        .then(({ unwatchOpenedDocument }) => unwatchOpenedDocument(watchedPath))
        .catch((error) => console.warn('Failed to unwatch document:', error));
    };
  }, [file.path, isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import('../services/documentWatchService')
      .then(({ onFileChanged }) => onFileChanged((payload) => {
        const current = fileRef.current;
        if (!current.path || !sameDocumentPath(current.path, payload.path)) return;

        const lastSelfWrite = lastSelfWriteRef.current;
        if (sameDocumentPath(lastSelfWrite.path, payload.path) && Date.now() - lastSelfWrite.at < 1500) {
          return;
        }

        setDiskChangeMessage('磁盘文件已在外部变更，请保存前确认是否需要重新打开。');
      }))
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) => console.warn('Failed to bind document watcher:', error));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    const title = file.dirty ? `* ${file.name}` : file.name;
    void getCurrentWindow()
      .setTitle(title)
      .catch((error) => console.warn('Failed to update window title:', error));
  }, [file.dirty, file.name, isTauriRuntime]);

  const isDocx = file.fileType === 'docx';
  const updateToolbarStatus = updateState.phase === 'ready' || updateState.phase === 'installing'
    ? { phase: updateState.phase, version: updateState.update.version }
    : undefined;
  const shouldShowHtmlPresentation = htmlPresentationVisible && file.fileType === 'html' && !isDocx;
  const tocPinned = tocSessionPinned || settings.tocAlwaysPinned;
  const mainContentClassName = [
    'main-content',
    isDocx ? 'docx-layout' : 'writing-layout',
    rightPanelMode !== 'none' && !isDocx ? 'right-panel-open' : '',
    rightPanelMode === 'word' && !isDocx ? 'word-preview-open' : '',
    rightPanelMode === 'wechat' && !isDocx ? 'wechat-preview-open' : '',
    shouldShowHtmlPresentation ? 'html-presentation-layout' : '',
    resizing ? 'is-resizing' : '',
  ].filter(Boolean).join(' ');

  const resolveTocHeading = useCallback((item: TocItem, index: number): HTMLElement | null => {
    const byId = document.getElementById(item.id);
    if (byId instanceof HTMLElement) return byId;

    const root = mainContentRef.current;
    if (!root) return null;

    const headings = root.querySelectorAll<HTMLElement>(
      '.vditor-ir h1, .vditor-ir h2, .vditor-ir h3, .vditor-ir h4, .vditor-ir h5, .vditor-ir h6, .vditor-wysiwyg h1, .vditor-wysiwyg h2, .vditor-wysiwyg h3, .vditor-wysiwyg h4, .vditor-wysiwyg h5, .vditor-wysiwyg h6',
    );
    return headings[index] ?? null;
  }, []);

  const handleTocNavigate = useCallback((item: TocItem, index: number) => {
    if (editorMode === 'source') {
      setSourceHeadingScrollRequest((current) => ({
        index,
        requestId: (current?.requestId ?? 0) + 1,
      }));
      setActiveTocIndex(index);
      return;
    }

    const target = resolveTocHeading(item, index);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveTocIndex(index);
  }, [editorMode, resolveTocHeading]);

  const handleTocPinnedChange = useCallback((nextPinned: boolean) => {
    setTocSessionPinned(nextPinned);
    if (!nextPinned && settings.tocAlwaysPinned) {
      updateSettings({ tocAlwaysPinned: false });
    }
  }, [settings.tocAlwaysPinned]);

  const handleTocAlwaysPinnedChange = useCallback((nextAlwaysPinned: boolean) => {
    if (!nextAlwaysPinned) {
      setTocSessionPinned(true);
    }
    updateSettings({ tocAlwaysPinned: nextAlwaysPinned });
  }, []);

  useEffect(() => {
    if (toc.length === 0) return;
    if (editorMode === 'source') return;

    const updateActiveHeading = () => {
      const rootRect = mainContentRef.current?.getBoundingClientRect();
      const anchorTop = (rootRect?.top ?? 0) + 96;
      let nextActive = 0;

      toc.forEach((item, index) => {
        const heading = resolveTocHeading(item, index);
        if (!heading) return;
        if (heading.getBoundingClientRect().top <= anchorTop) {
          nextActive = index;
        }
      });

      setActiveTocIndex((current) => current === nextActive ? current : nextActive);
    };

    const root = mainContentRef.current;
    let frame: number | null = null;
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateActiveHeading();
      });
    };
    const observer = new MutationObserver(scheduleUpdate);

    root?.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true });
    window.addEventListener('resize', scheduleUpdate);
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
    scheduleUpdate();

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      root?.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
      observer?.disconnect();
    };
  }, [editorMode, file.content, resolveTocHeading, toc, rightPanelMode]);

  const editorPane = isDocx ? (
    <div className="editor-pane readonly-pane">
      <span>Word 文件为只读</span>
    </div>
  ) : editorMode === 'source' ? (
    <Suspense fallback={<div className="editor-pane lazy-pane"><span>源码编辑器加载中</span></div>}>
      <EditorPane
        ref={editorCommandRef}
        source={file.content}
        onChange={handleContentChange}
        headingScrollRequest={sourceHeadingScrollRequest}
      />
    </Suspense>
  ) : shouldShowHtmlPresentation ? (
    <Suspense fallback={<div className="html-presentation-pane lazy-pane" aria-label={t('htmlPresentationAria')} />}>
      <HtmlPresentationPane
        source={file.content}
        filePath={file.path}
        onBack={() => setHtmlPresentationVisible(false)}
      />
    </Suspense>
  ) : (
    <Suspense fallback={<div className="wysiwyg-editor-pane lazy-pane"><span>所见即所得编辑器加载中</span></div>}>
      <WysiwygEditorPane
        ref={editorCommandRef}
        source={file.content}
        onChange={handleContentChange}
        filePath={file.path}
      />
    </Suspense>
  );

  const rightPanel = rightPanelMode === 'word' && !isDocx ? (
    <Suspense fallback={<aside className="word-preview-panel" aria-label={t('wordPreviewAria')} />}>
      <WordPaperPreviewPane
        source={file.content}
        previewWidth={rightPanelWidth}
        canExport={Boolean(file.path)}
        onExportWord={handleExportWord}
        onClose={() => setRightPanelMode('none')}
        filePath={file.path}
      />
    </Suspense>
  ) : rightPanelMode === 'wechat' && !isDocx ? (
    <Suspense fallback={<aside className="wechat-preview-panel" aria-label={t('wechatPreviewAria')} />}>
      <WechatPreviewPane
        source={file.content}
        fileName={file.name}
        onClose={() => setRightPanelMode('none')}
        filePath={file.path}
      />
    </Suspense>
  ) : null;

  const docxPane = (
    <div className="docx-preview-area">
      <Suspense fallback={<div className="preview-shell" />}>
        <DocxPreviewPane html={file.docxHtml ?? ''} />
      </Suspense>
    </div>
  );
  const appStyle = {
    fontSize: `${settings.zoomLevel}%`,
    '--reading-font-family': resolvePreviewFontFamily(settings),
    '--reading-heading-font-family': resolvePreviewHeadingFontFamily(settings),
  } as CSSProperties;

  return (
    <div className="app-layout" data-theme={settings.theme} style={appStyle}>
      <Toolbar
        dirty={file.dirty}
        fileName={file.name}
        editorMode={editorMode}
        wordPreviewVisible={rightPanelMode === 'word'}
        wechatPreviewVisible={rightPanelMode === 'wechat'}
        terminalVisible={terminalVisible}
        editingDisabled={isDocx}
        onToggleEditorMode={handleToggleEditorMode}
        onToggleWordPreview={handleToggleWordPreview}
        onToggleWechatPreview={handleToggleWechatPreview}
        onToggleTerminal={handleToggleTerminal}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpenEditAssist={() => setEditAssistVisible(true)}
        onOpenSettings={() => {
          void preloadSettingsPage();
          setSettingsVisible(true);
        }}
        onPreloadSettings={preloadSettingsPageInBackground}
        updateStatus={updateToolbarStatus}
        onRestartUpdate={handleRestartUpdate}
      />
      <div
        ref={mainContentRef}
        className={mainContentClassName}
        style={{ '--right-panel-width': `${rightPanelWidth}px` } as React.CSSProperties}
      >
        {isDocx ? docxPane : (
          <>
            <FloatingToc
              items={toc}
              activeIndex={activeTocIndex}
              pinned={tocPinned}
              alwaysPinned={settings.tocAlwaysPinned}
              onPinnedChange={handleTocPinnedChange}
              onAlwaysPinnedChange={handleTocAlwaysPinnedChange}
              onNavigate={handleTocNavigate}
            />
            {editorPane}
          </>
        )}
        {rightPanelMode !== 'none' && !isDocx && (
          <div
            className={`word-preview-resizer ${resizing ? 'dragging' : ''}`}
            role="separator"
            aria-label={t('rightPanelResizeLabel')}
            aria-orientation="vertical"
            aria-valuemin={320}
            aria-valuemax={760}
            aria-valuenow={Math.round(rightPanelWidth)}
            title={t('rightPanelResizeTitle')}
            onPointerDown={handleRightPanelResizerPointerDown}
            onDoubleClick={() => setRightPanelWidth(getDefaultRightPanelWidth())}
          />
        )}
        {rightPanel}
      </div>
      <Suspense fallback={null}>
        <TerminalPanel
          visible={terminalVisible}
          height={terminalHeight}
          currentFilePath={file.path}
          createRequest={terminalCreateRequest}
          onHeightChange={setTerminalHeight}
          onHide={() => setTerminalVisible(false)}
        />
      </Suspense>
      <StatusBar
        filePath={file.path}
        dirty={file.dirty}
        message={autoSaveError || diskChangeMessage || transientMessage}
        stats={documentStats}
      />
      <FindReplacePanel
        visible={findVisible}
        focusTarget={findFocusTarget}
        source={file.content}
        readOnly={isDocx}
        onClose={() => setFindVisible(false)}
        onReplaceSource={replaceCurrentContent}
        onNavigate={handleSearchNavigate}
      />
      <QuickOpenPanel
        visible={quickOpenVisible}
        files={recentFiles}
        onClose={() => setQuickOpenVisible(false)}
        onOpen={handleQuickOpenPath}
      />
      <EditAssistPanel
        visible={editAssistVisible}
        readOnly={isDocx}
        onClose={() => setEditAssistVisible(false)}
        onInsertLink={(label, url) => insertMarkdown(createLinkMarkdown(label, url))}
        onInsertImage={(alt, path) => insertMarkdown(createImageMarkdown(alt, path))}
        onInsertTable={(rows, columns) => insertMarkdown(`\n${createTableMarkdown(rows, columns)}\n`)}
      />
      {settingsVisible && (
        <Suspense fallback={<SettingsPageFallback />}>
          <SettingsPage
            onClose={() => setSettingsVisible(false)}
            onUpdateAvailable={(update) => startBackgroundUpdateDownload('manual', update)}
          />
        </Suspense>
      )}
    </div>
  );
}
