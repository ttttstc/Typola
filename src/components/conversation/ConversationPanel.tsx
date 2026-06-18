import { X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useSettings } from '../../hooks/useSettings';
import { useAgentSession } from '../../hooks/useAgentSession';
import { confirmDialog } from '../../services/dialogService';
import { updateSettings } from '../../services/settingsService';
import type { AgentMessage } from '../../services/agent/types';
import { AssistantMessage } from './AssistantMessage';
import { Composer } from './Composer';
import { ErrorRetryCard } from './ErrorRetryCard';

type ConversationPanelProps = {
  conversationId: string;
  workspaceSuggestion?: string;
  agentPath?: string;
  model?: string;
  pluginDirs?: string[];
  currentFileName?: string;
  currentFilePath?: string;
  onClose: () => void;
};

function UserMessage({ message }: { message: Extract<AgentMessage, { role: 'user' }> }) {
  return (
    <article className="conversation-message user">
      <p>{message.content}</p>
    </article>
  );
}

export function ConversationPanel({
  conversationId,
  workspaceSuggestion,
  agentPath,
  model,
  pluginDirs,
  currentFileName,
  currentFilePath,
  onClose,
}: ConversationPanelProps) {
  const settings = useSettings();
  const cwd = settings.aiWorkspaceRoot || undefined;
  const { messages, runState, lastError, send, cancel, reset } = useAgentSession({
    conversationId,
    cwd,
    agentPath,
    model,
    pluginDirs,
  });
  const running = runState === 'running' || runState === 'stalled';
  const hasHistory = messages.length > 0;

  const rememberWorkspace = (path: string) => {
    updateSettings({
      aiWorkspaceRoot: path,
      aiWorkspaceRecents: [
        path,
        ...settings.aiWorkspaceRecents.filter((candidate) => candidate !== path),
      ].slice(0, 8),
    });
  };

  const confirmWorkspaceChange = async (): Promise<boolean> => {
    if (!hasHistory && !running) return true;
    return confirmDialog('切换 AI 工作区会开始新对话，确定继续？', {
      title: '切换 AI 工作区',
      okLabel: '切换并新建对话',
      cancelLabel: '取消',
    });
  };

  const handleWorkspaceChange = async (path: string) => {
    if (!(await confirmWorkspaceChange())) return;
    if (running) await cancel();
    reset();
    rememberWorkspace(path);
  };

  const handlePickWorkspace = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string' && selected) {
      await handleWorkspaceChange(selected);
    }
  };

  const handleClearWorkspace = async () => {
    if (!(await confirmWorkspaceChange())) return;
    if (running) await cancel();
    reset();
    updateSettings({ aiWorkspaceRoot: '' });
  };

  return (
    <aside className="conversation-panel" aria-label="AI 工作台">
      <header className="conversation-header">
        <div>
          <strong>AI 工作台</strong>
          <span>{cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : 'Claude 默认路径'}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭 AI 工作台">
          <X size={15} />
        </button>
      </header>
      <div className="conversation-messages">
        {messages.length === 0 && (
          <div className="conversation-empty">
            <strong>把文档任务交给 Claude</strong>
            <p>这里会显示思考流、正文、工具调用和完成状态。</p>
          </div>
        )}
        {messages.map((message) => (
          message.role === 'user'
            ? <UserMessage key={message.id} message={message} />
            : <AssistantMessage key={message.id} message={message} />
        ))}
        <ErrorRetryCard message={lastError} />
      </div>
      <Composer
        running={running}
        cwd={cwd}
        workspaceSuggestion={workspaceSuggestion}
        workspaceRecents={settings.aiWorkspaceRecents}
        currentFileName={currentFileName}
        currentFilePath={currentFilePath}
        onPickWorkspace={() => void handlePickWorkspace()}
        onSelectWorkspace={(path) => void handleWorkspaceChange(path)}
        onClearWorkspace={() => void handleClearWorkspace()}
        onSend={send}
        onCancel={cancel}
      />
    </aside>
  );
}
