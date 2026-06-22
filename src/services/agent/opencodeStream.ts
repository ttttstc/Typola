import type { AgentEvent } from './types';

type Emit = (event: AgentEvent) => void;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

function readAssistantText(record: Record<string, unknown>): string | undefined {
  const role = firstString(record.role);
  if (role && role !== 'assistant') return undefined;
  return firstString(
    record.content,
    record.text,
    record.message,
    asRecord(record.delta)?.text,
    asRecord(record.part)?.text,
  );
}

function readStopReason(record: Record<string, unknown>): unknown {
  return record.stopReason ?? record.stop_reason ?? record.reason ?? 'done';
}

export function createOpenCodeStreamHandler(onEvent: Emit) {
  let buffer = '';

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      onEvent({ type: 'raw', line: trimmed });
      return;
    }

    const record = asRecord(parsed);
    if (!record) {
      onEvent({ type: 'raw', line: trimmed });
      return;
    }

    const type = firstString(record.type, record.event);
    const text = readAssistantText(record);
    if (text && (!type || /message|assistant|text|delta/u.test(type))) {
      onEvent({ type: 'text_delta', delta: text });
      return;
    }

    if (type && /done|complete|finish|end/u.test(type)) {
      onEvent({
        type: 'usage',
        usage: record.usage,
        costUsd: record.costUsd ?? record.cost_usd,
        durationMs: record.durationMs ?? record.duration_ms,
        stopReason: readStopReason(record),
      });
      return;
    }

    if (type && /error/u.test(type)) {
      onEvent({ type: 'error', message: firstString(record.message, record.error) ?? trimmed });
      return;
    }

    onEvent({ type: 'raw', line: trimmed });
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    },
    flush() {
      if (buffer) {
        handleLine(buffer);
        buffer = '';
      }
    },
  };
}
