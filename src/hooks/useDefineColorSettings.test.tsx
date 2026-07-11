// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEFINE_COLOR_SETTINGS } from '../services/defineColorSystem/constants';
import type { DefineColorSettings } from '../services/defineColorSystem/types';
import { useDefineColorSettings } from './useDefineColorSettings';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useDefineColorSettings', () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: ReturnType<typeof useDefineColorSettings>;
  let callbacks: FrameRequestCallback[];

  function Harness({ source }: { source: DefineColorSettings }) {
    api = useDefineColorSettings(source);
    return <output data-testid="hue">{api.draft.h}</output>;
  }

  beforeEach(() => {
    localStorage.clear();
    callbacks = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('coalesces rapid previews into one animation-frame render', async () => {
    await act(async () => root.render(<Harness source={DEFAULT_DEFINE_COLOR_SETTINGS} />));

    act(() => {
      api.preview({ h: 10 });
      api.preview({ h: 20 });
      api.preview({ h: 30 });
    });

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe('0');
    act(() => callbacks[0](16));
    expect(host.textContent).toBe('30');
  });

  it('rehydrates its draft when persisted settings are loaded later', async () => {
    await act(async () => root.render(<Harness source={DEFAULT_DEFINE_COLOR_SETTINGS} />));
    await act(async () => root.render(<Harness source={{ ...DEFAULT_DEFINE_COLOR_SETTINGS, h: 224, saturation: 100 }} />));

    expect(host.textContent).toBe('224');
  });
});
