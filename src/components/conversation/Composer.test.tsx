// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openMock = vi.fn();

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ aiPluginDirs: [], aiClaudeModel: '', aiOpenCodeModel: '' }),
}));

vi.mock('../../services/settingsService', () => ({
  updateSettings: vi.fn(),
}));

describe('Composer', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    openMock.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('adds attached files as chips and appends context paths to prompt', async () => {
    const onSend = vi.fn();
    openMock.mockResolvedValue(['D:\\docs\\brief.md']);

    act(() => {
      root.render(
        <Composer
          activeProvider="claude"
          currentFileName="current.md"
          currentFilePath="D:\\docs\\current.md"
          onPickWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onClearWorkspace={() => undefined}
          onSwitchProvider={() => undefined}
          onSend={onSend}
          onCancel={() => undefined}
        />,
      );
    });

    const plus = host.querySelector<HTMLButtonElement>('.composer-plus-trigger');
    expect(plus).toBeTruthy();
    await act(async () => {
      plus?.click();
    });

    const attach = Array.from(host.querySelectorAll<HTMLButtonElement>('.composer-plus-popup button'))
      .find((button) => button.textContent?.includes('Attach files'));
    await act(async () => {
      attach?.click();
    });

    expect(host.textContent).toContain('current.md');
    expect(host.textContent).toContain('brief.md');

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, '鐢熸垚鎽樿');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const send = host.querySelector<HTMLButtonElement>('button[title*="Ctrl+Enter"]');
    await act(async () => {
      send?.click();
    });

    const [sentPrompt, sentContext] = onSend.mock.calls[0];
    expect(sentPrompt).toContain('current.md');
    expect(sentPrompt).toContain('brief.md');
    expect(sentContext.currentFileContextPath).toContain('current.md');
    expect(sentContext.referencePaths).toHaveLength(2);
    expect(sentContext.referencePaths[0]).toContain('current.md');
    expect(sentContext.referencePaths[1]).toContain('brief.md');
  });

  it('allows dismissing the current document chip and restores it after file changes', async () => {
    act(() => {
      root.render(
        <Composer
          activeProvider="claude"
          currentFileName="a.md"
          currentFilePath="D:\\docs\\a.md"
          onPickWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onClearWorkspace={() => undefined}
          onSwitchProvider={() => undefined}
          onSend={() => undefined}
          onCancel={() => undefined}
        />,
      );
    });

    expect(host.textContent).toContain('a.md');
    const removeCurrent = host.querySelector<HTMLButtonElement>('[aria-label="移除当前文档上下文"]');
    await act(async () => {
      removeCurrent?.click();
    });
    expect(host.textContent).not.toContain('a.md');

    act(() => {
      root.render(
        <Composer
          activeProvider="claude"
          currentFileName="b.md"
          currentFilePath="D:\\docs\\b.md"
          onPickWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onClearWorkspace={() => undefined}
          onSwitchProvider={() => undefined}
          onSend={() => undefined}
          onCancel={() => undefined}
        />,
      );
    });

    expect(host.textContent).toContain('b.md');
  });

  it('appends the newly active document when the conversation previously injected another file', async () => {
    const onSend = vi.fn();
    act(() => {
      root.render(
        <Composer
          activeProvider="claude"
          currentFileName="b.md"
          currentFilePath="D:\\docs\\b.md"
          fileContextInjected
          currentFileContextPath="D:\\docs\\a.md"
          onPickWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onClearWorkspace={() => undefined}
          onSwitchProvider={() => undefined}
          onSend={onSend}
          onCancel={() => undefined}
        />,
      );
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, '缁啓褰撳墠鏂囩珷');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const send = host.querySelector<HTMLButtonElement>('button[title*="Ctrl+Enter"]');
    await act(async () => {
      send?.click();
    });

    const [sentPrompt, sentContext] = onSend.mock.calls[0];
    expect(sentPrompt).toContain('b.md');
    expect(sentPrompt).not.toContain('a.md');
    expect(sentContext.currentFileContextPath).toContain('b.md');
    expect(sentContext.referencePaths).toHaveLength(1);
    expect(sentContext.referencePaths[0]).toContain('b.md');
  });

  it('does not repeat the active document when the same file was already injected', async () => {
    const onSend = vi.fn();
    act(() => {
      root.render(
        <Composer
          activeProvider="claude"
          currentFileName="b.md"
          currentFilePath="D:\\docs\\b.md"
          fileContextInjected
          currentFileContextPath="D:\\docs\\b.md"
          onPickWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onClearWorkspace={() => undefined}
          onSwitchProvider={() => undefined}
          onSend={onSend}
          onCancel={() => undefined}
        />,
      );
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, '缁х画');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const send = host.querySelector<HTMLButtonElement>('button[title*="Ctrl+Enter"]');
    await act(async () => {
      send?.click();
    });

    const [sentPrompt, sentContext] = onSend.mock.calls[0];
    expect(sentPrompt).not.toContain('b.md');
    expect(sentContext.currentFileContextPath).toBeUndefined();
    expect(sentContext.referencePaths).toHaveLength(1);
    expect(sentContext.referencePaths[0]).toContain('b.md');
  });

  it('keeps OpenCode prompts unchanged and passes context paths out of band', async () => {
    const onSend = vi.fn();
    act(() => {
      root.render(
        <Composer
          activeProvider="opencode"
          currentFileName="b.md"
          currentFilePath="D:\\docs\\b.md"
          onPickWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onClearWorkspace={() => undefined}
          onSwitchProvider={() => undefined}
          onSend={onSend}
          onCancel={() => undefined}
        />,
      );
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'read current doc');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const send = host.querySelector<HTMLButtonElement>('button[title*="Ctrl+Enter"]');
    await act(async () => {
      send?.click();
    });

    const [sentPrompt, sentContext] = onSend.mock.calls[0];
    expect(sentPrompt).toBe('read current doc');
    expect(sentContext.currentFileContextPath).toContain('b.md');
    expect(sentContext.referencePaths).toHaveLength(1);
    expect(sentContext.referencePaths[0]).toContain('b.md');
  });

  it('calls onSwitchProvider from the composer footer provider picker', async () => {
    const onSwitchProvider = vi.fn();
    act(() => {
      root.render(
        <Composer
          activeProvider="claude"
          onPickWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onClearWorkspace={() => undefined}
          onSwitchProvider={onSwitchProvider}
          onSend={() => undefined}
          onCancel={() => undefined}
        />,
      );
    });

    const picker = host.querySelector<HTMLElement>('.conversation-provider-picker');
    const openCodeButton = Array.from(picker?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.includes('OpenCode'));
    expect(openCodeButton).toBeTruthy();
    await act(async () => {
      openCodeButton!.click();
    });

    expect(onSwitchProvider).toHaveBeenCalledWith('opencode');
  });

  it('uses OpenCode copy when OpenCode is the active provider', () => {
    act(() => {
      root.render(
        <Composer
          activeProvider="opencode"
          onPickWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onClearWorkspace={() => undefined}
          onSwitchProvider={() => undefined}
          onSend={() => undefined}
          onCancel={() => undefined}
        />,
      );
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea?.placeholder).toContain('OpenCode');
    expect(textarea?.placeholder).not.toContain('Claude');
    expect(host.textContent).toContain('OpenCode');
    expect(host.textContent).toContain('默认模型');
  });
});
