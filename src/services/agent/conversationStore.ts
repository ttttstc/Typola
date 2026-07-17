import type { AgentMessage, AgentRunState, SelectionAnchor } from './types';
import type { AgentProvider } from './provider';
import { DEFAULT_AGENT_PROVIDER, isAgentProvider } from './provider';

const CONVERSATION_STORAGE_KEY = 'typola.conversations.v1';

export type PendingInjection = {
  text: string;
  anchor: SelectionAnchor;
  queuedAt: number;
};

export type ConversationData = {
  id: string;
  title: string;
  provider: AgentProvider;
  skillRef?: string;
  messages: AgentMessage[];
  runState: AgentRunState;
  lastError: string;
  sessionStarted: boolean; // 首轮后置 true → send 改走 resume。
  sessionUuid?: string; // 与 conversationId 一起持久化，应用重启后仍可恢复 Provider 原生 Session。
  runId?: string;
  cancelRequested?: boolean;
  pendingInjection?: PendingInjection;
  // 最近一次投递到 Composer 的选区 anchor。send() 把它附到新 user 消息上,便于后续「替换选区」按钮锚定。
  // 投递后清空，避免干扰后续普通消息。
  lastDeliveredAnchor?: SelectionAnchor;
  // 本会话是否已经把"当前文档"文件路径作为 context 注入过 prompt：首轮注入后置 true,
  // 后续 send 不再重复啰嗦同样的"参考以下文件"。chip 仍然展示供用户参考。
  fileContextInjected?: boolean;
  currentFileContextPath?: string;
  // 当前 AI Provider 进程实际运行的模型(从 headless init/status 事件拿到),
  // Composer 优先显示这个,fallback 才用 settings 里的 provider 模型。
  // 跟着中转/CC Switch 走,跟用户终端 claude 看到的一致。
  currentModel?: string;
  // 已提交的 question-form 答案(messageId+formId → 已提交文本)。
  // 下沉到 conv 持久化层,避免 panel 局部 state 在切换/卸载时丢失。
  submittedQuestionForms?: Record<string, string>;
};

export type ConversationStoreState = {
  conversations: Map<string, ConversationData>;
  activeConvId: string;
};

export function createConversationData(
  id: string,
  title: string,
  skillRef?: string,
  provider: AgentProvider = DEFAULT_AGENT_PROVIDER,
): ConversationData {
  return {
    id,
    title,
    provider,
    skillRef,
    messages: [],
    runState: 'idle',
    lastError: '',
    sessionStarted: false,
  };
}

function restoreMessage(value: unknown): AgentMessage | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Partial<AgentMessage>;
  if (
    typeof message.id !== 'string'
    || typeof message.content !== 'string'
    || typeof message.createdAt !== 'number'
  ) return null;
  if (message.role === 'user') return value as AgentMessage;
  if (message.role !== 'assistant') return null;
  return {
    ...(value as Extract<AgentMessage, { role: 'assistant' }>),
    thinking: typeof message.thinking === 'string' ? message.thinking : '',
    tools: Array.isArray(message.tools) ? message.tools : [],
  };
}

function restoreConversation(value: unknown, fallbackProvider: AgentProvider): ConversationData | null {
  if (!value || typeof value !== 'object') return null;
  const stored = value as Partial<ConversationData>;
  if (typeof stored.id !== 'string' || typeof stored.title !== 'string') return null;
  const sessionUuid = typeof stored.sessionUuid === 'string' && stored.sessionUuid.trim()
    ? stored.sessionUuid
    : undefined;
  const restored: ConversationData = {
    ...createConversationData(
      stored.id,
      stored.title,
      typeof stored.skillRef === 'string' ? stored.skillRef : undefined,
      isAgentProvider(stored.provider) ? stored.provider : fallbackProvider,
    ),
    messages: Array.isArray(stored.messages)
      ? stored.messages.map(restoreMessage).filter((message): message is AgentMessage => message !== null)
      : [],
    sessionStarted: stored.sessionStarted === true && Boolean(sessionUuid),
    ...(sessionUuid ? { sessionUuid } : {}),
    ...(stored.fileContextInjected === true ? { fileContextInjected: true } : {}),
    ...(typeof stored.currentFileContextPath === 'string' ? { currentFileContextPath: stored.currentFileContextPath } : {}),
    ...(typeof stored.currentModel === 'string' ? { currentModel: stored.currentModel } : {}),
    ...(stored.submittedQuestionForms && typeof stored.submittedQuestionForms === 'object'
      ? { submittedQuestionForms: stored.submittedQuestionForms }
      : {}),
  };
  return restored;
}

export function loadConversationStore(fallbackProvider: AgentProvider): ConversationStoreState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const stored = value as { version?: unknown; activeConvId?: unknown; conversations?: unknown };
    if (stored.version !== 1 || !Array.isArray(stored.conversations)) return null;
    const conversations = new Map<string, ConversationData>();
    for (const item of stored.conversations) {
      const conversation = restoreConversation(item, fallbackProvider);
      if (conversation) conversations.set(conversation.id, conversation);
    }
    if (conversations.size === 0) return null;
    const activeConvId = typeof stored.activeConvId === 'string' && conversations.has(stored.activeConvId)
      ? stored.activeConvId
      : conversations.keys().next().value as string;
    return { conversations, activeConvId };
  } catch {
    return null;
  }
}

export function saveConversationStore(state: ConversationStoreState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const conversations = [...state.conversations.values()].map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      provider: conversation.provider,
      ...(conversation.skillRef ? { skillRef: conversation.skillRef } : {}),
      messages: conversation.messages,
      sessionStarted: conversation.sessionStarted,
      ...(conversation.sessionUuid ? { sessionUuid: conversation.sessionUuid } : {}),
      ...(conversation.fileContextInjected ? { fileContextInjected: true } : {}),
      ...(conversation.currentFileContextPath ? { currentFileContextPath: conversation.currentFileContextPath } : {}),
      ...(conversation.currentModel ? { currentModel: conversation.currentModel } : {}),
      ...(conversation.submittedQuestionForms ? { submittedQuestionForms: conversation.submittedQuestionForms } : {}),
    }));
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
      version: 1,
      activeConvId: state.activeConvId,
      conversations,
    }));
  } catch {
    // localStorage 不可用或容量不足时，不阻断当前会话。
  }
}
