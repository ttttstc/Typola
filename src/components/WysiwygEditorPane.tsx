import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { resolveLocalImages } from '../services/localImageResolver';
import type { EditorCommandHandle } from '../types/editorCommands';
import { EditorContextMenu, type FormatAction } from './EditorContextMenu';
import { applyVditorFormat } from '../services/vditorFormatService';

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

// 找出光标所在的代码块(Vditor IR 的 ``` 围栏 pre,或行内 `code`)
function findEnclosingCodeNode(node: Node | null, root: HTMLElement): HTMLElement | null {
  let walker: Node | null = node;
  while (walker && walker !== root) {
    if (walker.nodeType === Node.ELEMENT_NODE) {
      const el = walker as HTMLElement;
      if (el.tagName === 'PRE' || el.tagName === 'CODE') return el;
    }
    walker = walker.parentNode;
  }
  return null;
}

// 记录光标在某个代码节点内的字符偏移 + 该节点在 IR 中的稳定索引
type CodeCaret = { index: number; offset: number; tagName: string };

function captureCodeCaret(ir: HTMLElement): CodeCaret | null {
  const sel = ir.ownerDocument?.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const codeNode = findEnclosingCodeNode(range.endContainer, ir);
  if (!codeNode) return null;
  // 计算光标到 codeNode 起点的字符距离
  const r = ir.ownerDocument!.createRange();
  r.selectNodeContents(codeNode);
  try {
    r.setEnd(range.endContainer, range.endOffset);
  } catch {
    return null;
  }
  const offset = r.toString().length;
  // 同 tagName 的同级节点中的索引(整个 IR 内)
  const tag = codeNode.tagName;
  const all = Array.from(ir.querySelectorAll(tag.toLowerCase()));
  const index = all.indexOf(codeNode);
  if (index < 0) return null;
  return { index, offset, tagName: tag };
}

function restoreCodeCaret(ir: HTMLElement, info: CodeCaret): boolean {
  const all = Array.from(ir.querySelectorAll(info.tagName.toLowerCase()));
  const block = all[info.index] as HTMLElement | undefined;
  if (!block) return false;
  const text = block.textContent ?? '';
  const target = Math.min(info.offset, text.length);
  // 找到该 text offset 对应的 text node + 节点内偏移
  const doc = ir.ownerDocument!;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let accumulated = 0;
  let textNode: Node | null = walker.nextNode();
  while (textNode) {
    const len = textNode.textContent?.length ?? 0;
    if (accumulated + len >= target) break;
    accumulated += len;
    textNode = walker.nextNode();
  }
  const sel = doc.defaultView?.getSelection();
  if (!sel) return false;
  const range = doc.createRange();
  if (textNode) {
    range.setStart(textNode, target - accumulated);
  } else {
    // 空代码块:把光标放在 block 内部
    range.setStart(block, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
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
  // Vditor IR 在代码块/行内代码输入时会重排 DOM 丢光标,这里在 keydown 时记下
  // 光标在代码块内的字符 offset,在下一帧若发现光标跳了就恢复。
  const pendingCodeCaretRef = useRef<CodeCaret | null>(null);
  const codeCaretRafRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!editorRef.current) return;
    // 仅在 IR 编辑区内的右键才接管;其他区域(toolbar 等)放浏览器默认菜单
    const ir = getIrElement(editorRef.current);
    if (!ir || !(event.target instanceof Node) || !ir.contains(event.target)) return;
    event.preventDefault();
    const sel = ir.ownerDocument?.defaultView?.getSelection();
    const hasSelection = !!sel && !sel.isCollapsed && (sel.toString().length > 0);
    setContextMenu({ x: event.clientX, y: event.clientY, hasSelection });
  }, []);

  const handleMenuPick = useCallback((action: FormatAction) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    void applyVditorFormat(editor, action);
  }, []);

  const handleMenuClose = useCallback(() => setContextMenu(null), []);

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

          // 若 keydown 在代码块内记下了光标,Vditor 渲染完后判断是否需要恢复
          const captured = pendingCodeCaretRef.current;
          pendingCodeCaretRef.current = null;
          if (captured) {
            if (codeCaretRafRef.current !== null) {
              window.cancelAnimationFrame(codeCaretRafRef.current);
            }
            codeCaretRafRef.current = window.requestAnimationFrame(() => {
              codeCaretRafRef.current = null;
              const ir = getIrElement(editorRef.current!);
              if (!ir) return;
              // 仅当光标已不在原代码块同位置时才恢复(避免覆盖合法的光标移动)
              const current = captureCodeCaret(ir);
              const jumped =
                !current ||
                current.tagName !== captured.tagName ||
                current.index !== captured.index ||
                Math.abs(current.offset - (captured.offset + 1)) > 1;
              if (jumped) restoreCodeCaret(ir, { ...captured, offset: captured.offset + 1 });
            });
          }

          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
          }
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            collapseExpandedMarkers(editorRef.current);
          }, IR_MARKER_COLLAPSE_DELAY_MS);

          onChange(value);
        },
        keydown(event) {
          // 在代码块内时记下光标位置,供 input 钩子恢复
          if (editorRef.current && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const ir = getIrElement(editorRef.current);
            if (ir) {
              const captured = captureCodeCaret(ir);
              if (captured) pendingCodeCaretRef.current = captured;
            }
          }

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
      if (codeCaretRafRef.current !== null) {
        window.cancelAnimationFrame(codeCaretRafRef.current);
        codeCaretRafRef.current = null;
      }
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
      <div ref={hostRef} className="wysiwyg-editor-host" onContextMenu={handleContextMenu} />
      <EditorContextMenu
        open={contextMenu !== null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        hasSelection={contextMenu?.hasSelection ?? false}
        onPick={handleMenuPick}
        onClose={handleMenuClose}
      />
    </div>
  );
});
