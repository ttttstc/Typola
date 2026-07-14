import { describe, expect, it } from 'vitest';
import { openTableMenu, translateTableMenuLabel } from './tableInteractionExtension';

describe('translateTableMenuLabel', () => {
  it.each([
    ['Sort by column (A-Z)', '按列排序（A-Z）'],
    ['Align center', '居中对齐'],
    ['Add row below', '在下方插入行'],
    ['Move column left', '向左移动列'],
    ['Duplicate row', '复制行'],
    ['Clear column', '清空列'],
    ['Delete row', '删除行'],
  ])('translates %s', (source, expected) => {
    expect(translateTableMenuLabel('zh-CN', source)).toBe(expected);
  });

  it('keeps the upstream label for non-Chinese locales', () => {
    expect(translateTableMenuLabel('en-US', 'Align center')).toBe('Align center');
  });
});

describe('openTableMenu', () => {
  it('opens the upstream table menu when the context target is a text node', async () => {
    const widget = document.createElement('div');
    widget.className = 'tbl-table-widget';
    const cell = document.createElement('td');
    cell.className = 'tbl-cell tbl-data-cell';
    const view = document.createElement('div');
    view.className = 'tbl-cell-view';
    const text = document.createTextNode(' ');
    view.append(text);
    const handle = document.createElement('div');
    handle.className = 'tbl-handle';
    handle.dataset.type = 'header';
    handle.dataset.location = 'row';
    cell.append(view, handle);
    widget.append(cell);
    document.body.append(widget);

    const pointerEvents = { down: 0, up: 0 };
    handle.addEventListener('pointerdown', () => { pointerEvents.down += 1; });
    handle.addEventListener('pointerup', () => { pointerEvents.up += 1; });
    const PointerEventCtor = window.PointerEvent ?? MouseEvent;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { configurable: true, value: text });
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEventCtor });

    expect(openTableMenu(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(pointerEvents.down).toBe(1);
    await Promise.resolve();
    expect(pointerEvents.up).toBe(1);
  });
});

it('finds a row handle from another cell in the same row', () => {
  const widget = document.createElement('div');
  widget.className = 'tbl-table-widget';
  const row = document.createElement('tr');
  const first = document.createElement('td');
  first.className = 'tbl-cell tbl-data-cell';
  const handle = document.createElement('div');
  handle.className = 'tbl-handle';
  handle.dataset.type = 'header';
  handle.dataset.location = 'row';
  first.append(handle);
  const second = document.createElement('td');
  second.className = 'tbl-cell tbl-data-cell';
  const text = document.createTextNode('cell');
  second.append(text);
  row.append(first, second);
  widget.append(row);
  document.body.append(widget);

  let opened = 0;
  handle.addEventListener('pointerdown', () => { opened += 1; });
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { configurable: true, value: text });
  expect(openTableMenu(event)).toBe(true);
  expect(opened).toBe(1);
});