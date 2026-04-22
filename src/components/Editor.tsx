import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor as MilkdownEditorType, defaultValueCtx, prosePluginsCtx, rootCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { useEditorStore } from '../store/editor';
import { useUIStore } from '../store/ui';
import { useWorkspaceStore } from '../store/workspace';
import { setupCodeHighlight } from '../editor/plugins/highlight';
import { setupImageHandler } from '../editor/plugins/image';
import { createMarkdownSyntaxPlugin } from '../editor/plugins/markdownSyntax';
import { setupMermaidHandler } from '../editor/plugins/mermaid';
import {
  applyBlockFormat,
  applyInlineFormat,
  applyLink,
  bindEditorFormatting,
  getActiveLinkHref,
  hasEditorSelection,
  isEditorFocused,
} from '../editor/formatting';
import { SlashMenu } from './SlashMenu';
import { FloatingToolbar } from './FloatingToolbar';
import { SearchBar } from './SearchBar';

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
    (filePath: string) => filePath.split(/[\\/]/).pop() || `${t('fileTree.untitled')}.md`,
    [t]
  );

  const setupEditorPlugins = useCallback(() => {
    pluginCleanupRef.current.forEach((cleanup) => cleanup());
    pluginCleanupRef.current = [setupImageHandler(), setupCodeHighlight(), setupMermaidHandler()];
  }, []);

  const initEditor = useCallback((container: HTMLElement, initialContent: string) => {
    if (editorRef.current) {
      bindEditorFormatting(null);
      editorRef.current.destroy();
      editorRef.current = null;
    }

    // @ts-ignore - Milkdown types may not perfectly match runtime API
    const editor = MilkdownEditorType.make()
      .config((ctx: any) => {
        ctx.set(rootCtx, container);
        ctx.set(defaultValueCtx, initialContent);
        ctx.update(prosePluginsCtx, (plugins: unknown[]) => [...plugins, createMarkdownSyntaxPlugin()]);
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
    // The formatting helpers need access to the active Milkdown instance.
    bindEditorFormatting(editor);
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
            filters: [{ name: t('common.markdown'), extensions: ['md'] }],
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
  }, [content, currentFile, getSaveFileName, isDraftFile, setFileTree, setSaveStatus, t, updateFilePath, workspaceRoot]);

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
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        return;
      }

      if (!event.ctrlKey && !event.metaKey) return;
      if (!isEditorFocused() && !hasEditorSelection()) return;

      const key = event.key.toLowerCase();

      if (!event.shiftKey && key === 'b') {
        event.preventDefault();
        applyInlineFormat('bold');
        return;
      }

      if (!event.shiftKey && key === 'i') {
        event.preventDefault();
        applyInlineFormat('italic');
        return;
      }

      if (event.shiftKey && key === 's') {
        event.preventDefault();
        applyInlineFormat('strikethrough');
        return;
      }

      if (!event.shiftKey && key === 'k') {
        event.preventDefault();
        const url = window.prompt(t('editor.enterLinkUrl'), getActiveLinkHref() ?? 'https://');
        if (url !== null) {
          applyLink(url);
        }
        return;
      }

      if (!event.shiftKey && key === '0') {
        event.preventDefault();
        applyBlockFormat('paragraph');
        return;
      }

      if (!event.shiftKey && key === '1') {
        event.preventDefault();
        applyBlockFormat('heading-1');
        return;
      }

      if (!event.shiftKey && key === '2') {
        event.preventDefault();
        applyBlockFormat('heading-2');
        return;
      }

      if (!event.shiftKey && key === '3') {
        event.preventDefault();
        applyBlockFormat('heading-3');
        return;
      }

      if (!event.shiftKey && key === '4') {
        event.preventDefault();
        applyBlockFormat('heading-4');
        return;
      }

      if (!event.shiftKey && key === '5') {
        event.preventDefault();
        applyBlockFormat('heading-5');
        return;
      }

      if (!event.shiftKey && key === '6') {
        event.preventDefault();
        applyBlockFormat('heading-6');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile, t]);

  useEffect(() => {
    if (!currentFile) return;
    queueMicrotask(setupEditorPlugins);
  }, [currentFile, theme, setupEditorPlugins]);

  useEffect(() => {
    const handleSetContent = (event: Event) => {
      const customEvent = event as CustomEvent<{ content: string; dirty: boolean }>;
      const nextContent = customEvent.detail?.content ?? '';
      const dirty = customEvent.detail?.dirty ?? false;

      replaceEditorContent(nextContent);

      if (dirty) {
        useEditorStore.getState().setContent(nextContent);
      } else {
        useEditorStore.getState().setLoadedContent(nextContent);
      }
    };

    window.addEventListener('editor-set-content', handleSetContent);
    return () => window.removeEventListener('editor-set-content', handleSetContent);
  }, [replaceEditorContent]);

  useEffect(() => () => {
    bindEditorFormatting(null);
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
      <style>
        {`
          .ProseMirror .md-syntax-marker {
            position: relative;
          }

          .ProseMirror .md-syntax-marker::before,
          .ProseMirror .md-syntax-marker::after {
            color: var(--color-muted);
            opacity: 0.75;
            pointer-events: none;
            white-space: pre;
          }

          .ProseMirror .md-syntax-marker::before {
            content: attr(data-md-prefix);
          }

          .ProseMirror .md-syntax-marker::after {
            content: attr(data-md-suffix);
          }
        `}
      </style>
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
      <SearchBar />
      <SlashMenu />
      <FloatingToolbar />
    </div>
  );
}
