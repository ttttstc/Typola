// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationManager } from './useAgentSession';
import type { AgentProvider } from '../services/agent/provider';
import type { AgentExitPayload, AgentStdoutPayload } from '../services/agent/types';

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
  onArtifactFile,
  expose,
}: {
  workspaceRoot: string;
  agentProvider: AgentProvider;
  onArtifactFile?: Parameters<typeof useConversationManager>[0]['onArtifactFile'];
  expose: (api: HarnessApi) => void;
}) {
  const api = useConversationManager({ workspaceRoot, agentProvider, onArtifactFile });
  useEffect(() => expose(api), [api, expose]);
  return null;
}

describe('useConversationManager', () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: HarnessApi | undefined;
  let stdoutHandler: ((payload: AgentStdoutPayload) => void) | undefined;
  let exitHandler: ((payload: AgentExitPayload) => void) | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    api = undefined;
    stdoutHandler = undefined;
    exitHandler = undefined;
    headlessMock.startAgentSession.mockReset().mockImplementation(async (request) => ({
      runId: 'run-1',
      conversationId: request.conversationId,
      sessionUuid: 'session-1',
      resumed: false,
      agentPath: 'opencode',
      provider: 'opencode',
    }));
    headlessMock.resumeAgentSession.mockReset().mockImplementation(async (request) => ({
      runId: 'run-2',
      conversationId: request.conversationId,
      sessionUuid: 'session-1',
      resumed: true,
      agentPath: 'opencode',
      provider: 'opencode',
    }));
    headlessMock.cancelAgentSession.mockReset().mockResolvedValue(undefined);
    headlessMock.onAgentStdout.mockReset().mockImplementation(async (handler) => {
      stdoutHandler = handler;
      return () => undefined;
    });
    headlessMock.onAgentExit.mockReset().mockImplementation(async (handler) => {
      exitHandler = handler;
      return () => undefined;
    });
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
      prompt: expect.stringContaining('读取当前文档'),
      cwd: expect.stringContaining(String.raw`D:\md files\.typola-output\conv-`),
      promptContextPaths: [String.raw`D:\md files\杭州景区.md`],
    });
    expect(headlessMock.startAgentSession.mock.calls[0][0].prompt).toContain('必须只写入当前进程工作目录');
  });

  it('passes the OpenCode skill conversation as commandName', async () => {
    act(() => {
      root.render(
        <Harness
          workspaceRoot={String.raw`D:\md files`}
          agentProvider="opencode"
          expose={(next) => { api = next; }}
        />,
      );
    });

    let convId = '';
    act(() => {
      convId = api?.createConversation('frontend-slides', 'frontend-slides', 'opencode') ?? '';
    });

    await act(async () => {
      await api?.send('生成一页演示稿', { conversationId: convId });
    });

    expect(headlessMock.startAgentSession).toHaveBeenCalledTimes(1);
    const request = headlessMock.startAgentSession.mock.calls[0][0];
    expect(request).toMatchObject({
      provider: 'opencode',
      commandName: 'frontend-slides',
    });
    expect(request.prompt).toContain('生成一页演示稿');
    expect(request.prompt).toContain('[Typola 产物写入规则]');
  });

  it('drops late stdout from a cancelled run', async () => {
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
      await api?.send('hello');
    });
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    let cancelPromise: Promise<void> | undefined;
    act(() => {
      cancelPromise = api?.cancel();
    });
    await act(async () => {
      stdoutHandler?.({
        runId: 'run-1',
        conversationId: convId,
        sessionUuid: 'session-1',
        line: JSON.stringify({ type: 'assistant', text: 'late output' }),
      });
      exitHandler?.({
        runId: 'run-1',
        conversationId: convId,
        sessionUuid: 'session-1',
        exitCode: 1,
        cancelled: true,
        stderrTail: '',
      });
      await cancelPromise;
    });

    expect(api?.activeConv?.messages.some((message) => (
      message.role === 'assistant' && message.content.includes('late output')
    ))).toBe(false);
    expect(api?.runState).toBe('idle');
  });

  it('routes relative artifact_file events into the conversation output directory', async () => {
    const onArtifactFile = vi.fn();
    act(() => {
      root.render(
        <Harness
          workspaceRoot={String.raw`D:\md files`}
          agentProvider="opencode"
          onArtifactFile={onArtifactFile}
          expose={(next) => { api = next; }}
        />,
      );
    });

    await act(async () => {
      await api?.send('write artifact');
    });
    const request = headlessMock.startAgentSession.mock.calls[0][0];

    await act(async () => {
      stdoutHandler?.({
        runId: 'run-1',
        conversationId: request.conversationId,
        sessionUuid: 'session-1',
        line: JSON.stringify({
          type: 'tool_use',
          part: {
            type: 'tool',
            callID: 'toolu_write',
            tool: 'write',
            state: {
              status: 'completed',
              input: { filePath: 'draft.md', content: '# Draft\n' },
              output: 'created',
            },
          },
        }),
      });
    });

    expect(onArtifactFile).toHaveBeenCalledWith({
      path: `D:\\md files\\.typola-output\\${request.conversationId}\\draft.md`,
      content: '# Draft\n',
      toolName: 'Write',
    });
  });

  it('returns to idle after a question-form turn and resumes with ordinary form answers', async () => {
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
      await api?.send('需要先问用户');
    });
    const request = headlessMock.startAgentSession.mock.calls[0][0];

    await act(async () => {
      stdoutHandler?.({
        runId: 'run-1',
        conversationId: request.conversationId,
        sessionUuid: 'session-1',
        line: JSON.stringify({
          type: 'message',
          role: 'assistant',
          content: [
            '继续前需要确认。',
            '<question-form id="purpose">',
            '{"questions":[{"id":"goal","label":"用途","type":"text"}]}',
            '</question-form>',
          ].join('\n'),
        }),
      });
      stdoutHandler?.({
        runId: 'run-1',
        conversationId: request.conversationId,
        sessionUuid: 'session-1',
        line: JSON.stringify({ type: 'done', stopReason: 'end_turn' }),
      });
      exitHandler?.({
        runId: 'run-1',
        conversationId: request.conversationId,
        sessionUuid: 'session-1',
        exitCode: 0,
        cancelled: false,
        stderrTail: '',
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(api?.runState).toBe('idle');
    expect(api?.activeConv?.messages.some((message) => (
      message.role === 'assistant' && message.content.includes('<question-form')
    ))).toBe(true);

    await act(async () => {
      await api?.send('[form answers — purpose]\n- 用途: 技术分享');
    });

    expect(headlessMock.resumeAgentSession).toHaveBeenCalledTimes(1);
    const resumeRequest = headlessMock.resumeAgentSession.mock.calls[0][0];
    expect(resumeRequest.prompt).toContain('The user has answered the previous question form "purpose".');
    expect(resumeRequest.prompt).toContain('Do not ask the same question again.');
    expect(resumeRequest.prompt).toContain('[form answers — purpose]');
  });
});
