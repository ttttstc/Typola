// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FindReplacePanel } from './FindReplacePanel';
import type { SearchMatch, SearchOptions } from '../services/documentSearchService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  expect(input).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

describe('FindReplacePanel', () => {
  let host: HTMLDivElement;
  let root: Root;
  let source = '';
  const onNavigate = vi.fn<(
    match: SearchMatch,
    query: string,
    options: SearchOptions,
    backwards?: boolean,
  ) => void>();
  const onClose = vi.fn();

  beforeEach(() => {
    source = 'alpha beta\nalpha beta\n';
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function renderPanel() {
    act(() => {
      root.render(
        <FindReplacePanel
          visible={false}
          focusTarget="replace"
          source={source}
          readOnly={false}
          onClose={onClose}
          onNavigate={onNavigate}
          onReplace={() => undefined}
        />,
      );
    });
    act(() => {
      root.render(
        <FindReplacePanel
          visible
          focusTarget="replace"
          source={source}
          readOnly={false}
          onClose={onClose}
          onNavigate={onNavigate}
          onReplace={(matches, replacement) => {
            source = `${source.slice(0, matches[0].index)}${replacement}${source.slice(matches[0].index + matches[0].length)}`;
            root.render(
              <FindReplacePanel
                visible
                focusTarget="replace"
                source={source}
                readOnly={false}
                onClose={onClose}
                onNavigate={onNavigate}
                onReplace={() => undefined}
              />,
            );
          }}
        />,
      );
    });
  }

  it('keeps focus in the replace input after replacing the current match', async () => {
    renderPanel();

    await act(async () => {
      await wait();
    });
    const inputs = host.querySelectorAll<HTMLInputElement>('input.find-input');

    await act(async () => {
      setInputValue(inputs[0], 'alpha');
      setInputValue(inputs[1], 'ALPHA');
      await wait(150);
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.find-action')?.click();
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    expect(source).toBe('ALPHA beta\nalpha beta\n');
    expect(document.activeElement).toBe(host.querySelectorAll<HTMLInputElement>('input.find-input')[1]);
  });

  it('recomputes matches from the current source before replace all', async () => {
    renderPanel();

    await act(async () => {
      await wait();
    });
    const inputs = host.querySelectorAll<HTMLInputElement>('input.find-input');

    await act(async () => {
      setInputValue(inputs[0], 'alpha beta');
      setInputValue(inputs[1], 'done');
      await wait(150);
    });

    source = 'alpha beta\nchanged\nalpha beta\n';
    await act(async () => {
      root.render(
        <FindReplacePanel
          visible
          focusTarget="replace"
          source={source}
          readOnly={false}
          onClose={onClose}
          onNavigate={onNavigate}
          onReplace={(matches, replacement) => {
            source = matches.reduceRight(
              (next, match) => `${next.slice(0, match.index)}${replacement}${next.slice(match.index + match.length)}`,
              source,
            );
          }}
        />,
      );
      await wait();
    });
    await act(async () => {
      host.querySelectorAll<HTMLButtonElement>('.find-action')[1]?.click();
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    expect(source).toBe('done\nchanged\ndone\n');
  });
});
