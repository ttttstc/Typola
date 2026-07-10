import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { diagnoseClaudeCliFailure } from '../services/agent/claudeDiagnostics';
import { diagnoseOpenCodeCliFailure } from '../services/agent/opencodeDiagnostics';
import { createClaudeStreamHandler } from '../services/agent/claudeStream';
import { createOpenCodeStreamHandler } from '../services/agent/opencodeStream';
import type { ConversationData, PendingInjection } from '../services/agent/conversationStore';
import { createConversationData } from '../services/agent/conversationStore';
import type { AgentProvider } from '../services/agent/provider';
import { DEFAULT_AGENT_PROVIDER, getAgentProviderConfig } from '../services/agent/provider';
import {
  cancelAgentSession,
  onAgentExit,
  onAgentStdout,
  resumeAgentSession,
  startAgentSession,
} from '../services/agent/headlessService';
import type { AppLocale } from '../services/settingsService';
import { getSettings } from '../services/settingsService';
import type { AgentEvent, AgentMessage, AgentToolCall, SelectionAnchor } from '../services/agent/types';
import type { AgentDiagnostic } from '../services/agent/runtime/types';

type UseConversationManagerOptions = {
  workspaceRoot?: string;
  agentProvider?: AgentProvider;
  claudePath?: string;
  claudeModel?: string;
  openCodePath?: string;
  openCodeModel?: string;
  pluginDirs?: string[];
  onArtifactFile?: (artifact: { path: string; content?: string; toolName: string }) => void;
};

function formatAgentDiagnostic(diagnostic: AgentDiagnostic | null | undefined, fallback: string): string {
  if (!diagnostic) return fallback;
  return diagnostic.detail || diagnostic.title || fallback;
}

function claudeFailureDiagnostic(input: Parameters<typeof diagnoseClaudeCliFailure>[0]): AgentDiagnostic | null {
  const diagnostic = diagnoseClaudeCliFailure(input);
  if (!diagnostic) return null;
  return {
    code: diagnostic.code || 'unknown',
    level: diagnostic.retryable ? 'warning' : 'error',
    title: diagnostic.message || 'Claude Code 执行失败',
    detail: diagnostic.detail || diagnostic.message || 'Claude Code 执行失败。',
    fix: null,
  };
}

function openCodeFailureDiagnostic(input: Parameters<typeof diagnoseOpenCodeCliFailure>[0]): AgentDiagnostic | null {
  const diagnostic = diagnoseOpenCodeCliFailure(input);
  if (!diagnostic) return null;
  return {
    code: diagnostic.code || 'unknown',
    level: 'error',
    title: diagnostic.message || 'OpenCode 执行失败',
    detail: diagnostic.detail || diagnostic.message || 'OpenCode 执行失败。',
    fix: null,
  };
}

function createProviderStreamHandler(provider: AgentProvider, onEvent: (event: AgentEvent) => void) {
  return provider === 'opencode'
    ? createOpenCodeStreamHandler(onEvent)
    : createClaudeStreamHandler((event) => onEvent(event as AgentEvent));
}

function providerRuntimeOptions(
  provider: AgentProvider,
  options: Pick<UseConversationManagerOptions, 'claudePath' | 'claudeModel' | 'openCodePath' | 'openCodeModel' | 'pluginDirs'>,
) {
  if (provider === 'opencode') {
    return {
      agentPath: options.openCodePath,
      model: options.openCodeModel,
      pluginDirs: undefined,
    };
  }
  return {
    agentPath: options.claudePath,
    model: options.claudeModel,
    pluginDirs: options.pluginDirs,
  };
}

function toolId(value: unknown): string {
  return typeof value === 'string' && value ? value : `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toolName(value: unknown): string {
  return typeof value === 'string' && value ? value : 'Tool';
}

function upsertTool(tools: AgentToolCall[], next: AgentToolCall): AgentToolCall[] {
  const index = tools.findIndex((tool) => tool.id === next.id);
  if (index === -1) return [...tools, next];
  return tools.map((tool, candidateIndex) => (
    candidateIndex === index ? { ...tool, ...next } : tool
  ));
}

function appendEventToMessages(messages: AgentMessage[], event: AgentEvent): AgentMessage[] {
  if (event.type !== 'text_delta' &&
      event.type !== 'thinking_delta' &&
      event.type !== 'tool_use' &&
      event.type !== 'tool_input_delta' &&
      event.type !== 'tool_result' &&
      event.type !== 'usage' &&
      event.type !== 'error' &&
      event.type !== 'fabricated_role_marker') {
    return messages;
  }

  const last = messages[messages.length - 1];
  const assistant: AgentMessage = last?.role === 'assistant'
    ? last
    : { id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`, role: 'assistant', content: '', thinking: '', tools: [], createdAt: Date.now() };
  const base = last?.role === 'assistant' ? messages.slice(0, -1) : messages;
  let next = assistant;

  if (event.type === 'text_delta') {
    next = { ...assistant, content: assistant.content + event.delta };
  } else if (event.type === 'thinking_delta') {
    next = { ...assistant, thinking: assistant.thinking + event.delta };
  } else if (event.type === 'tool_use') {
    next = { ...assistant, tools: upsertTool(assistant.tools, { id: toolId(event.id), name: toolName(event.name), input: event.input }) };
  } else if (event.type === 'tool_input_delta') {
    const id = toolId(event.id);
    const prev = assistant.tools.find((t) => t.id === id);
    next = { ...assistant, tools: upsertTool(assistant.tools, { id, name: toolName(event.name), inputDelta: `${prev?.inputDelta ?? ''}${event.delta}` }) };
  } else if (event.type === 'tool_result') {
    const id = toolId(event.toolUseId);
    const prev = assistant.tools.find((t) => t.id === id);
    next = { ...assistant, tools: upsertTool(assistant.tools, { id, name: prev?.name ?? 'Tool', result: event.content, isError: event.isError }) };
  } else if (event.type === 'usage') {
    next = { ...assistant, done: true, usage: { usage: event.usage, costUsd: event.costUsd, durationMs: event.durationMs, stopReason: event.stopReason } };
  } else if (event.type === 'error' || event.type === 'fabricated_role_marker') {
    next = { ...assistant, error: event.type === 'error' ? event.message : `检测到可疑角色标记：${event.marker}` };
  }

  return [...base, next];
}

function joinPath(root: string, ...parts: string[]): string {
  const separator = root.includes('\\') ? '\\' : '/';
  return [root.replace(/[\\/]+$/u, ''), ...parts.map((p) => p.replace(/^[\\/]+|[\\/]+$/gu, ''))].filter(Boolean).join(separator);
}

function isAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/u.test(path) || path.startsWith('/') || path.startsWith('\\\\');
}

function safeSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'conversation';
}

function hasOpenQuestionForm(content: string): boolean {
  // 模型输出 <question-form...> 但还没匹配到 </question-form> → mid-turn 等用户
  const openIndex = content.lastIndexOf('<question-form');
  if (openIndex === -1) return false;
  const closeIndex = content.indexOf('</question-form>', openIndex);
  return closeIndex === -1;
}

function validateArtifactOutput(text: string, conv: ConversationData | undefined): { ok: true } | { ok: false, reason: string } {
  if (!conv || conv.runState !== 'running') return { ok: true };
  // 模型开了 <question-form 但 turn 还没结束 → 强制切到 waitingForUser
  if (hasOpenQuestionForm(text)) {
    return { ok: false, reason: 'model opened <question-form> without closing tag mid-turn' };
  }
  return { ok: true };
}

function summarizeTitle(text: string): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  return clean.length > 20 ? `${clean.slice(0, 20)}…` : clean || '自由对话';
}

const FORM_ANSWERS_HEADER_RE = /^\[form answers — ([^\]]+)\]/u;

function composeUserRequestForAgent(userText: string): string {
  const match = userText.match(FORM_ANSWERS_HEADER_RE);
  if (!match) return userText;
  const formId = match[1];
  return [
    `The user has answered the previous question form "${formId}".`,
    'Use the answers below to continue the task.',
    'Do not ask the same question again.',
    'Do not emit another <question-form> unless there is a new, materially different blocking ambiguity.',
    '',
    userText,
  ].join('\n');
}

function withArtifactWriteGuard(prompt: string, cwd: string | undefined, locale: AppLocale): string {
  let wrapped = composeUserRequestForAgent(prompt);
  wrapped += [
    '',
    '[交互规则]',
    'Do not use AskUserQuestion.',
    'Do not call any question-asking tool.',
    'Typola does not support tool-based user questions.',
    '当需要用户做选择或确认时，只能使用 <question-form> markdown artifact 输出表单，不要使用 AskUserQuestion 工具。',
    '<question-form> 内部必须直接输出合法 JSON，不要包裹 ```json 代码围栏，不要添加尾逗号或注释。',
    '输出完 <question-form> 后立即停止当前 turn；不要在同一 turn 里继续生成文档、调用工具或写文件。',
    '收到 [form answers — ...] 后必须使用答案继续任务，不要重复提出同一组问题。',
    '',
    `[Typola 系统语言: ${locale}]`,
    `所有面向用户可见的文案必须用 ${locale} 输出,包括:`,
    '- <question-form> 的 title / description / questions[].label / placeholder / submitLabel / skipLabel',
    '- questions[].options 里的每一项',
    '- 用户提交后你在同一 turn 里用 [form answers — ...] 之外的文字回应用户时的语气与措辞',
    '不要混用其他语言,除非用户在用户消息里明确要求保留某种语言。',
  ].join('\n');
  if (cwd) {
    wrapped += `\n\n[Typola 产物写入规则]\n如果本轮需要新建、导出或写入任何产物文件，必须只写入当前进程工作目录，使用相对路径文件名或相对路径子目录；不要写入工作区根目录、原文档目录或其它绝对路径。\n当前进程工作目录是: ${cwd}`;
  }
  return wrapped;
}

function outputCwdForConversation(workspaceRoot: string | undefined, convId: string): string | undefined {
  return workspaceRoot ? joinPath(workspaceRoot, '.typola-output', safeSegment(convId)) : undefined;
}

let nextConvCounter = 1;

export function useConversationManager({
  workspaceRoot,
  agentProvider = DEFAULT_AGENT_PROVIDER,
  claudePath,
  claudeModel,
  openCodePath,
  openCodeModel,
  pluginDirs,
  onArtifactFile,
}: UseConversationManagerOptions) {
  const defaultId = `conv-${nextConvCounter++}`;
  const [conversations, setConversations] = useState<Map<string, ConversationData>>(
    () => new Map([[defaultId, createConversationData(defaultId, '自由对话', undefined, agentProvider)]]),
  );
  const [activeConvId, setActiveConvId] = useState(defaultId);
  const conversationsRef = useRef(conversations);
  const activeConvIdRef = useRef(activeConvId);
  const artifactFileRef = useRef(onArtifactFile);
  const openCodePathRef = useRef(openCodePath);
  const openCodeModelRef = useRef(openCodeModel);
  const handlersRef = useRef(new Map<string, ReturnType<typeof createClaudeStreamHandler> | ReturnType<typeof createOpenCodeStreamHandler>>());
  const eventQueueRef = useRef(new Map<string, AgentEvent[]>());
  const eventFrameRef = useRef<number | null>(null);
  const silencedRunIdsRef = useRef(new Set<string>());
  const pendingStartTokensRef = useRef(new Map<string, symbol>());
  // 选区注入暂存触发通知：每次 onAgentExit 让 active 从 running 退出且 conv 上有待投递的
  // pendingInjection，bump 一次让 ConversationPanel 显示"已停下"提示。
  const [injectionReadyTick, setInjectionReadyTick] = useState(0);
  // 最近一次投递的 convId（用于面板按 convId 监听）
  const [injectionReadyConvId, setInjectionReadyConvId] = useState<string | null>(null);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    artifactFileRef.current = onArtifactFile;
  }, [onArtifactFile]);
  useEffect(() => {
    openCodePathRef.current = openCodePath;
  }, [openCodePath]);
  useEffect(() => {
    openCodeModelRef.current = openCodeModel;
  }, [openCodeModel]);

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  const updateConv = useCallback((convId: string, patch: Partial<ConversationData>) => {
    const current = conversationsRef.current.get(convId);
    if (!current) return;
    const next = new Map(conversationsRef.current);
    next.set(convId, { ...current, ...patch });
    conversationsRef.current = next;
    setConversations(next);
  }, []);

  const cwd = useMemo(() => outputCwdForConversation(workspaceRoot, activeConvId), [workspaceRoot, activeConvId]);
  const extraAllowedDirs = useMemo(() => (workspaceRoot ? [workspaceRoot] : undefined), [workspaceRoot]);

  const appendAssistantEvent = useCallback((convId: string, event: AgentEvent) => {
    if (event.type === 'artifact_file') {
      const eventCwd = outputCwdForConversation(workspaceRoot, convId);
      const artifactPath = isAbsolutePath(event.path) || !eventCwd ? event.path : joinPath(eventCwd, event.path);
      artifactFileRef.current?.({ path: artifactPath, content: event.content, toolName: event.toolName });
      return;
    }
    // status 事件携带 claude 进程实际跑的模型 → 落到 ConversationData,Composer 显示
    if (event.type === 'status' && event.model && typeof event.model === 'string') {
      const conv = conversationsRef.current.get(convId);
      if (conv && conv.currentModel !== event.model) {
        updateConv(convId, { currentModel: event.model });
      }
    }
    const nextMessages = appendEventToMessages(conversationsRef.current.get(convId)?.messages ?? [], event);
    const conv = conversationsRef.current.get(convId);
    const patch: Partial<ConversationData> = { messages: nextMessages };
    // P0-4 / P0-8: 模型输出未闭合 <question-form → 提前切到 waitingForUser,挡住 Composer 抢答
    if (event.type === 'text_delta') {
      const lastAssistant = [...nextMessages].reverse().find((m) => m.role === 'assistant');
      const lastContent = lastAssistant && lastAssistant.role === 'assistant' ? lastAssistant.content : '';
      const validation = validateArtifactOutput(lastContent, conv);
      if (!validation.ok && conv && conv.runState === 'running') {
        patch.runState = 'waitingForUser';
      }
    }
    updateConv(convId, patch);
  }, [updateConv, workspaceRoot]);

  const flushQueuedEvents = useCallback(() => {
    eventFrameRef.current = null;
    const queued = eventQueueRef.current;
    eventQueueRef.current = new Map();
    queued.forEach((events, convId) => {
      const current = conversationsRef.current.get(convId)?.messages ?? [];
      const messages = events.reduce(appendEventToMessages, current);
      const conv = conversationsRef.current.get(convId);
      const patch: Partial<ConversationData> = { messages };
      // P0-4 / P0-8: 批量 flush 后也检查最后一条 assistant 是否开了未闭合 <question-form
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      const lastContent = lastAssistant && lastAssistant.role === 'assistant' ? lastAssistant.content : '';
      const validation = validateArtifactOutput(lastContent, conv);
      if (!validation.ok && conv && conv.runState === 'running') {
        patch.runState = 'waitingForUser';
      }
      updateConv(convId, patch);
    });
  }, [updateConv]);

  const queueAssistantEvent = useCallback((convId: string, event: AgentEvent) => {
    // status 事件携带模型/session 元数据,必须立即走 appendAssistantEvent 走 currentModel 更新分支,
    // 否则进 rAF 队列 → flushQueuedEvents 只 reduce 进 messages(appendEventToMessages 不处理 status)→
    // 模型名永远 null,Composer/Header 显示"默认模型"。
    if (
      event.type === 'artifact_file' ||
      event.type === 'error' ||
      event.type === 'fabricated_role_marker' ||
      event.type === 'status'
    ) {
      appendAssistantEvent(convId, event);
      return;
    }
    const events = eventQueueRef.current.get(convId) ?? [];
    events.push(event);
    eventQueueRef.current.set(convId, events);
    if (eventFrameRef.current !== null) return;
    eventFrameRef.current = window.requestAnimationFrame(flushQueuedEvents);
  }, [appendAssistantEvent, flushQueuedEvents]);

  // Global listeners — set up once, route by payload.conversationId
  useEffect(() => {
    let cancelled = false;
    let unlistenStdout: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    void onAgentStdout((payload) => {
      const convId = payload.conversationId;
      if (silencedRunIdsRef.current.has(payload.runId) || conversationsRef.current.get(convId)?.cancelRequested) {
        return;
      }
      let handler = handlersRef.current.get(convId);
      if (!handler) {
        const provider = conversationsRef.current.get(convId)?.provider ?? DEFAULT_AGENT_PROVIDER;
        handler = createProviderStreamHandler(provider, (event) => queueAssistantEvent(convId, event));
        handlersRef.current.set(convId, handler);
      }
      handler.feed(`${payload.line}\n`);
    }).then((unlisten) => {
      if (cancelled) unlisten(); else unlistenStdout = unlisten;
    });

    void onAgentExit((payload) => {
      const convId = payload.conversationId;
      silencedRunIdsRef.current.delete(payload.runId);
      const conv = conversationsRef.current.get(convId);
      // Cancel 后允许立刻重发；旧 run 的退出事件不能清理新 run。
      if (!conv || conv.runId !== payload.runId) return;
      const handler = handlersRef.current.get(convId);
      handler?.flush();
      if (eventFrameRef.current !== null) {
        window.cancelAnimationFrame(eventFrameRef.current);
        eventFrameRef.current = null;
      }
      flushQueuedEvents();
      handlersRef.current.delete(convId);
      const wasActive = conv.runState === 'running';
      const wasCancelled = payload.cancelled || conv.cancelRequested;
      const patch: Partial<ConversationData> = {
        runState: payload.exitCode === 0 || wasCancelled ? 'idle' : 'error',
        cancelRequested: false,
      };
      if (payload.exitCode !== 0 && !wasCancelled) {
        const provider = conv.provider ?? DEFAULT_AGENT_PROVIDER;
        const diagnostic = provider === 'claude'
          ? claudeFailureDiagnostic({ agentId: 'claude', exitCode: payload.exitCode, stderrTail: payload.stderrTail })
          : openCodeFailureDiagnostic({
            exitCode: payload.exitCode,
            stderrTail: payload.stderrTail,
            agentPath: openCodePathRef.current,
            model: openCodeModelRef.current,
          });
        patch.lastError = formatAgentDiagnostic(diagnostic, payload.stderrTail || `${getAgentProviderConfig(provider).label} 执行失败。`);
        updateConv(convId, patch);
        appendAssistantEvent(convId, { type: 'error', message: patch.lastError });
      } else {
        // 成功/取消：清掉残留的错误信息
        updateConv(convId, { ...patch, lastError: '' });
      }
      // 若该 conv 刚退出 running 且有待投递的选区注入，bump 通知让面板去取
      if (wasActive && patch.runState === 'idle') {
        const updated = conversationsRef.current.get(convId);
        if (updated?.pendingInjection) {
          setInjectionReadyConvId(convId);
          setInjectionReadyTick((tick) => tick + 1);
        }
      }
    }).then((unlisten) => {
      if (cancelled) unlisten(); else unlistenExit = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenStdout?.();
      unlistenExit?.();
      if (eventFrameRef.current !== null) {
        window.cancelAnimationFrame(eventFrameRef.current);
        eventFrameRef.current = null;
      }
      eventQueueRef.current.clear();
      silencedRunIdsRef.current.clear();
      for (const handler of handlersRef.current.values()) handler.flush();
      handlersRef.current.clear();
    };
  }, [appendAssistantEvent, flushQueuedEvents, queueAssistantEvent, updateConv]);

  // send(prompt, opts?):opts.conversationId 显式指定目标 conv;省略则用当前 active。
  // 用途:刚 createConversation 后立即发送(activeConvIdRef 异步更新会撞 stale)。
  const send = useCallback(async (
    prompt: string,
    opts?: {
      conversationId?: string;
      currentFileContextPath?: string;
      referencePaths?: string[];
      /** true 表示这是 question-form 答案,允许在 mid-turn 提交(模型正在 streaming 但已检测到未闭合 form) */
      toolAnswer?: boolean;
    },
  ) => {
    const convId = opts?.conversationId ?? activeConvIdRef.current;
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const conv = conversationsRef.current.get(convId);
    if (!conv) return;
    if (conv.runState === 'running') return;
    // P0-5 mid-turn 保护:模型已检测到未闭合 <question-form> (runState=waitingForUser) 时,
    // 普通 send 阻挡,只允许 toolAnswer: true 的 form 提交。
    if (!opts?.toolAnswer && conv.runState === 'waitingForUser') return;
    // 首条消息且仍是默认标题 → 用首句自动命名（skill 会话/已手动改名的不动）
    const nextTitle = conv.messages.length === 0 && conv.title === '自由对话'
      ? summarizeTitle(trimmed)
      : conv.title;
    updateConv(convId, {
      title: nextTitle,
      lastError: '',
      runState: 'running',
      cancelRequested: false,
      messages: [
        ...conv.messages,
        { id: `user-${Date.now()}`, role: 'user', content: trimmed, createdAt: Date.now(), selectionAnchor: conv.lastDeliveredAnchor },
        { id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`, role: 'assistant', content: '', thinking: '', tools: [], createdAt: Date.now() },
      ],
      lastDeliveredAnchor: undefined,
    });
    const provider = conv.provider ?? DEFAULT_AGENT_PROVIDER;
    const runtime = providerRuntimeOptions(provider, { claudePath, claudeModel, openCodePath, openCodeModel, pluginDirs });
    const runCwd = outputCwdForConversation(workspaceRoot, convId);
    const handler = createProviderStreamHandler(provider, (event) => queueAssistantEvent(convId, event));
    handlersRef.current.set(convId, handler);
    const appLocale: AppLocale = getSettings().locale;
    const request = {
      provider,
      conversationId: convId,
      prompt: withArtifactWriteGuard(trimmed, runCwd, appLocale),
      cwd: runCwd,
      agentPath: runtime.agentPath,
      model: runtime.model,
      pluginDirs: runtime.pluginDirs,
      extraAllowedDirs,
      promptContextPaths: opts?.referencePaths,
      commandName: provider === 'opencode' ? conv.skillRef : undefined,
    };
    const startToken = Symbol();
    pendingStartTokensRef.current.set(convId, startToken);
    try {
      // 首轮 start（Rust 建新 session-id）；后续 resume（Rust 按 conversationId 复用 uuid + --resume），保多轮上下文延续
      const result = conv.sessionStarted
        ? await resumeAgentSession(request)
        : await startAgentSession(request);
      if (pendingStartTokensRef.current.get(convId) !== startToken) {
        silencedRunIdsRef.current.add(result.runId);
        void cancelAgentSession(result.runId).catch((error) => {
          console.warn('Failed to cancel superseded agent session:', error);
        });
        return;
      }
      pendingStartTokensRef.current.delete(convId);
      // 同一路径的当前文档不重复注入；切换到新文档后由 Composer 传入新路径并更新这里。
      updateConv(convId, {
        sessionStarted: true,
        runId: result.runId,
        fileContextInjected: true,
        ...(opts?.currentFileContextPath ? { currentFileContextPath: opts.currentFileContextPath } : {}),
      });
    } catch (error) {
      if (pendingStartTokensRef.current.get(convId) !== startToken) return;
      pendingStartTokensRef.current.delete(convId);
      const message = String(error);
      const diagnostic = provider === 'opencode'
        ? openCodeFailureDiagnostic({
          error: message,
          agentPath: runtime.agentPath,
          model: runtime.model,
        })
        : null;
      const displayMessage = formatAgentDiagnostic(diagnostic, message);
      updateConv(convId, { runState: 'error', lastError: displayMessage });
      appendAssistantEvent(convId, { type: 'error', message: displayMessage });
    }
  }, [appendAssistantEvent, claudeModel, claudePath, extraAllowedDirs, openCodeModel, openCodePath, pluginDirs, queueAssistantEvent, updateConv, workspaceRoot]);

  // cancel —— 无条件兜底版。
  // 立刻置 idle + 强制杀进程(taskkill /T /F,由后端 agent_session_cancel 处理),
  // 不依赖 onAgentExit 汇入；旧 run 退出只做自身清理，不能覆盖后续重发。
  const cancel = useCallback(async () => {
    const convId = activeConvIdRef.current;
    const conv = conversationsRef.current.get(convId);
    if (!conv || (conv.runState !== 'running' && conv.runState !== 'waitingForUser')) return;
    pendingStartTokensRef.current.delete(convId);
    const handler = handlersRef.current.get(convId);
    handler?.flush();
    handlersRef.current.delete(convId);
    if (conv.runId) silencedRunIdsRef.current.add(conv.runId);
    if (conv.runId) {
      void cancelAgentSession(conv.runId).catch((error) => {
        console.warn('Failed to cancel agent session:', error);
      });
    }
    // 立刻恢复 UI 输入；清 runId 让旧 exit 不能命中新 run。
    updateConv(convId, { runState: 'idle', runId: undefined, cancelRequested: false, lastError: '' });
  }, [updateConv]);

  const reset = useCallback(() => {
    const convId = activeConvIdRef.current;
    const handler = handlersRef.current.get(convId);
    handler?.flush();
    handlersRef.current.delete(convId);
    updateConv(convId, {
      messages: [],
      runState: 'idle',
      lastError: '',
      sessionStarted: false,
      cancelRequested: false,
      pendingInjection: undefined,
      lastDeliveredAnchor: undefined,
      currentFileContextPath: undefined,
    });
  }, [updateConv]);

  // 选区注入：写到 conv.pendingInjection 上。running 期间面板靠 injectionReadyTick 监听取出。
  const queueInjection = useCallback((convId: string, text: string, anchor: SelectionAnchor) => {
    const injection: PendingInjection = { text, anchor, queuedAt: Date.now() };
    updateConv(convId, { pendingInjection: injection });
    // 如果当前 idle 状态（无 running），直接 bump 让面板取
    const conv = conversationsRef.current.get(convId);
    if (conv && conv.runState !== 'running') {
      setInjectionReadyConvId(convId);
      setInjectionReadyTick((tick) => tick + 1);
    }
  }, [updateConv]);

  const consumePendingInjection = useCallback((convId: string): PendingInjection | undefined => {
    const conv = conversationsRef.current.get(convId);
    const pending = conv?.pendingInjection;
    if (pending) {
      updateConv(convId, { pendingInjection: undefined, lastDeliveredAnchor: pending.anchor });
    }
    return pending;
  }, [updateConv]);

  const createConversation = useCallback((title = '自由对话', skillRef?: string, provider: AgentProvider = agentProvider) => {
    const id = `conv-${nextConvCounter++}`;
    const conv = createConversationData(id, title, skillRef, provider);
    setConversations((prev) => {
      const next = new Map(prev);
      next.set(id, conv);
      // 同步刷 ref,避免后续紧跟的 send(opts.conversationId=id) 撞 stale
      conversationsRef.current = next;
      return next;
    });
    setActiveConvId(id);
    activeConvIdRef.current = id;
    return id;
  }, [agentProvider]);

  const switchProvider = useCallback((provider: AgentProvider) => {
    const active = conversationsRef.current.get(activeConvIdRef.current);
    if (active?.provider === provider) return active.id;
    if (active) {
      const handler = handlersRef.current.get(active.id);
      handler?.flush();
      handlersRef.current.delete(active.id);
      if (active.runId && active.cancelRequested) silencedRunIdsRef.current.add(active.runId);
    }
    const id = `conv-${nextConvCounter++}`;
    const conv = createConversationData(id, `${getAgentProviderConfig(provider).label} 对话`, undefined, provider);
    setConversations((prev) => {
      const next = new Map(prev);
      next.set(id, conv);
      conversationsRef.current = next;
      return next;
    });
    setActiveConvId(id);
    activeConvIdRef.current = id;
    return id;
  }, []);

  const switchConversation = useCallback((id: string) => {
    if (conversationsRef.current.has(id)) setActiveConvId(id);
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (trimmed) updateConv(id, { title: trimmed });
  }, [updateConv]);

  const closeConversation = useCallback((id: string) => {
    // Flush handler
    const handler = handlersRef.current.get(id);
    handler?.flush();
    handlersRef.current.delete(id);
    // Cancel run if active
    const conv = conversationsRef.current.get(id);
    if (conv && (conv.runState === 'running' || conv.runState === 'waitingForUser') && conv.runId) {
      void cancelAgentSession(conv.runId);
    }
    setConversations((prev) => {
      const next = new Map(prev);
      next.delete(id);
      if (next.size === 0) {
        const fallback = createConversationData(`conv-${nextConvCounter++}`, '自由对话', undefined, agentProvider);
        next.set(fallback.id, fallback);
        setActiveConvId(fallback.id);
      } else if (id === activeConvIdRef.current) {
        const first = next.keys().next().value!;
        setActiveConvId(first);
      }
      return next;
    });
  }, [agentProvider]);

  const activeConv = conversations.get(activeConvId);

  return {
    conversations,
    activeConvId,
    activeConv,
    activeProvider: activeConv?.provider ?? agentProvider,
    // Per-active-conv state (for ConversationPanel backward compat)
    messages: activeConv?.messages ?? [],
    runState: activeConv?.runState ?? 'idle',
    lastError: activeConv?.lastError ?? '',
    // Actions
    send,
    cancel,
    reset,
    createConversation,
    switchProvider,
    switchConversation,
    renameConversation,
    closeConversation,
    setActiveConvId,
    updateConv,
    cwd,
    extraAllowedDirs,
    // 选区注入暂存
    queueInjection,
    consumePendingInjection,
    injectionReadyTick,
    injectionReadyConvId,
  };
}
