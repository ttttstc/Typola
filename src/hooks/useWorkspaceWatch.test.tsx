import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceWatch } from './useWorkspaceWatch';
import type { WorkspaceChangedPayload } from '../services/workspaceWatchService';

const mkdirMock = vi.fn().mockResolvedValue(undefined);
const watchWorkspaceMock = vi.fn().mockResolvedValue(undefined);
const unwatchWorkspaceMock = vi.fn().mockResolvedValue(undefined);
let workspaceChangedHandler: ((payload: WorkspaceChangedPayload) => void) | null = null;

vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: mkdirMock,
}));

vi.mock('../services/workspaceWatchService', () => ({
  watchWorkspace: watchWorkspaceMock,
  unwatchWorkspace: unwatchWorkspaceMock,
  onWorkspaceChanged: vi.fn(async (handler: (payload: WorkspaceChangedPayload) => void) => {
    workspaceChangedHandler = handler;
    return vi.fn();
  }),
}));

type WatchApi = ReturnType<typeof useWorkspaceWatch>;

function Harness({
  expose,
}: {
  expose: (api: WatchApi) => void;
}) {
  const lastSelfWriteRef = useRef({ path: '', at: 0 });
  const api = useWorkspaceWatch({
    isTauriRuntime: true,
    watchRoot: String.raw`D:\workspace\.typola-output`,
    outputRoot: String.raw`D:\workspace\.typola-output`,
    lastSelfWriteRef,
  });
  expose(api);
  return null;
}

describe('useWorkspaceWatch', () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: WatchApi | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    api = undefined;
    workspaceChangedHandler = null;
    mkdirMock.mockClear();
    watchWorkspaceMock.mockClear();
    unwatchWorkspaceMock.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('records output changes when watchRoot equals outputRoot', async () => {
    await act(async () => {
      root.render(<Harness expose={(next) => { api = next; }} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mkdirMock).toHaveBeenCalledWith(String.raw`D:\workspace\.typola-output`, { recursive: true });
    expect(watchWorkspaceMock).toHaveBeenCalledWith(String.raw`D:\workspace\.typola-output`);

    act(() => {
      workspaceChangedHandler?.({
        kind: 'create',
        paths: [String.raw`D:\workspace\.typola-output\draft.md`],
      });
    });

    expect(api?.agentChangedPaths.has(String.raw`D:\workspace\.typola-output\draft.md`)).toBe(true);
    expect(api?.workspaceTreeVersion).toBe(1);
  });

  it('ignores paths outside outputRoot and supports explicit artifact remembers', async () => {
    await act(async () => {
      root.render(<Harness expose={(next) => { api = next; }} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      workspaceChangedHandler?.({
        kind: 'create',
        paths: [String.raw`D:\workspace\other.md`],
      });
    });
    expect(api?.agentChangedPaths.size).toBe(0);

    act(() => {
      api?.rememberArtifact(String.raw`D:\workspace\.typola-output\from-parser.md`);
    });
    expect(api?.agentChangedPaths.has(String.raw`D:\workspace\.typola-output\from-parser.md`)).toBe(true);
  });
});
