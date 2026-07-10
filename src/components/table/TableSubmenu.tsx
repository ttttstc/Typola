// Vditor IR 表格编辑 —— 表格上下文 + 右键子菜单。
//
// 拦截点:`WysiwygEditorPane.handleContextMenu` 检测 `event.target.closest('table[data-type="table"]')`,
// 命中时改走 `handleTableContext`,渲染 `<TableSubmenu>` 替代 `<EditorContextMenu>`。

import { useEffect, useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { translate, type I18nKey } from '../../services/i18n';
import { parseTableFromIr, serializeTable } from './tableSerializer';
import {
  deleteCol,
  deleteRow,
  insertCol,
  insertRow,
  setColAlign,
} from './tableMutations';
import type { TableData } from './tableSerializer';
import type Vditor from 'vditor';

export interface TableContext {
  tableEl: HTMLTableElement;
  cellEl: HTMLTableCellElement | HTMLTableHeaderCellElement;
  rowEl: HTMLTableRowElement;
  cellIndex: number;
  rowIndex: number;
  isHeader: boolean;
}

/** 从 event.target 反查 TableContext;不在 table 内返回 null。
 *  - M9:text.node 没有 closest → 向上取 parentElement 让 cell 内文本点击仍能命中菜单。 */
export function getTableContext(target: EventTarget | null): TableContext | null {
  const el = target instanceof Element ? target : (target instanceof Node ? target.parentElement : null);
  const cellEl = el?.closest('th, td') as HTMLTableCellElement | HTMLTableHeaderCellElement | null;
  const rowEl = el?.closest('tr');
  const tableEl = el?.closest('table');
  if (!cellEl || !rowEl || !tableEl) return null;
  const cellIndex = Array.from(rowEl.children).findIndex((c) => c === cellEl);
  const rowIndex = Array.from(tableEl.querySelectorAll(':scope > thead > tr, :scope > tbody > tr')).findIndex(
    (r) => r === rowEl,
  );
  const isHeader = cellEl.tagName === 'TH' || !!cellEl.closest('thead');
  return { tableEl, cellEl, rowEl, cellIndex, rowIndex, isHeader };
}

export interface TableSubmenuProps {
  ctx: TableContext;
  editor: Vditor;
  /** 关闭 submenu 的回调。 */
  onClose: () => void;
  /** 操作完成后刷新 IR(可选,默认自动调用 editor.updateValue)。 */
  onUpdated?: () => void;
}

export function TableSubmenu({ ctx, editor, onClose, onUpdated }: TableSubmenuProps) {
  const settings = useSettings();
  const t = (key: I18nKey) => translate(settings.locale, key);
  const [visible, setVisible] = useState(true);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setVisible(false);
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (!visible) return null;

  const run = (
    mutate: (data: TableData) => TableData,
  ) => {
    const data = parseTableFromIr(ctx.tableEl);
    const next = mutate(data);
    if (next === data) return; // no-op(禁删等)
    const newSource = computeNewTableSource(editor, ctx.tableEl, next);
    if (newSource === null) {
      // 操作被拒绝(退化路径),仍关闭 menu 让 UI 不卡死。
      setVisible(false);
      onClose();
      return;
    }
    editor.updateValue(newSource);
    setVisible(false);
    onClose();
    onUpdated?.();
  };

  // 菜单关闭全靠 item 点击触发 setVisible(false)+onClose();不走 onMouseLeave,
  // 避免鼠标在 menu 内移动就立刻收 menu 的 PR #174 H2 同款问题。
  // Esc 关闭由 useEffect register。
  const rect = ctx.cellEl.getBoundingClientRect();
  const style: React.CSSProperties = {
    position: 'fixed',
    left: rect.right + 4,
    top: rect.bottom + 4,
    zIndex: 901,
  };

  return (
    <div className="typola-table-submenu" role="menu" style={style}>
      <div className="typola-table-submenu-title">{t('tableMenuTitle')}</div>
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => insertRow(d, ctx.rowIndex))}>
        {t('tableMenuInsertRowAbove')}
      </button>
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => insertRow(d, ctx.rowIndex + 1))}>
        {t('tableMenuInsertRowBelow')}
      </button>
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => insertCol(d, ctx.cellIndex))}>
        {t('tableMenuInsertColLeft')}
      </button>
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => insertCol(d, ctx.cellIndex + 1))}>
        {t('tableMenuInsertColRight')}
      </button>
      <div className="typola-table-submenu-sep" />
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => deleteRow(d, ctx.rowIndex))}>
        {t('tableMenuDeleteRow')}
      </button>
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => deleteCol(d, ctx.cellIndex))}>
        {t('tableMenuDeleteCol')}
      </button>
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => {
        // 删除整表:把 table div 从 source 中移除。
        const data = parseTableFromIr(ctx.tableEl);
        const tableSource = serializeTable(data);
        const full = editor.getValue();
        const idx = full.indexOf(tableSource);
        if (idx >= 0) {
          const next = full.slice(0, idx) + full.slice(idx + tableSource.length);
          editor.updateValue(next);
          setVisible(false);
          onClose();
          onUpdated?.();
        } else {
          // 找不到原文,拒绝操作避免清空正文(M6 同源修复)。
          console.warn('[tableSubmenu] deleteTable: cannot locate table in source; abort');
        }
      }}>
        {t('tableMenuDeleteTable')}
      </button>
      <div className="typola-table-submenu-sep" />
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => setColAlign(d, ctx.cellIndex, 'left'))}>
        {t('tableMenuAlignLeft')}
      </button>
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => setColAlign(d, ctx.cellIndex, 'center'))}>
        {t('tableMenuAlignCenter')}
      </button>
      <button type="button" role="menuitem" className="typola-table-submenu-item" onClick={() => run((d) => setColAlign(d, ctx.cellIndex, 'right'))}>
        {t('tableMenuAlignRight')}
      </button>
    </div>
  );
}

/** 把 IR 中 tableEl 对应的 markdown source 替换为 serializeTable(next) 后的新 source。
 *  - 多 table 场景下 indexOf 会错:退化路径拒绝 update,返回原文,不让"清空正文"发生。 */
function computeNewTableSource(editor: Vditor, tableEl: HTMLTableElement, next: TableData): string | null {
  const data = parseTableFromIr(tableEl);
  const oldSource = serializeTable(data);
  const newSource = serializeTable(next);
  const full = editor.getValue();
  const idx = full.indexOf(oldSource);
  if (idx < 0) {
    // 退化:找不到原文位置 → 拒绝操作而不是清空正文(M6 修复)。
    console.warn('[tableSubmenu] cannot locate table in source; abort to avoid data loss');
    return null;
  }
  return full.slice(0, idx) + newSource + full.slice(idx + oldSource.length);
}
