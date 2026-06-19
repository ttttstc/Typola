import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FolderOpen, Sparkles } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
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
import { messageDialog } from '../services/dialogService';
import { UnsavedChangesDialog, type UnsavedDecision } from '../components/UnsavedChangesDialog';
import { Toolbar, type EditorMode } from '../components/Toolbar';
import { StatusBar } from '../components/StatusBar';
import { FloatingToc } from '../components/FloatingToc';
import { FindReplacePanel } from '../components/FindReplacePanel';
import { QuickOpenPanel } from '../components/QuickOpenPanel';
import { EditAssistPanel } from '../components/EditAssistPanel';
import { FileTreePanel } from '../components/FileTreePanel';
import { ConversationPanel } from '../components/conversation/ConversationPanel';
import type { SourceHeadingScrollRequest } from '../components/EditorPane';
import type { EditorCommandHandle } from '../types/editorCommands';
import type { PreviewScrollHandle } from '../types/previewScroll';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { calculateDocumentStats } from '../services/documentStatsService';
import { addRecentFile, getRecentFiles, removeRecentFile, type RecentFile } from '../services/recentFilesService';
import { createImageMarkdown, createLinkMarkdown, createTableMarkdown } from '../services/editAssistService';
import { createAgentBridge } from '../services/agentBridge';
import { filterSelfWritePaths } from '../services/selfWriteFilter';
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
type TerminalPanelHandle = import('../components/TerminalPanel').TerminalPanelHandle;
const ScenarioPanel = lazy(() =>
  import('../components/ScenarioPanel').then((module) => ({ default: module.ScenarioPanel })),
);
type AgentBridge = import('../services/agentBridge').AgentBridge;
const ArtifactPreview = lazy(() =>
  import('../components/ArtifactPreview').then((module) => ({ default: module.ArtifactPreview })),
);
type ArtifactItem = import('../components/ArtifactPreview').ArtifactItem;

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
type RightPanelMode = 'none' | 'word' | 'wechat' | 'flow';
type LeftRailMode = 'none' | 'workspace' | 'aiWorkbench';
type FlowRightTab = 'scenario' | 'preview';
type OpenFileTab = {
  id: string;
  file: OpenedFile;
};
type UpdateInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'ready'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'installing'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'error'; source: UpdateSource; update?: AvailableUpdate; message: string };

const RIGHT_PANEL_MIN_WIDTH = 320;
const RIGHT_PANEL_MAX_WIDTH = 760;
const RIGHT_PANEL_RESIZER_GAP = 9;
const LEFT_PANEL_MIN_WIDTH = 220;
const LEFT_PANEL_MAX_WIDTH = 560;
const WORKSPACE_PANEL_DEFAULT_WIDTH = 366;
const FLOW_LEFT_PANEL_WIDTH = 366;
const FLOW_RIGHT_PANEL_WIDTH = 456;

function pathBasename(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
}

function joinLocalPath(root: string, ...parts: string[]): string {
  const separator = root.includes('\\') ? '\\' : '/';
  return [
    root.replace(/[\\/]+$/u, ''),
    ...parts.map((part) => part.replace(/^[\\/]+|[\\/]+$/gu, '')),
  ].filter(Boolean).join(separator);
}

function pathStartsWith(path: string, root: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/u, '').toLowerCase();
  const normalizedPath = normalize(path);
  const normalizedRoot = normalize(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

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

function fileTabId(file: OpenedFile, fallback = ''): string {
  return file.path || fallback || `untitled-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AppLayout() {
  const settings = useSettings();
  const isTauriRuntime = '__TAURI_INTERNALS__' in window;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const reopenAttempted = useRef(false);
  const autoUpdateCheckStarted = useRef(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  const windowCloseInProgressRef = useRef(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const editorCommandRef = useRef<EditorCommandHandle | null>(null);
  const previewScrollRef = useRef<PreviewScrollHandle | null>(null);
  const terminalPanelRef = useRef<TerminalPanelHandle | null>(null);
  const handleEditorScrollRatio = useCallback((ratio: number) => {
    previewScrollRef.current?.scrollToRatio(ratio);
  }, []);
  const fileRef = useRef<OpenedFile>(createEmptyFile());
  const openTabsRef = useRef<OpenFileTab[]>([]);
  const activeTabIdRef = useRef('');
  const defaultEncodingRef = useRef(settings.defaultEncoding);
  const autoSaveFailureRef = useRef({ key: '', count: 0, suspended: false });
  const lastSelfWriteRef = useRef({ path: '', at: 0 });
  const dirtyFilesRef = useRef(false);
  const untitledCounterRef = useRef(1);
  const [file, setFile] = useState<OpenedFile>(createEmptyFile());
  const [openTabs, setOpenTabs] = useState<OpenFileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>('none');
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(WORKSPACE_PANEL_DEFAULT_WIDTH);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocSessionPinned, setTocSessionPinned] = useState(false);
  const [activeTocIndex, setActiveTocIndex] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  // P1-E:从外部(场景卡)跳转时指定的初始段
  const [settingsInitialSection, setSettingsInitialSection] = useState<'aiCli' | undefined>(undefined);
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
  const [leftResizing, setLeftResizing] = useState<LeftRailMode>('none');
  const [htmlPresentationVisible, setHtmlPresentationVisible] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [terminalCreateRequest, setTerminalCreateRequest] = useState(0);
  // 每次启动都从阅读器模式起步:进入心流模式的副作用(maximize + 开面板)只在用户点
  // 按钮时跑,如果初始化时从 settings 把 flowMode 设成 true,按钮会亮但布局还是阅读器,
  // 状态与可见态不一致。阅读器是基础态,所以不持久化心流偏好。
  const [flowMode, setFlowMode] = useState(false);
  const [flowRightTab, setFlowRightTab] = useState<FlowRightTab>('scenario');
  const [agentChangedPaths, setAgentChangedPaths] = useState<Map<string, number>>(new Map());
  const [externalChangeConflict, setExternalChangeConflict] = useState<{ path: string; ts: number } | null>(null);
  const [hasEditorSelection, setHasEditorSelection] = useState(false);
  const flowSnapshotRef = useRef<{
    leftRailMode: LeftRailMode;
    rightPanelMode: RightPanelMode;
    rightPanelWidth: number;
    terminalVisible: boolean;
    maximized: boolean;
  } | null>(null);
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
  const agentOutputRoot = useMemo(() => (
    settings.aiWorkspaceRoot
      ? joinLocalPath(settings.aiWorkspaceRoot, '.typola-output', 'ai-workbench')
      : undefined
  ), [settings.aiWorkspaceRoot]);

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    dirtyFilesRef.current = file.dirty || openTabs.some((candidate) => candidate.file.dirty);
  }, [file.dirty, openTabs]);

  useEffect(() => {
    if (!activeTabId) return;
    setOpenTabs((tabs) => tabs.map((tab) => (
      tab.id === activeTabId ? { ...tab, file } : tab
    )));
  }, [activeTabId, file]);

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

  const applyOpenedFile = useCallback((opened: OpenedFile, path?: string) => {
    const id = fileTabId(opened, path);
    setOpenTabs((tabs) => {
      const existingIndex = tabs.findIndex((tab) => (
        opened.path && tab.file.path && sameDocumentPath(opened.path, tab.file.path)
      ));
      if (existingIndex >= 0) {
        return tabs.map((tab, index) => index === existingIndex ? { id: tab.id, file: opened } : tab);
      }
      return [...tabs, { id, file: opened }];
    });
    setActiveTabId(() => {
      const existing = openTabs.find((tab) => opened.path && tab.file.path && sameDocumentPath(opened.path, tab.file.path));
      return existing?.id ?? id;
    });
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
  }, [openTabs]);

  const handleOpen = useCallback(async () => {
    const { openFile } = await import('../services/fileService');
    const opened = await openFile(defaultEncodingRef.current);
    if (opened) applyOpenedFile(opened);
  }, [applyOpenedFile]);

  const handleNewFile = useCallback(() => {
    const index = untitledCounterRef.current++;
    const name = index === 1 ? '未命名.md' : `未命名 ${index}.md`;
    applyOpenedFile(createEmptyFile(name), `untitled-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }, [applyOpenedFile]);

  const handleOpenPath = useCallback(async (path: string) => {
    const { openPath } = await import('../services/fileService');
    try {
      const opened = await openPath(path, defaultEncodingRef.current);
      applyOpenedFile(opened, path);
    } catch (error) {
      removeRecentFile(path);
      setTransientMessage('打开失败，已从最近文件移除。');
      throw error;
    }
  }, [applyOpenedFile]);

  const handleSwitchTab = useCallback((tabId: string) => {
    const tab = openTabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    setActiveTabId(tab.id);
    setFile(tab.file);
    setToc(tab.file.fileType === 'docx' ? [] : extractToc(tab.file.content));
    setDiskChangeMessage('');
    setTransientMessage('');
    setFindVisible(false);
    setHtmlPresentationVisible(false);
    if (tab.file.fileType === 'docx') {
      setRightPanelMode('none');
    }
  }, [openTabs]);

  const closeTypolaWindow = useCallback((appWindow: ReturnType<typeof getCurrentWindow>) => {
    windowCloseInProgressRef.current = true;
    void appWindow.destroy().catch(async (error) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('force_close_main_window');
      } catch (fallbackError) {
        windowCloseInProgressRef.current = false;
        console.warn('Failed to close Typola window:', error, fallbackError);
      }
    });
  }, []);

  const saveDirtyFilesBeforeClose = useCallback(async () => {
    const { saveFile } = await import('../services/fileService');
    const activeId = activeTabIdRef.current;
    const tabs = openTabsRef.current.map((tab) => (
      tab.id === activeId ? { ...tab, file: fileRef.current } : tab
    ));
    const dirtyTabs = tabs.filter((tab) => tab.file.dirty && tab.file.fileType !== 'docx');

    for (const tab of dirtyTabs) {
      const updated = await saveFile(tab.file);
      if (updated.dirty) return false;
      lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
      setOpenTabs((currentTabs) => currentTabs.map((candidate) => (
        candidate.id === tab.id ? { ...candidate, file: updated } : candidate
      )));
      if (tab.id === activeId) {
        setFile(updated);
        if (updated.path) setLastOpenedPath(updated.path);
      }
    }

    autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
    setAutoSaveError('');
    setDiskChangeMessage('');
    dirtyFilesRef.current = false;
    return true;
  }, []);

  const [unsavedDialog, setUnsavedDialog] = useState<{ message: string } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ tabId: string; name: string; error?: string } | null>(null);
  const unsavedResolverRef = useRef<((decision: UnsavedDecision) => void) | null>(null);

  const requestUnsavedChoice = useCallback((message: string) => {
    return new Promise<UnsavedDecision>((resolve) => {
      // 已有未决弹窗时,先把旧的 resolve 为 cancel,避免 Promise 泄漏
      unsavedResolverRef.current?.('cancel');
      unsavedResolverRef.current = resolve;
      setUnsavedDialog({ message });
    });
  }, []);

  const handleUnsavedChoice = useCallback((decision: UnsavedDecision) => {
    setUnsavedDialog(null);
    const resolve = unsavedResolverRef.current;
    unsavedResolverRef.current = null;
    resolve?.(decision);
  }, []);

  const confirmCloseWithDirtyFiles = useCallback(async () => {
    if (!dirtyFilesRef.current) return true;
    const dirtyTabs = openTabsRef.current.filter((tab) => tab.file.dirty && tab.file.fileType !== 'docx');
    const liveActive = fileRef.current;
    const liveActiveDirty = liveActive.dirty && liveActive.fileType !== 'docx';
    const dirtyCount = Math.max(dirtyTabs.length, liveActiveDirty ? 1 : 0);
    const message = dirtyCount > 1
      ? `有 ${dirtyCount} 个文档存在未保存的修改，是否保存后关闭？`
      : `“${liveActive.name}” 有未保存的修改，是否保存后关闭？`;
    const choice = await requestUnsavedChoice(message);
    if (choice === 'cancel') return false;
    if (choice === 'discard') return true;
    try {
      return await saveDirtyFilesBeforeClose();
    } catch (error) {
      console.warn('Failed to save before closing:', error);
      await messageDialog('保存失败，已取消关闭。请检查文件权限或磁盘状态后重试。', { title: '保存失败' });
      return false;
    }
  }, [requestUnsavedChoice, saveDirtyFilesBeforeClose]);

  const confirmCloseTabWithDirtyFile = useCallback(async (targetFile: OpenedFile) => {
    if (!targetFile.dirty || targetFile.fileType === 'docx') return true;
    const choice = await requestUnsavedChoice(`“${targetFile.name}” 有未保存的修改，是否保存后关闭？`);
    if (choice === 'cancel') return false;
    if (choice === 'discard') return true;
    try {
      const { saveFile } = await import('../services/fileService');
      const updated = await saveFile(targetFile);
      if (updated.dirty) return false;
      lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
      autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
      setAutoSaveError('');
      setDiskChangeMessage('');
      return true;
    } catch (error) {
      console.warn('Failed to save before closing tab:', error);
      await messageDialog('保存失败，已取消关闭标签页。请检查文件权限或磁盘状态后重试。', { title: '保存失败' });
      return false;
    }
  }, [requestUnsavedChoice]);

  useEffect(() => {
    if (!isTauriRuntime) return undefined;
    const appWindow = getCurrentWindow();
    if (typeof appWindow.onCloseRequested !== 'function') return undefined;
    let unlisten: (() => void) | undefined;
    void appWindow.onCloseRequested((event) => {
      if (windowCloseInProgressRef.current) return;
      event.preventDefault();
      void confirmCloseWithDirtyFiles().then((shouldClose) => {
        if (shouldClose) {
          closeTypolaWindow(appWindow);
        }
      });
    }).then((listener) => {
      unlisten = listener;
    });
    return () => unlisten?.();
  }, [closeTypolaWindow, confirmCloseWithDirtyFiles, isTauriRuntime]);

  const handleCloseTab = useCallback((tabId: string) => {
    const tab = openTabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    const liveTabFile = activeTabId === tabId ? fileRef.current : tab.file;
    void confirmCloseTabWithDirtyFile(liveTabFile).then((shouldClose) => {
      if (!shouldClose) return;
      const removedIndex = openTabs.findIndex((candidate) => candidate.id === tabId);
      const nextTabs = openTabs.filter((candidate) => candidate.id !== tabId);
      setOpenTabs(nextTabs);
      if (activeTabId !== tabId) return;
      const nextActive = nextTabs[Math.max(0, removedIndex - 1)] ?? nextTabs[0];
      if (nextActive) {
        setActiveTabId(nextActive.id);
        setFile(nextActive.file);
        setToc(nextActive.file.fileType === 'docx' ? [] : extractToc(nextActive.file.content));
      } else {
        setActiveTabId('');
        setFile(createEmptyFile());
        setToc([]);
      }
    });
  }, [activeTabId, confirmCloseTabWithDirtyFile, openTabs]);

  const handleRequestRename = useCallback((tabId = activeTabIdRef.current) => {
    const target = openTabsRef.current.find((tab) => tab.id === tabId);
    const targetFile = target?.file ?? fileRef.current;
    if (!targetFile.path) {
      setRenameDialog({ tabId, name: targetFile.name, error: '未保存文档请先保存后再重命名。' });
      return;
    }
    setRenameDialog({ tabId, name: targetFile.name });
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renameDialog) return;
    const target = openTabsRef.current.find((tab) => tab.id === renameDialog.tabId);
    const targetFile = target?.file ?? fileRef.current;
    if (!targetFile.path) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ path: string; name: string }>('rename_opened_document', {
        request: { path: targetFile.path, newName: renameDialog.name },
      });
      const updatedFile = { ...targetFile, path: result.path, name: result.name };
      const nextId = fileTabId(updatedFile, result.path);
      setOpenTabs((tabs) => tabs.map((tab) => (
        tab.id === renameDialog.tabId ? { id: nextId, file: updatedFile } : tab
      )));
      if (activeTabIdRef.current === renameDialog.tabId) {
        setActiveTabId(nextId);
        setFile(updatedFile);
        setLastOpenedPath(result.path);
      }
      addRecentFile(result.path, result.name);
      setRenameDialog(null);
      setTransientMessage('已重命名文件。');
    } catch (error) {
      setRenameDialog((current) => current
        ? { ...current, error: error instanceof Error ? error.message : String(error) }
        : current);
    }
  }, [renameDialog]);

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

  const handleToggleWorkspacePanel = useCallback(() => {
    setLeftRailMode((mode) => mode === 'workspace' ? 'none' : 'workspace');
  }, []);

  const handleToggleAiPanel = useCallback(() => {
    if (fileRef.current.fileType === 'docx') return;
    setLeftRailMode((mode) => mode === 'aiWorkbench' ? 'none' : 'aiWorkbench');
  }, []);

  const handleToggleFlowMode = useCallback(async () => {
    if (file.fileType === 'docx') return;

    if (!flowMode) {
      // Enter flow mode: snapshot → maximize → open left rail and right workflow panel.
      let maximized = false;
      if (isTauriRuntime) {
        try {
          const appWindow = getCurrentWindow();
          maximized = await appWindow.isMaximized();
          if (!maximized) await appWindow.maximize();
        } catch { /* ignore */ }
      }

      flowSnapshotRef.current = {
        leftRailMode,
        rightPanelMode,
        rightPanelWidth,
        terminalVisible,
        maximized,
      };

      setLeftRailMode('workspace');
      setWorkspacePanelWidth((width) => Math.max(width, FLOW_LEFT_PANEL_WIDTH));
      setRightPanelMode('flow');
      setFlowRightTab('scenario');
      setRightPanelWidth(FLOW_RIGHT_PANEL_WIDTH);
      setFlowMode(true);
    } else {
      // Exit flow mode: restore snapshot
      const snapshot = flowSnapshotRef.current;

      if (isTauriRuntime) {
        try {
          const appWindow = getCurrentWindow();
          const currentlyMaximized = await appWindow.isMaximized();
          if (currentlyMaximized && !snapshot?.maximized) {
            await appWindow.unmaximize();
          }
        } catch { /* ignore */ }
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
    }
  }, [
    flowMode, leftRailMode, rightPanelMode, rightPanelWidth, terminalVisible,
    file.fileType, isTauriRuntime, getDefaultRightPanelWidth,
  ]);

  const handleCreateTerminal = useCallback(() => {
    setTerminalVisible(true);
    setTerminalCreateRequest((request) => request + 1);
  }, []);

  const refreshEditorSelectionState = useCallback(() => {
    setHasEditorSelection(Boolean(editorCommandRef.current?.getSelection()));
  }, []);

  const handleInsertToEditor = useCallback((text: string) => {
    editorCommandRef.current?.insertText(text);
    refreshEditorSelectionState();
  }, [refreshEditorSelectionState]);

  const handleReplaceEditorSelection = useCallback((text: string) => {
    const editor = editorCommandRef.current;
    if (!editor) return;
    if (editor.getSelection()) editor.replaceSelection(text);
    else editor.insertText(text);
    refreshEditorSelectionState();
  }, [refreshEditorSelectionState]);

  useEffect(() => {
    const scheduleRefresh = () => window.requestAnimationFrame(refreshEditorSelectionState);
    document.addEventListener('selectionchange', scheduleRefresh);
    window.addEventListener('keyup', scheduleRefresh);
    window.addEventListener('mouseup', scheduleRefresh);
    return () => {
      document.removeEventListener('selectionchange', scheduleRefresh);
      window.removeEventListener('keyup', scheduleRefresh);
      window.removeEventListener('mouseup', scheduleRefresh);
    };
  }, [refreshEditorSelectionState]);

  const handleEnsureTerminalVisible = useCallback(() => {
    setTerminalVisible(true);
  }, []);

  // P1-E:场景卡发现 Claude CLI 未找到 → 跳设置面板 AI CLI 段
  const handleOpenAiCliSettings = useCallback(() => {
    void preloadSettingsPage();
    setSettingsInitialSection('aiCli');
    setSettingsVisible(true);
  }, []);

  // 场景卡「发送到终端」前置: 发送即存盘
  const handleScenarioBeforeInject = useCallback(async () => {
    if (file.fileType === 'docx' || !file.path || !file.dirty) return;
    const { saveFile } = await import('../services/fileService');
    const updated = await saveFile(file);
    lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
    setAutoSaveError('');
    setDiskChangeMessage('');
    setFile(updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file]);

  // bridge 每次渲染现取 ref —— ref.current 变化不触发重渲染,所以必须用 getter 闭包
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const agentBridge = useMemo<AgentBridge>(
    () => createAgentBridge(() => terminalPanelRef.current),
    [],
  );

  // §6.2 文件树刷新触发: workspace watcher 触发时自增
  const [workspaceTreeVersion, setWorkspaceTreeVersion] = useState(0);

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
      .then(({ onFileChanged }) => onFileChanged(async (payload) => {
        const current = fileRef.current;
        if (!current.path || !sameDocumentPath(current.path, payload.path)) return;

        const lastSelfWrite = lastSelfWriteRef.current;
        if (sameDocumentPath(lastSelfWrite.path, payload.path) && Date.now() - lastSelfWrite.at < 1500) {
          return;
        }

        if (current.dirty) {
          // 写竞争:有未保存改动,弹"外部已修改"条,绝不覆盖
          setExternalChangeConflict({ path: payload.path, ts: Date.now() });
          return;
        }

        // 编辑器干净:自动 reload
        try {
          const { readTextWithEncoding } = await import('../services/fileService');
          const content = await readTextWithEncoding(payload.path, settings.defaultEncoding);
          if (fileRef.current.path && sameDocumentPath(fileRef.current.path, payload.path)
              && !fileRef.current.dirty) {
            setFile((prev) => ({
              ...prev,
              content,
              lastSavedContent: content,
              dirty: false,
            }));
            setToc(extractToc(content));
            setDiskChangeMessage('');
            setTransientMessage('已自动从磁盘重新加载。');
          }
        } catch (error) {
          console.warn('Failed to auto-reload file:', error);
          setDiskChangeMessage('磁盘文件已在外部变更，请保存前确认是否需要重新打开。');
        }
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
  }, [isTauriRuntime, settings.defaultEncoding]);

  // M2-B2: 收集 AI 暂存区产物。AI 工作台 cwd 独立于文件树 workspaceRoot。
  useEffect(() => {
    const watchRoot = settings.aiWorkspaceRoot;
    const outputRoot = agentOutputRoot;
    if (!isTauriRuntime || !watchRoot || !outputRoot) {
      setAgentChangedPaths(new Map());
      return undefined;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import('../services/workspaceWatchService')
      .then(async ({ watchWorkspace, onWorkspaceChanged }) => {
        await watchWorkspace(watchRoot);
        return onWorkspaceChanged((payload) => {
          // P0-B: 自写抑制,与 document watcher 路径同模式(`AppLayout.tsx:1116-1119`)。
          // 局限:lastSelfWriteRef 是单槽、只记最后一次自写;多文件并发自写仍可能漏抑制。
          // MVP 可接受(与编辑器自写抑制同款),Phase 2 升级为「最近写入路径集合(带 TTL)」。
          const now = Date.now();
          const paths = filterSelfWritePaths(payload.paths, lastSelfWriteRef.current, now);
          const artifactPaths = paths.filter((path) => pathStartsWith(path, outputRoot));
          if (artifactPaths.length === 0) return;
          setAgentChangedPaths((prev) => {
            const next = new Map(prev);
            for (const path of artifactPaths) {
              next.set(path, now);
            }
            return next;
          });
          // 新建/删除/重命名都会让顶层 entries 变化,触发文件树重读
          if (payload.kind === 'create' || payload.kind === 'remove' || payload.kind === 'rename') {
            setWorkspaceTreeVersion((version) => version + 1);
          }
        });
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) => console.warn('Failed to bind workspace watcher:', error));

    return () => {
      cancelled = true;
      unlisten?.();
      void import('../services/workspaceWatchService')
        .then(({ unwatchWorkspace }) => unwatchWorkspace(watchRoot))
        .catch((error) => console.warn('Failed to unwatch workspace:', error));
    };
  }, [agentOutputRoot, isTauriRuntime, settings.aiWorkspaceRoot]);

  // 写竞争:三选项
  const handleViewDiff = useCallback(async () => {
    if (!externalChangeConflict) return;
    const { diffTexts } = await import('../services/textDiffService');
    const current = fileRef.current;
    if (!current.path) return;
    try {
      const { readTextWithEncoding } = await import('../services/fileService');
      const diskContent = await readTextWithEncoding(current.path, settings.defaultEncoding);
      const result = diffTexts(current.content, diskContent);
      setDiffPreview({ path: current.path, ...result });
    } catch (e) {
      console.warn('Failed to view diff:', e);
    }
  }, [externalChangeConflict, settings.defaultEncoding]);

  const handleAcceptExternal = useCallback(async () => {
    if (!externalChangeConflict) return;
    const current = fileRef.current;
    if (!current.path) {
      setExternalChangeConflict(null);
      return;
    }
    try {
      const { readTextWithEncoding } = await import('../services/fileService');
      const content = await readTextWithEncoding(current.path, settings.defaultEncoding);
      setFile((prev) => ({
        ...prev,
        content,
        lastSavedContent: content,
        dirty: false,
      }));
      setToc(extractToc(content));
      setExternalChangeConflict(null);
      setTransientMessage('已采用 Claude 的版本。');
    } catch (e) {
      console.warn('Failed to accept external:', e);
    }
  }, [externalChangeConflict, settings.defaultEncoding]);

  const handleKeepMine = useCallback(() => {
    setExternalChangeConflict(null);
    setTransientMessage('保留你的版本。可在保存前对比。');
  }, []);

  const [diffPreview, setDiffPreview] = useState<{ path: string; hunks: import('../services/textDiffService').DiffHunk[] } | null>(null);

  const artifactItems = useMemo<ArtifactItem[]>(() => {
    const items: ArtifactItem[] = [];
    agentChangedPaths.forEach((ts, path) => {
      const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
      const lower = name.toLowerCase();
      let kind: ArtifactItem['kind'] = 'other';
      if (lower.endsWith('.md') || lower.endsWith('.markdown')) kind = 'markdown';
      else if (lower.endsWith('.html') || lower.endsWith('.htm')) kind = 'html';
      else if (lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.css') || lower.endsWith('.js')) kind = 'text';
      items.push({ path, name, ts, kind });
    });
    return items.sort((a, b) => b.ts - a.ts);
  }, [agentChangedPaths]);

  const handleClearArtifacts = useCallback(() => {
    setAgentChangedPaths(new Map());
  }, []);

  const handleAgentArtifactFile = useCallback((artifact: { path: string }) => {
    const outputRoot = agentOutputRoot;
    const path = artifact.path;
    if (!outputRoot || !pathStartsWith(path, outputRoot)) return;
    setAgentChangedPaths((prev) => {
      const next = new Map(prev);
      next.set(path, Date.now());
      return next;
    });
  }, [agentOutputRoot]);

  const handleArchiveArtifact = useCallback(async (artifactPath: string) => {
    const workspaceRoot = settings.aiWorkspaceRoot;
    if (!workspaceRoot) {
      await messageDialog('请先在 AI 工作台选择工作区，再保存产物。', { title: '保存产物' });
      return;
    }
    try {
      const archivedPath = await invoke<string>('archive_artifact_to_workspace', {
        request: { artifactPath, workspaceRoot },
      });
      setAgentChangedPaths((prev) => {
        const next = new Map(prev);
        next.delete(artifactPath);
        return next;
      });
      setWorkspaceTreeVersion((version) => version + 1);
      await handleOpenPath(archivedPath);
      setTransientMessage(`已保存到工作区：${pathBasename(archivedPath)}`);
    } catch (error) {
      await messageDialog(String(error), { title: '保存产物失败' });
    }
  }, [handleOpenPath, settings.aiWorkspaceRoot]);

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
  const shouldShowTabbar = openTabs.length > 1 || (openTabs.length === 1 && activeTabId !== '');
  const tocPinned = tocSessionPinned || settings.tocAlwaysPinned;
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

  const handleLeftPanelResizerPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (leftRailMode === 'none') return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = workspacePanelWidth;
    setLeftResizing('workspace');

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        LEFT_PANEL_MAX_WIDTH,
        Math.max(LEFT_PANEL_MIN_WIDTH, startWidth + moveEvent.clientX - startX),
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
  }, [leftRailMode, workspacePanelWidth]);

  const dirtyPaths = useMemo(() => new Set(
    openTabs
      .filter((tab) => tab.file.dirty && tab.file.path)
      .map((tab) => tab.file.path),
  ), [openTabs]);

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
        onScrollRatio={handleEditorScrollRatio}
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
      <div className="flow-panel-tabs">
        <button
          type="button"
          className={flowRightTab === 'scenario' ? 'active' : ''}
          onClick={() => setFlowRightTab('scenario')}
        >
          {t('flowRightTabScenario')}
        </button>
        <button
          type="button"
          className={flowRightTab === 'preview' ? 'active' : ''}
          onClick={() => setFlowRightTab('preview')}
        >
          {t('flowRightTabPreview')}
        </button>
        <button
          type="button"
          className="flow-panel-close"
          onClick={() => setRightPanelMode('none')}
          title={t('closePreviewTitle')}
        >
          ×
        </button>
      </div>
      <div className="flow-panel-content">
        {flowRightTab === 'scenario' ? (
          <Suspense fallback={<div className="scenario-panel-skeleton">加载场景...</div>}>
            <ScenarioPanel
              bridge={agentBridge}
              filePath={file.path}
              workspaceRoot={workspaceRoot}
              onEnsureTerminalVisible={handleEnsureTerminalVisible}
              onBeforeInject={handleScenarioBeforeInject}
              onOpenAiCliSettings={handleOpenAiCliSettings}
            />
          </Suspense>
        ) : (
          <div className="scenario-panel-skeleton">AI 产物会以右下角文件 chips 显示，点击后在中间编辑器打开。</div>
        )}
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
    <div className="app-layout" data-theme={settings.theme} style={appStyle}>
      <Toolbar
        dirty={file.dirty}
        fileName={file.name}
        editorMode={editorMode}
        wordPreviewVisible={rightPanelMode === 'word'}
        wechatPreviewVisible={rightPanelMode === 'wechat'}
        terminalVisible={terminalVisible}
        editingDisabled={isDocx}
        flowMode={flowMode}
        aiPanelVisible={leftRailMode === 'aiWorkbench'}
        onToggleEditorMode={handleToggleEditorMode}
        onToggleWordPreview={handleToggleWordPreview}
        onToggleWechatPreview={handleToggleWechatPreview}
        onToggleTerminal={handleToggleTerminal}
        onToggleFlowMode={() => void handleToggleFlowMode()}
        onToggleAiPanel={handleToggleAiPanel}
        onNew={handleNewFile}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onRename={() => handleRequestRename()}
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
        <button
          type="button"
          className={`workspace-toggle-rail ${leftRailMode === 'workspace' ? 'active' : ''}`}
          onClick={handleToggleWorkspacePanel}
          aria-label={leftRailMode === 'workspace' ? '收起目录栏' : '展开目录栏'}
          title={leftRailMode === 'workspace' ? '收起目录栏' : '展开目录栏'}
        >
          <FolderOpen size={15} />
        </button>
        {leftRailMode !== 'none' && (
          <>
            <aside className="left-rail-shell" style={{ width: workspacePanelWidth }}>
              <div className="left-rail-tabs" role="tablist" aria-label="左侧栏切换">
                <button
                  type="button"
                  className={leftRailMode === 'workspace' ? 'active' : ''}
                  onClick={handleToggleWorkspacePanel}
                  aria-label={leftRailMode === 'workspace' ? '收起文件树' : '打开文件树'}
                  title={leftRailMode === 'workspace' ? '收起文件树' : '打开文件树'}
                >
                  <FolderOpen size={15} />
                  <span>文件树</span>
                </button>
                <button
                  type="button"
                  className={leftRailMode === 'aiWorkbench' ? 'active' : ''}
                  onClick={handleToggleAiPanel}
                  aria-label={leftRailMode === 'aiWorkbench' ? '收起 AI 工作台' : '打开 AI 工作台'}
                  title={leftRailMode === 'aiWorkbench' ? '收起 AI 工作台' : '打开 AI 工作台'}
                >
                  <Sparkles size={15} />
                  <span>AI 工作台</span>
                </button>
              </div>
              {leftRailMode === 'aiWorkbench' ? (
                <ConversationPanel
                  conversationId="ai-workbench"
                  workspaceSuggestion={workspaceRoot || undefined}
                  agentPath={settings.aiClaudePath}
                  model={settings.aiClaudeModel}
                  pluginDirs={settings.aiPluginDirs}
                  currentFileName={file.path ? file.name : undefined}
                  currentFilePath={file.path || undefined}
                  hasEditorSelection={hasEditorSelection}
                  onInsertToEditor={handleInsertToEditor}
                  onReplaceEditorSelection={handleReplaceEditorSelection}
                  onArtifactFile={handleAgentArtifactFile}
                  onClose={() => setLeftRailMode('none')}
                />
              ) : (
                <FileTreePanel
                  rootPath={workspaceRoot}
                  activePath={file.path}
                  dirtyPaths={dirtyPaths}
                  agentChangedPaths={new Set(agentChangedPaths.keys())}
                  width={workspacePanelWidth}
                  refreshKey={workspaceTreeVersion}
                  onRootChange={setWorkspaceRoot}
                  onOpenFile={(path) => {
                    void handleOpenPath(path).catch((error) => console.warn('Failed to open workspace file:', error));
                  }}
                />
              )}
            </aside>
            <div
              className={`left-panel-resizer ${leftResizing === 'workspace' ? 'dragging' : ''}`}
              role="separator"
              aria-label="调整目录栏宽度"
              aria-orientation="vertical"
              title="拖拽调整目录栏宽度"
              onPointerDown={handleLeftPanelResizerPointerDown}
            />
          </>
        )}
        {!isDocx && (
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
          </>
        )}
        <section className="editor-workbench">
          {externalChangeConflict && (
            <div className="external-change-conflict" role="alert">
              <span className="external-change-text">
                Claude 改了这个文件,你有未保存修改
              </span>
              <button type="button" onClick={() => void handleViewDiff()}>
                查看差异
              </button>
              <button type="button" onClick={() => void handleAcceptExternal()}>
                用 Claude 的版本
              </button>
              <button type="button" onClick={handleKeepMine}>
                保留我的
              </button>
            </div>
          )}
          {shouldShowTabbar && (
            <div className="editor-tabbar" role="tablist" aria-label="打开的文件">
              {openTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`editor-tab ${tab.id === activeTabId ? 'active' : ''}`}
                  title={tab.file.path || tab.file.name}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab.id === activeTabId}
                    className="editor-tab-main"
                    onClick={() => handleSwitchTab(tab.id)}
                    onDoubleClick={() => handleRequestRename(tab.id)}
                    title={tab.file.path ? t('toolbarRenameTitle') : t('toolbarRenameTitleUnsaved')}
                  >
                    <span>{tab.file.dirty ? `*${tab.file.name}` : tab.file.name}</span>
                  </button>
                  <button
                    type="button"
                    className="editor-tab-close"
                    aria-label={`关闭 ${tab.file.name}`}
                    onClick={() => handleCloseTab(tab.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {isDocx ? docxPane : editorPane}
        </section>
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
      {artifactItems.length > 0 && (
        <Suspense fallback={null}>
          <ArtifactPreview
            artifacts={artifactItems}
            onOpenFile={(path) => {
              void handleOpenPath(path).catch((error) => console.warn('Failed to open artifact:', error));
            }}
            onArchiveFile={(path) => {
              void handleArchiveArtifact(path);
            }}
            onClose={handleClearArtifacts}
          />
        </Suspense>
      )}
      {settingsVisible && (
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
      )}
      <UnsavedChangesDialog
        open={unsavedDialog !== null}
        message={unsavedDialog?.message ?? ''}
        onChoice={handleUnsavedChoice}
      />
      {renameDialog && (
        <div className="rename-dialog-overlay" role="presentation">
          <form
            className="rename-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void handleConfirmRename();
            }}
          >
            <h3>重命名文件</h3>
            <input
              autoFocus
              value={renameDialog.name}
              onChange={(event) => setRenameDialog((current) => current
                ? { ...current, name: event.target.value, error: undefined }
                : current)}
            />
            {renameDialog.error && <p>{renameDialog.error}</p>}
            <div className="rename-dialog-actions">
              <button type="button" onClick={() => setRenameDialog(null)}>取消</button>
              <button type="submit">重命名</button>
            </div>
          </form>
        </div>
      )}
      {diffPreview && (
        <div className="diff-preview-overlay" onClick={() => setDiffPreview(null)}>
          <div className="diff-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="diff-preview-header">
              <span>差异: {diffPreview.path}</span>
              <button type="button" onClick={() => setDiffPreview(null)} title="关闭">
                ×
              </button>
            </div>
            <div className="diff-preview-body">
              {diffPreview.hunks.map((hunk, i) => (
                <div key={i} className={`diff-hunk diff-hunk-${hunk.op}`}>
                  {hunk.op === 'insert' ? '+ ' : hunk.op === 'delete' ? '- ' : '  '}
                  {hunk.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
