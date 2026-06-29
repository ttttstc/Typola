import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { useSettings } from '../hooks/useSettings';
import type { EditorCoreHandle } from '../types/editorCore';
import { SelectionAIMenu } from './selection/SelectionAIMenu';
import { SelectionFloatingBar } from './selection/SelectionFloatingBar';
import type { SelectionActionId } from '../services/agent/selectionActions';
import type { SelectionAnchor } from '../services/agent/types';
import { createMarkdownExtensions } from './editor/cm6/createMarkdownExtensions';

export type SourceHeadingScrollRequest = {
  index: number;
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

function findHeadingPosition(source: string, targetIndex: number): number | null {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = headingRegex.exec(source)) !== null) {
    if (index === targetIndex) return match.index;
    index += 1;
  }

  return null;
}

export const EditorPane = forwardRef<EditorCoreHandle, EditorPaneProps>(function EditorPane(
  props,
  ref,
) {
  const { source, onChange, extraExtensions, headingScrollRequest, onScrollRatio, filePath, onAIAction } = props;
  const settings = useSettings();
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);
  const handledHeadingScrollRequestRef = useRef<number | null>(null);
  const onAIActionRef = useRef(onAIAction);
  const filePathRef = useRef(filePath);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorFontFamily = settings.editorFontFamily === 'System Default'
    ? 'var(--font-mono)'
    : `'${settings.editorFontFamily}', var(--font-mono)`;

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
    const origin = aiMenu ? { x: aiMenu.x, y: aiMenu.y } : undefined;
    triggerAIAction(action, origin);
  }, [aiMenu, triggerAIAction]);

  // 选区浮条状态:跟着 CodeMirror 选区变化重算 rect + hasSelection。
  const [floatingRect, setFloatingRect] = useState<{ selRect: DOMRect } | null>(null);
  const [floatingHasSelection, setFloatingHasSelection] = useState(false);
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
    document.addEventListener('selectionchange', onChange);
    window.addEventListener('mouseup', onChange);
    window.addEventListener('keyup', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.removeEventListener('mouseup', onChange);
      window.removeEventListener('keyup', onChange);
    };
  }, [editorView]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!onAIAction) return;
    const editor = editorView;
    if (!editor) return;
    const target = event.target as Node | null;
    if (!target || !editor.contentDOM.contains(target)) return;
    event.preventDefault();
    const sel = editor.state.selection.main;
    const hasSelection = !sel.empty;
    setAiMenu({ x: event.clientX, y: event.clientY, hasSelection });
  }, [editorView, onAIAction]);

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
        setAiMenu({ x: coords.left, y: coords.top, hasSelection: true });
        return true;
      },
    });
  }, [editorFontFamily, extraExtensions, settings.editorFontSize, settings.editorTabSize, settings.editorWordWrap]);

  useEffect(() => {
    if (!editorView || !headingScrollRequest) return;
    if (handledHeadingScrollRequestRef.current === headingScrollRequest.requestId) return;

    const position = findHeadingPosition(source, headingScrollRequest.index);
    if (position === null) return;

    handledHeadingScrollRequestRef.current = headingScrollRequest.requestId;
    editorView.dispatch({
      effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 24 }),
      selection: { anchor: position },
    });
  }, [editorView, headingScrollRequest, source]);

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
      if (!opts?.preserveFocus) editorView.focus();
      window.setTimeout(() => { suppressFloatingBarRef.current = false; }, FLOATING_BAR_SETTLE_MS);
    },
    revealText() {
      editorView?.focus();
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
      {onAIAction && (
        <>
          <SelectionAIMenu
            open={aiMenu !== null}
            x={aiMenu?.x ?? 0}
            y={aiMenu?.y ?? 0}
            hasSelection={aiMenu?.hasSelection ?? false}
            onPick={handleAIPick}
            onClose={() => setAiMenu(null)}
          />
          {settings.selectionFloatingBarEnabled && (
            <SelectionFloatingBar
              rect={floatingRect}
              hasSelection={floatingHasSelection}
              onPick={(action, origin) => triggerAIAction(action, origin)}
            />
          )}
        </>
      )}
    </div>
  );
});
