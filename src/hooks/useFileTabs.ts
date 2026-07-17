import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { OpenedFile, TocItem } from '../types/document';
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
  extractToc: (content: string) => TocItem[];
  beforeDocumentChangeRef?: MutableRefObject<(intent: DocumentChangeIntent) => Promise<boolean>>;
};

type UseFileTabsResult = {
  file: OpenedFile;
  setFile: Dispatch<SetStateAction<OpenedFile>>;
  openTabs: OpenFileTab[];
  activeTabId: string;
  fileRef: MutableRefObject<OpenedFile>;
  lastSelfWriteRef: MutableRefObject<{ path: string; at: number }>;
  autoSaveFailureRef: MutableRefObject<{ key: string; count: number; suspended: boolean }>;
  dirtyPaths: Set<string>;
  saveVisualState: SaveVisualState;
  shouldShowTabbar: boolean;
  unsavedDialog: { message: string } | null;
  renameDialog: { tabId: string; name: string; error?: string } | null;
  setRenameDialog: Dispatch<SetStateAction<{ tabId: string; name: string; error?: string } | null>>;
  externalChangeConflict: { path: string; ts: number } | null;
  diffPreview: DiffPreview;
  setDiffPreview: Dispatch<SetStateAction<DiffPreview>>;
  handleUnsavedChoice: (decision: UnsavedDecision) => void;
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
  handleContentChange: (value: string) => void;
  handleViewDiff: () => Promise<void>;
  handleAcceptExternal: () => Promise<void>;
  handleKeepMine: () => void;
};

function sameDocumentPath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
}

function fileTabId(file: OpenedFile, fallback = ''): string {
  return file.path || fallback || `untitled-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  extractToc,
  beforeDocumentChangeRef,
}: UseFileTabsOptions): UseFileTabsResult {
  const fileRef = useRef<OpenedFile>(createEmptyFile());
  const openTabsRef = useRef<OpenFileTab[]>([]);
  const activeTabIdRef = useRef('');
  const defaultEncodingRef = useRef(defaultEncoding);
  const autoSaveFailureRef = useRef({ key: '', count: 0, suspended: false });
  const lastSelfWriteRef = useRef({ path: '', at: 0 });
  const [saveVisualState, setSaveVisualState] = useState<SaveVisualState>('idle');
  const saveVisualTimerRef = useRef<number | null>(null);
  const dirtyFilesRef = useRef(false);
  const untitledCounterRef = useRef(1);
  const windowCloseInProgressRef = useRef(false);
  const unsavedResolverRef = useRef<((decision: UnsavedDecision) => void) | null>(null);

  const [file, setFile] = useState<OpenedFile>(createEmptyFile());
  const [openTabs, setOpenTabs] = useState<OpenFileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [unsavedDialog, setUnsavedDialog] = useState<{ message: string } | null>(null);
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
      const existing = openTabsRef.current.find((tab) => opened.path && tab.file.path && sameDocumentPath(opened.path, tab.file.path));
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
    setHtmlPresentationVisible(opened.fileType === 'html');
    setFindVisible(false);
    if (opened.fileType === 'docx') {
      setRightPanelMode('none');
    } else {
      setEditorMode('wysiwyg');
    }
  }, [
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
    const { openFolder } = await import('../services/fileService');
    const openedList = await openFolder(defaultEncodingRef.current);
    const finalOpened = openedList[openedList.length - 1];
    if (finalOpened && !await canChangeDocument({ kind: 'open-folder', targetPath: finalOpened.path })) return;
    for (const opened of openedList) {
      if (opened.path) await allowAssetDirectoryForPath(opened.path);
      applyOpenedFile(opened);
    }
  }, [applyOpenedFile, canChangeDocument]);

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
    void canChangeDocument({ kind: 'switch-tab', targetPath: tab.file.path }).then((allowed) => {
      if (!allowed) return;
      setActiveTabId(tab.id);
      setFile(tab.file);
      setToc(tab.file.fileType === 'docx' ? [] : extractToc(tab.file.content));
      setDiskChangeMessage('');
      setTransientMessage('');
      setFindVisible(false);
      setHtmlPresentationVisible(tab.file.fileType === 'html');
      if (tab.file.fileType === 'docx') {
        setRightPanelMode('none');
      }
    });
  }, [
    canChangeDocument,
    extractToc,
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
  }, [setAutoSaveError, setDiskChangeMessage]);

  const requestUnsavedChoice = useCallback((message: string) => {
    return new Promise<UnsavedDecision>((resolve) => {
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
  }, [requestUnsavedChoice, setAutoSaveError, setDiskChangeMessage]);

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
      setOpenTabs(nextTabs);
      if (activeTabIdRef.current !== tabId) return;
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
    })();
  }, [canChangeDocument, confirmCloseTabWithDirtyFile, extractToc, setToc]);

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
  }, [renameDialog, setTransientMessage]);

  const handleSave = useCallback(async () => {
    if (file.fileType === 'docx') return;
    clearSaveVisualTimer();
    setSaveVisualState('saving');
    try {
      const { saveFile } = await import('../services/fileService');
      const updated = await saveFile(file);
      if (updated === file) {
        setSaveVisualState(file.dirty ? 'dirty' : 'idle');
        return;
      }
      if (updated.path) await allowAssetDirectoryForPath(updated.path);
      lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
      autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
      setAutoSaveError('');
      setDiskChangeMessage('');
      setFile(updated);
      if (updated.path) setLastOpenedPath(updated.path);
      if (updated.dirty) {
        setSaveVisualState('dirty');
      } else {
        markSavedSoon();
      }
    } catch (error) {
      setSaveVisualState('error');
      throw error;
    }
  }, [clearSaveVisualTimer, file, markSavedSoon, setAutoSaveError, setDiskChangeMessage]);

  const handleSaveAs = useCallback(async () => {
    if (file.fileType === 'docx') return;
    clearSaveVisualTimer();
    setSaveVisualState('saving');
    try {
      const { saveFileAs } = await import('../services/fileService');
      const updated = await saveFileAs(file);
      if (updated === file) {
        setSaveVisualState(file.dirty ? 'dirty' : 'idle');
        return;
      }
      if (updated.path) await allowAssetDirectoryForPath(updated.path);
      lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
      autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
      setAutoSaveError('');
      setDiskChangeMessage('');
      setFile(updated);
      if (updated.path) setLastOpenedPath(updated.path);
      if (updated.dirty) {
        setSaveVisualState('dirty');
      } else {
        markSavedSoon();
      }
    } catch (error) {
      setSaveVisualState('error');
      throw error;
    }
  }, [clearSaveVisualTimer, file, markSavedSoon, setAutoSaveError, setDiskChangeMessage]);

  const handleContentChange = useCallback((value: string) => {
    setAutoSaveError('');
    setDiskChangeMessage('');
    setTransientMessage('');
    clearSaveVisualTimer();
    const nextFile = {
      ...fileRef.current,
      content: value,
      dirty: value !== fileRef.current.lastSavedContent,
    };
    fileRef.current = nextFile;
    const activeTabId = activeTabIdRef.current;
    if (activeTabId) {
      const nextTabs = openTabsRef.current.map((tab) => (
        tab.id === activeTabId ? { ...tab, file: nextFile } : tab
      ));
      openTabsRef.current = nextTabs;
      setOpenTabs(nextTabs);
    }
    setFile(nextFile);
    setSaveVisualState(nextFile.dirty ? 'dirty' : 'idle');
  }, [clearSaveVisualTimer, setAutoSaveError, setDiskChangeMessage, setTransientMessage]);

  useEffect(() => {
    if (!autoSaveEnabled || !file.path || !file.dirty || file.fileType === 'docx') return;
    const saveKey = `${file.path}\n${file.content}`;
    const failure = autoSaveFailureRef.current;
    if (failure.key === saveKey && failure.suspended) return;

    const timeout = window.setTimeout(() => {
      clearSaveVisualTimer();
      setSaveVisualState('saving');
      void import('../services/fileService')
        .then(({ saveFile }) => saveFile(file))
        .then((updated) => {
          lastSelfWriteRef.current = { path: updated.path, at: Date.now() };
          autoSaveFailureRef.current = { key: '', count: 0, suspended: false };
          setAutoSaveError('');
          setDiskChangeMessage('');
          setFile(updated);
          markSavedSoon();
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
  }, [autoSaveEnabled, clearSaveVisualTimer, file, markSavedSoon, setAutoSaveError, setDiskChangeMessage]);

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
          setExternalChangeConflict({ path: payload.path, ts: Date.now() });
          return;
        }

        try {
          const { readTextWithEncoding } = await import('../services/fileService');
          const content = await readTextWithEncoding(payload.path, defaultEncoding);
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
  }, [defaultEncoding, extractToc, isTauriRuntime, setDiskChangeMessage, setToc, setTransientMessage]);

  const handleViewDiff = useCallback(async () => {
    if (!externalChangeConflict) return;
    const { diffTexts } = await import('../services/textDiffService');
    const current = fileRef.current;
    if (!current.path) return;
    try {
      const { readTextWithEncoding } = await import('../services/fileService');
      const diskContent = await readTextWithEncoding(current.path, defaultEncoding);
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
      const { readTextWithEncoding } = await import('../services/fileService');
      const content = await readTextWithEncoding(current.path, defaultEncoding);
      setFile((prev) => ({
        ...prev,
        content,
        lastSavedContent: content,
        dirty: false,
      }));
      setToc(extractToc(content));
      setExternalChangeConflict(null);
      setTransientMessage('已采用 Claude 的版本。');
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
