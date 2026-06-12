import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useSettings } from '../hooks/useSettings';
import type { EditorCommandHandle } from '../types/editorCommands';

export type SourceHeadingScrollRequest = {
  index: number;
  requestId: number;
};

type EditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  headingScrollRequest?: SourceHeadingScrollRequest;
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
  { source, onChange, headingScrollRequest },
  ref,
) {
  const settings = useSettings();
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const handledHeadingScrollRequestRef = useRef<number | null>(null);
  const editorFontFamily = settings.editorFontFamily === 'System Default'
    ? 'var(--font-mono)'
    : `'${settings.editorFontFamily}', var(--font-mono)`;

  const extensions = useMemo(() => {
    const exts: Parameters<typeof CodeMirror>[0]['extensions'] = [markdown()];

    if (settings.editorTabSize !== 4) {
      exts.push(EditorState.tabSize.of(settings.editorTabSize));
    }

    if (settings.editorWordWrap) {
      exts.push(EditorView.lineWrapping);
    }

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
    <div className="editor-pane">
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
    </div>
  );
});
