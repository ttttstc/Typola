// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppearanceSection } from './AppearanceSection';
import { getSettings } from '../../services/settingsService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AppearanceSection', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('renders the three built-in theme cards and applies a theme when clicked', async () => {
    await act(async () => {
      root.render(React.createElement(AppearanceSection));
    });

    const cards = host.querySelectorAll<HTMLButtonElement>('[data-theme-card]');
    expect(Array.from(cards).map((card) => card.dataset.themeCard)).toEqual([
      'plain-paper',
      'night-current',
      'ink-basin',
    ]);

    await act(async () => {
      cards[2].click();
    });

    expect(getSettings().themeId).toBe('ink-basin');
    expect(cards[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('persists the review mark enhancement option', async () => {
    await act(async () => {
      root.render(React.createElement(AppearanceSection));
    });

    const checkbox = host.querySelector<HTMLInputElement>('input[name="reviewEnhanceMarks"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox!.checked).toBe(true);

    await act(async () => {
      checkbox!.click();
    });

    expect(getSettings().themeOptions.reviewEnhanceMarks).toBe(false);
  });
});
