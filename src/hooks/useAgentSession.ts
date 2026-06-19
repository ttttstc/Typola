import { useCallback, useEffect, useRef, useState } from 'react';
import { diagnoseClaudeCliFailure } from '../services/agent/claudeDiagnostics';
import { createClaudeStreamHandler } from '../services/agent/claudeStream';
import {
  cancelAgentSession,
  onAgentExit,
  onAgentStall,
  onAgentStdout,
  resumeAgentSession,
  startAgentSession,
} from '../services/agent/headlessService';
import type { AgentEvent, AgentMessage, AgentRunState, AgentToolCall } from '../services/agent/types';

type UseAgentSessionOptions = {
  conversationId: string;
  cwd?: string;
  agentPath?: string;
  model?: string;
  pluginDirs?: string[];
  extraAllowedDirs?: string[];
  onArtifactFile?: (artifact: { path: string; content?: string; toolName: string }) => void;
};

function createAssistantMessage(): AgentMessage & { role: 'assistant' } {
  return {
    id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: 'assistant',
    content: '',
    thinking: '',
    tools: [],
    createdAt: Date.now(),
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

export function useAgentSession({
  conversationId,
  cwd,
  agentPath,
  model,
  pluginDirs,
  extraAllowedDirs,
  onArtifactFile,
}: UseAgentSessionOptions) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [runState, setRunState] = useState<AgentRunState>('idle');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string>('');
  const sessionStartedRef = useRef(false);
  const activeRunIdRef = useRef<string | null>(null);
  const handlerRef = useRef<ReturnType<typeof createClaudeStreamHandler> | null>(null);
  const cwdRef = useRef(cwd);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  const reset = useCallback(() => {
    handlerRef.current?.flush();
    handlerRef.current = null;
    sessionStartedRef.current = false;
    activeRunIdRef.current = null;
    setActiveRunId(null);
    setMessages([]);
    setRunState('idle');
    setLastError('');
  }, []);

  useEffect(() => {
    if (cwdRef.current === cwd) return;
    const runId = activeRunIdRef.current;
    if (runId) {
      void cancelAgentSession(runId).catch((error) => {
        console.warn('Failed to cancel agent session after cwd change:', error);
      });
    }
    cwdRef.current = cwd;
    reset();
  }, [cwd, reset]);

  const appendAssistantEvent = useCallback((event: AgentEvent) => {
    if (event.type === 'artifact_file') {
      onArtifactFile?.({
        path: event.path,
        content: event.content,
        toolName: event.toolName,
      });
      return;
    }
    setMessages((current) => {
      const last = current[current.length - 1];
      const assistant = last?.role === 'assistant' ? last : createAssistantMessage();
      const base = last?.role === 'assistant' ? current.slice(0, -1) : current;
      let next = assistant;

      if (event.type === 'text_delta') {
        next = { ...assistant, content: assistant.content + event.delta };
      } else if (event.type === 'thinking_delta') {
        next = { ...assistant, thinking: assistant.thinking + event.delta };
      } else if (event.type === 'tool_use') {
        next = {
          ...assistant,
          tools: upsertTool(assistant.tools, {
            id: toolId(event.id),
            name: toolName(event.name),
            input: event.input,
          }),
        };
      } else if (event.type === 'tool_input_delta') {
        const id = toolId(event.id);
        const previous = assistant.tools.find((tool) => tool.id === id);
        next = {
          ...assistant,
          tools: upsertTool(assistant.tools, {
            id,
            name: toolName(event.name),
            inputDelta: `${previous?.inputDelta ?? ''}${event.delta}`,
          }),
        };
      } else if (event.type === 'tool_result') {
        const id = toolId(event.toolUseId);
        const previous = assistant.tools.find((tool) => tool.id === id);
        next = {
          ...assistant,
          tools: upsertTool(assistant.tools, {
            id,
            name: previous?.name ?? 'Tool',
            result: event.content,
            isError: event.isError,
          }),
        };
      } else if (event.type === 'usage') {
        next = {
          ...assistant,
          done: true,
          usage: {
            usage: event.usage,
            costUsd: event.costUsd,
            durationMs: event.durationMs,
            stopReason: event.stopReason,
          },
        };
      } else if (event.type === 'error' || event.type === 'fabricated_role_marker') {
        next = {
          ...assistant,
          error: event.type === 'error' ? event.message : `检测到可疑角色标记：${event.marker}`,
        };
      }

      return [...base, next];
    });
  }, [onArtifactFile]);

  useEffect(() => {
    let cancelled = false;
    let unlistenStdout: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    let unlistenStall: (() => void) | undefined;

    void onAgentStdout((payload) => {
      if (payload.runId !== activeRunIdRef.current) return;
      if (!handlerRef.current) {
        handlerRef.current = createClaudeStreamHandler((event) => appendAssistantEvent(event as AgentEvent));
      }
      handlerRef.current.feed(`${payload.line}\n`);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenStdout = unlisten;
    });

    void onAgentExit((payload) => {
      if (payload.runId !== activeRunIdRef.current) return;
      handlerRef.current?.flush();
      handlerRef.current = null;
      setActiveRunId(null);
      setRunState(payload.exitCode === 0 || payload.cancelled ? 'idle' : 'error');
      if (payload.exitCode !== 0 && !payload.cancelled) {
        const diagnostic = diagnoseClaudeCliFailure({
          agentId: 'claude',
          exitCode: payload.exitCode,
          stderrTail: payload.stderrTail,
        });
        const message = diagnostic?.detail || payload.stderrTail || 'Claude 执行失败。';
        setLastError(message);
        appendAssistantEvent({ type: 'error', message });
      }
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenExit = unlisten;
    });

    void onAgentStall((payload) => {
      if (payload.runId !== activeRunIdRef.current) return;
      setRunState('stalled');
      setLastError(`Claude 已 ${Math.round(payload.idleMs / 1000)} 秒没有输出。`);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenStall = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenStdout?.();
      unlistenExit?.();
      unlistenStall?.();
    };
  }, [appendAssistantEvent]);

  const send = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || activeRunIdRef.current) return;
    setLastError('');
    setRunState('running');
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: trimmed, createdAt: Date.now() },
      createAssistantMessage(),
    ]);
    handlerRef.current = createClaudeStreamHandler((event) => appendAssistantEvent(event as AgentEvent));
    try {
      const request = { conversationId, prompt: trimmed, cwd, agentPath, model, pluginDirs, extraAllowedDirs };
      const result = sessionStartedRef.current
        ? await resumeAgentSession(request)
        : await startAgentSession(request);
      sessionStartedRef.current = true;
      setActiveRunId(result.runId);
    } catch (error) {
      const message = String(error);
      setRunState('error');
      setLastError(message);
      appendAssistantEvent({ type: 'error', message });
    }
  }, [agentPath, appendAssistantEvent, conversationId, cwd, extraAllowedDirs, model, pluginDirs]);

  const cancel = useCallback(async () => {
    const runId = activeRunIdRef.current;
    if (!runId) return;
    await cancelAgentSession(runId).catch((error) => {
      console.warn('Failed to cancel agent session:', error);
    });
  }, []);

  return { messages, runState, lastError, send, cancel, reset, activeRunId };
}
