import { sanitizeHtml } from './sanitizeService';

function replaceElementTag(element: HTMLElement, tagName: string): HTMLElement {
  const replacement = document.createElement(tagName);
  for (const attribute of Array.from(element.attributes)) {
    replacement.setAttribute(attribute.name, attribute.value);
  }
  replacement.innerHTML = element.innerHTML;
  element.replaceWith(replacement);
  return replacement;
}

function directCells(row: HTMLTableRowElement): HTMLElement[] {
  return Array.from(row.children).filter((child): child is HTMLElement => (
    child.tagName === 'TH' || child.tagName === 'TD'
  ));
}

function rowBelongsToTable(row: HTMLTableRowElement, table: HTMLTableElement): boolean {
  return row.closest('table') === table;
}

function rowIsInTableHead(row: HTMLTableRowElement, table: HTMLTableElement): boolean {
  const tableHead = row.closest('thead');
  return tableHead?.closest('table') === table;
}

function getImplicitHeaderRow(table: HTMLTableElement): HTMLTableRowElement | null {
  const rows = Array.from(table.querySelectorAll('tr'))
    .filter((row): row is HTMLTableRowElement => rowBelongsToTable(row, table));

  return rows.find((row) => {
    const cells = directCells(row);
    return cells.length > 0 && cells.every((cell) => cell.tagName === 'TH');
  }) ?? null;
}

function normalizeTableSections(table: HTMLTableElement): void {
  const tableHead = table.tHead;
  if (!tableHead || tableHead.rows.length <= 1) {
    return;
  }

  const bodyRowCount = Array.from(table.tBodies)
    .reduce((total, body) => total + body.rows.length, 0);
  if (bodyRowCount > 0) {
    return;
  }

  const body = table.createTBody();
  Array.from(tableHead.rows).slice(1).forEach((row) => body.append(row));
}

export function normalizeWordPreviewTables(html: string): string {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  for (const table of Array.from(template.content.querySelectorAll('table'))) {
    normalizeTableSections(table);
    const hasExplicitTableHead = table.tHead !== null;
    const implicitHeaderRow = hasExplicitTableHead ? null : getImplicitHeaderRow(table);

    for (const headerCell of Array.from(table.querySelectorAll('th'))) {
      if (headerCell.closest('table') !== table) {
        continue;
      }

      const row = headerCell.closest('tr');
      const shouldKeepHeader = row instanceof HTMLTableRowElement
        && (rowIsInTableHead(row, table) || row === implicitHeaderRow);

      if (!shouldKeepHeader) {
        replaceElementTag(headerCell, 'td');
      }
    }
  }

  return template.innerHTML;
}

export async function convertDocxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const { default: mammoth } = await import('mammoth');
  const result = await mammoth.convertToHtml({ buffer: arrayBuffer, arrayBuffer });
  return normalizeWordPreviewTables(sanitizeHtml(result.value));
}
