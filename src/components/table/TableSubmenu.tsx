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

/** 从 event.target 反查 TableContext;不在 table 内返回 null。 */
export function getTableContext(target: EventTarget | null): TableContext | null {
  if (!(target instanceof Element)) return null;
  const cellEl = target.closest('th, td') as HTMLTableCellElement | HTMLTableHeaderCellElement | null;
  const rowEl = target.closest('tr');
  const tableEl = target.closest('table');
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
    editor.updateValue(newSource);
    setVisible(false);
    onClose();
    onUpdated?.();
  };

  // 菜单位置:在 cell 右下方(若空间不够则左/上回弹)。
  const rect = ctx.cellEl.getBoundingClientRect();
  const style: React.CSSProperties = {
    position: 'fixed',
    left: rect.right + 4,
    top: rect.bottom + 4,
    zIndex: 901,
  };

  return (
    <div className="typola-table-submenu" role="menu" style={style} onMouseLeave={() => { setVisible(false); onClose(); }}>
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
        }
        setVisible(false);
        onClose();
        onUpdated?.();
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

/** 把 IR 中 tableEl 对应的 markdown source 替换为 serializeTable(next) 后的新 source。 */
function computeNewTableSource(editor: Vditor, tableEl: HTMLTableElement, next: TableData): string {
  const data = parseTableFromIr(tableEl);
  const oldSource = serializeTable(data);
  const newSource = serializeTable(next);
  const full = editor.getValue();
  const idx = full.indexOf(oldSource);
  if (idx < 0) {
    // 退化:直接 setValue(newSource)(会清空正文,但至少不崩溃)。
    return newSource;
  }
  return full.slice(0, idx) + newSource + full.slice(idx + oldSource.length);
}
