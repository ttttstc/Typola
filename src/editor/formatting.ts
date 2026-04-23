import type { Ctx } from '@milkdown/ctx';
import { commandsCtx, editorViewCtx, type Editor as MilkdownEditor } from '@milkdown/core';
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  createCodeBlockCommand,
  headingSchema,
  insertHardbreakCommand,
  insertHrCommand,
  insertImageCommand,
  linkSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  updateLinkCommand,
} from '@milkdown/preset-commonmark';
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  exitTable,
  insertTableCommand,
  toggleStrikethroughCommand,
} from '@milkdown/preset-gfm';
import { redoCommand, undoCommand } from '@milkdown/plugin-history';
import { lift, setBlockType, wrapIn } from 'prosemirror-commands';
import type { Mark as ProseMark, Node as ProseNode } from 'prosemirror-model';
import { AllSelection, TextSelection, type EditorState, type Selection } from 'prosemirror-state';
import { liftListItem, wrapInList } from 'prosemirror-schema-list';
import { TableMap, deleteColumn, deleteRow, deleteTable, findTable } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';

export type InlineFormat = 'bold' | 'italic' | 'strikethrough' | 'inline-code';
export type TableAlignment = 'left' | 'center' | 'right';
export type BlockFormat =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'blockquote'
  | 'bullet-list'
  | 'ordered-list'
  | 'code-block';

let activeEditor: MilkdownEditor | null = null;
type SelectionSnapshot = { kind: 'all' } | { kind: 'text'; from: number; to: number } | null;
let preservedSelection: SelectionSnapshot = null;

export function bindEditorFormatting(editor: MilkdownEditor | null) {
  activeEditor = editor;
  preservedSelection = null;
}

function runWithEditor<T>(
  action: (ctx: Ctx, view: EditorView) => T,
  options: { focus?: boolean } = {}
): T | null {
  if (!activeEditor) return null;

  try {
    return activeEditor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (options.focus) {
        view.focus();
      }
      return action(ctx, view);
    });
  } catch (error) {
    console.error('Failed to run editor formatting command:', error);
    return null;
  }
}

function captureSelection(selection: Selection): SelectionSnapshot {
  if (selection instanceof AllSelection) {
    return { kind: 'all' };
  }

  return {
    kind: 'text',
    from: selection.from,
    to: selection.to,
  };
}

function clampSelectionPosition(view: EditorView, position: number) {
  return Math.max(0, Math.min(position, view.state.doc.content.size));
}

function restorePreservedSelection(view: EditorView) {
  if (!preservedSelection) {
    return;
  }

  if (preservedSelection.kind === 'all') {
    if (!(view.state.selection instanceof AllSelection)) {
      view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    }
    return;
  }

  const from = clampSelectionPosition(view, preservedSelection.from);
  const to = clampSelectionPosition(view, preservedSelection.to);
  const nextSelection = TextSelection.create(view.state.doc, Math.min(from, to), Math.max(from, to));

  if (!nextSelection.eq(view.state.selection)) {
    view.dispatch(view.state.tr.setSelection(nextSelection));
  }
}

function runWithMutableEditor<T>(action: (ctx: Ctx, view: EditorView) => T): T | null {
  return runWithEditor(
    (ctx, view) => {
      restorePreservedSelection(view);
      const result = action(ctx, view);
      preservedSelection = captureSelection(view.state.selection);
      return result;
    },
    { focus: true }
  );
}

export function rememberEditorSelection() {
  return Boolean(
    runWithEditor(
      (_ctx, view) => {
        preservedSelection = captureSelection(view.state.selection);
        return true;
      },
      { focus: true }
    )
  );
}

function runCommand(command: { key: unknown }, payload?: unknown) {
  return Boolean(
    runWithMutableEditor((ctx) => ctx.get(commandsCtx).call(command.key as never, payload as never))
  );
}

function runProseCommand(
  view: EditorView,
  command: (state: EditorState, dispatch?: EditorView['dispatch'], view?: EditorView) => boolean
) {
  return command(view.state, view.dispatch, view);
}

function hasAncestor(selection: Selection, typeName: string) {
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (selection.$from.node(depth).type.name === typeName) {
      return true;
    }
  }

  return false;
}

function getCurrentTableSelection(selection: Selection) {
  const table = findTable(selection.$from);
  if (!table) {
    return null;
  }

  const rowIndex = selection.$from.index(table.depth);
  const columnIndex = selection.$from.index(table.depth + 1);

  return {
    table,
    rowIndex,
    columnIndex,
  };
}

function findAncestorDepth(
  selection: Selection,
  predicate: (node: Selection['$from']['parent']) => boolean
) {
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (predicate(node)) {
      return depth;
    }
  }

  return null;
}

function getCurrentLinkHref(ctx: Ctx, view: EditorView) {
  const linkType = linkSchema.type(ctx);
  const { selection, doc, storedMarks } = view.state;

  if (selection.empty) {
    return (
      storedMarks?.find((mark) => mark.type === linkType)?.attrs.href ??
      selection.$from.marks().find((mark) => mark.type === linkType)?.attrs.href ??
      null
    );
  }

  let href: string | null = null;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    const link = node.marks.find((mark) => mark.type === linkType);
    if (!link) return undefined;
    href = link.attrs.href ?? null;
    return false;
  });

  return href;
}

function turnSelectionIntoParagraph(ctx: Ctx, view: EditorView) {
  const listItemType = listItemSchema.type(ctx);
  let changed = false;

  while (liftListItem(listItemType)(view.state, view.dispatch)) {
    changed = true;
  }

  while (lift(view.state, view.dispatch)) {
    changed = true;
  }

  if (runProseCommand(view, setBlockType(paragraphSchema.type(ctx)))) {
    changed = true;
  }

  if (!changed) {
    changed = Boolean(ctx.get(commandsCtx).call(turnIntoTextCommand.key));
  }

  return changed;
}

function replaceSelectionWithNode(
  view: EditorView,
  node: ProseNode,
  options: { selectInsertedText?: boolean } = {}
) {
  const { from } = view.state.selection;
  let tr = view.state.tr.replaceSelectionWith(node, false);

  if (options.selectInsertedText && node.isText) {
    tr = tr.setSelection(TextSelection.create(tr.doc, from, from + node.nodeSize));
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

function replaceSelectionWithText(
  view: EditorView,
  text: string,
  marks: readonly ProseMark[] = [],
  options: { selectInsertedText?: boolean } = {}
) {
  if (!text) {
    return false;
  }

  return replaceSelectionWithNode(view, view.state.schema.text(text, marks), options);
}

function toggleHeading(level: number) {
  return Boolean(
    runWithMutableEditor((ctx, view) => {
      const { selection } = view.state;
      const headingType = headingSchema.type(ctx);
      const paragraphType = paragraphSchema.type(ctx);

      let activeHeadingLevel: number | null = null;
      for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
        const node = selection.$from.node(depth);
        if (node.type === headingType) {
          activeHeadingLevel = node.attrs.level as number;
          break;
        }
      }

      if (activeHeadingLevel === level) {
        return runProseCommand(view, setBlockType(paragraphType));
      }

      return runProseCommand(view, setBlockType(headingType, { level }));
    })
  );
}

function toggleBlockquote() {
  return Boolean(
    runWithMutableEditor((ctx, view) => {
      const blockquoteType = blockquoteSchema.type(ctx);
      const active = hasAncestor(view.state.selection, blockquoteType.name);

      if (active) {
        let changed = false;
        while (hasAncestor(view.state.selection, blockquoteType.name) && lift(view.state, view.dispatch)) {
          changed = true;
        }
        return changed;
      }

      return runProseCommand(view, wrapIn(blockquoteType));
    })
  );
}

function toggleList(type: 'bullet-list' | 'ordered-list') {
  return Boolean(
    runWithMutableEditor((ctx, view) => {
      const listItemType = listItemSchema.type(ctx);
      const targetType = type === 'bullet-list' ? bulletListSchema.type(ctx) : orderedListSchema.type(ctx);
      const otherType = type === 'bullet-list' ? orderedListSchema.type(ctx) : bulletListSchema.type(ctx);
      const selection = view.state.selection;
      const targetActive = hasAncestor(selection, targetType.name);
      const otherActive = hasAncestor(selection, otherType.name);

      if (targetActive) {
        let changed = false;
        while (liftListItem(listItemType)(view.state, view.dispatch)) {
          changed = true;
        }
        return changed;
      }

      if (otherActive) {
        while (liftListItem(listItemType)(view.state, view.dispatch)) {
          // unwrap before switching list type
        }
      }

      return runProseCommand(view, wrapInList(targetType));
    })
  );
}

function toggleCodeBlock() {
  return Boolean(
    runWithMutableEditor((ctx, view) => {
      const active = hasAncestor(view.state.selection, codeBlockSchema.type(ctx).name);
      if (active) {
        return turnSelectionIntoParagraph(ctx, view);
      }

      return ctx.get(commandsCtx).call(createCodeBlockCommand.key);
    })
  );
}

function insertSnippetBlock(language = '', text = '', selectInsertedText = false) {
  return Boolean(
    runWithMutableEditor((ctx, view) => {
      const created = ctx.get(commandsCtx).call(createCodeBlockCommand.key, language);
      if (!created || !text) {
        return created;
      }

      const { from, to } = view.state.selection;
      let tr = view.state.tr.insertText(text, from, to);

      if (selectInsertedText) {
        tr = tr.setSelection(TextSelection.create(tr.doc, from, from + text.length));
      }

      view.dispatch(tr.scrollIntoView());
      return true;
    })
  );
}

export function applyInlineFormat(format: InlineFormat) {
  switch (format) {
    case 'bold':
      return runCommand(toggleStrongCommand);
    case 'italic':
      return runCommand(toggleEmphasisCommand);
    case 'strikethrough':
      return runCommand(toggleStrikethroughCommand);
    case 'inline-code':
      return runCommand(toggleInlineCodeCommand);
  }
}

export function applyBlockFormat(format: BlockFormat) {
  switch (format) {
    case 'paragraph':
      return Boolean(runWithMutableEditor((ctx, view) => turnSelectionIntoParagraph(ctx, view)));
    case 'heading-1':
      return toggleHeading(1);
    case 'heading-2':
      return toggleHeading(2);
    case 'heading-3':
      return toggleHeading(3);
    case 'heading-4':
      return toggleHeading(4);
    case 'heading-5':
      return toggleHeading(5);
    case 'heading-6':
      return toggleHeading(6);
    case 'blockquote':
      return toggleBlockquote();
    case 'bullet-list':
      return toggleList('bullet-list');
    case 'ordered-list':
      return toggleList('ordered-list');
    case 'code-block':
      return toggleCodeBlock();
  }
}

export function applyLink(href: string | null) {
  return Boolean(
    runWithMutableEditor((ctx, view) => {
      const nextHref = href?.trim() ?? '';
      const currentHref = getCurrentLinkHref(ctx, view);

      if (!nextHref) {
        if (!currentHref) return false;
        return ctx.get(commandsCtx).call(toggleLinkCommand.key);
      }

      if (view.state.selection.empty && !currentHref) {
        return false;
      }

      if (currentHref) {
        return ctx.get(commandsCtx).call(updateLinkCommand.key, { href: nextHref });
      }

      return ctx.get(commandsCtx).call(toggleLinkCommand.key, { href: nextHref });
    })
  );
}

export function insertDivider() {
  return runCommand(insertHrCommand);
}

export function insertTable(row = 2, col = 2) {
  return runCommand(insertTableCommand, { row, col });
}

export function addTableRowBefore() {
  return runCommand(addRowBeforeCommand);
}

export function addTableRowAfter() {
  return runCommand(addRowAfterCommand);
}

export function addTableColumnBefore() {
  return runCommand(addColBeforeCommand);
}

export function addTableColumnAfter() {
  return runCommand(addColAfterCommand);
}

export function deleteCurrentTableRow() {
  return Boolean(runWithMutableEditor((_ctx, view) => runProseCommand(view, deleteRow)));
}

export function deleteCurrentTableColumn() {
  return Boolean(runWithMutableEditor((_ctx, view) => runProseCommand(view, deleteColumn)));
}

export function deleteCurrentTable() {
  return Boolean(runWithMutableEditor((_ctx, view) => runProseCommand(view, deleteTable)));
}

export function setCurrentTableColumnAlignment(alignment: TableAlignment) {
  return Boolean(
    runWithMutableEditor((_ctx, view) => {
      const currentTable = getCurrentTableSelection(view.state.selection);
      if (!currentTable) {
        return false;
      }

      const map = TableMap.get(currentTable.table.node);
      let tr = view.state.tr;
      let changed = false;

      for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
        const cellPos = currentTable.table.start + map.positionAt(rowIndex, currentTable.columnIndex, currentTable.table.node);
        const cell = tr.doc.nodeAt(cellPos);
        if (!cell) {
          continue;
        }

        const currentAlignment = (cell.attrs.alignment as TableAlignment | undefined) ?? 'left';
        if (currentAlignment === alignment) {
          continue;
        }

        tr = tr.setNodeMarkup(cellPos, undefined, {
          ...cell.attrs,
          alignment,
        });
        changed = true;
      }

      if (!changed) {
        return false;
      }

      view.dispatch(tr.scrollIntoView());
      return true;
    })
  );
}

export function insertTableLineBreak() {
  return runCommand(insertHardbreakCommand);
}

export function exitCurrentTable() {
  return runCommand(exitTable);
}

export function insertImage(src: string, alt = 'image', title = '') {
  const nextSrc = src.trim();
  if (!nextSrc) {
    return false;
  }

  return runCommand(insertImageCommand, { src: nextSrc, alt, title });
}

export function insertLink(href: string, text?: string) {
  return Boolean(
    runWithMutableEditor((ctx, view) => {
      const nextHref = href.trim();
      if (!nextHref) {
        return false;
      }

      const currentHref = getCurrentLinkHref(ctx, view);
      if (!view.state.selection.empty || currentHref) {
        if (currentHref) {
          return ctx.get(commandsCtx).call(updateLinkCommand.key, { href: nextHref });
        }

        return ctx.get(commandsCtx).call(toggleLinkCommand.key, { href: nextHref });
      }

      const nextText = (text ?? nextHref).trim();
      if (!nextText) {
        return false;
      }

      return replaceSelectionWithText(
        view,
        nextText,
        [linkSchema.type(ctx).create({ href: nextHref })],
        { selectInsertedText: true }
      );
    })
  );
}

export function insertTaskList() {
  return Boolean(
    runWithMutableEditor((ctx, view) => {
      const listItemType = listItemSchema.type(ctx);
      const bulletListType = bulletListSchema.type(ctx);
      const orderedListType = orderedListSchema.type(ctx);

      const taskItemDepth = findAncestorDepth(
        view.state.selection,
        (node) => node.type === listItemType && node.attrs.checked != null
      );
      if (taskItemDepth != null) {
        const taskItem = view.state.selection.$from.node(taskItemDepth);
        const taskItemPos = view.state.selection.$from.before(taskItemDepth);
        view.dispatch(
          view.state.tr
            .setNodeMarkup(taskItemPos, undefined, { ...taskItem.attrs, checked: null })
            .scrollIntoView()
        );
        return true;
      }

      if (hasAncestor(view.state.selection, orderedListType.name)) {
        while (liftListItem(listItemType)(view.state, view.dispatch)) {
          // Unwrap ordered lists before converting them into task items.
        }
      }

      if (!hasAncestor(view.state.selection, bulletListType.name)) {
        const wrapped = runProseCommand(view, wrapInList(bulletListType));
        if (!wrapped) {
          return false;
        }
      }

      const listItemDepth = findAncestorDepth(
        view.state.selection,
        (node) => node.type === listItemType
      );
      if (listItemDepth == null) {
        return false;
      }

      const listItem = view.state.selection.$from.node(listItemDepth);
      const listItemPos = view.state.selection.$from.before(listItemDepth);
      view.dispatch(
        view.state.tr
          .setNodeMarkup(listItemPos, undefined, { ...listItem.attrs, checked: false })
          .scrollIntoView()
      );
      return true;
    })
  );
}

export function insertCodeBlock(language = '', text = '', selectInsertedText = false) {
  return insertSnippetBlock(language, text, selectInsertedText);
}

export function insertMermaidBlock() {
  return insertSnippetBlock('mermaid', 'flowchart LR\n  A --> B', true);
}

export function getActiveLinkHref() {
  return runWithEditor((ctx, view) => getCurrentLinkHref(ctx, view)) ?? null;
}

export function undoEditor() {
  return runCommand(undoCommand);
}

export function redoEditor() {
  return runCommand(redoCommand);
}

export function selectAllEditor() {
  return Boolean(
    runWithMutableEditor((_ctx, view) => {
      view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
      return true;
    })
  );
}

function isInsideEditor(node: Node | null) {
  const editor = document.querySelector('.ProseMirror');
  return Boolean(editor && node && editor.contains(node));
}

export function isEditorTarget(target: EventTarget | null) {
  return target instanceof Node && isInsideEditor(target);
}

export function isTableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.milkdown-table-block, td, th'));
}

export function isSelectionInsideTable() {
  return Boolean(runWithEditor((_ctx, view) => Boolean(getCurrentTableSelection(view.state.selection))));
}

export function hasEditorSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }

  return isInsideEditor(selection.anchorNode) && isInsideEditor(selection.focusNode);
}

export function isEditorFocused() {
  return isEditorTarget(document.activeElement);
}

export function isInlineFormatActive(format: InlineFormat) {
  return Boolean(
    runWithEditor((_ctx, view) => {
      const { selection, storedMarks } = view.state;
      const editorMarkType =
        format === 'bold'
          ? view.state.schema.marks.strong
          : format === 'italic'
            ? view.state.schema.marks.emphasis
            : format === 'strikethrough'
              ? view.state.schema.marks.strike_through
              : view.state.schema.marks.inlineCode;

      if (!editorMarkType) {
        return false;
      }

      if (selection.empty) {
        return Boolean(
          storedMarks?.some((mark) => mark.type === editorMarkType) ??
            selection.$from.marks().some((mark) => mark.type === editorMarkType)
        );
      }

      return view.state.doc.rangeHasMark(selection.from, selection.to, editorMarkType);
    })
  );
}
