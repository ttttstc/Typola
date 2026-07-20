// CM6 heading 折叠扩展 — 等价于 Vditor 时代的 applyHeadingFolds。
//
// 与 headingFoldService.ts 共享 foldKey(level, text, sectionIndex) 算法,
// 这样切换 Vditor/CM6 时折叠集合可以无损迁移(同一篇文档同一组 heading
// 文本 → 同一组 fold key;同名多次出现由 sectionIndex 区分)。
//
// 实现要点:
// - StateField 存 foldedHeadings Set;toggleFoldEffect / setFoldedEffect 写入。
// - ViewPlugin 用 lezer syntax tree 收集 ATXHeading 节点,计算每个 heading 的
//   section 范围(到下一个同级/更高级 heading 之前),折叠时给范围内每行加
//   `.typola-cm-line-folded` class(CSS 隐藏)。
// - 每个 heading 行首注入 `FoldToggleWidget`,点击 dispatch toggleFoldEffect。
// - ViewPlugin 的 update 在折叠变化时回调 onChange,让 React 把状态镜像到
//   editorRef,确保 wheel zoom 等触发扩展重建时折叠能从 React state 恢复。

import { StateEffect, StateField, Transaction, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate, WidgetType } from '@codemirror/view';
import { extractAtxHeadingText, foldKey, type FoldKey } from '../../../services/headingFoldService';
import { analyzeMarkdown } from '../../../services/markdownAnalysisService';

const FOLD_TOGGLE_CLASS = 'typola-heading-fold-toggle';
const FOLDED_LINE_CLASS = 'typola-cm-line-folded';

const toggleFoldEffect = StateEffect.define<FoldKey>();
const setFoldedEffect = StateEffect.define<ReadonlySet<FoldKey>>();

const foldedField = StateField.define<ReadonlySet<FoldKey>>({
  create: () => new Set<FoldKey>(),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(toggleFoldEffect)) {
        const next = new Set(value);
        if (next.has(e.value)) next.delete(e.value);
        else next.add(e.value);
        return next;
      }
      if (e.is(setFoldedEffect)) return e.value;
    }
    return value;
  },
});

type HeadingFoldOptions = {
  initial?: ReadonlySet<FoldKey>;
  /** 折叠集合变化时回调(用于把 editor 内的折叠镜像到 React state)。 */
  onChange?: (folded: ReadonlySet<FoldKey>) => void;
};

type HeadingInfo = { from: number; level: number; text: string; sectionIndex: number };

function collectHeadings(state: EditorState): HeadingInfo[] {
  return analyzeMarkdown(state.doc.toString()).headings.map((heading, sectionIndex) => ({
    from: heading.from,
    level: heading.level,
    text: heading.text || extractAtxHeadingText(state.doc.sliceString(heading.from, heading.to)),
    sectionIndex,
  }));
}

const headingsField = StateField.define<HeadingInfo[]>({
  create: collectHeadings,
  update(headings, transaction) {
    return transaction.docChanged ? collectHeadings(transaction.state) : headings;
  },
});

class FoldToggleWidget extends WidgetType {
  readonly level: number;
  readonly text: string;
  readonly sectionIndex: number;
  readonly folded: boolean;
  constructor(level: number, sectionIndex: number, text: string, folded: boolean) {
    super();
    this.level = level;
    this.sectionIndex = sectionIndex;
    this.text = text;
    this.folded = folded;
  }
  eq(other: FoldToggleWidget) {
    return this.level === other.level
      && this.sectionIndex === other.sectionIndex
      && this.text === other.text
      && this.folded === other.folded;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = FOLD_TOGGLE_CLASS;
    span.textContent = this.folded ? '▼' : '▶';
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', this.folded ? '展开' : '折叠');
    span.setAttribute('aria-expanded', String(!this.folded));
    span.setAttribute('data-typola-fold-level', String(this.level));
    span.setAttribute('data-typola-fold-index', String(this.sectionIndex));
    span.setAttribute('data-typola-fold-text', this.text);
    span.tabIndex = 0;
    span.contentEditable = 'false';
    return span;
  }
  ignoreEvent(event: Event) {
    // click/keydown 必须交给 foldClickHandler 产生 CM6 transaction；只屏蔽
    // mousedown 的编辑器选区副作用。
    return event.type === 'mousedown';
  }
}

function buildFoldDecorations(
  state: EditorState,
  headings: HeadingInfo[],
  folded: ReadonlySet<FoldKey>,
): DecorationSet {
  if (headings.length === 0) return Decoration.none;
  const docLen = state.doc.length;
  const ranges: Range<Decoration>[] = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const key = foldKey(h.level, h.text, h.sectionIndex);
    const isFolded = folded.has(key);
    ranges.push(Decoration.widget({
      widget: new FoldToggleWidget(h.level, h.sectionIndex, h.text, isFolded),
      side: -1,
    }).range(h.from, h.from));

    if (!isFolded) continue;
    let sectionEnd = docLen;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        sectionEnd = headings[j].from;
        break;
      }
    }
    const headingLineEnd = state.doc.lineAt(h.from).to;
    let pos = headingLineEnd + 1;
    while (pos < sectionEnd) {
      const line = state.doc.lineAt(pos);
      if (line.from >= sectionEnd) break;
      ranges.push(Decoration.line({ attributes: { class: FOLDED_LINE_CLASS } }).range(line.from));
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

function makeFoldPlugin(onChange?: (folded: ReadonlySet<FoldKey>) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildFoldDecorations(
          view.state,
          view.state.field(headingsField),
          view.state.field(foldedField),
        );
      }
      update(update: ViewUpdate) {
        const foldedChanged = update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(toggleFoldEffect) || e.is(setFoldedEffect)),
        );
        if (update.docChanged || foldedChanged) {
          this.decorations = buildFoldDecorations(
            update.state,
            update.state.field(headingsField),
            update.state.field(foldedField),
          );
          if (foldedChanged && onChange) {
            onChange(update.state.field(foldedField));
          }
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function toggleFoldFromEvent(event: MouseEvent | KeyboardEvent, view: EditorView): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const toggle = target.closest(`.${FOLD_TOGGLE_CLASS}`);
  if (!toggle) return;
  const levelStr = toggle.getAttribute('data-typola-fold-level');
  const indexStr = toggle.getAttribute('data-typola-fold-index');
  const text = toggle.getAttribute('data-typola-fold-text');
  if (!levelStr || !indexStr || text === null) return;
  event.preventDefault();
  event.stopPropagation();
  view.dispatch({
    effects: toggleFoldEffect.of(foldKey(Number(levelStr), text, Number(indexStr))),
    annotations: Transaction.userEvent.of('fold.toggle'),
  });
}

const foldClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    toggleFoldFromEvent(event, view);
  },
  keydown(event, view) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest(`.${FOLD_TOGGLE_CLASS}`);
    if (!toggle) return;
    toggleFoldFromEvent(event, view);
  },
});

export function headingFoldExtension(options: HeadingFoldOptions = {}): Extension[] {
  const { initial = new Set(), onChange } = options;
  return [
    foldedField.init(() => new Set(initial)),
    headingsField,
    makeFoldPlugin(onChange),
    foldClickHandler,
  ];
}

/** 外部(React state)把折叠集合同步进 editor;需要 EditorView 实例。
 *  值未变时不 dispatch,避免 React state → editor → onChange → React 无限回环。 */
export function setFoldedHeadings(view: EditorView, folded: ReadonlySet<FoldKey>): void {
  const current = view.state.field(foldedField);
  if (sameFoldSet(current, folded)) return;
  view.dispatch({ effects: setFoldedEffect.of(folded) });
}

function sameFoldSet(a: ReadonlySet<FoldKey>, b: ReadonlySet<FoldKey>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}
