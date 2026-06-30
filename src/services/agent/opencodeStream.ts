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

function readThinkingText(record: Record<string, unknown>): string | undefined {
  const part = asRecord(record.part);
  const delta = asRecord(record.delta);
  const partType = firstString(part?.type);
  if (part && partType && /^(thinking|reasoning)$/u.test(partType)) {
    return firstString(part.text, part.content, part.reasoning, part.reasoning_content, part.reasoningContent);
  }
  return firstString(
    record.reasoning,
    record.reasoning_content,
    record.reasoningContent,
    record.thinking,
    delta?.reasoning,
    delta?.reasoning_content,
    delta?.reasoningContent,
    delta?.thinking,
  );
}

function readStopReason(record: Record<string, unknown>): unknown {
  const part = asRecord(record.part);
  return record.stopReason ?? record.stop_reason ?? record.reason ?? part?.reason ?? 'done';
}

function isTextEventType(type: string): boolean {
  return /^(message|assistant|text|delta|text_delta)$/u.test(type);
}

function isDoneEventType(type: string): boolean {
  return /^(done|complete|finished|end|step_finish|step-finish)$/u.test(type);
}

function isThinkingEventType(type: string): boolean {
  return /^(thinking|reasoning|reasoning_delta|message\.part\.updated)$/u.test(type);
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output === undefined || output === null) return '';
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

const FILE_WRITE_TOOLS = new Set([
  'write',
  'edit',
  'create_file',
  'write_file',
  'replace',
  'str_replace_edit',
]);

function isFileWriteTool(name: string, input: unknown): boolean {
  const record = asRecord(input);
  if (!record) return false;
  const normalized = name.toLowerCase();
  const path = firstString(record.file_path, record.filePath, record.path);
  return FILE_WRITE_TOOLS.has(normalized) && Boolean(path);
}

function fileWritePath(input: unknown): string | undefined {
  const record = asRecord(input);
  return record ? firstString(record.file_path, record.filePath, record.path) : undefined;
}

function fileWriteContent(input: unknown): string | undefined {
  const record = asRecord(input);
  return record ? firstString(record.content, record.new_string) : undefined;
}

function readToolEvent(record: Record<string, unknown>) {
  const part = asRecord(record.part);
  const state = asRecord(part?.state) ?? asRecord(record.state);
  const partType = firstString(part?.type);
  const id = firstString(record.id, record.callID, record.callId, part?.id, part?.callID, part?.callId);
  const name = normalizeToolName(firstString(record.name, record.tool, record.toolName, part?.tool, part?.name, part?.toolName));
  const input = state?.input ?? part?.input ?? record.input;
  const output = state?.output ?? part?.output ?? record.output ?? record.result;
  const status = firstString(state?.status, part?.status, record.status);
  if (!id || !name || (partType && partType !== 'tool' && partType !== 'tool_use')) return null;
  return { id, name, input, output, status };
}

function normalizeToolName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const aliases: Record<string, string> = {
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    bash: 'Bash',
    glob: 'Glob',
    grep: 'Grep',
  };
  return aliases[name.toLowerCase()] ?? name;
}

function isToolEventType(type: string): boolean {
  return /^(tool_use|tool|tool-call|tool_call|message\.part\.updated)$/u.test(type);
}

export function createOpenCodeStreamHandler(onEvent: Emit) {
  let buffer = '';
  const emittedToolResults = new Set<string>();
  const emittedArtifactTools = new Set<string>();

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
    if (type && isToolEventType(type)) {
      const tool = readToolEvent(record);
      if (tool) {
        if (isFileWriteTool(tool.name, tool.input) && !emittedArtifactTools.has(tool.id)) {
          const path = fileWritePath(tool.input);
          if (path) {
            emittedArtifactTools.add(tool.id);
            const content = fileWriteContent(tool.input);
            onEvent({
              type: 'artifact_file',
              path,
              ...(content ? { content } : {}),
              toolName: tool.name,
            });
          }
        }
        onEvent({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input });
        const hasOutput = tool.output !== undefined && tool.output !== null;
        const finished = tool.status
          ? /^(completed|complete|done|success|error|failed|cancelled|canceled)$/u.test(tool.status)
          : hasOutput;
        if (finished && hasOutput && !emittedToolResults.has(tool.id)) {
          emittedToolResults.add(tool.id);
          const isError = /^(error|failed|cancelled|canceled)$/u.test(tool.status ?? '');
          onEvent({
            type: 'tool_result',
            toolUseId: tool.id,
            content: stringifyToolOutput(tool.output),
            isError,
          });
        }
        return;
      }
    }

    const thinkingText = readThinkingText(record);
    if (thinkingText && (!type || isThinkingEventType(type))) {
      onEvent({ type: 'thinking_delta', delta: thinkingText });
      return;
    }

    const text = readAssistantText(record);
    if (text && (!type || isTextEventType(type))) {
      onEvent({ type: 'text_delta', delta: text });
      return;
    }

    if (type && isDoneEventType(type)) {
      const part = asRecord(record.part);
      onEvent({
        type: 'usage',
        usage: record.usage ?? part?.tokens,
        costUsd: record.costUsd ?? record.cost_usd ?? part?.cost,
        durationMs: record.durationMs ?? record.duration_ms,
        stopReason: readStopReason(record),
      });
      return;
    }

    if (type === 'error') {
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
