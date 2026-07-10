import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { useSettings } from '../hooks/useSettings';
import type { EditorCoreHandle } from '../types/editorCore';
import { EditorContextMenu, type FormatAction } from './EditorContextMenu';
import { SelectionFloatingBar } from './selection/SelectionFloatingBar';
import { applyCm6Format } from '../services/editor/cm6FormatService';
import type { SelectionActionId } from '../services/agent/selectionActions';
import type { SelectionAnchor } from '../services/agent/types';
import { createMarkdownExtensions } from './editor/cm6/createMarkdownExtensions';
import { headingIndexAt } from './editor/cm6/previewSyncExtension';
import { applyBaseSize } from './editor/cm6/wheelZoomExtension';
import { setFoldedHeadings } from './editor/cm6/headingFoldExtension';

export type SourceHeadingScrollRequest = {
  index: number;
  /** 段内滚动比例(0..1),可选;不传则只滚到 heading 顶部 */
  withinRatio?: number;
  requestId: number;
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
};

export const EditorPane = forwardRef<EditorCoreHandle, EditorPaneProps>(function EditorPane(
  props,
  ref,
) {
  const { source, onChange, extraExtensions, headingScrollRequest, onScrollRatio, filePath, onAIAction } = props;
  const settings = useSettings();
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);
  const handledHeadingScrollRequestRef = useRef<number | null>(null);
  const onAIActionRef = useRef(onAIAction);
  const filePathRef = useRef(filePath);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorFontFamily = settings.editorFontFamily === 'System Default'
    ? 'var(--font-mono)'
    : `'${settings.editorFontFamily}', var(--font-mono)`;

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
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);
  useEffect(() => { editorViewRef.current = editorView; }, [editorView]);

  // 抽 triggerAIAction:菜单/浮条/Ctrl+K 都用它,统一组装 anchor + origin。
  const triggerAIAction = useCallback((action: SelectionActionId, origin?: { x: number; y: number }) => {
    const editor = editorViewRef.current;
    const path = filePathRef.current;
    const cb = onAIActionRef.current;
    if (!editor || !path || !cb) return;
    const sel = editor.state.selection.main;
    const text = sel.empty ? '' : editor.state.doc.sliceString(sel.from, sel.to);
    if (!text && action !== 'custom') return;
    const anchor: SelectionAnchor = {
      filePath: path,
      from: sel.from,
      to: sel.to,
      originalText: text,
    };
    cb(action, anchor, origin);
  }, []);

  const handleAIPick = useCallback((action: SelectionActionId) => {
    // 菜单 origin 用菜单当前位置;菜单 state 在 onClose 才被清,这里仍可读。
    const origin = ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : undefined;
    triggerAIAction(action, origin);
  }, [ctxMenu, triggerAIAction]);

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
  useEffect(() => {
    if (!editorView) return;
    const computeFromSelection = () => {
      if (suppressFloatingBarRef.current) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        return;
      }
      const sel = editorView.state.selection.main;
      if (sel.empty) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        return;
      }
      const fromCoords = editorView.coordsAtPos(sel.from);
      const toCoords = editorView.coordsAtPos(sel.to);
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
    const onChange = () => window.requestAnimationFrame(computeFromSelection);
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      // 只追踪编辑器正文内的拖选起始,不要吞掉浮条/菜单/工具栏的 mousedown。
      if (editorView.contentDOM.contains(target)) {
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
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [editorView]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const editor = editorView;
    if (!editor) return;
    const target = event.target as Node | null;
    if (!target || !editor.contentDOM.contains(target)) return;
    event.preventDefault();
    const sel = editor.state.selection.main;
    setCtxMenu({ x: event.clientX, y: event.clientY, hasSelection: !sel.empty });
  }, [editorView]);

  const handleFormatPick = useCallback((action: FormatAction) => {
    const editor = editorViewRef.current;
    if (!editor) return;
    applyCm6Format(editor, action);
  }, []);

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
        setCtxMenu({ x: coords.left, y: coords.top, hasSelection: true });
        return true;
      },
      onFormat: (action) => {
        const view = editorViewRef.current;
        if (!view) return false;
        applyCm6Format(view, action);
        return true;
      },
    });
  }, [editorFontFamily, extraExtensions, settings.editorFontSize, settings.editorTabSize, settings.editorWordWrap]);

  useEffect(() => {
    if (!editorView || !headingScrollRequest) return;
    if (handledHeadingScrollRequestRef.current === headingScrollRequest.requestId) return;

    const from = headingIndexAt(editorView.state, headingScrollRequest.index);
    if (from === null) return;
    handledHeadingScrollRequestRef.current = headingScrollRequest.requestId;

    if (headingScrollRequest.withinRatio !== undefined) {
      // 段内插值滚动:用 view.lineBlockAt 像素位置 + withinRatio 精确定位
      const nextFrom = headingIndexAt(editorView.state, headingScrollRequest.index + 1);
      const headingBlock = editorView.lineBlockAt(from);
      const nextBlock = nextFrom !== null ? editorView.lineBlockAt(nextFrom) : null;
      const sectionStart = headingBlock.top;
      const sectionEnd = nextBlock ? nextBlock.top : editorView.scrollDOM.scrollHeight;
      const ratio = Math.max(0, Math.min(1, headingScrollRequest.withinRatio));
      const target = sectionStart + (sectionEnd - sectionStart) * ratio;
      suppressFloatingBarRef.current = true;
      editorView.dispatch({
        effects: EditorView.scrollIntoView(from, { y: 'start' }),
        selection: { anchor: from },
      });
      editorView.scrollDOM.scrollTop = Math.max(0, target);
      window.setTimeout(() => { suppressFloatingBarRef.current = false; }, FLOATING_BAR_SETTLE_MS);
    } else {
      suppressFloatingBarRef.current = true;
      editorView.dispatch({
        effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 24 }),
        selection: { anchor: from },
      });
      window.setTimeout(() => { suppressFloatingBarRef.current = false; }, FLOATING_BAR_SETTLE_MS);
    }
  }, [editorView, headingScrollRequest]);

  useEffect(() => {
    if (!editorView || !onScrollRatio) return;
    const dom = editorView.scrollDOM;
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const max = dom.scrollHeight - dom.clientHeight;
        onScrollRatio(max > 0 ? dom.scrollTop / max : 0);
      });
    };
    dom.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      dom.removeEventListener('scroll', handleScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [editorView, onScrollRatio]);

  useImperativeHandle(ref, () => ({
    focus() {
      editorView?.focus();
    },
    getMarkdown() {
      return editorView?.state.doc.toString() ?? source;
    },
    setMarkdown(markdown: string) {
      if (!editorView) return;
      const docLen = editorView.state.doc.length;
      editorView.dispatch({
        changes: { from: 0, to: docLen, insert: markdown },
      });
    },
    insertText(text: string) {
      if (!editorView) return;
      const selection = editorView.state.selection.main;
      editorView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length },
      });
      editorView.focus();
    },
    insertTextAt(text: string, pos: number) {
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
      if (!editorView) return null;
      try {
        const result = editorView.posAtCoords({ x, y });
        return result ?? null;
      } catch {
        return null;
      }
    },
    getSelection() {
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
      if (!editorView) return;
      const selection = editorView.state.selection.main;
      editorView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length },
      });
      editorView.focus();
    },
    replaceRange(from: number, to: number, text: string) {
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
      if (!editorView || changes.length === 0) return false;
      const docLen = editorView.state.doc.length;
      const safeChanges = changes.map(({ from, to, insert }) => ({
        from: Math.max(0, Math.min(from, docLen)),
        to: Math.max(0, Math.min(to, docLen)),
        insert,
      }));
      if (safeChanges.some((change) => change.to < change.from)) return false;
      try {
        editorView.dispatch({ changes: safeChanges });
        editorView.focus();
        return true;
      } catch {
        return false;
      }
    },
    format(action) {
      if (!editorView) return;
      applyCm6Format(editorView, action);
    },
    validateAnchor(anchorFilePath: string, from: number, to: number, originalText: string, _prefixHint?: string) {
      const editor = editorView;
      if (!editor) return 'wrong-file';
      // 文件切换：当前编辑器实例对应的 filePath 必须等于 anchor 指向的文件
      const currentPath = filePathRef.current;
      if (!currentPath || currentPath !== anchorFilePath) return 'wrong-file';
      const docLen = editor.state.doc.length;
      if (from < 0 || to > docLen) return 'stale';
      return editor.state.doc.sliceString(from, to) === originalText ? 'valid' : 'stale';
    },
    // Source 模式:from/to 直接是 CodeMirror 文档偏移,不需要 opts.text / query /
    // searchOptions。保留 opts 签名仅是为了实现 EditorCoreHandle 契约。
    revealRange(from: number, to: number, opts) {
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
      if (!editorView) return;
      applyBaseSize(editorView, size);
    },
    setFoldedHeadings(keys: ReadonlySet<string>) {
      if (!editorView) return;
      // setFoldedHeadings 的 keys 类型来自 EditorCoreHandle 契约(string),
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
      if (!editorView) return;
      const docLen = editorView.state.doc.length;
      editorView.dispatch({
        changes: { from: 0, to: docLen, insert: content },
      });
      editorView.focus();
    },
  }), [editorView]);

  return (
    <div className="editor-pane" onContextMenu={handleContextMenu}>
      <CodeMirror
        value={source}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={setEditorView}
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
        />
      )}
      <EditorContextMenu
        open={ctxMenu !== null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        hasSelection={ctxMenu?.hasSelection ?? false}
        onPick={handleFormatPick}
        onClose={() => setCtxMenu(null)}
        onPickAI={onAIAction ? handleAIPick : undefined}
      />
    </div>
  );
});
