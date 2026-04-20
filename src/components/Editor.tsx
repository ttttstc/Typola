import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor as MilkdownEditorType, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { useEditorStore } from '../store/editor';
import { useUIStore } from '../store/ui';
import { useWorkspaceStore } from '../store/workspace';
import { setupCodeHighlight } from '../editor/plugins/highlight';
import { setupImageHandler } from '../editor/plugins/image';
import { setupMermaidHandler } from '../editor/plugins/mermaid';
import { SlashMenu } from './SlashMenu';
import { FloatingToolbar } from './FloatingToolbar';

export function MilkdownEditor() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MilkdownEditorType | null>(null);
  const isInternalUpdate = useRef(false);
  const pluginCleanupRef = useRef<Array<() => void>>([]);

  const {
    currentFile,
    content,
    setContent,
    setSaveStatus,
    updateFilePath,
    isDraftFile,
  } = useEditorStore();
  const fontSize = useUIStore((s) => s.fontSize);
  const theme = useUIStore((s) => s.theme);
  const workspaceRoot = useWorkspaceStore((s) => s.workspaceRoot);
  const setFileTree = useWorkspaceStore((s) => s.setFileTree);

  const getSaveFileName = useCallback(
    (filePath: string) => filePath.split(/[\\/]/).pop() || 'Untitled.md',
    []
  );

  const setupEditorPlugins = useCallback(() => {
    pluginCleanupRef.current.forEach((cleanup) => cleanup());
    pluginCleanupRef.current = [setupImageHandler(), setupCodeHighlight(), setupMermaidHandler()];
  }, []);

  const initEditor = useCallback((container: HTMLElement, initialContent: string) => {
    if (editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
    }

    // @ts-ignore - Milkdown types may not perfectly match runtime API
    const editor = MilkdownEditorType.make()
      .config((ctx: any) => {
        ctx.set(rootCtx, container);
        ctx.set(defaultValueCtx, initialContent);
        ctx.get(listenerCtx).markdownUpdated((_ctx: any, markdown: string) => {
          if (!isInternalUpdate.current) {
            setContent(markdown);
            window.dispatchEvent(new Event('editor-content-changed'));
          }
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener);

    // @ts-ignore
    editor.create();
    // @ts-ignore
    editorRef.current = editor;
  }, [setContent]);

  const replaceEditorContent = useCallback((nextContent: string) => {
    const container = containerRef.current;
    if (!container) return;

    isInternalUpdate.current = true;
    initEditor(container, nextContent);
    isInternalUpdate.current = false;
    queueMicrotask(setupEditorPlugins);
  }, [initEditor, setupEditorPlugins]);

  const loadFileFromDisk = useCallback(async (filePath: string) => {
    const nextContent = await window.electronAPI.readFile(filePath);
    replaceEditorContent(nextContent);
    useEditorStore.getState().setLoadedContent(nextContent, filePath);
    useEditorStore.getState().setSaveStatus('saved');
  }, [replaceEditorContent]);

  const saveFile = useCallback(async () => {
    if (!currentFile) return false;

    try {
      const wasDraft = isDraftFile(currentFile);
      const targetPath = wasDraft
        ? await window.electronAPI.showSaveDialog({
            defaultPath: getSaveFileName(currentFile),
            filters: [{ name: 'Markdown', extensions: ['md'] }],
          })
        : currentFile;

      if (!targetPath) return false;

      setSaveStatus('saving');
      await window.electronAPI.writeFile(targetPath, content);

      if (wasDraft || targetPath !== currentFile) {
        updateFilePath(currentFile, targetPath);
      }

      if (wasDraft && targetPath !== currentFile) {
        await window.electronAPI.deletePath(currentFile);
      }

      useEditorStore.getState().setLoadedContent(content, targetPath);
      useEditorStore.getState().setSaveStatus('saved');

      if (workspaceRoot) {
        const entries = await window.electronAPI.listDir(workspaceRoot);
        setFileTree(entries);
      }

      return true;
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('error');
      return false;
    }
  }, [content, currentFile, getSaveFileName, isDraftFile, setFileTree, setSaveStatus, updateFilePath, workspaceRoot]);

  useEffect(() => {
    let cancelled = false;

    const syncCurrentFile = async () => {
      if (!containerRef.current) return;

      if (!currentFile) {
        replaceEditorContent('');
        setSaveStatus('saved');
        return;
      }

      const openFile = useEditorStore.getState().openFiles.find((file) => file.path === currentFile);

      if (openFile?.isDirty) {
        replaceEditorContent(openFile.content);
        setSaveStatus('saved');
        return;
      }

      try {
        const nextContent = await window.electronAPI.readFile(currentFile);
        if (cancelled) return;

        replaceEditorContent(nextContent);
        useEditorStore.getState().setLoadedContent(nextContent, currentFile);
        useEditorStore.getState().setSaveStatus('saved');
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load file:', error);
        }
      }
    };

    void syncCurrentFile();

    return () => {
      cancelled = true;
    };
  }, [currentFile, replaceEditorContent, setSaveStatus]);

  useEffect(() => {
    if (!currentFile) return;

    void window.electronAPI.watchFile(currentFile);

    return () => {
      void window.electronAPI.unwatchFile(currentFile);
    };
  }, [currentFile]);

  useEffect(() => {
    const cleanup = window.electronAPI.onFileChanged((data: { path: string }) => {
      if (data.path !== useEditorStore.getState().currentFile) return;

      const state = useEditorStore.getState();
      if (state.isDirty) {
        const keepLocalChanges = window.confirm(t('editor.externalChangeConfirm'));
        if (keepLocalChanges) {
          void saveFile();
          return;
        }
      }

      void loadFileFromDisk(data.path);
    });

    return () => cleanup();
  }, [loadFileFromDisk, saveFile, t]);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        await saveFile();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  useEffect(() => {
    if (!currentFile) return;
    queueMicrotask(setupEditorPlugins);
  }, [currentFile, theme, setupEditorPlugins]);

  useEffect(() => () => {
    pluginCleanupRef.current.forEach((cleanup) => cleanup());
  }, []);

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        background: 'var(--color-paper)',
      }}
    >
      <div
        ref={containerRef}
        style={{
          minHeight: '100%',
          fontSize: `${fontSize}px`,
        }}
      />
    </div>
  );
}

export function Editor() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <MilkdownEditor />
      <SlashMenu />
      <FloatingToolbar />
    </div>
  );
}
