import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { resolveLocalImages } from '../services/localImageResolver';
import type { EditorCommandHandle } from '../types/editorCommands';

type WysiwygEditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  filePath?: string;
  onScrollRatio?: (ratio: number) => void;
};

const IR_MARKER_COLLAPSE_DELAY_MS = 220;

function getIrElement(editor: import('vditor').default): HTMLElement | null {
  const vditor = (editor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor;
  return vditor?.ir?.element ?? null;
}

function collapseExpandedMarkers(editor: import('vditor').default | null): void {
  if (!editor) return;
  const ir = getIrElement(editor);
  if (!ir) return;
  ir.querySelectorAll('.vditor-ir__node--expand').forEach((node) => {
    node.classList.remove('vditor-ir__node--expand');
  });
}

type WindowWithFind = Window & {
  find?: (
    text: string,
    caseSensitive?: boolean,
    backwards?: boolean,
    wrapAround?: boolean,
    wholeWord?: boolean,
    searchInFrames?: boolean,
    showDialog?: boolean,
  ) => boolean;
};

export const WysiwygEditorPane = forwardRef<EditorCommandHandle, WysiwygEditorPaneProps>(function WysiwygEditorPane(
  { source, onChange, filePath, onScrollRatio },
  ref,
) {
  const settings = useSettings();
  const t = useCallback(
    (key: Parameters<typeof translate>[1]) => translate(settings.locale, key),
    [settings.locale],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<import('vditor').default | null>(null);
  const applyingExternalValue = useRef(false);
  const latestSource = useRef(source);
  const lastEmittedValue = useRef(source);
  const collapseTimerRef = useRef<number | null>(null);
  const onScrollRatioRef = useRef(onScrollRatio);

  useEffect(() => {
    onScrollRatioRef.current = onScrollRatio;
  }, [onScrollRatio]);

  useEffect(() => {
    latestSource.current = source;
  }, [source]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Scroll sync: capture-phase listener on host catches any inner scroll container Vditor creates.
    let scrollRafId: number | null = null;
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (scrollRafId !== null) return;
      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        const cb = onScrollRatioRef.current;
        if (!cb) return;
        const max = target.scrollHeight - target.clientHeight;
        cb(max > 0 ? target.scrollTop / max : 0);
      });
    };
    host.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    let cancelled = false;
    void Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(([, { default: Vditor }]) => {
      if (cancelled || !hostRef.current) return;

      const editor = new Vditor(hostRef.current, {
        value: latestSource.current,
        mode: 'ir',
        height: '100%',
        width: '100%',
        cdn: '/vditor',
        lang: 'zh_CN',
        i18n: VDITOR_PREVIEW_I18N,
        toolbar: [],
        resize: { enable: false },
        counter: { enable: false },
        cache: { enable: false },
        preview: {
          markdown: {
            sanitize: true,
          },
          theme: {
            current: 'light',
            path: '',
          },
          hljs: {
            enable: true,
            style: 'github',
            lineNumber: false,
          },
        },
        after() {
          const host = hostRef.current;
          if (host) void resolveLocalImages(host, filePath);
        },
        input(value) {
          if (applyingExternalValue.current) return;
          lastEmittedValue.current = value;

          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
          }
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            collapseExpandedMarkers(editorRef.current);
          }, IR_MARKER_COLLAPSE_DELAY_MS);

          onChange(value);
        },
        keydown() {
          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
          }
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            collapseExpandedMarkers(editorRef.current);
          }, IR_MARKER_COLLAPSE_DELAY_MS);
        },
        blur() {
          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
          }
          collapseExpandedMarkers(editorRef.current);
        },
      });

      editorRef.current = editor;
    });

    return () => {
      cancelled = true;
      host.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
      if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [filePath, onChange, t]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // 来自本编辑器自身输入的回显：跳过 setValue，保住光标
    // （修复代码块 / 行内代码编辑时光标跳回开头：Vditor IR 归一化会让 getValue() 与刚 emit 的 source 不等）
    if (source === lastEmittedValue.current) return;

    const currentValue = editor.getValue();
    if (currentValue === source) return;

    applyingExternalValue.current = true;
    editor.setValue(source, true);
    lastEmittedValue.current = source;
    window.requestAnimationFrame(() => {
      applyingExternalValue.current = false;
    });
  }, [source]);

  useImperativeHandle(ref, () => ({
    focus() {
      editorRef.current?.focus();
    },
    insertText(text: string) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.insertValue(text, true);
      const value = editor.getValue();
      lastEmittedValue.current = value;
      onChange(value);
    },
    revealRange() {
      editorRef.current?.focus();
    },
    revealText(text: string, backwards = false) {
      editorRef.current?.focus();
      const find = (window as WindowWithFind).find;
      if (!text || typeof find !== 'function') return;
      find(text, false, backwards, true, false, false, false);
    },
  }), [onChange]);

  return (
    <div className="wysiwyg-editor-pane" aria-label="即时渲染编辑器">
      <div ref={hostRef} className="wysiwyg-editor-host" />
    </div>
  );
});
