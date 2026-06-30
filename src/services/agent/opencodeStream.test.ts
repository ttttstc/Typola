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

  it('maps real OpenCode json text and step_finish events', () => {
    const events: AgentEvent[] = [];
    const handler = createOpenCodeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({
      type: 'text',
      sessionID: 'ses_10c664a7affepqcABzQGr51nxk',
      part: { type: 'text', text: 'ok' },
    }) + '\n');
    handler.feed(JSON.stringify({
      type: 'step_finish',
      sessionID: 'ses_10c664a7affepqcABzQGr51nxk',
      part: {
        type: 'step-finish',
        reason: 'stop',
        tokens: { total: 11813, input: 11801, output: 2, reasoning: 10 },
        cost: 0,
      },
    }) + '\n');
    handler.flush();

    expect(events).toEqual([
      { type: 'text_delta', delta: 'ok' },
      {
        type: 'usage',
        usage: { total: 11813, input: 11801, output: 2, reasoning: 10 },
        costUsd: 0,
        durationMs: undefined,
        stopReason: 'stop',
      },
    ]);
  });

  it('maps real OpenCode tool_use events to tool cards and results', () => {
    const events: AgentEvent[] = [];
    const handler = createOpenCodeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({
      type: 'tool_use',
      sessionID: 'ses_10c664a7affepqcABzQGr51nxk',
      part: {
        type: 'tool',
        callID: 'toolu_123',
        tool: 'read',
        state: {
          status: 'completed',
          input: { filePath: 'README.md' },
          output: 'file contents',
        },
      },
    }) + '\n');
    handler.flush();

    expect(events).toEqual([
      { type: 'tool_use', id: 'toolu_123', name: 'Read', input: { filePath: 'README.md' } },
      { type: 'tool_result', toolUseId: 'toolu_123', content: 'file contents', isError: false },
    ]);
  });

  it('emits artifact_file before tool cards for OpenCode file writes', () => {
    const events: AgentEvent[] = [];
    const handler = createOpenCodeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({
      type: 'tool_use',
      part: {
        type: 'tool',
        callID: 'toolu_write_1',
        tool: 'write',
        state: {
          status: 'completed',
          input: {
            filePath: 'draft.md',
            content: '# Draft\n',
          },
          output: 'created draft.md',
        },
      },
    }) + '\n');
    handler.flush();

    expect(events).toEqual([
      { type: 'artifact_file', path: 'draft.md', content: '# Draft\n', toolName: 'Write' },
      { type: 'tool_use', id: 'toolu_write_1', name: 'Write', input: { filePath: 'draft.md', content: '# Draft\n' } },
      { type: 'tool_result', toolUseId: 'toolu_write_1', content: 'created draft.md', isError: false },
    ]);
  });

  it('maps OpenCode reasoning-like json fields to thinking deltas when present', () => {
    const events: AgentEvent[] = [];
    const handler = createOpenCodeStreamHandler((event) => events.push(event));

    handler.feed(JSON.stringify({
      type: 'reasoning',
      part: { type: 'reasoning', text: 'I should inspect the file first.' },
    }) + '\n');
    handler.feed(JSON.stringify({
      type: 'message.part.updated',
      part: { type: 'thinking', text: 'Then summarize the result.' },
    }) + '\n');
    handler.flush();

    expect(events).toEqual([
      { type: 'thinking_delta', delta: 'I should inspect the file first.' },
      { type: 'thinking_delta', delta: 'Then summarize the result.' },
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

  it('does not classify event names by substring matches', () => {
    const events: AgentEvent[] = [];
    const handler = createOpenCodeStreamHandler((event) => events.push(event));

    const lines = [
      { type: 'rendered', content: '不应算完成' },
      { type: 'suspended', content: '不应算完成' },
      { type: 'errorDetails', message: '不应算错误' },
      { type: 'textDocument', content: '不应算正文' },
    ];
    for (const line of lines) {
      handler.feed(JSON.stringify(line) + '\n');
    }
    handler.flush();

    expect(events).toEqual(lines.map((line) => ({ type: 'raw', line: JSON.stringify(line) })));
  });
});
