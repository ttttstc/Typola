import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { recordCm6InputToPaint } from '../../../perf/index';
import type { FormatAction } from '../../EditorContextMenu';

type CreateMarkdownExtensionsOptions = {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  extraExtensions?: Extension[];
  onModK?: () => boolean;
  onFormat?: (action: FormatAction) => boolean;
};

export function createMarkdownExtensions(options: CreateMarkdownExtensionsOptions): Extension[] {
  const extensions: Extension[] = [markdown({ base: markdownLanguage })];

  if (options.tabSize !== 4) {
    extensions.push(EditorState.tabSize.of(options.tabSize));
  }

  if (options.wordWrap) {
    extensions.push(EditorView.lineWrapping);
  }

  if (options.extraExtensions?.length) {
    extensions.push(...options.extraExtensions);
  }

  if (options.onModK) {
    extensions.push(keymap.of([{
      key: 'Mod-k',
      preventDefault: true,
      run: options.onModK,
    }]));
  }

  if (options.onFormat) {
    extensions.push(keymap.of([
      { key: 'Mod-b', preventDefault: true, run: () => options.onFormat?.({ type: 'bold' }) ?? false },
      { key: 'Mod-i', preventDefault: true, run: () => options.onFormat?.({ type: 'italic' }) ?? false },
      { key: 'Mod-Shift-7', preventDefault: true, run: () => options.onFormat?.({ type: 'ol' }) ?? false },
      { key: 'Mod-Shift-8', preventDefault: true, run: () => options.onFormat?.({ type: 'ul' }) ?? false },
    ]));
  }

  extensions.push(
    EditorView.theme({
      '&': {
        fontFamily: options.fontFamily,
        backgroundColor: 'var(--theme-paper)',
        color: 'var(--theme-text-primary)',
      },
      '.cm-content': {
        fontSize: `${options.fontSize}px`,
        fontFamily: options.fontFamily,
        caretColor: 'var(--theme-accent)',
      },
      '.cm-scroller': {
        backgroundColor: 'var(--theme-paper)',
      },
      '.cm-gutters': {
        fontFamily: options.fontFamily,
        backgroundColor: 'var(--theme-editor-gutter-bg)',
        color: 'var(--theme-editor-gutter-text)',
        borderRight: '1px solid var(--theme-border-soft)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--theme-editor-active-line)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--theme-editor-active-line)',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'var(--theme-selection) !important',
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--theme-editor-search-match)',
      },
    }),
  );

  extensions.push(
    EditorView.updateListener.of((update) => {
      if (update.docChanged) recordCm6InputToPaint();
    }),
  );

  return extensions;
}
