import { useEffect, useRef, useCallback } from 'react';
import { Editor as MilkdownEditorType, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { useEditorStore } from '../store/editor';
import { SlashMenu } from './SlashMenu';
import { FloatingToolbar } from './FloatingToolbar';

export function MilkdownEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MilkdownEditorType | null>(null);
  const isInternalUpdate = useRef(false);

  const { currentFile, content, isDirty, setContent, setIsDirty, setSaveStatus } = useEditorStore();

  const saveFile = useCallback(async () => {
    if (!currentFile) return;
    setSaveStatus('saving');
    try {
      await window.electronAPI.writeFile(currentFile, content);
      setIsDirty(false);
      setSaveStatus('saved');
    } catch (e) {
      console.error('Save failed:', e);
      setSaveStatus('error');
    }
  }, [currentFile, content, setIsDirty, setSaveStatus]);

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

  // Initialize editor on mount
  useEffect(() => {
    if (!containerRef.current) return;
    initEditor(containerRef.current, '');
  }, [initEditor]);

  // When currentFile changes, load and set content
  useEffect(() => {
    if (!currentFile) return;
    const container = containerRef.current;
    if (!container) return;

    const loadAndSetContent = async () => {
      try {
        const fileContent = await window.electronAPI.readFile(currentFile);
        isInternalUpdate.current = true;

        if (editorRef.current) {
          editorRef.current.destroy();
        }
        initEditor(container, fileContent);

        setContent(fileContent);
        setIsDirty(false);
        setSaveStatus('saved');

        isInternalUpdate.current = false;
      } catch (e) {
        console.error('Failed to load file:', e);
        isInternalUpdate.current = false;
      }
    };

    loadAndSetContent();
  }, [currentFile, initEditor, setContent, setIsDirty, setSaveStatus]);

  // Auto-save effect
  useEffect(() => {
    if (isDirty && currentFile) {
      const timer = setTimeout(() => {
        saveFile();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isDirty, currentFile, saveFile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        await saveFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        // Handled by MenuBar
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  // File change listener
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileChanged((event) => {
      const path = event.path;
      if (path === currentFile) {
        if (isDirty) {
          if (confirm('文件已被外部修改。是否保留当前修改？')) {
            saveFile();
          } else {
            const loadFile = async () => {
              const newContent = await window.electronAPI.readFile(path);
              setContent(newContent);
              setIsDirty(false);
              if (editorRef.current && containerRef.current) {
                editorRef.current.destroy();
                initEditor(containerRef.current, newContent);
              }
            };
            loadFile();
          }
        } else {
          const loadFile = async () => {
            const newContent = await window.electronAPI.readFile(path);
            setContent(newContent);
            if (editorRef.current && containerRef.current) {
              editorRef.current.destroy();
              initEditor(containerRef.current, newContent);
            }
          };
          loadFile();
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentFile, isDirty, saveFile, setContent, setIsDirty, initEditor]);

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
