// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

vi.mock('./settings/preloadSections', () => {
  const load = () => Promise.resolve({ default: () => null });
  return {
    preloadAboutSection: load,
    preloadAppearanceSection: load,
    preloadEditorSection: load,
    preloadExportSection: load,
    preloadGeneralSection: load,
    preloadHtmlExportSection: load,
    preloadAiCliSection: load,
    preloadImageSection: load,
    preloadPreviewSection: load,
    preloadTerminalSection: load,
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SettingsPage', () => {
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

  it('exposes dialog semantics, grouped navigation and an explicit close action', () => {
    const onClose = vi.fn();
    act(() => root.render(
      <SettingsPage
        onClose={onClose}
        onCheckForUpdate={async () => ({ status: 'unsupported' })}
        updateState={{ phase: 'idle' }}
        onUpdateAction={() => undefined}
        onIgnoreUpdate={() => undefined}
        onShowIgnoredUpdate={() => undefined}
      />,
    ));
    const dialog = host.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(Array.from(host.querySelectorAll('.settings-nav-group-label')).map((node) => node.textContent))
      .toEqual(['写作', '呈现', '工具']);
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="关闭设置"]')!;
    expect(document.activeElement).toBe(close);
    act(() => close.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
