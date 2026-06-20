import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { TocItem } from '../types/document';
import {
  getExportPresetConfig,
  clearLastOpenedPath,
  getLastOpenedPath,
  resolvePreviewFontFamily,
  resolvePreviewHeadingFontFamily,
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
import type { EditorMode } from '../components/Toolbar';
import { StatusBar } from '../components/StatusBar';
import { AppLayoutChrome } from '../components/AppLayoutChrome';
import { AppLayoutOverlays } from '../components/AppLayoutOverlays';
import { SkillHubPanel } from '../components/SkillHubPanel';
import { useConversationManager } from '../hooks/useAgentSession';
import { useArtifactState } from '../hooks/useArtifactState';
import { useEditorSelectionBridge } from '../hooks/useEditorSelectionBridge';
import { useFileTabs } from '../hooks/useFileTabs';
import { confirmDialog, messageDialog } from '../services/dialogService';
import { useFlowMode } from '../hooks/useFlowMode';
import { useLeftRail } from '../hooks/useLeftRail';
import { useRightPanel } from '../hooks/useRightPanel';
import { useSkillHubState } from '../hooks/useSkillHubState';
import { useTocState } from '../hooks/useTocState';
import { useWorkspaceWatch } from '../hooks/useWorkspaceWatch';
import type { SourceHeadingScrollRequest } from '../components/EditorPane';
import type { EditorCommandHandle } from '../types/editorCommands';
import type { PreviewScrollHandle } from '../types/previewScroll';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { calculateDocumentStats } from '../services/documentStatsService';
import { getRecentFiles, type RecentFile } from '../services/recentFilesService';
import type { SearchMatch } from '../services/documentSearchService';
import { createImageMarkdown } from '../services/editAssistService';
import {
  extractToc,
  FLOW_LEFT_PANEL_WIDTH,
  FLOW_RIGHT_PANEL_WIDTH,
  imageExtensionFromMime,
  isEditableShortcutTarget,
  joinLocalPath,
  LEFT_PANEL_MAX_WIDTH,
  LEFT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_RESIZER_GAP,
  toUpdateErrorMessage,
  WORKSPACE_PANEL_DEFAULT_WIDTH,
} from './appLayoutUtils';
import {
  preloadSettingsPage,
  preloadSettingsPageInBackground,
  SettingsPage,
  SettingsPageFallback,
} from './settingsPageLoader';

const EditorPane = lazy(() =>
  import('../components/EditorPane').then((module) => ({ default: module.EditorPane })),
);

const WysiwygEditorPane = lazy(() =>
  import('../components/WysiwygEditorPane').then((module) => ({ default: module.WysiwygEditorPane })),
);

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
type TerminalPanelHandle = import('../components/TerminalPanel').TerminalPanelHandle;
const ArtifactPreview = lazy(() =>
  import('../components/ArtifactPreview').then((module) => ({ default: module.ArtifactPreview })),
);

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
type UpdateInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'ready'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'installing'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'error'; source: UpdateSource; update?: AvailableUpdate; message: string };

export function AppLayout() {
  const settings = useSettings();
  const isTauriRuntime = '__TAURI_INTERNALS__' in window;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const reopenAttempted = useRef(false);
  const autoUpdateCheckStarted = useRef(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const editorCommandRef = useRef<EditorCommandHandle | null>(null);
  const previewScrollRef = useRef<PreviewScrollHandle | null>(null);
  const terminalPanelRef = useRef<TerminalPanelHandle | null>(null);
  const handleEditorScrollRatio = useCallback((ratio: number) => {
    previewScrollRef.current?.scrollToRatio(ratio);
  }, []);
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [settingsVisible, setSettingsVisible] = useState(false);
  // P1-E:从外部(场景卡)跳转时指定的初始段
  const [settingsInitialSection, setSettingsInitialSection] = useState<'aiCli' | undefined>(undefined);
  const [findVisible, setFindVisible] = useState(false);
  const [findFocusTarget, setFindFocusTarget] = useState<'find' | 'replace'>('find');
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles());
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [sourceHeadingScrollRequest, setSourceHeadingScrollRequest] = useState<SourceHeadingScrollRequest>();
  const [htmlPresentationVisible, setHtmlPresentationVisible] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [terminalCreateRequest, setTerminalCreateRequest] = useState(0);
  const [systemOpenChecked, setSystemOpenChecked] = useState(!isTauriRuntime);
  const [updateState, setUpdateState] = useState<UpdateInstallState>({ phase: 'idle' });
  const [autoSaveError, setAutoSaveError] = useState('');
  const [diskChangeMessage, setDiskChangeMessage] = useState('');
  const [transientMessage, setTransientMessage] = useState('');
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
  const {
    toc,
    setToc,
    activeTocIndex,
    tocPinned,
    handleTocNavigate,
    handleTocPinnedChange,
    handleTocAlwaysPinnedChange,
  } = useTocState({
    editorMode,
    alwaysPinned: settings.tocAlwaysPinned,
    mainContentRef,
    resolveTocHeading,
    setSourceHeadingScrollRequest,
  });
  const getDefaultRightPanelWidth = useCallback(() => {
    // 三栏比例:右栏目标 360 紧凑,容器太小时 clamp 到 min。原算法 /3 在大屏太宽(1920 → 640)。
    const containerWidth = mainContentRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const target = Math.round((containerWidth - RIGHT_PANEL_RESIZER_GAP) / 5);
    return Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, target));
  }, []);
  const {
    rightPanelMode,
    setRightPanelMode,
    rightPanelWidth,
    setRightPanelWidth,
    resizing,
    handleRightPanelResizerPointerDown,
  } = useRightPanel({
    containerRef: mainContentRef,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    maxWidth: RIGHT_PANEL_MAX_WIDTH,
    getDefaultRightPanelWidth,
  });
  const {
    file,
    openTabs,
    activeTabId,
    fileRef,
    lastSelfWriteRef,
    dirtyPaths,
    shouldShowTabbar,
    unsavedDialog,
    renameDialog,
    setRenameDialog,
    externalChangeConflict,
    diffPreview,
    setDiffPreview,
    handleUnsavedChoice,
    handleOpen,
    handleNewFile,
    handleOpenPath,
    handleSwitchTab,
    handleCloseTab,
    handleRequestRename,
    handleConfirmRename,
    handleSave,
    handleSaveAs,
    handleContentChange,
    handleViewDiff,
    handleAcceptExternal,
    handleKeepMine,
  } = useFileTabs({
    defaultEncoding: settings.defaultEncoding,
    autoSaveEnabled: settings.autoSave,
    isTauriRuntime,
    setToc,
    setAutoSaveError,
    setDiskChangeMessage,
    setTransientMessage,
    setFindVisible,
    setHtmlPresentationVisible,
    setRightPanelMode,
    setEditorMode,
    extractToc,
  });
  const debouncedStatsSource = useDebouncedValue(file.fileType === 'docx' ? '' : file.content, 260);
  const documentStats = useMemo(
    () => file.fileType === 'docx' ? undefined : calculateDocumentStats(debouncedStatsSource),
    [debouncedStatsSource, file.fileType],
  );
  const outputBaseDir = useMemo(() => (
    settings.aiWorkspaceRoot
      ? joinLocalPath(settings.aiWorkspaceRoot, '.typola-output')
      : undefined
  ), [settings.aiWorkspaceRoot]);
  const {
    leftRailMode,
    setLeftRailMode,
    workspacePanelWidth,
    setWorkspacePanelWidth,
    leftResizing,
    handleToggleWorkspacePanel,
    handleToggleAiPanel,
    handleLeftPanelResizerPointerDown,
  } = useLeftRail({
    aiWorkbenchEnabled: file.fileType !== 'docx',
    defaultWidth: WORKSPACE_PANEL_DEFAULT_WIDTH,
    minWidth: LEFT_PANEL_MIN_WIDTH,
    maxWidth: LEFT_PANEL_MAX_WIDTH,
  });
  const { flowMode, handleToggleFlowMode } = useFlowMode({
    enabled: file.fileType !== 'docx',
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
    flowLeftPanelWidth: FLOW_LEFT_PANEL_WIDTH,
    flowRightPanelWidth: FLOW_RIGHT_PANEL_WIDTH,
  });

  const convManager = useConversationManager({
    workspaceRoot: settings.aiWorkspaceRoot || undefined,
    agentPath: settings.aiClaudePath,
    model: settings.aiClaudeModel,
    pluginDirs: settings.aiPluginDirs,
  });
  const {
    hasEditorSelection,
    handleInsertToEditor,
    handleReplaceEditorSelection,
    handleEditorAIAction,
    handleReplaceEditorAnchor,
    validateEditorAnchor,
  } = useEditorSelectionBridge({
    editorCommandRef,
    setLeftRailMode,
    convManager,
  });
  const { skillHub, skillHubError, handleSaveSkillHub, handleReloadSkillHub } = useSkillHubState();
  // 选 skill → 新建会话 + 切左栏 + 预填 composer 的桥梁;{tick, text} 防止同 text 重复触发。
  const [skillPrefill, setSkillPrefill] = useState<{ tick: number; text: string } | null>(null);
  const {
    agentChangedPaths,
    workspaceTreeVersion,
    clearArtifacts: handleClearArtifacts,
    forgetArtifact,
    bumpWorkspaceTreeVersion,
  } = useWorkspaceWatch({
    isTauriRuntime,
    watchRoot: settings.aiWorkspaceRoot || undefined,
    outputRoot: outputBaseDir,
    lastSelfWriteRef,
  });

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

  const handleExportWord = useCallback(async () => {
    if (!file.path || file.fileType === 'docx') return;
    try {
      const { exportToWord } = await import('../services/wordExportService');
      await exportToWord(file.content, file.name, getExportPresetConfig());
    } catch (e) {
      console.error('Export failed:', e);
    }
  }, [file]);

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

  const handlePickSkill = useCallback((skillName: string) => {
    convManager.createConversation(skillName, skillName);
    setLeftRailMode('aiWorkbench');
    setSkillPrefill({ tick: Date.now(), text: `/${skillName} ` });
  }, [convManager]);

  const handleInstallSkill = useCallback((prompt: string) => {
    setLeftRailMode('aiWorkbench');
    void convManager.send(prompt);
  }, [convManager]);

  const handleSkillPrefillConsumed = useCallback(() => {
    setSkillPrefill(null);
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
      if (e.key === 's' && e.shiftKey && !e.altKey) { e.preventDefault(); handleSaveAs(); return; }
      if (e.key === 's' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleSave(); return; }
      if (isEditableShortcutTarget(e.target)) return;
      if (e.key === 'o' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleOpen(); return; }
      if (e.key === 'n' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleNewFile(); return; }
      if (e.key === 'e' && e.shiftKey && !e.altKey) { e.preventDefault(); handleExportWord(); return; }
      if (e.key === 's' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleEditorMode(); return; }
      if (e.key === 'p' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleWordPreview(); return; }
      if (e.key === 'm' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleWechatPreview(); return; }
      if (e.code === 'Backquote' && e.shiftKey && !e.altKey) { e.preventDefault(); handleCreateTerminal(); return; }
      if (e.code === 'Backquote' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleToggleTerminal(); return; }
      if (e.key === 'a' && e.shiftKey && !e.altKey) { e.preventDefault(); void handleToggleFlowMode(); return; }
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
    handleNewFile,
    handleSave,
    handleSaveAs,
    handleExportWord,
    handleToggleEditorMode,
    handleToggleWordPreview,
    handleToggleWechatPreview,
    handleToggleTerminal,
    handleCreateTerminal,
    handleToggleFlowMode,
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

  const { artifactItems, handleArchiveArtifact } = useArtifactState({
    agentChangedPaths,
    workspaceRoot: settings.aiWorkspaceRoot || undefined,
    onForgetArtifact: forgetArtifact,
    onWorkspaceRefresh: bumpWorkspaceTreeVersion,
    onOpenPath: handleOpenPath,
    onTransientMessage: setTransientMessage,
  });

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
  const mainContentClassName = [
    'main-content',
    isDocx ? 'docx-layout' : 'writing-layout',
    rightPanelMode !== 'none' && !isDocx ? 'right-panel-open' : '',
    rightPanelMode === 'word' && !isDocx ? 'word-preview-open' : '',
    rightPanelMode === 'wechat' && !isDocx ? 'wechat-preview-open' : '',
    rightPanelMode === 'flow' && !isDocx ? 'flow-panel-open' : '',
    leftRailMode !== 'none' ? 'left-panel-open' : '',
    leftRailMode === 'aiWorkbench' ? 'conversation-open' : '',
    shouldShowHtmlPresentation ? 'html-presentation-layout' : '',
    leftResizing !== 'none' ? 'is-left-resizing' : '',
    resizing ? 'is-resizing' : '',
  ].filter(Boolean).join(' ');

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
        onScrollRatio={handleEditorScrollRatio}
        filePath={file.path}
        onAIAction={handleEditorAIAction}
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
        onScrollRatio={handleEditorScrollRatio}
        onAIAction={handleEditorAIAction}
      />
    </Suspense>
  );

  const rightPanel = rightPanelMode === 'word' && !isDocx ? (
    <Suspense fallback={<aside className="word-preview-panel" aria-label={t('wordPreviewAria')} />}>
      <WordPaperPreviewPane
        ref={previewScrollRef}
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
        ref={previewScrollRef}
        source={file.content}
        fileName={file.name}
        onClose={() => setRightPanelMode('none')}
        filePath={file.path}
      />
    </Suspense>
  ) : rightPanelMode === 'flow' && !isDocx ? (
    <aside className="flow-panel" aria-label="AI 工作流">
      <div className="flow-panel-content">
        <SkillHubPanel
          hub={skillHub}
          loadError={skillHubError}
          onPickSkill={handlePickSkill}
          onInstallSkill={handleInstallSkill}
          onSaveHub={handleSaveSkillHub}
          onReload={handleReloadSkillHub}
        />
      </div>
    </aside>
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
    <>
      <AppLayoutChrome
        appStyle={appStyle}
        theme={settings.theme}
        toolbarProps={{
          dirty: file.dirty,
          fileName: file.name,
          editorMode,
          wordPreviewVisible: rightPanelMode === 'word',
          wechatPreviewVisible: rightPanelMode === 'wechat',
          terminalVisible,
          editingDisabled: isDocx,
          flowMode,
          aiPanelVisible: leftRailMode === 'aiWorkbench',
          onToggleEditorMode: handleToggleEditorMode,
          onToggleWordPreview: handleToggleWordPreview,
          onToggleWechatPreview: handleToggleWechatPreview,
          onToggleTerminal: handleToggleTerminal,
          onToggleFlowMode: () => void handleToggleFlowMode(),
          onToggleAiPanel: handleToggleAiPanel,
          onNew: handleNewFile,
          onOpen: handleOpen,
          onSave: handleSave,
          onSaveAs: handleSaveAs,
          onRename: () => handleRequestRename(),
          onOpenSettings: () => {
            void preloadSettingsPage();
            setSettingsVisible(true);
          },
          onPreloadSettings: preloadSettingsPageInBackground,
          updateStatus: updateToolbarStatus,
          onRestartUpdate: handleRestartUpdate,
        }}
        mainContentRef={mainContentRef}
        mainContentClassName={mainContentClassName}
        rightPanelWidth={rightPanelWidth}
        leftRailMode={leftRailMode}
        workspacePanelWidth={workspacePanelWidth}
        leftResizing={leftResizing}
        onToggleWorkspacePanel={handleToggleWorkspacePanel}
        onToggleAiPanel={handleToggleAiPanel}
        conversationPanelProps={{
          conversations: convManager.conversations,
          activeConvId: convManager.activeConvId,
          messages: convManager.messages,
          runState: convManager.runState,
          lastError: convManager.lastError,
          workspaceSuggestion: workspaceRoot || undefined,
          currentFileName: file.path ? file.name : undefined,
          currentFilePath: file.path || undefined,
          currentModel: convManager.activeConv?.currentModel,
          fileContextInjected: convManager.activeConv?.fileContextInjected ?? false,
          hasEditorSelection,
          onInsertToEditor: handleInsertToEditor,
          onReplaceEditorSelection: handleReplaceEditorSelection,
          onReplaceEditorAnchor: handleReplaceEditorAnchor,
          onValidateAnchor: validateEditorAnchor,
          onSelectConversation: convManager.switchConversation,
          onCreateConversation: () => convManager.createConversation(),
          onCloseConversation: convManager.closeConversation,
          onRenameConversation: convManager.renameConversation,
          onSend: convManager.send,
          onCancel: convManager.cancel,
          onReset: convManager.reset,
          onClose: () => setLeftRailMode('none'),
          onConsumePendingInjection: convManager.consumePendingInjection,
          injectionReadyTick: convManager.injectionReadyTick,
          injectionReadyConvId: convManager.injectionReadyConvId,
          skillPrefill,
          onSkillPrefillConsumed: handleSkillPrefillConsumed,
          latestArtifact: artifactItems[0],
          onOpenArtifact: (path) => {
            void handleOpenPath(path).catch((error) => console.warn('Failed to open artifact:', error));
          },
          onArchiveArtifact: handleArchiveArtifact,
        }}
        fileTreeProps={{
          rootPath: workspaceRoot,
          activePath: file.path,
          dirtyPaths,
          agentChangedPaths: new Set(agentChangedPaths.keys()),
          width: workspacePanelWidth,
          refreshKey: workspaceTreeVersion,
          onRootChange: setWorkspaceRoot,
          onOpenFile: (path) => {
            void handleOpenPath(path).catch((error) => console.warn('Failed to open workspace file:', error));
          },
        }}
        onLeftPanelResize={handleLeftPanelResizerPointerDown}
        showToc={!isDocx}
        tocProps={{
          items: toc,
          activeIndex: activeTocIndex,
          pinned: tocPinned,
          alwaysPinned: settings.tocAlwaysPinned,
          onPinnedChange: handleTocPinnedChange,
          onAlwaysPinnedChange: handleTocAlwaysPinnedChange,
          onNavigate: handleTocNavigate,
        }}
        externalChangeConflict={externalChangeConflict}
        onViewDiff={() => void handleViewDiff()}
        onAcceptExternal={() => void handleAcceptExternal()}
        onKeepMine={handleKeepMine}
        shouldShowTabbar={shouldShowTabbar}
        openTabs={openTabs}
        activeTabId={activeTabId}
        renameTitle={t('toolbarRenameTitle')}
        renameTitleUnsaved={t('toolbarRenameTitleUnsaved')}
        onSwitchTab={handleSwitchTab}
        onRequestRename={handleRequestRename}
        onCloseTab={handleCloseTab}
        isDocx={isDocx}
        editorPane={editorPane}
        docxPane={docxPane}
        rightPanelMode={rightPanelMode}
        resizing={resizing}
        rightPanelResizeLabel={t('rightPanelResizeLabel')}
        rightPanelResizeTitle={t('rightPanelResizeTitle')}
        onRightPanelResize={handleRightPanelResizerPointerDown}
        onResetRightPanelWidth={() => setRightPanelWidth(getDefaultRightPanelWidth())}
        rightPanel={rightPanel}
        onSetRightPanelMode={setRightPanelMode}
        terminalNode={(
          <Suspense fallback={null}>
            <TerminalPanel
              ref={terminalPanelRef}
              visible={terminalVisible}
              height={terminalHeight}
              currentFilePath={file.path}
              workspaceRoot={workspaceRoot || undefined}
              createRequest={terminalCreateRequest}
              onHeightChange={setTerminalHeight}
              onHide={() => setTerminalVisible(false)}
            />
          </Suspense>
        )}
        statusBarNode={(
          <StatusBar
            filePath={file.path}
            dirty={file.dirty}
            message={autoSaveError || diskChangeMessage || transientMessage}
            stats={documentStats}
          />
        )}
      />
      <AppLayoutOverlays
        findVisible={findVisible}
        findFocusTarget={findFocusTarget}
        source={file.content}
        readOnly={isDocx}
        onCloseFind={() => setFindVisible(false)}
        onReplaceSource={replaceCurrentContent}
        onNavigate={handleSearchNavigate}
        quickOpenVisible={quickOpenVisible}
        recentFiles={recentFiles}
        onCloseQuickOpen={() => setQuickOpenVisible(false)}
        onQuickOpen={handleQuickOpenPath}
        artifactPreviewNode={artifactItems.length > 0 ? (
          <Suspense fallback={null}>
            <ArtifactPreview
              artifacts={artifactItems}
              onOpenFile={(path) => {
                void handleOpenPath(path).catch((error) => console.warn('Failed to open artifact:', error));
              }}
              onArchiveFile={(path) => {
                void handleArchiveArtifact(path);
              }}
              onDeleteFile={(path) => {
                void (async () => {
                  const confirmed = await confirmDialog(`确定删除「${path.split(/[\\/]/).pop()}」？删除后不可恢复。`, {
                    title: '删除产物',
                    okLabel: '删除',
                    cancelLabel: '取消',
                  });
                  if (!confirmed) return;
                  try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('delete_artifact_file', { request: { path, workspaceRoot: settings.aiWorkspaceRoot } });
                    forgetArtifact(path);
                    setTransientMessage(`已删除：${path.split(/[\\/]/).pop()}`);
                  } catch (error) {
                    await messageDialog(String(error), { title: '删除失败' });
                  }
                })();
              }}
              onClose={handleClearArtifacts}
            />
          </Suspense>
        ) : null}
        settingsNode={settingsVisible ? (
          <Suspense fallback={<SettingsPageFallback />}>
            <SettingsPage
              onClose={() => {
                setSettingsVisible(false);
                setSettingsInitialSection(undefined);
              }}
              onUpdateAvailable={(update) => startBackgroundUpdateDownload('manual', update)}
              initialSection={settingsInitialSection}
            />
          </Suspense>
        ) : null}
        unsavedDialog={unsavedDialog}
        onUnsavedChoice={handleUnsavedChoice}
        renameDialog={renameDialog}
        setRenameDialog={setRenameDialog}
        onConfirmRename={() => void handleConfirmRename()}
        diffPreview={diffPreview}
        setDiffPreview={setDiffPreview}
      />
    </>
  );
}
