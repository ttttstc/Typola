// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirPicker } from './WorkingDirPicker';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('WorkingDirPicker', () => {
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
  });

  it('uses the shared keyboard menu and exposes recent directories directly', () => {
    const onSelectRecent = vi.fn();
    act(() => root.render(
      <WorkingDirPicker
        workingDir="D:/work/current"
        recentDirs={['D:/work/other', 'D:/work/archive']}
        onPickDirectory={() => undefined}
        onSelectRecent={onSelectRecent}
        onClear={() => undefined}
      />,
    ));

    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="工作区：current"]')!;
    act(() => trigger.click());
    const choices = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(Array.from(choices, (choice) => choice.textContent)).toEqual([
      '更换工作区',
      'otherD:/work/other',
      'archiveD:/work/archive',
      '清除工作区',
    ]);

    act(() => choices[1].click());
    expect(onSelectRecent).toHaveBeenCalledWith('D:/work/other');
    expect(document.activeElement).toBe(trigger);
  });
});
