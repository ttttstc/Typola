import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';

const autoPairPluginKey = new PluginKey('auto-pair');

const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
};

const OPENERS = new Set(Object.keys(PAIRS));
const CLOSERS = new Set(Object.values(PAIRS));

function isInsideCodeLike(state: import('prosemirror-state').EditorState) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name;
    if (nodeName === 'code_block' || nodeName === 'fence') return true;
  }
  const marks = $from.marks();
  return marks.some((mark) => mark.type.name === 'inlineCode' || mark.type.name === 'code');
}

export function createAutoPairPlugin() {
  return new Plugin({
    key: autoPairPluginKey,
    props: {
      handleTextInput(view, from, to, text) {
        if (text.length !== 1) return false;
        const state = view.state;
        if (isInsideCodeLike(state)) return false;

        if (CLOSERS.has(text)) {
          const nextChar = state.doc.textBetween(to, Math.min(to + 1, state.doc.content.size));
          if (nextChar === text) {
            const tr = state.tr.setSelection(TextSelection.create(state.doc, to + 1));
            view.dispatch(tr);
            return true;
          }
        }

        if (!OPENERS.has(text)) return false;

        const close = PAIRS[text];
        const selection = state.selection;

        if (!selection.empty) {
          const { from: selFrom, to: selTo } = selection;
          const inner = state.doc.textBetween(selFrom, selTo, '\n');
          const tr = state.tr.replaceWith(
            selFrom,
            selTo,
            state.schema.text(`${text}${inner}${close}`)
          );
          tr.setSelection(
            TextSelection.create(
              tr.doc,
              selFrom + 1,
              selFrom + 1 + inner.length
            )
          );
          view.dispatch(tr);
          return true;
        }

        // Prevent doubling "'" after a word character (e.g., "don't")
        if ((text === "'" || text === '"')) {
          const prev = state.doc.textBetween(Math.max(0, from - 1), from);
          if (/[\w\u4e00-\u9fa5]/.test(prev)) return false;
        }

        const tr = state.tr.insertText(`${text}${close}`, from, to);
        tr.setSelection(TextSelection.create(tr.doc, from + 1));
        view.dispatch(tr);
        return true;
      },
      handleKeyDown(view, event) {
        if (event.key !== 'Backspace') return false;
        const state = view.state;
        if (!state.selection.empty) return false;
        if (isInsideCodeLike(state)) return false;

        const pos = state.selection.from;
        const before = state.doc.textBetween(Math.max(0, pos - 1), pos);
        const after = state.doc.textBetween(pos, Math.min(state.doc.content.size, pos + 1));
        if (OPENERS.has(before) && PAIRS[before] === after) {
          const tr = state.tr.delete(pos - 1, pos + 1);
          view.dispatch(tr);
          return true;
        }
        return false;
      },
    },
  });
}
