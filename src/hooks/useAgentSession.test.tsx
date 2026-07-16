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

  it('重启后恢复当前对话并续用同一个 Provider Session', async () => {
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
      await api?.send('第一轮改稿');
    });
    const conversationId = api?.activeConvId;
    expect(api?.activeConv?.sessionUuid).toBe('session-1');

    act(() => root.unmount());
    host.remove();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    api = undefined;
    act(() => {
      root.render(
        <Harness
          workspaceRoot={String.raw`D:\md files`}
          agentProvider="opencode"
          expose={(next) => { api = next; }}
        />,
      );
    });

    expect(api?.activeConvId).toBe(conversationId);
    expect(api?.activeConv?.messages.some((message) => message.content === '第一轮改稿')).toBe(true);
    await act(async () => {
      await api?.send('继续精炼');
    });
    expect(headlessMock.resumeAgentSession).toHaveBeenCalledWith(expect.objectContaining({
      conversationId,
      sessionUuid: 'session-1',
    }));
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

  it('cancels a start that has not returned runId and restores idle immediately', async () => {
    let resolveStart: ((value: { runId: string; conversationId: string; sessionUuid: string; resumed: boolean; agentPath: string; provider: AgentProvider }) => void) | undefined;
    headlessMock.startAgentSession.mockImplementation((_request) => new Promise((resolve) => {
      resolveStart = resolve;
    }));
    act(() => {
      root.render(
        <Harness
          workspaceRoot={String.raw`D:\md files`}
          agentProvider="opencode"
          expose={(next) => { api = next; }}
        />,
      );
    });

    let sendPromise: Promise<void> | undefined;
    act(() => { sendPromise = api?.send('hello'); });
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;
    await act(async () => { await api?.cancel(); });
    expect(api?.runState).toBe('idle');

    await act(async () => {
      resolveStart?.({ runId: 'run-1', conversationId: convId, sessionUuid: 'session-1', resumed: false, agentPath: 'opencode', provider: 'opencode' });
      await sendPromise;
    });
    expect(headlessMock.cancelAgentSession).toHaveBeenCalledWith('run-1');
  });

  it('ignores cancelled run exit after a new run starts in the same conversation', async () => {
    act(() => {
      root.render(
        <Harness
          workspaceRoot={String.raw`D:\md files`}
          agentProvider="opencode"
          expose={(next) => { api = next; }}
        />,
      );
    });
    await act(async () => { await api?.send('first'); });
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;
    await act(async () => { await api?.cancel(); });
    await act(async () => { await api?.send('second'); });
    expect(api?.runState).toBe('running');

    act(() => {
      exitHandler?.({ runId: 'run-1', conversationId: convId, sessionUuid: 'session-1', exitCode: 1, cancelled: true, stderrTail: '' });
    });
    expect(api?.runState).toBe('running');
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

  // ----------------------------------------------------------------------
  // P0-10 (C): artifact guard / form-pending gate coverage
  // ----------------------------------------------------------------------

  it('withArtifactWriteGuard: wraps every send with the AskUserQuestion ban and cwd rule', async () => {
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
      await api?.send('纯文本不带 question-form');
    });

    const request = headlessMock.startAgentSession.mock.calls[0][0];
    const prompt = request.prompt as string;
    // 注入的规则应至少有一条出现,且 cwd 规则必须出现(因为 workspaceRoot 给定)
    expect(prompt).toContain('Do not use AskUserQuestion.');
    expect(prompt).toContain('<question-form>');
    expect(prompt).toContain('当前进程工作目录是:');
    expect(prompt).toMatch(/D:\\md files\\.typola-output\\/);
  });

  it('withArtifactWriteGuard: does not duplicate the rule block on a resume that already contains it', async () => {
    // 先发一条让 session 进入 resume 路径,然后用 form-answers 续问,验证 prompt 里规则出现且不重复
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
      await api?.send('第一条问题');
    });
    // 模拟 turn 结束,让 session 标记为已 started
    const firstConvId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;
    await act(async () => {
      exitHandler?.({
        runId: 'run-1',
        conversationId: firstConvId,
        sessionUuid: 'session-1',
        exitCode: 0,
        cancelled: false,
        stderrTail: '',
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      await api?.send('[form answers — purpose]\n- 用途: 试一下');
    });
    expect(headlessMock.resumeAgentSession).toHaveBeenCalledTimes(1);
    const prompt = headlessMock.resumeAgentSession.mock.calls[0][0].prompt as string;
    // 规则块只出现一次
    const ruleMatches = prompt.match(/Do not use AskUserQuestion\./g) ?? [];
    expect(ruleMatches.length).toBe(1);
    expect(prompt).toContain('The user has answered the previous question form "purpose".');
    expect(prompt).toContain('Use the answers below to continue the task.');
  });

  it('validateArtifactOutput: streaming assistant content with an unclosed <question-form> flips runState to waitingForUser', async () => {
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
      await api?.send('先问用户');
    });
    expect(api?.runState).toBe('running');
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    // 模型流式写到一半 —— 已开口但未闭合
    await act(async () => {
      stdoutHandler?.({
        runId: 'run-1',
        conversationId: convId,
        sessionUuid: 'session-1',
        line: JSON.stringify({
          type: 'message',
          role: 'assistant',
          content: '先确认\n<question-form id="purpose">\n{"questions":[{"id":"q"',
        }),
      });
      // 等 rAF → flushQueuedEvents → updateConv
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          // 再让 React 的 commit 走完
          window.setTimeout(resolve, 0);
        });
      });
    });

    expect(api?.runState).toBe('waitingForUser');
    expect(api?.activeConv?.messages.at(-1)?.content).toContain('<question-form id="purpose">');
  });

  it('send: a plain user prompt is blocked while runState is waitingForUser', async () => {
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
      await api?.send('问点什么');
    });
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    await act(async () => {
      stdoutHandler?.({
        runId: 'run-1',
        conversationId: convId,
        sessionUuid: 'session-1',
        line: JSON.stringify({
          type: 'message',
          role: 'assistant',
          content: '<question-form id="purpose">\n{"questions":[{',
        }),
      });
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      });
    });

    expect(api?.runState).toBe('waitingForUser');
    headlessMock.startAgentSession.mockClear();
    headlessMock.resumeAgentSession.mockClear();

    // 普通 send 应被挡
    await act(async () => {
      await api?.send('抢答');
    });
    expect(headlessMock.startAgentSession).not.toHaveBeenCalled();
    expect(headlessMock.resumeAgentSession).not.toHaveBeenCalled();
  });

  it('send: toolAnswer=true bypasses the waitingForUser gate and resumes the session', async () => {
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
      await api?.send('先问用户');
    });
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    await act(async () => {
      stdoutHandler?.({
        runId: 'run-1',
        conversationId: convId,
        sessionUuid: 'session-1',
        line: JSON.stringify({
          type: 'message',
          role: 'assistant',
          content: '<question-form id="purpose">\n{',
        }),
      });
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      });
    });
    expect(api?.runState).toBe('waitingForUser');

    headlessMock.resumeAgentSession.mockClear();
    await act(async () => {
      await api?.send('[form answers — purpose]\n- q: answer', { toolAnswer: true });
    });
    expect(headlessMock.resumeAgentSession).toHaveBeenCalledTimes(1);
    const request = headlessMock.resumeAgentSession.mock.calls[0][0];
    expect(request.prompt).toContain('The user has answered the previous question form "purpose".');
    expect(request.prompt).toContain('[form answers — purpose]');
  });
});
