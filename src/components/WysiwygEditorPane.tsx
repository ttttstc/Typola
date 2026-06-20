import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { resolveLocalImages } from '../services/localImageResolver';
import type { EditorCommandHandle } from '../types/editorCommands';
import { EditorContextMenu, type FormatAction } from './EditorContextMenu';
import { applyVditorFormat } from '../services/vditorFormatService';
import type { SelectionActionId } from '../services/agent/selectionActions';
import { findUniqueAnchor } from '../services/agent/selectionActions';
import type { SelectionAnchor } from '../services/agent/types';

type WysiwygEditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  filePath?: string;
  onScrollRatio?: (ratio: number) => void;
  // 选区 AI 动作回调（由 AppLayout 注入；不传则不渲染 AI 菜单组）
  onAIAction?: (action: SelectionActionId, anchor: SelectionAnchor) => void;
};

const IR_MARKER_COLLAPSE_DELAY_MS = 220;
const ANCHOR_PREFIX_MAX = 80;

function getIrElement(editor: import('vditor').default): HTMLElement | null {
  const vditor = (editor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor;
  return vditor?.ir?.element ?? null;
}

// 从 ir 根到 range.startContainer 收集 textContent,取最后 ANCHOR_PREFIX_MAX 字符。
// 用于在 source markdown 中唯一定位选区(原文本多处出现时也能找到正确那次)。
function computePrefixHint(ir: HTMLElement, range: Range): string {
  const preRange = ir.ownerDocument?.createRange();
  if (!preRange) return '';
  preRange.setStart(ir, 0);
  try {
    preRange.setEnd(range.startContainer, range.startOffset);
  } catch {
    return '';
  }
  const preText = preRange.toString();
  if (preText.length <= ANCHOR_PREFIX_MAX) return preText;
  return preText.slice(-ANCHOR_PREFIX_MAX);
}

// 选区在视口里的中心坐标(用于键盘触发的菜单定位)。
function selectionViewportPos(range: Range): { x: number; y: number } | null {
  const rects = range.getClientRects();
  if (rects.length === 0) {
    const r = range.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }
  const first = rects[0];
  return { x: first.left, y: first.top };
}

function collapseExpandedMarkers(editor: import('vditor').default | null): void {
  if (!editor) return;
  const ir = getIrElement(editor);
  if (!ir) return;
  ir.querySelectorAll('.vditor-ir__node--expand').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.closest('[data-type="code-block"], pre, code')) return;
    if (node.querySelector('[data-type="code-block"], pre, code')) return;
    node.classList.remove('vditor-ir__node--expand');
  });
}

function silenceCodeBlockAssist(editor: import('vditor').default | null): void {
  if (!editor) return;
  const ir = getIrElement(editor);
  if (!ir) return;
  const sel = ir.ownerDocument?.defaultView?.getSelection();
  const activeNode = sel?.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : ir.ownerDocument.activeElement;
  if (!activeNode) return;
  const element = activeNode instanceof HTMLElement ? activeNode : activeNode.parentElement;
  if (!element?.closest('[data-type="code-block"], pre, code')) return;
  const internals = editor as unknown as {
    vditor?: {
      hint?: { element?: HTMLElement };
      wysiwyg?: { popover?: HTMLElement; selectPopover?: HTMLElement };
    };
  };
  const { hint, wysiwyg } = internals.vditor ?? {};
  if (hint?.element) hint.element.style.display = 'none';
  if (wysiwyg?.popover) wysiwyg.popover.style.display = 'none';
  if (wysiwyg?.selectPopover) wysiwyg.selectPopover.style.display = 'none';
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
  { source, onChange, filePath, onScrollRatio, onAIAction },
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
  // 记录最近一次真实选区,用于 AI 回复的“替换选区”操作。
  const lastSelectionRangeRef = useRef<Range | null>(null);
  // 记录最近一次被校验通过的 anchor.originalText,Vditor 模式按文本搜索替换。
  const lastValidatedAnchorTextRef = useRef<string | null>(null);
  // 记录最近一次被校验通过的 anchor.prefixHint,Vditor 模式用 prefixHint+originalText 唯一定位。
  const lastValidatedPrefixHintRef = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);

  const getSavedOrCurrentSelection = useCallback((): Range | null => {
    const editor = editorRef.current;
    const ir = editor ? getIrElement(editor) : null;
    if (!ir) return null;
    const sel = ir.ownerDocument?.defaultView?.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      if (ir.contains(range.commonAncestorContainer)) {
        lastSelectionRangeRef.current = range.cloneRange();
        return range;
      }
    }
    const saved = lastSelectionRangeRef.current;
    if (saved && ir.contains(saved.commonAncestorContainer)) return saved;
    return null;
  }, []);

  const restoreSelectionRange = useCallback((range: Range): void => {
    const editor = editorRef.current;
    const ir = editor ? getIrElement(editor) : null;
    const sel = ir?.ownerDocument?.defaultView?.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

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

  const handleAIPick = useCallback((action: SelectionActionId) => {
    if (!onAIAction || !filePath) return;
    const editor = editorRef.current;
    const range = getSavedOrCurrentSelection();
    const text = range?.toString() ?? '';
    if (!text && action !== 'custom') return;
    const ir = editor ? getIrElement(editor) : null;
    const prefixHint = range && ir ? computePrefixHint(ir, range) : '';
    const anchor: SelectionAnchor = {
      filePath,
      from: 0,
      to: text.length,
      originalText: text,
      prefixHint,
    };
    onAIAction(action, anchor);
  }, [filePath, getSavedOrCurrentSelection, onAIAction]);

  const handleMenuClose = useCallback(() => setContextMenu(null), []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
    if (!onAIAction || !filePath) return;
    const range = getSavedOrCurrentSelection();
    const text = range?.toString() ?? '';
    if (!text) return;
    event.preventDefault();
    event.stopPropagation();
    // 弹起 5+1 菜单(对齐右键的动线),用选区位置作为菜单位置;不直接触发 custom。
    const pos = range ? selectionViewportPos(range) : null;
    setContextMenu({
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
      hasSelection: true,
    });
  }, [filePath, getSavedOrCurrentSelection, onAIAction]);

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
    const handleSelectionChange = () => {
      const editor = editorRef.current;
      const ir = editor ? getIrElement(editor) : null;
      if (!ir) return;
      const sel = ir.ownerDocument?.defaultView?.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (ir.contains(range.commonAncestorContainer)) {
        lastSelectionRangeRef.current = range.cloneRange();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);

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
        hint: {
          parse: false,
          extend: [],
          emoji: {},
        },
        resize: { enable: false },
        counter: { enable: false },
        cache: { enable: false },
        preview: {
          markdown: {
            sanitize: true,
            codeBlockPreview: false,
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
          silenceCodeBlockAssist(editorRef.current);
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            silenceCodeBlockAssist(editorRef.current);
            collapseExpandedMarkers(editorRef.current);
          }, IR_MARKER_COLLAPSE_DELAY_MS);

          onChange(value);
        },
        keydown() {
          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
          }
          silenceCodeBlockAssist(editorRef.current);
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            silenceCodeBlockAssist(editorRef.current);
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
      document.removeEventListener('selectionchange', handleSelectionChange);
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
    getSelection() {
      const range = getSavedOrCurrentSelection();
      if (!range) return null;
      const text = range.toString();
      if (!text) return null;
      return { text, from: 0, to: text.length };
    },
    replaceSelection(text: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const range = getSavedOrCurrentSelection();
      editor.focus();
      if (range) restoreSelectionRange(range);
      editor.insertValue(text, true);
      const value = editor.getValue();
      lastSelectionRangeRef.current = null;
      lastEmittedValue.current = value;
      onChange(value);
    },
    replaceRange(_from: number, _to: number, text: string) {
      const editor = editorRef.current;
      if (!editor) return false;
      const anchorText = lastValidatedAnchorTextRef.current;
      const prefixHint = lastValidatedPrefixHintRef.current;
      const value = editor.getValue();
      if (!anchorText) return false;
      const hit = findUniqueAnchor(value, anchorText, prefixHint);
      if (!hit) return false;
      const next = value.slice(0, hit.start) + text + value.slice(hit.start + hit.length);
      editor.setValue(next, true);
      lastSelectionRangeRef.current = null;
      lastValidatedAnchorTextRef.current = null;
      lastValidatedPrefixHintRef.current = null;
      lastEmittedValue.current = next;
      onChange(next);
      return true;
    },
    validateAnchor(anchorFilePath: string, _from: number, _to: number, originalText: string, prefixHint?: string) {
      if (!filePath || filePath !== anchorFilePath) return 'wrong-file';
      const editor = editorRef.current;
      if (!editor) return 'wrong-file';
      const value = editor.getValue();
      // findUniqueAnchor 同时校验存在性 + 唯一性（prefixHint+originalText 或纯 originalText）
      // 多处匹配时返回 null → 'stale'，前端展示「文档已变更」并提示重新选区
      const hit = findUniqueAnchor(value, originalText, prefixHint);
      if (!hit) return 'stale';
      lastValidatedAnchorTextRef.current = originalText;
      lastValidatedPrefixHintRef.current = prefixHint ?? '';
      return 'valid';
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
  }), [filePath, getSavedOrCurrentSelection, onChange, restoreSelectionRange]);

  return (
    <div className="wysiwyg-editor-pane" aria-label="即时渲染编辑器">
      <div
        ref={hostRef}
        className="wysiwyg-editor-host"
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      />
      <EditorContextMenu
        open={contextMenu !== null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        hasSelection={contextMenu?.hasSelection ?? false}
        onPick={handleMenuPick}
        onClose={handleMenuClose}
        onPickAI={onAIAction ? handleAIPick : undefined}
      />
    </div>
  );
});
