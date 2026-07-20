// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorContextMenu } from './EditorContextMenu';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('EditorContextMenu 行号开关', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('正文右键可直接显示行号', async () => {
    const onToggleLineNumbers = vi.fn();
    await act(async () => root.render(
      <EditorContextMenu
        open
        x={0}
        y={0}
        hasSelection={false}
        lineNumbersVisible={false}
        onToggleLineNumbers={onToggleLineNumbers}
        onPick={() => {}}
        onClose={() => {}}
      />,
    ));

    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('显示行号'));
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(onToggleLineNumbers).toHaveBeenCalledOnce();
  });

  it('行号已显示时菜单提供隐藏入口', async () => {
    await act(async () => root.render(
      <EditorContextMenu
        open
        x={0}
        y={0}
        hasSelection={false}
        lineNumbersVisible
        onToggleLineNumbers={() => {}}
        onPick={() => {}}
        onClose={() => {}}
      />,
    ));

    expect(host.textContent).toContain('隐藏行号');
  });
});
