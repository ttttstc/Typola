import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { useSettings } from '../hooks/useSettings';
import { updateSettings } from '../services/settingsService';
import type { TypolaEditorKernel } from '../types/editorCore';
import { EditorContextMenu, TableContextMenu, type FormatAction, type TableContextAction } from './EditorContextMenu';
import { SelectionFloatingBar } from './selection/SelectionFloatingBar';
import { applyCm6Format } from '../services/editor/cm6FormatService';
import { Cm6EditPopover, type Cm6EditRequest } from './editor/cm6/Cm6EditPopover';
import { ImageMetaPopover, type ImageMetaRequest } from './editor/cm6/ImageMetaPopover';
import type { SelectionActionId } from '../services/agent/selectionActions';
import type { SelectionAnchor } from '../services/agent/types';
import { createMarkdownExtensions } from './editor/cm6/createMarkdownExtensions';
import { headingIndexAt } from './editor/cm6/previewSyncExtension';
import { applyBaseSize } from './editor/cm6/wheelZoomExtension';
import { setFoldedHeadings } from './editor/cm6/headingFoldExtension';
import { deleteMarkdownTableAt, pasteTableData } from './editor/cm6/table/tableCommands';
import { runTableMenuAction, tableCellFromEventTarget } from './editor/cm6/table/tableInteractionExtension';
import {
  findMarkdownImageAt,
  headingPathAt,
  markdownBlockAt,
  type MarkdownImage,
} from '../services/markdownAnalysisService';
import { writeText as writeClipboardText } from '../services/clipboardService';
import { resolveLocalResourcePath } from '../services/htmlPresentationService';
import { formatImageSrc, serializeHtmlImage } from '../services/imageInsert';
import { findSearchMatches } from '../services/documentSearchService';

export type SourceHeadingScrollRequest = {
  index: number;
  /** 段内滚动比例(0..1),可选;不传则只滚到 heading 顶部 */
  withinRatio?: number;
  requestId: number;
};

export type ImageInsertRequest = {
  replace?: { from: number; to: number; alt: string; title?: string };
};

type EditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  extraExtensions?: Extension[];
  headingScrollRequest?: SourceHeadingScrollRequest;
  onScrollRatio?: (ratio: number) => void;
  filePath?: string;
  // 选区 AI 动作回调（由 AppLayout 注入；不传则不渲染 AI 菜单）
  // origin 是触发点的视口坐标(用于「原地闭环」浮卡定位);无 origin 时退化为对话框路径。
  onAIAction?: (action: SelectionActionId, anchor: SelectionAnchor, origin?: { x: number; y: number }) => void;
  onRequestImageInsert?: (request?: ImageInsertRequest) => void;
  onEditorReady?: (view: EditorView) => void;
};

export const EditorPane = forwardRef<TypolaEditorKernel, EditorPaneProps>(function EditorPane(
  props,
  ref,
) {
  const { source, onChange, extraExtensions, headingScrollRequest, onScrollRatio, filePath, onAIAction, onRequestImageInsert, onEditorReady } = props;
  const settings = useSettings();
  const editorViewRef = useRef<EditorView | null>(null);
  const editorListenersCleanupRef = useRef<(() => void) | null>(null);
  const sourceRef = useRef(source);
  const headingScrollRequestRef = useRef(headingScrollRequest);
  const onScrollRatioRef = useRef(onScrollRatio);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; hasSelection: boolean; hasImage: boolean } | null>(null);
  const [tableCtxMenu, setTableCtxMenu] = useState<{ x: number; y: number; pos: number; cell: HTMLElement } | null>(null);
  const [editRequest, setEditRequest] = useState<Cm6EditRequest | null>(null);
  const [imageMetaRequest, setImageMetaRequest] = useState<ImageMetaRequest | null>(null);
  const handledHeadingScrollRequestRef = useRef<number | null>(null);
  const onAIActionRef = useRef(onAIAction);
  const filePathRef = useRef(filePath);
  const floatingBarHiddenDocsRef = useRef<Set<string>>(new Set());
  const editorFontFamily = settings.editorFontFamily === 'System Default'
    ? 'var(--font-mono)'
    : `'${settings.editorFontFamily}', ${settings.editorFontFamily === 'Source Han Serif SC VF' ? 'var(--font-body)' : 'var(--font-mono)'}`;
  const editorFontStyle = { '--editor-font-family': editorFontFamily } as CSSProperties;

  const flashRange = useCallback((from: number) => {
    const view = editorViewRef.current;
    if (!view) return;
    window.requestAnimationFrame(() => {
      const dom = view.domAtPos(Math.max(0, Math.min(from, view.state.doc.length))).node;
      const element = dom instanceof HTMLElement ? dom : dom.parentElement;
      const line = element?.closest<HTMLElement>('.cm-line');
      if (!line) return;
      line.classList.remove('typola-cm-hit-flash');
      // Force restart when the user jumps repeatedly within the same line.
      void line.offsetWidth;
      line.classList.add('typola-cm-hit-flash');
      window.setTimeout(() => line.classList.remove('typola-cm-hit-flash'), 850);
    });
  }, []);

  useEffect(() => { onAIActionRef.current = onAIAction; }, [onAIAction]);
  useEffect(() => {
    filePathRef.current = filePath;
    floatingBarHiddenDocsRef.current.clear();
  }, [filePath]);
  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { headingScrollRequestRef.current = headingScrollRequest; }, [headingScrollRequest]);
  useEffect(() => { onScrollRatioRef.current = onScrollRatio; }, [onScrollRatio]);

  // 抽 triggerAIAction:菜单/浮条/Ctrl+K 都用它,统一组装 anchor + origin。
  const triggerAIAction = useCallback((action: SelectionActionId, origin?: { x: number; y: number }) => {
    const editor = editorViewRef.current;
    const path = filePathRef.current;
    const cb = onAIActionRef.current;
    if (!editor || !path || !cb) return;
    const sel = editor.state.selection.main;
    const text = sel.empty ? '' : editor.state.doc.sliceString(sel.from, sel.to);
    if (!text && action !== 'custom') return;
    // #189:附带 heading path + block boundary,供 AI 结构化 prompt 使用。
    // 这里只是元数据,不参与 replaceRange 路径;编辑器 validateAnchor 仍按 originalText。
    const sourceText = editor.state.doc.toString();
    const anchor: SelectionAnchor = {
      filePath: path,
      from: sel.from,
      to: sel.to,
      originalText: text,
      headingPath: headingPathAt(sourceText, sel.from),
      block: (() => {
        const block = markdownBlockAt(sourceText, sel.from, sel.to);
        return { kind: block.kind, from: block.from, to: block.to };
      })(),
    };
    cb(action, anchor, origin);
  }, []);

  const handleFloatingBarDismissSession = useCallback(() => {
    if (filePathRef.current) floatingBarHiddenDocsRef.current.add(filePathRef.current);
    setFloatingHasSelection(false);
    setFloatingRect(null);
  }, []);

  const handleFloatingBarHideGlobally = useCallback(() => {
    updateSettings({ selectionFloatingBarEnabled: false });
  }, []);

  // 选区浮条状态:跟着 CodeMirror 选区变化重算 rect + hasSelection。
  const [floatingRect, setFloatingRect] = useState<{ selRect: DOMRect } | null>(null);
  const [floatingHasSelection, setFloatingHasSelection] = useState(false);
  // 浮条"稳定"计数器:仅在 mouseup 时 +1,让浮条只在松手后开始 debounce。
  // 拖选过程中(还没 mouseup)即使 selectionchange 频繁触发,stableTick 不变,
  // 浮条 useEffect 不会重启 timer,不会闪烁、不会盖住后续 mousedown 区域。
  const floatingStableTickRef = useRef(0);
  const [floatingStableTick, setFloatingStableTick] = useState(0);
  // 拖选状态:mousedown → true,mouseup → false。期间禁止任何破坏选区的副作用。
  const isDraggingRef = useRef(false);
  // 搜索 reveal 期间抑制浮条 —— dispatch 设 selection 会触发同步 updateListener。
  // CodeMirror 的 selectionchange 在 dispatch 后下一个 microtask 触发,250ms 实测足够
  // 覆盖 selection commit + 重排;时间越短偶尔会让浮条闪一下,越长会延迟用户主动选区。
  const suppressFloatingBarRef = useRef(false);
  const FLOATING_BAR_SETTLE_MS = 250;
  const attachEditorListeners = useCallback((view: EditorView) => {
    const computeFromSelection = () => {
      if (suppressFloatingBarRef.current) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        return;
      }
      const sel = view.state.selection.main;
      if (sel.empty) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        return;
      }
      if (filePathRef.current && floatingBarHiddenDocsRef.current.has(filePathRef.current)) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        return;
      }
      const fromCoords = view.coordsAtPos(sel.from);
      const toCoords = view.coordsAtPos(sel.to);
      if (!fromCoords || !toCoords) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        return;
      }
      const left = Math.min(fromCoords.left, toCoords.left);
      const right = Math.max(fromCoords.right, toCoords.right);
      const top = Math.min(fromCoords.top, toCoords.top);
      const bottom = Math.max(fromCoords.bottom, toCoords.bottom);
      const rect = new DOMRect(left, top, right - left, bottom - top);
      setFloatingRect({ selRect: rect });
      setFloatingHasSelection(true);
    };
    // CodeMirror 没有 selectionChange 事件,用 document selectionchange 兜底
    let selectionRafId: number | null = null;
    const onChange = () => {
      if (selectionRafId !== null) return;
      selectionRafId = window.requestAnimationFrame(() => {
        selectionRafId = null;
        computeFromSelection();
      });
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      // 只追踪编辑器正文内的拖选起始,不要吞掉浮条/菜单/工具栏的 mousedown。
      if (view.dom.contains(target)) {
        isDraggingRef.current = true;
      }
    };
    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      // 松手 → 浮条允许开始 debounce。
      computeFromSelection();
      floatingStableTickRef.current += 1;
      setFloatingStableTick(floatingStableTickRef.current);
    };
    document.addEventListener('selectionchange', onChange);
    window.addEventListener('mouseup', onMouseUp);
    view.dom.addEventListener('mousedown', onMouseDown, true);
    const dom = view.scrollDOM;
    let scrollRafId: number | null = null;
    const handleScroll = () => {
      if (scrollRafId !== null) return;
      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        const max = dom.scrollHeight - dom.clientHeight;
        onScrollRatioRef.current?.(max > 0 ? dom.scrollTop / max : 0);
      });
    };
    dom.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.removeEventListener('mouseup', onMouseUp);
      view.dom.removeEventListener('mousedown', onMouseDown, true);
      if (selectionRafId !== null) window.cancelAnimationFrame(selectionRafId);
      dom.removeEventListener('scroll', handleScroll);
      if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);
    };
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const editor = editorViewRef.current;
    if (!editor) return;
    const target = event.target as Node | null;
    if (!target || !editor.contentDOM.contains(target)) return;
    const tableCell = tableCellFromEventTarget(target);
    if (tableCell) {
      event.preventDefault();
      event.stopPropagation();
      const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY })
        ?? editor.state.selection.main.head;
      setCtxMenu(null);
      setTableCtxMenu({ x: event.clientX, y: event.clientY, pos, cell: tableCell });
      return;
    }
    event.preventDefault();
    setTableCtxMenu(null);
    const sel = editor.state.selection.main;
    const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
    const targetElement = target instanceof Element ? target : target?.parentElement;
    const onImage = targetElement?.closest('.cm-atomic-image') !== null;
    let hasImage = false;
    if (onImage && pos !== null) {
      const sourceText = editor.state.doc.toString();
      hasImage = findMarkdownImageAt(sourceText, pos) !== null;
    }
    setCtxMenu({
      x: event.clientX,
      y: event.clientY,
      hasSelection: !sel.empty,
      hasImage,
    });
  }, []);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const editor = editorViewRef.current;
    if (!editor) return;
    if (event.target instanceof Element && event.target.closest('.tbl-table-widget')) return;
    const html = event.clipboardData.getData('text/html');
    const plain = event.clipboardData.getData('text/plain');
    if (!pasteTableData(editor, plain, html || undefined)) return;
    event.preventDefault();
  }, []);

  const handleTablePick = useCallback((action: TableContextAction) => {
    const editor = editorViewRef.current;
    if (!editor || !tableCtxMenu) return;
    if (action === 'table-delete') {
      deleteMarkdownTableAt(editor, tableCtxMenu.pos);
      return;
    }
    void runTableMenuAction(tableCtxMenu.cell, action);
  }, [tableCtxMenu]);
  const handleFormatPick = useCallback((action: FormatAction) => {
    const editor = editorViewRef.current;
    if (!editor) return;
    if (!settings.editorFormatPainterEnabled && (action.type === 'format-painter' || action.type === 'capture-format' || action.type === 'apply-format')) return;
    if (action.type === 'image-insert') {
      onRequestImageInsert?.();
      return;
    }
    if (action.type === 'image-replace' || action.type === 'image-open' || action.type === 'image-copy-path' || action.type === 'image-meta') {
      const pos = editor.posAtCoords({
        x: ctxMenu?.x ?? 0,
        y: ctxMenu?.y ?? 0,
      });
      if (pos === null) return;
      const sourceText = editor.state.doc.toString();
      const image = findMarkdownImageAt(sourceText, pos);
      if (!image) return;
      if (action.type === 'image-replace') {
        onRequestImageInsert?.({
          replace: { from: image.from, to: image.to, alt: image.alt, title: image.title },
        });
      } else if (action.type === 'image-open') {
        void openImageAt(image, filePathRef.current);
      } else if (action.type === 'image-copy-path') {
        void copyImagePath(image, filePathRef.current);
      } else {
        setImageMetaRequest({ x: ctxMenu?.x ?? 16, y: ctxMenu?.y ?? 16, alt: image.alt, title: image.title ?? '', width: image.width ?? '', onSave: ({ alt, title, width }) => {
          const replacement = width
            ? serializeHtmlImage(image.url, alt, title, width)
            : `![${alt}](${image.url}${title ? ` "${title}"` : ''})`;
          editor.dispatch({ changes: { from: image.from, to: image.to, insert: replacement }, selection: { anchor: image.from + replacement.length } });
          editor.focus();
        } });
      }
      return;
    }
    applyCm6Format(editor, action, setEditRequest);
  }, [ctxMenu, onRequestImageInsert, settings.editorFormatPainterEnabled]);

  const extensions = useMemo(() => {
    return createMarkdownExtensions({
      fontFamily: editorFontFamily,
      fontSize: settings.editorFontSize,
      tabSize: settings.editorTabSize,
      wordWrap: settings.editorWordWrap,
      extraExtensions,
      // Cmd/Ctrl+K → 弹起 5+1 AI 菜单(对齐右键的动线),菜单触发后再走 onAIAction 注入
      onModK: () => {
        const cb = onAIActionRef.current;
        if (!cb || !filePathRef.current) return false;
        const view = editorViewRef.current;
        if (!view) return false;
        const sel = view.state.selection.main;
        if (sel.empty) return false;
        // 用选区首字符的视口位置作为菜单位置;coords 不可用时退化到视口左上
        const coords = view.coordsAtPos(sel.from) ?? { left: 80, top: 80 };
        setCtxMenu({ x: coords.left, y: coords.top, hasSelection: true, hasImage: false });
        return true;
      },
      onFormat: (action) => {
        const view = editorViewRef.current;
        if (!view) return false;
        if (!settings.editorFormatPainterEnabled && (action.type === 'format-painter' || action.type === 'capture-format' || action.type === 'apply-format')) return false;
        applyCm6Format(view, action, setEditRequest);
        return true;
      },
    });
  }, [editorFontFamily, extraExtensions, settings.editorFontSize, settings.editorTabSize, settings.editorWordWrap, settings.editorFormatPainterEnabled]);

  const applyHeadingScrollRequest = useCallback((editor: EditorView, request?: SourceHeadingScrollRequest) => {
    if (!request) return;
    if (handledHeadingScrollRequestRef.current === request.requestId) return;

    const from = headingIndexAt(editor.state, request.index);
    if (from === null) return;
    handledHeadingScrollRequestRef.current = request.requestId;

    if (request.withinRatio !== undefined) {
      // 段内插值滚动:用 view.lineBlockAt 像素位置 + withinRatio 精确定位
      const nextFrom = headingIndexAt(editor.state, request.index + 1);
      const headingBlock = editor.lineBlockAt(from);
      const nextBlock = nextFrom !== null ? editor.lineBlockAt(nextFrom) : null;
      const sectionStart = headingBlock.top;
      const sectionEnd = nextBlock ? nextBlock.top : editor.scrollDOM.scrollHeight;
      const ratio = Math.max(0, Math.min(1, request.withinRatio));
      const target = sectionStart + (sectionEnd - sectionStart) * ratio;
      suppressFloatingBarRef.current = true;
      editor.dispatch({
        effects: EditorView.scrollIntoView(from, { y: 'start' }),
        selection: { anchor: from },
      });
      editor.scrollDOM.scrollTop = Math.max(0, target);
      window.setTimeout(() => { suppressFloatingBarRef.current = false; }, FLOATING_BAR_SETTLE_MS);
    } else {
      suppressFloatingBarRef.current = true;
      editor.dispatch({
        effects: EditorView.scrollIntoView(from, { y: 'start' }),
        selection: { anchor: from },
      });
      window.setTimeout(() => { suppressFloatingBarRef.current = false; }, FLOATING_BAR_SETTLE_MS);
    }
  }, []);

  useEffect(() => {
    const editor = editorViewRef.current;
    if (editor) applyHeadingScrollRequest(editor, headingScrollRequest);
  }, [applyHeadingScrollRequest, headingScrollRequest]);

  const handleCreateEditor = useCallback((view: EditorView) => {
    editorViewRef.current = view;
    editorListenersCleanupRef.current?.();
    editorListenersCleanupRef.current = attachEditorListeners(view);
    applyHeadingScrollRequest(view, headingScrollRequestRef.current);
    onEditorReady?.(view);
  }, [applyHeadingScrollRequest, attachEditorListeners, onEditorReady]);

  useEffect(() => () => {
    editorListenersCleanupRef.current?.();
    editorListenersCleanupRef.current = null;
    editorViewRef.current = null;
  }, []);

  useImperativeHandle(ref, () => ({
    focus() {
      editorViewRef.current?.focus();
    },
    getMarkdown() {
      return editorViewRef.current?.state.doc.toString() ?? sourceRef.current;
    },
    findSearchMatches(query, options) {
      return findSearchMatches(editorViewRef.current?.state.doc.toString() ?? sourceRef.current, query, options);
    },
    setMarkdown(markdown: string) {
      const editorView = editorViewRef.current;
      if (!editorView) return;
      const docLen = editorView.state.doc.length;
      editorView.dispatch({
        changes: { from: 0, to: docLen, insert: markdown },
      });
    },
    insertText(text: string) {
      const editorView = editorViewRef.current;
      if (!editorView) return;
      const selection = editorView.state.selection.main;
      editorView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length },
      });
      editorView.focus();
    },
    insertTextAt(text: string, pos: number) {
      const editorView = editorViewRef.current;
      if (!editorView) return;
      const docLen = editorView.state.doc.length;
      const safePos = Math.max(0, Math.min(pos, docLen));
      editorView.dispatch({
        changes: { from: safePos, to: safePos, insert: text },
        selection: { anchor: safePos + text.length },
      });
      editorView.focus();
    },
    posAtCoords(x: number, y: number) {
      const editorView = editorViewRef.current;
      if (!editorView) return null;
      try {
        const result = editorView.posAtCoords({ x, y });
        return result ?? null;
      } catch {
        return null;
      }
    },
    getSelection() {
      const editorView = editorViewRef.current;
      if (!editorView) return null;
      const selection = editorView.state.selection.main;
      if (selection.empty) return null;
      return {
        text: editorView.state.doc.sliceString(selection.from, selection.to),
        from: selection.from,
        to: selection.to,
      };
    },
    replaceSelection(text: string) {
      const editorView = editorViewRef.current;
      if (!editorView) return;
      const selection = editorView.state.selection.main;
      editorView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length },
      });
      editorView.focus();
    },
    replaceRange(from: number, to: number, text: string) {
      const editorView = editorViewRef.current;
      if (!editorView) return false;
      const docLen = editorView.state.doc.length;
      const safeFrom = Math.max(0, Math.min(from, docLen));
      const safeTo = Math.max(safeFrom, Math.min(to, docLen));
      editorView.dispatch({
        changes: { from: safeFrom, to: safeTo, insert: text },
        selection: { anchor: safeFrom + text.length },
      });
      editorView.focus();
      return true;
    },
    replaceRanges(changes) {
      const editorView = editorViewRef.current;
      if (!editorView || changes.length === 0) return false;
      const docLen = editorView.state.doc.length;
      const safeChanges = changes.map(({ from, to, insert }) => ({
        from: Math.max(0, Math.min(from, docLen)),
        to: Math.max(0, Math.min(to, docLen)),
        insert,
      }));
      if (safeChanges.some((change) => change.to < change.from)) return false;
      const ordered = [...safeChanges].sort((a, b) => a.from - b.from || a.to - b.to);
      if (ordered.some((change, index) => index > 0 && change.from < ordered[index - 1]!.to)) return false;
      try {
        editorView.dispatch({ changes: ordered });
        editorView.focus();
        return true;
      } catch {
        return false;
      }
    },
    format(action) {
      const editorView = editorViewRef.current;
      if (!editorView) return;
      applyCm6Format(editorView, action);
    },
    validateAnchor(anchorFilePath: string, from: number, to: number, originalText: string, _prefixHint?: string) {
      const editor = editorViewRef.current;
      if (!editor) return 'wrong-file';
      // 文件切换：当前编辑器实例对应的 filePath 必须等于 anchor 指向的文件
      const currentPath = filePathRef.current;
      if (!currentPath || currentPath !== anchorFilePath) return 'wrong-file';
      const docLen = editor.state.doc.length;
      if (from < 0 || to > docLen) return 'stale';
      return editor.state.doc.sliceString(from, to) === originalText ? 'valid' : 'stale';
    },
    // Source 模式:from/to 直接是 CodeMirror 文档偏移,不需要 opts.text / query /
    // searchOptions。保留 opts 签名仅是为了实现 TypolaEditorKernel 契约。
    revealRange(from: number, to: number, opts) {
      const editorView = editorViewRef.current;
      if (!editorView) return;
      suppressFloatingBarRef.current = true;
      editorView.dispatch({
        effects: EditorView.scrollIntoView(from, { y: 'center', yMargin: 80 }),
        selection: { anchor: from, head: to },
      });
      flashRange(from);
      if (!opts?.preserveFocus) editorView.focus();
      window.setTimeout(() => { suppressFloatingBarRef.current = false; }, FLOATING_BAR_SETTLE_MS);
    },
    revealText(text: string, backwards = false) {
      const editorView = editorViewRef.current;
      if (!editorView || !text) return;
      const docString = editorView.state.doc.toString();
      const fromPos = editorView.state.selection.main.to;
      const idx = backwards
        ? docString.lastIndexOf(text, Math.max(0, fromPos - 1))
        : docString.indexOf(text, fromPos);
      if (idx === -1) return;
      const to = idx + text.length;
      suppressFloatingBarRef.current = true;
      editorView.dispatch({
        selection: { anchor: idx, head: to },
        effects: EditorView.scrollIntoView(idx, { y: 'center', yMargin: 80 }),
      });
      flashRange(idx);
      editorView.focus();
      window.setTimeout(() => { suppressFloatingBarRef.current = false; }, FLOATING_BAR_SETTLE_MS);
    },
    setZoom(size: number) {
      const editorView = editorViewRef.current;
      if (!editorView) return;
      applyBaseSize(editorView, size);
    },
    setFoldedHeadings(keys: ReadonlySet<string>) {
      const editorView = editorViewRef.current;
      if (!editorView) return;
      // setFoldedHeadings 的 keys 类型来自 TypolaEditorKernel 契约(string),
      // headingFoldExtension 内部仍按 FoldKey(`${level}:${text}`) 处理。
      setFoldedHeadings(editorView, keys as ReadonlySet<never>);
    },
    undoLastAIReplacement() {
      // CodeMirror 的 history 插件已自动追踪所有 dispatch（含 replaceRange），
      // 原生 Ctrl+Z 直接生效，无需额外撤销栈。
      return false;
    },
    commitAIReplacement(content: string) {
      // 一次性整篇替换:走单次 dispatch,CodeMirror history 自动栈,一次 Ctrl+Z 回退。
      const editorView = editorViewRef.current;
      if (!editorView) return;
      const docLen = editorView.state.doc.length;
      editorView.dispatch({
        changes: { from: 0, to: docLen, insert: content },
      });
      editorView.focus();
    },
  }), [flashRange]);

  return (
    <div className="editor-pane" style={editorFontStyle} onContextMenu={handleContextMenu} onPaste={handlePaste}>
      <CodeMirror
        value={source}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        spellCheck={settings.editorSpellCheck}
        theme="light"
        basicSetup={{
          lineNumbers: settings.editorLineNumbers,
          searchKeymap: true,
          history: true,
        }}
      />
      {onAIAction && settings.selectionFloatingBarEnabled && (
        <SelectionFloatingBar
          rect={floatingRect}
          hasSelection={floatingHasSelection}
          stableTick={floatingStableTick}
          onPick={(action, origin) => triggerAIAction(action, origin)}
          onDismissSession={handleFloatingBarDismissSession}
          onHideGlobally={handleFloatingBarHideGlobally}
        />
      )}
      <EditorContextMenu
        open={ctxMenu !== null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        hasSelection={ctxMenu?.hasSelection ?? false}
        hasImage={ctxMenu?.hasImage ?? false}
        onPick={handleFormatPick}
        onClose={() => setCtxMenu(null)}
      />
      <TableContextMenu
        open={tableCtxMenu !== null}
        x={tableCtxMenu?.x ?? 0}
        y={tableCtxMenu?.y ?? 0}
        onPick={handleTablePick}
        onClose={() => setTableCtxMenu(null)}
      />      <Cm6EditPopover request={editRequest} onClose={() => setEditRequest(null)} />
      <ImageMetaPopover request={imageMetaRequest} onClose={() => setImageMetaRequest(null)} />
    </div>
  );
});

function resolveSrcForMarkdown(rawSrc: string, documentPath: string | undefined): string {
  if (/^(?:https?:|data:|mailto:|#)/iu.test(rawSrc)) return rawSrc;
  if (typeof documentPath !== 'string' || !documentPath) return rawSrc;
  const absolute = resolveLocalResourcePath(documentPath, rawSrc);
  if (!absolute) return rawSrc;
  return formatImageSrc(absolute, documentPath, {
    imagePreferRelative: true,
    imageEnsureDotPrefix: true,
    imageEscapeUrl: false,
  });
}

async function openImageAt(image: MarkdownImage, documentPath: string | undefined) {
  const raw = image.url;
  if (/^(?:https?:|mailto:|data:)/iu.test(raw)) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(raw);
    } catch (error) {
      console.warn('openImageAt url failed:', error);
    }
    return;
  }
  if (typeof documentPath !== 'string' || !documentPath) {
    console.warn('openImageAt: documentPath missing, cannot resolve relative path');
    return;
  }
  const absolute = resolveLocalResourcePath(documentPath, raw);
  if (!absolute) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_path_external', { path: absolute });
  } catch (error) {
    console.warn('openImageAt invoke failed:', error);
  }
}

async function copyImagePath(image: MarkdownImage, documentPath: string | undefined) {
  const text = resolveSrcForMarkdown(image.url, documentPath);
  try {
    await writeClipboardText(text);
  } catch (error) {
    console.warn('copyImagePath failed:', error);
  }
}
