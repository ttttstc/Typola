import { StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { findUniqueAnchor } from '../../../services/agent/selectionActions';
import type { ReviewComment } from '../../../services/review/reviewState';

type ReviewMarkOptions = {
  comments?: readonly ReviewComment[];
  filePath?: string;
};

function buildMarks(doc: string, comments: readonly ReviewComment[], filePath?: string): DecorationSet {
  const lines = new Set<number>();
  for (const comment of comments) {
    if (!filePath || comment.filePath !== filePath) continue;
    const hit = findUniqueAnchor(doc, comment.anchor.originalText, comment.anchor.prefixHint);
    if (!hit) continue;
    const fromLine = doc.lastIndexOf('\n', hit.start) + 1;
    const end = hit.start + hit.length;
    let lineStart = fromLine;
    while (lineStart <= end) {
      lines.add(lineStart);
      const nextLine = doc.indexOf('\n', lineStart);
      if (nextLine === -1 || nextLine >= end) break;
      lineStart = nextLine + 1;
    }
  }
  return Decoration.set(
    [...lines].sort((a, b) => a - b).map((from) => (
      Decoration.line({ attributes: { class: 'typola-cm-review-mark' } }).range(from)
    )),
    true,
  );
}

/** Mark lines containing active review anchors without mutating editor DOM. */
export function reviewMarkExtension(options: ReviewMarkOptions = {}): Extension {
  const comments = options.comments ?? [];
  return StateField.define<DecorationSet>({
    create(state) {
      return buildMarks(state.doc.toString(), comments, options.filePath);
    },
    update(marks, transaction) {
      return transaction.docChanged ? marks.map(transaction.changes) : marks;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
