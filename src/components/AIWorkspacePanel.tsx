import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, FolderOpen, Play, RotateCcw, Square, X } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import {
  clearAgentSession,
  createAgentRun,
  detectAgent,
  onAgentEvent,
  stableHash,
  stopAgentRun,
  type AgentEventPayload,
} from '../services/agentService';

type AIWorkspacePanelProps = {
  visible: boolean;
  currentFilePath: string;
  currentFileName: string;
  currentContent: string;
  readOnly: boolean;
  width: number;
  onClose: () => void;
};

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : '';
}

function conversationIdFor(path: string, name: string): string {
  const base = path.trim() || `untitled:${name}`;
  return `document:${stableHash(base.toLowerCase())}`;
}

function defaultPrompt(fileName: string): string {
  return `请基于当前文档《${fileName}》进行专业润色，保留原有 Markdown 结构，提升表达清晰度、逻辑连贯性和可读性。请只输出完整修改后的 Markdown。`;
}

function buildPrompt(userPrompt: string, content: string, fileName: string, filePath: string): string {
  return [
    '你是 Typola 内置的一站式文档工作台助手。',
    '默认只在 Typola 左侧工作台输出结果；只有当用户明确要求你修改当前文件或工作目录文件时，才可以使用 Claude Code 的文件工具写入磁盘。',
    '如果用户要求输出完整文档，请输出 Markdown 原文，不要包裹额外解释。',
    '',
    `当前文件名：${fileName}`,
    `当前文件路径：${filePath || '未保存文件，尚无磁盘路径'}`,
    '',
    '用户任务：',
    userPrompt.trim(),
    '',
    '当前文档内容：',
    '```markdown',
    content,
    '```',
  ].join('\n');
}

export function AIWorkspacePanel({
  visible,
  currentFilePath,
  currentFileName,
  currentContent,
  readOnly,
  width,
  onClose,
}: AIWorkspacePanelProps) {
  const settings = useSettings();
  const conversationId = useMemo(
    () => conversationIdFor(currentFilePath, currentFileName),
    [currentFileName, currentFilePath],
  );
  const defaultCwd = useMemo(() => dirname(currentFilePath), [currentFilePath]);
  const [cwd, setCwd] = useState(defaultCwd);
  const [prompt, setPrompt] = useState(() => defaultPrompt(currentFileName));
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [status, setStatus] = useState('就绪');
  const [output, setOutput] = useState('');
  const [logOutput, setLogOutput] = useState('');
  const outputRef = useRef<HTMLPreElement>(null);
  const outputValueRef = useRef('');
  const runIdRef = useRef('');
  const runningRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setCwd((current) => current || defaultCwd);
  }, [defaultCwd, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    let unlisten: (() => void) | undefined;

    void onAgentEvent((payload: AgentEventPayload) => {
      if (!active) return;
      const expectedRunId = runIdRef.current;
      if (expectedRunId && payload.runId !== expectedRunId) return;
      if (!expectedRunId) {
        if (!runningRef.current) return;
        runIdRef.current = payload.runId;
        setRunId(payload.runId);
      }
      if (payload.eventType === 'text_delta' && payload.text) {
        setOutput((current) => {
          const next = `${current}${payload.text}`;
          outputValueRef.current = next;
          return next;
        });
      }
      if (payload.eventType === 'stdout' && payload.text) {
        setLogOutput((current) => `${current}${payload.text}`);
      }
      if (payload.eventType === 'stderr' && payload.text) {
        setLogOutput((current) => `${current}${payload.text}`);
      }
      if (payload.eventType === 'error') {
        setLogOutput((current) => `${current}${payload.text || payload.message || 'Claude CLI error'}\n`);
      }
      if (payload.eventType === 'status' && payload.status) {
        setStatus(payload.status);
      }
      if (payload.eventType === 'status' && payload.text) {
        setStatus(payload.text);
      }
      if (payload.eventType === 'exit') {
        setRunning(false);
        runningRef.current = false;
        setStatus(payload.code === 0 ? '完成' : `已退出（${payload.code ?? 'unknown'}）`);
      }
    }).then((listener) => {
      if (active) unlisten = listener;
      else listener();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [visible]);

  useEffect(() => {
    if (!outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  if (!visible) return null;

  const handleRun = async () => {
    if (!prompt.trim() || running) return;
    setOutput('');
    outputValueRef.current = '';
    setLogOutput('');
    setRunning(true);
    runningRef.current = true;
    runIdRef.current = '';
    setRunId('');
    setStatus('启动 Claude CLI...');
    try {
      const detection = await detectAgent(settings.aiClaudePath);
      if (!detection.available) {
        throw new Error(detection.error || 'Claude CLI 不可用');
      }
      const fullPrompt = buildPrompt(prompt, currentContent, currentFileName, currentFilePath);
      const result = await createAgentRun({
        agentPath: settings.aiClaudePath,
        conversationId: settings.aiResumeSessions ? conversationId : `${conversationId}:${Date.now()}`,
        cwd: cwd || defaultCwd || undefined,
        prompt: fullPrompt,
        stablePromptHash: stableHash(fullPrompt),
      });
      setRunId(result.runId);
      runIdRef.current = result.runId;
      setSessionLabel(`${result.resumed ? '已恢复' : '新会话'} ${result.sessionId}`);
      setStatus(`运行中：${result.cwd}`);
    } catch (error) {
      setRunning(false);
      runningRef.current = false;
      setStatus(`启动失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleStop = async () => {
    if (!runId) return;
    await stopAgentRun(runId).catch((error) => {
      setStatus(`停止失败：${error instanceof Error ? error.message : String(error)}`);
    });
    setRunning(false);
    runningRef.current = false;
  };

  const handlePickDirectory = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') setCwd(selected);
  };

  const handleClearSession = async () => {
    await clearAgentSession(conversationId).catch((error) => {
      setStatus(`清除会话失败：${error instanceof Error ? error.message : String(error)}`);
    });
    setSessionLabel('当前文档会话已清除');
  };

  return (
    <aside className="ai-workbench-panel" style={{ width }} aria-label="AI 工作台">
      <div className="ai-workbench-header">
        <div>
          <div className="ai-workbench-kicker"><Bot size={14} /> Claude CLI</div>
          <h2>AI 工作台</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭 AI 工作台">
          <X size={16} />
        </button>
      </div>

      <div className="ai-workbench-status">
        <span>{status}</span>
        {sessionLabel && <span>{sessionLabel}</span>}
      </div>

      <div className="ai-message-stream">
        {output ? (
          <article className="ai-message assistant">
            <div className="ai-message-status">Claude</div>
            <pre ref={outputRef}>{output}</pre>
          </article>
        ) : (
          <div className="ai-message-empty">{running ? '等待 Claude 返回最终结果...' : '告诉 Claude 你想如何处理当前文档。'}</div>
        )}
      </div>

      {logOutput && (
        <details className="ai-workbench-logs">
          <summary>运行日志</summary>
          <pre>{logOutput}</pre>
        </details>
      )}

      <div className="ai-composer-card">
        <div className="ai-composer-context-row">
          <span className="ai-context-pill current-file" title={currentFilePath || currentFileName}>
            Current {currentFileName}
          </span>
        </div>
        <div className="composer-active-file">
          <span className="composer-active-file__label">Editing</span>
          <span className="composer-active-file__name">{currentFileName}</span>
        </div>
        <textarea
          value={prompt}
          disabled={readOnly}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={`Ask Typola to change ${currentFileName}...`}
        />
        <div className="ai-composer-footer">
          <button type="button" className="ai-plus-button" onClick={() => void handlePickDirectory()} title="选择工作目录">
            <FolderOpen size={15} />
          </button>
          <button type="button" className="ai-context-pill directory" onClick={() => void handlePickDirectory()} title={cwd || defaultCwd}>
            Select working directory
          </button>
          <span className="ai-composer-spacer" />
          <button type="button" onClick={() => void handleClearSession()} title="清除会话">
            <RotateCcw size={14} />
          </button>
          <button type="button" onClick={() => void handleStop()} disabled={!running} title="停止">
            <Square size={14} />
          </button>
          <button type="button" className="primary" onClick={() => void handleRun()} disabled={running || readOnly || !prompt.trim()} title="发送">
            <Play size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
