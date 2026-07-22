import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { DocumentFingerprint, OpenedFile, TocItem } from '../types/document';
import { createEmptyFile } from '../types/document';
import type { DefaultEncoding } from '../services/settingsService';
import { setLastOpenedPath } from '../services/settingsService';
import { addRecentFile, removeRecentFile } from '../services/recentFilesService';
import { messageDialog } from '../services/dialogService';
import type { UnsavedDecision } from '../components/UnsavedChangesDialog';
import type { EditorMode } from '../components/Toolbar';
import type { RightPanelMode } from './useRightPanel';

export type OpenFileTab = {
  id: string;
  file: OpenedFile;
};

export type SaveVisualState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type DocumentChangeIntent = {
  kind: 'open' | 'open-folder' | 'new' | 'switch-tab' | 'close-tab';
  targetPath?: string;
};

type SaveSnapshot = {
  tabId: string;
  file: OpenedFile;
  revision: number;
};

type SelfWriteState = {
  path: string;
  fingerprint?: DocumentFingerprint;
  at: number;
};

type DiffPreview = {
  path: string;
  hunks: import('../services/textDiffService').DiffHunk[];
} | null;

type UseFileTabsOptions = {
  defaultEncoding: DefaultEncoding;
  autoSaveEnabled: boolean;
  isTauriRuntime: boolean;
  setToc: Dispatch<SetStateAction<TocItem[]>>;
  setAutoSaveError: Dispatch<SetStateAction<string>>;
  setDiskChangeMessage: Dispatch<SetStateAction<string>>;
  setTransientMessage: Dispatch<SetStateAction<string>>;
  setFindVisible: Dispatch<SetStateAction<boolean>>;
  setHtmlPresentationVisible: Dispatch<SetStateAction<boolean>>;
  setRightPanelMode: Dispatch<SetStateAction<RightPanelMode>>;
  setEditorMode: Dispatch<SetStateAction<EditorMode>>;
  onWorkspaceRootChange?: (path: string) => void;
  extractToc: (content: string) => TocItem[];
  beforeDocumentChangeRef?: MutableRefObject<(intent: DocumentChangeIntent) => Promise<boolean>>;
};

type UseFileTabsResult = {
  file: OpenedFile;
  setFile: Dispatch<SetStateAction<OpenedFile>>;
  openTabs: OpenFileTab[];
  activeTabId: string;
  fileRef: MutableRefObject<OpenedFile>;
  documentRevisionRef: MutableRefObject<number>;
  lastSelfWriteRef: MutableRefObject<SelfWriteState>;
  autoSaveFailureRef: MutableRefObject<{ key: string; count: number; suspended: boolean }>;
  dirtyPaths: Set<string>;
  saveVisualState: SaveVisualState;
  shouldShowTabbar: boolean;
  unsavedDialog: { message: string; allowSaveAll?: boolean; allowDiscardAll?: boolean } | null;
  renameDialog: { tabId: string; name: string; error?: string } | null;
  setRenameDialog: Dispatch<SetStateAction<{ tabId: string; name: string; error?: string } | null>>;
  externalChangeConflict: { path: string; ts: number } | null;
  diffPreview: DiffPreview;
  setDiffPreview: Dispatch<SetStateAction<DiffPreview>>;
  handleUnsavedChoice: (decision: UnsavedDecision) => void;
  confirmCloseWithDirtyFiles: () => Promise<boolean>;
  handleOpen: () => Promise<void>;
  handleOpenFolder: () => Promise<void>;
  handleNewFile: () => void;
  handleOpenPath: (path: string) => Promise<void>;
  handleSwitchTab: (tabId: string) => void;
  handleCloseTab: (tabId: string) => void;
  handleRequestRename: (tabId?: string) => void;
  handleConfirmRename: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
  handleContentChange: (value: string, origin?: 'table-format') => void;
  handleViewDiff: () => Promise<void>;
  handleAcceptExternal: () => Promise<void>;
  handleKeepMine: () => void;
};

function sameDocumentPath(a: string, b: string): boolean {
  return documentPathKey(a) === documentPathKey(b);
}

function documentPathKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function fileTabId(file: OpenedFile, fallback = ''): string {
  return file.path || fallback || `untitled-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fileTypeForName(name: string): OpenedFile['fileType'] {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'docx') return 'docx';
  if (ext === 'html' || ext === 'htm') return 'html';
  return 'markdown';
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? path.slice(0, index) : '';
}

// 打开/另存文档时把它的目录加入 asset protocol scope,允许 webview 渲染该目录的本地图片。
// 失败不阻断流程(权限或非 Tauri 环境)。
async function allowAssetDirectoryForPath(path: string): Promise<void> {
  const dir = dirname(path);
  if (!dir || !('__TAURI_INTERNALS__' in window)) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('allow_asset_directory', { dir });
  } catch (error) {
    console.warn('Failed to allow asset directory:', error);
  }
}

/**
 * Owns AppLayout's document/tab lifecycle without changing the existing file behaviors.
 */
export function useFileTabs({
  defaultEncoding,
  autoSaveEnabled,
  isTauriRuntime,
  setToc,
  setAutoSaveError,
  setDiskChangeMessage,
  setTransientMessage,
  setFindVisible,
  setHtmlPresentationVisible,
  setRightPanelMode,
  setEditorMode,
  onWorkspaceRootChange,
  extractToc,
  beforeDocumentChangeRef,
}: UseFileTabsOptions): UseFileTabsResult {
  const fileRef = useRef<OpenedFile>(createEmptyFile());
  const documentRevisionRef = useRef(0);
  const tabRevisionsRef = useRef(new Map<string, number>());
  const openTabsRef = useRef<OpenFileTab[]>([]);
  const activeTabIdRef = useRef('');
  const defaultEncodingRef = useRef(defaultEncoding);
  const autoSaveFailureRef = useRef({ key: '', count: 0, suspended: false });
  const lastSelfWriteRef = useRef<SelfWriteState>({ path: '', at: 0 });
  const saveQueuesRef = useRef(new Map<string, Promise<void>>());
  const pendingSelfWritesRef = useRef(new Map<string, number>());
  const tabSwitchRequestRef = useRef(0);
  const [saveVisualState, setSaveVisualState] = useState<SaveVisualState>('idle');
  const saveVisualTimerRef = useRef<number | null>(null);
  const dirtyFilesRef = useRef(false);
  const untitledCounterRef = useRef(1);
  const windowCloseInProgressRef = useRef(false);
  const unsavedResolverRef = useRef<((decision: UnsavedDecision) => void) | null>(null);

  const [file, setFile] = useState<OpenedFile>(createEmptyFile());
  const [openTabs, setOpenTabs] = useState<OpenFileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [unsavedDialog, setUnsavedDialog] = useState<{
    message: string;
    allowSaveAll?: boolean;
    allowDiscardAll?: boolean;
  } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ tabId: string; name: string; error?: string } | null>(null);
  const [externalChangeConflict, setExternalChangeConflict] = useState<{ path: string; ts: number } | null>(null);
  const [diffPreview, setDiffPreview] = useState<DiffPreview>(null);

  const canChangeDocument = useCallback(async (intent: DocumentChangeIntent) => {
    const targetPath = intent.targetPath;
    if (targetPath && fileRef.current.path && sameDocumentPath(targetPath, fileRef.current.path)) return true;
    return beforeDocumentChangeRef ? beforeDocumentChangeRef.current(intent) : true;
  }, [beforeDocumentChangeRef]);

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
    defaultEncodingRef.current = defaultEncoding;
  }, [defaultEncoding]);

  useEffect(() => {
    return () => {
      if (saveVisualTimerRef.current !== null) {
        window.clearTimeout(saveVisualTimerRef.current);
        saveVisualTimerRef.current = null;
      }
    };
  }, []);

  const clearSaveVisualTimer = useCallback(() => {
    if (saveVisualTimerRef.current !== null) {
      window.clearTimeout(saveVisualTimerRef.current);
      saveVisualTimerRef.current = null;
    }
  }, []);

  const markSavedSoon = useCallback(() => {
    clearSaveVisualTimer();
    setSaveVisualState('saved');
    saveVisualTimerRef.current = window.setTimeout(() => {
      setSaveVisualState('idle');
      saveVisualTimerRef.current = null;
    }, 900);
  }, [clearSaveVisualTimer]);

  const applyOpenedFile = useCallback((opened: OpenedFile, path?: string) => {
    clearSaveVisualTimer();
    const id = fileTabId(opened, path);
    const existingIndex = openTabsRef.current.findIndex((tab) => (
      opened.path && tab.file.path && sameDocumentPath(opened.path, tab.file.path)
    ));
    const activeId = existingIndex >= 0 ? openTabsRef.current[existingIndex]!.id : id;
    const nextTabs = existingIndex >= 0
      ? openTabsRef.current.map((tab, index) => index === existingIndex ? { id: tab.id, file: opened } : tab)
      : [...openTabsRef.current, { id, file: opened }];
    // 先更新 ref，避免文档切换期间的编辑器回调把新正文写回旧标签身份。
    openTabsRef.current = nextTabs;
    activeTabIdRef.current = activeId;
    fileRef.current = opened;
    tabRevisionsRef.current.set(activeId, 0);
    documentRevisionRef.current = 0;
    setOpenTabs(nextTabs);
    setActiveTabId(activeId);
    setFile(opened);
    setSaveVisualState(opened.dirty ? 'dirty' : 'idle');
    setToc(opened.fileType === 'docx' ? [] : extractToc(opened.content));
    const openedPath = opened.path || path || '';
    if (openedPath) {
      setLastOpenedPath(openedPath);
      addRecentFile(openedPath, opened.name);
    }
    setDiskChangeMessage('');
    setTransientMessage('');
    setHtmlPresentationVisible(opened.fileType === 'html');
    setFindVisible(false);
    if (opened.fileType === 'docx') {
      setRightPanelMode('none');
    } else {
      setEditorMode('wysiwyg');
    }
  }, [
    clearSaveVisualTimer,
    extractToc,
    setDiskChangeMessage,
    setEditorMode,
    setFindVisible,
    setHtmlPresentationVisible,
    setRightPanelMode,
    setToc,
    setTransientMessage,
  ]);

  const handleOpen = useCallback(async () => {
    const { openFile } = await import('../services/fileService');
    const opened = await openFile(defaultEncodingRef.current);
    if (opened) {
      if (!await canChangeDocument({ kind: 'open', targetPath: opened.path })) return;
      if (opened.path) await allowAssetDirectoryForPath(opened.path);
      applyOpenedFile(opened);
    }
  }, [applyOpenedFile, canChangeDocument]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const { pickWorkspaceDirectory } = await import('../services/workspaceService');
      const selected = await pickWorkspaceDirectory();
      if (!selected) return;
      onWorkspaceRootChange?.(selected);
    } catch (error) {
      setTransientMessage(`工作区打开失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [onWorkspaceRootChange, setTransientMessage]);

  const handleNewFile = useCallback(() => {
    void canChangeDocument({ kind: 'new' }).then((allowed) => {
      if (!allowed) return;
      const index = untitledCounterRef.current++;
      const name = index === 1 ? '未命名.md' : `未命名 ${index}.md`;
      applyOpenedFile(createEmptyFile(name), `untitled-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    });
  }, [applyOpenedFile, canChangeDocument]);

  const handleOpenPath = useCallback(async (path: string) => {
    if (!await canChangeDocument({ kind: 'open', targetPath: path })) return;
    const { openPath } = await import('../services/fileService');
    try {
      const opened = await openPath(path, defaultEncodingRef.current);
      await allowAssetDirectoryForPath(path);
      applyOpenedFile(opened, path);
    } catch (error) {
      removeRecentFile(path);
      setTransientMessage('打开失败，已从最近文件移除。');
      throw error;
    }
  }, [applyOpenedFile, canChangeDocument, setTransientMessage]);

  const handleSwitchTab = useCallback((tabId: string) => {
    const tab = openTabsRef.current.find((candidate) => candidate.id === tabId);
    if (!tab || tab.id === activeTabIdRef.current) return;
    const requestId = tabSwitchRequestRef.current + 1;
    tabSwitchRequestRef.current = requestId;
    void canChangeDocument({ kind: 'switch-tab', targetPath: tab.file.path }).then(async (allowed) => {
      if (!allowed) return;
      let nextFile = tab.file;
      let changedWhileBackground = false;
      if (isTauriRuntime && tab.file.path) {
        try {
          const { getDocumentFingerprint, openPath } = await import('../services/fileService');
          const fingerprint = await getDocumentFingerprint(tab.file.path);
          const known = tab.file.fingerprint;
          const sameFingerprint = known
            && known.size === fingerprint.size
            && known.modifiedAt === fingerprint.modifiedAt
            && known.hash === fingerprint.hash;
          if (!sameFingerprint) {
            if (tab.file.dirty) {
              changedWhileBackground = true;
            } else {
              nextFile = await openPath(tab.file.path, tab.file.encoding ?? defaultEncodingRef.current);
            }
          }
        } catch (error) {
          setTransientMessage(`检查磁盘文件失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (requestId !== tabSwitchRequestRef.current) return;
      const nextTabs = openTabsRef.current.map((candidate) => (
        candidate.id === tab.id ? { ...candidate, file: nextFile } : candidate
      ));
      openTabsRef.current = nextTabs;
      activeTabIdRef.current = tab.id;
      fileRef.current = nextFile;
      documentRevisionRef.current = tabRevisionsRef.current.get(tab.id) ?? 0;
      setOpenTabs(nextTabs);
      setActiveTabId(tab.id);
      setFile(nextFile);
      setToc(nextFile.fileType === 'docx' ? [] : extractToc(nextFile.content));
      clearSaveVisualTimer();
      setSaveVisualState(nextFile.dirty ? 'dirty' : 'idle');
      setDiskChangeMessage('');
      setTransientMessage('');
      setFindVisible(false);
      setHtmlPresentationVisible(nextFile.fileType === 'html');
      setExternalChangeConflict(changedWhileBackground ? { path: nextFile.path, ts: Date.now() } : null);
      if (nextFile.fileType === 'docx') {
        setRightPanelMode('none');
      }
    });
  }, [
    canChangeDocument,
    clearSaveVisualTimer,
    extractToc,
    isTauriRuntime,
    setDiskChangeMessage,
    setFindVisible,
    setHtmlPresentationVisible,
    setRightPanelMode,
    setToc,
    setTransientMessage,
  ]);

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

  const enqueueSave = useCallback((snapshot: SaveSnapshot, saveAs = false) => {
    const key = snapshot.file.path
      ? documentPathKey(snapshot.file.path)
      : `tab:${snapshot.tabId}`;
    const previous = saveQueuesRef.current.get(key) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      const pendingPath = documentPathKey(snapshot.file.path);
      if (pendingPath) {
        pendingSelfWritesRef.current.set(pendingPath, (pendingSelfWritesRef.current.get(pendingPath) ?? 0) + 1);
      }
      try {
        const { saveFile, saveFileAs } = await import('../services/fileService');
        return saveAs
          ? saveFileAs(snapshot.file, defaultEncodingRef.current)
          : saveFile(snapshot.file);
      } catch (error) {
        if (pendingPath) {
          const count = (pendingSelfWritesRef.current.get(pendingPath) ?? 1) - 1;
          if (count > 0) pendingSelfWritesRef.current.set(pendingPath, count);
          else pendingSelfWritesRef.current.delete(pendingPath);
        }
        throw error;
      }
    });
    const settled = operation.then(() => undefined, () => undefined);
    saveQueuesRef.current.set(key, settled);
    void settled.finally(() => {
      if (saveQueuesRef.current.get(key) === settled) saveQueuesRef.current.delete(key);
    });
    return operation;
  }, []);

  const applySaveResult = useCallback((snapshot: SaveSnapshot, updated: OpenedFile): boolean => {
    for (const path of new Set([snapshot.file.path, updated.path].filter(Boolean))) {
      const key = documentPathKey(path);
      const count = (pendingSelfWritesRef.current.get(key) ?? 1) - 1;
      if (count > 0) pendingSelfWritesRef.current.set(key, count);
      else pendingSelfWritesRef.current.delete(key);
    }
    if (updated === snapshot.file) return false;
    lastSelfWriteRef.current = { path: updated.path, fingerprint: updated.fingerprint, at: Date.now() };
    const target = openTabsRef.current.find((candidate) => candidate.id === snapshot.tabId);
    if (!target) return true;

    const currentFile = target.file;
    const currentRevision = tabRevisionsRef.current.get(snapshot.tabId) ?? 0;
    const snapshotIsCurrent = currentRevision === snapshot.revision
      && currentFile.content === snapshot.file.content;
    const nextFile = snapshotIsCurrent
      ? { ...updated, dirty: false }
      : {
        ...currentFile,
        path: updated.path,
        name: updated.name,
        encoding: updated.encoding,
        hasBom: updated.hasBom,
        lineEnding: updated.lineEnding,
        fingerprint: updated.fingerprint,
        lastSavedContent: updated.lastSavedContent,
        dirty: currentFile.content !== updated.lastSavedContent,
      };
    const nextTabs = openTabsRef.current.map((candidate) => (
      candidate.id === snapshot.tabId ? { ...candidate, file: nextFile } : candidate
    ));
    openTabsRef.current = nextTabs;
    setOpenTabs(nextTabs);
    if (activeTabIdRef.current === snapshot.tabId) {
      fileRef.current = nextFile;
      setFile(nextFile);
      if (nextFile.path) setLastOpenedPath(nextFile.path);
      setSaveVisualState(nextFile.dirty ? 'dirty' : 'saved');
    }
    return true;
  }, []);

  const saveDirtyFilesBeforeClose = useCallback(async (targetTabs?: OpenFileTab[]) => {
    const activeId = activeTabIdRef.current;
    const tabs = openTabsRef.current.map((tab) => (
      tab.id === activeId ? { ...tab, file: fileRef.current } : tab
    ));
    const dirtyTabs = targetTabs ?? tabs.filter((tab) => tab.file.dirty && tab.file.fileType !== 'docx');

    for (const tab of dirtyTabs) {
      const snapshot = {
        tabId: tab.id,
        file: { ...tab.file },
        revision: tabRevisionsRef.current.get(tab.id) ?? 0,
      };
      const updated = await enqueueSave(snapshot);
      if (!applySaveResult(snapshot, updated)) return false;
    }

    autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
    setAutoSaveError('');
    setDiskChangeMessage('');
    dirtyFilesRef.current = false;
    return true;
  }, [applySaveResult, enqueueSave, setAutoSaveError, setDiskChangeMessage]);

  const requestUnsavedChoice = useCallback((
    message: string,
    options: { allowSaveAll?: boolean; allowDiscardAll?: boolean } = {},
  ) => {
    return new Promise<UnsavedDecision>((resolve) => {
      unsavedResolverRef.current?.('cancel');
      unsavedResolverRef.current = resolve;
      setUnsavedDialog({ message, ...options });
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
    const activeId = activeTabIdRef.current;
    const liveActive = fileRef.current;
    const tabs = openTabsRef.current.map((tab) => (
      tab.id === activeId ? { ...tab, file: liveActive } : tab
    ));
    const dirtyTabs = tabs.filter((tab) => tab.file.dirty && tab.file.fileType !== 'docx');
    if (!activeId && liveActive.dirty && liveActive.fileType !== 'docx') {
      dirtyTabs.push({ id: '', file: liveActive });
    }

    for (const [index, tab] of dirtyTabs.entries()) {
      const choice = await requestUnsavedChoice(
        `“${tab.file.name}” 有未保存的修改（${index + 1} / ${dirtyTabs.length}），是否保存后关闭？`,
        {
          allowSaveAll: index < dirtyTabs.length - 1,
          allowDiscardAll: index < dirtyTabs.length - 1,
        },
      );
      if (choice === 'cancel') return false;
      if (choice === 'discard-all') return true;
      const tabsToSave = choice === 'save-all' ? dirtyTabs.slice(index) : [tab];
      if (choice === 'discard') continue;
      try {
        if (!await saveDirtyFilesBeforeClose(tabsToSave)) return false;
        if (choice === 'save-all') break;
      } catch (error) {
        console.warn('Failed to save before closing:', error);
        await messageDialog('保存失败，已取消关闭。请检查文件权限或磁盘状态后重试。', { title: '保存失败' });
        return false;
      }
    }

    autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
    setAutoSaveError('');
    setDiskChangeMessage('');
    dirtyFilesRef.current = false;
    return true;
  }, [requestUnsavedChoice, saveDirtyFilesBeforeClose, setAutoSaveError, setDiskChangeMessage]);

  const confirmCloseTabWithDirtyFile = useCallback(async (targetFile: OpenedFile) => {
    if (!targetFile.dirty || targetFile.fileType === 'docx') return true;
    const choice = await requestUnsavedChoice(`“${targetFile.name}” 有未保存的修改，是否保存后关闭？`);
    if (choice === 'cancel') return false;
    if (choice === 'discard' || choice === 'discard-all') return true;
    try {
      const tab = openTabsRef.current.find((candidate) => candidate.file === targetFile)
        ?? openTabsRef.current.find((candidate) => sameDocumentPath(candidate.file.path, targetFile.path));
      const snapshot = {
        tabId: tab?.id ?? activeTabIdRef.current,
        file: { ...targetFile },
        revision: tabRevisionsRef.current.get(tab?.id ?? activeTabIdRef.current) ?? 0,
      };
      const updated = await enqueueSave(snapshot);
      if (!applySaveResult(snapshot, updated)) return false;
      autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
      setAutoSaveError('');
      setDiskChangeMessage('');
      return true;
    } catch (error) {
      console.warn('Failed to save before closing tab:', error);
      await messageDialog('保存失败，已取消关闭标签页。请检查文件权限或磁盘状态后重试。', { title: '保存失败' });
      return false;
    }
  }, [applySaveResult, enqueueSave, requestUnsavedChoice, setAutoSaveError, setDiskChangeMessage]);

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
    const tab = openTabsRef.current.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    const closingActiveTab = activeTabIdRef.current === tabId;
    void (async () => {
      if (closingActiveTab && !await canChangeDocument({ kind: 'close-tab' })) return;
      const liveTabFile = closingActiveTab
        ? fileRef.current
        : openTabsRef.current.find((candidate) => candidate.id === tabId)?.file ?? tab.file;
      const shouldClose = await confirmCloseTabWithDirtyFile(liveTabFile);
      if (!shouldClose) return;
      const removedIndex = openTabsRef.current.findIndex((candidate) => candidate.id === tabId);
      const nextTabs = openTabsRef.current.filter((candidate) => candidate.id !== tabId);
      openTabsRef.current = nextTabs;
      setOpenTabs(nextTabs);
      if (activeTabIdRef.current !== tabId) return;
      const nextActive = nextTabs[Math.max(0, removedIndex - 1)] ?? nextTabs[0];
      if (nextActive) {
        activeTabIdRef.current = nextActive.id;
        fileRef.current = nextActive.file;
        setActiveTabId(nextActive.id);
        setFile(nextActive.file);
        clearSaveVisualTimer();
        setSaveVisualState(nextActive.file.dirty ? 'dirty' : 'idle');
        setToc(nextActive.file.fileType === 'docx' ? [] : extractToc(nextActive.file.content));
      } else {
        const emptyFile = createEmptyFile();
        activeTabIdRef.current = '';
        fileRef.current = emptyFile;
        setActiveTabId('');
        setFile(emptyFile);
        clearSaveVisualTimer();
        setSaveVisualState('idle');
        setToc([]);
      }
    })();
  }, [canChangeDocument, clearSaveVisualTimer, confirmCloseTabWithDirtyFile, extractToc, setToc]);

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
      const updatedFile = {
        ...targetFile,
        path: result.path,
        name: result.name,
        fileType: fileTypeForName(result.name),
      };
      const nextId = fileTabId(updatedFile, result.path);
      const nextTabs = openTabsRef.current.map((tab) => (
        tab.id === renameDialog.tabId ? { id: nextId, file: updatedFile } : tab
      ));
      openTabsRef.current = nextTabs;
      fileRef.current = activeTabIdRef.current === renameDialog.tabId ? updatedFile : fileRef.current;
      setOpenTabs(nextTabs);
      if (activeTabIdRef.current === renameDialog.tabId) {
        setActiveTabId(nextId);
        activeTabIdRef.current = nextId;
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
  }, [renameDialog, setTransientMessage]);

  const handleSave = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    const snapshot: SaveSnapshot = {
      tabId,
      file: { ...fileRef.current },
      revision: tabRevisionsRef.current.get(tabId) ?? documentRevisionRef.current,
    };
    if (snapshot.file.fileType === 'docx') return;
    clearSaveVisualTimer();
    setSaveVisualState('saving');
    try {
      const updated = await enqueueSave(snapshot);
      if (!applySaveResult(snapshot, updated)) {
        if (activeTabIdRef.current === tabId) setSaveVisualState(snapshot.file.dirty ? 'dirty' : 'idle');
        return;
      }
      if (updated.path) await allowAssetDirectoryForPath(updated.path);
      autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
      setAutoSaveError('');
      setDiskChangeMessage('');
      if (activeTabIdRef.current === tabId) markSavedSoon();
    } catch (error) {
      if (activeTabIdRef.current === tabId) setSaveVisualState('error');
      throw error;
    }
  }, [applySaveResult, clearSaveVisualTimer, enqueueSave, markSavedSoon, setAutoSaveError, setDiskChangeMessage]);

  const handleSaveAs = useCallback(async () => {
    const tabId = activeTabIdRef.current;
    const snapshot: SaveSnapshot = {
      tabId,
      file: { ...fileRef.current },
      revision: tabRevisionsRef.current.get(tabId) ?? documentRevisionRef.current,
    };
    if (snapshot.file.fileType === 'docx') return;
    clearSaveVisualTimer();
    setSaveVisualState('saving');
    try {
      const updated = await enqueueSave(snapshot, true);
      if (!applySaveResult(snapshot, updated)) {
        if (activeTabIdRef.current === tabId) setSaveVisualState(snapshot.file.dirty ? 'dirty' : 'idle');
        return;
      }
      if (updated.path) await allowAssetDirectoryForPath(updated.path);
      autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
      setAutoSaveError('');
      setDiskChangeMessage('');
      if (activeTabIdRef.current === tabId) markSavedSoon();
    } catch (error) {
      if (activeTabIdRef.current === tabId) setSaveVisualState('error');
      throw error;
    }
  }, [applySaveResult, clearSaveVisualTimer, enqueueSave, markSavedSoon, setAutoSaveError, setDiskChangeMessage]);

  const handleContentChange = useCallback((value: string, origin?: 'table-format') => {
    setAutoSaveError('');
    setDiskChangeMessage('');
    setTransientMessage('');
    clearSaveVisualTimer();
    const acceptAutomaticFormat = origin === 'table-format' && !fileRef.current.dirty;
    const nextFile = {
      ...fileRef.current,
      content: value,
      lastSavedContent: acceptAutomaticFormat ? value : fileRef.current.lastSavedContent,
      dirty: acceptAutomaticFormat ? false : value !== fileRef.current.lastSavedContent,
    };
    if (value !== fileRef.current.content) {
      const activeTabId = activeTabIdRef.current;
      const nextRevision = (tabRevisionsRef.current.get(activeTabId) ?? documentRevisionRef.current) + 1;
      tabRevisionsRef.current.set(activeTabId, nextRevision);
      documentRevisionRef.current = nextRevision;
    }
    fileRef.current = nextFile;
    const activeTabId = activeTabIdRef.current;
    if (activeTabId) {
      const nextTabs = openTabsRef.current.map((tab) => (
        tab.id === activeTabId ? { ...tab, file: nextFile } : tab
      ));
      openTabsRef.current = nextTabs;
      setOpenTabs(nextTabs);
    }
    dirtyFilesRef.current = nextFile.dirty || openTabsRef.current.some((tab) => tab.file.dirty);
    setFile(nextFile);
    setSaveVisualState(nextFile.dirty ? 'dirty' : 'idle');
  }, [clearSaveVisualTimer, setAutoSaveError, setDiskChangeMessage, setTransientMessage]);

  useEffect(() => {
    const tabId = activeTabIdRef.current;
    const snapshot: SaveSnapshot = {
      tabId,
      file: { ...fileRef.current },
      revision: tabRevisionsRef.current.get(tabId) ?? documentRevisionRef.current,
    };
    if (!autoSaveEnabled || !snapshot.file.path || !snapshot.file.dirty || snapshot.file.fileType === 'docx') return;
    const saveKey = `${snapshot.file.path}\n${snapshot.file.content}`;
    const failure = autoSaveFailureRef.current;
    if (failure.key === saveKey && failure.suspended) return;

    const timeout = window.setTimeout(() => {
      clearSaveVisualTimer();
      setSaveVisualState('saving');
      void enqueueSave(snapshot)
        .then((updated) => {
          if (!applySaveResult(snapshot, updated)) throw new Error('自动保存已取消');
          autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
          setAutoSaveError('');
          setDiskChangeMessage('');
          if (activeTabIdRef.current === tabId) markSavedSoon();
        })
        .catch((error) => {
          const current = autoSaveFailureRef.current;
          const count = current.key === saveKey ? current.count + 1 : 1;
          const suspended = count >= 3;
          autoSaveFailureRef.current = { key: saveKey, count, suspended };
          setAutoSaveError(suspended
            ? '自动保存失败，已暂停本次内容的自动重试，请手动保存或继续编辑后再试。'
            : `自动保存失败（${count}/3），稍后将自动重试。`);
          setSaveVisualState('error');
          console.error('Auto-save failed:', error);
        });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [
    applySaveResult,
    autoSaveEnabled,
    clearSaveVisualTimer,
    enqueueSave,
    file.content,
    file.dirty,
    file.fileType,
    file.path,
    markSavedSoon,
    setAutoSaveError,
    setDiskChangeMessage,
  ]);

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

        if (pendingSelfWritesRef.current.has(documentPathKey(payload.path))) return;

        try {
          const { getDocumentFingerprint, openPath } = await import('../services/fileService');
          const fingerprint = await getDocumentFingerprint(payload.path);
          const lastSelfWrite = lastSelfWriteRef.current;
          if (sameDocumentPath(lastSelfWrite.path, payload.path)
            && lastSelfWrite.fingerprint
            && lastSelfWrite.fingerprint.size === fingerprint.size
            && lastSelfWrite.fingerprint.modifiedAt === fingerprint.modifiedAt
            && lastSelfWrite.fingerprint.hash === fingerprint.hash) {
            return;
          }

          if (fileRef.current.dirty) {
            setExternalChangeConflict({ path: payload.path, ts: Date.now() });
            return;
          }

          const opened = await openPath(payload.path, current.encoding ?? defaultEncoding);
          const content = opened.content;
          if (fileRef.current.path && sameDocumentPath(fileRef.current.path, payload.path)
              && !fileRef.current.dirty) {
            const nextFile = { ...opened, content, lastSavedContent: content, dirty: false };
            fileRef.current = nextFile;
            const nextTabs = openTabsRef.current.map((tab) => (
              tab.id === activeTabIdRef.current ? { ...tab, file: nextFile } : tab
            ));
            openTabsRef.current = nextTabs;
            setOpenTabs(nextTabs);
            setFile(nextFile);
            tabRevisionsRef.current.set(activeTabIdRef.current, 0);
            documentRevisionRef.current = 0;
            setToc(extractToc(content));
            setDiskChangeMessage('');
            setTransientMessage('已自动从磁盘重新加载。');
          }
        } catch (error) {
          console.warn('Failed to auto-reload file:', error);
          if (fileRef.current.dirty) {
            setExternalChangeConflict({ path: payload.path, ts: Date.now() });
          } else {
            setDiskChangeMessage('磁盘文件已在外部变更，请保存前确认是否需要重新打开。');
          }
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
  }, [defaultEncoding, extractToc, isTauriRuntime, setDiskChangeMessage, setOpenTabs, setToc, setTransientMessage]);

  const handleViewDiff = useCallback(async () => {
    if (!externalChangeConflict) return;
    const { diffTexts } = await import('../services/textDiffService');
    const current = fileRef.current;
    if (!current.path) return;
    try {
      const { openPath } = await import('../services/fileService');
      const diskContent = (await openPath(current.path, current.encoding ?? defaultEncoding)).content;
      const result = diffTexts(current.content, diskContent);
      setDiffPreview({ path: current.path, ...result });
    } catch (error) {
      console.warn('Failed to view diff:', error);
    }
  }, [defaultEncoding, externalChangeConflict]);

  const handleAcceptExternal = useCallback(async () => {
    if (!externalChangeConflict) return;
    const current = fileRef.current;
    if (!current.path) {
      setExternalChangeConflict(null);
      return;
    }
    try {
      const { openPath } = await import('../services/fileService');
      const opened = await openPath(current.path, current.encoding ?? defaultEncoding);
      const content = opened.content;
      const nextFile = { ...opened, content, lastSavedContent: content, dirty: false };
      fileRef.current = nextFile;
      const nextTabs = openTabsRef.current.map((tab) => (
        tab.id === activeTabIdRef.current ? { ...tab, file: nextFile } : tab
      ));
      openTabsRef.current = nextTabs;
      setOpenTabs(nextTabs);
      setFile(nextFile);
      tabRevisionsRef.current.set(activeTabIdRef.current, 0);
      documentRevisionRef.current = 0;
      setToc(extractToc(content));
      setExternalChangeConflict(null);
      setTransientMessage('已采用磁盘版本。');
    } catch (error) {
      console.warn('Failed to accept external:', error);
    }
  }, [defaultEncoding, externalChangeConflict, extractToc, setToc, setTransientMessage]);

  const handleKeepMine = useCallback(() => {
    setExternalChangeConflict(null);
    setTransientMessage('保留你的版本。可在保存前对比。');
  }, [setTransientMessage]);

  const dirtyPaths = useMemo(() => new Set(
    openTabs
      .filter((tab) => tab.file.dirty && tab.file.path)
      .map((tab) => tab.file.path),
  ), [openTabs]);

  const shouldShowTabbar = openTabs.length > 1 || (openTabs.length === 1 && activeTabId !== '');

  return {
    file,
    setFile,
    openTabs,
    activeTabId,
    fileRef,
    documentRevisionRef,
    lastSelfWriteRef,
    autoSaveFailureRef,
    dirtyPaths,
    saveVisualState,
    shouldShowTabbar,
    unsavedDialog,
    renameDialog,
    setRenameDialog,
    externalChangeConflict,
    diffPreview,
    setDiffPreview,
    handleUnsavedChoice,
    confirmCloseWithDirtyFiles,
    handleOpen,
    handleOpenFolder,
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
  };
}
