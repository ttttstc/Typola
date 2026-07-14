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

export function openTableMenu(event: MouseEvent): boolean {
  const target = event.target instanceof Element ? event.target : null;
  const cell = target?.closest<HTMLElement>('.tbl-cell');
  if (!cell || !cell.closest('.tbl-table-widget')) return false;

  const location = cell.classList.contains('tbl-header-cell') ? 'col' : 'row';
  const handle = cell.querySelector<HTMLElement>(
    `.tbl-handle[data-type="header"][data-location="${location}"]`,
  );
  const window = handle?.ownerDocument.defaultView;
  if (!handle || !window?.PointerEvent) return false;

  event.preventDefault();
  event.stopPropagation();
  const pointer = {
    bubbles: true,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
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

  return [
    EditorView.domEventHandlers({ contextmenu: openTableMenu }),
    localization,
  ];
}
