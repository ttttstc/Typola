import type { TerminalDataPayload } from './terminalService';

// 一个 PTY data 订阅器:接 handler 返回一个 Promise<unlisten>。
// 真实实现是 `onTerminalData`(Tauri listen 包装,允许多 listener 共存)。
// 测试时可用 fake emitter 实现同样的契约。
export type PtyDataSubscriber = (
  handler: (payload: TerminalDataPayload) => void,
) => Promise<() => void>;

// 等指定 termId 的 PTY 输出"先冒出来再停顿 quietMs"即视为就绪;
// maxMs 兜底超时,避免"无输出 / 进程已死"时永远挂起。
//
// 关键:这是 PTY 输出流节流,**不**解析 TUI 字符(不读 banner / 不做 regex)——
// spec §0.1:App 不解析 TUI。banner 每版会变,解析是反模式。
//
// 已知边界:claude 首启对该目录弹 trust/权限确认时,任何自动注入都可能把命令
// 当成该 prompt 的答案——这是自动注入固有边界,与检测方式无关;
// Phase 2 再考虑「首启只启动不注入」。
export function waitForPtyReady(
  subscribe: PtyDataSubscriber,
  termId: number,
  quietMs: number,
  maxMs: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let unlisten: (() => void) | undefined;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      if (quietTimer) clearTimeout(quietTimer);
      if (unlisten) unlisten();
      else void subscribePromise.then((off) => off());
      resolve();
    };

    const hardTimer = setTimeout(finish, maxMs);

    const subscribePromise = subscribe((payload) => {
      if (done) return;
      if (payload.termId !== termId) return;
      const bytes = payload.data;
      if (!bytes || bytes.length === 0) return;
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    });

    void subscribePromise.then((off) => {
      if (done) off();
      else unlisten = off;
    });
  });
}
