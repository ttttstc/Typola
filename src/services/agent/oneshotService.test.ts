import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentExitPayload,
  AgentStdoutPayload,
} from './types';

// 单测策略:mock headlessService 的四个出口,在测试里手动:
//   - 拿到 onAgentStdout/onAgentExit 注册的 handler
//   - startAgentSession 返回假 runId
//   - 调度 stream-json 行 → onAgentStdout 回调 → handler 真实解析(不 mock claudeStream)
//   - 调度 exit payload → runSkillOneshot 应 resolve/reject

const headlessMock = vi.hoisted(() => {
  const stdoutHandlers: Array<(p: AgentStdoutPayload) => void> = [];
  const exitHandlers: Array<(p: AgentExitPayload) => void> = [];
  return {
    startAgentSession: vi.fn(),
    resumeAgentSession: vi.fn(),
    cancelAgentSession: vi.fn().mockResolvedValue(undefined),
    onAgentStdout: vi.fn((handler: (p: AgentStdoutPayload) => void) => {
      stdoutHandlers.push(handler);
      return Promise.resolve(() => {
        const idx = stdoutHandlers.indexOf(handler);
        if (idx >= 0) stdoutHandlers.splice(idx, 1);
      });
    }),
    onAgentExit: vi.fn((handler: (p: AgentExitPayload) => void) => {
      exitHandlers.push(handler);
      return Promise.resolve(() => {
        const idx = exitHandlers.indexOf(handler);
        if (idx >= 0) exitHandlers.splice(idx, 1);
      });
    }),
    __feedStdout(payload: AgentStdoutPayload) {
      for (const handler of [...stdoutHandlers]) handler(payload);
    },
    __feedExit(payload: AgentExitPayload) {
      for (const handler of [...exitHandlers]) handler(payload);
    },
    __reset() {
      stdoutHandlers.length = 0;
      exitHandlers.length = 0;
    },
  };
});

vi.mock('./headlessService', () => ({
  startAgentSession: headlessMock.startAgentSession,
  resumeAgentSession: headlessMock.resumeAgentSession,
  cancelAgentSession: headlessMock.cancelAgentSession,
  onAgentStdout: headlessMock.onAgentStdout,
  onAgentExit: headlessMock.onAgentExit,
}));

// 必须在 vi.mock 之后再 import 被测目标(否则会拿到真实模块)
import { runSkillOneshot } from './oneshotService';

function makeStreamJsonText(messageId: string, deltas: string[]): string {
  const lines: string[] = [];
  lines.push(JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: { id: messageId } } }));
  lines.push(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } } }));
  for (const delta of deltas) {
    lines.push(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta } } }));
  }
  lines.push(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }));
  return lines.join('\n');
}

describe('runSkillOneshot', () => {
  beforeEach(() => {
    headlessMock.__reset();
    headlessMock.startAgentSession.mockReset().mockImplementation(async (req) => ({
      runId: `run-${req.conversationId}`,
      conversationId: req.conversationId,
      sessionUuid: 'fake-uuid',
      resumed: false,
      agentPath: 'claude',
    }));
    headlessMock.cancelAgentSession.mockReset().mockResolvedValue(undefined);
  });

  it('每次调用生成不同的隐藏 conversationId (oneshot- 前缀)', async () => {
    headlessMock.startAgentSession.mockClear();

    // 起两个并行 oneshot,不等结束 → 取 startAgentSession 调用参数
    const p1 = runSkillOneshot({ prompt: 'a' });
    const p2 = runSkillOneshot({ prompt: 'b' });
    // 让 microtask 跑
    await Promise.resolve();
    await Promise.resolve();

    const calls = headlessMock.startAgentSession.mock.calls.map((c) => c[0].conversationId);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^oneshot-/);
    expect(calls[1]).toMatch(/^oneshot-/);
    expect(calls[0]).not.toBe(calls[1]);

    // 收尾:都给个失败 exit,让 promise reject 掉,避免悬挂
    for (const convId of calls) {
      headlessMock.__feedExit({ runId: `run-${convId}`, conversationId: convId, sessionUuid: 'x', exitCode: 1, cancelled: false, stderrTail: 'fake' });
    }
    await Promise.allSettled([p1, p2]);
  });

  it('exit 0 + 累积到 text_delta → resolve(完整文本)', async () => {
    headlessMock.startAgentSession.mockClear();
    const promise = runSkillOneshot({ prompt: '测试' });
    // 让 onAgentStdout/onAgentExit 注册完成 + startAgentSession 调用记录
    await Promise.resolve();
    await Promise.resolve();
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    // 喂 stream-json:三段 delta 拼成「润色后的文字」
    const json = makeStreamJsonText('msg-1', ['润色', '后的', '文字']);
    for (const line of json.split('\n')) {
      headlessMock.__feedStdout({ runId: `run-${convId}`, conversationId: convId, sessionUuid: 'x', line });
    }
    // 发 exit 0
    headlessMock.__feedExit({ runId: `run-${convId}`, conversationId: convId, sessionUuid: 'x', exitCode: 0, cancelled: false, stderrTail: '' });

    await expect(promise).resolves.toBe('润色后的文字');
  });

  it('exit 非 0 → reject(stderrTail)', async () => {
    headlessMock.startAgentSession.mockClear();
    const promise = runSkillOneshot({ prompt: '测试' });
    await Promise.resolve();
    await Promise.resolve();
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    headlessMock.__feedExit({ runId: `run-${convId}`, conversationId: convId, sessionUuid: 'x', exitCode: 1, cancelled: false, stderrTail: 'claude not found' });

    await expect(promise).rejects.toThrow(/claude not found/);
  });

  it('exit 0 但无任何 text_delta → reject(空文本)', async () => {
    headlessMock.startAgentSession.mockClear();
    const promise = runSkillOneshot({ prompt: '测试' });
    await Promise.resolve();
    await Promise.resolve();
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    headlessMock.__feedExit({ runId: `run-${convId}`, conversationId: convId, sessionUuid: 'x', exitCode: 0, cancelled: false, stderrTail: '' });

    await expect(promise).rejects.toThrow(/没有返回任何文本/);
  });

  it('payload.cancelled → reject(AbortError)', async () => {
    headlessMock.startAgentSession.mockClear();
    const promise = runSkillOneshot({ prompt: '测试' });
    await Promise.resolve();
    await Promise.resolve();
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    headlessMock.__feedExit({ runId: `run-${convId}`, conversationId: convId, sessionUuid: 'x', exitCode: 0, cancelled: true, stderrTail: '' });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('signal.abort 后 → cancelAgentSession 被调 + reject(AbortError)', async () => {
    headlessMock.startAgentSession.mockClear();
    const controller = new AbortController();
    const promise = runSkillOneshot({ prompt: '测试', signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    const convId = headlessMock.startAgentSession.mock.calls[0][0].conversationId;

    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(headlessMock.cancelAgentSession).toHaveBeenCalledWith(`run-${convId}`);
  });

  it('signal 已 aborted → 立即 reject,不发起 startAgentSession', async () => {
    headlessMock.startAgentSession.mockClear();
    const controller = new AbortController();
    controller.abort();
    const promise = runSkillOneshot({ prompt: '测试', signal: controller.signal });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(headlessMock.startAgentSession).not.toHaveBeenCalled();
  });

  it('只匹配自己 conversationId 的事件,其他 oneshot 的 stdout 不会污染', async () => {
    headlessMock.startAgentSession.mockClear();
    const p1 = runSkillOneshot({ prompt: 'a' });
    const p2 = runSkillOneshot({ prompt: 'b' });
    await Promise.resolve();
    await Promise.resolve();
    const conv1 = headlessMock.startAgentSession.mock.calls[0][0].conversationId;
    const conv2 = headlessMock.startAgentSession.mock.calls[1][0].conversationId;

    // 给 conv1 喂「A 的回复」,给 conv2 喂「B 的回复」
    for (const line of makeStreamJsonText('m1', ['A 的回复']).split('\n')) {
      headlessMock.__feedStdout({ runId: `run-${conv1}`, conversationId: conv1, sessionUuid: 'x', line });
    }
    for (const line of makeStreamJsonText('m2', ['B 的回复']).split('\n')) {
      headlessMock.__feedStdout({ runId: `run-${conv2}`, conversationId: conv2, sessionUuid: 'x', line });
    }
    headlessMock.__feedExit({ runId: `run-${conv1}`, conversationId: conv1, sessionUuid: 'x', exitCode: 0, cancelled: false, stderrTail: '' });
    headlessMock.__feedExit({ runId: `run-${conv2}`, conversationId: conv2, sessionUuid: 'x', exitCode: 0, cancelled: false, stderrTail: '' });

    await expect(p1).resolves.toBe('A 的回复');
    await expect(p2).resolves.toBe('B 的回复');
  });

  it('start 阶段抛错 → reject 原始错误', async () => {
    headlessMock.startAgentSession.mockReset().mockRejectedValue(new Error('Tauri 通道断了'));
    const promise = runSkillOneshot({ prompt: 'x' });
    await expect(promise).rejects.toThrow(/Tauri 通道断了/);
  });
});
