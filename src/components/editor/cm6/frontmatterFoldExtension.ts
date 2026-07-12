import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { detectFrontmatter } from '../../../services/markdownAnalysisService';

const setExpanded = StateEffect.define<boolean>();

class FrontmatterWidget extends WidgetType {
  toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'cm6-frontmatter-chip'; button.textContent = 'frontmatter · 点击展开';
    return button;
  }
}

export function frontmatterFoldExtension(): Extension {
  const expanded = StateField.define<boolean>({ create: () => false, update: (value, transaction) => transaction.effects.reduce((next, effect) => effect.is(setExpanded) ? effect.value : next, value) });
  const decorations = StateField.define({
    create(state) { return build(state, false); },
    update(_value, transaction) { return build(transaction.state, transaction.state.field(expanded)); },
    provide: (field) => EditorView.decorations.from(field),
  });
  // Widget needs its view to dispatch; a lightweight DOM event keeps field state local to this editor.
  const handler = EditorView.domEventHandlers({ click(event, view) {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('.cm6-frontmatter-chip')) return false;
    view.dispatch({ effects: setExpanded.of(true) }); return true;
  } });
  return [expanded, decorations, handler];
}

function build(state: EditorState, expanded: boolean) {
  const range = detectFrontmatter(state.doc.toString());
  if (!range || expanded || state.selection.ranges.some((selection) => selection.from <= range.to && selection.to >= range.from)) return Decoration.none;
  return Decoration.set([Decoration.replace({ widget: new FrontmatterWidget(), block: true }).range(range.from, range.to)]);
}
