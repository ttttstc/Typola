import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalDataPayload } from './terminalService';
import { waitForPtyReady, type PtyDataSubscriber } from './ptyReady';

type Handler = (payload: TerminalDataPayload) => void;

function makeFakeEmitter() {
  const handlers: Handler[] = [];
  const subscribe: PtyDataSubscriber = (handler) => {
    handlers.push(handler);
    return Promise.resolve(() => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    });
  };
  const emit = (payload: TerminalDataPayload) => {
    for (const h of [...handlers]) h(payload);
  };
  return { subscribe, emit, handlerCount: () => handlers.length };
}

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

describe('waitForPtyReady (P1-C PTY 静默检测)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('PTY 有输出后停顿 250ms 即 resolve', async () => {
    const { subscribe, emit } = makeFakeEmitter();
    const promise = waitForPtyReady(subscribe, 42, 250, 5000);

    // 触发 data
    emit({ termId: 42, data: bytes(72, 105) }); // "Hi"
    // 安静 250ms 后 resolve
    await vi.advanceTimersByTimeAsync(250);
    await promise;
  });

  it('持续输出时每次都重置安静计时器', async () => {
    const { subscribe, emit } = makeFakeEmitter();
    const promise = waitForPtyReady(subscribe, 42, 250, 5000);

    // 第 1 次输出 → 安静 100ms
    emit({ termId: 42, data: bytes(1) });
    await vi.advanceTimersByTimeAsync(100);
    // 第 2 次输出(在 250ms 内)→ 重置,再加 250ms
    emit({ termId: 42, data: bytes(2) });
    await vi.advanceTimersByTimeAsync(100);
    // 还没到 250ms,不应 resolve
    let resolved = false;
    promise.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);
    // 再过 150ms = 第 2 次后共 250ms
    await vi.advanceTimersByTimeAsync(150);
    await promise;
  });

  it('无任何输出时 maxMs 兜底超时', async () => {
    const { subscribe } = makeFakeEmitter();
    const promise = waitForPtyReady(subscribe, 42, 250, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
  });

  it('过滤其他 termId 的输出(不视为该 termId 就绪)', async () => {
    const { subscribe, emit } = makeFakeEmitter();
    const promise = waitForPtyReady(subscribe, 42, 250, 5000);

    // 别的 termId 输出再多也不算
    emit({ termId: 99, data: bytes(1, 2, 3) });
    emit({ termId: 100, data: bytes(4, 5) });
    await vi.advanceTimersByTimeAsync(300);
    // 还没到 maxMs,不应 resolve
    let resolved = false;
    promise.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);
    // 推到 maxMs 兜底
    await vi.advanceTimersByTimeAsync(5000);
    await promise;
  });

  it('空 data 视为不触发(防止心跳或空包提前 resolve)', async () => {
    const { subscribe, emit } = makeFakeEmitter();
    const promise = waitForPtyReady(subscribe, 42, 250, 1000);

    // 空 bytes 数组 → 不应启动安静计时器
    emit({ termId: 42, data: new Uint8Array(0) });
    // 250ms 后不应 resolve
    let resolved = false;
    promise.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(250);
    expect(resolved).toBe(false);
    // 推到 maxMs 兜底
    await vi.advanceTimersByTimeAsync(750);
    await promise;
  });

  it('resolve 后 unlisten 订阅器(防止悬挂 listener 内存泄漏)', async () => {
    const { subscribe, emit, handlerCount } = makeFakeEmitter();
    const promise = waitForPtyReady(subscribe, 42, 250, 5000);

    emit({ termId: 42, data: bytes(1) });
    await vi.advanceTimersByTimeAsync(250);
    await promise;
    // 同步可能未立刻清理(then 是 microtask),多等一拍
    await vi.advanceTimersByTimeAsync(0);
    expect(handlerCount()).toBe(0);
  });
});
