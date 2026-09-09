// @vitest-environment jsdom
// 跳转到行弹窗:输入解析("行" / "行:列")、Enter 跳转、Esc 关闭、
// 非法输入提示错误。
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoToLinePopover, parseGoToLineInput } from './GoToLinePopover';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
});

describe('parseGoToLineInput', () => {
  it('解析纯行号', () => {
    expect(parseGoToLineInput('12')).toEqual({ line: 12 });
    expect(parseGoToLineInput(' 8 ')).toEqual({ line: 8 });
  });

  it('解析 行:列', () => {
    expect(parseGoToLineInput('12:34')).toEqual({ line: 12, col: 34 });
    expect(parseGoToLineInput('3:1')).toEqual({ line: 3, col: 1 });
  });

  it('非法输入返回 null', () => {
    expect(parseGoToLineInput('')).toBeNull();
    expect(parseGoToLineInput('abc')).toBeNull();
    expect(parseGoToLineInput('0')).toBeNull();
    expect(parseGoToLineInput('-3')).toBeNull();
    expect(parseGoToLineInput('12:')).toBeNull();
    expect(parseGoToLineInput('12:0')).toBeNull();
    expect(parseGoToLineInput('1.2')).toBeNull();
  });
});

describe('GoToLinePopover', () => {
  function render(visible: boolean, onGoToLine: (line: number, col?: number) => void, onClose: () => void) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <GoToLinePopover visible={visible} totalLines={10} onClose={onClose} onGoToLine={onGoToLine} />,
      );
    });
  }

  function queryInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>('.goto-line-input');
    expect(input).not.toBeNull();
    return input!;
  }

  function setInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('visible=false 时不渲染', () => {
    const onGoToLine = vi.fn();
    render(false, onGoToLine, vi.fn());
    expect(document.querySelector('.goto-line-popover')).toBeNull();
    expect(onGoToLine).not.toHaveBeenCalled();
  });

  it('Enter 提交行号并关闭,支持 行:列', () => {
    const onGoToLine = vi.fn();
    const onClose = vi.fn();
    render(true, onGoToLine, onClose);
    const input = queryInput();
    setInputValue(input, '3:5');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(onGoToLine).toHaveBeenCalledWith(3, 5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc 关闭且不跳转', () => {
    const onGoToLine = vi.fn();
    const onClose = vi.fn();
    render(true, onGoToLine, onClose);
    const input = queryInput();
    setInputValue(input, '2');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onGoToLine).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('非法输入显示错误且不跳转', () => {
    const onGoToLine = vi.fn();
    const onClose = vi.fn();
    render(true, onGoToLine, onClose);
    const input = queryInput();
    setInputValue(input, 'abc');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(onGoToLine).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.goto-line-error')?.textContent).toContain('行号');
  });

  it('打开时输入框自动获得焦点', () => {
    render(true, vi.fn(), vi.fn());
    const input = queryInput();
    expect(document.activeElement).toBe(input);
  });
});
