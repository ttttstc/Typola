import { describe, expect, it } from 'vitest';
import { createOpenCodeStreamHandler } from './opencodeStream';
import type { AgentEvent } from './types';

describe('createOpenCodeStreamHandler', () => {
  it('maps verified JSON text fields to text_delta events', () => {
    const events: AgentEvent[] = [];
    const handler = createOpenCodeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({ type: 'message', role: 'assistant', content: '你好' }) + '\n');
    handler.feed(JSON.stringify({ type: 'assistant', text: '，Typola' }) + '\n');
    handler.flush();

    expect(events).toEqual([
      { type: 'text_delta', delta: '你好' },
      { type: 'text_delta', delta: '，Typola' },
    ]);
  });

  it('maps completion-like events to usage events', () => {
    const events: AgentEvent[] = [];
    const handler = createOpenCodeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({ type: 'done', stopReason: 'end_turn' }) + '\n');
    handler.flush();

    expect(events).toEqual([
      { type: 'usage', usage: undefined, costUsd: undefined, durationMs: undefined, stopReason: 'end_turn' },
    ]);
  });

  it('keeps unknown or invalid lines as raw events', () => {
    const events: AgentEvent[] = [];
    const handler = createOpenCodeStreamHandler((event) => events.push(event));

    handler.feed('not json\n');
    handler.feed(JSON.stringify({ type: 'something_new', payload: { value: 1 } }) + '\n');
    handler.flush();

    expect(events).toEqual([
      { type: 'raw', line: 'not json' },
      { type: 'raw', line: JSON.stringify({ type: 'something_new', payload: { value: 1 } }) },
    ]);
  });
});
