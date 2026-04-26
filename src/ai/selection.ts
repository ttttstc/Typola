export interface SelectionRect {
  left: number;
  top: number;
  bottom: number;
}

export interface SelectionSnapshot {
  text: string;
  range: Range | null;
  rect: SelectionRect;
}

function getEditorRoot() {
  return document.querySelector('.ProseMirror') as HTMLElement | null;
}

function dispatchEditorInput() {
  const editor = getEditorRoot();
  if (!editor) return;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function createBlocksFromText(text: string) {
  const fragment = document.createDocumentFragment();
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const blockText of blocks.length > 0 ? blocks : [text]) {
    const paragraph = document.createElement('p');
    paragraph.textContent = blockText;
    fragment.appendChild(paragraph);
  }

  return fragment;
}

function findBlockFromRange(range: Range | null) {
  if (!range) return null;

  let node: Node | null = range.startContainer;
  const editor = getEditorRoot();
  while (node && node !== editor) {
    if (
      node instanceof HTMLElement &&
      ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'PRE'].includes(node.tagName)
    ) {
      return node;
    }
    node = node.parentNode;
  }

  return null;
}

export function captureSelectionSnapshot(): SelectionSnapshot | null {
  const selection = window.getSelection();
  const editor = getEditorRoot();
  if (!selection || selection.rangeCount === 0 || !editor || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  if (!commonAncestor || !editor.contains(commonAncestor)) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  return {
    text: selection.toString(),
    range: range.cloneRange(),
    rect: {
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
    },
  };
}

export function replaceSelectionWithText(snapshot: SelectionSnapshot | null, text: string) {
  if (!snapshot?.range) return false;

  const selection = window.getSelection();
  if (!selection) return false;

  selection.removeAllRanges();
  selection.addRange(snapshot.range);
  snapshot.range.deleteContents();
  snapshot.range.insertNode(document.createTextNode(text));
  selection.removeAllRanges();
  dispatchEditorInput();
  return true;
}

export function insertTextBelowSelection(snapshot: SelectionSnapshot | null, text: string) {
  const block = findBlockFromRange(snapshot?.range ?? null);
  if (!block || !block.parentNode) return false;

  const fragment = createBlocksFromText(text);
  block.parentNode.insertBefore(fragment, block.nextSibling);
  dispatchEditorInput();
  return true;
}
