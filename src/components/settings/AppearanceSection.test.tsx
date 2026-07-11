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

  it('defaults to custom mode and switches to theme mode when a theme is picked', async () => {
    await act(async () => {
      root.render(React.createElement(AppearanceSection));
    });

    const cards = host.querySelectorAll<HTMLButtonElement>('[data-theme-card]');
    const customMode = host.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]');
    expect(customMode?.textContent).toContain('自定义模式');
    expect(Array.from(cards).map((card) => card.dataset.themeCard)).toEqual([
      'plain-paper',
      'night-current',
      'ink-basin',
      'abstract',
      'brutalist',
    ]);

    await act(async () => {
      cards[2].click();
    });

    expect(getSettings().themeId).toBe('ink-basin');
    expect(getSettings().appearanceColorSystem).toBe('static-theme');
    expect(cards[2].getAttribute('aria-checked')).toBe('true');

    const customButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.appearance-mode-switch button'))
      .find((button) => button.textContent?.includes('自定义模式'));
    await act(async () => customButton?.click());
    expect(getSettings().appearanceColorSystem).toBe('define-color');
    expect(cards[2].getAttribute('aria-checked')).toBe('false');
  });

  it('supports arrow-key theme selection inside the radio group', async () => {
    await act(async () => {
      root.render(React.createElement(AppearanceSection));
    });

    const gallery = host.querySelector<HTMLDivElement>('.theme-gallery');
    expect(gallery).not.toBeNull();

    await act(async () => {
      gallery!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(getSettings().themeId).toBe('night-current');
    expect(host.querySelector<HTMLButtonElement>('[data-theme-card="night-current"]')?.tabIndex).toBe(0);
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
