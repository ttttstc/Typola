import type { Mark } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

type InlineMarkdownMarker = {
  from: number;
  key: string;
  kind: string;
  mark: Mark;
  prefix: string;
  suffix: string;
  to: number;
};

const markdownSyntaxPluginKey = new PluginKey<DecorationSet>('markdown-syntax');

function dedupeMarks(marks: readonly Mark[]) {
  const seen = new Set<string>();
  return marks.filter((mark) => {
    const key = `${mark.type.name}:${JSON.stringify(mark.attrs)}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getCursorMarks(state: EditorState) {
  const { $from } = state.selection;
  const marks: Mark[] = [...$from.marks()];

  if ($from.nodeBefore) {
    marks.push(...$from.nodeBefore.marks);
  }

  if ($from.nodeAfter) {
    marks.push(...$from.nodeAfter.marks);
  }

  return dedupeMarks(marks);
}

function findInlineMarkerRange(state: EditorState, targetMark: Mark) {
  if (!state.selection.empty) {
    return null;
  }

  const { $from } = state.selection;
  const parent = $from.parent;
  const hasMark = (markSet: readonly Mark[]) => markSet.some((mark) => mark.eq(targetMark));

  let index = $from.index();
  let offset = $from.start();

  for (let currentIndex = 0; currentIndex < index; currentIndex += 1) {
    offset += parent.child(currentIndex).nodeSize;
  }

  if (!$from.textOffset && index > 0) {
    const before = parent.child(index - 1);
    if (before && hasMark(before.marks)) {
      index -= 1;
      offset -= before.nodeSize;
    }
  }

  if (index >= parent.childCount) {
    return null;
  }

  const node = parent.child(index);
  if (!hasMark(node.marks)) {
    return null;
  }

  let from = offset;
  let to = offset + node.nodeSize;

  for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
    const current = parent.child(currentIndex);
    if (!hasMark(current.marks)) {
      break;
    }

    from -= current.nodeSize;
  }

  for (let currentIndex = index + 1; currentIndex < parent.childCount; currentIndex += 1) {
    const current = parent.child(currentIndex);
    if (!hasMark(current.marks)) {
      break;
    }

    to += current.nodeSize;
  }

  return { from, to };
}

function buildInlineMarker(mark: Mark) {
  switch (mark.type.name) {
    case 'strong':
      return { kind: 'bold', prefix: '**', suffix: '**' };
    case 'emphasis':
      return { kind: 'italic', prefix: '*', suffix: '*' };
    case 'strike_through':
      return { kind: 'strikethrough', prefix: '~~', suffix: '~~' };
    case 'inlineCode':
      return { kind: 'inline-code', prefix: '`', suffix: '`' };
    case 'link': {
      const href = String(mark.attrs.href ?? '');
      return { kind: 'link', prefix: '[', suffix: `](${href})` };
    }
    default:
      return null;
  }
}

export function getInlineMarkdownMarkers(state: EditorState): InlineMarkdownMarker[] {
  if (!state.selection.empty) {
    return [];
  }

  return getCursorMarks(state)
    .map((mark) => {
      const syntax = buildInlineMarker(mark);
      const range = findInlineMarkerRange(state, mark);

      if (!syntax || !range) {
        return null;
      }

      return {
        ...syntax,
        ...range,
        key: `${mark.type.name}:${range.from}:${range.to}:${JSON.stringify(mark.attrs)}`,
        mark,
      };
    })
    .filter((marker): marker is InlineMarkdownMarker => marker !== null)
    .sort((left, right) => {
      const leftSize = left.to - left.from;
      const rightSize = right.to - right.from;
      return leftSize - rightSize;
    });
}

export function getInlineMarkdownMarkerRemoval(state: EditorState, key: string) {
  if (key !== 'Backspace' && key !== 'Delete') {
    return null;
  }

  if (!state.selection.empty) {
    return null;
  }

  const cursor = state.selection.from;
  return (
    getInlineMarkdownMarkers(state).find((marker) =>
      key === 'Backspace' ? cursor === marker.from : cursor === marker.to
    ) ?? null
  );
}

function buildDecorations(state: EditorState) {
  const decorations = getInlineMarkdownMarkers(state).map((marker) =>
    Decoration.inline(
      marker.from,
      marker.to,
      {
        class: 'md-syntax-marker',
        'data-md-kind': marker.kind,
        'data-md-prefix': marker.prefix,
        'data-md-suffix': marker.suffix,
      },
      {
        inclusiveEnd: true,
        inclusiveStart: true,
        key: marker.key,
      }
    )
  );

  return DecorationSet.create(state.doc, decorations);
}

function handleInlineMarkerDelete(view: EditorView, event: KeyboardEvent) {
  const marker = getInlineMarkdownMarkerRemoval(view.state, event.key);
  if (!marker) {
    return false;
  }

  event.preventDefault();

  const cursor = event.key === 'Backspace' ? marker.from : marker.to;
  const tr = view.state.tr.removeMark(marker.from, marker.to, marker.mark);
  tr.setSelection(TextSelection.create(tr.doc, cursor));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function createMarkdownSyntaxPlugin() {
  return new Plugin({
    key: markdownSyntaxPluginKey,
    props: {
      decorations(state) {
        return markdownSyntaxPluginKey.getState(state);
      },
      handleKeyDown(view, event) {
        return handleInlineMarkerDelete(view, event);
      },
    },
    state: {
      apply(tr, previous, oldState, newState) {
        if (!tr.docChanged && tr.selection.eq(oldState.selection)) {
          return previous.map(tr.mapping, tr.doc);
        }

        return buildDecorations(newState);
      },
      init: (_config, state) => buildDecorations(state),
    },
  });
}
