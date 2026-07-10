// Vditor IR 表格编辑 —— 表格上下文 + 右键子菜单。
//
// 拦截点:`WysiwygEditorPane.handleContextMenu` 检测 `event.target.closest('table[data-type="table"]')`,
// 命中时改走 `handleTableContext`,渲染 `<TableSubmenu>` 替代 `<EditorContextMenu>`。

// 表格编辑的 commit 路径:
//  - TableSubmenu 不自己调 editor.updateValue(该 API 是插入选区,不是全文替换,会破坏正文)
//  - 全走上层受控 onChange → setValue + 光标保留 setRange + Vditor IR 渲染
//  - 由 WysiwygEditorPane 的 EditorCoreHandle 契约里唯一一个 onTableChange 入口桥接
//  - 这样和既有 heading/task/replaceSelection 等其他文档级编辑路径完全对齐
//  - 新检视 #177 修复:updateValue 误用 + Lute 同源定位 + align 属性读取

import { useEffect, useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { translate, type I18nKey } from '../../services/i18n';
import { computeLuteTableSource, parseTableFromIr } from './tableSerializer';
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
  /** 提交全文给上层受控 state(editor 没有"全文替换"API,走 setValue + onChange)。 */
  onChange?: (nextSource: string) => void;
}

export function TableSubmenu({ ctx, editor, onClose, onUpdated, onChange }: TableSubmenuProps) {
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

  // 取 table 父 div 的 innerHTML,用于 Lute 同源定位。
  const tableParentHtml = ctx.tableEl.parentElement?.innerHTML ?? ctx.tableEl.innerHTML;

  const commitSource = (newSource: string) => {
    // 新检视 #177 修复:不直接调 editor.updateValue(那是插入当前选区),走上层受控 onChange。
    onChange?.(newSource);
    setVisible(false);
    onClose();
    onUpdated?.();
  };

  const run = (
    mutate: (data: TableData) => TableData,
  ) => {
    const data = parseTableFromIr(ctx.tableEl);
    const next = mutate(data);
    if (next === data) return; // no-op(禁删等)
    const newSource = computeLuteTableSource(editor, tableParentHtml, next);
    if (newSource === null) {
      // 用 Lute 当前序列化定位失败,拒绝操作避免清空正文(M6 修复)。
      setVisible(false);
      onClose();
      return;
    }
    commitSource(newSource);
  };

  // 菜单关闭全靠 item 点击触发 commit/visible(false)+onClose();不走 onMouseLeave,
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
        // 删除整表:用 Lute 同源定位消除 deleteTable 与 run 路径的定位偏差(M6 同源修复)。
        const tableParentHtml = ctx.tableEl.parentElement?.innerHTML ?? ctx.tableEl.innerHTML;
        const lute = (editor as unknown as { lute?: { VditorIRDOM2Md?: (html: string) => string } }).lute;
        if (!lute?.VditorIRDOM2Md) {
          console.warn('[tableSubmenu] deleteTable: lute unavailable; abort');
          return;
        }
        const oldTableMd = lute.VditorIRDOM2Md(tableParentHtml);
        const full = editor.getValue();
        const idx = full.indexOf(oldTableMd);
        if (idx >= 0 && full.indexOf(oldTableMd, idx + oldTableMd.length) === -1) {
          commitSource(full.slice(0, idx) + full.slice(idx + oldTableMd.length));
        } else {
          console.warn('[tableSubmenu] deleteTable: table source is missing or ambiguous; abort');
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
