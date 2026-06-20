import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { useSettings } from '../hooks/useSettings';
import type { EditorCommandHandle } from '../types/editorCommands';
import { SelectionAIMenu } from './selection/SelectionAIMenu';
import type { SelectionActionId } from '../services/agent/selectionActions';
import type { SelectionAnchor } from '../services/agent/types';

export type SourceHeadingScrollRequest = {
  index: number;
  requestId: number;
};

type EditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  headingScrollRequest?: SourceHeadingScrollRequest;
  onScrollRatio?: (ratio: number) => void;
  filePath?: string;
  // 选区 AI 动作回调（由 AppLayout 注入；不传则不渲染 AI 菜单）
  onAIAction?: (action: SelectionActionId, anchor: SelectionAnchor) => void;
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

export const EditorPane = forwardRef<EditorCommandHandle, EditorPaneProps>(function EditorPane(
  props,
  ref,
) {
  const { source, onChange, headingScrollRequest, onScrollRatio, filePath, onAIAction } = props;
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

  const handleAIPick = useCallback((action: SelectionActionId) => {
    const editor = editorView;
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
    cb(action, anchor);
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
    const exts: Parameters<typeof CodeMirror>[0]['extensions'] = [markdown()];

    if (settings.editorTabSize !== 4) {
      exts.push(EditorState.tabSize.of(settings.editorTabSize));
    }

    if (settings.editorWordWrap) {
      exts.push(EditorView.lineWrapping);
    }

    // Cmd/Ctrl+K → 弹起 5+1 AI 菜单(对齐右键的动线),菜单触发后再走 onAIAction 注入
    exts.push(keymap.of([{
      key: 'Mod-k',
      preventDefault: true,
      run: () => {
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
    }]));

    exts.push(
      EditorView.theme({
        '&': {
          fontFamily: editorFontFamily,
        },
        '.cm-content': {
          fontSize: `${settings.editorFontSize}px`,
          fontFamily: editorFontFamily,
        },
        '.cm-gutters': {
          fontFamily: editorFontFamily,
        },
      })
    );

    return exts;
  }, [editorFontFamily, settings.editorFontSize, settings.editorTabSize, settings.editorWordWrap]);

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
    revealRange(from: number, to: number) {
      if (!editorView) return;
      editorView.dispatch({
        effects: EditorView.scrollIntoView(from, { y: 'center', yMargin: 80 }),
        selection: { anchor: from, head: to },
      });
      editorView.focus();
    },
    revealText() {
      editorView?.focus();
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
        <SelectionAIMenu
          open={aiMenu !== null}
          x={aiMenu?.x ?? 0}
          y={aiMenu?.y ?? 0}
          hasSelection={aiMenu?.hasSelection ?? false}
          onPick={handleAIPick}
          onClose={() => setAiMenu(null)}
        />
      )}
    </div>
  );
});
