import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import type { AppLocale } from '../../../../services/settingsService';

const EXACT_LABELS: Record<string, string> = {
  'Align none': '不对齐',
  'Align left': '左对齐',
  'Align center': '居中对齐',
  'Align right': '右对齐',
};

export function translateTableMenuLabel(locale: AppLocale, label: string): string {
  if (locale !== 'zh-CN') return label;
  const exact = EXACT_LABELS[label];
  if (exact) return exact;

  const sort = /^Sort by (row|column) \((A-Z|Z-A)\)$/u.exec(label);
  if (sort) return `按${sort[1] === 'row' ? '行' : '列'}排序（${sort[2]}）`;

  const action = /^(Add|Move|Duplicate|Clear|Delete) (row|column)(?: (above|below|before|after|up|down|left|right))?$/u.exec(label);
  if (!action) return label;
  const [, verb, subject, direction] = action;
  const subjectText = subject === 'row' ? '行' : '列';
  const directionText: Record<string, string> = {
    above: '在上方插入',
    below: '在下方插入',
    before: '在左侧插入',
    after: '在右侧插入',
    up: '向上移动',
    down: '向下移动',
    left: '向左移动',
    right: '向右移动',
  };
  if ((verb === 'Add' || verb === 'Move') && direction) return `${directionText[direction]}${subjectText}`;
  if (verb === 'Duplicate') return `复制${subjectText}`;
  if (verb === 'Clear') return `清空${subjectText}`;
  if (verb === 'Delete') return `删除${subjectText}`;
  return label;
}

function localizeMenus(document: Document, locale: AppLocale): void {
  for (const item of document.querySelectorAll<HTMLElement>('.tbl-menu-item-text')) {
    const label = item.textContent?.trim() ?? '';
    const translated = translateTableMenuLabel(locale, label);
    if (translated !== label) item.textContent = translated;
  }
}

function elementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

export type TableMenuAction =
  | 'row-add-above' | 'row-add-below' | 'row-move-up' | 'row-move-down'
  | 'row-duplicate' | 'row-clear' | 'row-delete'
  | 'column-sort-asc' | 'column-sort-desc'
  | 'column-align-none' | 'column-align-left' | 'column-align-center' | 'column-align-right'
  | 'column-add-before' | 'column-add-after' | 'column-move-left' | 'column-move-right'
  | 'column-duplicate' | 'column-clear' | 'column-delete';

const TABLE_MENU_ACTIONS: Record<TableMenuAction, { location: 'row' | 'col'; label: string }> = {
  'row-add-above': { location: 'row', label: 'Add row above' },
  'row-add-below': { location: 'row', label: 'Add row below' },
  'row-move-up': { location: 'row', label: 'Move row up' },
  'row-move-down': { location: 'row', label: 'Move row down' },
  'row-duplicate': { location: 'row', label: 'Duplicate row' },
  'row-clear': { location: 'row', label: 'Clear row' },
  'row-delete': { location: 'row', label: 'Delete row' },
  'column-sort-asc': { location: 'col', label: 'Sort by column (A-Z)' },
  'column-sort-desc': { location: 'col', label: 'Sort by column (Z-A)' },
  'column-align-none': { location: 'col', label: 'Align none' },
  'column-align-left': { location: 'col', label: 'Align left' },
  'column-align-center': { location: 'col', label: 'Align center' },
  'column-align-right': { location: 'col', label: 'Align right' },
  'column-add-before': { location: 'col', label: 'Add column before' },
  'column-add-after': { location: 'col', label: 'Add column after' },
  'column-move-left': { location: 'col', label: 'Move column left' },
  'column-move-right': { location: 'col', label: 'Move column right' },
  'column-duplicate': { location: 'col', label: 'Duplicate column' },
  'column-clear': { location: 'col', label: 'Clear column' },
  'column-delete': { location: 'col', label: 'Delete column' },
};
export function tableCellFromEventTarget(target: EventTarget | null): HTMLElement | null {
  const cell = elementFromEventTarget(target)?.closest<HTMLElement>('.tbl-cell');
  return cell?.closest('.tbl-table-widget') ? cell : null;
}

function openTableMenuForCell(cell: HTMLElement, location: 'row' | 'col', event?: MouseEvent): boolean {
  const handle = cell.querySelector<HTMLElement>(
    `.tbl-handle[data-type="header"][data-location="${location}"]`,
  );
  const window = handle?.ownerDocument.defaultView;
  if (!handle || !window?.PointerEvent) return false;

  event?.preventDefault();
  event?.stopPropagation();
  const rect = cell.getBoundingClientRect();
  const pointer = {
    bubbles: true,
    cancelable: true,
    clientX: event?.clientX ?? rect.left,
    clientY: event?.clientY ?? rect.top,
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    composed: true,
  } as const;
  handle.dispatchEvent(new window.PointerEvent('pointerdown', pointer));
  window.queueMicrotask(() => {
    handle.dispatchEvent(new window.PointerEvent('pointerup', { ...pointer, buttons: 0 }));
  });
  return true;
}

export function openTableMenu(event: MouseEvent): boolean {
  const cell = tableCellFromEventTarget(event.target);
  if (!cell) return false;
  return openTableMenuForCell(
    cell,
    cell.classList.contains('tbl-header-cell') ? 'col' : 'row',
    event,
  );
}

export async function runTableMenuAction(cell: HTMLElement, action: TableMenuAction): Promise<boolean> {
  const command = TABLE_MENU_ACTIONS[action];
  if (!openTableMenuForCell(cell, command.location)) return false;
  const document = cell.ownerDocument;
  const window = document.defaultView;
  if (!window) return false;

  const labels = new Set([command.label, translateTableMenuLabel('zh-CN', command.label)]);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    const text = Array.from(document.querySelectorAll<HTMLElement>('.tbl-menu-item-text'))
      .find((item) => labels.has(item.textContent?.trim() ?? ''));
    const item = text?.closest<HTMLElement>('.tbl-menu-item');
    if (item) {
      item.click();
      return true;
    }
  }
  return false;
}

export function tableInteractionExtension(locale: AppLocale = 'zh-CN'): Extension[] {
  const localization = ViewPlugin.fromClass(class {
    private readonly observer: MutationObserver | null;

    constructor(view: EditorView) {
      const document = view.dom.ownerDocument;
      localizeMenus(document, locale);
      if (typeof MutationObserver === 'undefined' || !document.body) {
        this.observer = null;
        return;
      }
      this.observer = new MutationObserver(() => localizeMenus(document, locale));
      this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    destroy(): void {
      this.observer?.disconnect();
    }
  });

  return [localization];

}
