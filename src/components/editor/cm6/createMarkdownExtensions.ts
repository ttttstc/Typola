import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

type CreateMarkdownExtensionsOptions = {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  extraExtensions?: Extension[];
  onModK?: () => boolean;
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

  extensions.push(
    EditorView.theme({
      '&': {
        fontFamily: options.fontFamily,
      },
      '.cm-content': {
        fontSize: `${options.fontSize}px`,
        fontFamily: options.fontFamily,
      },
      '.cm-gutters': {
        fontFamily: options.fontFamily,
      },
    }),
  );

  return extensions;
}
