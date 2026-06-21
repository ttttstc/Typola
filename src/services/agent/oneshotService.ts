// 静默一次性 AI 调用 —— 选区浮条「原地闭环」核心基础设施。
//
// 用途:跑一段 prompt → 拿完整 assistant 文本 → resolve。不进对话面板,
// 不污染 useConversationManager 的状态;失败 reject。
//
// 路由原理:headless 全局 onAgentStdout/onAgentExit 按 payload.conversationId 分发,
// useConversationManager 只处理它自己 conversations Map 里的 convId。所以这里用一个
// "oneshot-{nanoid}" 的临时 conversationId,自己注册独立监听 + 自己过滤,
// 就实现了完全隔离的隐藏会话。
//
// stream-json 解析直接复用 createClaudeStreamHandler(同 useAgentSession),
// 只在 callback 里累积 text_delta;不处理 thinking/tool_use/artifact_file(原地
// 闭环不需要,只要最终替换文本)。

import { createClaudeStreamHandler } from './claudeStream';
import {
  cancelAgentSession,
  onAgentExit,
  onAgentStdout,
  startAgentSession,
  type AgentSessionStartRequest,
} from './headlessService';

export type RunSkillOneshotOptions = Omit<AgentSessionStartRequest, 'conversationId'> & {
  /** 可选 AbortSignal:用户取消时调 cancelAgentSession。 */
  signal?: AbortSignal;
};

let oneshotCounter = 0;

function nextConversationId(): string {
  oneshotCounter += 1;
  return `oneshot-${Date.now()}-${oneshotCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 跑一次 oneshot AI 调用,返回完整 assistant 文本(去 trim)。
 *
 * - exit 0 且收到文本 → resolve(text)
 * - exit 0 但文本为空 → reject('AI 没有返回任何文本')
 * - exit !=0 → reject(stderrTail 或通用错误)
 * - signal abort → cancelAgentSession + reject(AbortError)
 */
export async function runSkillOneshot(options: RunSkillOneshotOptions): Promise<string> {
  const conversationId = nextConversationId();
  let collectedText = '';
  let errorMessage: string | null = null;

  const handler = createClaudeStreamHandler((event) => {
    if (!event || typeof event !== 'object') return;
    const type = (event as { type?: unknown }).type;
    if (type === 'text_delta') {
      const delta = (event as { delta?: unknown }).delta;
      if (typeof delta === 'string') collectedText += delta;
    } else if (type === 'error') {
      const message = (event as { message?: unknown }).message;
      if (typeof message === 'string' && message) errorMessage = message;
    }
  });

  const unlistenStdout = await onAgentStdout((payload) => {
    if (payload.conversationId !== conversationId) return;
    handler.feed(`${payload.line}\n`);
  });

  let runId: string | null = null;
  let settled = false;
  let unlistenExit: (() => void) | null = null;

  const cleanup = () => {
    unlistenStdout();
    unlistenExit?.();
  };

  return new Promise<string>((resolve, reject) => {
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () => {
      if (runId) {
        void cancelAgentSession(runId).catch(() => {/* 忽略 */});
      }
      settle(() => reject(new DOMException('Oneshot aborted', 'AbortError')));
    };

    if (options.signal?.aborted) {
      settle(() => reject(new DOMException('Oneshot aborted', 'AbortError')));
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });

    void onAgentExit((payload) => {
      if (payload.conversationId !== conversationId) return;
      handler.flush();
      options.signal?.removeEventListener('abort', onAbort);
      if (payload.cancelled) {
        settle(() => reject(new DOMException('Oneshot cancelled', 'AbortError')));
        return;
      }
      if (payload.exitCode !== 0 && payload.exitCode != null) {
        const message = errorMessage || payload.stderrTail.trim() || `Claude 退出码 ${payload.exitCode}`;
        settle(() => reject(new Error(message)));
        return;
      }
      const text = collectedText.trim();
      if (!text) {
        settle(() => reject(new Error(errorMessage || 'AI 没有返回任何文本')));
        return;
      }
      settle(() => resolve(text));
    }).then((unlisten) => {
      if (settled) {
        unlisten();
        return;
      }
      unlistenExit = unlisten;
    }).catch((error) => {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    });

    startAgentSession({
      conversationId,
      prompt: options.prompt,
      cwd: options.cwd,
      agentPath: options.agentPath,
      model: options.model,
      pluginDirs: options.pluginDirs,
      extraAllowedDirs: options.extraAllowedDirs,
    })
      .then((result) => {
        runId = result.runId;
      })
      .catch((error) => {
        options.signal?.removeEventListener('abort', onAbort);
        settle(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
  });
}
