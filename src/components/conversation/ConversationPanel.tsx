import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useSettings } from '../../hooks/useSettings';
import { confirmDialog } from '../../services/dialogService';
import { updateSettings } from '../../services/settingsService';
import type { AgentMessage, AnchorStatus, SelectionAnchor } from '../../services/agent/types';
import type { AgentProvider } from '../../services/agent/provider';
import { getAgentProviderConfig } from '../../services/agent/provider';
import type { ConversationData } from '../../services/agent/conversationStore';
import type { ArtifactItem } from '../ArtifactPreview';
import { formatAbsoluteTime, formatRelativeTime } from '../../services/timeFormat';
import { ArtifactToast } from './ArtifactToast';
import { AssistantMessage } from './AssistantMessage';
import { Composer, type ComposerHandle } from './Composer';
import { ConversationPill } from './ConversationPill';
import { ErrorRetryCard } from './ErrorRetryCard';

type ConversationPanelProps = {
  conversations: Map<string, ConversationData>;
  activeConvId: string;
  messages: AgentMessage[];
  runState: string;
  lastError: string;
  activeProvider: AgentProvider;
  workspaceSuggestion?: string;
  currentFileName?: string;
  currentFilePath?: string;
  /** 当前活动会话的实际模型(来自 headless init 事件) */
  currentModel?: string;
  /** 当前活动会话是否已注入过"当前文档" context → 后续 send 不再重复 */
  fileContextInjected?: boolean;
  hasEditorSelection?: boolean;
  onInsertToEditor?: (text: string) => void;
  onReplaceEditorSelection?: (text: string) => void;
  onReplaceEditorAnchor?: (text: string, anchor: SelectionAnchor) => void;
  onValidateAnchor?: (anchor: SelectionAnchor) => AnchorStatus;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
  onCloseConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onSwitchProvider: (provider: AgentProvider) => void;
  onSend: (prompt: string) => void;
  onCancel: () => void;
  onReset: () => void;
  onClose: () => void;
  onConsumePendingInjection?: (convId: string) => { text: string; queuedAt: number } | undefined;
  injectionReadyTick?: number;
  injectionReadyConvId?: string | null;
  // 选 skill 后由 AppLayout 推入 /<skill-name> 预填:{tick, text} 中 tick 变化触发。
  skillPrefill?: { tick: number; text: string } | null;
  onSkillPrefillConsumed?: () => void;
  // 产物 toast
  latestArtifact?: ArtifactItem;
  onOpenArtifact?: (path: string) => void;
  onArchiveArtifact?: (path: string) => void;
};

function UserMessage({ message }: { message: Extract<AgentMessage, { role: 'user' }> }) {
  return (
    <article className="conversation-message user">
      <span className="conversation-time" title={formatAbsoluteTime(message.createdAt)}>
        {formatRelativeTime(message.createdAt)}
      </span>
      <p>{message.content}</p>
    </article>
  );
}

export function ConversationPanel({
  conversations,
  activeConvId,
  messages,
  runState,
  lastError,
  activeProvider,
  workspaceSuggestion,
  currentFileName,
  currentFilePath,
  currentModel,
  fileContextInjected = false,
  hasEditorSelection = false,
  onInsertToEditor,
  onReplaceEditorSelection,
  onReplaceEditorAnchor,
  onValidateAnchor,
  onSelectConversation,
  onCreateConversation,
  onCloseConversation,
  onRenameConversation,
  onSwitchProvider,
  onSend,
  onCancel,
  onReset,
  onClose,
  onConsumePendingInjection,
  injectionReadyTick,
  injectionReadyConvId,
  skillPrefill,
  onSkillPrefillConsumed,
  latestArtifact,
  onOpenArtifact,
  onArchiveArtifact,
}: ConversationPanelProps) {
  const settings = useSettings();
  const cwd = settings.aiWorkspaceRoot || undefined;
  const running = runState === 'running';
  const hasHistory = messages.length > 0;
  // 优先用 provider 进程实际跑的模型(来自 init 事件),fallback 才是用户在 Typola 设置里填的
  const providerConfig = getAgentProviderConfig(activeProvider);
  const configuredModel = activeProvider === 'opencode' ? settings.aiOpenCodeModel : settings.aiClaudeModel;
  const modelLabel = currentModel
    ? `${providerConfig.label} · ${currentModel}`
    : configuredModel
      ? `${providerConfig.label} · ${configuredModel}`
      : `${providerConfig.label} · 默认模型`;
  const composerRef = useRef<ComposerHandle>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 产物 toast：只提示最新一条且未被提醒过的
  const [dismissedArtifactPaths, setDismissedArtifactPaths] = useState<Set<string>>(() => new Set());
  const showArtifactToast = latestArtifact && !dismissedArtifactPaths.has(latestArtifact.path);
  const dismissArtifactToast = (path: string) => {
    setDismissedArtifactPaths((current) => {
      if (current.has(path)) return current;
      const next = new Set(current);
      next.add(path);
      return next;
    });
  };

  // 拖拽文件当附件
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const webview = getCurrentWebview();
        const listener = await webview.onDragDropEvent((event) => {
          if (event.payload.type === 'drop') {
            const paths = event.payload.paths;
            if (paths.length > 0) composerRef.current?.addAttachments(paths);
            panelRef.current?.classList.remove('dragover');
          } else if (event.payload.type === 'over') {
            panelRef.current?.classList.add('dragover');
          } else if (event.payload.type === 'leave') {
            panelRef.current?.classList.remove('dragover');
          }
        });
        unlisten = listener;
      } catch {
        // 非 Tauri 环境或 API 不可用，忽略
      }
    };
    void setup();
    return () => { unlisten?.(); };
  }, []);

  // 选区注入暂存触发：active conv 的 pendingInjection 被注入器置位（active idle 时立即 / running 结束后）。
  useEffect(() => {
    if (injectionReadyTick === undefined) return;
    if (!injectionReadyConvId || injectionReadyConvId !== activeConvId) return;
    if (!onConsumePendingInjection) return;
    const pending = onConsumePendingInjection(activeConvId);
    if (!pending) return;
    composerRef.current?.injectText(pending.text);
    // 距 queuedAt 超过 800ms 视为"running 暂存后投递" → 显示提示
    const isQueuedDelivery = Date.now() - pending.queuedAt > 800;
    if (isQueuedDelivery) {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      setToast('已停下，刚选的内容贴好了');
      toastTimerRef.current = window.setTimeout(() => setToast(null), 2000);
    }
  }, [injectionReadyTick, injectionReadyConvId, activeConvId, onConsumePendingInjection]);

  // 选 skill 预填:AppLayout 把 /<skill-name> 推到 Composer,光标停在末尾,不自动 send。
  useEffect(() => {
    if (!skillPrefill) return;
    composerRef.current?.injectText(skillPrefill.text);
    onSkillPrefillConsumed?.();
  }, [skillPrefill?.tick, onSkillPrefillConsumed]);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  // 把 messages 切成 (user, assistant[]) 段，渲染时把 user 的 selectionAnchor 沿用到该 user 之后的所有 assistant 消息。
  // 这样在 assistant 消息上点"替换选区"能拿到 anchor。
  const segments = useMemo(() => {
    const out: Array<{ user?: Extract<AgentMessage, { role: 'user' }>; assistants: Extract<AgentMessage, { role: 'assistant' }>[] }> = [];
    let current: { user?: Extract<AgentMessage, { role: 'user' }>; assistants: Extract<AgentMessage, { role: 'assistant' }>[] } | null = null;
    for (const m of messages) {
      if (m.role === 'user') {
        if (current) out.push(current);
        current = { user: m, assistants: [] };
      } else if (current) {
        current.assistants.push(m);
      } else {
        current = { assistants: [m] };
      }
    }
    if (current) out.push(current);
    return out;
  }, [messages]);

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

  const handleProviderChange = async (provider: AgentProvider) => {
    if (provider === activeProvider) return;
    const hasConversation = messages.length > 0;
    const confirmed = !hasConversation || await confirmDialog('切换 AI Provider 会开始新对话，确定继续？', {
      title: '切换 AI Provider',
      okLabel: '切换并新建对话',
      cancelLabel: '取消',
    });
    if (!confirmed) return;
    if (running) await onCancel();
    updateSettings({ aiActiveProvider: provider });
    onSwitchProvider(provider);
  };

  const handleWorkspaceChange = async (path: string) => {
    if (!(await confirmWorkspaceChange())) return;
    if (running) await onCancel();
    onReset();
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
    if (running) await onCancel();
    onReset();
    updateSettings({ aiWorkspaceRoot: '' });
  };

  return (
    <aside ref={panelRef} className="conversation-panel" aria-label="AI 工作台">
      <header className="conversation-header">
        <div>
          <strong>AI 工作台</strong>
          <span className="conversation-model-badge" title={`当前使用的 ${providerConfig.label} 模型`}>
            {modelLabel}
          </span>
          <ConversationPill
            conversations={conversations}
            activeConvId={activeConvId}
            onSelect={onSelectConversation}
            onCreate={onCreateConversation}
            onClose={onCloseConversation}
            onRename={onRenameConversation}
          />
        </div>
        <button type="button" onClick={onClose} aria-label="关闭 AI 工作台">
          <X size={15} />
        </button>
      </header>
      <div className="conversation-messages">
        {messages.length === 0 && (
          <div className="conversation-empty">
            <strong>把文档任务交给 {providerConfig.label}</strong>
            <p>这里会显示思考流、正文、工具调用和完成状态。</p>
          </div>
        )}
        {segments.map((seg) => (
          <div key={seg.user?.id ?? seg.assistants[0]?.id ?? 'tail'} className="conversation-segment">
            {seg.user && <UserMessage message={seg.user} />}
            {seg.assistants.map((assistant) => (
              <AssistantMessage
                key={assistant.id}
                message={assistant}
                hasSelection={hasEditorSelection}
                selectionAnchor={seg.user?.selectionAnchor}
                onInsertText={onInsertToEditor}
                onReplaceSelection={onReplaceEditorSelection}
                onReplaceAnchor={onReplaceEditorAnchor}
                validateAnchor={onValidateAnchor}
              />
            ))}
          </div>
        ))}
        <ErrorRetryCard message={lastError} />
      </div>
      {showArtifactToast && onOpenArtifact && onArchiveArtifact && (
        <ArtifactToast
          artifact={latestArtifact}
          onOpen={(path) => {
            dismissArtifactToast(path);
            onOpenArtifact(path);
          }}
          onArchive={(path) => {
            dismissArtifactToast(path);
            onArchiveArtifact(path);
          }}
          onDismiss={() => dismissArtifactToast(latestArtifact.path)}
        />
      )}
      <Composer
        ref={composerRef}
        running={running}
        cwd={cwd}
        workspaceSuggestion={workspaceSuggestion}
        workspaceRecents={settings.aiWorkspaceRecents}
        currentFileName={currentFileName}
        currentFilePath={currentFilePath}
        currentModel={currentModel}
        activeProvider={activeProvider}
        configuredModel={configuredModel}
        fileContextInjected={fileContextInjected}
        onPickWorkspace={() => void handlePickWorkspace()}
        onSelectWorkspace={(path) => void handleWorkspaceChange(path)}
        onClearWorkspace={() => void handleClearWorkspace()}
        onSwitchProvider={(provider) => void handleProviderChange(provider)}
        onSend={onSend}
        onCancel={onCancel}
      />
      {toast && <div className="conversation-toast" role="status">{toast}</div>}
    </aside>
  );
}
