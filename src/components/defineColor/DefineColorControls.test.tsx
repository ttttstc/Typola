// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEFINE_COLOR_SETTINGS } from '../../services/defineColorSystem/constants';
import { DefineColorPatternSlider } from './DefineColorPatternSlider';
import { DefineColorPresetStrip } from './DefineColorPresetStrip';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Define Color controls', () => {
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

  it('shows eight curated presets first and preserves all fifty behind disclosure', () => {
    act(() => root.render(<DefineColorPresetStrip currentPresetIndex={null} onSelect={() => undefined} />));
    expect(host.querySelectorAll('.dc-preset')).toHaveLength(8);
    act(() => host.querySelector<HTMLButtonElement>('.dc-presets-header button')?.click());
    expect(host.querySelectorAll('.dc-preset')).toHaveLength(50);
  });

  it('supports keyboard adjustment for pattern opacity', () => {
    const onCommit = vi.fn();
    act(() => root.render(
      <DefineColorPatternSlider
        settings={{ ...DEFAULT_DEFINE_COLOR_SETTINGS, patternOpacity: 50 }}
        onPreview={() => undefined}
        onCommit={onCommit}
      />,
    ));
    const slider = host.querySelector<HTMLElement>('[role="slider"]')!;
    act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(onCommit).toHaveBeenCalledWith({ patternOpacity: 55 });
  });
});
