import { beforeEach, describe, expect, it } from 'vitest';
import {
  createConversationData,
  loadConversationStore,
  saveConversationStore,
} from './conversationStore';

describe('conversationStore 持久化', () => {
  beforeEach(() => localStorage.clear());

  it('恢复当前对话、消息和 Provider 原生 Session', () => {
    const conversation = {
      ...createConversationData('conv-7', '文档改稿', undefined, 'opencode'),
      messages: [{ id: 'u1', role: 'user' as const, content: '继续精炼', createdAt: 1 }],
      runState: 'running' as const,
      sessionStarted: true,
      sessionUuid: 'session-7',
      currentFileContextPath: 'D:/docs/a.md',
    };
    saveConversationStore({
      conversations: new Map([[conversation.id, conversation]]),
      activeConvId: conversation.id,
    });

    const restored = loadConversationStore('claude');

    expect(restored?.activeConvId).toBe('conv-7');
    expect(restored?.conversations.get('conv-7')).toMatchObject({
      provider: 'opencode',
      messages: conversation.messages,
      runState: 'idle',
      sessionStarted: true,
      sessionUuid: 'session-7',
      currentFileContextPath: 'D:/docs/a.md',
    });
  });

  it('损坏数据不会阻断启动', () => {
    localStorage.setItem('typola.conversations.v1', '{broken');
    expect(loadConversationStore('claude')).toBeNull();
  });
});
