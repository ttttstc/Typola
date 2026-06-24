// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationManager } from './useAgentSession';
import type { AgentProvider } from '../services/agent/provider';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const headlessMock = vi.hoisted(() => ({
  startAgentSession: vi.fn(),
  resumeAgentSession: vi.fn(),
  cancelAgentSession: vi.fn(),
  onAgentStdout: vi.fn(),
  onAgentExit: vi.fn(),
}));

vi.mock('../services/agent/headlessService', () => ({
  startAgentSession: headlessMock.startAgentSession,
  resumeAgentSession: headlessMock.resumeAgentSession,
  cancelAgentSession: headlessMock.cancelAgentSession,
  onAgentStdout: headlessMock.onAgentStdout,
  onAgentExit: headlessMock.onAgentExit,
}));

type HarnessApi = ReturnType<typeof useConversationManager>;

function Harness({
  workspaceRoot,
  agentProvider,
  expose,
}: {
  workspaceRoot: string;
  agentProvider: AgentProvider;
  expose: (api: HarnessApi) => void;
}) {
  const api = useConversationManager({ workspaceRoot, agentProvider });
  useEffect(() => expose(api), [api, expose]);
  return null;
}

describe('useConversationManager', () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: HarnessApi | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    api = undefined;
    headlessMock.startAgentSession.mockReset().mockResolvedValue({
      runId: 'run-1',
      conversationId: 'conv-1',
      sessionUuid: 'session-1',
      resumed: false,
      agentPath: 'opencode',
      provider: 'opencode',
    });
    headlessMock.resumeAgentSession.mockReset();
    headlessMock.cancelAgentSession.mockReset();
    headlessMock.onAgentStdout.mockReset().mockResolvedValue(() => undefined);
    headlessMock.onAgentExit.mockReset().mockResolvedValue(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('passes visible context paths to the first OpenCode start request', async () => {
    act(() => {
      root.render(
        <Harness
          workspaceRoot={String.raw`D:\md files`}
          agentProvider="opencode"
          expose={(next) => { api = next; }}
        />,
      );
    });

    await act(async () => {
      await api?.send('读取当前文档', {
        currentFileContextPath: String.raw`D:\md files\杭州景区.md`,
        referencePaths: [String.raw`D:\md files\杭州景区.md`],
      });
    });

    expect(headlessMock.startAgentSession).toHaveBeenCalledTimes(1);
    expect(headlessMock.resumeAgentSession).not.toHaveBeenCalled();
    expect(headlessMock.startAgentSession.mock.calls[0][0]).toMatchObject({
      provider: 'opencode',
      prompt: '读取当前文档',
      cwd: expect.stringContaining(String.raw`D:\md files\.typola-output\conv-`),
      promptContextPaths: [String.raw`D:\md files\杭州景区.md`],
    });
  });
});
